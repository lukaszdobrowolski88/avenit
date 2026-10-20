// Komunikator: zaplanowane wiadomości i „Przypomnij mi” (migracja 113, src/chatSchedule/service.js).
// Terminy w czasie polskim (shared/lib/chatSchedule.js), strażnicy wysyłki jak /api/db, worker
// z podstawionym zegarem, przypomnienia (push + wpis 'reminder'), własność wierszy.
//
// PGlite: testy bazy pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test packages/api/test/chat-schedule.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  warsawOffsetMinutes, warsawParts, warsawToDate, fromWarsawYmdHm, warsawYmdHm, schedulePresets,
  reminderPresets, nextMondayAt, describeChatTime, chatTimeLabelPl, isValidChatTime,
} from '@avenit/shared/src/lib/chatSchedule.js';
import {
  normalizeScheduledInput, createScheduled, updateScheduled, cancelScheduled, sendScheduledNow, listScheduled,
  createReminder, cancelReminder, listReminders, reminderText, reminderLink, RETRY_WINDOW_MS,
} from '../src/chatSchedule/service.js';
import { runForTenant as runScheduled } from '../src/fn/chat-scheduled.js';
import { runForTenant as runReminders } from '../src/fn/chat-reminders.js';
import { canAccess } from '../src/dataapi/registry.js';
import { ownerScope, realtimeVisible } from '../src/dataapi/ownership.js';
import { buildQuery } from '../src/dataapi/querybuilder.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const iso = (s) => new Date(s).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

// ── Czas polski ─────────────────────────────────────────────────────────────
test('strefa: Warszawa +2 latem, +1 zimą; zmiana czasu w ostatnie niedziele marca i października', () => {
  assert.equal(warsawOffsetMinutes(Date.parse('2026-07-01T12:00:00Z')), 120);
  assert.equal(warsawOffsetMinutes(Date.parse('2026-12-01T12:00:00Z')), 60);
  assert.equal(warsawOffsetMinutes(Date.parse('2026-03-29T00:59:00Z')), 60);
  assert.equal(warsawOffsetMinutes(Date.parse('2026-03-29T01:00:00Z')), 120);
  assert.equal(warsawOffsetMinutes(Date.parse('2026-10-25T00:59:00Z')), 120);
  assert.equal(warsawOffsetMinutes(Date.parse('2026-10-25T01:00:00Z')), 60);
  // Zgodność z Intl (Node ma pełne strefy) na siatce chwil przez dwa lata.
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let ms = Date.parse('2026-01-01T00:00:00Z'); ms < Date.parse('2028-01-01T00:00:00Z'); ms += 7 * HOUR + 13 * MIN) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const w = warsawParts(ms);
    assert.deepEqual([w.year, w.month, w.day, w.hour, w.minute], [+p.year, +p.month, +p.day, +p.hour, +p.minute], new Date(ms).toISOString());
  }
});

test('strefa: czas polski → UTC (także w dniu zmiany czasu), pola wyboru tam i z powrotem', () => {
  assert.equal(warsawToDate(2026, 10, 20, 18, 0).toISOString(), '2026-10-20T16:00:00.000Z');
  assert.equal(warsawToDate(2026, 12, 24, 18, 0).toISOString(), '2026-12-24T17:00:00.000Z');
  assert.equal(warsawToDate(2026, 10, 25, 8, 0).toISOString(), '2026-10-25T07:00:00.000Z', 'po zmianie na zimowy');
  assert.equal(warsawToDate(2026, 3, 29, 8, 0).toISOString(), '2026-03-29T06:00:00.000Z', 'po zmianie na letni');
  assert.equal(warsawToDate(2026, 10, 32, 8, 0).toISOString(), '2026-11-01T07:00:00.000Z', 'dzień poza miesiącem');
  assert.equal(fromWarsawYmdHm('2026-11-05', '07:30').toISOString(), '2026-11-05T06:30:00.000Z');
  assert.equal(fromWarsawYmdHm('2026-02-31', '10:00'), null);
  assert.equal(fromWarsawYmdHm('2026-11-05', '25:00'), null);
  assert.equal(fromWarsawYmdHm('', '10:00'), null);
  assert.deepEqual(warsawYmdHm('2026-11-05T06:30:00Z'), { ymd: '2026-11-05', hm: '07:30' });
});

