// Spotkania online z zaproszeniami (migracja 098, src/meetings): członkowie po koncie, goście po
// e-mailu (osobisty link + .ics), zmiana terminu, odwołanie, odpowiedzi, przypomnienia, połączenie
// bez dzwonienia, strona gościa, strażnicy /api/db.
//
// PGlite: testy bazy pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test packages/api/test/meetings.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../src/meetings/logic.js';
import {
  createMeeting, updateMeeting, cancelMeeting, respondMeeting, getMeeting, listMeetings, meetingIcs,
  guestRsvp, sendMeetingReminders,
} from '../src/meetings/service.js';
import { guestInfo, guestRequest, listGuestLinks, createGuestLink } from '../src/calls/guests.js';
import { startCall } from '../src/calls/service.js';
import { enforceConversationWrite } from '../src/dataapi/komunikator.js';
import { canAccess } from '../src/dataapi/registry.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const log = { error() {}, warn() {}, info() {} };
const U = (name) => ({ id: name, email: `${name}@x.pl` });
const HOUR = 3_600_000;
const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString();

// ── Reguły czyste ───────────────────────────────────────────────────────────
test('formularz: nazwa, termin (nie w przeszłości, najwyżej rok), czas trwania 15 min – 8 h', () => {
  const now = Date.parse('2026-10-10T10:00:00Z');
  const ok = M.normalizeMeetingInput({ title: '  Rada \n starszych ', starts_at: '2026-10-12T16:00:00Z', duration_min: 90, kind: 'audio' }, { now });
  assert.deepEqual(ok, {
    title: 'Rada starszych', description: null, starts_at: '2026-10-12T16:00:00.000Z', ends_at: '2026-10-12T17:30:00.000Z',
    kind: 'audio', guests_auto_admit: false,
  });
  assert.equal(M.normalizeMeetingInput({ title: 'x', starts_at: '2026-10-12T16:00:00Z' }, { now }).ends_at, '2026-10-12T17:00:00.000Z', 'domyślnie 60 min');
  const bad = (body, code) => assert.throws(() => M.normalizeMeetingInput(body, { now }), (e) => e.status === 400 && e.code === code);
  bad({ starts_at: '2026-10-12T16:00:00Z' }, 'BAD_TITLE');
  bad({ title: 'x' }, 'BAD_START');
  bad({ title: 'x', starts_at: '2026-10-09T16:00:00Z' }, 'START_IN_PAST');
  bad({ title: 'x', starts_at: '2028-10-09T16:00:00Z' }, 'START_TOO_FAR');
  bad({ title: 'x', starts_at: '2026-10-12T16:00:00Z', duration_min: 5 }, 'BAD_DURATION');
  bad({ title: 'x', starts_at: '2026-10-12T16:00:00Z', duration_min: 600 }, 'BAD_DURATION');
  // Edycja: brakujące pola z bieżącego; minione spotkanie można przemianować bez zmiany terminu.
  const current = { title: 'Stare', description: 'Opis', starts_at: '2026-10-01T10:00:00Z', ends_at: '2026-10-01T11:00:00Z', kind: 'video', guests_auto_admit: true };
  const renamed = M.normalizeMeetingInput({ title: 'Nowe' }, { now, current });
  assert.deepEqual([renamed.title, renamed.description, renamed.ends_at, renamed.guests_auto_admit], ['Nowe', 'Opis', '2026-10-01T11:00:00.000Z', true]);
});

test('goście: e-maile małymi literami, bez powtórzeń, walidacja, limit; imię z adresu', () => {
  assert.deepEqual(M.parseGuests(['Anna@Mail.PL', { email: 'anna@mail.pl', name: 'X' }, { email: 'jan@w.pl', name: ' Jan  K ' }]), [
    { email: 'anna@mail.pl', name: null }, { email: 'jan@w.pl', name: 'Jan K' },
  ]);
  assert.throws(() => M.parseGuests(['nie-mail']), (e) => e.code === 'BAD_EMAIL');
  assert.throws(() => M.parseGuests(Array.from({ length: 51 }, (_, i) => `g${i}@x.pl`)), (e) => e.code === 'TOO_MANY_GUESTS');
  assert.equal(M.nameFromEmail('anna.nowak-kowalska@x.pl'), 'Anna Nowak Kowalska');
  assert.equal(M.nameFromEmail('1234@x.pl'), 'Gość');
  assert.deepEqual(M.parseMembers(['A@x.pl', 'a@x.pl', '']), ['a@x.pl']);
});

