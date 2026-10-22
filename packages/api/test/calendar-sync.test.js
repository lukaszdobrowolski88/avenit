// Kalendarz Google / Outlook w obie strony — Faza 2 (migracja 119, src/integrations/calendar*.js).
// Czysta logika zawsze; przepływy na PRAWDZIWYM SQL (PGlite) z atrapą fetch (Google Calendar / Graph):
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/calendar-sync.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  eventFields, buildPayload, googleBody, microsoftBody, googleFields, microsoftFields, diffFields, eventUpdateFrom,
  userDescription, normalizeUserPrefs, normalizeChurchPrefs, googleEventId, windowBounds, PENDING_SUFFIX, DESC_MARKER, addDays,
} from '../src/integrations/calendarLogic.js';
import { selectEventsForUser, selectChurchEvents, loadUserRow } from '../src/integrations/calendarSelect.js';
import {
  ensureUserTarget, syncTarget, runCalendarSync, calendarCtx, loadUserTarget, loadChurchTarget, resetCalendarCaches, setMaxWritesPerRun,
} from '../src/integrations/calendarSync.js';
import { enqueueCalendarSync } from '../src/integrations/calendarQueue.js';
import { retryAfterSeconds } from '../src/integrations/calendarApi.js';
import { saveUserConnection, saveTenantConnection, loadConnection } from '../src/integrations/tokens.js';
import { startConnect, handleCallback, verifyIntegrationState } from '../src/integrations/oauth.js';
import { GOOGLE_SCOPES } from '../src/integrations/providers.js';
import { settingsReturnUrl } from '../src/integrations/routes.js';
import { integrationCaller } from '../src/integrations/access.js';
import { invalidatePermissions, REGISTRY } from '../src/dataapi/registry.js';
import { workspaceAction } from '../src/fn/workspace-integration.js';
import { calendarAction } from '../src/fn/calendar-sync.js';
import { utcToZoned } from '../src/meetings/logic.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

// ── Czysta logika ───────────────────────────────────────────────────────────
test('pola wydarzenia: godzina bez końca = 1 h, cały dzień (koniec wyłącznie), wielodniowe, oczekująca służba', () => {
  const a = eventFields({ title: ' Próba ', date: '2026-11-03', time: '18:00' });
  assert.deepEqual([a.allDay, a.start, a.end, a.title], [false, '2026-11-03T18:00', '2026-11-03T19:00', 'Próba']);
  const b = eventFields({ title: 'Obóz', date: '2026-11-03', end_date: '2026-11-05' });
  assert.deepEqual([b.allDay, b.start, b.end], [true, '2026-11-03', '2026-11-06']);
  const c = eventFields({ title: 'Noc', date: '2026-11-03', time: '23:30', end_time: '01:00', end_date: '2026-11-04' });
  assert.deepEqual([c.start, c.end], ['2026-11-03T23:30', '2026-11-04T01:00']);
  const d = eventFields({ title: 'X', date: '2026-10-25', time: '02:30' }); // dzień zmiany czasu
  assert.equal(d.end.slice(0, 10), '2026-10-25');
  const p = buildPayload({ id: 1, title: 'Nabożeństwo', date: '2026-11-08', time: '10:00', description: '<p>Plan &amp; modlitwa</p>' },
    { service: { roles: ['Wokal'], teams: ['Uwielbienie'], pending: true }, eventUrl: 'https://k.avenit.pl/wydarzenie/1' });
  assert.equal(p.title, `Nabożeństwo${PENDING_SUFFIX}`);
  assert.equal(p.fields.status, 'tentative');
  assert.match(p.description, /^Plan & modlitwa\n— — —\nTwoja służba: Wokal \(Uwielbienie\) — do potwierdzenia/);
  assert.match(p.description, /Zobacz w Avenit: https:\/\/k\.avenit\.pl\/wydarzenie\/1/);
  const online = buildPayload({ id: 2, title: 'Online', date: '2026-11-08', time: '19:00', format: 'online', location: 'Sala' }, { eventUrl: 'https://k/w/2', onlineUrl: 'https://k/w/2' });
  assert.equal(online.fields.location, 'https://k/w/2');
  assert.notEqual(buildPayload({ id: 1, title: 'A', date: '2026-11-08' }).hash, buildPayload({ id: 1, title: 'B', date: '2026-11-08' }).hash);
});

test('Google i Microsoft: treść żądania, odczyt (strefa, UTC, cały dzień), opis bez dopisku Avenit', () => {
  const p = buildPayload({ title: 'Próba', date: '2026-11-03', time: '18:00', end_time: '20:00', location: 'Sala' }, { eventUrl: 'https://k/w/9' });
  const g = googleBody(p, { eventId: '9', targetId: 't' });
  assert.deepEqual(g.start, { dateTime: '2026-11-03T18:00:00', timeZone: 'Europe/Warsaw' });
  assert.equal(g.extendedProperties.private.avenit_event_id, '9');
  assert.deepEqual(g.source, { title: 'Avenit', url: 'https://k/w/9' });
  const m = microsoftBody(p);
  assert.deepEqual(m.start, { dateTime: '2026-11-03T18:00:00', timeZone: 'Central European Standard Time' });
  assert.equal(m.body.contentType, 'text');
  // Google zwraca czas z przesunięciem (także po zmianie czasu) → lokalny czas kościoła.
  const gf = googleFields({ summary: `Próba${PENDING_SUFFIX}`, start: { dateTime: '2026-11-03T17:00:00Z' }, end: { dateTime: '2026-11-03T21:00:00+02:00' },
    location: 'Sala', description: `Nowy opis<br>linia<br>${DESC_MARKER}<br>Zobacz w Avenit: x` });
  assert.deepEqual([gf.title, gf.start, gf.end, gf.description], ['Próba', '2026-11-03T18:00', '2026-11-03T20:00', 'Nowy opis\nlinia']);
  const ga = googleFields({ summary: 'Obóz', start: { date: '2026-11-03' }, end: { date: '2026-11-06' } });
  assert.deepEqual([ga.allDay, ga.start, ga.end], [true, '2026-11-03', '2026-11-06']);
  const mf = microsoftFields({ subject: 'Spotkanie', start: { dateTime: '2026-11-03T17:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-11-03T18:30:00.0000000', timeZone: 'Central European Standard Time' }, location: { displayName: 'Online' }, body: { content: 'a' } });
  assert.deepEqual([mf.start, mf.end], ['2026-11-03T18:00', '2026-11-03T18:30']);
  assert.equal(userDescription(`tekst\n${DESC_MARKER}\nreszta`), 'tekst');
  assert.match(googleEventId('t1', '5'), /^[0-9a-v]{5,1024}$/);
  assert.equal(googleEventId('t1', '5'), googleEventId('t1', '5'));
});

test('różnice i zapis zwrotny: tylko zmienione grupy pól; cały dzień → koniec włącznie; status pomijany', () => {
  const pushed = eventFields({ title: 'Próba', date: '2026-11-03', time: '18:00', end_time: '20:00', location: 'Sala', description: 'opis' });
  assert.deepEqual(diffFields(pushed, { ...pushed, status: 'tentative', description: ' opis ' }), []);
  const ext = { ...pushed, title: 'Próba generalna', start: '2026-11-04T19:00', end: '2026-11-04T21:30' };
  const ch = diffFields(pushed, ext);
  assert.deepEqual(ch, ['title', 'when']);
  assert.deepEqual(eventUpdateFrom(ext, ch), { title: 'Próba generalna', date: '2026-11-04', time: '19:00', end_time: '21:30', end_date: null });
  assert.deepEqual(diffFields(pushed, { ...pushed, location: 'Inna' }, { online: true }), []);
  const all = { ...pushed, allDay: true, start: '2026-11-04', end: '2026-11-07' };
  assert.deepEqual(eventUpdateFrom(all, ['when']), { date: '2026-11-04', time: null, end_time: null, end_date: '2026-11-06' });
  assert.equal(eventUpdateFrom({ ...pushed, start: 'zle', end: 'x' }, ['when']), null);
});

