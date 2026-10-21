// Moduł służby „Tłumaczenia” (migracja 117) + grafik → kanały tłumaczenia na żywo
// (src/interpretation/scheduleSync.js): uprawnienia lidera służby, spójność katalogu,
// migracja idempotentna po 116, synchronizacja tylko potwierdzonych tłumaczy.
//
// PGlite: testy bazy pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test packages/api/test/tlumaczenia.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MODULES } from '@avenit/shared/src/permissions/catalog.js';
import { membershipCapabilities, ministryGrants, isCustomMinistryKey, MINISTRY_MODULES } from '@avenit/shared/src/permissions/ministry.js';
import { MODULE_SLICES, sliceResource, isCustomModuleKey, moduleForTasksSource, canModuleScoped } from '@avenit/shared/src/permissions/moduleScope.js';
import { conversationModuleKey } from '@avenit/shared/src/lib/messageTasks.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { presetGrantRows } from '@avenit/shared/src/permissions/presets.js';
import { REGISTRY, getTableRule } from '../src/dataapi/registry.js';
import { BUILTIN_TEAMS, customKeyFromTable } from '../src/fn/chat-channels-sync.js';
import { resolveSource } from '../src/fn/board-import-legacy.js';
import { teamTableFor } from '../src/lib/assigneeIdentity.js';
import { FINANCE_TEAM_TYPES } from '../src/dataapi/financeScope.js';
import { getSession, upsertSession, canManageInterpretation, MANAGE_CAPABILITY } from '../src/interpretation/service.js';
import {
  langForRole, labelForLang, planFromSchedule, reconcileInterpretersFromSchedule, prepareScheduleSync,
  eventsAfterWrite, reconcileUpcoming, upcomingEventIds,
} from '../src/interpretation/scheduleSync.js';
import { respondToAssignments } from '../src/public/routes.js';
import { languagesFromRoles, candidatesFor, eligibilityError, interpreterWarning } from '../src/interpretation/team.js';
import { utcToZoned } from '../src/meetings/logic.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';
const log = { error() {}, warn() {}, info() {} };
const U = (name, id) => ({ id: id ?? name, email: `${name}@x.pl` });
const DAY = 86_400_000;

// ── Uprawnienia i spójność ──────────────────────────────────────────────────
test('katalog: moduł Tłumaczenia jest wbudowaną służbą (nie modułem z kreatora)', () => {
  const mod = MODULES.find((m) => m.key === 'tlumaczenia');
  assert.ok(mod, 'w katalogu');
  for (const r of mod.resources) assert.equal(REGISTRY[r]?.resource, 'module:tlumaczenia', `${r} w rejestrze`);
  assert.deepEqual(mod.tabs.map((t) => t.key), ['events', 'schedule', 'tasks', 'members', 'finances', 'equipment']);
  assert.ok(MINISTRY_MODULES.includes('tlumaczenia'));
  assert.equal(isCustomMinistryKey('tlumaczenia'), false);
  assert.equal(isCustomModuleKey('tlumaczenia'), false);
  // custom_tlumaczenia_members: jawny wpis rejestru (bez flagi „moduł własny”), kanał jako zespół wbudowany.
  assert.equal(getTableRule('custom_tlumaczenia_members').custom, undefined);
  assert.equal(customKeyFromTable('custom_tlumaczenia_members'), null, 'odkrywanie modułów z kreatora pomija');
  assert.ok(BUILTIN_TEAMS.some((t) => t.channelKey === 'tlumaczenia_team' && t.table === 'custom_tlumaczenia_members'));
  assert.equal(conversationModuleKey({ type: 'ministry', ministry_key: 'tlumaczenia_team' }), 'tlumaczenia');
  // Wycinki: wydarzenia/zadania; tablica zadań po source_kind; import tablicy bez starej tabeli.
  assert.deepEqual(MODULE_SLICES.tlumaczenia, { events: 'tlumaczenia_events', tasks: 'tlumaczenia_tasks', task_comments: 'tlumaczenia_task_comments' });
  assert.equal(sliceResource('tlumaczenia', 'events'), 'tlumaczenia_events');
  assert.equal(moduleForTasksSource('tlumaczenia_tasks'), 'tlumaczenia');
  const src = resolveSource('tlumaczenia_tasks');
  assert.equal(src.moduleKey, 'tlumaczenia');
  assert.equal(src.capability, 'module:tlumaczenia');
  assert.equal(teamTableFor('tlumaczenia'), 'custom_tlumaczenia_members');
  assert.equal(FINANCE_TEAM_TYPES.tlumaczenia, 'Tłumaczenia');
});