test('gotowe terminy wysyłki: dziś 18:00 tylko przed 18:00, jutro 8:00 i 18:00 (czas polski)', () => {
  const morning = Date.parse('2026-10-20T08:00:00Z'); // 10:00 w Warszawie
  assert.deepEqual(schedulePresets(morning).map((p) => [p.key, p.at.toISOString()]), [
    ['today18', '2026-10-20T16:00:00.000Z'], ['tomorrow8', '2026-10-21T06:00:00.000Z'], ['tomorrow18', '2026-10-21T16:00:00.000Z'],
  ]);
  const evening = Date.parse('2026-10-20T17:30:00Z'); // 19:30
  assert.deepEqual(schedulePresets(evening).map((p) => p.key), ['tomorrow8', 'tomorrow18']);
  // 23:30 czasu polskiego to już następny dzień w UTC? Nie — ale 00:30 polskiego jest jeszcze „wczoraj” w UTC.
  const afterMidnight = Date.parse('2026-10-20T22:30:00Z'); // 00:30 21.10 w Warszawie
  assert.deepEqual(schedulePresets(afterMidnight).map((p) => [p.key, p.at.toISOString()]), [
    ['today18', '2026-10-21T16:00:00.000Z'], ['tomorrow8', '2026-10-22T06:00:00.000Z'], ['tomorrow18', '2026-10-22T16:00:00.000Z'],
  ]);
  // Sobota przed zmianą czasu: „jutro 8:00” to już czas zimowy.
  const sat = Date.parse('2026-10-24T09:00:00Z');
  assert.equal(schedulePresets(sat).find((p) => p.key === 'tomorrow8').at.toISOString(), '2026-10-25T07:00:00.000Z');
});

test('gotowe terminy przypomnień: +1 h, +3 h, jutro 9:00, poniedziałek 9:00 (bez dubla w niedzielę)', () => {
  const tue = Date.parse('2026-10-20T08:00:00Z');
  assert.deepEqual(reminderPresets(tue).map((p) => [p.key, p.at.toISOString()]), [
    ['in1h', '2026-10-20T09:00:00.000Z'], ['in3h', '2026-10-20T11:00:00.000Z'],
    ['tomorrow9', '2026-10-21T07:00:00.000Z'], ['monday9', '2026-10-26T08:00:00.000Z'],
  ]);
  const sun = Date.parse('2026-10-25T12:00:00Z');
  assert.deepEqual(reminderPresets(sun).map((p) => p.key), ['in1h', 'in3h', 'tomorrow9']);
  // W poniedziałek — następny poniedziałek (nawet rano przed 9:00).
  assert.equal(nextMondayAt(Date.parse('2026-10-26T05:00:00Z')).toISOString(), '2026-11-02T08:00:00.000Z');
});

test('opis terminu i okno dozwolonych terminów', () => {
  const now = Date.parse('2026-10-20T08:00:00Z');
  assert.deepEqual(describeChatTime('2026-10-20T16:00:00Z', now), { kind: 'today', time: '18:00', date: '20.10', weekday: 2 });
  assert.equal(describeChatTime('2026-10-21T06:05:00Z', now).kind, 'tomorrow');
  assert.equal(chatTimeLabelPl('2026-10-21T06:05:00Z', now), 'jutro 8:05');
  assert.equal(chatTimeLabelPl('2026-10-26T08:00:00Z', now), 'pon. 26.10, 9:00');
  assert.equal(chatTimeLabelPl('2027-01-04T08:00:00Z', now), 'pon. 04.01.2027, 9:00');
  assert.equal(isValidChatTime(now + 30_000, now), false, 'mniej niż minuta zapasu');
  assert.equal(isValidChatTime(now + 2 * MIN, now), true);
  assert.equal(isValidChatTime(now + 400 * 24 * HOUR, now), false);
  assert.equal(isValidChatTime('nie-data', now), false);
});

test('wejście: rozmowa, treść albo załącznik, termin, wzmianki bez powtórzeń', () => {
  const now = Date.parse('2026-10-20T08:00:00Z');
  const conv = '11111111-1111-4111-8111-111111111111';
  const ok = normalizeScheduledInput({ conversation_id: conv, content: '  Hej  ', mentions: ['a@x.pl', 'a@x.pl', 7], send_at: '2026-10-20T16:00:00Z' }, { now });
  assert.deepEqual(ok, { conversation_id: conv, content: 'Hej', attachments: [], mentions: ['a@x.pl'], reply_to_id: null, send_at: '2026-10-20T16:00:00.000Z' });
  const bad = (body, code) => assert.throws(() => normalizeScheduledInput(body, { now }), (e) => e.status === 400 && e.code === code);
  bad({ content: 'x', send_at: '2026-10-20T16:00:00Z' }, 'BAD_CONVERSATION');
  bad({ conversation_id: conv, content: '   ', send_at: '2026-10-20T16:00:00Z' }, 'EMPTY');
  bad({ conversation_id: conv, content: 'x', send_at: '2026-10-20T07:00:00Z' }, 'BAD_TIME');
  bad({ conversation_id: conv, content: 'x' }, 'BAD_TIME');
  bad({ conversation_id: conv, content: 'x'.repeat(10_001), send_at: '2026-10-20T16:00:00Z' }, 'TOO_LONG');
  bad({ conversation_id: conv, attachments: 'x', send_at: '2026-10-20T16:00:00Z' }, 'BAD_ATTACHMENTS');
  const att = normalizeScheduledInput({ conversation_id: conv, attachments: [{ url: 'https://k/x.png', name: 'x' }, null], send_at: '2026-10-20T16:00:00Z' }, { now });
  assert.equal(att.attachments.length, 1);
});