test('preferencje i okno synchronizacji; Retry-After', () => {
  assert.deepEqual(normalizeUserPrefs({}), { mode: 'mine', my_services: true, registered: true, my_groups: true, my_meetings: true, organized: true });
  assert.equal(normalizeUserPrefs({ mode: 'all', registered: false }).registered, false);
  assert.deepEqual(normalizeChurchPrefs({ modules: ['general', '', 'general', 'worship'], import_new: 'tak' }), {
    modules: ['general', 'worship'], event_types: [], import_new: false, share_domain: true, calendar_mode: 'dedicated',
  });
  const w = windowBounds(Date.parse('2026-10-22T10:00:00Z'));
  assert.deepEqual(w, { from: '2026-09-22', to: addDays('2026-10-22', 400) });
  assert.equal(retryAfterSeconds({ headers: new Headers({ 'Retry-After': '120' }) }), 120);
  assert.equal(retryAfterSeconds({ headers: new Headers() }), 60);
});

test('powrót z OAuth: kalendarz osobisty → Mój profil; kalendarz kościoła → Integracje; tabele tylko serwerowe', () => {
  assert.match(settingsReturnUrl('schwro', 'google', 'connected', null, 'calendar'), /\/profile\?cal=google&cal_result=connected$/);
  assert.match(settingsReturnUrl('schwro', 'google', 'error', 'scopes', 'church_calendar'), /\/settings\?tab=integrations&ws=google&ws_result=error&ws_reason=scopes&ws_target=calendar$/);
  for (const t of ['calendar_sync_targets', 'calendar_sync_items', 'calendar_sync_queue']) assert.equal(REGISTRY[t], undefined, t);
});

// ── PGlite + atrapa fetch ───────────────────────────────────────────────────
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DB_NAME = 'test_calendar_sync';
const TID = '11111111-2222-3333-4444-555555555555';
const ADMIN = uid(1), JAN = uid(2), OLA = uid(3), LIDER = uid(4), OBCY = uid(5);
const day = (n) => utcToZoned(new Date(Date.now() + n * 86_400_000)).date;

function poolOf(pg) {
  return { async query(sql, params) { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; } };
}
const json = (body, status = 200, headers = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

let routes = [];
const calls = [];
const realFetch = globalThis.fetch;
function mockFetch(list) { routes = list; calls.length = 0; }
async function fakeFetch(url, opts = {}) {
  const u = String(url);
  let body = opts.body;
  if (body instanceof URLSearchParams) body = Object.fromEntries(body);
  else if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* */ } }
  const call = { url: u, method: opts.method || 'GET', body, headers: opts.headers || {} };
  calls.push(call);
  for (const [pred, resp] of routes) {
    if (pred(u, call)) return typeof resp === 'function' ? resp(u, call) : resp.clone();
  }
  return json({ error: { message: `not mocked ${call.method} ${u}` } }, 599);
}

let pg, db;
const emails = [];
const emitted = [];
const ctx = () => calendarCtx({
  tenantSlug: 'schwro', tenantSubdomain: 'schwro', tenantName: 'Kościół Testowy', tenantDbName: DB_NAME, log: () => {},
  deps: { sendEmail: async (m) => { emails.push(m); }, emit: (...a) => emitted.push(a), afterEventWrite: async () => {} },
});
const reqOf = (body, userId) => ({ db, body, tenant: { subdomain: 'schwro', slug: 'schwro', db_name: DB_NAME, name: 'Kościół Testowy' }, user: { id: userId }, log: { error() {}, warn() {}, info() {} } });
const q1 = async (sql, params) => (await db.query(sql, params)).rows;

let E = {};
async function newEvent(f) {
  const cols = Object.keys(f);
  const vals = cols.map((c) => (c === 'visibility_segments' ? JSON.stringify(f[c]) : f[c]));
  const [row] = await q1(`INSERT INTO events (${cols.join(', ')}) VALUES (${cols.map((c, i) => `$${i + 1}${c === 'visibility_segments' ? '::jsonb' : ''}`).join(', ')}) RETURNING id::text AS id`, vals);
  return row.id;
}

before(async () => {
  if (skip) return;
  globalThis.fetch = fakeFetch;
  pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE app_users (id uuid PRIMARY KEY, email text UNIQUE, full_name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, campus_id int, member_id int);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE app_modules (key text PRIMARY KEY, label text);
    CREATE TABLE account_events (id bigserial PRIMARY KEY, email varchar(255), action varchar(40) NOT NULL, actor varchar(255), detail text, created_at timestamptz DEFAULT now());
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE members (id serial PRIMARY KEY, email text, home_group_id text, ministries jsonb DEFAULT '[]', tags jsonb DEFAULT '[]');
    CREATE TABLE home_group_members (group_id text, email text, role text, is_leader boolean DEFAULT false);
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, ministry_key text);
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid, user_email text, role text);
    CREATE TABLE meetings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid, event_id text, status text DEFAULT 'scheduled');
    CREATE TABLE meeting_invites (meeting_id uuid, kind text, email text, response text);
    CREATE TABLE rsvp_campaigns (id serial PRIMARY KEY, event_id int);
    CREATE TABLE rsvp_invitations (id serial PRIMARY KEY, campaign_id int, member_id int, email text);
    CREATE TABLE notifications (id bigserial PRIMARY KEY, user_email text, type text, title text, body text, link text, created_at timestamptz DEFAULT now());
    CREATE TABLE events (id serial PRIMARY KEY, title text NOT NULL, description text, date date, time text, end_time text, end_date date,
      location text, module_key text, event_type text, campus_id int, created_by text, is_archived boolean DEFAULT false,
      visibility_segments jsonb, home_group_id text, format text DEFAULT 'in_person', updated_at timestamptz DEFAULT now());
    CREATE TABLE event_registrations (id serial PRIMARY KEY, event_id int, user_email text, full_name text, status text DEFAULT 'going');
    CREATE TABLE schedule_assignments (id serial PRIMARY KEY, event_id text, team_type text, role_key text, role_label text,
      assigned_name text, assigned_email text, status text DEFAULT 'pending');
    INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('czlonek', false), ('lider', false), ('integrator', false);
    INSERT INTO permission_grants (role, capability, allowed) VALUES
      ('czlonek', 'module:calendar', true), ('czlonek', 'res:events:read', true),
      ('lider', 'module:calendar', true), ('lider', 'res:events:read', true), ('lider', 'res:events:update', true),
      ('integrator', 'action:settings:manage_integrations', true), ('integrator', 'module:calendar', true), ('integrator', 'res:events:read', true);
  `);
  for (const f of ['118_workspace_integrations.sql', '119_calendar_sync.sql']) {
    const sql = fs.readFileSync(new URL(`../db/tenant-migrations/${f}`, import.meta.url), 'utf8');
    await pg.exec(sql);
    await pg.exec(sql); // idempotentna
  }
  await db.query(`INSERT INTO app_users (id, email, full_name, role, is_super_admin, member_id) VALUES
    ($1, 'admin@kosciol.pl', 'Admin', 'superadmin', true, NULL), ($2, 'jan@kosciol.pl', 'Jan Kowalski', 'czlonek', false, 1),
    ($3, 'ola@kosciol.pl', 'Ola Nowak', 'czlonek', false, 2), ($4, 'lider@kosciol.pl', 'Lider', 'lider', false, 3),
    ($5, 'obcy@kosciol.pl', 'Obcy', 'integrator', false, 4)`, [ADMIN, JAN, OLA, LIDER, OBCY]);
  await db.query(`INSERT INTO members (id, email) VALUES (1, 'jan@kosciol.pl'), (2, 'ola@kosciol.pl'), (3, 'lider@kosciol.pl'), (4, 'obcy@kosciol.pl')`);
  await db.query(`INSERT INTO home_group_members (group_id, email, role) VALUES ('hg1', 'jan@kosciol.pl', 'member')`);
  invalidatePermissions(DB_NAME);
  resetCalendarCaches();

  E.pub = await newEvent({ title: 'Nabożeństwo', date: day(3), time: '10:00', end_time: '12:00', location: 'Kościół', module_key: 'general', created_by: 'admin@kosciol.pl' });
  E.group = await newEvent({ title: 'Grupa domowa', date: day(4), time: '19:00', module_key: 'homegroups', visibility_segments: [{ type: 'home_group', values: ['hg1'] }] });
  E.leaders = await newEvent({ title: 'Rada liderów', date: day(5), time: '18:00', visibility_segments: [{ type: 'role', values: ['lider'] }] });
  E.service = await newEvent({ title: 'Próba zespołu', date: day(6), time: '17:00', module_key: 'worship', visibility_segments: [{ type: 'owner' }], created_by: 'lider@kosciol.pl' });
  E.reg = await newEvent({ title: 'Konferencja', date: day(10), end_date: day(11), module_key: 'general' });
  E.other = await newEvent({ title: 'Piknik', date: day(12), time: '12:00', module_key: 'general' });
  E.archived = await newEvent({ title: 'Stare', date: day(2), time: '10:00', is_archived: true });
  E.past = await newEvent({ title: 'Dawno', date: day(-90), time: '10:00' });
  await db.query(`INSERT INTO schedule_assignments (event_id, team_type, role_key, role_label, assigned_name, assigned_email, status) VALUES
    ($1, 'worship', 'vocal', 'Wokal', 'Jan Kowalski', 'jan@kosciol.pl', 'pending'),
    ($1, 'worship', 'guitar', 'Gitara', 'Ola Nowak', 'ola@kosciol.pl', 'accepted')`, [E.service]);
  await db.query(`INSERT INTO event_registrations (event_id, user_email, full_name) VALUES ($1, 'jan@kosciol.pl', 'Jan')`, [Number(E.reg)]);
});

after(() => { globalThis.fetch = realFetch; });

test('migracja 119: tabele, unikalne mapowanie i jeden kalendarz kościoła per dostawca', { skip }, async () => {
  const { rows } = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'calendar_sync_%' ORDER BY 1`);
  assert.deepEqual(rows.map((r) => r.table_name), ['calendar_sync_items', 'calendar_sync_queue', 'calendar_sync_targets']);
  const cols = (await q1(`SELECT column_name FROM information_schema.columns WHERE table_name = 'events' AND column_name LIKE 'external_%' ORDER BY 1`)).map((r) => r.column_name);
  assert.deepEqual(cols, ['external_id', 'external_source']);
});