test('lider służby Tłumaczeń zarządza tłumaczeniem na żywo; członek nie', () => {
  const leader = membershipCapabilities('tlumaczenia', 'leader');
  assert.ok(leader.includes(MANAGE_CAPABILITY));
  assert.ok(leader.includes('module:tlumaczenia'));
  assert.ok(leader.includes('res:custom_tlumaczenia_members:delete'));
  const member = membershipCapabilities('tlumaczenia', 'member');
  assert.ok(!member.includes(MANAGE_CAPABILITY));
  assert.ok(member.includes('!tab:tlumaczenia:finances'), 'finanse tylko lider');
  assert.ok(!membershipCapabilities('media', 'leader').includes(MANAGE_CAPABILITY), 'lider innej służby — nie');
  // Członek z rolą „członek” + lider Tłumaczeń: grafik swojej służby (w zakresie), nie cudzej.
  const rows = presetGrantRows();
  for (const g of ministryGrants([{ ministry_key: 'tlumaczenia', role: 'leader' }])) rows.push({ role: null, user_id: 'u1', capability: g.capability, allowed: g.allowed });
  const can = makeResolver(rows, { role: 'czlonek', userId: 'u1', isAdmin: false }).can;
  assert.equal(can(MANAGE_CAPABILITY), true);
  assert.equal(canModuleScoped(can, 'tlumaczenia', 'schedule_assignments', 'update'), true);
  assert.equal(canModuleScoped(can, 'worship', 'schedule_assignments', 'update'), false);
  assert.equal(canModuleScoped(can, 'tlumaczenia', 'events', 'create'), true);
});

// ── Reguły czyste ───────────────────────────────────────────────────────────
test('rola grafiku → kod języka i etykieta kanału', () => {
  assert.equal(langForRole('en'), 'en');
  assert.equal(langForRole('pt_BR'), 'pt-br');
  assert.equal(langForRole('tumacz_de', 'Tłumacz DE'), 'de');
  assert.equal(langForRole('x1', 'Tłumacz FR'), 'fr');
  assert.equal(langForRole('koordynator', 'Koordynator'), null);
  assert.equal(labelForLang('uk'), 'Українська');
  assert.equal(labelForLang('fr', 'Tłumacz Français'), 'Français');
  assert.equal(labelForLang('fr', 'Tłumacz'), 'Français', 'endonim także spoza tabeli (Intl)');
  assert.equal(labelForLang('qq', 'Tłumacz Zzz'), 'Zzz');
  assert.equal(labelForLang('qq', 'Tłumacz'), 'QQ');
  const plan = planFromSchedule([
    { role_key: 'en', assigned_name: 'Ola', status: 'accepted', accounts: ['ola@x.pl'] },
    { role_key: 'en', assigned_name: 'Jan', status: 'pending', accounts: [] },
    { role_key: 'uk', assigned_name: 'Bez Konta', status: 'accepted', accounts: [] },
    { role_key: 'ru', assigned_name: 'Odmówił', status: 'rejected', accounts: ['x@x.pl'] },
    { role_key: 'koord', assigned_name: 'Kto', status: 'accepted', accounts: ['k@x.pl'] },
  ], new Map([['koord', 'Koordynator']]));
  assert.deepEqual([...plan.desired.entries()].map(([k, v]) => [k, [...v]]), [['en', ['ola@x.pl']]]);
  assert.deepEqual(plan.pending.map((p) => [p.lang_code, p.name]), [['en', 'Jan']]);
  assert.deepEqual(plan.noAccount.map((p) => [p.lang_code, p.name]), [['uk', 'Bez Konta']]);
  assert.equal(plan.unmapped.length, 1);
});

test('hak zapisu /api/db: wydarzenia z wierszy zwróconych i wstawianych (tylko team_type tlumaczenia)', () => {
  const q = { table: 'schedule_assignments', op: 'insert', values: [{ event_id: 7, team_type: 'tlumaczenia' }, { event_id: 8, team_type: 'media' }] };
  assert.deepEqual(eventsAfterWrite(q, null, []), ['7']);
  assert.deepEqual(eventsAfterWrite({ table: 'schedule_assignments', op: 'delete' }, ['3'], []), ['3']);
  assert.deepEqual(eventsAfterWrite({ table: 'events', op: 'update' }, ['3'], []), []);
});

// ── Baza (PGlite) ───────────────────────────────────────────────────────────
function poolOf(pg) {
  let lock = Promise.resolve();
  const run = async (sql, params) => {
    const r = await pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    async query(sql, params) { await lock; return run(sql, params); },
    async connect() {
      let release; const prev = lock;
      lock = new Promise((res) => { release = res; });
      await prev;
      return { query: run, release: () => release() };
    },
  };
}