test('treść przypomnienia: nadawca, miejsce, prywatna, własna; link do wiadomości', () => {
  assert.deepEqual(reminderText({ conv: { type: 'group', name: 'Zespół' }, senderName: 'Ola', preview: 'Próba w sobotę' }),
    { title: 'Przypomnienie', body: 'Wiadomość od Ola w Zespół: Próba w sobotę' });
  assert.equal(reminderText({ conv: { type: 'direct' }, senderName: 'Ola', preview: 'Hej' }).body, 'Wiadomość od Ola w rozmowie prywatnej: Hej');
  assert.equal(reminderText({ conv: { type: 'ministry', name: '' }, mine: true, preview: 'X' }).body, 'Twoja wiadomość w Kanał służby: X');
  assert.ok(reminderText({ conv: null, senderName: 'A', preview: 'y'.repeat(400) }).body.length <= 220);
  assert.equal(reminderLink('c 1', 'm/2'), '/komunikator?conversation=c%201&message=m%2F2');
  assert.equal(reminderLink('c', 'm', 'r'), '/komunikator?conversation=c&message=m&thread=r', 'odpowiedź w wątku');
});

test('registry + własność: zapis tylko przez fn, odczyt i realtime tylko właściciela', async () => {
  for (const table of ['scheduled_messages', 'message_reminders']) {
    for (const op of ['insert', 'update', 'delete', 'upsert']) {
      const r = await canAccess({ pool: null, dbName: 'x', table, op, user: { role: 'superadmin', is_super_admin: true } });
      assert.equal(r.ok, false, `${table} ${op}`);
    }
  }
  const me = { email: 'Jan@X.pl' };
  const b = buildQuery({ table: 'scheduled_messages', op: 'select', select: '*', __ownerScope: ownerScope('scheduled_messages', me) });
  assert.match(b.sql, /lower\(t\."sender_email"\) = \$1/);
  assert.ok(b.params.includes('jan@x.pl'));
  const r = buildQuery({ table: 'message_reminders', op: 'select', select: '*', __ownerScope: ownerScope('message_reminders', me) });
  assert.match(r.sql, /lower\(t\."user_email"\) = \$1/);
  assert.equal(realtimeVisible('scheduled_messages', { sender_email: 'jan@x.pl' }, { email: 'JAN@x.pl' }), true);
  assert.equal(realtimeVisible('scheduled_messages', { sender_email: 'ola@x.pl' }, { email: 'jan@x.pl' }), false);
  assert.equal(realtimeVisible('message_reminders', { user_email: 'ola@x.pl' }, { email: 'jan@x.pl' }), false);
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
const CONV = { group: null, ann: null, direct: null };

// Zegar testu — każdy test ustawia własną chwilę.
function harness(nowIso = '2026-10-20T08:00:00Z') {
  const h = { emitted: [], notified: [], delivered: [], clock: new Date(nowIso) };
  h.deps = {
    emit: (slug, table, op, rows, opts) => h.emitted.push({ table, op, rows, audience: [...(opts?.audience || [])].sort() }),
    notifyMessage: async (o) => { h.notified.push(o); },
    deliver: async ({ entries }) => { h.delivered.push(...entries); return { sent: entries.length }; },
    now: () => h.clock,
  };
  h.ctx = { db, tenantSlug: 'kosciol', dbName: 'chat_sched_test', log: { error() {}, warn() {} }, deps: h.deps };
  h.worker = { tenantSlug: 'kosciol', tenantDbName: 'chat_sched_test', log() {} };
  h.at = (s) => { h.clock = new Date(s); };
  return h;
}
const U = (n) => ({ id: n, email: `${n}@x.pl` });

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  pgRef = pg;
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, status text DEFAULT 'active', member_id int, avatar_url text);
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE app_modules (key text PRIMARY KEY);
    CREATE TABLE permission_grants (role text, user_id text, capability text, allowed boolean);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE members (id serial PRIMARY KEY, email text, birth_date date, household_id int);
    CREATE TABLE user_blocks (blocker_email text, blocked_email text, created_at timestamptz DEFAULT now(), PRIMARY KEY (blocker_email, blocked_email));
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text, ministry_key text,
      posting_policy text DEFAULT 'everyone', created_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      user_email text, role text, muted boolean DEFAULT false, archived boolean DEFAULT false, UNIQUE (conversation_id, user_email));
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      sender_email text NOT NULL, content text NOT NULL, message_type text DEFAULT 'text', metadata jsonb DEFAULT '{}'::jsonb,
      mentions jsonb DEFAULT '[]'::jsonb, attachments jsonb DEFAULT '[]', reply_to_id uuid REFERENCES messages(id), thread_root_id uuid,
      edited_at timestamptz, deleted_at timestamptz, created_at timestamptz DEFAULT now());
    -- Najstarszy wariant szablonu: CHECK na typie powiadomienia (migracja 113 go zdejmuje).
    CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_email text NOT NULL,
      type text NOT NULL CHECK (type IN ('message', 'mention', 'task', 'event', 'system')), title text NOT NULL, body text, link text,
      data jsonb DEFAULT '{}', read boolean DEFAULT false, created_at timestamptz DEFAULT now());
  `);
  await db.query(`INSERT INTO permission_grants (role, user_id, capability, allowed) VALUES
    ('czlonek', NULL, 'module:komunikator', true), ('czlonek', NULL, 'res:messages:*', true), ('gosc', NULL, 'module:komunikator', true)`);
  await db.query(`INSERT INTO app_users (email, full_name, role, is_active, status) VALUES
    ('jan@x.pl', 'Jan Kowalski', 'czlonek', true, 'active'), ('ola@x.pl', 'Ola Nowak', 'czlonek', true, 'active'),
    ('ewa@x.pl', 'Ewa', 'czlonek', true, 'active'), ('gosc@x.pl', 'Gość', 'gosc', true, 'active'),
    ('stary@x.pl', 'Stary', 'czlonek', false, 'blocked')`);
  for (let i = 0; i < 2; i++) {
    // Idempotentna (deploy może ją nałożyć ponownie).
    await pg.exec(fs.readFileSync(new URL('../db/tenant-migrations/113_chat_scheduled_reminders.sql', import.meta.url), 'utf8'));
  }
  const conv = async (type, name, policy, parts) => {
    const [c] = await q1(`INSERT INTO conversations (type, name, posting_policy, created_by) VALUES ($1, $2, $3, 'jan@x.pl') RETURNING id`, [type, name, policy]);
    for (const [email, role] of parts) await db.query(`INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ($1, $2, $3)`, [c.id, email, role]);
    return c.id;
  };
  CONV.group = await conv('group', 'Zespół', 'everyone', [['jan@x.pl', 'admin'], ['ola@x.pl', 'member'], ['ewa@x.pl', 'member'], ['gosc@x.pl', 'member'], ['stary@x.pl', 'member']]);
  CONV.ann = await conv('announcement', 'Ogłoszenia', 'admins', [['jan@x.pl', 'admin'], ['ola@x.pl', 'member']]);
  CONV.direct = await conv('direct', null, 'everyone', [['jan@x.pl', 'admin'], ['ola@x.pl', 'admin']]);
});

test('migracja 113: zdjęty stary CHECK typu powiadomienia — wpis „reminder” przechodzi', { skip: skipDb }, async () => {
  await db.query(`INSERT INTO notifications (user_email, type, title) VALUES ('jan@x.pl', 'reminder', 'Przypomnienie')`);
  const [n] = await q1(`SELECT count(*)::int AS n FROM notifications WHERE type = 'reminder'`);
  assert.equal(n.n, 1);
  await assert.rejects(db.query(`INSERT INTO scheduled_messages (conversation_id, sender_email, send_at, status) VALUES ($1, 'jan@x.pl', now(), 'wysłana')`, [CONV.group]));
});

test('planowanie: uczestnik tak; obcy, kanał ogłoszeń, @wszyscy bez prawa, nieaktywny — od razu odmowa', { skip: skipDb }, async () => {
  const h = harness();
  const send_at = '2026-10-20T16:00:00Z';
  const { scheduled } = await createScheduled(h.ctx, U('ola'), { conversation_id: CONV.group, content: 'Próba o 19', mentions: ['jan@x.pl'], send_at });
  assert.equal(scheduled.status, 'pending');
  assert.equal(scheduled.sender_email, 'ola@x.pl');
  assert.equal(new Date(scheduled.send_at).toISOString(), iso(send_at));
  assert.deepEqual(scheduled.mentions, ['jan@x.pl']);
  assert.ok(h.emitted.some((e) => e.table === 'scheduled_messages' && e.op === 'insert'));
  const no = (p, status, code) => assert.rejects(p, (e) => e.status === status && (!code || e.code === code));
  const otherConv = await q1(`INSERT INTO conversations (type, name) VALUES ('group', 'Obca') RETURNING id`);
  await no(createScheduled(h.ctx, U('ola'), { conversation_id: otherConv[0].id, content: 'x', send_at }), 403);
  await no(createScheduled(h.ctx, U('ola'), { conversation_id: CONV.ann, content: 'x', send_at }), 403);
  await no(createScheduled(h.ctx, U('ola'), { conversation_id: CONV.group, content: 'x', mentions: ['*'], send_at }), 403, 'MENTION_ALL_FORBIDDEN');
  await no(createScheduled(h.ctx, U('stary'), { conversation_id: CONV.group, content: 'x', send_at }), 403, 'SENDER_INACTIVE');
  await no(createScheduled(h.ctx, U('gosc'), { conversation_id: CONV.group, content: 'x', send_at }), 403, 'NO_ACCESS'); // bez res:messages:create
  await no(createScheduled(h.ctx, U('ola'), { conversation_id: CONV.group, content: 'x', send_at: '2026-10-20T07:59:00Z' }), 400, 'BAD_TIME');
  // Administrator kanału ogłoszeń może.
  assert.ok((await createScheduled(h.ctx, U('jan'), { conversation_id: CONV.ann, content: 'Ogłoszenie', send_at })).scheduled.id);
  // Lista: tylko moje, w kolejności terminu.
  const mine = await listScheduled(h.ctx, U('ola'), { conversation_id: CONV.group });
  assert.ok(mine.scheduled.every((s) => s.sender_email === 'ola@x.pl'));
  await db.query(`UPDATE scheduled_messages SET status = 'cancelled' WHERE status = 'pending'`);
});

test('worker: przed terminem nic, po terminie wiadomość od nadawcy (realtime, push-hooki), status „sent”', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  const { scheduled } = await createScheduled(h.ctx, U('ola'), {
    conversation_id: CONV.group, content: 'Kurwa, próba o 19!', mentions: ['jan@x.pl'], send_at: '2026-10-20T16:00:00Z',
    attachments: [{ url: 'https://k/x.pdf', name: 'plan.pdf', type: 'application/pdf' }],
  });
  assert.match(scheduled.content, /^K\*+, próba/, 'filtr wulgaryzmów już przy planowaniu');
  h.at('2026-10-20T15:59:00Z');
  assert.deepEqual(await runScheduled(db, h.worker, h.deps), { sent: 0, failed: 0, retry: 0 });
  h.at('2026-10-20T16:00:30Z');
  assert.deepEqual(await runScheduled(db, h.worker, h.deps), { sent: 1, failed: 0, retry: 0 });
  const [row] = await q1(`SELECT * FROM scheduled_messages WHERE id = $1`, [scheduled.id]);
  assert.equal(row.status, 'sent');
  assert.equal(new Date(row.sent_at).toISOString(), '2026-10-20T16:00:30.000Z');
  const [msg] = await q1(`SELECT * FROM messages WHERE id = $1`, [row.message_id]);
  assert.equal(msg.sender_email, 'ola@x.pl');
  assert.equal(msg.conversation_id, CONV.group);
  assert.match(msg.content, /próba o 19/);
  assert.deepEqual(msg.mentions, ['jan@x.pl']);
  assert.equal(msg.attachments[0].name, 'plan.pdf');
  const ev = h.emitted.find((e) => e.table === 'messages' && e.op === 'insert');
  assert.deepEqual(ev.audience, ['ewa@x.pl', 'gosc@x.pl', 'jan@x.pl', 'ola@x.pl', 'stary@x.pl']);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.notified.length, 1);
  assert.equal(h.notified[0].actingUserEmail, 'ola@x.pl');
  assert.equal(h.notified[0].values.id, msg.id);
  assert.ok(h.emitted.some((e) => e.table === 'scheduled_messages' && e.op === 'update' && e.rows[0].status === 'sent'));
  // Drugi przebieg niczego nie dubluje.
  assert.equal((await runScheduled(db, h.worker, h.deps)).sent, 0);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1 AND content LIKE '%próba o 19%'`, [CONV.group]))[0].n, 1);
});