test('termin po polsku w strefie kościoła (serwer w UTC)', () => {
  assert.equal(M.formatWhen('2026-10-12T16:00:00Z', '2026-10-12T17:30:00Z'), 'poniedziałek, 12 października 2026, 18:00–19:30');
  assert.match(M.formatShort('2026-12-24T17:00:00Z'), /24\.12.*18:00/);
});

test('.ics: REQUEST/CANCEL, UTC, SEQUENCE, CRLF, zawijanie 75 bajtów, znaki specjalne', () => {
  const meeting = { id: 'abc', title: 'Spotkanie; zarządu, „ważne”', description: 'Linia 1\nLinia 2 '.repeat(8), starts_at: '2026-10-12T16:00:00Z', ends_at: '2026-10-12T17:00:00Z', sequence: 3 };
  const ics = M.buildIcs({ meeting, organizer: { email: 'org@x.pl', name: 'Ola "O" Nowak' }, attendee: { email: 'g@y.pl', name: 'Gość' }, url: 'https://k.avenit.pl/rozmowa/TOKEN', now: Date.parse('2026-10-10T10:00:00Z') });
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'tylko CRLF');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /METHOD:REQUEST/);
  assert.match(unfolded, /UID:meeting-abc@avenit\.app/);
  assert.match(unfolded, /SEQUENCE:3/);
  assert.match(unfolded, /DTSTART:20261012T160000Z/);
  assert.match(unfolded, /SUMMARY:Spotkanie\\; zarządu\\, „ważne”/);
  assert.match(unfolded, /ORGANIZER;CN="Ola O Nowak":mailto:org@x\.pl/);
  assert.match(unfolded, /URL:https:\/\/k\.avenit\.pl\/rozmowa\/TOKEN/);
  assert.match(unfolded, /TRIGGER:-PT10M/);
  const cancel = M.buildIcs({ meeting, method: 'CANCEL' }).replace(/\r\n /g, '');
  assert.match(cancel, /METHOD:CANCEL/);
  assert.match(cancel, /STATUS:CANCELLED/);
  assert.doesNotMatch(cancel, /VALARM/);
});

test('mail do gościa: marka, osobisty link, treść z kodu HTML ucieczką', () => {
  const html = M.guestEmailHtml({ title: '<b>Rada</b>', when: 'pon', organizerName: 'Ola & Jan', churchName: 'Kościół', joinUrl: 'https://k.pl/rozmowa/T?x="1"', guestName: 'Anna' });
  assert.match(html, /&lt;b&gt;Rada&lt;\/b&gt;/);
  assert.match(html, /Ola &amp; Jan/);
  assert.match(html, /href="https:\/\/k\.pl\/rozmowa\/T\?x=&quot;1&quot;"/);
  assert.match(html, /Dołącz do spotkania/);
  assert.doesNotMatch(html, /gradient/i);
  const cancel = M.guestEmailHtml({ variant: 'cancel', title: 'Rada', when: 'pon', organizerName: 'Ola', churchName: 'K', joinUrl: 'https://k.pl/x' });
  assert.doesNotMatch(cancel, /Dołącz do spotkania/);
  assert.equal(M.guestEmailSubject('cancel', 'Rada'), 'Odwołane: Rada');
  assert.match(M.guestEmailText({ title: 'Rada', when: 'pon', organizerName: 'Ola', churchName: 'K', joinUrl: 'https://k.pl/x' }), /Dołącz do spotkania: https:\/\/k\.pl\/x/);
});

