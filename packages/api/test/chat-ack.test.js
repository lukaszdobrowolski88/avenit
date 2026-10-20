// Komunikator — „Ważne — potwierdź przeczytanie” (migracja 115) i media/pliki/linki/głosówki rozmowy
// (fn chat-ack, chat-media). Czysta logika zawsze; zapytania na PRAWDZIWYM SQL (PGlite), gdy dostępny:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/chat-ack.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  summarizeAcks, nextRemindAt, canManageAcks, reminderPushText, REMIND_INTERVAL_MS,
  ackMessage, ackStatus, remindAck, pendingAcks,
} from '../src/dataapi/komunikatorAcks.js';
import {
  attachmentKind, extractLinks, domainOf, encodeCursor, decodeCursor, conversationMedia,
} from '../src/dataapi/komunikatorMedia.js';
import { pushKind, messagePushText, isImportant, localMinutes } from '../src/realtime/push-hooks.js';
import { REGISTRY } from '../src/dataapi/registry.js';
import { isConversationTable, conversationScope } from '../src/dataapi/komunikator.js';
import ackHandler from '../src/fn/chat-ack.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

// ── Czysta logika ───────────────────────────────────────────────────────────
test('potwierdzenia: podsumowanie liczy tylko obecnych odbiorców, bez duplikatów i wielkości liter', () => {
  const s = summarizeAcks(
    [{ email: 'Ola@x.pl', name: 'Ola' }, { email: 'ewa@x.pl', name: 'Ewa' }, { email: 'adam@x.pl', name: '' }, { email: 'ola@x.pl', name: 'Ola 2' }],
    [{ email: 'ola@x.pl', acked_at: '2026-10-20T10:05:00Z' }, { user_email: 'ADAM@x.pl', acked_at: '2026-10-20T10:01:00Z' }, { email: 'byly@x.pl', acked_at: '2026-10-20T09:00:00Z' }],
  );
  assert.equal(s.total, 3);
  assert.equal(s.acked_count, 2);
  assert.deepEqual(s.acked.map((a) => a.email), ['adam@x.pl', 'ola@x.pl']); // od najwcześniejszego
  assert.equal(s.acked[0].name, 'adam@x.pl'); // bez nazwy — e-mail
  assert.deepEqual(s.pending, [{ email: 'ewa@x.pl', name: 'Ewa' }]);
  assert.deepEqual(summarizeAcks([], []), { total: 0, acked_count: 0, acked: [], pending: [] });
});

test('przypomnienie: raz na 6 h; zarządza nadawca albo administrator rozmowy', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  assert.equal(REMIND_INTERVAL_MS, 6 * 3600 * 1000);
  assert.equal(nextRemindAt(null, now), null);
  assert.equal(nextRemindAt('2026-10-20T05:59:00Z', now), null);
  assert.equal(nextRemindAt('2026-10-20T10:00:00Z', now), '2026-10-20T16:00:00.000Z');
  assert.equal(canManageAcks({ sender_email: 'Jan@x.pl' }, 'member', 'jan@x.pl'), true);
  assert.equal(canManageAcks({ sender_email: 'jan@x.pl' }, 'admin', 'ola@x.pl'), true);
  assert.equal(canManageAcks({ sender_email: 'jan@x.pl' }, 'member', 'ola@x.pl'), false);
  assert.deepEqual(reminderPushText({ conv: { type: 'group', name: 'Liderzy' }, senderName: 'Jan', preview: 'Próba o 17' }),
    { title: 'Ważne: potwierdź przeczytanie — Liderzy', body: 'Jan: Próba o 17' });
  assert.deepEqual(reminderPushText({ conv: { type: 'direct' }, senderName: 'Jan', preview: 'Hej' }),
    { title: 'Ważne: potwierdź przeczytanie', body: 'Jan: Hej' });
});