let db;
let pgRef;
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
function fakeLivekit() {
  const lk = {
    enabled: true, settings: { url: 'wss://rtc.test' }, deleted: [],
    async mintToken(o) { return `tok:${o.identity}`; }, async createRoom() { return true; },
    async deleteRoom(r) { lk.deleted.push(r); return true; }, async listParticipants() { return []; },
    async mutePublishedTrack() { return true; }, async updateRoomMetadata() { return true; },
  };
  return lk;
}
function harness() {
  const livekit = fakeLivekit();
  return { ctx: { db, tenantSlug: 'kosciol', log, tenant: { name: 'K', slug: 'kosciol', subdomain: 'kosciol', dbName: `t_${Math.random()}` }, deps: { livekit } }, livekit };
}
const soon = (d = 1) => utcToZoned(Date.now() + d * DAY).date;
async function newEvent(title = 'Nabożeństwo', date = soon()) {
  const [row] = await q1(`INSERT INTO events (title, date, time, end_time) VALUES ($1, $2, '10:00', '12:00') RETURNING id`, [title, date]);
  return String(row.id);
}
async function assign(eventId, role, name, email, status = 'pending') {
  const [r] = await q1(
    `INSERT INTO schedule_assignments (event_id, team_type, role_key, assigned_name, assigned_email, status, token)
     VALUES ($1, 'tlumaczenia', $2, $3, $4, $5, gen_random_uuid()) RETURNING id, token`, [Number(eventId), role, name, email, status]);
  return r;
}
const channelsOfEvent = (eventId) => q1(
  `SELECT c.lang_code, c.label, c.source, c.status, c.id FROM interpretation_channels c
     JOIN interpretation_sessions s ON s.id = c.session_id WHERE s.event_id = $1 ORDER BY c.sort`, [eventId]);