test('worker: nadawca opuścił rozmowę / zablokowany w 1:1 — „failed” z powodem i powiadomienie nadawcy', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  const a = (await createScheduled(h.ctx, U('ewa'), { conversation_id: CONV.group, content: 'Do zobaczenia', send_at: '2026-10-20T10:00:00Z' })).scheduled;
  const b = (await createScheduled(h.ctx, U('jan'), { conversation_id: CONV.direct, content: 'Hej Ola', send_at: '2026-10-20T10:00:00Z' })).scheduled;
  await db.query(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_email = 'ewa@x.pl'`, [CONV.group]);
  await db.query(`INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('ola@x.pl', 'jan@x.pl')`);
  h.at('2026-10-20T10:01:00Z');
  assert.deepEqual(await runScheduled(db, h.worker, h.deps), { sent: 0, failed: 2, retry: 0 });
  const rows = await q1(`SELECT id, status, error, message_id FROM scheduled_messages WHERE id = ANY($1::uuid[]) ORDER BY sender_email`, [[a.id, b.id]]);
  assert.deepEqual(rows.map((r) => r.status), ['failed', 'failed']);
  assert.match(rows.find((r) => r.id === a.id).error, /swojej rozmowie/);
  assert.ok(rows.every((r) => r.message_id === null));
  assert.deepEqual(h.delivered.map((d) => [d.user_email, d.type]).sort(), [['ewa@x.pl', 'system'], ['jan@x.pl', 'system']]);
  assert.equal(h.delivered.find((d) => d.user_email === 'jan@x.pl').body.startsWith('Ola Nowak: '), true, '1:1 — imię drugiej osoby');
  // Poprawka nieudanej: nowy termin → znów w kolejce (gdy znowu wolno pisać).
  await db.query(`DELETE FROM user_blocks`);
  const fixed = await updateScheduled(h.ctx, U('jan'), { id: b.id, send_at: '2026-10-20T12:00:00Z', content: 'Hej Ola!' });
  assert.deepEqual([fixed.scheduled.status, fixed.scheduled.error, fixed.scheduled.content], ['pending', null, 'Hej Ola!']);
  await db.query(`INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ($1, 'ewa@x.pl', 'member')`, [CONV.group]);
  await cancelScheduled(h.ctx, U('jan'), { id: b.id });
  await cancelScheduled(h.ctx, U('ewa'), { id: a.id });
});

test('worker: błąd chwilowy — ponowienie, po 30 min od terminu „failed”', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  const s = (await createScheduled(h.ctx, U('ola'), { conversation_id: CONV.group, content: 'Chwilowy', send_at: '2026-10-20T09:00:00Z' })).scheduled;
  await pgRef.exec(`ALTER TABLE messages RENAME TO messages_off; CREATE TABLE messages (LIKE messages_off INCLUDING DEFAULTS);
                    ALTER TABLE messages ADD CONSTRAINT boom CHECK (false);`);
  try {
    h.at('2026-10-20T09:05:00Z');
    assert.deepEqual(await runScheduled(db, h.worker, h.deps), { sent: 0, failed: 0, retry: 1 });
    assert.equal((await q1(`SELECT status FROM scheduled_messages WHERE id = $1`, [s.id]))[0].status, 'pending');
    h.at(new Date(Date.parse('2026-10-20T09:00:00Z') + RETRY_WINDOW_MS + MIN).toISOString());
    assert.deepEqual(await runScheduled(db, h.worker, h.deps), { sent: 0, failed: 1, retry: 0 });
    const [row] = await q1(`SELECT status, error FROM scheduled_messages WHERE id = $1`, [s.id]);
    assert.equal(row.status, 'failed');
    assert.match(row.error, /Nie udało się wysłać/);
  } finally {
    await pgRef.exec(`DROP TABLE messages; ALTER TABLE messages_off RENAME TO messages;`);
  }
  await cancelScheduled(h.ctx, U('ola'), { id: s.id });
});

test('edycja, anulowanie, „Wyślij teraz” — tylko właściciel; anulowanej worker nie wyśle', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  const s = (await createScheduled(h.ctx, U('ola'), { conversation_id: CONV.group, content: 'Szkic', send_at: '2026-10-21T06:00:00Z' })).scheduled;
  const no = (p, status) => assert.rejects(p, (e) => e.status === status);
  await no(updateScheduled(h.ctx, U('jan'), { id: s.id, content: 'cudze' }), 404);
  await no(cancelScheduled(h.ctx, U('jan'), { id: s.id }), 404);
  await no(sendScheduledNow(h.ctx, U('jan'), { id: s.id }), 404);
  await no(updateScheduled(h.ctx, U('ola'), { id: s.id, send_at: '2026-10-19T08:00:00Z' }), 400);
  await no(updateScheduled(h.ctx, U('ola'), { id: s.id, content: '  ' }), 400);
  const up = await updateScheduled(h.ctx, U('ola'), { id: s.id, content: 'Nowa treść', send_at: '2026-10-20T16:00:00Z' });
  assert.equal(up.scheduled.content, 'Nowa treść');
  assert.equal(new Date(up.scheduled.send_at).toISOString(), '2026-10-20T16:00:00.000Z');
  // Wyślij teraz.
  const now = await sendScheduledNow(h.ctx, U('ola'), { id: s.id });
  assert.equal(now.scheduled.status, 'sent');
  assert.equal(now.message.content, 'Nowa treść');
  assert.equal(now.message.sender_email, 'ola@x.pl');
  await no(sendScheduledNow(h.ctx, U('ola'), { id: s.id }), 409);
  await no(cancelScheduled(h.ctx, U('ola'), { id: s.id }), 409);
  // Anulowana nie wychodzi.
  const c = (await createScheduled(h.ctx, U('ola'), { conversation_id: CONV.group, content: 'Anulowana', send_at: '2026-10-20T09:00:00Z' })).scheduled;
  assert.equal((await cancelScheduled(h.ctx, U('ola'), { id: c.id })).scheduled.status, 'cancelled');
  h.at('2026-10-20T10:00:00Z');
  assert.equal((await runScheduled(db, h.worker, h.deps)).sent, 0);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM messages WHERE content = 'Anulowana'`))[0].n, 0);
  // „Wyślij teraz” przy odmowie strażnika: 403 i status failed.
  const f = (await createScheduled(h.ctx, U('ewa'), { conversation_id: CONV.group, content: 'Nie wyjdzie', send_at: '2026-10-21T09:00:00Z' })).scheduled;
  await db.query(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_email = 'ewa@x.pl'`, [CONV.group]);
  await no(sendScheduledNow(h.ctx, U('ewa'), { id: f.id }), 403);
  assert.equal((await q1(`SELECT status FROM scheduled_messages WHERE id = $1`, [f.id]))[0].status, 'failed');
  await db.query(`INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ($1, 'ewa@x.pl', 'member')`, [CONV.group]);
});

test('limit aktywnych zaplanowanych na osobę', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  await db.query(`INSERT INTO scheduled_messages (conversation_id, sender_email, content, send_at)
                  SELECT $1, 'ewa@x.pl', 'x' || g, '2026-11-01T10:00:00Z' FROM generate_series(1, 100) g`, [CONV.group]);
  await assert.rejects(createScheduled(h.ctx, U('ewa'), { conversation_id: CONV.group, content: 'jeszcze', send_at: '2026-10-21T06:00:00Z' }), (e) => e.status === 429);
  await db.query(`DELETE FROM scheduled_messages WHERE sender_email = 'ewa@x.pl'`);
});

test('przypomnienia: tylko wiadomości z moich rozmów, ponowne = nowy termin, lista z podglądem', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  const [m] = await q1(`INSERT INTO messages (conversation_id, sender_email, content) VALUES ($1, 'ola@x.pl', 'Przynieś klucze do sali') RETURNING *`, [CONV.group]);
  const no = (p, status) => assert.rejects(p, (e) => e.status === status);
  await no(createReminder(h.ctx, U('jan'), { message_id: m.id, remind_at: '2026-10-20T08:00:30Z' }), 400);
  const outsider = { id: 'obcy', email: 'obcy@x.pl' };
  await no(createReminder(h.ctx, outsider, { message_id: m.id, remind_at: '2026-10-20T09:00:00Z' }), 403);
  await no(createReminder(h.ctx, U('jan'), { message_id: '00000000-0000-4000-8000-000000000000', remind_at: '2026-10-20T09:00:00Z' }), 404);
  const r1 = (await createReminder(h.ctx, U('jan'), { message_id: m.id, remind_at: '2026-10-20T09:00:00Z' })).reminder;
  assert.equal(r1.conversation_id, CONV.group);
  const r2 = (await createReminder(h.ctx, U('jan'), { message_id: m.id, remind_at: '2026-10-21T07:00:00Z' })).reminder;
  assert.equal(r2.id, r1.id, 'ta sama pozycja');
  assert.equal(new Date(r2.remind_at).toISOString(), '2026-10-21T07:00:00.000Z');
  const { reminders } = await listReminders(h.ctx, U('jan'));
  assert.equal(reminders.length, 1);
  assert.deepEqual(
    [reminders[0].available, reminders[0].preview, reminders[0].sender_name, reminders[0].conversation_title, reminders[0].link],
    [true, 'Przynieś klucze do sali', 'Ola Nowak', 'Zespół', reminderLink(CONV.group, m.id)],
  );
  assert.equal((await listReminders(h.ctx, U('ola'))).reminders.length, 0, 'cudzych nie widać');
  await no(cancelReminder(h.ctx, U('ola'), { id: r1.id }), 404);
  assert.equal((await cancelReminder(h.ctx, U('jan'), { id: r1.id })).reminder.status, 'cancelled');
});

test('worker przypomnień: push + wpis „reminder” z linkiem; opuszczona rozmowa / usunięta wiadomość — przepada', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  const [m1] = await q1(`INSERT INTO messages (conversation_id, sender_email, content) VALUES ($1, 'ola@x.pl', 'Spotkanie liderów w czwartek') RETURNING *`, [CONV.group]);
  const [m2] = await q1(`INSERT INTO messages (conversation_id, sender_email, content) VALUES ($1, 'jan@x.pl', 'Moja notatka') RETURNING *`, [CONV.direct]);
  const [m3] = await q1(`INSERT INTO messages (conversation_id, sender_email, content) VALUES ($1, 'jan@x.pl', 'Zniknie') RETURNING *`, [CONV.group]);
  const a = (await createReminder(h.ctx, U('jan'), { message_id: m1.id, remind_at: '2026-10-20T09:00:00Z' })).reminder;
  const b = (await createReminder(h.ctx, U('jan'), { message_id: m2.id, remind_at: '2026-10-20T09:00:00Z' })).reminder;
  const c = (await createReminder(h.ctx, U('ewa'), { message_id: m1.id, remind_at: '2026-10-20T09:00:00Z' })).reminder;
  const d = (await createReminder(h.ctx, U('ola'), { message_id: m3.id, remind_at: '2026-10-20T09:00:00Z' })).reminder;
  await db.query(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_email = 'ewa@x.pl'`, [CONV.group]);
  await db.query(`UPDATE messages SET deleted_at = now() WHERE id = $1`, [m3.id]);
  h.at('2026-10-20T08:59:00Z');
  assert.deepEqual(await runReminders(db, h.worker, h.deps), { sent: 0, skipped: 0 });
  h.at('2026-10-20T09:00:10Z');
  assert.deepEqual(await runReminders(db, h.worker, h.deps), { sent: 2, skipped: 2 });
  const st = Object.fromEntries((await q1(`SELECT id, status FROM message_reminders WHERE id = ANY($1::uuid[])`, [[a.id, b.id, c.id, d.id]])).map((r) => [r.id, r.status]));
  assert.deepEqual([st[a.id], st[b.id], st[c.id], st[d.id]], ['done', 'done', 'cancelled', 'cancelled']);
  assert.equal(h.delivered.length, 2);
  const ra = h.delivered.find((x) => x.data.message_id === m1.id);
  assert.deepEqual([ra.user_email, ra.type, ra.title, ra.body, ra.link], [
    'jan@x.pl', 'reminder', 'Przypomnienie', 'Wiadomość od Ola Nowak w Zespół: Spotkanie liderów w czwartek', reminderLink(CONV.group, m1.id),
  ]);
  assert.deepEqual(ra.push, { type: 'reminder', conversation_id: CONV.group, message_id: m1.id, reminder_id: a.id });
  assert.equal(h.delivered.find((x) => x.data.message_id === m2.id).body, 'Twoja wiadomość w rozmowie prywatnej: Moja notatka');
  assert.equal((await runReminders(db, h.worker, h.deps)).sent, 0, 'bez powtórek');
  await db.query(`INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ($1, 'ewa@x.pl', 'member')`, [CONV.group]);
});