test('push ważnej wiadomości: „Ważne: …”, od administratora przebija wyciszenie, ale nie ciche godziny', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  assert.equal(pushKind({ muted: true, quiet: false, important: true, now }), 'important');
  assert.equal(pushKind({ muted: false, mutedUntil: '2026-10-21T00:00:00Z', quiet: false, important: true, now }), 'important');
  assert.equal(pushKind({ muted: false, quiet: true, important: true, now }), null);
  assert.equal(pushKind({ muted: true, quiet: true, important: true, personalMention: true, now }), 'mention');
  assert.equal(pushKind({ muted: true, quiet: false, important: false, now }), null); // zwykła — wyciszenie działa
  assert.deepEqual(messagePushText({ conv: { type: 'group', name: 'Liderzy' }, senderName: 'Jan', preview: 'Zebranie', important: true }),
    { title: 'Ważne: Liderzy', body: 'Jan: Zebranie' });
  assert.deepEqual(messagePushText({ conv: { type: 'direct' }, senderName: 'Jan', preview: 'Hej', mention: 'me', important: true }),
    { title: 'Ważne: Jan wspomniał(a) Cię', body: 'Hej' });
  assert.deepEqual(messagePushText({ conv: { type: 'direct' }, senderName: 'Jan', preview: 'Hej' }), { title: 'Jan', body: 'Hej' });
  // Razem z wątkiem (112): „Ważne: …” nad tekstem wątku.
  assert.deepEqual(messagePushText({ conv: { type: 'group', name: 'Liderzy' }, senderName: 'Jan', preview: 'Zebranie', thread: true, important: true }),
    { title: 'Ważne: Liderzy', body: 'Jan w wątku: Zebranie' });
  assert.equal(isImportant({ requires_ack: true }), true);
  assert.equal(isImportant({ requires_ack: 'true' }), true);
  assert.equal(isImportant({ requires_ack: false }), false);
  assert.equal(isImportant({}), false);
});

test('rejestr: message_acks tylko do odczytu, zakres uczestników rozmowy; przypomnienia poza rejestrem', () => {
  assert.equal(REGISTRY.message_acks.readOnly, true);
  assert.equal(REGISTRY.message_ack_reminders, undefined);
  assert.equal(isConversationTable('message_acks'), true);
  const scope = conversationScope('message_acks', { email: 'jan@x.pl' });
  const params = [];
  const sql = scope.select('t', (v) => { params.push(v); return params.length; });
  assert.match(sql, /conversation_participants/);
  assert.match(sql, /FROM messages m_ WHERE m_\."id" = t\."message_id"/);
});

test('media: rodzaje załączników, linki z treści, kursor', () => {
  assert.equal(attachmentKind({ url: '/a', type: 'image/png' }), 'media');
  assert.equal(attachmentKind({ url: '/a', type: 'video/mp4' }), 'media');
  assert.equal(attachmentKind({ url: '/a', type: 'audio/webm', isVoiceMessage: true }), 'voice');
  assert.equal(attachmentKind({ url: '/a', name: 'voice-1-3s.m4a', type: 'audio/m4a' }), 'voice');
  assert.equal(attachmentKind({ url: '/a', type: 'application/pdf', name: 'plan.pdf' }), 'files');
  assert.equal(attachmentKind({ type: 'image/png' }), null);
  assert.deepEqual(extractLinks('Zobacz https://avenit.pl/cennik. i www.schwro.pl, oraz (https://pl.wikipedia.org/wiki/Foo_(bar)) jan@www.x.pl https://avenit.pl/cennik'),
    ['https://avenit.pl/cennik', 'https://www.schwro.pl', 'https://pl.wikipedia.org/wiki/Foo_(bar)']);
  assert.deepEqual(extractLinks('javascript:alert(1) ftp://x.pl'), []);
  assert.equal(domainOf('https://www.youtube.com/watch?v=1'), 'youtube.com');
  const c = encodeCursor(['2026-10-20 10:00:00.123456+00', '00000000-0000-4000-8000-000000000001', 2]);
  assert.deepEqual(decodeCursor(c), { ts: '2026-10-20 10:00:00.123456+00', id: '00000000-0000-4000-8000-000000000001', ord: 2 });
  assert.equal(decodeCursor('zepsuty'), null);
  assert.equal(decodeCursor(encodeCursor(['nie-data', 'x', 1])), null);
});

// ── Prawdziwy SQL (PGlite) ──────────────────────────────────────────────────
const MIG = new URL('../db/tenant-migrations/115_message_acks.sql', import.meta.url);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C_GROUP = id(1), C_OTHER = id(2), C_ANN = id(3);
const M_IMP = id(11), M_PLAIN = id(12), M_OTHER = id(13), M_ANN = id(14), M_DEL = id(15);
const log = { error() {}, warn() {}, info() {} };
const U = (n) => ({ email: `${n}@x.pl` });

