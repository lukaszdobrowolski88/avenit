// Wątki w Komunikatorze (migracja 112, komunikatorThreads.js): główna oś bez odpowiedzi, zapis
// odpowiedzi (korzeń w tej samej rozmowie, spłaszczenie, liczniki tylko z triggera), obserwujący,
// powiadomienia tylko dla obserwujących i wspomnianych, push „w wątku”, realtime wiadomości głównej.
//
// PGlite: testy bazy pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test packages/api/test/komunikator-threads.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyMainFeedDefault, normalizeThreadWrite, threadRootsTouched, emitThreadRoots, threadFollowerEmails, threadPushAllowed,
} from '../src/dataapi/komunikatorThreads.js';
import { enforceConversationWrite, conversationAudience, conversationScope, isConversationTable } from '../src/dataapi/komunikator.js';
import { getTableRule } from '../src/dataapi/registry.js';
import { buildQuery } from '../src/dataapi/querybuilder.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

function fakeDb(handlers) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      for (const [frag, fn] of handlers) if (sql.includes(frag)) return { rows: fn(params) };
      return { rows: [] };
    },
  };
}
const req = (db, email = 'jan@x.pl') => ({ user: { email }, db, tenant: { slug: 't', db_name: 't' } });
const rejectsWith = (p, status, code) => assert.rejects(p, (e) => e.status === status && (!code || e.code === code));

// ── Główna oś rozmowy ───────────────────────────────────────────────────────
test('odczyt wiadomości bez wskazania wątku/id — tylko główna oś (thread_root_id IS NULL)', () => {
  const q = { table: 'messages', op: 'select', filters: [{ type: 'eq', column: 'conversation_id', value: 'c1' }, { type: 'is', column: 'deleted_at', value: null }] };
  applyMainFeedDefault(q);
  assert.deepEqual(q.filters.at(-1), { type: 'is', column: 'thread_root_id', value: null });
  assert.match(buildQuery(q).sql, /"thread_root_id" IS NULL/);

  // Bez filtrów (np. head+count) też.
  const bare = { table: 'messages', op: 'select' };
  applyMainFeedDefault(bare);
  assert.equal(bare.filters.length, 1);

  // Wątek, konkretne wiadomości (cytaty, skok, podgląd) — bez zmian.
  for (const f of [
    { type: 'eq', column: 'thread_root_id', value: 'r1' },
    { type: 'in', column: 'thread_root_id', value: ['r1'] },
    { type: 'eq', column: 'id', value: 'm1' },
    { type: 'in', column: 'id', value: ['m1', 'm2'] },
    { type: 'or', value: 'thread_root_id.is.null,id.eq.m9' },
    { type: 'match', value: { id: 'm1' } },
  ]) {
    const x = { table: 'messages', op: 'select', filters: [f] };
    applyMainFeedDefault(x);
    assert.equal(x.filters.length, 1, JSON.stringify(f));
  }
  // Inne tabele / zapisy — bez zmian.
  const other = { table: 'pinned_messages', op: 'select', filters: [] };
  applyMainFeedDefault(other);
  assert.equal(other.filters.length, 0);
  const ins = { table: 'messages', op: 'insert', values: {} };
  applyMainFeedDefault(ins);
  assert.equal(ins.filters, undefined);
});

// ── Zapis odpowiedzi ────────────────────────────────────────────────────────
const rootsDb = (roots) => fakeDb([
  ['FROM messages WHERE id::text', (p) => (roots[p[0]] ? [roots[p[0]]] : [])],
  ['FROM conversations c', (p) => [{ id: p[0], type: 'group', posting_policy: roots.__policy || 'everyone', n: 3 }]],
  ['FROM conversation_participants WHERE conversation_id', () => (roots.__role === false ? [] : [{ role: roots.__role || 'member' }])],
]);
const ROOTS = {
  r1: { id: 'r1', conversation_id: 'c1', thread_root_id: null, deleted_at: null },
  r2: { id: 'r2', conversation_id: 'c1', thread_root_id: 'r1', deleted_at: null }, // odpowiedź w wątku r1
  gone: { id: 'gone', conversation_id: 'c1', thread_root_id: null, deleted_at: '2026-10-01T00:00:00Z' },
  other: { id: 'other', conversation_id: 'c2', thread_root_id: null, deleted_at: null },
};