const interpretersOfEvent = (eventId) => q1(
  `SELECT c.lang_code, lower(i.user_email) AS email, i.source FROM interpretation_interpreters i
     JOIN interpretation_channels c ON c.id = i.channel_id JOIN interpretation_sessions s ON s.id = c.session_id
    WHERE s.event_id = $1 ORDER BY c.lang_code, i.user_email`, [eventId]);

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  pgRef = pg;
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, member_id int, avatar_url text, campus_id int, status text DEFAULT 'active');
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE permission_grants (role text, user_id text, capability text, allowed boolean);
    CREATE TABLE ministry_memberships (id serial PRIMARY KEY, user_id text, ministry_key text, role text);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE members (id serial PRIMARY KEY, email text, full_name text, birth_date date, household_id int, home_group_id int, ministries jsonb DEFAULT '[]', tags jsonb DEFAULT '[]');
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text);
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid, user_email text, role text);
    CREATE TABLE meetings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid, event_id text);
    CREATE TABLE rsvp_campaigns (id serial PRIMARY KEY, event_id int);
    CREATE TABLE rsvp_invitations (id serial PRIMARY KEY, campaign_id int, member_id int, email text);
    CREATE TABLE events (id serial PRIMARY KEY, title text NOT NULL, description text, date date, time text, end_time text, end_date date,
      location text, module_key text, campus_id int, created_by text, is_archived boolean DEFAULT false, visibility_segments jsonb, format text,
      assignments jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE app_modules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE NOT NULL, label text, icon text, path text,
      resource_key text, display_order int DEFAULT 0, is_system boolean DEFAULT false, is_enabled boolean DEFAULT true, component_name text);
    CREATE TABLE app_module_tabs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), module_id uuid REFERENCES app_modules(id) ON DELETE CASCADE,
      key text NOT NULL, label text NOT NULL, icon text DEFAULT 'Square', component_type text DEFAULT 'empty', display_order int DEFAULT 0,
      is_system boolean DEFAULT false, UNIQUE (module_id, key));
    CREATE TABLE team_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, team_type text NOT NULL, name text NOT NULL,
      display_order int DEFAULT 0, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
    CREATE TABLE schedule_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id int, event_id integer, team_type text,
      role_key text, role_label text, assigned_name text, assigned_email text, status text DEFAULT 'pending', token uuid,
      responded_at timestamptz, created_at timestamptz DEFAULT now(), email_sent_at timestamptz);
    CREATE TABLE team_member_roles (id serial PRIMARY KEY, member_id text, member_table text, role_id uuid);
    ALTER TABLE members ADD COLUMN first_name text, ADD COLUMN last_name text;
    CREATE TABLE volunteer_blockouts (id serial PRIMARY KEY, member_id int, start_date date, end_date date, reason text);
  `);
  // Żywy tenant: moduły i służby innych zespołów już są — migracja ich nie rusza.
  await db.query(`INSERT INTO app_modules (key, label, display_order, is_system, component_name) VALUES ('media', 'Media', 4, true, 'MediaTeamModule'), ('worship', 'Uwielbienie', 3, true, 'WorshipModule')`);
  await db.query(`INSERT INTO team_roles (team_type, name, display_order) VALUES ('media', 'Prezentacja', 1), ('worship', 'Wokal', 1)`);
  await db.query(`INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('czlonek', false)`);
  await db.query(`INSERT INTO permission_grants (role, capability, allowed) VALUES
    ('czlonek', 'module:calendar', true), ('czlonek', 'res:events:read', true)`);
  await db.query(`INSERT INTO app_users (email, full_name, role, is_super_admin, is_active) VALUES
    ('boss@x.pl', 'Pastor', 'superadmin', true, true), ('ola@x.pl', 'Ola Nowak', 'czlonek', false, true),
    ('ewa@x.pl', 'Ewa Ręczna', 'czlonek', false, true), ('jan@x.pl', 'Jan Kowalski', 'czlonek', false, true),
    ('lider@x.pl', 'Lider Tłumaczy', 'czlonek', false, true), ('stary@x.pl', 'Nieaktywny', 'czlonek', false, false),
    ('olek@x.pl', 'Olek Live', 'czlonek', false, true)`);
  const m116 = fs.readFileSync(new URL('../db/tenant-migrations/116_interpretation.sql', import.meta.url), 'utf8');
  const m117 = fs.readFileSync(new URL('../db/tenant-migrations/117_tlumaczenia_module.sql', import.meta.url), 'utf8');
  await pg.exec(m116);
  await pg.exec(m117);
  await pg.exec(m117); // idempotentna
  // Skład służby (karta: tłumacze tylko stąd). Lider — bez wiersza w składzie (zarządza z przynależności).
  await db.query(`INSERT INTO custom_tlumaczenia_members (full_name, email, status) VALUES
    ('Ola Nowak', 'ola@x.pl', 'Aktywny'), ('Ewa Ręczna', 'ewa@x.pl', 'Aktywny'), ('Jan Kowalski', 'jan@x.pl', 'Aktywny'),
    ('Olek Live', 'olek@x.pl', 'Aktywny')`);
});

test('migracja 117: moduł, zakładki, języki i kolumny źródła — raz, bez ruszania innych zespołów', { skip: skipDb }, async () => {
  const mods = await q1(`SELECT key, label, icon, path, resource_key, is_system, is_enabled, component_name, display_order FROM app_modules ORDER BY display_order`);
  const t = mods.filter((m) => m.key === 'tlumaczenia');
  assert.equal(t.length, 1);
  assert.deepEqual({ ...t[0], display_order: undefined }, {
    key: 'tlumaczenia', label: 'Tłumaczenia', icon: 'Languages', path: '/tlumaczenia', resource_key: 'module:tlumaczenia',
    is_system: true, is_enabled: true, component_name: 'TlumaczeniaModule', display_order: undefined,
  });
  assert.equal(t[0].display_order, 5, 'na końcu menu');
  const tabs = await q1(`SELECT x.key FROM app_module_tabs x JOIN app_modules m ON m.id = x.module_id WHERE m.key = 'tlumaczenia' ORDER BY x.display_order`);
  assert.deepEqual(tabs.map((r) => r.key), ['events', 'schedule', 'tasks', 'members', 'roles', 'finances', 'files', 'equipment']);
  const roles = await q1(`SELECT team_type, name, field_key FROM team_roles ORDER BY team_type, display_order`);
  assert.deepEqual(roles.filter((r) => r.team_type === 'tlumaczenia').map((r) => [r.name, r.field_key]), [['Tłumacz EN', 'en'], ['Tłumacz UK', 'uk'], ['Tłumacz RU', 'ru']]);
  assert.deepEqual(roles.filter((r) => r.team_type !== 'tlumaczenia').map((r) => r.name), ['Prezentacja', 'Wokal']);
  const cols = await q1(`SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE (table_name = 'custom_tlumaczenia_members' AND column_name IN ('status', 'user_id', 'is_leader'))
       OR (table_name IN ('interpretation_interpreters', 'interpretation_channels') AND column_name = 'source') ORDER BY 1, 2`);
  assert.deepEqual(cols.map((c) => `${c.table_name}.${c.column_name}:${c.data_type}`), [
    'custom_tlumaczenia_members.is_leader:boolean', 'custom_tlumaczenia_members.status:text', 'custom_tlumaczenia_members.user_id:integer',
    'interpretation_channels.source:text', 'interpretation_interpreters.source:text',
  ]);
  // Usunięte przez kościół języki nie wracają przy ponownym uruchomieniu (seed tylko dla pustego zespołu).
  await db.query(`DELETE FROM team_roles WHERE team_type = 'tlumaczenia' AND field_key = 'ru'`);
  await pgRef.exec(fs.readFileSync(new URL('../db/tenant-migrations/117_tlumaczenia_module.sql', import.meta.url), 'utf8'));
  assert.equal((await q1(`SELECT count(*)::int AS n FROM team_roles WHERE team_type = 'tlumaczenia'`))[0].n, 2);
  await db.query(`INSERT INTO team_roles (team_type, name, field_key, display_order) VALUES ('tlumaczenia', 'Tłumacz RU', 'ru', 3)`);
});

test('sync: oczekujący nie trafia do kanału; po akceptacji — kanał i tłumacz z grafiku; odrzucenie zdejmuje', { skip: skipDb }, async () => {
  const { ctx } = harness();
  const ev = await newEvent();
  const ola = await assign(ev, 'en', 'Ola Nowak', 'ola@x.pl');
  await reconcileInterpretersFromSchedule(ctx, ev);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM interpretation_sessions WHERE event_id = $1`, [ev]))[0].n, 0, 'bez potwierdzenia — bez sesji');
  const boss = U('boss', 1);
  let view = await getSession(ctx, boss, { event_id: ev });
  assert.deepEqual(view.schedule.pending.map((p) => [p.lang_code, p.name]), [['en', 'Ola Nowak']], 'karta: czeka na potwierdzenie');

  // Akceptacja z linku w mailu (respondToAssignments zwraca wiersze do synchronizacji).
  const res = await respondToAssignments(db, { action: 'accept', whereSql: 'token = $2', params: [ola.token] });
  assert.equal(res.rows[0].team_type, 'tlumaczenia');
  const sum = await reconcileInterpretersFromSchedule(ctx, ev);
  assert.equal(sum.session_created, true);
  assert.deepEqual((await channelsOfEvent(ev)).map((c) => [c.lang_code, c.label, c.source]), [['en', 'English', 'schedule']]);
  assert.deepEqual(await interpretersOfEvent(ev), [{ lang_code: 'en', email: 'ola@x.pl', source: 'schedule' }]);
  view = await getSession(ctx, boss, { event_id: ev });
  assert.deepEqual(view.session.channels[0].interpreters.map((i) => [i.email, i.source]), [['ola@x.pl', 'schedule']]);
  assert.equal(view.session.channels[0].from_schedule, true);
  assert.equal(view.schedule.pending.length, 0);
  // Idempotentnie.
  const again = await reconcileInterpretersFromSchedule(ctx, ev);
  assert.equal(again.added + again.removed + again.channels_added + again.channels_removed, 0);

  // Odrzucenie (np. później w aplikacji: status rejected) — zdjęta, pusty kanał z grafiku znika.
  await db.query(`UPDATE schedule_assignments SET status = 'rejected' WHERE id = $1`, [ola.id]);
  const after = await reconcileInterpretersFromSchedule(ctx, ev);
  assert.equal(after.removed, 1);
  assert.equal(after.channels_removed, 1);
  assert.deepEqual(await channelsOfEvent(ev), []);
});