test('registry: spotkania tylko do odczytu, zaproszenia poza /api/db', async () => {
  for (const op of ['insert', 'update', 'delete', 'upsert']) {
    const r = await canAccess({ pool: null, dbName: 'x', table: 'meetings', op, user: { role: 'superadmin', is_super_admin: true } });
    assert.equal(r.ok, false, op);
  }
  const inv = await canAccess({ pool: null, dbName: 'x', table: 'meeting_invites', op: 'select', user: { role: 'superadmin', is_super_admin: true } });
  assert.equal(inv.ok, false);
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
  const h = { emitted: [], emails: [], notified: [], pushes: [] };
  h.ctx = {
    db, tenantSlug: 'kosciol', log, tenant: { name: 'Kościół Testowy', slug: 'kosciol', subdomain: 'kosciol' },
    deps: {
      livekit: {
        enabled: true, settings: { url: 'wss://rtc.test', enabled: true },
        async mintToken(o) { return `tok:${o.identity}`; }, async deleteRoom() { return true; },
        async removeParticipant() { return true; }, async roomOccupancy() { return new Map(); },
      },
      emit: (slug, table, op, rows, opts) => h.emitted.push({ table, op, rows, audience: [...(opts?.audience || [])].sort() }),
      sendPush: async (pool, p) => { h.pushes.push(p); return { status: 200 }; },
      notifyMessage: async () => {},
      sendEmail: async (m) => { h.emails.push(m); return { ok: true }; },
      deliver: async ({ entries }) => { h.notified.push(...entries); return { sent: entries.length }; },
      timers: false,
      inline: true,
    },
  };
  return h;
}
const icsOf = (mail) => Buffer.from(mail.attachments[0].contentBase64, 'base64').toString('utf8').replace(/\r\n /g, '');

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, member_id int, avatar_url text);
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE members (id serial PRIMARY KEY, email text, birth_date date, household_id int);
    CREATE TABLE user_blocks (blocker_email text, blocked_email text, created_at timestamptz DEFAULT now(), PRIMARY KEY (blocker_email, blocked_email));
    CREATE TABLE account_events (id bigserial PRIMARY KEY, email varchar(255), action varchar(40) NOT NULL, actor varchar(255), detail text, created_at timestamptz DEFAULT now());
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text, ministry_key text,
      posting_policy text DEFAULT 'everyone', created_by text, last_message_at timestamptz, last_message_preview text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    ALTER TABLE conversations ADD CONSTRAINT conversations_type_check CHECK (type IN ('direct', 'group', 'ministry', 'announcement'));
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      user_email text, role text, muted boolean DEFAULT false, muted_until timestamptz, archived boolean DEFAULT false,
      UNIQUE (conversation_id, user_email));
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      sender_email text NOT NULL, content text NOT NULL, message_type text DEFAULT 'text', metadata jsonb DEFAULT '{}'::jsonb,
      mentions jsonb DEFAULT '[]'::jsonb, attachments jsonb DEFAULT '[]', created_at timestamptz DEFAULT now());
  `);
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('org_name', 'Społeczność Testowa')`);
  await db.query(`INSERT INTO app_users (email, full_name, role, member_id, is_super_admin, is_active) VALUES
    ('jan@x.pl', 'Jan Kowalski', 'czlonek', 1, false, true), ('ola@x.pl', 'Ola Nowak', 'czlonek', 2, false, true),
    ('kid@x.pl', 'Dziecko', 'czlonek', 3, false, true), ('boss@x.pl', 'Pastor', 'czlonek', 4, true, true),
    ('obcy@x.pl', 'Obcy', 'czlonek', 5, false, true), ('stary@x.pl', 'Nieaktywny', 'czlonek', 6, false, false)`);
  await db.query(`INSERT INTO members (id, email, birth_date, household_id) VALUES
    (1, 'jan@x.pl', '1980-01-01', 10), (2, 'ola@x.pl', '1990-01-01', 11), (3, 'kid@x.pl', '2015-05-05', 12),
    (4, 'boss@x.pl', '1970-01-01', 13), (5, 'obcy@x.pl', '1970-01-01', 14), (6, 'stary@x.pl', '1970-01-01', 15)`);
  for (const f of ['096_calls.sql', '097_call_guest_links.sql', '098_meetings.sql']) {
    const sql = fs.readFileSync(new URL(`../db/tenant-migrations/${f}`, import.meta.url), 'utf8');
    await pg.exec(sql);
    await pg.exec(sql); // idempotentna
  }
});