test('odpowiedź: rozmowa z wiadomości głównej, spłaszczenie do korzenia, liczniki od klienta wycięte', async () => {
  const q = { table: 'messages', op: 'insert', values: { thread_root_id: 'r2', content: 'ok', thread_reply_count: 99, thread_last_reply_at: 'x' } };
  await enforceConversationWrite(q, req(rootsDb(ROOTS)));
  assert.equal(q.values.thread_root_id, 'r1');
  assert.equal(q.values.conversation_id, 'c1');
  assert.equal(q.values.sender_email, 'jan@x.pl');
  assert.ok(!('thread_reply_count' in q.values) && !('thread_last_reply_at' in q.values));

  // Zwykła wiadomość: pusty thread_root_id znika, liczniki też.
  const plain = { table: 'messages', op: 'insert', values: { conversation_id: 'c1', content: 'x', thread_root_id: '', thread_reply_count: 3 } };
  await enforceConversationWrite(plain, req(rootsDb(ROOTS)));
  assert.ok(!('thread_root_id' in plain.values) && !('thread_reply_count' in plain.values));

  // „Ważne” (115) tylko na głównej osi: w odpowiedzi w wątku requires_ack znika, w zwykłej zostaje.
  const ackReply = { table: 'messages', op: 'insert', values: { thread_root_id: 'r1', content: 'ok', requires_ack: true } };
  await enforceConversationWrite(ackReply, req(rootsDb(ROOTS)));
  assert.ok(!('requires_ack' in ackReply.values));
  const ackMain = { table: 'messages', op: 'insert', values: { conversation_id: 'c1', content: 'ok', requires_ack: true } };
  await enforceConversationWrite(ackMain, req(rootsDb(ROOTS)));
  assert.equal(ackMain.values.requires_ack, true);
});

test('odpowiedź: inny wątek rozmowy, usunięta lub nieistniejąca wiadomość główna — odmowa', async () => {
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'c1', thread_root_id: 'other', content: 'x' } }, req(rootsDb(ROOTS))), 403, 'THREAD_OTHER_CONVERSATION');
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'c1', thread_root_id: 'gone', content: 'x' } }, req(rootsDb(ROOTS))), 409, 'THREAD_ROOT_DELETED');
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'c1', thread_root_id: 'nope', content: 'x' } }, req(rootsDb(ROOTS))), 404, 'THREAD_NOT_FOUND');
});

test('odpowiedź: te same zasady co rozmowa — kanał „tylko administratorzy”, uczestnik', async () => {
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'insert', values: { thread_root_id: 'r1', content: 'x' } },
    req(rootsDb({ ...ROOTS, __policy: 'admins' }))), 403);
  await enforceConversationWrite({ table: 'messages', op: 'insert', values: { thread_root_id: 'r1', content: 'x' } },
    req(rootsDb({ ...ROOTS, __policy: 'admins', __role: 'admin' })));
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'insert', values: { thread_root_id: 'r1', content: 'x' } },
    req(rootsDb({ ...ROOTS, __role: false }))), 403);
});

test('edycja: nie można przenieść do wątku ani ustawić liczników', async () => {
  const f = [{ type: 'eq', column: 'id', value: 'm1' }];
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'update', values: { thread_root_id: 'r1' }, filters: f }, req(fakeDb([]))), 403);
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'update', values: { thread_reply_count: 0 }, filters: f }, req(fakeDb([]))), 403);
  await enforceConversationWrite({ table: 'messages', op: 'update', values: { content: 'ok' }, filters: f }, req(fakeDb([])));
});

test('obserwowanie: tylko własny wpis, rozmowa z wiadomości głównej, ponowne obserwowanie = upsert', async () => {
  assert.ok(isConversationTable('message_thread_followers'));
  assert.ok(getTableRule('message_thread_followers'));
  const q = { table: 'message_thread_followers', op: 'insert', values: { root_id: 'r1', conversation_id: 'c2', following: true } };
  await enforceConversationWrite(q, req(rootsDb(ROOTS), 'Jan@X.pl'));
  assert.equal(q.values.conversation_id, 'c1'); // nie od klienta
  assert.equal(q.op, 'upsert');
  assert.equal(q.onConflict, 'root_id,user_email');
  assert.equal(q.values.user_email.toLowerCase(), 'jan@x.pl');

  await rejectsWith(enforceConversationWrite({ table: 'message_thread_followers', op: 'insert', values: { root_id: 'r1', user_email: 'ola@x.pl' } }, req(rootsDb(ROOTS))), 403);
  await rejectsWith(enforceConversationWrite({ table: 'message_thread_followers', op: 'insert', values: { root_id: 'r2' } }, req(rootsDb(ROOTS))), 400);
  await rejectsWith(enforceConversationWrite({ table: 'message_thread_followers', op: 'insert', values: { root_id: 'r1' } }, req(rootsDb({ ...ROOTS, __role: false }))), 403);
  await rejectsWith(enforceConversationWrite({ table: 'message_thread_followers', op: 'update', values: { root_id: 'r9' }, filters: [{ type: 'eq', column: 'id', value: 1 }] }, req(fakeDb([]))), 403);
  // Zakres: widzą uczestnicy, zmienia właściciel.
  const scope = conversationScope('message_thread_followers', { email: 'jan@x.pl' });
  assert.match(scope.select('t', () => 1), /conversation_participants/);
  assert.match(scope.update('t', () => 1), /lower\(t\."user_email"\) = \$1/);
});

