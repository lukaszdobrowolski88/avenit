// Powiadomienia tłumaczy dodanych / zdjętych ręcznie w karcie „Tłumaczenie na żywo”
// (src/interpretation/notify.js) i stan kont osób ze składu Tłumaczeń (team.js rosterAccounts).
//
// PGlite: testy bazy pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test packages/api/test/interpretation-notify.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { upsertSession, getSession } from '../src/interpretation/service.js';
import { reconcileInterpretersFromSchedule } from '../src/interpretation/scheduleSync.js';
import {
  diffInterpreters, eventPast, emptySnapshot, notificationEntry, emailHtml, emailText, consolePath, appEventLink,
} from '../src/interpretation/notify.js';
import { rosterAccounts, accountState } from '../src/interpretation/team.js';
import { utcToZoned } from '../src/meetings/logic.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';
const log = { error() {}, warn() {}, info() {} };
const U = (name, id) => ({ id: id ?? name, email: `${name}@x.pl` });
const DAY = 86_400_000;
const snap = (manual = [], schedule = []) => ({ manual: new Set(manual), all: new Set([...manual, ...schedule]) });

// ── Reguły czyste ───────────────────────────────────────────────────────────
test('różnica: dodani, zdjęci, bez zmian, bez siebie, bez zaproszonych z grafiku', () => {
  assert.deepEqual(diffInterpreters(emptySnapshot(), snap(['en|ola@x.pl', 'en|boss@x.pl']), { actor: 'Boss@x.pl' }),
    [{ email: 'ola@x.pl', kind: 'added', langs: ['en'] }]);
  assert.deepEqual(diffInterpreters(snap(['en|ola@x.pl']), snap(['en|ola@x.pl'])), [], 'zapis bez zmian');
  assert.deepEqual(diffInterpreters(snap(['en|ola@x.pl']), emptySnapshot()), [{ email: 'ola@x.pl', kind: 'removed', langs: ['en'] }]);
  // Zmiana języka: jedno zaproszenie (nowy język), bez osobnego „nie tłumaczysz już”.
  assert.deepEqual(diffInterpreters(snap(['en|ola@x.pl']), snap(['de|ola@x.pl'])), [{ email: 'ola@x.pl', kind: 'added', langs: ['de'] }]);
  // Z grafiku (źródło schedule) — ani dodanie, ani „zdjęcie”, gdy przeszedł z ręcznego do grafiku.
  assert.deepEqual(diffInterpreters(emptySnapshot(), snap([], ['en|jan@x.pl'])), []);
  assert.deepEqual(diffInterpreters(snap(['en|jan@x.pl']), snap([], ['en|jan@x.pl'])), []);
  assert.deepEqual(diffInterpreters(emptySnapshot(), snap(['en|jan@x.pl']), { skipAdded: new Set(['jan@x.pl']) }), []);
});

test('wydarzenie minione: dzień końca przed dziś (Europe/Warsaw)', () => {
  const now = Date.parse('2026-10-21T10:00:00Z');
  assert.equal(eventPast({ date: '2026-10-20' }, now), true);
  assert.equal(eventPast({ date: '2026-10-21' }, now), false);
  assert.equal(eventPast({ date: '2026-10-19', end_date: '2026-10-22' }, now), false);
  assert.equal(eventPast({}, now), false);
});