test('zakładanie: rozmowa „meeting”, członkowie po koncie, goście po e-mailu (link + .ics), powiadomienia', { skip: skipDb }, async () => {
  const h = harness();
  const starts = inHours(26);
  const { meeting } = await createMeeting(h.ctx, U('jan'), {
    title: 'Rada starszych', description: 'Plan na jesień', starts_at: starts, duration_min: 90,
    members: ['ola@x.pl'], guests: [{ email: 'Anna@Gmail.com', name: 'Anna' }, 'boss@x.pl'],
  });
  // Konto podane jako „gość” zostaje członkiem (po koncie).
  assert.deepEqual(meeting.members.map((m) => [m.email, m.response]).sort(), [['boss@x.pl', 'pending'], ['jan@x.pl', 'accepted'], ['ola@x.pl', 'pending']]);
  assert.deepEqual(meeting.guests.map((g) => [g.email, g.name, g.response, g.email_sent]), [['anna@gmail.com', 'Anna', 'pending', true]]);
  assert.equal(meeting.can_manage, true);
  assert.equal(meeting.organizer.name, 'Jan Kowalski');

  const [conv] = await q1(`SELECT * FROM conversations WHERE id = $1`, [meeting.conversation_id]);
  assert.deepEqual([conv.type, conv.name, conv.created_by], ['meeting', 'Rada starszych', 'jan@x.pl']);
  const parts = await q1(`SELECT user_email, role FROM conversation_participants WHERE conversation_id = $1 ORDER BY user_email`, [conv.id]);
  assert.deepEqual(parts.map((p) => [p.user_email, p.role]), [['boss@x.pl', 'member'], ['jan@x.pl', 'admin'], ['ola@x.pl', 'member']]);

  // Osobisty link gościa: spotkanie, imię, ważny 12 h po końcu.
  const [link] = await q1(`SELECT * FROM call_guest_links WHERE meeting_id = $1`, [meeting.id]);
  assert.equal(link.guest_name, 'Anna');
  assert.equal(link.show_title, true);
  assert.equal(link.auto_admit, false);
  assert.ok(Math.abs(Date.parse(link.expires_at) - (Date.parse(meeting.ends_at) + 12 * HOUR)) < 2000);

  // Mail do gościa z linkiem i plikiem kalendarza; członkowie — powiadomienie (bez maila).
  assert.equal(h.emails.length, 1);
  const mail = h.emails[0];
  assert.equal(mail.to, 'anna@gmail.com');
  assert.equal(mail.subject, 'Zaproszenie: Rada starszych');
  assert.equal(mail.replyTo, 'jan@x.pl');
  assert.ok(mail.html.includes('://kosciol.') && mail.html.includes(`/rozmowa/${link.token}`));
  assert.match(icsOf(mail), /METHOD:REQUEST/);
  assert.match(icsOf(mail), new RegExp(`/rozmowa/${link.token}`));
  assert.deepEqual(h.notified.map((n) => n.user_email).sort(), ['boss@x.pl', 'ola@x.pl']);
  assert.equal(h.notified[0].type, 'meeting');
  assert.equal(h.notified[0].link, `/komunikator?conversation=${conv.id}`);
  // Czat spotkania: wiadomość systemowa; realtime nowej rozmowy do uczestników.
  const msgs = await q1(`SELECT message_type, content FROM messages WHERE conversation_id = $1`, [conv.id]);
  assert.equal(msgs[0].message_type, 'system');
  assert.match(msgs[0].content, /Jan Kowalski zaplanował\(a\) spotkanie/);
  assert.ok(h.emitted.some((e) => e.table === 'conversations' && e.op === 'insert' && e.audience.includes('ola@x.pl')));
  assert.ok(h.emitted.some((e) => e.table === 'meetings'));
});