test('push o odpowiedzi: obserwujący i wspomniani (osobiście albo @wszyscy)', () => {
  const followers = new Set(['ola@x.pl']);
  assert.equal(threadPushAllowed('Ola@X.pl', { followers, mentioned: new Set(), mentionsAll: false }), true);
  assert.equal(threadPushAllowed('ewa@x.pl', { followers, mentioned: new Set(), mentionsAll: false }), false);
  assert.equal(threadPushAllowed('ewa@x.pl', { followers, mentioned: new Set(['ewa@x.pl']), mentionsAll: false }), true);
  assert.equal(threadPushAllowed('ewa@x.pl', { followers, mentioned: new Set(), mentionsAll: true }), true);
  assert.deepEqual(threadRootsTouched('messages', 'insert', [{ thread_root_id: 'r1' }, { thread_root_id: 'r1' }, {}]), ['r1']);
  assert.deepEqual(threadRootsTouched('poll_votes', 'insert', [{ thread_root_id: 'r1' }]), []);
});

// ── Baza (PGlite) ───────────────────────────────────────────────────────────
let db;
let pg;
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
const C1 = '11111111-1111-1111-1111-111111111111';

before(async () => {
  if (skipDb) return;
  pg = new PGlite();
  db = { query: async (sql, params) => { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; } };
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text);
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text, posting_policy text DEFAULT 'everyone',
      ministry_key text, created_by text, updated_at timestamptz DEFAULT now());
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      user_email text, role text, last_read_at timestamptz, UNIQUE (conversation_id, user_email));
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      sender_email text NOT NULL, content text NOT NULL, message_type text DEFAULT 'text', attachments jsonb DEFAULT '[]',
      reply_to_id uuid, deleted_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_email text NOT NULL, title text NOT NULL, message text,
      type text DEFAULT 'info', is_read boolean DEFAULT false, link text, created_at timestamptz DEFAULT now(), body text, data jsonb, read boolean DEFAULT false);
    INSERT INTO app_users (email, full_name) VALUES ('jan@x.pl', 'Jan Kowalski'), ('ola@x.pl', 'Ola Nowak'), ('ewa@x.pl', 'Ewa'), ('adam@x.pl', 'Adam');
  `);
  for (const f of ['111_message_notification_place.sql']) {
    await pg.exec(fs.readFileSync(new URL(`../db/tenant-migrations/${f}`, import.meta.url), 'utf8'));
  }
  await pg.exec(`CREATE TRIGGER trigger_message_notification AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION create_message_notification();`);
  const sql = fs.readFileSync(new URL('../db/tenant-migrations/112_message_threads.sql', import.meta.url), 'utf8');
  await pg.exec(sql);
  await pg.exec(sql); // idempotentna
  await db.query(`INSERT INTO conversations (id, type, name) VALUES ($1, 'group', 'Liderzy')`, [C1]);
  for (const e of ['jan@x.pl', 'ola@x.pl', 'ewa@x.pl', 'adam@x.pl']) {
    await db.query(`INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ($1, $2, 'member')`, [C1, e]);
  }
});

const send = async (sender, content, extra = {}) => (await q1(
  `INSERT INTO messages (conversation_id, sender_email, content, thread_root_id, mentions) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
  [C1, sender, content, extra.root ?? null, JSON.stringify(extra.mentions ?? [])],
))[0];
const notesFor = async (messageId) => (await q1(`SELECT user_email, title, body, link, data FROM notifications WHERE data->>'message_id' = $1 ORDER BY user_email`, [messageId]));
const followers = async (root) => (await q1(`SELECT user_email, following, conversation_id FROM message_thread_followers WHERE root_id = $1 ORDER BY user_email`, [root]));