test('wybór wydarzeń: moje (służba oczekująca, zapis, grupa domowa) vs wszystkie widoczne; kościół = tylko publiczne', { skip }, async () => {
  const win = windowBounds();
  const jan = await loadUserRow(db, JAN);
  const mine = await selectEventsForUser(db, { user: jan, prefs: {}, dbName: DB_NAME, ...win });
  assert.deepEqual([...mine.keys()].sort(), [E.group, E.service, E.reg].sort());
  assert.deepEqual(mine.get(E.service).service, { roles: ['Wokal'], teams: ['Uwielbienie'], pending: true });
  assert.ok(mine.get(E.reg).reasons.has('registered'));
  // Wszystkie widoczne: bez wydarzenia liderów, bez zarchiwizowanego i spoza okna; służba mimo widoczności „owner”.
  const all = await selectEventsForUser(db, { user: jan, prefs: { mode: 'all' }, dbName: DB_NAME, ...win });
  assert.deepEqual([...all.keys()].sort(), [E.pub, E.group, E.service, E.reg, E.other].sort());
  // Ograniczenie do listy id (kolejka).
  const only = await selectEventsForUser(db, { user: jan, prefs: { mode: 'all' }, dbName: DB_NAME, eventIds: [E.pub, E.leaders], ...win });
  assert.deepEqual([...only.keys()], [E.pub]);
  // Bez służb i zapisów.
  const groups = await selectEventsForUser(db, { user: jan, prefs: { my_services: false, registered: false }, dbName: DB_NAME, ...win });
  assert.deepEqual([...groups.keys()], [E.group]);
  // Lider widzi wydarzenie liderów; Ola ma potwierdzoną służbę.
  const ola = await selectEventsForUser(db, { user: await loadUserRow(db, OLA), prefs: {}, dbName: DB_NAME, ...win });
  assert.deepEqual([...ola.keys()], [E.service]);
  assert.equal(ola.get(E.service).service.pending, false);
  const church = await selectChurchEvents(db, { prefs: {}, ...win });
  assert.deepEqual([...church.keys()].sort(), [E.pub, E.reg, E.other].sort());
  const churchGeneral = await selectChurchEvents(db, { prefs: { modules: ['worship'] }, ...win });
  assert.equal(churchGeneral.size, 0);
});

// Atrapa Google Calendar: kalendarz + wydarzenia w pamięci (etag rośnie przy każdym zapisie).
function googleMock(state) {
  const base = 'https://www.googleapis.com/calendar/v3/calendars';
  const save = (id, body) => { const v = (state.events.get(id)?.v || 0) + 1; const e = { ...body, id, etag: `"${id}-${v}"`, v, updated: new Date().toISOString() }; state.events.set(id, e); return e; };
  return [
    [(u, c) => u === base && c.method === 'POST', () => json({ id: 'gcal1', summary: c0(state) })],
    [(u, c) => u.startsWith(`${base}/gcal1/events`) && c.method === 'POST', (u, c) => (state.events.has(c.body.id) ? json({ error: { message: 'dup' } }, 409) : json(save(c.body.id, c.body)))],
    [(u, c) => u.startsWith(`${base}/gcal1/events/`) && c.method === 'PUT', (u, c) => {
      const id = decodeURIComponent(u.split('/events/')[1]);
      return state.events.has(id) ? json(save(id, c.body)) : json({ error: { message: 'gone' } }, 404);
    }],
    [(u, c) => u.startsWith(`${base}/gcal1/events/`) && c.method === 'DELETE', (u) => { state.events.delete(decodeURIComponent(u.split('/events/')[1])); return json(null, 204); }],
    [(u, c) => u.startsWith(`${base}/gcal1/events?`) && c.method === 'GET', (u) => state.list(u)],
    [(u, c) => u === `${base}/gcal1` && c.method === 'GET', () => json({ id: 'gcal1' })],
  ];
}
const c0 = () => 'Avenit — Kościół Testowy';