test('treści: link konsoli na webie, ekran wydarzenia w aplikacji; e-mail z kościołem, rolą i przyciskami', () => {
  const ev = { id: '42', title: 'Nabożeństwo', date: '2026-10-25', time: '10:00:00' };
  const added = notificationEntry({ email: 'ola@x.pl', kind: 'added', roles: ['Tłumacz EN'], ev, short: 'niedz., 25.10' });
  assert.equal(added.link, consolePath(42));
  assert.equal(added.link, '/tlumaczenie/konsola/42');
  assert.equal(added.data.app_link, appEventLink(42));
  assert.equal(added.data.app_link, '/events/42');
  assert.match(added.title, /Tłumacz EN/);
  const removed = notificationEntry({ email: 'ola@x.pl', kind: 'removed', roles: ['Tłumacz EN'], ev, short: 'niedz., 25.10' });
  assert.equal(removed.link, '/wydarzenie/42');
  assert.match(removed.title, /^Nie tłumaczysz już/);
  const args = { kind: 'added', byName: 'Pastor <b>', roles: ['Tłumacz EN'], title: 'Nabożeństwo', when: 'niedziela, 25 października 2026, godz. 10:00', place: 'Sala', church: 'Kościół Testowy', consoleUrl: 'https://k.avenit.pl/tlumaczenie/konsola/42', eventUrl: 'https://k.avenit.pl/wydarzenie/42' };
  const html = emailHtml(args);
  assert.ok(html.includes('Kościół Testowy') && html.includes('Tłumacz EN') && html.includes(args.consoleUrl) && html.includes(args.eventUrl));
  assert.ok(html.includes('Otwórz konsolę tłumacza'));
  assert.ok(!html.includes('<b>'), 'imię escapowane');
  assert.ok(emailText(args).includes(args.consoleUrl));
  const rm = emailHtml({ ...args, kind: 'removed' });
  assert.ok(!rm.includes(args.consoleUrl), 'zdjęty — bez konsoli');
  assert.equal(accountState({ activeEmail: 'a@x.pl' }), 'active');
  assert.equal(accountState({ activeEmail: null, anyAccount: true }), 'inactive');
  assert.equal(accountState({ activeEmail: null, anyAccount: false }), 'none');
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
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
function fakeLivekit() {
  return {
    enabled: true, settings: { url: 'wss://rtc.test' },
    async mintToken(o) { return `tok:${o.identity}`; }, async createRoom() { return true; },
    async deleteRoom() { return true; }, async listParticipants() { return []; },
    async mutePublishedTrack() { return true; }, async updateRoomMetadata() { return true; },
  };
}
function harness({ failEmail = false } = {}) {
  const mails = [];
  const notes = [];
  const ctx = {
    db, tenantSlug: 'kosciol', log,
    tenant: { name: 'K', slug: 'kosciol', subdomain: 'kosciol', dbName: `t_${Math.random()}` },
    deps: {
      livekit: fakeLivekit(), inline: true,
      async sendEmail(m) { if (failEmail) throw new Error('smtp'); mails.push(m); },
      async deliver(o) { notes.push(...o.entries); return { sent: o.entries.length, entries: o.entries }; },
    },
  };
  return { ctx, mails, notes };
}
const day = (d) => utcToZoned(Date.now() + d * DAY).date;
async function newEvent(title = 'Nabożeństwo', date = day(3)) {
  const [row] = await q1(`INSERT INTO events (title, date, time, end_time, location) VALUES ($1, $2, '10:00', '12:00', 'Sala główna') RETURNING id`, [title, date]);
  return String(row.id);
}
const boss = U('boss', 1);

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, member_id int, avatar_url text, campus_id int, status text DEFAULT 'active');
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE permission_grants (role text, user_id text, capability text, allowed boolean);
    CREATE TABLE ministry_memberships (id serial PRIMARY KEY, user_id text, ministry_key text, role text);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE members (id serial PRIMARY KEY, email text, full_name text, first_name text, last_name text, birth_date date, household_id int,
      home_group_id int, ministries jsonb DEFAULT '[]', tags jsonb DEFAULT '[]');
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
    CREATE TABLE volunteer_blockouts (id serial PRIMARY KEY, member_id int, start_date date, end_date date, reason text);
  `);
  await db.query(`INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('czlonek', false)`);
  await db.query(`INSERT INTO permission_grants (role, capability, allowed) VALUES ('czlonek', 'module:calendar', true), ('czlonek', 'res:events:read', true)`);
  await db.query(`INSERT INTO app_users (email, full_name, role, is_super_admin, is_active) VALUES
    ('boss@x.pl', 'Pastor', 'superadmin', true, true), ('ola@x.pl', 'Ola Nowak', 'czlonek', false, true),
    ('ewa@x.pl', 'Ewa Ręczna', 'czlonek', false, true), ('jan@x.pl', 'Jan Kowalski', 'czlonek', false, true),
    ('zablok@x.pl', 'Zablokowana Osoba', 'czlonek', false, false)`);
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('org_name', '"Kościół Testowy"')`);
  await pg.exec(fs.readFileSync(new URL('../db/tenant-migrations/116_interpretation.sql', import.meta.url), 'utf8'));
  await pg.exec(fs.readFileSync(new URL('../db/tenant-migrations/117_tlumaczenia_module.sql', import.meta.url), 'utf8'));
  await db.query(`INSERT INTO team_roles (team_type, name, field_key, display_order) VALUES ('tlumaczenia', 'Tłumacz DE', 'de', 4)`);
  await db.query(`INSERT INTO custom_tlumaczenia_members (full_name, email, status) VALUES
    ('Pastor', 'boss@x.pl', 'Aktywny'), ('Ola Nowak', 'ola@x.pl', 'Aktywny'), ('Ewa Ręczna', 'ewa@x.pl', 'Aktywny'),
    ('Jan Kowalski', 'jan@x.pl', 'Aktywny'), ('Nowy Bez Konta', 'nowy@x.pl', 'Aktywny'), ('Zablokowana Osoba', 'zablok@x.pl', 'Aktywny')`);
});