test('baza: zwykła wiadomość — powiadomienie dla wszystkich jak w 111', { skip: skipDb }, async () => {
  const root = await send('jan@x.pl', 'Plan na niedzielę');
  const notes = await notesFor(root.id);
  assert.deepEqual(notes.map((n) => n.user_email), ['adam@x.pl', 'ewa@x.pl', 'ola@x.pl']);
  assert.equal(notes[0].title, 'Liderzy');
  assert.equal(notes[0].body, 'Jan Kowalski: Plan na niedzielę');
  assert.equal(notes[0].link, `/komunikator?conversation=${C1}`);
  assert.equal(root.thread_reply_count, 0);
});

test('baza: odpowiedź w wątku — obserwujący, liczniki, powiadomienia tylko obserwującym i wspomnianym', { skip: skipDb }, async () => {
  const root = await send('jan@x.pl', 'Kto prowadzi uwielbienie?');
  // Pierwsza odpowiedź: autor wiadomości głównej już obserwuje (powiadomienie trafia do niego).
  const r1 = await send('ola@x.pl', 'Ja mogę', { root: root.id });
  assert.deepEqual((await followers(root.id)).map((f) => [f.user_email, f.following, f.conversation_id]),
    [['jan@x.pl', true, C1], ['ola@x.pl', true, C1]]);
  let notes = await notesFor(r1.id);
  assert.deepEqual(notes.map((n) => n.user_email), ['jan@x.pl']);
  assert.equal(notes[0].title, 'Liderzy');
  assert.equal(notes[0].body, 'Ola Nowak w wątku: Ja mogę');
  assert.equal(notes[0].link, `/komunikator?conversation=${C1}&thread=${root.id}`);
  assert.equal(notes[0].data.thread_root_id, root.id);

  // Wzmianka: wspomniany dostaje powiadomienie i zaczyna obserwować.
  const r2 = await send('jan@x.pl', '@Ewa też?', { root: root.id, mentions: ['Ewa@x.pl'] });
  notes = await notesFor(r2.id);
  assert.deepEqual(notes.map((n) => n.user_email), ['ewa@x.pl', 'ola@x.pl']);
  assert.ok((await followers(root.id)).some((f) => f.user_email === 'ewa@x.pl' && f.following));

  // Liczniki na wiadomości głównej.
  let [r] = await q1(`SELECT thread_reply_count, thread_last_reply_at FROM messages WHERE id = $1`, [root.id]);
  assert.equal(r.thread_reply_count, 2);
  assert.equal(new Date(r.thread_last_reply_at).getTime(), new Date(r2.created_at).getTime());

  // „Nie obserwuj” — kolejne odpowiedzi innych nie przywracają; własna odpowiedź tak.
  await db.query(`UPDATE message_thread_followers SET following = false WHERE root_id = $1 AND user_email = 'jan@x.pl'`, [root.id]);
  const r3 = await send('ola@x.pl', 'Ustalone', { root: root.id });
  assert.deepEqual((await notesFor(r3.id)).map((n) => n.user_email), ['ewa@x.pl']);
  assert.equal((await followers(root.id)).find((f) => f.user_email === 'jan@x.pl').following, false);
  await send('jan@x.pl', 'Dzięki', { root: root.id });
  assert.equal((await followers(root.id)).find((f) => f.user_email === 'jan@x.pl').following, true);

  // @wszyscy w wątku — cała rozmowa.
  const r5 = await send('ola@x.pl', '@wszyscy próba o 17', { root: root.id, mentions: ['*'] });
  assert.deepEqual((await notesFor(r5.id)).map((n) => n.user_email), ['adam@x.pl', 'ewa@x.pl', 'jan@x.pl']);

  // Usunięcie miękkie i twarde — liczniki od nowa.
  [r] = await q1(`SELECT thread_reply_count FROM messages WHERE id = $1`, [root.id]);
  assert.equal(r.thread_reply_count, 5);
  await db.query(`UPDATE messages SET deleted_at = now() WHERE id = $1`, [r3.id]);
  await db.query(`DELETE FROM messages WHERE id = $1`, [r5.id]);
  [r] = await q1(`SELECT thread_reply_count FROM messages WHERE id = $1`, [root.id]);
  assert.equal(r.thread_reply_count, 3);
});