test('Google, kalendarz osobisty: utworzenie kalendarza, idempotentny upsert, aktualizacja z kolejki, usunięcie po końcu służby', { skip }, async () => {
  const conn = await saveUserConnection(db, { provider: 'google', userId: JAN, accountEmail: 'jan@gmail.com', scopes: ['openid', GOOGLE_SCOPES.calendarAppCreated], accessToken: 'GAT-JAN', refreshToken: 'GRT-JAN', expiresIn: 3600 });
  const target = await ensureUserTarget(db, conn, { userId: JAN, email: 'jan@kosciol.pl' });
  const state = { events: new Map(), list: () => json({ items: [], nextSyncToken: 'S1' }) };
  mockFetch(googleMock(state));
  const r1 = await syncTarget(db, target, ctx(), {});
  assert.equal(r1.error, undefined, r1.error);
  assert.deepEqual([r1.created, r1.full], [3, true]);
  assert.ok(calls.every((c) => c.headers.Authorization === 'Bearer GAT-JAN'));
  const t1 = await loadUserTarget(db, JAN, 'google');
  assert.deepEqual([t1.calendar_id, t1.calendar_name, t1.sync_cursor, t1.needs_full], ['gcal1', 'Avenit — Kościół Testowy', 'S1', false]);
  const created = [...state.events.values()];
  const svc = created.find((e) => e.extendedProperties.private.avenit_event_id === E.service);
  assert.equal(svc.summary, `Próba zespołu${PENDING_SUFFIX}`);
  assert.equal(svc.status, 'tentative');
  assert.match(svc.description, /Twoja służba: Wokal \(Uwielbienie\)/);
  assert.match(svc.description, new RegExp(`Zobacz w Avenit: https?://schwro\\..+/wydarzenie/${E.service}`));
  const reg = created.find((e) => e.extendedProperties.private.avenit_event_id === E.reg);
  assert.deepEqual([reg.start, reg.end], [{ date: day(10) }, { date: addDays(day(11), 1) }]);

  // Ponowne pełne uzgodnienie — bez zapisów u dostawcy.
  mockFetch(googleMock(state));
  const r2 = await syncTarget(db, t1, ctx(), { forceFull: true });
  assert.deepEqual([r2.created, r2.updated, r2.same], [0, 0, 3]);
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0);

  // Zmiana w Avenit → kolejka → jedna aktualizacja (PUT) w następnym przebiegu workera.
  await db.query(`UPDATE events SET title = 'Grupa domowa — Rzymian' WHERE id::text = $1`, [E.group]);
  assert.equal(await enqueueCalendarSync(db, [E.group], 'test'), 1);
  mockFetch(googleMock(state));
  const run = await runCalendarSync(db, ctx());
  assert.equal(run.queued, 1);
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 1);
  assert.equal([...state.events.values()].find((e) => e.extendedProperties.private.avenit_event_id === E.group).summary, 'Grupa domowa — Rzymian');

  // Służba odwołana → wydarzenie znika z kalendarza.
  await db.query(`UPDATE schedule_assignments SET status = 'rejected' WHERE assigned_email = 'jan@kosciol.pl'`);
  await enqueueCalendarSync(db, [E.service]);
  mockFetch(googleMock(state));
  await runCalendarSync(db, ctx());
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 1);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM calendar_sync_items WHERE target_id = $1`, [target.id]))[0].n, 2);
  await db.query(`UPDATE schedule_assignments SET status = 'pending' WHERE assigned_email = 'jan@kosciol.pl'`);

  // Usunięcie wydarzenia w Avenit bez wiersza w hooku (przeglądarka) → siatka bezpieczeństwa co minutę.
  const tmp = await newEvent({ title: 'Tymczasowe', date: day(7), time: '10:00', visibility_segments: [{ type: 'home_group', values: ['hg1'] }] });
  await enqueueCalendarSync(db, [tmp]);
  mockFetch(googleMock(state));
  await runCalendarSync(db, ctx());
  assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
  await db.query(`DELETE FROM events WHERE id::text = $1`, [tmp]);
  mockFetch(googleMock(state));
  await runCalendarSync(db, ctx());
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 1);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM calendar_sync_items WHERE event_id = $1`, [tmp]))[0].n, 0);
});

const gItem = (state, eventId, patch) => {
  const e = [...state.events.values()].find((x) => x.extendedProperties.private.avenit_event_id === eventId);
  return { ...e, ...patch, etag: patch.etag || `"user-${Math.random()}"`, updated: patch.updated || new Date(Date.now() + 5000).toISOString() };
};

test('Google, zmiany od osoby: bez prawa edycji → przywrócenie + jedno powiadomienie; własny zapis (etag) pomijany; usunięcie = ukryj u mnie; nowe — ignorowane', { skip }, async () => {
  const state = { events: new Map() };
  // Odtwórz stan atrapy z mapowań (poprzedni test).
  const target = await loadUserTarget(db, JAN, 'google');
  state.list = () => json({ items: [], nextSyncToken: 'S2' });
  mockFetch(googleMock(state));
  await db.query(`DELETE FROM calendar_sync_items WHERE target_id = $1`, [target.id]);
  await syncTarget(db, target, ctx(), { forceFull: true });
  assert.ok(state.events.size >= 3);

  emails.length = 0;
  const changed = gItem(state, E.reg, { summary: 'Konferencja (moja nazwa)' });
  const own = gItem(state, E.group, { summary: 'INNY TYTUŁ' });
  own.etag = state.events.get(own.id).etag; // ten sam etag = nasz zapis (pętla)
  state.list = (u) => {
    assert.match(u, /syncToken=S2/);
    return json({ items: [changed, own, { id: 'obcy-1', summary: 'Moje prywatne', start: { dateTime: '2026-11-10T10:00:00Z' }, end: { dateTime: '2026-11-10T11:00:00Z' }, etag: '"o"', status: 'confirmed' }], nextSyncToken: 'S3' });
  };
  mockFetch(googleMock(state));
  const fresh = await loadUserTarget(db, JAN, 'google');
  const r = await syncTarget(db, fresh, ctx(), { forcePull: true });
  assert.equal(r.reverted, 1);
  assert.equal(r.applied, 0);
  assert.equal((await q1(`SELECT title FROM events WHERE id::text = $1`, [E.reg]))[0].title, 'Konferencja'); // Avenit bez zmian
  const puts = calls.filter((c) => c.method === 'PUT');
  assert.deepEqual(puts.map((c) => c.body.summary), ['Konferencja']); // przywrócone u osoby
  assert.equal(state.events.has('obcy-1'), false); // nowe wydarzenie osoby — nietknięte, nieimportowane
  assert.equal((await q1(`SELECT count(*)::int AS n FROM events WHERE title = 'Moje prywatne'`))[0].n, 0);
  const notes = await q1(`SELECT user_email, title FROM notifications WHERE type = 'calendar_sync'`);
  assert.deepEqual(notes.map((n) => [n.user_email, n.title]), [['jan@kosciol.pl', 'Zmiany wprowadzaj w Avenit']]);
  assert.equal(emails.length, 1);
  assert.equal((await loadUserTarget(db, JAN, 'google')).sync_cursor, 'S3');

  // Druga taka zmiana — przywrócenie, ale bez kolejnego powiadomienia.
  state.list = () => json({ items: [gItem(state, E.reg, { summary: 'Znowu' })], nextSyncToken: 'S4' });
  mockFetch(googleMock(state));
  await syncTarget(db, await loadUserTarget(db, JAN, 'google'), ctx(), { forcePull: true });
  assert.equal((await q1(`SELECT count(*)::int AS n FROM notifications WHERE type = 'calendar_sync'`))[0].n, 1);
  assert.equal(emails.length, 1);

  // Usunięcie u siebie → „ukryj u mnie”: pełne uzgodnienie nie tworzy go ponownie.
  const gone = gItem(state, E.group, { status: 'cancelled' });
  state.list = () => json({ items: [gone], nextSyncToken: 'S5' });
  mockFetch(googleMock(state));
  const r3 = await syncTarget(db, await loadUserTarget(db, JAN, 'google'), ctx(), { forcePull: true, forceFull: true });
  assert.equal(r3.hidden, 1);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  const [hid] = await q1(`SELECT hidden, external_id FROM calendar_sync_items WHERE event_id = $1 AND target_id = $2`, [E.group, target.id]);
  assert.deepEqual([hid.hidden, hid.external_id], [true, null]);
});