test('sync: ręczni tłumacze zostają, karta nie zdejmuje tłumaczy z grafiku ani ich kanału', { skip: skipDb }, async () => {
  const { ctx } = harness();
  const boss = U('boss', 1);
  const ev = await newEvent('Konferencja');
  await upsertSession(ctx, boss, { event_id: ev, channels: [{ lang_code: 'en', interpreters: ['ewa@x.pl'] }] });
  const ola = await assign(ev, 'en', 'Ola Nowak', 'ola@x.pl', 'accepted');
  await assign(ev, 'uk', 'Jan Kowalski', 'jan@x.pl', 'accepted');
  await reconcileInterpretersFromSchedule(ctx, ev);
  assert.deepEqual(await interpretersOfEvent(ev), [
    { lang_code: 'en', email: 'ewa@x.pl', source: 'manual' },
    { lang_code: 'en', email: 'ola@x.pl', source: 'schedule' },
    { lang_code: 'uk', email: 'jan@x.pl', source: 'schedule' },
  ]);
  // Zarządzający zapisuje listę bez tłumaczy z grafiku i bez kanału uk (stara/obecna karta):
  // grafikowi zostają, kanał uk z tłumaczem z grafiku też.
  const v = await getSession(ctx, boss, { event_id: ev });
  const en = v.session.channels.find((c) => c.lang_code === 'en');
  await upsertSession(ctx, boss, { event_id: ev, channels: [{ id: en.id, lang_code: 'en', label: 'English', interpreters: [] }] });
  assert.deepEqual(await interpretersOfEvent(ev), [
    { lang_code: 'en', email: 'ola@x.pl', source: 'schedule' },
    { lang_code: 'uk', email: 'jan@x.pl', source: 'schedule' },
  ]);
  // Ręczny ponownie + odrzucenie grafiku: ręczny zostaje, kanał zostaje (ma ręcznego).
  await upsertSession(ctx, boss, { event_id: ev, channels: [{ id: en.id, lang_code: 'en', label: 'English', interpreters: ['ewa@x.pl', 'ola@x.pl'] }] });
  assert.equal((await interpretersOfEvent(ev)).find((r) => r.email === 'ola@x.pl').source, 'schedule', 'odesłany z karty nie staje się ręczny');
  await db.query(`DELETE FROM schedule_assignments WHERE id = $1`, [ola.id]);
  await reconcileInterpretersFromSchedule(ctx, ev);
  assert.deepEqual((await interpretersOfEvent(ev)).filter((r) => r.lang_code === 'en'), [{ lang_code: 'en', email: 'ewa@x.pl', source: 'manual' }]);
  assert.ok((await channelsOfEvent(ev)).some((c) => c.lang_code === 'en'));
});

