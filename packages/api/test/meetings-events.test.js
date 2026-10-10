// Wydarzenia stacjonarne / online / hybrydowe (migracja 099, src/meetings/events.js): spotkanie
// zakładane i uzgadniane po zapisie wydarzenia, dołączanie wg widoczności wydarzenia, zapisy →
// zaproszenia (konto / gość e-mailem), spotkanie z Komunikatora z odbiciem w kalendarzu.
//
// PGlite: testy bazy pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test packages/api/test/meetings-events.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../src/meetings/logic.js';
import { createMeeting, updateMeeting, cancelMeeting, getMeeting } from '../src/meetings/service.js';
import { syncEventMeeting, syncEventsAfterWrite, syncRegistrationsAfterWrite, eventMeeting, eventMeetingGuests, sweepOrphanEventMeetings } from '../src/meetings/events.js';
import { eventVisibilityClause } from '../src/dataapi/querybuilder.js';
import { loadVisibilityContext } from '../src/dataapi/eventVisibility.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const log = { error() {}, warn() {}, info() {} };
const U = (name) => ({ id: name, email: `${name}@x.pl` });
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
const future = (days, time = '18:00') => ({ date: M.utcToZoned(Date.now() + days * DAY).date, time });

test('termin wydarzenia w strefie kościoła ↔ UTC (także zmiana czasu)', () => {
  assert.equal(M.zonedToUtc('2026-10-12', '18:30').toISOString(), '2026-10-12T16:30:00.000Z');
  assert.equal(M.zonedToUtc('2026-01-10', '09:00').toISOString(), '2026-01-10T08:00:00.000Z');
  assert.equal(M.zonedToUtc('2026-03-29', '03:00').toISOString(), '2026-03-29T01:00:00.000Z');
  assert.deepEqual(M.utcToZoned('2026-10-12T16:30:00Z'), { date: '2026-10-12', time: '18:30' });
  assert.deepEqual(M.eventTimes({ date: '2026-10-12', time: '18:00', end_time: '19:30' }), { starts_at: '2026-10-12T16:00:00.000Z', ends_at: '2026-10-12T17:30:00.000Z' });
  assert.equal(M.eventTimes({ date: '2026-10-12', time: '18:00', end_time: '17:00' }).ends_at, '2026-10-12T17:00:00.000Z', 'koniec przed początkiem → 1 h');
  assert.equal(M.eventTimes({ date: '2026-10-12' }), null, 'bez godziny — brak spotkania');
  assert.equal(M.plainText('<p>Plan &amp; modlitwa</p><p>a<br>b</p>'), 'Plan & modlitwa\na\nb');
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

function harness() {
  const h = { emitted: [], emails: [], notified: [] };
  h.ctx = {
    db, tenantSlug: 'kosciol', log, tenant: { name: 'Kościół', slug: 'kosciol', subdomain: 'kosciol', dbName: `t_${Math.random()}` },
    deps: {
      livekit: { enabled: true, settings: { url: 'wss://rtc.test' }, async mintToken() { return 'tok'; }, async removeParticipant() {}, async deleteRoom() {}, async roomOccupancy() { return new Map(); } },
      emit: (slug, table, op, rows, opts) => h.emitted.push({ table, op, rows, audience: [...(opts?.audience || [])] }),
      sendPush: async () => ({ status: 200 }),
      notifyMessage: async () => {},
      sendEmail: async (m) => { h.emails.push(m); return { ok: true }; },
      deliver: async ({ entries }) => { h.notified.push(...entries); return { sent: entries.length }; },
      timers: false,
      inline: true,
    },
  };
  return h;
}

async function newEvent(fields) {
  const cols = Object.keys(fields);
  const vals = cols.map((c) => (c === 'visibility_segments' ? JSON.stringify(fields[c]) : fields[c]));
  const [row] = await q1(`INSERT INTO events (${cols.join(', ')}) VALUES (${cols.map((c, i) => (c === 'visibility_segments' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ')}) RETURNING id`, vals);
  return String(row.id);
}

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, member_id int, avatar_url text, campus_id int);
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE permission_grants (role text, user_id text, capability text, allowed boolean);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE members (id serial PRIMARY KEY, email text, birth_date date, household_id int, home_group_id int, ministries jsonb DEFAULT '[]', tags jsonb DEFAULT '[]');
    CREATE TABLE user_blocks (blocker_email text, blocked_email text, created_at timestamptz DEFAULT now());
    CREATE TABLE account_events (id bigserial PRIMARY KEY, email varchar(255), action varchar(40) NOT NULL, actor varchar(255), detail text, created_at timestamptz DEFAULT now());
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text, ministry_key text,
      posting_policy text DEFAULT 'everyone', created_by text, last_message_at timestamptz, last_message_preview text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      user_email text, role text, muted boolean DEFAULT false, muted_until timestamptz, archived boolean DEFAULT false,
      UNIQUE (conversation_id, user_email));
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      sender_email text NOT NULL, content text NOT NULL, message_type text DEFAULT 'text', metadata jsonb DEFAULT '{}'::jsonb,
      mentions jsonb DEFAULT '[]'::jsonb, attachments jsonb DEFAULT '[]', created_at timestamptz DEFAULT now());
    CREATE TABLE events (id serial PRIMARY KEY, title text NOT NULL, description text, date date, time text, end_time text, end_date date,
      location text, link text, module_key text, campus_id int, created_by text, is_archived boolean DEFAULT false, visibility_segments jsonb);
    CREATE TABLE event_registrations (id serial PRIMARY KEY, event_id int REFERENCES events(id) ON DELETE CASCADE, user_email text NOT NULL,
      full_name text, guests_count int DEFAULT 0, note text, status text DEFAULT 'going', created_at timestamptz DEFAULT now(), UNIQUE (event_id, user_email));
    CREATE TABLE rsvp_campaigns (id serial PRIMARY KEY, event_id int);
    CREATE TABLE rsvp_invitations (id serial PRIMARY KEY, campaign_id int, member_id int, email text);
  `);
  await db.query(`INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('czlonek', false), ('gosc', false), ('lider', false)`);
  await db.query(`INSERT INTO permission_grants (role, capability, allowed) VALUES
    ('czlonek', 'module:calendar', true), ('czlonek', 'res:events:read', true),
    ('lider', 'module:calendar', true), ('lider', 'res:events:read', true), ('lider', 'res:events:update', true)`);
  await db.query(`INSERT INTO app_users (email, full_name, role, member_id, is_super_admin) VALUES
    ('jan@x.pl', 'Jan Kowalski', 'czlonek', 1, false), ('ola@x.pl', 'Ola Nowak', 'czlonek', 2, false),
    ('boss@x.pl', 'Pastor', 'superadmin', 3, true), ('bez@x.pl', 'Bez modułu', 'gosc', 4, false), ('obcy@x.pl', 'Obcy', 'czlonek', 5, false),
    ('lider@x.pl', 'Lider', 'lider', 6, false)`);
  await db.query(`INSERT INTO members (id, email, birth_date) VALUES (1, 'jan@x.pl', '1980-01-01'), (2, 'ola@x.pl', '1990-01-01'),
    (3, 'boss@x.pl', '1970-01-01'), (4, 'bez@x.pl', '1970-01-01'), (5, 'obcy@x.pl', '1970-01-01'), (6, 'lider@x.pl', '1970-01-01')`);
  for (const f of ['096_calls.sql', '097_call_guest_links.sql', '098_meetings.sql', '099_event_format.sql']) {
    const sql = fs.readFileSync(new URL(`../db/tenant-migrations/${f}`, import.meta.url), 'utf8');
    await pg.exec(sql);
    await pg.exec(sql); // idempotentna
  }
});

test('wydarzenie online: spotkanie po zapisie (hook), zapisani — konto do czatu, adres bez konta — gość e-mailem', { skip: skipDb }, async () => {
  const h = harness();
  const { date } = future(3);
  const id = await newEvent({ title: 'Kurs Alpha', description: '<p>Spotkanie 1</p>', date, time: '19:00', end_time: '20:30', format: 'online', created_by: 'jan@x.pl' });
  await db.query(`INSERT INTO event_registrations (event_id, user_email, full_name) VALUES ($1, 'ola@x.pl', 'Ola'), ($1, 'anna@gmail.com', 'Anna Kowalska'), ($1, 'reczne:Pan Zenon', 'Pan Zenon')`, [Number(id)]);
  syncEventsAfterWrite(h.ctx, 'update', [{ id }], 'jan@x.pl'); // jak /api/db z select('id') — bez formatu
  await settle(150);
  const [m] = await q1(`SELECT * FROM meetings WHERE event_id = $1`, [id]);
  assert.ok(m, 'spotkanie utworzone');
  assert.deepEqual([m.source, m.title, m.organizer_email, m.description], ['event', 'Kurs Alpha', 'jan@x.pl', 'Spotkanie 1']);
  assert.equal(new Date(m.starts_at).toISOString(), M.zonedToUtc(date, '19:00').toISOString());
  assert.equal(Date.parse(m.ends_at) - Date.parse(m.starts_at), 90 * 60_000);
  const parts = (await q1(`SELECT user_email, role FROM conversation_participants WHERE conversation_id = $1 ORDER BY user_email`, [m.conversation_id]))
    .map((p) => `${p.user_email}:${p.role}`);
  assert.deepEqual(parts, ['jan@x.pl:admin', 'ola@x.pl:member']);
  const inv = (await q1(`SELECT kind, email, response, name FROM meeting_invites WHERE meeting_id = $1 ORDER BY email`, [m.id]));
  assert.deepEqual(inv.map((i) => [i.kind, i.email, i.response]), [['guest', 'anna@gmail.com', 'pending'], ['member', 'jan@x.pl', 'accepted'], ['member', 'ola@x.pl', 'accepted']]);
  assert.equal(inv[0].name, 'Anna Kowalska');
  assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0].to, 'anna@gmail.com');
  assert.match(h.emails[0].html, /\/rozmowa\//);

  // Nowy zapis po utworzeniu spotkania.
  h.emails.length = 0;
  syncRegistrationsAfterWrite(h.ctx, 'insert', [{ event_id: Number(id), user_email: 'piotr@wp.pl', full_name: 'Piotr', status: 'going' }], 'jan@x.pl');
  await settle(150);
  assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0].to, 'piotr@wp.pl');
  // Wypisanie — „nie wezmę udziału”.
  syncRegistrationsAfterWrite(h.ctx, 'delete', [{ event_id: Number(id), user_email: 'ola@x.pl' }], 'ola@x.pl');
  await settle(100);
  assert.equal((await q1(`SELECT response FROM meeting_invites WHERE meeting_id = $1 AND email = 'ola@x.pl'`, [m.id]))[0].response, 'declined');

  // Zmiana terminu wydarzenia → spotkanie, linki i aktualizacja u gości.
  h.emails.length = 0;
  await db.query(`UPDATE events SET time = '20:00', end_time = '21:00' WHERE id::text = $1`, [id]);
  await syncEventMeeting(h.ctx, id, 'jan@x.pl');
  const [m2] = await q1(`SELECT * FROM meetings WHERE id = $1`, [m.id]);
  assert.equal(new Date(m2.starts_at).toISOString(), M.zonedToUtc(date, '20:00').toISOString());
  assert.equal(m2.sequence, 1);
  const subjects = h.emails.map((e) => `${e.to}:${e.subject}`).sort();
  assert.deepEqual(subjects, ['anna@gmail.com:Zmiana spotkania: Kurs Alpha', 'piotr@wp.pl:Zmiana spotkania: Kurs Alpha']);

  // Na stacjonarne → spotkanie odwołane (linki wyłączone, goście dostają odwołanie).
  h.emails.length = 0;
  await db.query(`UPDATE events SET format = 'in_person' WHERE id::text = $1`, [id]);
  assert.deepEqual(await syncEventMeeting(h.ctx, id, 'jan@x.pl'), { status: 'cancelled' });
  assert.equal((await q1(`SELECT status FROM meetings WHERE id = $1`, [m.id]))[0].status, 'cancelled');
  assert.equal((await q1(`SELECT count(*)::int AS n FROM call_guest_links WHERE meeting_id = $1 AND revoked_at IS NULL`, [m.id]))[0].n, 0);
  assert.ok(h.emails.every((e) => e.subject.startsWith('Odwołane')));
  assert.equal((await q1(`SELECT is_archived FROM events WHERE id::text = $1`, [id]))[0].is_archived, false, 'wydarzenie z kalendarza nie znika');

  // Hybrydowe → wznowienie: goście dostają nowe linki.
  h.emails.length = 0;
  await db.query(`UPDATE events SET format = 'hybrid' WHERE id::text = $1`, [id]);
  await syncEventMeeting(h.ctx, id, 'jan@x.pl');
  assert.equal((await q1(`SELECT status FROM meetings WHERE id = $1`, [m.id]))[0].status, 'scheduled');
  assert.deepEqual(h.emails.map((e) => e.to).sort(), ['anna@gmail.com', 'piotr@wp.pl']);
  assert.ok(h.emails.every((e) => e.subject.startsWith('Zaproszenie')));
  assert.equal((await q1(`SELECT count(*)::int AS n FROM call_guest_links WHERE meeting_id = $1 AND revoked_at IS NULL`, [m.id]))[0].n, 2);
});

test('bez godziny — spotkania nie ma (needs_time); usunięcie wydarzenia odwołuje spotkanie', { skip: skipDb }, async () => {
  const h = harness();
  const id = await newEvent({ title: 'Całodniowe', date: future(5).date, format: 'online', created_by: 'jan@x.pl' });
  assert.deepEqual(await syncEventMeeting(h.ctx, id, 'jan@x.pl'), { status: 'needs_time', meeting_id: null });
  await db.query(`UPDATE events SET time = '10:00' WHERE id::text = $1`, [id]);
  const out = await syncEventMeeting(h.ctx, id, 'jan@x.pl');
  assert.equal(out.created, true);
  await db.query(`DELETE FROM events WHERE id::text = $1`, [id]);
  syncEventsAfterWrite(h.ctx, 'delete', [{ id }], 'jan@x.pl');
  await settle(120);
  assert.equal((await q1(`SELECT status FROM meetings WHERE event_id = $1`, [id]))[0].status, 'cancelled');
});

test('„Dołącz” wg widoczności wydarzenia: widzący — do czatu spotkania; spoza segmentu / bez modułu — nie', { skip: skipDb }, async () => {
  const h = harness();
  const { date } = future(2, '18:00');
  const open = await newEvent({ title: 'Modlitwa online', date, time: '18:00', format: 'online', created_by: 'jan@x.pl' });
  const restricted = await newEvent({ title: 'Rada', date, time: '18:00', format: 'online', created_by: 'jan@x.pl', visibility_segments: [{ type: 'member', values: ['1'] }] });
  const st = await eventMeeting(h.ctx, U('ola'), { event_id: open });
  assert.equal(st.status, 'scheduled');
  assert.equal(st.meeting.participant, false);
  assert.equal(st.meeting.conversation_id, null, 'bez dołączenia — bez dostępu do czatu');
  const joined = await eventMeeting(h.ctx, U('ola'), { event_id: open, join: true });
  assert.equal(joined.joined, true);
  assert.equal(joined.meeting.participant, true);
  assert.ok(joined.meeting.conversation_id);
  assert.ok(h.emitted.some((e) => e.table === 'conversation_participants' && e.op === 'insert'));
  // Segment „member 1” — Jan widzi, Ola nie.
  assert.equal((await eventMeeting(h.ctx, U('jan'), { event_id: restricted })).status, 'scheduled');
  await assert.rejects(eventMeeting(h.ctx, U('ola'), { event_id: restricted, join: true }), (e) => e.status === 404);
  // Bez module:calendar — brak dostępu; admin — zawsze.
  await assert.rejects(eventMeeting(h.ctx, U('bez'), { event_id: open }), (e) => e.status === 403);
  assert.equal((await eventMeeting(h.ctx, U('boss'), { event_id: restricted })).status, 'scheduled');
  // Stacjonarne — brak spotkania.
  const plain = await newEvent({ title: 'Nabożeństwo', date, time: '10:00', created_by: 'jan@x.pl' });
  assert.deepEqual(await eventMeeting(h.ctx, U('ola'), { event_id: plain }), { status: 'none' });
});

test('spotkanie z Komunikatora: wydarzenie online w kalendarzu widoczne tylko dla uczestników; zmiany i odwołanie idą do wydarzenia', { skip: skipDb }, async () => {
  const h = harness();
  const starts = new Date(Date.now() + 3 * DAY).toISOString();
  const { meeting } = await createMeeting(h.ctx, U('jan'), { title: 'Rada starszych', starts_at: starts, duration_min: 90, members: ['ola@x.pl'] });
  assert.equal(meeting.source, 'meeting');
  assert.ok(meeting.event_id);
  const [ev] = await q1(`SELECT title, format, date::text AS date, time, end_time, visibility_segments, created_by FROM events WHERE id::text = $1`, [meeting.event_id]);
  const local = M.utcToZoned(starts);
  assert.deepEqual([ev.title, ev.format, ev.date, ev.time, ev.created_by], ['Rada starszych', 'online', local.date, local.time, 'jan@x.pl']);
  assert.deepEqual(ev.visibility_segments, [{ type: 'meeting', label: 'Uczestnicy spotkania' }]);
  // Segment 'meeting': uczestnicy widzą, obcy nie.
  const sees = async (email) => {
    const vis = await loadVisibilityContext(db, { email, role: 'czlonek', member_id: null });
    const params = [meeting.event_id];
    const push = (v) => { params.push(v); return params.length; };
    return (await q1(`SELECT e.id FROM events e WHERE e.id::text = $1 AND ${eventVisibilityClause(vis, 'e', push)}`, params)).length === 1;
  };
  assert.equal(await sees('ola@x.pl'), true);
  assert.equal(await sees('obcy@x.pl'), false);
  // Zmiana w Komunikatorze → wydarzenie.
  const later = new Date(Date.parse(starts) + DAY).toISOString();
  await updateMeeting(h.ctx, U('jan'), { meeting_id: meeting.id, title: 'Rada (przeniesiona)', starts_at: later });
  const [ev2] = await q1(`SELECT title, date::text AS date FROM events WHERE id::text = $1`, [meeting.event_id]);
  assert.deepEqual([ev2.title, ev2.date], ['Rada (przeniesiona)', M.utcToZoned(later).date]);
  // Odwołanie → wydarzenie zarchiwizowane.
  await cancelMeeting(h.ctx, U('jan'), { meeting_id: meeting.id });
  assert.equal((await q1(`SELECT is_archived FROM events WHERE id::text = $1`, [meeting.event_id]))[0].is_archived, true);
});

test('spotkanie wydarzenia: w Komunikatorze bez edycji/odwołania (zmienia się w wydarzeniu)', { skip: skipDb }, async () => {
  const h = harness();
  const id = await newEvent({ title: 'Wieczór uwielbienia', date: future(4).date, time: '19:00', format: 'hybrid', location: 'Sala', created_by: 'jan@x.pl' });
  await syncEventMeeting(h.ctx, id, 'jan@x.pl');
  const [m] = await q1(`SELECT id FROM meetings WHERE event_id = $1`, [id]);
  const view = await getMeeting(h.ctx, U('jan'), { meeting_id: m.id });
  assert.deepEqual([view.meeting.source, view.meeting.event_id], ['event', id]);
  await assert.rejects(updateMeeting(h.ctx, U('jan'), { meeting_id: m.id, title: 'x' }), (e) => e.status === 409 && e.code === 'MEETING_FROM_EVENT');
  await assert.rejects(cancelMeeting(h.ctx, U('jan'), { meeting_id: m.id }), (e) => e.code === 'MEETING_FROM_EVENT');
});

test('sprzątanie: spotkanie usuniętego wydarzenia (usunięcie bez zwróconego wiersza) zostaje odwołane', { skip: skipDb }, async () => {
  const h = harness();
  const id = await newEvent({ title: 'Do usunięcia', date: future(6).date, time: '18:00', format: 'online', created_by: 'jan@x.pl' });
  await syncEventMeeting(h.ctx, id, 'jan@x.pl');
  const keep = await newEvent({ title: 'Zostaje', date: future(6).date, time: '19:00', format: 'hybrid', created_by: 'jan@x.pl' });
  await syncEventMeeting(h.ctx, keep, 'jan@x.pl');
  await db.query(`DELETE FROM events WHERE id::text = $1`, [id]); // bez hooka — jak delete z przeglądarki
  const n = await sweepOrphanEventMeetings(h.ctx);
  assert.ok(n >= 1);
  assert.equal((await q1(`SELECT status FROM meetings WHERE event_id = $1`, [id]))[0].status, 'cancelled');
  assert.equal((await q1(`SELECT status FROM meetings WHERE event_id = $1`, [keep]))[0].status, 'scheduled', 'działające wydarzenie bez zmian');
  const msg = await q1(`SELECT content FROM messages WHERE conversation_id = (SELECT conversation_id FROM meetings WHERE event_id = $1) ORDER BY created_at DESC LIMIT 1`, [id]);
  assert.match(msg[0].content, /Wydarzenie usunięte/);
  assert.equal(await sweepOrphanEventMeetings(h.ctx), 0, 'drugi przebieg — nic');
});

test('goście wydarzenia e-mailem: tylko edytujący wydarzenie; konto → uczestnik, adres → gość z linkiem; usunięcie gościa', { skip: skipDb }, async () => {
  const h = harness();
  const id = await newEvent({ title: 'Webinar', date: future(7).date, time: '20:00', format: 'online', created_by: 'lider@x.pl' });
  await assert.rejects(eventMeetingGuests(h.ctx, U('ola'), { event_id: id, add: ['g@y.pl'] }), (e) => e.status === 403 && e.code === 'EVENT_FORBIDDEN');
  const out = await eventMeetingGuests(h.ctx, U('lider'), { event_id: id, add: [{ email: 'Gosia@Y.pl', name: 'Gosia' }, 'obcy@x.pl'] });
  assert.equal(out.added, 1);
  assert.equal(out.members_added, 1);
  assert.deepEqual(out.guests.map((g) => [g.email, g.name, g.response, g.email_sent]), [['gosia@y.pl', 'Gosia', 'pending', true]]);
  assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0].subject, 'Zaproszenie: Webinar');
  assert.ok(h.notified.some((n) => n.user_email === 'obcy@x.pl' && n.type === 'meeting'));
  const [m] = await q1(`SELECT * FROM meetings WHERE event_id = $1`, [id]);
  assert.ok((await q1(`SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_email = 'obcy@x.pl'`, [m.conversation_id])).length);
  await assert.rejects(eventMeetingGuests(h.ctx, U('lider'), { event_id: id, add: ['zly-adres'] }), (e) => e.code === 'BAD_EMAIL');
  // Usunięcie gościa: link wyłączony, mail z odwołaniem.
  h.emails.length = 0;
  const left = await eventMeetingGuests(h.ctx, U('lider'), { event_id: id, remove: [out.guests[0].id] });
  assert.deepEqual(left.guests, []);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM call_guest_links WHERE meeting_id = $1 AND revoked_at IS NULL`, [m.id]))[0].n, 0);
  assert.equal(h.emails[0].subject, 'Odwołane: Webinar');
  // Stacjonarne — nie ma do czego zapraszać.
  const plain = await newEvent({ title: 'Na miejscu', date: future(7).date, time: '10:00', created_by: 'lider@x.pl' });
  await assert.rejects(eventMeetingGuests(h.ctx, U('lider'), { event_id: plain, add: ['g@y.pl'] }), (e) => e.code === 'NOT_ONLINE');
});