test('Google: 410 GONE → pełna synchronizacja od nowa; 429 → backoff; błąd tokenu → status i JEDEN e-mail', { skip }, async () => {
  const state = { events: new Map() };
  let n = 0;
  state.list = (u) => { n++; return u.includes('syncToken=') ? json({ error: { message: 'Sync token is no longer valid' } }, 410) : json({ items: [], nextSyncToken: 'FRESH' }); };
  mockFetch(googleMock(state));
  const t = await loadUserTarget(db, JAN, 'google');
  const r = await syncTarget(db, t, ctx(), { forcePull: true });
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.resynced, true);
  assert.equal(n, 2);
  assert.equal((await loadUserTarget(db, JAN, 'google')).sync_cursor, 'FRESH');

  mockFetch([[(u) => u.includes('/events?'), json({ error: { message: 'Rate Limit Exceeded' } }, 429, { 'Retry-After': '120' })]]);
  const r2 = await syncTarget(db, await loadUserTarget(db, JAN, 'google'), ctx(), { forcePull: true });
  assert.match(r2.error, /limit/);
  const tb = await loadUserTarget(db, JAN, 'google');
  assert.ok(Date.parse(tb.backoff_until) - Date.now() > 100_000);
  assert.equal(tb.status, 'active');
  assert.deepEqual(await syncTarget(db, tb, ctx(), {}), { skipped: 'backoff' });
  await db.query(`UPDATE calendar_sync_targets SET backoff_until = NULL`);

  // Wygasły token + cofnięta zgoda → połączenie 'revoked', kalendarz 'error', jeden e-mail do właściciela.
  await db.query(`INSERT INTO workspace_integration_settings (provider, client_id, client_secret_enc) VALUES ('google', 'gid', NULL) ON CONFLICT (provider) DO NOTHING`);
  await workspaceAction(reqOf({ action: 'save_credentials', provider: 'google', client_id: 'gid', client_secret: 'gsecret' }, ADMIN), await integrationCaller(db, ADMIN, DB_NAME));
  await db.query(`UPDATE integration_connections SET expires_at = now() - interval '1 hour' WHERE user_id = $1`, [JAN]);
  emails.length = 0;
  mockFetch([[(u) => u === 'https://oauth2.googleapis.com/token', json({ error: 'invalid_grant', error_description: 'Token has been revoked.' }, 400)]]);
  const r3 = await syncTarget(db, await loadUserTarget(db, JAN, 'google'), ctx(), { forcePull: true });
  assert.match(r3.error, /cofnięta|revoked/i);
  const te = await loadUserTarget(db, JAN, 'google');
  assert.equal(te.status, 'error');
  assert.equal((await loadConnection(db, 'google', { scopeKind: 'user', userId: JAN })).status, 'revoked');
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'jan@kosciol.pl');
  await syncTarget(db, te, ctx(), { forcePull: true });
  assert.equal(emails.length, 1, 'tylko jeden e-mail');
  // Status dla osoby bez tokenów.
  const st = await calendarAction(reqOf({ action: 'status' }, JAN));
  const text = JSON.stringify(st);
  for (const s of ['GAT-JAN', 'GRT-JAN', 'access_token_enc', 'refresh_token_enc']) assert.ok(!text.includes(s), s);
  assert.equal(st.providers.google.target.status, 'error');
  assert.equal(st.providers.google.connection.status, 'revoked');
  // Rozłączenie: kalendarz docelowy i połączenie usunięte (unieważnienie u Google best-effort).
  mockFetch([[() => true, json(null, 204)]]);
  const d = await calendarAction(reqOf({ action: 'disconnect', provider: 'google' }, JAN));
  assert.equal(d.removed, true);
  assert.equal(await loadUserTarget(db, JAN, 'google'), null);
  assert.equal(await loadConnection(db, 'google', { scopeKind: 'user', userId: JAN }), null);
});

test('Google: zmiana od osoby z prawem edycji → zapis w Avenit (+ kolejka dla innych); konflikt — nowsza zmiana w Avenit wygrywa', { skip }, async () => {
  const conn = await saveUserConnection(db, { provider: 'google', userId: LIDER, accountEmail: 'lider@gmail.com', scopes: [GOOGLE_SCOPES.calendarAppCreated], accessToken: 'GAT-L', refreshToken: 'R', expiresIn: 3600 });
  const target = await ensureUserTarget(db, conn, { userId: LIDER, email: 'lider@kosciol.pl' });
  await db.query(`UPDATE calendar_sync_targets SET prefs = '{"mode":"all"}'::jsonb WHERE id = $1`, [target.id]);
  const state = { events: new Map(), list: () => json({ items: [], nextSyncToken: 'L1' }) };
  mockFetch(googleMock(state));
  await syncTarget(db, await loadUserTarget(db, LIDER, 'google'), ctx(), {});
  assert.ok([...state.events.values()].some((e) => e.extendedProperties.private.avenit_event_id === E.leaders));

  emitted.length = 0;
  await db.query(`DELETE FROM calendar_sync_queue`);
  const moved = gItem(state, E.pub, {
    summary: 'Nabożeństwo rodzinne', start: { dateTime: `${day(3)}T11:00:00`, timeZone: 'Europe/Warsaw' }, end: { dateTime: `${day(3)}T13:00:00`, timeZone: 'Europe/Warsaw' },
  });
  // dateTime bez przesunięcia + strefa kościoła — czas lokalny.
  state.list = () => json({ items: [moved], nextSyncToken: 'L2' });
  mockFetch(googleMock(state));
  const r = await syncTarget(db, await loadUserTarget(db, LIDER, 'google'), ctx(), { forcePull: true });
  assert.equal(r.applied, 1, JSON.stringify(r));
  const [ev] = await q1(`SELECT title, time, end_time, location FROM events WHERE id::text = $1`, [E.pub]);
  assert.deepEqual([ev.title, ev.time, ev.end_time, ev.location], ['Nabożeństwo rodzinne', '11:00', '13:00', 'Kościół']);
  assert.ok(emitted.some(([, table, op]) => table === 'events' && op === 'update'));
  assert.deepEqual((await q1(`SELECT event_id FROM calendar_sync_queue`)).map((x) => x.event_id), [E.pub]);

  // Konflikt: wydarzenie zmienione w Avenit (w kolejce) później niż zmiana u dostawcy → wygrywa Avenit.
  await db.query(`DELETE FROM calendar_sync_queue`);
  await db.query(`UPDATE events SET title = 'Nabożeństwo (Avenit)' WHERE id::text = $1`, [E.pub]);
  const older = gItem(state, E.pub, { summary: 'Starsza zmiana', updated: new Date(Date.now() - 60_000).toISOString() });
  state.list = () => json({ items: [older], nextSyncToken: 'L3' });
  mockFetch(googleMock(state));
  const r2 = await syncTarget(db, await loadUserTarget(db, LIDER, 'google'), ctx(), { forcePull: true, dirty: new Map([[E.pub, Date.now()]]) });
  assert.equal(r2.applied, 0);
  assert.equal((await q1(`SELECT title FROM events WHERE id::text = $1`, [E.pub]))[0].title, 'Nabożeństwo (Avenit)');
  assert.equal([...state.events.values()].find((e) => e.extendedProperties.private.avenit_event_id === E.pub).summary, 'Nabożeństwo (Avenit)');
  await db.query(`UPDATE events SET title = 'Nabożeństwo', time = '10:00', end_time = '12:00' WHERE id::text = $1`, [E.pub]);
  await db.query(`DELETE FROM calendar_sync_targets WHERE id = $1`, [target.id]);
});