test('sync: kanał na żywo nietknięty (aktywny tłumacz zostaje); bez konta — pominięty i widoczny w karcie', { skip: skipDb }, async () => {
  const { ctx, livekit } = harness();
  const boss = U('boss', 1);
  const ev = await newEvent('Na żywo');
  const olek = await assign(ev, 'ru', 'Olek Live', 'olek@x.pl', 'accepted');
  await assign(ev, 'uk', 'Gość Bez Konta', 'nikt@x.pl', 'accepted');
  await assign(ev, 'en', 'Stary', 'stary@x.pl', 'accepted'); // nieaktywne konto
  await reconcileInterpretersFromSchedule(ctx, ev);
  const chans = await channelsOfEvent(ev);
  assert.deepEqual(chans.map((c) => c.lang_code), ['ru'], 'tylko z aktywnym kontem');
  const view = await getSession(ctx, boss, { event_id: ev });
  assert.deepEqual(view.schedule.no_account.map((p) => [p.lang_code, p.name]).sort(), [['en', 'Stary'], ['uk', 'Gość Bez Konta']]);

  // Kanał nadaje, sesja na żywo — odmowa nie zdejmuje nadającego ani nie usuwa kanału.
  await db.query(`UPDATE interpretation_channels SET status = 'live', active_interpreter_email = 'olek@x.pl' WHERE id = $1`, [chans[0].id]);
  await db.query(`UPDATE interpretation_sessions SET status = 'live' WHERE event_id = $1`, [ev]);
  await db.query(`UPDATE schedule_assignments SET status = 'rejected' WHERE id = $1`, [olek.id]);
  const s = await reconcileInterpretersFromSchedule(ctx, ev);
  assert.equal(s.removed, 0);
  assert.equal(s.channels_removed, 0);
  assert.deepEqual(await interpretersOfEvent(ev), [{ lang_code: 'ru', email: 'olek@x.pl', source: 'schedule' }]);
  assert.equal(livekit.deleted.length, 0);
  // Po zakończeniu nadawania kolejne uzgodnienie sprząta.
  await db.query(`UPDATE interpretation_channels SET status = 'idle', active_interpreter_email = NULL WHERE id = $1`, [chans[0].id]);
  await db.query(`UPDATE interpretation_sessions SET status = 'idle' WHERE event_id = $1`, [ev]);
  const [{ room_name: room }] = await q1(`SELECT room_name FROM interpretation_channels WHERE id = $1`, [chans[0].id]);
  const done = await reconcileInterpretersFromSchedule(ctx, ev);
  assert.equal(done.removed, 1);
  assert.equal(done.channels_removed, 1);
  assert.ok(livekit.deleted.includes(room), 'pokój usuniętego kanału zamknięty');
});

test('hak /api/db: odczyt przed usunięciem wskazuje wydarzenie; worker uzgadnia nadchodzące', { skip: skipDb }, async () => {
  const { ctx } = harness();
  const ev = await newEvent('Worker', soon(3));
  const far = await newEvent('Daleko', soon(40));
  const a = await assign(ev, 'en', 'Ola Nowak', 'ola@x.pl', 'accepted');
  await assign(far, 'en', 'Ola Nowak', 'ola@x.pl', 'accepted');
  const prep = await prepareScheduleSync(db, { table: 'schedule_assignments', op: 'delete', filters: [{ type: 'eq', column: 'id', value: a.id }] });
  assert.deepEqual(prep, [ev]);
  assert.equal(await prepareScheduleSync(db, { table: 'schedule_assignments', op: 'insert', filters: [] }), null);
  const ids = await upcomingEventIds(db);
  assert.ok(ids.includes(ev) && !ids.includes(far), 'tylko okno 14 dni');
  const res = await reconcileUpcoming(ctx, { force: true });
  assert.ok(res.some((r) => r.event_id === ev && r.added === 1));
  assert.equal(await reconcileUpcoming(ctx), null, 'co 10 min — drugie wywołanie od razu pomija');
});

test('uprawnienie z przynależności: lider służby Tłumaczeń (rola członek) zarządza tłumaczeniem', { skip: skipDb }, async () => {
  const { ctx } = harness();
  const [u] = await q1(`SELECT id FROM app_users WHERE email = 'lider@x.pl'`);
  assert.equal(await canManageInterpretation(ctx, 'lider@x.pl'), false);
  await db.query(`INSERT INTO ministry_memberships (user_id, ministry_key, role) VALUES ($1, 'tlumaczenia', 'leader')`, [String(u.id)]);
  const fresh = harness().ctx; // nowy dbName — bez cache grantów
  assert.equal(await canManageInterpretation(fresh, 'lider@x.pl'), true);
  const ev = await newEvent('Lider');
  const v = await upsertSession(fresh, { id: u.id, email: 'lider@x.pl' }, { event_id: ev, enable: true });
  assert.equal(v.can_manage, true);
  await db.query(`UPDATE ministry_memberships SET role = 'member' WHERE user_id = $1`, [String(u.id)]);
  assert.equal(await canManageInterpretation(harness().ctx, 'lider@x.pl'), false, 'członek służby — nie');
});