test('worker przypomnień: prawdziwe doręczenie zapisuje wpis „reminder” w Powiadomieniach', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  const [m] = await q1(`INSERT INTO messages (conversation_id, sender_email, content) VALUES ($1, 'ola@x.pl', 'Zadzwoń do pastora') RETURNING *`, [CONV.group]);
  await createReminder(h.ctx, U('jan'), { message_id: m.id, remind_at: '2026-10-20T09:00:00Z' });
  h.at('2026-10-20T09:01:00Z');
  const pushes = [];
  const { deliverNotifications } = await import('../src/dataapi/boardNotify.js');
  const deps = { ...h.deps, deliver: (o) => deliverNotifications({ ...o, deps: { sendPush: async (pool, p) => { pushes.push(p); }, emit: () => {} } }) };
  assert.equal((await runReminders(db, h.worker, deps)).sent, 1);
  const [n] = await q1(`SELECT * FROM notifications WHERE type = 'reminder' AND data->>'message_id' = $1`, [m.id]);
  assert.equal(n.user_email, 'jan@x.pl');
  assert.equal(n.link, reminderLink(CONV.group, m.id));
  assert.equal(n.data.conversation_id, CONV.group);
  assert.equal(pushes[0].data.type, 'reminder');
  assert.equal(pushes[0].link, reminderLink(CONV.group, m.id));
});