test('baza: spłaszczenie, inna rozmowa, usunięta wiadomość główna, liczniki od klienta', { skip: skipDb }, async () => {
  const root = await send('jan@x.pl', 'Korzeń');
  const reply = await send('ola@x.pl', 'Odpowiedź', { root: root.id });
  const nested = await send('ewa@x.pl', 'Na odpowiedź', { root: reply.id });
  assert.equal(nested.thread_root_id, root.id);
  const [{ id: c2 }] = await q1(`INSERT INTO conversations (type, name) VALUES ('group', 'Inna') RETURNING id`);
  await assert.rejects(db.query(`INSERT INTO messages (conversation_id, sender_email, content, thread_root_id) VALUES ($1, 'jan@x.pl', 'x', $2)`, [c2, root.id]));
  const forged = (await q1(`INSERT INTO messages (conversation_id, sender_email, content, thread_reply_count) VALUES ($1, 'jan@x.pl', 'x', 50) RETURNING thread_reply_count`, [C1]))[0];
  assert.equal(forged.thread_reply_count, 0);
  await db.query(`UPDATE messages SET deleted_at = now() WHERE id = $1`, [root.id]);
  await assert.rejects(db.query(`INSERT INTO messages (conversation_id, sender_email, content, thread_root_id) VALUES ($1, 'jan@x.pl', 'x', $2)`, [C1, root.id]));
  // Obserwowanie odpowiedzi (nie korzenia) — odmowa; rozmowa obserwowania zawsze z korzenia.
  await assert.rejects(db.query(`INSERT INTO message_thread_followers (root_id, user_email) VALUES ($1, 'adam@x.pl')`, [reply.id]));
  const other = await send('jan@x.pl', 'Drugi korzeń');
  const [f] = await q1(`INSERT INTO message_thread_followers (root_id, user_email, conversation_id) VALUES ($1, ' Adam@X.pl ', $2) RETURNING *`, [other.id, c2]);
  assert.equal(f.user_email, 'adam@x.pl');
  assert.equal(f.conversation_id, C1);
  assert.deepEqual([...(await threadFollowerEmails(db, other.id))], ['adam@x.pl']);
});

test('baza: realtime — wiadomość główna z nowymi licznikami do uczestników rozmowy', { skip: skipDb }, async () => {
  const root = await send('jan@x.pl', 'Pytanie');
  const reply = await send('ola@x.pl', 'Odpowiedź', { root: root.id });
  const emitted = [];
  const emit = (slug, table, op, rows, opts) => emitted.push({ table, op, rows, audience: [...opts.audience].sort() });
  await emitThreadRoots({ db, tenantSlug: 't', table: 'messages', op: 'insert', rows: [reply], emit, audienceOf: conversationAudience });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].op, 'update');
  assert.equal(emitted[0].rows[0].id, root.id);
  assert.equal(emitted[0].rows[0].thread_reply_count, 1);
  assert.deepEqual(emitted[0].audience, ['adam@x.pl', 'ewa@x.pl', 'jan@x.pl', 'ola@x.pl']);
  // Usunięcie z wąskim RETURNING (bez thread_root_id) — wątek odczytany z bazy.
  await db.query(`UPDATE messages SET deleted_at = now() WHERE id = $1`, [reply.id]);
  await emitThreadRoots({ db, tenantSlug: 't', table: 'messages', op: 'update', rows: [{ id: reply.id, conversation_id: C1, deleted_at: 'x' }], emit, audienceOf: conversationAudience });
  assert.equal(emitted[1].rows[0].thread_reply_count, 0);
  // Zwykła wiadomość — nic.
  await emitThreadRoots({ db, tenantSlug: 't', table: 'messages', op: 'insert', rows: [root], emit, audienceOf: conversationAudience });
  assert.equal(emitted.length, 2);
});

test('baza: główna oś przez querybuilder — bez odpowiedzi; wątek — tylko odpowiedzi', { skip: skipDb }, async () => {
  const [{ id: c3 }] = await q1(`INSERT INTO conversations (type, name) VALUES ('group', 'Oś') RETURNING id`);
  const root = (await q1(`INSERT INTO messages (conversation_id, sender_email, content) VALUES ($1, 'jan@x.pl', 'korzeń') RETURNING id`, [c3]))[0];
  await db.query(`INSERT INTO messages (conversation_id, sender_email, content, thread_root_id) VALUES ($1, 'ola@x.pl', 'w wątku', $2)`, [c3, root.id]);
  const feed = { table: 'messages', op: 'select', select: 'id,content', filters: [{ type: 'eq', column: 'conversation_id', value: c3 }] };
  applyMainFeedDefault(feed);
  const b = buildQuery(feed);
  assert.deepEqual((await q1(b.sql, b.params)).map((r) => r.content ?? r.__row?.content), ['korzeń']);
  const thread = { table: 'messages', op: 'select', select: 'id,content', filters: [{ type: 'eq', column: 'thread_root_id', value: root.id }] };
  applyMainFeedDefault(thread);
  const t = buildQuery(thread);
  assert.deepEqual((await q1(t.sql, t.params)).map((r) => r.content ?? r.__row?.content), ['w wątku']);
});