// ── Karta ↔ moduł Tłumaczenia (spójność) ────────────────────────────────────
test('moduł → karta: języki ze Służb (kolejność, bez kodu osobno), wybór tłumacza jak w Grafiku', () => {
  const { languages, unmapped } = languagesFromRoles([
    { id: 'r1', name: 'Tłumacz EN', field_key: 'en' }, { id: 'r2', name: 'Tłumacz UK', field_key: 'uk' },
    { id: 'r3', name: 'Koordynator', field_key: 'koordynator' }, { id: 'r4', name: 'Tłumacz EN (zapas)', field_key: 'en' },
  ]);
  assert.deepEqual(languages.map((l) => [l.lang_code, l.role_name, l.label]), [['en', 'Tłumacz EN', 'English'], ['uk', 'Tłumacz UK', 'Українська']]);
  assert.deepEqual(unmapped, ['Koordynator']);
  const team = {
    available: true,
    members: [
      { id: '1', name: 'Ola', email: 'ola@x.pl', active: true, langs: ['en'] },
      { id: '2', name: 'Ewa', email: 'ewa@x.pl', active: true, langs: [] },
      { id: '3', name: 'Stary', email: 'stary@x.pl', active: false, langs: ['en'] },
      { id: '4', name: 'Bez Konta', email: null, active: true, langs: ['en'] },
    ],
    holders: new Map([['en', 3]]),
  };
  assert.deepEqual(candidatesFor(team, 'en').map((m) => m.id), ['1', '4'], 'ze Służbą EN, bez nieaktywnych');
  assert.deepEqual(candidatesFor(team, 'uk').map((m) => m.id), ['1', '2', '4'], 'nikt nie ma Służby UK → cały aktywny zespół');
  assert.equal(eligibilityError(team, 'ola@x.pl', 'en'), null);
  assert.equal(eligibilityError(team, 'ewa@x.pl', 'en', 'Tłumacz EN').code, 'NO_LANGUAGE_ROLE');
  assert.match(eligibilityError(team, 'ewa@x.pl', 'en', 'Tłumacz EN').message, /Tłumacz EN/);
  assert.equal(eligibilityError(team, 'stary@x.pl', 'en').code, 'INACTIVE_MEMBER');
  assert.equal(eligibilityError(team, 'obcy@x.pl', 'en').code, 'NOT_IN_TEAM');
  assert.equal(interpreterWarning(team, 'ola@x.pl', 'en'), null);
  assert.equal(interpreterWarning(team, 'ewa@x.pl', 'en'), 'no_role');
  assert.equal(interpreterWarning(team, 'stary@x.pl', 'en'), 'inactive');
  assert.equal(interpreterWarning(team, 'obcy@x.pl', 'en'), 'not_in_team');
  assert.equal(interpreterWarning({ available: false }, 'obcy@x.pl', 'en'), null);
});