test('dodany ręcznie: e-mail + powiadomienie raz; zapis bez zmian — nic; zdjęty — krótka informacja', { skip: skipDb }, async () => {
  const { ctx, mails, notes } = harness();
  const ev = await newEvent('Nabożeństwo niedzielne');
  await upsertSession(ctx, boss, { event_id: ev, channels: [{ lang_code: 'en', interpreters: ['ola@x.pl', 'boss@x.pl'] }] });
  assert.deepEqual(mails.map((m) => m.to), ['ola@x.pl'], 'bez powiadomienia o sobie');
  const m = mails[0];
  assert.match(m.subject, /^Tłumaczenie na żywo: Tłumacz EN — Nabożeństwo niedzielne/);
  assert.equal(m.fromName, 'Kościół Testowy');
  assert.equal(m.replyTo, 'boss@x.pl');
  assert.ok(m.html.includes(`http://kosciol.`) || m.html.includes(`https://kosciol.`));
  assert.ok(m.html.includes(`/tlumaczenie/konsola/${ev}`) && m.html.includes(`/wydarzenie/${ev}`));
  assert.ok(m.html.includes('Sala główna') && m.html.includes('Pastor') && m.html.includes('godz. 10:00–12:00'));
  assert.deepEqual(notes.map((n) => [n.user_email, n.type, n.link, n.data.app_link]), [['ola@x.pl', 'event', `/tlumaczenie/konsola/${ev}`, `/events/${ev}`]]);

  // Ten sam zapis jeszcze raz (np. drugi klik „Zapisz”) i zmiana innych pól — nic nowego.
  const view = await getSession(ctx, boss, { event_id: ev });
  const en = view.session.channels[0];
  await upsertSession(ctx, boss, { event_id: ev, channels: [{ id: en.id, lang_code: 'en', interpreters: ['boss@x.pl', 'ola@x.pl'] }] });
  await upsertSession(ctx, boss, { event_id: ev, original_enabled: true });
  assert.equal(mails.length, 1);
  assert.equal(notes.length, 1);

  // Dodanie drugiej osoby: tylko ona. Zdjęcie Oli: „Nie tłumaczysz już”.
  await upsertSession(ctx, boss, { event_id: ev, channels: [{ id: en.id, lang_code: 'en', interpreters: ['boss@x.pl', 'ewa@x.pl'] }] });
  assert.deepEqual(mails.slice(1).map((x) => [x.to, x.subject.split(':')[0]]), [['ewa@x.pl', 'Tłumaczenie na żywo'], ['ola@x.pl', 'Nie tłumaczysz już']]);
  const rm = notes.find((n) => n.user_email === 'ola@x.pl' && /^Nie tłumaczysz/.test(n.title));
  assert.equal(rm.link, `/wydarzenie/${ev}`);
  assert.ok(!mails[2].html.includes('/tlumaczenie/konsola/'), 'zdjęty — bez linku do konsoli');

  // Usunięcie całego tłumaczenia: zdjęta Ewa (ja — nie).
  await upsertSession(ctx, boss, { event_id: ev, remove: true });
  assert.deepEqual(mails.slice(3).map((x) => x.to), ['ewa@x.pl']);
  assert.match(mails[3].subject, /^Nie tłumaczysz już/);
});