function poolOf(pg) {
  return {
    async query(sql, params) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}

let db;
let pg;
const emitted = [];
const pushed = [];
const ctx = () => ({
  db,
  tenantSlug: 't',
  log,
  deps: {
    inline: true,
    emit: (...a) => emitted.push(a),
    sendPush: async (_db, p) => { pushed.push(p); return { status: 200 }; },
  },
});

before(async () => {
  if (skip) return;
  pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, full_name text, name text, role text, is_active boolean DEFAULT true);
    CREATE TABLE conversations (id uuid PRIMARY KEY, type text, name text, posting_policy text DEFAULT 'everyone', ministry_key text, created_by text);
    CREATE TABLE conversation_participants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      user_email text NOT NULL, role text DEFAULT 'member', muted boolean DEFAULT false, muted_until timestamptz, UNIQUE (conversation_id, user_email));
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      sender_email text NOT NULL, content text NOT NULL DEFAULT '', attachments jsonb DEFAULT '[]', message_type text DEFAULT 'text',
      deleted_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE push_user_preferences (user_email text, quiet_hours_start time, quiet_hours_end time, timezone text);
    CREATE TABLE user_blocks (blocker_email text, blocked_email text);
    CREATE TABLE link_previews (url text PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}', fetched_at timestamptz NOT NULL DEFAULT now());
  `);
  await pg.exec(fs.readFileSync(MIG, 'utf8'));
  await pg.exec(fs.readFileSync(MIG, 'utf8')); // idempotentna
  // Adam: ciche godziny teraz (±1 h czasu warszawskiego).
  const cur = localMinutes(new Date(), 'Europe/Warsaw');
  const hm = (m) => { const v = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
  await db.query(`INSERT INTO push_user_preferences (user_email, quiet_hours_start, quiet_hours_end, timezone) VALUES ('adam@x.pl', $1, $2, 'Europe/Warsaw')`, [hm(cur - 60), hm(cur + 60)]);
  await pg.exec(`
    INSERT INTO app_users (email, full_name) VALUES ('jan@x.pl', 'Jan Nowak'), ('ola@x.pl', 'Ola Kos'), ('ewa@x.pl', 'Ewa Lis'), ('adam@x.pl', 'Adam Wójcik'), ('obcy@x.pl', 'Obcy');
    INSERT INTO conversations (id, type, name) VALUES ('${C_GROUP}', 'group', 'Liderzy'), ('${C_OTHER}', 'group', 'Inna'), ('${C_ANN}', 'announcement', 'Ogłoszenia');
    INSERT INTO conversation_participants (conversation_id, user_email, role, muted) VALUES
      ('${C_GROUP}', 'jan@x.pl', 'member', false), ('${C_GROUP}', 'Ola@x.pl', 'admin', true), ('${C_GROUP}', 'ewa@x.pl', 'member', false),
      ('${C_GROUP}', 'adam@x.pl', NULL, false),
      ('${C_OTHER}', 'obcy@x.pl', 'member', false), ('${C_OTHER}', 'ola@x.pl', 'member', false),
      ('${C_ANN}', 'ola@x.pl', 'admin', false), ('${C_ANN}', 'jan@x.pl', 'member', false);
    INSERT INTO messages (id, conversation_id, sender_email, content, requires_ack, created_at) VALUES
      ('${M_IMP}', '${C_GROUP}', 'jan@x.pl', 'Zebranie w sobotę o 10', true, now() - interval '3 hours'),
      ('${M_PLAIN}', '${C_GROUP}', 'ola@x.pl', 'Zwykła wiadomość', false, now() - interval '2 hours'),
      ('${M_OTHER}', '${C_OTHER}', 'obcy@x.pl', 'Ważne gdzie indziej', true, now() - interval '2 hours'),
      ('${M_ANN}', '${C_ANN}', 'ola@x.pl', 'Ogłoszenie', true, now() - interval '1 hour');
    INSERT INTO messages (id, conversation_id, sender_email, content, requires_ack, deleted_at) VALUES
      ('${M_DEL}', '${C_GROUP}', 'ola@x.pl', 'usunięta', true, now());
  `);
});

test('migracja 115: kolumna requires_ack (domyślnie false), unikalne potwierdzenie', { skip }, async () => {
  const { rows } = await db.query(`INSERT INTO messages (conversation_id, sender_email, content) VALUES ($1, 'jan@x.pl', 'x') RETURNING requires_ack`, [C_OTHER]);
  assert.equal(rows[0].requires_ack, false);
  await db.query(`DELETE FROM messages WHERE content = 'x'`);
});

test('„Rozumiem”: tylko uczestnik, nie nadawca, tylko ważne; ponowne kliknięcie bez duplikatu; realtime do rozmowy', { skip }, async () => {
  emitted.length = 0;
  const r1 = await ackMessage(ctx(), U('ewa'), { message_id: M_IMP });
  assert.equal(r1.ok, true);
  assert.equal(r1.ack.user_email, 'ewa@x.pl');
  assert.equal(emitted.length, 1);
  const [slug, table, op, rows, opts] = emitted[0];
  assert.deepEqual([slug, table, op, rows.length], ['t', 'message_acks', 'insert', 1]);
  assert.deepEqual([...opts.audience].sort(), ['adam@x.pl', 'ewa@x.pl', 'jan@x.pl', 'ola@x.pl']);
  const r2 = await ackMessage(ctx(), { email: 'EWA@x.pl' }, { message_id: M_IMP });
  assert.equal(r2.ack.id, r1.ack.id);
  assert.equal(emitted.length, 1); // bez drugiego zdarzenia
  await assert.rejects(ackMessage(ctx(), U('jan'), { message_id: M_IMP }), (e) => e.status === 400 && e.code === 'ACK_OWN');
  await assert.rejects(ackMessage(ctx(), U('obcy'), { message_id: M_IMP }), (e) => e.status === 403);
  await assert.rejects(ackMessage(ctx(), U('ewa'), { message_id: M_PLAIN }), (e) => e.status === 400 && e.code === 'ACK_NOT_IMPORTANT');
  await assert.rejects(ackMessage(ctx(), U('ewa'), { message_id: M_DEL }), (e) => e.status === 404);
  await assert.rejects(ackMessage(ctx(), U('ewa'), { message_id: 'nie-uuid' }), (e) => e.status === 400);
});

test('lista potwierdzeń: nadawca i administrator rozmowy; pozostali 403', { skip }, async () => {
  const s = await ackStatus(ctx(), U('jan'), { message_id: M_IMP });
  assert.equal(s.total, 3);
  assert.equal(s.acked_count, 1);
  assert.deepEqual(s.acked.map((a) => [a.email, a.name]), [['ewa@x.pl', 'Ewa Lis']]);
  assert.deepEqual(s.pending.map((a) => a.name), ['Adam Wójcik', 'Ola Kos']);
  assert.equal(s.last_reminded_at, null);
  assert.equal(s.next_remind_at, null);
  const asAdmin = await ackStatus(ctx(), U('ola'), { message_id: M_IMP });
  assert.equal(asAdmin.total, 3);
  await assert.rejects(ackStatus(ctx(), U('ewa'), { message_id: M_IMP }), (e) => e.status === 403 && e.code === 'ACK_STATUS_FORBIDDEN');
  await assert.rejects(ackStatus(ctx(), U('obcy'), { message_id: M_IMP }), (e) => e.status === 403);
});

test('przypomnienie: push tylko do niepotwierdzonych (wyciszenie przebite, ciche godziny i blokady szanowane), raz na 6 h', { skip }, async () => {
  pushed.length = 0;
  await db.query(`INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('nikt@x.pl', 'jan@x.pl')`);
  await assert.rejects(remindAck(ctx(), U('ewa'), { message_id: M_IMP }), (e) => e.status === 403);
  const r = await remindAck(ctx(), U('jan'), { message_id: M_IMP });
  assert.equal(r.pending, 2); // Ola, Adam (Ewa potwierdziła)
  assert.equal(r.skipped_quiet, 1); // Adam — ciche godziny
  assert.equal(r.sent, 1);
  assert.ok(r.next_remind_at);
  assert.deepEqual(pushed.map((p) => p.user_email), ['Ola@x.pl']); // wyciszona, ale przypomnienie dochodzi
  assert.equal(pushed[0].title, 'Ważne: potwierdź przeczytanie — Liderzy');
  assert.equal(pushed[0].body, 'Jan Nowak: Zebranie w sobotę o 10');
  assert.equal(pushed[0].data.important, true);
  assert.equal(pushed[0].data.message_id, M_IMP);
  assert.equal(pushed[0].link, `/komunikator?conversation=${C_GROUP}&message=${M_IMP}`); // skok do wiadomości
  // Drugi raz zaraz potem — 429 z terminem.
  await assert.rejects(remindAck(ctx(), U('ola'), { message_id: M_IMP }), (e) => e.status === 429 && e.code === 'ACK_REMIND_TOO_SOON' && !!e.next_remind_at);
  const s = await ackStatus(ctx(), U('jan'), { message_id: M_IMP });
  assert.ok(s.last_reminded_at && s.next_remind_at);
  // Po 6 h — znowu wolno.
  await db.query(`UPDATE message_ack_reminders SET last_sent_at = now() - interval '7 hours' WHERE message_id = $1`, [M_IMP]);
  pushed.length = 0;
  const again = await remindAck(ctx(), U('ola'), { message_id: M_IMP });
  assert.equal(again.sent, 1);
  const { rows } = await db.query(`SELECT sent_count, sent_by FROM message_ack_reminders WHERE message_id = $1`, [M_IMP]);
  assert.deepEqual(rows[0], { sent_count: 2, sent_by: 'ola@x.pl' });
});

test('przypomnienie, gdy wszyscy potwierdzili: nic nie wysyła i nie zużywa limitu', { skip }, async () => {
  await ackMessage(ctx(), U('jan'), { message_id: M_ANN });
  pushed.length = 0;
  const r = await remindAck(ctx(), U('ola'), { message_id: M_ANN });
  assert.deepEqual([r.sent, r.pending], [0, 0]);
  assert.equal(pushed.length, 0);
  const { rows } = await db.query(`SELECT 1 FROM message_ack_reminders WHERE message_id = $1`, [M_ANN]);
  assert.equal(rows.length, 0);
});

test('plakietka „Ważne”: liczba niepotwierdzonych ważnych wiadomości w moich rozmowach', { skip }, async () => {
  assert.deepEqual((await pendingAcks(ctx(), U('ola'))).counts, { [C_GROUP]: 1, [C_OTHER]: 1 });
  await ackMessage(ctx(), U('ola'), { message_id: M_IMP });
  assert.deepEqual((await pendingAcks(ctx(), U('ola'))).counts, { [C_OTHER]: 1 });
  assert.deepEqual((await pendingAcks(ctx(), U('jan'))).counts, {}); // własna + ogłoszenie potwierdzone
  assert.deepEqual((await pendingAcks(ctx(), U('adam'))).counts, { [C_GROUP]: 1 });
});

test('handler chat-ack: kody HTTP i termin przy 429', { skip }, async () => {
  const reply = () => ({ statusCode: 200, body: null, code(n) { this.statusCode = n; return this; }, send(b) { this.body = b; return this; } });
  const r1 = reply();
  await ackHandler({ db, tenant: null, user: U('ewa'), body: { action: 'nieznana' }, log }, r1);
  assert.equal(r1.statusCode, 400);
  const r2 = reply();
  await ackHandler({ db, tenant: null, user: U('ewa'), body: { action: 'status', message_id: M_IMP }, log }, r2);
  assert.equal(r2.statusCode, 403);
  const r3 = reply();
  await ackHandler({ db, tenant: null, user: U('jan'), body: { action: 'remind', message_id: M_IMP }, log }, r3);
  assert.equal(r3.statusCode, 429);
  assert.equal(r3.body.code, 'ACK_REMIND_TOO_SOON');
  assert.ok(r3.body.next_remind_at);
  const r4 = reply();
  await ackHandler({ db, tenant: null, user: U('adam'), body: { action: 'pending' }, log }, r4);
  assert.equal(r4.statusCode, 200);
  assert.ok(r4.body.counts);
});

// ── Media / pliki / linki / głosówki ─────────────────────────────────────────
test('chat-media: rodzaje filtrowane w SQL, paczki z kursorem bez dziur i powtórzeń, tylko uczestnik', { skip }, async () => {
  const C = id(50);
  await db.query(`INSERT INTO conversations (id, type, name) VALUES ($1, 'group', 'Media')`, [C]);
  await db.query(`INSERT INTO conversation_participants (conversation_id, user_email) VALUES ($1, 'jan@x.pl'), ($1, 'ola@x.pl')`, [C]);
  const att = (n) => JSON.stringify([
    { url: `/storage/v1/object/public/messenger-attachments/${C}/img${n}.png`, type: 'image/png', name: `img${n}.png`, size: 100 },
    { url: `/storage/v1/object/public/messenger-attachments/${C}/doc${n}.pdf`, type: 'application/pdf', name: `doc${n}.pdf`, size: 2000 },
  ]);
  // 7 wiadomości po 2 załączniki, ta sama sekunda (kolejność po id i pozycji).
  for (let i = 0; i < 7; i += 1) {
    await db.query(`INSERT INTO messages (id, conversation_id, sender_email, content, attachments, created_at) VALUES ($1, $2, 'jan@x.pl', '', $3::jsonb, '2026-10-20T10:00:00.123456Z')`, [id(60 + i), C, att(i)]);
  }
  await db.query(`INSERT INTO messages (conversation_id, sender_email, content, attachments, created_at) VALUES
    ($1, 'ola@x.pl', '', '[{"url":"/v.webm","type":"audio/webm","isVoiceMessage":true,"duration":4,"name":"Wiadomość głosowa"}]', '2026-10-20T11:00:00Z'),
    ($1, 'ola@x.pl', '', '[{"url":"/film.mp4","type":"video/mp4","name":"film.mp4"}]', '2026-10-20T11:30:00Z'),
    ($1, 'ola@x.pl', '', '{}', '2026-10-20T11:40:00Z'),
    ($1, 'ola@x.pl', 'Usunięte https://x.pl', '[{"url":"/del.png","type":"image/png"}]', '2026-10-20T11:50:00Z'),
    ($1, 'jan@x.pl', 'Cennik: https://avenit.pl/cennik i www.schwro.pl', '[]', '2026-10-20T12:00:00Z'),
    ($1, 'jan@x.pl', 'Bez linku', '[]', '2026-10-20T12:10:00Z')`, [C]);
  await db.query(`UPDATE messages SET deleted_at = now() WHERE content LIKE 'Usunięte%'`);
  await db.query(`INSERT INTO link_previews (url, data) VALUES ('https://avenit.pl/cennik', '{"title":"Cennik Avenit","siteName":"Avenit"}')`);

  // Media: 7 zdjęć + film, paczkami po 3.
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = await conversationMedia({ db }, U('ola'), { conversation_id: C, kind: 'media', limit: 3, cursor });
    pages += 1;
    seen.push(...page.items.map((i) => i.attachment.name));
    cursor = page.next;
  } while (cursor && pages < 10);
  assert.equal(seen.length, 8);
  assert.equal(new Set(seen).size, 8);
  assert.equal(seen[0], 'film.mp4'); // najnowsze najpierw
  assert.equal(pages, 3);

  const files = await conversationMedia({ db }, U('jan'), { conversation_id: C, kind: 'files', limit: 100 });
  assert.equal(files.items.length, 7);
  assert.ok(files.items.every((i) => i.attachment.type === 'application/pdf'));
  assert.equal(files.items[0].sender_name, 'Jan Nowak');
  assert.equal(files.next, null);

  const voice = await conversationMedia({ db }, U('jan'), { conversation_id: C, kind: 'voice' });
  assert.deepEqual(voice.items.map((i) => [i.attachment.url, i.sender_name]), [['/v.webm', 'Ola Kos']]);

  const links = await conversationMedia({ db }, U('jan'), { conversation_id: C, kind: 'links' });
  assert.deepEqual(links.items.map((i) => [i.url, i.domain, i.title, i.site_name]), [
    ['https://avenit.pl/cennik', 'avenit.pl', 'Cennik Avenit', 'Avenit'],
    ['https://www.schwro.pl', 'schwro.pl', null, null],
  ]);

  await assert.rejects(conversationMedia({ db }, U('obcy'), { conversation_id: C, kind: 'media' }), (e) => e.status === 403);
  await assert.rejects(conversationMedia({ db }, U('jan'), { conversation_id: C, kind: 'wszystko' }), (e) => e.status === 400);
  await assert.rejects(conversationMedia({ db }, U('jan'), { conversation_id: C, kind: 'media', cursor: 'zły' }), (e) => e.status === 400);
});