test('karta ↔ moduł: zapis tylko języków i osób z modułu; stare kanały/osoby zostają z ostrzeżeniem', { skip: skipDb }, async () => {
  const { ctx } = harness();
  const boss = U('boss', 1);
  const day = soon(5);
  const ev = await newEvent('Spójność', day);
  let v = await getSession(ctx, boss, { event_id: ev });
  assert.deepEqual(v.module.languages.map((l) => l.role_name), ['Tłumacz EN', 'Tłumacz UK', 'Tłumacz RU']);
  assert.equal(v.module.path, '/tlumaczenia');
  assert.deepEqual(v.team.map((m) => m.name).sort(), ['Ewa Ręczna', 'Jan Kowalski', 'Ola Nowak', 'Olek Live']);
  assert.deepEqual(v.presets.map((p) => p.label), ['English', 'Українська', 'Русский'], 'starsza karta: tylko języki modułu');
  assert.ok(!v.people.some((p) => p.email === 'boss@x.pl'), 'starsza karta: tylko zespół');

  await assert.rejects(upsertSession(ctx, boss, { event_id: ev, channels: [{ lang_code: 'de' }] }),
    (e) => e.status === 400 && e.code === 'LANG_NOT_IN_MODULE' && /Tłumaczenia → Służby/.test(e.message));
  await assert.rejects(upsertSession(ctx, boss, { event_id: ev, channels: [{ lang_code: 'en', interpreters: ['boss@x.pl'] }] }),
    (e) => e.status === 400 && e.code === 'NOT_IN_TEAM');
  // Służba EN tylko u Oli → Ewa nie może tłumaczyć EN; UK (nikt nie ma Służby) — cały zespół.
  const [en] = await q1(`SELECT id FROM team_roles WHERE team_type = 'tlumaczenia' AND field_key = 'en'`);
  const [olaRow] = await q1(`SELECT id FROM custom_tlumaczenia_members WHERE email = 'ola@x.pl'`);
  await db.query(`INSERT INTO team_member_roles (member_id, member_table, role_id) VALUES ($1, 'custom_tlumaczenia_members', $2)`, [String(olaRow.id), en.id]);
  await assert.rejects(upsertSession(ctx, boss, { event_id: ev, channels: [{ lang_code: 'en', interpreters: ['ewa@x.pl'] }] }),
    (e) => e.status === 400 && e.code === 'NO_LANGUAGE_ROLE');
  v = await upsertSession(ctx, boss, { event_id: ev, channels: [{ lang_code: 'en', label: 'Angielski!', interpreters: ['ola@x.pl'] }, { lang_code: 'uk', interpreters: ['ewa@x.pl'] }] });
  assert.deepEqual(v.session.channels.map((c) => [c.lang_code, c.label, c.role_name, c.in_module]),
    [['en', 'English', 'Tłumacz EN', true], ['uk', 'Українська', 'Tłumacz UK', true]]);
  assert.deepEqual(v.team.find((m) => m.name === 'Ola Nowak').langs, ['en']);
  assert.deepEqual(v.team.find((m) => m.name === 'Ewa Ręczna').eligible, ['uk', 'ru'], 'bez Służby EN — EN nie');
  assert.deepEqual(v.module.languages.map((l) => [l.lang_code, l.whole_team]), [['en', false], ['uk', true], ['ru', true]]);

  // Kanał i tłumacz sprzed modułu (np. fr + konto spoza zespołu): widoczne z ostrzeżeniem, zapis ich nie odrzuca.
  const [sess] = await q1(`SELECT id FROM interpretation_sessions WHERE event_id = $1`, [ev]);
  const [fr] = await q1(`INSERT INTO interpretation_channels (id, session_id, lang_code, label, sort, room_name)
    VALUES (gen_random_uuid(), $1, 'fr', 'Français', 5, 'avi_kosciol_fr') RETURNING id`, [sess.id]);
  await db.query(`INSERT INTO interpretation_interpreters (channel_id, user_email) VALUES ($1, 'boss@x.pl')`, [fr.id]);
  v = await getSession(ctx, boss, { event_id: ev });
  const frView = v.session.channels.find((c) => c.lang_code === 'fr');
  assert.deepEqual([frView.in_module, frView.role_name, frView.interpreters[0].warning], [false, null, 'not_in_team']);
  const list = v.session.channels.map((c) => ({ id: c.id, lang_code: c.lang_code, label: c.label, interpreters: c.interpreters.map((i) => i.email) }));
  v = await upsertSession(ctx, boss, { event_id: ev, channels: list });
  assert.deepEqual(v.session.channels.map((c) => c.lang_code), ['en', 'uk', 'fr'], 'stary kanał zostaje');
  list[2].interpreters = [];
  await upsertSession(ctx, boss, { event_id: ev, channels: list });
  list[2].interpreters = ['boss@x.pl'];
  await assert.rejects(upsertSession(ctx, boss, { event_id: ev, channels: list }), (e) => e.code === 'NOT_IN_TEAM', 'ponownie — już nie');

  // Ola „Nieaktywna” w składzie: zostaje w kanale (nie zdejmujemy po cichu), z ostrzeżeniem.
  await db.query(`UPDATE custom_tlumaczenia_members SET status = 'Nieaktywny' WHERE id = $1`, [olaRow.id]);
  v = await getSession(ctx, boss, { event_id: ev });
  assert.equal(v.session.channels[0].interpreters[0].warning, 'inactive');
  assert.ok(!v.team.some((m) => m.name === 'Ola Nowak'), 'nieaktywni poza listą wyboru');
  list[2].interpreters = [];
  await upsertSession(ctx, boss, { event_id: ev, channels: list });
  assert.ok((await interpretersOfEvent(ev)).some((r) => r.email === 'ola@x.pl'));
  await db.query(`UPDATE custom_tlumaczenia_members SET status = 'Aktywny' WHERE id = $1`, [olaRow.id]);

  // Nieobecności w dniu wydarzenia: zgłoszona (Dostępność) i wpisana w kolumnie „Nieobecni” grafiku.
  await db.query(`INSERT INTO members (email, full_name, first_name, last_name) VALUES ('ewa@x.pl', 'Ewa Ręczna', 'Ewa', 'Ręczna')`);
  const [m] = await q1(`SELECT id FROM members WHERE email = 'ewa@x.pl'`);
  await db.query(`INSERT INTO volunteer_blockouts (member_id, start_date, end_date) VALUES ($1, $2, $2)`, [m.id, day]);
  await db.query(`UPDATE events SET assignments = '{"tlumaczenia":{"absencja":"Jan Kowalski"}}'::jsonb WHERE id = $1`, [Number(ev)]);
  v = await getSession(ctx, boss, { event_id: ev });
  assert.deepEqual(v.team.find((x) => x.name === 'Ewa Ręczna').absent, { from: day, to: day });
  assert.deepEqual(v.team.find((x) => x.name === 'Jan Kowalski').absent, { manual: true });
  assert.deepEqual(v.session.channels[1].interpreters[0].absent, { from: day, to: day }, 'przypisana mimo nieobecności — widać w karcie');

  // Członek zespołu (nie tłumacz, nie lider): podgląd tłumaczy, bez edycji i bez linku.
  const jan = await getSession(ctx, U('jan', 4), { event_id: ev });
  assert.equal(jan.can_manage, false);
  assert.ok(Array.isArray(jan.session.channels[0].interpreters));
  assert.equal(jan.team, undefined);
  assert.equal(jan.session.public_token, undefined);
  await assert.rejects(upsertSession(ctx, U('jan', 4), { event_id: ev, enable: true }), (e) => e.status === 403 && /lider służby Tłumaczenia/.test(e.message));
});