test('grafik: tłumacze z grafiku i zaproszeni w grafiku nie dostają drugiego powiadomienia', { skip: skipDb }, async () => {
  const { ctx, mails, notes } = harness();
  const ev = await newEvent('Konferencja');
  // Jan potwierdził w grafiku → kanał z synchronizacji (bez powiadomień z karty).
  await q1(`INSERT INTO schedule_assignments (event_id, team_type, role_key, assigned_name, assigned_email, status)
    VALUES ($1, 'tlumaczenia', 'en', 'Jan Kowalski', 'jan@x.pl', 'accepted')`, [Number(ev)]);
  // Ewa ma oczekujące zaproszenie z grafiku (na uk).
  await q1(`INSERT INTO schedule_assignments (event_id, team_type, role_key, assigned_name, assigned_email, status)
    VALUES ($1, 'tlumaczenia', 'uk', 'Ewa Ręczna', 'ewa@x.pl', 'pending')`, [Number(ev)]);
  await reconcileInterpretersFromSchedule(ctx, ev);
  assert.equal(mails.length + notes.length, 0, 'synchronizacja grafiku nie wysyła');
  const view = await getSession(ctx, boss, { event_id: ev });
  const en = view.session.channels.find((c) => c.lang_code === 'en');
  // Karta odsyła tłumacza z grafiku (pomijany) i dodaje ręcznie Ewę (zaproszoną w grafiku) i Olę.
  await upsertSession(ctx, boss, { event_id: ev, channels: [{ id: en.id, lang_code: 'en', interpreters: ['jan@x.pl', 'ewa@x.pl', 'ola@x.pl'] }] });
  assert.deepEqual(mails.map((m) => m.to), ['ola@x.pl']);
  assert.deepEqual(notes.map((n) => n.user_email), ['ola@x.pl']);
  // Zdjęcie z grafiku (synchronizacja) — bez „Nie tłumaczysz już” z tej ścieżki.
  await q1(`DELETE FROM schedule_assignments WHERE event_id = $1 AND assigned_email = 'jan@x.pl'`, [Number(ev)]);
  await reconcileInterpretersFromSchedule(ctx, ev);
  assert.equal(mails.length, 1);
});

test('minione wydarzenie i nieudany e-mail: bez wysyłki / zapis przechodzi, dzwonek dalej', { skip: skipDb }, async () => {
  const past = harness();
  const old = await newEvent('Wczoraj', day(-2));
  await upsertSession(past.ctx, boss, { event_id: old, channels: [{ lang_code: 'en', interpreters: ['ola@x.pl'] }] });
  assert.equal(past.mails.length + past.notes.length, 0);

  const bad = harness({ failEmail: true });
  const ev = await newEvent('Awaria poczty');
  const v = await upsertSession(bad.ctx, boss, { event_id: ev, channels: [{ lang_code: 'de', interpreters: ['ola@x.pl'] }] });
  assert.deepEqual(v.session.channels[0].interpreters.map((i) => i.email), ['ola@x.pl'], 'zapis nie zależy od poczty');
  assert.deepEqual(bad.notes.map((n) => [n.user_email, n.title]), [['ola@x.pl', 'Tłumaczysz na żywo: Tłumacz DE']]);
});

test('skład Tłumaczeń: aktywne konto / konto wyłączone / brak konta', { skip: skipDb }, async () => {
  const out = await rosterAccounts(db);
  assert.equal(out.available, true);
  const names = new Map((await q1(`SELECT id::text AS id, full_name FROM custom_tlumaczenia_members`)).map((r) => [r.id, r.full_name]));
  const byName = Object.fromEntries(out.members.map((m) => [names.get(m.id), m.account]));
  assert.deepEqual(byName, {
    Pastor: 'active', 'Ola Nowak': 'active', 'Ewa Ręczna': 'active', 'Jan Kowalski': 'active',
    'Nowy Bez Konta': 'none', 'Zablokowana Osoba': 'inactive',
  });
  assert.ok(!JSON.stringify(out).includes('@'), 'bez e-maili');
});