test('zakładanie: nieznane / nieaktywne konto, goście przy niepełnoletnim, limit zaproszeń e-mail', { skip: skipDb }, async () => {
  const h = harness();
  const base = { title: 'X', starts_at: inHours(3) };
  await assert.rejects(createMeeting(h.ctx, U('jan'), { ...base, members: ['nikt@x.pl'] }), (e) => e.status === 400 && e.code === 'UNKNOWN_MEMBERS');
  await assert.rejects(createMeeting(h.ctx, U('jan'), { ...base, members: ['stary@x.pl'] }), (e) => e.code === 'UNKNOWN_MEMBERS');
  await assert.rejects(createMeeting(h.ctx, U('jan'), { ...base, members: ['kid@x.pl'], guests: ['g@y.pl'] }), (e) => e.status === 403 && e.code === 'GUESTS_MINORS');
  // Bez gości — spotkanie z osobą niepełnoletnią można zaplanować.
  assert.ok((await createMeeting(h.ctx, U('jan'), { ...base, members: ['kid@x.pl'] })).meeting.id);
  await db.query(`INSERT INTO meeting_invites (meeting_id, kind, email, invited_by_email)
                  SELECT (SELECT id FROM meetings LIMIT 1), 'guest', 'spam' || g || '@y.pl', 'obcy@x.pl' FROM generate_series(1, 199) g`);
  await assert.rejects(createMeeting(h.ctx, U('obcy'), { ...base, guests: ['a@y.pl', 'b@y.pl'] }), (e) => e.status === 429 && e.code === 'GUEST_QUOTA');
  assert.ok((await createMeeting(h.ctx, U('obcy'), { ...base, guests: ['a@y.pl'] })).meeting.id, 'ostatnie miejsce w limicie');
});

test('odpowiedzi, podgląd (e-maile gości tylko dla organizatora), lista, .ics', { skip: skipDb }, async () => {
  const h = harness();
  const { meeting } = await createMeeting(h.ctx, U('jan'), { title: 'Próba', starts_at: inHours(5), members: ['ola@x.pl'], guests: ['g1@y.pl'] });
  const r = await respondMeeting(h.ctx, U('ola'), { meeting_id: meeting.id, response: 'tentative' });
  assert.equal(r.meeting.my_response, 'tentative');
  assert.equal(r.meeting.can_manage, false);
  assert.equal(r.meeting.guests[0].email, undefined, 'e-mail gościa ukryty');
  assert.equal(r.meeting.guests[0].name, 'G', 'imię z adresu (bez cyfr)');
  await assert.rejects(respondMeeting(h.ctx, U('ola'), { meeting_id: meeting.id, response: 'yes' }), (e) => e.code === 'BAD_RESPONSE');
  await assert.rejects(respondMeeting(h.ctx, U('obcy'), { meeting_id: meeting.id, response: 'accepted' }), (e) => e.status === 403);
  await assert.rejects(getMeeting(h.ctx, U('obcy'), { meeting_id: meeting.id }), (e) => e.status === 403);
  const byConv = await getMeeting(h.ctx, U('jan'), { conversation_id: meeting.conversation_id });
  assert.equal(byConv.meeting.guests[0].email, 'g1@y.pl');
  const list = await listMeetings(h.ctx, U('ola'), {});
  assert.ok(list.meetings.some((m) => m.id === meeting.id && m.my_response === 'tentative'));
  assert.ok(!(await listMeetings(h.ctx, U('obcy'), {})).meetings.some((m) => m.id === meeting.id));
  const ics = await meetingIcs(h.ctx, U('ola'), { meeting_id: meeting.id });
  assert.equal(ics.filename, 'Próba.ics');
  assert.match(ics.content.replace(/\r\n /g, ''), new RegExp(`/komunikator\\?conversation=${meeting.conversation_id}`));
});