test('Microsoft, kalendarz osobisty: delta z paginacją (nextLink → deltaLink), cofnięcie zmiany i ukrycie po usunięciu', { skip }, async () => {
  const conn = await saveUserConnection(db, { provider: 'microsoft', userId: OLA, externalTenant: TID, accountEmail: 'ola@kosciol.pl', scopes: ['offline_access', 'Calendars.ReadWrite'], accessToken: 'MAT-OLA', refreshToken: 'MRT', expiresIn: 3600 });
  const target = await ensureUserTarget(db, conn, { userId: OLA, email: 'ola@kosciol.pl' });
  const G = 'https://graph.microsoft.com/v1.0/me';
  const store = new Map();
  let ck = 0;
  const save = (id, body) => { const e = { ...store.get(id), ...body, id, changeKey: `ck${++ck}` }; store.set(id, e); return e; };
  let delta = () => json({ value: [], '@odata.deltaLink': `${G}/calendars/mscal/calendarView/delta?$deltatoken=D1` });
  const ms = () => [
    [(u, c) => u === `${G}/calendars` && c.method === 'POST', json({ id: 'mscal', name: 'Avenit — Kościół Testowy' })],
    [(u, c) => u === `${G}/calendars/mscal/events` && c.method === 'POST', (u, c) => json(save(`m${store.size + 1}`, c.body))],
    [(u, c) => u.startsWith(`${G}/events/`) && c.method === 'PATCH', (u, c) => json(save(decodeURIComponent(u.split('/events/')[1]), c.body))],
    [(u, c) => u.startsWith(`${G}/events/`) && c.method === 'DELETE', () => json(null, 204)],
    [(u) => u.includes('/calendarView/delta'), (u, c) => delta(u, c)],
  ];
  mockFetch(ms());
  const r1 = await syncTarget(db, target, ctx(), {});
  assert.equal(r1.error, undefined, r1.error);
  assert.equal(r1.created, 1); // tylko potwierdzona służba Oli
  const first = calls.find((c) => c.url.includes('/calendarView/delta'));
  assert.match(first.url, /startDateTime=\d{4}-\d{2}-\d{2}T00%3A00%3A00/);
  assert.match(first.headers.Prefer, /outlook\.timezone="Central European Standard Time"/);
  const [only] = [...store.values()];
  assert.equal(only.subject, 'Próba zespołu');
  assert.equal(only.showAs, 'busy');
  assert.equal((await loadUserTarget(db, OLA, 'microsoft')).sync_cursor, `${G}/calendars/mscal/calendarView/delta?$deltatoken=D1`);

  // Delta na dwie strony: zmiana tytułu przez Olę (bez prawa edycji) + wcześniej jej własny zapis.
  const edited = { ...only, subject: 'Moja próba', changeKey: 'ck-user', lastModifiedDateTime: new Date(Date.now() + 5000).toISOString(),
    start: { dateTime: `${day(6)}T17:00:00.0000000`, timeZone: 'Central European Standard Time' }, end: { dateTime: `${day(6)}T18:00:00.0000000`, timeZone: 'Central European Standard Time' },
    isAllDay: false, body: { contentType: 'text', content: only.body.content } };
  const page2 = `${G}/calendars/mscal/calendarView/delta?$skiptoken=P2`;
  delta = (u) => {
    if (u.includes('deltatoken=D1')) return json({ value: [{ ...only }], '@odata.nextLink': page2 });
    if (u === page2) return json({ value: [edited], '@odata.deltaLink': `${G}/calendars/mscal/calendarView/delta?$deltatoken=D2` });
    return json({ value: [], '@odata.deltaLink': u });
  };
  mockFetch(ms());
  const r2 = await syncTarget(db, await loadUserTarget(db, OLA, 'microsoft'), ctx(), { forcePull: true });
  assert.equal(r2.reverted, 1, JSON.stringify(r2));
  assert.deepEqual(calls.filter((c) => c.method === 'PATCH').map((c) => c.body.subject), ['Próba zespołu']);
  assert.match((await loadUserTarget(db, OLA, 'microsoft')).sync_cursor, /deltatoken=D2$/);

  // Usunięcie u siebie (@removed) → ukryte.
  delta = () => json({ value: [{ id: only.id, '@removed': { reason: 'deleted' } }], '@odata.deltaLink': `${G}/calendars/mscal/calendarView/delta?$deltatoken=D3` });
  mockFetch(ms());
  const r3 = await syncTarget(db, await loadUserTarget(db, OLA, 'microsoft'), ctx(), { forcePull: true });
  assert.equal(r3.hidden, 1);
  // Wygasły stan delty (410) → od nowa bez tokenu.
  delta = (u) => (u.includes('deltatoken=D3') ? json({ error: { code: 'syncStateNotFound' } }, 410) : json({ value: [], '@odata.deltaLink': `${G}/x?$deltatoken=D4` }));
  mockFetch(ms());
  const r4 = await syncTarget(db, await loadUserTarget(db, OLA, 'microsoft'), ctx(), { forcePull: true });
  assert.equal(r4.resynced, true);
  await db.query(`DELETE FROM calendar_sync_targets WHERE id = $1`, [target.id]);
});

test('OAuth kalendarza osobistego: zakres calendar.app.created, callback zapisuje połączenie osoby i kalendarz docelowy', { skip }, async () => {
  const CREDS = { clientId: 'gid', clientSecret: 'gsecret', msTenant: '', source: 'tenant' };
  const { url, nonce, stateId } = await startConnect(db, { provider: 'google', purpose: 'calendar', tenant: 'schwro', user: { id: OLA, email: 'ola@kosciol.pl' }, creds: CREDS });
  const u = new URL(url);
  assert.equal(u.searchParams.get('scope'), `openid email ${GOOGLE_SCOPES.calendarAppCreated}`);
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(verifyIntegrationState(u.searchParams.get('state')).purpose, 'calendar');
  const jwt = (c) => `h.${Buffer.from(JSON.stringify(c)).toString('base64url')}.s`;
  mockFetch([[(x) => x === 'https://oauth2.googleapis.com/token', json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: `openid email ${GOOGLE_SCOPES.calendarAppCreated}`, id_token: jwt({ email: 'ola@gmail.com' }) })]]);
  const out = await handleCallback(db, { provider: 'google', stateId, query: { code: 'C' }, nonceCookie: nonce, creds: CREDS, tenant: 'schwro' });
  assert.deepEqual([out.result, out.purpose], ['connected', 'calendar']);
  const conn = await loadConnection(db, 'google', { scopeKind: 'user', userId: OLA });
  assert.equal(conn.account_email, 'ola@gmail.com');
  const t = await loadUserTarget(db, OLA, 'google');
  assert.deepEqual([t.kind, t.owner_email, t.needs_full], ['user', 'ola@kosciol.pl', true]);
  // Bez zakresu kalendarza — odmowa.
  const s2 = await startConnect(db, { provider: 'google', purpose: 'calendar', tenant: 'schwro', user: { id: OLA, email: 'ola@kosciol.pl' }, creds: CREDS });
  mockFetch([[() => true, json({ access_token: 'AT', refresh_token: 'RT', scope: 'openid email', id_token: jwt({ email: 'ola@gmail.com' }) })]]);
  const bad = await handleCallback(db, { provider: 'google', stateId: s2.stateId, query: { code: 'C' }, nonceCookie: s2.nonce, creds: CREDS, tenant: 'schwro' });
  assert.deepEqual([bad.result, bad.reason], ['error', 'scopes']);
  // Microsoft: delegowane Calendars.ReadWrite + offline_access, podpowiedź konta.
  const ms = await startConnect(db, { provider: 'microsoft', purpose: 'calendar', tenant: 'schwro', user: { id: OLA, email: 'ola@kosciol.pl' }, creds: { ...CREDS, clientId: 'mid' } });
  const mu = new URL(ms.url);
  assert.match(mu.searchParams.get('scope'), /offline_access Calendars\.ReadWrite/);
  assert.equal(mu.searchParams.get('login_hint'), 'ola@kosciol.pl');
  // Kalendarz kościoła Microsoft — bez logowania osoby.
  await assert.rejects(startConnect(db, { provider: 'microsoft', purpose: 'church_calendar', tenant: 'schwro', user: { id: ADMIN }, creds: CREDS }), (e) => e.code === 'purpose_disabled');
  // fn: connect zwraca adres i ciasteczko, nie wymaga uprawnień administracyjnych.
  const c = await calendarAction(reqOf({ action: 'connect', provider: 'google' }, JAN));
  assert.match(c.url, /calendar\.app\.created/);
  assert.ok(c.__cookie);
  await calendarAction(reqOf({ action: 'disconnect', provider: 'google', keep_calendar: true }, OLA));
});