test('przypomnienie o odpowiedzi w wątku: link i lista z &thread=', { skip: skipDb }, async () => {
  const h = harness('2026-10-20T08:00:00Z');
  const [root] = await q1(`INSERT INTO messages (conversation_id, sender_email, content) VALUES ($1, 'jan@x.pl', 'Plan wyjazdu') RETURNING *`, [CONV.group]);
  const [reply] = await q1(`INSERT INTO messages (conversation_id, sender_email, content, thread_root_id) VALUES ($1, 'ola@x.pl', 'Biorę namiot', $2) RETURNING *`, [CONV.group, root.id]);
  await createReminder(h.ctx, U('ewa'), { message_id: reply.id, remind_at: '2026-10-20T09:00:00Z' });
  const link = reminderLink(CONV.group, reply.id, root.id);
  const { reminders } = await listReminders(h.ctx, U('ewa'));
  assert.deepEqual([reminders[0].link, reminders[0].thread_root_id], [link, root.id]);
  h.at('2026-10-20T09:00:30Z');
  assert.equal((await runReminders(db, h.worker, h.deps)).sent, 1);
  const d = h.delivered.find((x) => x.data.message_id === reply.id);
  assert.equal(d.link, link);
  assert.equal(d.push.thread_root_id, root.id);
});