test('zmiana: nowy termin (SEQUENCE, linki, aktualizacja u gości), dopisanie i usunięcie osób; tylko organizator', { skip: skipDb }, async () => {
  const h = harness();
  const { meeting } = await createMeeting(h.ctx, U('jan'), { title: 'Zarząd', starts_at: inHours(30), members: ['ola@x.pl'], guests: ['stay@y.pl', 'gone@y.pl'] });
  await assert.rejects(updateMeeting(h.ctx, U('ola'), { meeting_id: meeting.id, title: 'Hack' }), (e) => e.status === 403 && e.code === 'MEETING_FORBIDDEN');
  h.emails.length = 0;
  h.notified.length = 0;
  const newStart = inHours(50);
  const { meeting: m2 } = await updateMeeting(h.ctx, U('jan'), {
    meeting_id: meeting.id, starts_at: newStart, duration_min: 30, title: 'Zarząd (nowy termin)',
    members: ['boss@x.pl'], guests: ['stay@y.pl', 'new@y.pl'], guests_auto_admit: true,
  });
  assert.equal(m2.title, 'Zarząd (nowy termin)');
  assert.equal(Date.parse(m2.ends_at) - Date.parse(m2.starts_at), 30 * 60_000);
  assert.deepEqual(m2.members.map((m) => m.email).sort(), ['boss@x.pl', 'jan@x.pl']);
  assert.deepEqual(m2.guests.map((g) => g.email).sort(), ['new@y.pl', 'stay@y.pl']);
  const [row] = await q1(`SELECT sequence, reminder_sent_at FROM meetings WHERE id = $1`, [meeting.id]);
  assert.equal(row.sequence, 1);
  const [conv] = await q1(`SELECT name FROM conversations WHERE id = $1`, [meeting.conversation_id]);
  assert.equal(conv.name, 'Zarząd (nowy termin)');
  // Ola usunięta z rozmowy; Pastor dopisany.
  const parts = (await q1(`SELECT user_email FROM conversation_participants WHERE conversation_id = $1`, [meeting.conversation_id])).map((p) => p.user_email).sort();
  assert.deepEqual(parts, ['boss@x.pl', 'jan@x.pl']);
  assert.ok(h.emitted.some((e) => e.table === 'conversation_participants' && e.op === 'delete' && e.audience.includes('ola@x.pl')));
  // Linki: usunięty gość — wyłączony; pozostałe — nowa ważność i „bez pytania”.
  const links = await q1(`SELECT guest_name, revoked_at, expires_at, auto_admit FROM call_guest_links WHERE meeting_id = $1 ORDER BY created_at`, [meeting.id]);
  const gone = links.find((l) => l.guest_name === 'Gone');
  assert.ok(gone.revoked_at);
  for (const l of links.filter((x) => !x.revoked_at)) {
    assert.equal(l.auto_admit, true);
    assert.ok(Math.abs(Date.parse(l.expires_at) - (Date.parse(m2.ends_at) + 12 * HOUR)) < 2000);
  }
  // Maile: nowy gość — zaproszenie, pozostały — aktualizacja (SEQUENCE 1), usunięty — odwołanie.
  const by = Object.fromEntries(h.emails.map((m) => [m.to, m]));
  assert.equal(by['new@y.pl'].subject, 'Zaproszenie: Zarząd (nowy termin)');
  assert.equal(by['stay@y.pl'].subject, 'Zmiana spotkania: Zarząd (nowy termin)');
  assert.match(icsOf(by['stay@y.pl']), /SEQUENCE:1/);
  assert.equal(by['gone@y.pl'].subject, 'Odwołane: Zarząd (nowy termin)');
  assert.match(icsOf(by['gone@y.pl']), /METHOD:CANCEL/);
  // Powiadomienia: Pastor — zaproszenie; Ola już nie jest zaproszona (bez powiadomienia o zmianie).
  assert.deepEqual(h.notified.map((n) => [n.user_email, n.title.split(':')[0]]), [['boss@x.pl', 'Zaproszenie']]);
  const sys = await q1(`SELECT content FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`, [meeting.conversation_id]);
  assert.match(sys[0].content, /zmienił\(a\) termin/);
});