test('kalendarz kościoła Microsoft: uprawnienia, skrzynka, tylko publiczne wydarzenia, import nowych (przełącznik), edycja administratora', { skip }, async () => {
  const member = await integrationCaller(db, JAN, DB_NAME);
  await assert.rejects(workspaceAction(reqOf({ action: 'calendar_save', provider: 'microsoft', settings: { mailbox: 'k@kosciol.pl' } }, JAN), member), (e) => e.status === 403);
  const admin = await integrationCaller(db, ADMIN, DB_NAME);
  await assert.rejects(workspaceAction(reqOf({ action: 'calendar_save', provider: 'microsoft', settings: { mailbox: 'k@kosciol.pl' } }, ADMIN), admin), (e) => e.code === 'not_connected');
  await workspaceAction(reqOf({ action: 'save_credentials', provider: 'microsoft', client_id: 'mid', client_secret: 'msecret' }, ADMIN), admin);
  await saveTenantConnection(db, { provider: 'microsoft', externalTenant: TID, accountEmail: 'it@kosciol.pl', scopes: ['User.Read.All'], accessToken: 'APP', expiresIn: 3600 });
  // Brak roli Calendars.ReadWrite (także w świeżym tokenie) → 409 z instrukcją.
  const jwt = (c) => `h.${Buffer.from(JSON.stringify(c)).toString('base64url')}.s`;
  mockFetch([[(u) => u.includes('/oauth2/v2.0/token'), json({ access_token: jwt({ roles: ['User.Read.All'] }), expires_in: 3600 })]]);
  await assert.rejects(workspaceAction(reqOf({ action: 'calendar_save', provider: 'microsoft', settings: { mailbox: 'k@kosciol.pl' } }, ADMIN), admin), (e) => e.code === 'missing_role');
  // Po zgodzie: rola w tokenie → zapis; zły adres skrzynki → 400.
  mockFetch([[(u) => u.includes('/oauth2/v2.0/token'), json({ access_token: jwt({ roles: ['User.Read.All', 'Calendars.ReadWrite'] }), expires_in: 3600 })]]);
  await assert.rejects(workspaceAction(reqOf({ action: 'calendar_save', provider: 'microsoft', settings: { mailbox: 'zly' } }, ADMIN), admin), (e) => e.status === 400);
  const saved = await workspaceAction(reqOf({ action: 'calendar_save', provider: 'microsoft', settings: { mailbox: 'Kalendarz@Kosciol.pl' } }, ADMIN), admin);
  assert.deepEqual([saved.target.mailbox, saved.target.prefs.import_new, saved.target.enabled], ['kalendarz@kosciol.pl', false, true]);
  const st = await workspaceAction(reqOf({ action: 'status' }, ADMIN), admin);
  assert.equal(st.providers.microsoft.calendar.app_role_ok, true);
  assert.equal(st.providers.microsoft.calendar.target.mailbox, 'kalendarz@kosciol.pl');

  const U = 'https://graph.microsoft.com/v1.0/users/kalendarz%40kosciol.pl';
  const store = new Map();
  let delta = () => json({ value: [], '@odata.deltaLink': `${U}/calendars/kc/calendarView/delta?$deltatoken=K1` });
  const ms = () => [
    [(u, c) => u === `${U}/calendars` && c.method === 'POST', json({ id: 'kc', name: 'Avenit — Kościół Testowy' })],
    [(u, c) => u === `${U}/calendars/kc/events` && c.method === 'POST', (u, c) => { const id = `k${store.size + 1}`; const e = { ...c.body, id, changeKey: `c-${id}-1` }; store.set(id, e); return json(e); }],
    [(u, c) => u.startsWith(`${U}/events/`) && c.method === 'PATCH', (u, c) => { const id = decodeURIComponent(u.split('/events/')[1]); const e = { ...store.get(id), ...c.body, id, changeKey: `c-${id}-${Math.random()}` }; store.set(id, e); return json(e); }],
    [(u) => u.includes('/calendarView/delta'), (u) => delta(u)],
    [(u, c) => u.startsWith(`${U}/calendars/kc?`) && c.method === 'GET', json({ id: 'kc' })],
  ];
  mockFetch(ms());
  const church = await loadChurchTarget(db, 'microsoft');
  const r = await syncTarget(db, church, ctx(), {});
  assert.equal(r.error, undefined, r.error);
  assert.deepEqual([...store.values()].map((e) => e.subject).sort(), ['Konferencja', 'Nabożeństwo', 'Piknik']);
  assert.ok(calls.every((c) => c.url.includes('kalendarz%40kosciol.pl') || c.url.includes('/oauth2/')));

  // Nowe wydarzenie w kalendarzu kościoła: import wyłączony → ignorowane.
  const newExt = { id: 'ext-1', subject: 'Sprzątanie kościoła', changeKey: 'x1', isAllDay: false,
    start: { dateTime: `${day(8)}T09:00:00.0000000`, timeZone: 'Central European Standard Time' }, end: { dateTime: `${day(8)}T11:00:00.0000000`, timeZone: 'Central European Standard Time' },
    location: { displayName: 'Kościół' }, body: { contentType: 'text', content: 'Przynieś rękawice' }, type: 'singleInstance' };
  delta = () => json({ value: [newExt], '@odata.deltaLink': `${U}/calendars/kc/calendarView/delta?$deltatoken=K2` });
  mockFetch(ms());
  const r2 = await syncTarget(db, await loadChurchTarget(db, 'microsoft'), ctx(), { forcePull: true });
  assert.equal(r2.imported, 0);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM events WHERE title = 'Sprzątanie kościoła'`))[0].n, 0);
  // Import włączony → wydarzenie Avenit (kalendarz ogólny, oznaczone źródłem), bez duplikatu u dostawcy.
  await workspaceAction(reqOf({ action: 'calendar_save', provider: 'microsoft', settings: { prefs: { import_new: true } } }, ADMIN), admin);
  mockFetch(ms());
  const r3 = await syncTarget(db, await loadChurchTarget(db, 'microsoft'), ctx(), { forcePull: true });
  assert.equal(r3.imported, 1, JSON.stringify(r3));
  const [imp] = await q1(`SELECT id::text AS id, title, time, end_time, module_key, external_source, external_id, description, location, visibility_segments FROM events WHERE title = 'Sprzątanie kościoła'`);
  assert.deepEqual([imp.time, imp.end_time, imp.module_key, imp.external_source, imp.external_id, imp.description, imp.location, imp.visibility_segments],
    ['09:00', '11:00', 'general', 'microsoft', 'ext-1', 'Przynieś rękawice', 'Kościół', null]);
  assert.equal(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/events')).length, 0, 'bez duplikatu');
  assert.ok(calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/events/ext-1')), 'dopisany link do Avenit');

  // Zmiana wydarzenia Avenit w kalendarzu kościoła — administrator może edytować → zapis w Avenit.
  const pubExt = [...store.values()].find((e) => e.subject === 'Piknik');
  delta = () => json({ value: [{ ...pubExt, subject: 'Piknik parafialny', changeKey: 'edit', lastModifiedDateTime: new Date(Date.now() + 5000).toISOString(), isAllDay: false,
    start: { dateTime: `${day(12)}T12:00:00.0000000`, timeZone: 'Central European Standard Time' }, end: { dateTime: `${day(12)}T13:00:00.0000000`, timeZone: 'Central European Standard Time' } }],
  '@odata.deltaLink': `${U}/calendars/kc/calendarView/delta?$deltatoken=K3` });
  mockFetch(ms());
  const r4 = await syncTarget(db, await loadChurchTarget(db, 'microsoft'), ctx(), { forcePull: true });
  assert.equal(r4.applied, 1, JSON.stringify(r4));
  assert.equal((await q1(`SELECT title FROM events WHERE id::text = $1`, [E.other]))[0].title, 'Piknik parafialny');
  // Wydarzenie zmienione na prywatne → znika z kalendarza kościoła.
  await db.query(`UPDATE events SET visibility_segments = '[{"type":"role","values":["lider"]}]'::jsonb WHERE id::text = $1`, [E.other]);
  await enqueueCalendarSync(db, [E.other]);
  delta = () => json({ value: [], '@odata.deltaLink': `${U}/calendars/kc/calendarView/delta?$deltatoken=K4` });
  mockFetch([...ms(), [(u, c) => c.method === 'DELETE', json(null, 204)]]);
  await runCalendarSync(db, ctx());
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 1);
  // Usunięcie kalendarza kościoła w Avenit — tylko administrator integracji.
  const rm = await workspaceAction(reqOf({ action: 'calendar_remove', provider: 'microsoft' }, ADMIN), admin);
  assert.equal(rm.removed, true);
  assert.equal(await loadChurchTarget(db, 'microsoft'), null);
});

test('kalendarz kościoła Google: konto administratora z zakresem kalendarza, udostępnienie domenie; kolejka po zapisie /api/db', { skip }, async () => {
  const integ = await integrationCaller(db, OBCY, DB_NAME);
  // Bez połączenia konta Google z kalendarzem — odmowa z instrukcją.
  await assert.rejects(workspaceAction(reqOf({ action: 'calendar_save', provider: 'google', settings: {} }, OBCY), integ), (e) => e.code === 'not_connected');
  const c = await workspaceAction(reqOf({ action: 'calendar_connect', provider: 'google' }, OBCY), integ);
  const scope = new URL(c.url).searchParams.get('scope');
  assert.ok(scope.includes(GOOGLE_SCOPES.calendarAppCreated) && scope.includes(GOOGLE_SCOPES.calendarAcls));
  await assert.rejects(workspaceAction(reqOf({ action: 'calendar_connect', provider: 'google' }, JAN), await integrationCaller(db, JAN, DB_NAME)), (e) => e.status === 403);
  await saveUserConnection(db, { provider: 'google', userId: OBCY, externalTenant: 'kosciol.pl', accountEmail: 'it@kosciol.pl', scopes: [GOOGLE_SCOPES.calendarAppCreated, GOOGLE_SCOPES.calendarAcls], accessToken: 'GAT-IT', refreshToken: 'R', expiresIn: 3600 });
  const saved = await workspaceAction(reqOf({ action: 'calendar_save', provider: 'google', settings: { use_my_account: true, prefs: { modules: ['general'] } } }, OBCY), integ);
  assert.deepEqual(saved.target.prefs.modules, ['general']);
  const state = { events: new Map(), list: () => json({ items: [], nextSyncToken: 'C1' }) };
  mockFetch([...googleMock(state), [(u, cc) => u.endsWith('/gcal1/acl') && cc.method === 'POST', json({ id: 'domain:kosciol.pl', role: 'reader' })]]);
  const r = await syncTarget(db, await loadChurchTarget(db, 'google'), ctx(), {});
  assert.equal(r.error, undefined, r.error);
  const acl = calls.find((x) => x.url.endsWith('/acl'));
  assert.deepEqual(acl.body, { role: 'reader', scope: { type: 'domain', value: 'kosciol.pl' } });
  assert.deepEqual([...state.events.values()].map((e) => e.summary).sort(), ['Konferencja', 'Nabożeństwo', 'Sprzątanie kościoła']); // tylko 'general' i publiczne (także zaimportowane z Microsoft)
  assert.equal((await loadChurchTarget(db, 'google')).stats.shared_with_domain, true);

  // Hook po zapisie /api/db: wydarzenie, grafik i zapis → kolejka (select pomijany).
  const { enqueueCalendarAfterWrite } = await import('../src/integrations/calendarQueue.js');
  await db.query(`DELETE FROM calendar_sync_queue`);
  enqueueCalendarAfterWrite(db, 'events', 'update', [{ id: 5 }]);
  enqueueCalendarAfterWrite(db, 'schedule_assignments', 'insert', [{ id: 1, event_id: 7 }]);
  enqueueCalendarAfterWrite(db, 'event_registrations', 'select', [{ event_id: 8 }]);
  enqueueCalendarAfterWrite(db, 'members', 'update', [{ id: 9 }]);
  await new Promise((res) => setTimeout(res, 50));
  assert.deepEqual((await q1(`SELECT event_id FROM calendar_sync_queue ORDER BY event_id`)).map((x) => x.event_id), ['5', '7']);
});

test('limit zapisów w przebiegu: pierwsza synchronizacja dużego kalendarza w kilku minutach (needs_full do końca)', { skip }, async () => {
  const conn = await saveUserConnection(db, { provider: 'google', userId: ADMIN, accountEmail: 'admin@kosciol.pl', scopes: [GOOGLE_SCOPES.calendarAppCreated], accessToken: 'GAT-A', refreshToken: 'R', expiresIn: 3600 });
  const target = await ensureUserTarget(db, conn, { userId: ADMIN, email: 'admin@kosciol.pl' });
  await db.query(`UPDATE calendar_sync_targets SET prefs = '{"mode":"all"}'::jsonb WHERE id = $1`, [target.id]);
  const state = { events: new Map(), list: () => json({ items: [], nextSyncToken: 'A1' }) };
  setMaxWritesPerRun(3);
  try {
    mockFetch(googleMock(state));
    const r1 = await syncTarget(db, await loadUserTarget(db, ADMIN, 'google'), ctx(), {});
    assert.deepEqual([r1.created, r1.incomplete], [3, true]);
    assert.equal((await loadUserTarget(db, ADMIN, 'google')).needs_full, true);
    let guard = 0;
    while ((await loadUserTarget(db, ADMIN, 'google')).needs_full && guard++ < 10) {
      mockFetch(googleMock(state));
      await syncTarget(db, await loadUserTarget(db, ADMIN, 'google'), ctx(), {});
    }
    const total = state.events.size;
    assert.ok(total > 3, `${total}`);
    mockFetch(googleMock(state));
    const last = await syncTarget(db, await loadUserTarget(db, ADMIN, 'google'), ctx(), { forceFull: true });
    assert.deepEqual([last.created, last.same, last.incomplete], [0, total, undefined]);
  } finally {
    setMaxWritesPerRun(300);
  }
});