test('strona gościa: dane spotkania, imię z zaproszenia, odpowiedź; po odwołaniu — komunikat', { skip: skipDb }, async () => {
  const h = harness();
  const { meeting } = await createMeeting(h.ctx, U('jan'), { title: 'Kurs Alpha', description: 'Spotkanie 1', starts_at: inHours(2), guests: [{ email: 'kasia@y.pl', name: 'Kasia' }] });
  const [link] = await q1(`SELECT token FROM call_guest_links WHERE meeting_id = $1`, [meeting.id]);
  const info = await guestInfo(h.ctx, { token: link.token });
  assert.equal(info.title, 'Kurs Alpha');
  assert.equal(info.church_name, 'Społeczność Testowa');
  assert.deepEqual([info.meeting.guest_name, info.meeting.organizer_name, info.meeting.status, info.meeting.response], ['Kasia', 'Jan Kowalski', 'scheduled', 'pending']);
  assert.equal(info.meeting.members, undefined, 'bez listy uczestników');
  const req = await guestRequest(h.ctx, { token: link.token, name: '' });
  assert.equal(req.name, 'Kasia', 'imię z zaproszenia');
  assert.deepEqual(await guestRsvp(h.ctx, { token: link.token, response: 'accepted' }), { ok: true, response: 'accepted' });
  await assert.rejects(guestRsvp(h.ctx, { token: 'x'.repeat(43), response: 'accepted' }), (e) => e.status === 404);
  // Linki spotkania nie mieszają się z linkami „Zaproś gościa” rozmowy.
  assert.equal((await listGuestLinks(h.ctx, U('jan'), { conversation_id: meeting.conversation_id })).links.length, 0);
  assert.ok((await createGuestLink(h.ctx, U('jan'), { conversation_id: meeting.conversation_id })).link.id);

  h.emails.length = 0;
  h.notified.length = 0;
  await respondMeeting(h.ctx, U('jan'), { meeting_id: meeting.id, response: 'accepted' });
  const { meeting: cancelled } = await cancelMeeting(h.ctx, U('jan'), { meeting_id: meeting.id });
  assert.equal(cancelled.status, 'cancelled');
  await assert.rejects(guestInfo(h.ctx, { token: link.token }), (e) => e.status === 410 && e.code === 'MEETING_CANCELLED');
  await assert.rejects(guestRsvp(h.ctx, { token: link.token, response: 'declined' }), (e) => e.code === 'MEETING_CANCELLED');
  assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0].subject, 'Odwołane: Kurs Alpha');
  assert.doesNotMatch(h.emails[0].html, /rozmowa\//, 'bez linku w odwołaniu');
  await assert.rejects(updateMeeting(h.ctx, U('jan'), { meeting_id: meeting.id, title: 'x' }), (e) => e.code === 'MEETING_CANCELLED');
  await assert.rejects(startCall(h.ctx, U('jan'), { conversation_id: meeting.conversation_id, kind: 'video' }), (e) => e.status === 410);
});

test('połączenie w spotkaniu: od razu „trwa”, bez dzwonienia; powiadomienie „Spotkanie trwa” bez odmawiających', { skip: skipDb }, async () => {
  const h = harness();
  const { meeting } = await createMeeting(h.ctx, U('jan'), { title: 'Modlitwa', starts_at: inHours(0.05), members: ['ola@x.pl', 'boss@x.pl'] });
  await respondMeeting(h.ctx, U('boss'), { meeting_id: meeting.id, response: 'declined' });
  h.notified.length = 0;
  h.pushes.length = 0;
  const out = await startCall(h.ctx, U('jan'), { conversation_id: meeting.conversation_id, kind: 'video' });
  assert.equal(out.call.status, 'active');
  assert.ok(out.call.answered_at);
  assert.equal(out.call.is_group, true);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(h.pushes.length, 0, 'bez pusha „dzwoni”');
  assert.deepEqual(h.notified.map((n) => n.user_email), ['ola@x.pl']);
  assert.match(h.notified[0].title, /^Spotkanie trwa: Modlitwa/);
  const view = await getMeeting(h.ctx, U('ola'), { meeting_id: meeting.id });
  assert.equal(view.meeting.call_live, true);
});

test('przypomnienie 10 min przed: raz, członkowie bez odmawiających, goście z linkiem', { skip: skipDb }, async () => {
  const h = harness();
  const { meeting } = await createMeeting(h.ctx, U('jan'), { title: 'Wieczór', starts_at: inHours(3), members: ['ola@x.pl', 'boss@x.pl'], guests: ['g@y.pl'] });
  await respondMeeting(h.ctx, U('boss'), { meeting_id: meeting.id, response: 'declined' });
  // Spotkanie za 5 minut, zaplanowane godzinę temu.
  await db.query(`UPDATE meetings SET starts_at = now() + interval '5 minutes', ends_at = now() + interval '65 minutes',
                  created_at = now() - interval '1 hour' WHERE id = $1`, [meeting.id]);
  h.emails.length = 0;
  h.notified.length = 0;
  const n = await sendMeetingReminders(h.ctx);
  assert.ok(n >= 1);
  assert.deepEqual(h.notified.filter((x) => x.data.meeting_id === meeting.id).map((x) => x.user_email).sort(), ['jan@x.pl', 'ola@x.pl']);
  const mail = h.emails.find((m) => m.to === 'g@y.pl');
  assert.equal(mail.subject, 'Za 10 minut: Wieczór');
  assert.match(mail.html, /\/rozmowa\//);
  assert.equal(mail.attachments.length, 0);
  h.notified.length = 0;
  await sendMeetingReminders(h.ctx);
  assert.equal(h.notified.filter((x) => x.data.meeting_id === meeting.id).length, 0, 'drugi raz — nic');
});

test('/api/db: rozmowy „meeting” zakłada i zmienia tylko serwer', { skip: skipDb }, async () => {
  const h = harness();
  const { meeting } = await createMeeting(h.ctx, U('jan'), { title: 'Strażnicy', starts_at: inHours(4), members: ['ola@x.pl'] });
  const req = (email) => ({ db, user: { email } });
  await assert.rejects(enforceConversationWrite({ table: 'conversations', op: 'insert', values: { type: 'meeting', name: 'x' } }, req('jan@x.pl')),
    (e) => e.status === 403 && e.code === 'MEETING_SERVER');
  await assert.rejects(enforceConversationWrite({ table: 'conversation_participants', op: 'insert', values: { conversation_id: meeting.conversation_id, user_email: 'obcy@x.pl' } }, req('jan@x.pl')),
    (e) => e.status === 403 && e.code === 'MEETING_SERVER');
  await assert.rejects(enforceConversationWrite({ table: 'conversations', op: 'update', values: { name: 'Inna' }, filters: [{ type: 'eq', column: 'id', value: meeting.conversation_id }] }, req('jan@x.pl')),
    (e) => e.status === 403 && e.code === 'MEETING_SERVER');
  await assert.rejects(enforceConversationWrite({ table: 'meetings', op: 'update', values: { title: 'x' } }, req('jan@x.pl')), (e) => e.status === 403);
  // „Przeczytane” na rozmowie spotkania — dozwolone.
  await enforceConversationWrite({ table: 'conversations', op: 'update', values: { last_message_at: new Date().toISOString() }, filters: [{ type: 'eq', column: 'id', value: meeting.conversation_id }] }, req('ola@x.pl'));
});
