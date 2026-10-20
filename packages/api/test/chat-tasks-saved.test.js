// Komunikator: „Utwórz zadanie” z wiadomości i zapisane wiadomości (migracja 114).
//  • czysta logika wspólna (packages/shared/src/lib/messageTasks.js),
//  • strażnicy /api/db (dataapi/messageTasks.js) na PRAWDZIWYM SQL (PGlite) przez Fastify inject:
//    powiązanie zadania z wiadomością tylko z moich rozmów, rozmowa ustawiana przez serwer,
//    zapisane wiadomości tylko moje, tylko z moich rozmów, bez duplikatów, zmiana tylko notatki.
//
// PGlite nie jest zależnością API — testy bazy pomijają się, gdy go brak:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/chat-tasks-saved.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Fastify from 'fastify';
import dataApiRoutes from '../src/dataapi/routes.js';
import { enforceMessageTaskLink, enforceSavedMessageWrite } from '../src/dataapi/messageTasks.js';
import { REGISTRY } from '../src/dataapi/registry.js';
import { OWNED_TABLES } from '../src/dataapi/ownership.js';
import {
  messageTaskName, conversationModuleKey, messageLinkPath, parseMessageLink, messageTaskDescription,
  tasksByMessage, savedMessageRows,
} from '@avenit/shared/src/lib/messageTasks.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = { jan: id(1), ola: id(2), obcy: id(3) };
const CONV_A = id(11), CONV_B = id(12);
const MSG_A1 = id(21), MSG_A2 = id(22), MSG_B1 = id(23);
const BOARD = id(31), GROUP = id(32), STATUS = id(33);

// ── Czysta logika ───────────────────────────────────────────────────────────
test('nazwa zadania: pierwsza niepusta linia, bez nadmiarowych spacji, przycięta', () => {
  assert.equal(messageTaskName('\n\n  Kupić   kable  \nreszta treści'), 'Kupić kable');
  assert.equal(messageTaskName(''), '');
  assert.equal(messageTaskName(null), '');
  const long = messageTaskName('x'.repeat(300), 20);
  assert.equal(long.length, 20);
  assert.ok(long.endsWith('…'));
});

test('kanał służby → moduł tablicy zadań; inne rozmowy → brak (Kalendarz)', () => {
  assert.equal(conversationModuleKey({ type: 'ministry', ministry_key: 'media_team' }), 'media');
  assert.equal(conversationModuleKey({ type: 'ministry', ministry_key: 'worship_team' }), 'worship');
  assert.equal(conversationModuleKey({ type: 'ministry', ministry_key: 'home_group:abc' }), 'homegroups');
  assert.equal(conversationModuleKey({ type: 'ministry', ministry_key: 'home_groups' }), 'homegroups');
  assert.equal(conversationModuleKey({ type: 'ministry', ministry_key: 'kobiety' }), 'kobiety'); // moduł z kreatora
  assert.equal(conversationModuleKey({ type: 'group', ministry_key: 'media_team' }), null);
  assert.equal(conversationModuleKey({ type: 'ministry', ministry_key: null }), null);
  assert.equal(conversationModuleKey(null), null);
});

test('link do wiadomości: ścieżka weba i odczyt z pełnego adresu', () => {
  assert.equal(messageLinkPath('c 1', 'm/2'), '/komunikator?conversation=c%201&message=m%2F2');
  assert.equal(messageLinkPath('c1'), '/komunikator?conversation=c1');
  assert.equal(messageLinkPath('c1', 'm2', 'r1'), '/komunikator?conversation=c1&message=m2&thread=r1');
  assert.deepEqual(parseMessageLink('https://k.avenit.pl/komunikator?conversation=c1&message=m2'), { conversationId: 'c1', messageId: 'm2', threadRootId: null });
  assert.deepEqual(parseMessageLink('/komunikator?conversation=c1&message=m2&thread=r1'), { conversationId: 'c1', messageId: 'm2', threadRootId: 'r1' });
  assert.deepEqual(parseMessageLink('/komunikator?conversation=c1'), { conversationId: 'c1', messageId: null, threadRootId: null });
  assert.equal(parseMessageLink('/projekty?board=1&item=2'), null);
  assert.equal(parseMessageLink(''), null);
});

test('opis zadania: treść + linia pochodzenia + link', () => {
  assert.equal(
    messageTaskDescription({ content: ' Treść\ndruga ', fromLine: 'Z wiadomości od Ola w „Media”', url: 'https://x/komunikator?conversation=1' }),
    'Treść\ndruga\n\nZ wiadomości od Ola w „Media”\nhttps://x/komunikator?conversation=1',
  );
  assert.equal(messageTaskDescription({ content: '', fromLine: 'Z wiadomości', url: '' }), 'Z wiadomości');
});

test('wskaźnik w czacie: zadania po wiadomości ze statusem; tablica niewidoczna pominięta', () => {
  const cols = [
    { id: 'st2', board_id: 'b1', type: 'status', display_order: 5, settings: { labels: [] } },
    { id: 'st', board_id: 'b1', type: 'status', display_order: 0, settings: { labels: [{ id: 'todo', title: 'Do zrobienia', color: 'gray' }, { id: 'ok', title: 'Gotowe', done: true }] } },
  ];
  const map = tasksByMessage([
    { id: 'i2', board_id: 'b1', name: 'Drugie', source_message_id: 'm1', cells: { st: 'ok' }, created_at: '2026-10-02' },
    { id: 'i1', board_id: 'b1', name: ' Pierwsze ', source_message_id: 'm1', cells: { st: 'todo' }, created_at: '2026-10-01' },
    { id: 'i3', board_id: 'b-ukryta', name: 'X', source_message_id: 'm2', cells: {} },
    { id: 'i4', board_id: 'b1', name: 'Bez źródła', source_message_id: null },
  ], [{ id: 'b1', name: 'Projekt' }], cols);
  assert.deepEqual([...map.keys()], ['m1']);
  const [a, b] = map.get('m1');
  assert.equal(a.name, 'Pierwsze');
  assert.deepEqual(a.status, { id: 'todo', title: 'Do zrobienia', color: 'gray' });
  assert.equal(a.done, false);
  assert.equal(b.done, true);
});

test('lista zapisanych: bez niedostępnych i usuniętych, najnowsze najpierw', () => {
  const rows = savedMessageRows(
    [
      { id: 's1', message_id: 'm1', created_at: '2026-10-01' },
      { id: 's2', message_id: 'm2', created_at: '2026-10-03' },
      { id: 's3', message_id: 'm3', created_at: '2026-10-02' },
      { id: 's4', message_id: 'm-obca', created_at: '2026-10-04' },
    ],
    [{ id: 'm1', content: 'a' }, { id: 'm2', content: 'b' }, { id: 'm3', content: 'c', deleted_at: '2026-10-05' }],
  );
  assert.deepEqual(rows.map((r) => r.saved.id), ['s2', 's1']);
});

test('rejestr: saved_messages to tabela osobista (właściciel user_email)', () => {
  assert.ok(REGISTRY.saved_messages, 'w rejestrze /api/db');
  assert.equal(REGISTRY.saved_messages.resource, null);
  assert.deepEqual(OWNED_TABLES.saved_messages, { owner: 'user_email' });
});

// ── Strażnicy bez bazy ──────────────────────────────────────────────────────
const fakeReq = (rows = [], email = 'jan@x.pl') => ({
  user: { email },
  db: { query: async (sql, params) => ({ rows: sql.includes('FROM messages m') ? rows.filter((r) => params[0].includes(r.id)) : [] }) },
});

test('zadanie: wiadomość spoza moich rozmów → 403, rozmowa zawsze z wiadomości', async () => {
  const q = { table: 'board_items', op: 'insert', values: [{ name: 'a', source_message_id: MSG_A1, source_conversation_id: CONV_B }] };
  await enforceMessageTaskLink(q, fakeReq([{ id: MSG_A1, conversation_id: CONV_A }]));
  assert.equal(q.values[0].source_conversation_id, CONV_A);
  await assert.rejects(
    enforceMessageTaskLink({ table: 'board_items', op: 'insert', values: { name: 'a', source_message_id: MSG_B1 } }, fakeReq([])),
    (e) => e.status === 403,
  );
  // Sama rozmowa bez wiadomości przy zmianie — odrzucona; odpięcie wiadomości czyści oba pola.
  await assert.rejects(
    enforceMessageTaskLink({ table: 'board_items', op: 'update', values: { source_conversation_id: CONV_A } }, fakeReq([])),
    (e) => e.status === 403,
  );
  const un = { table: 'board_items', op: 'update', values: { source_message_id: null } };
  await enforceMessageTaskLink(un, fakeReq([]));
  assert.deepEqual(un.values, { source_message_id: null, source_conversation_id: null });
  await assert.rejects(
    enforceMessageTaskLink({ table: 'board_items', op: 'insert', values: { source_message_id: 'nie-uuid' } }, fakeReq([])),
    (e) => e.status === 400,
  );
  // Zapis bez kolumn źródła — bez zapytań, bez zmian.
  const plain = { table: 'board_items', op: 'update', values: { name: 'x' } };
  await enforceMessageTaskLink(plain, { user: { email: 'jan@x.pl' }, db: { query: async () => { throw new Error('bez zapytań'); } } });
  assert.deepEqual(plain.values, { name: 'x' });
});

test('zapisane: tylko dla siebie, tylko z moich rozmów, upsert bez duplikatów, notatka przycięta', async () => {
  const q = { table: 'saved_messages', op: 'insert', values: { message_id: MSG_A1, user_email: 'JAN@x.pl', conversation_id: CONV_B, extra: 1 } };
  await enforceSavedMessageWrite(q, fakeReq([{ id: MSG_A1, conversation_id: CONV_A }], 'Jan@X.pl'));
  assert.deepEqual(q.values, { user_email: 'jan@x.pl', message_id: MSG_A1, conversation_id: CONV_A });
  assert.equal(q.op, 'upsert');
  assert.equal(q.onConflict, 'user_email,message_id');
  await assert.rejects(
    enforceSavedMessageWrite({ table: 'saved_messages', op: 'insert', values: { message_id: MSG_A1, user_email: 'ola@x.pl' } }, fakeReq([{ id: MSG_A1, conversation_id: CONV_A }])),
    (e) => e.status === 403,
  );
  await assert.rejects(enforceSavedMessageWrite({ table: 'saved_messages', op: 'insert', values: { message_id: MSG_B1 } }, fakeReq([])), (e) => e.status === 403);
  await assert.rejects(enforceSavedMessageWrite({ table: 'saved_messages', op: 'insert', values: {} }, fakeReq([])), (e) => e.status === 400);
  await assert.rejects(enforceSavedMessageWrite({ table: 'saved_messages', op: 'update', values: { message_id: MSG_B1 } }, fakeReq([])), (e) => e.status === 403);
  const n = { table: 'saved_messages', op: 'update', values: { note: `  ${'a'.repeat(3000)}` } };
  await enforceSavedMessageWrite(n, fakeReq([]));
  assert.equal(n.values.note.length, 2000);
  const empty = { table: 'saved_messages', op: 'update', values: { note: '   ' } };
  await enforceSavedMessageWrite(empty, fakeReq([]));
  assert.equal(empty.values.note, null);
});

// ── /api/db na prawdziwym SQL ───────────────────────────────────────────────
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
let app;
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
const TENANT = { id: 't', slug: 'chat-tasks', db_name: `chat_tasks_${process.pid}_${Date.now()}` };

async function call(user, body) {
  const res = await app.inject({ method: 'POST', url: '/api/db', payload: body, headers: { 'x-test-user': user } });
  return { status: res.statusCode, body: res.json() };
}
const eq = (column, value) => ({ type: 'eq', column, value });

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id uuid PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, campus_id int, member_id int, avatar_url text);
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE app_modules (key text PRIMARY KEY, label text, icon text, path text, resource_key text, display_order int, is_system boolean, component_name text);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE app_permissions (role text, resource text, can_read boolean, can_write boolean, PRIMARY KEY (role, resource));
    CREATE TABLE events (id serial PRIMARY KEY, title text, date date);
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text, ministry_key text,
      posting_policy text DEFAULT 'everyone', created_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      user_email text, role text, UNIQUE (conversation_id, user_email));
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      sender_email text NOT NULL, content text, message_type text DEFAULT 'text', attachments jsonb DEFAULT '[]',
      deleted_at timestamptz, created_at timestamptz DEFAULT now());
  `);
  const MIG = new URL('../db/tenant-migrations/', import.meta.url);
  for (const f of ['002_boards.sql', '005_boards_permissions.sql', '023_board_items_description.sql', '092_board_legacy_source.sql', '094_board_items_assignees_events.sql']) {
    await pg.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));
  }
  const m114 = fs.readFileSync(new URL('114_chat_tasks_saved.sql', MIG), 'utf8');
  await pg.exec(m114);
  await pg.exec(m114); // idempotentna
  await pg.exec(`
    INSERT INTO app_roles VALUES ('superadmin', true), ('lider', false);
    INSERT INTO permission_grants (role, capability, allowed) VALUES ('lider', 'module:*', true), ('lider', 'res:*:*', true);
    INSERT INTO app_users (id, email, full_name, role) VALUES
      ('${U.jan}', 'jan@x.pl', 'Jan Kowalski', 'lider'), ('${U.ola}', 'ola@x.pl', 'Ola Nowak', 'lider'),
      ('${U.obcy}', 'obcy@x.pl', 'Obcy', 'lider');
    INSERT INTO conversations (id, type, name, ministry_key) VALUES ('${CONV_A}', 'ministry', 'Media', 'media_team'), ('${CONV_B}', 'direct', NULL, NULL);
    INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES
      ('${CONV_A}', 'Jan@X.pl', 'member'), ('${CONV_A}', 'ola@x.pl', 'admin'), ('${CONV_B}', 'ola@x.pl', 'admin'), ('${CONV_B}', 'obcy@x.pl', 'admin');
    INSERT INTO messages (id, conversation_id, sender_email, content, created_at) VALUES
      ('${MSG_A1}', '${CONV_A}', 'ola@x.pl', 'Kupić kable XLR\\nna niedzielę', now() - interval '2 hours'),
      ('${MSG_A2}', '${CONV_A}', 'jan@x.pl', 'Druga', now() - interval '1 hour'),
      ('${MSG_B1}', '${CONV_B}', 'ola@x.pl', 'Prywatna', now());
    INSERT INTO boards (id, name, visibility, owner_email, created_by) VALUES ('${BOARD}', 'Remont', 'workspace', 'ola@x.pl', 'ola@x.pl');
    INSERT INTO board_groups (id, board_id, name, display_order) VALUES ('${GROUP}', '${BOARD}', 'Do zrobienia', 0);
    INSERT INTO board_columns (id, board_id, name, type, settings, display_order) VALUES
      ('${STATUS}', '${BOARD}', 'Status', 'status', '{"labels":[{"id":"todo","title":"Do zrobienia"}]}', 0);
  `);

  app = Fastify();
  app.decorateRequest('user', null);
  app.decorateRequest('db', null);
  app.decorateRequest('tenant', null);
  app.decorate('requireUser', async (req) => {
    const who = String(req.headers['x-test-user'] || 'jan');
    req.user = { id: U[who], email: `${who}@x.pl`, role: 'lider' };
    req.db = db;
    req.tenant = TENANT;
  });
  app.decorate('block2FAPending', async () => {});
  await app.register(dataApiRoutes);
});

test('db: zadanie z wiadomości — rozmowa z wiadomości, odczyt paczką po source_message_id', { skip: skipDb }, async () => {
  const ins = await call('jan', {
    table: 'board_items', op: 'insert', returning: '*',
    values: { board_id: BOARD, group_id: GROUP, name: 'Kupić kable XLR', cells: { [STATUS]: 'todo' }, source_message_id: MSG_A1, source_conversation_id: CONV_B },
  });
  assert.ok(ins.status < 300, JSON.stringify(ins.body));
  const [row] = await q1(`SELECT source_message_id::text AS m, source_conversation_id::text AS c FROM board_items WHERE name = 'Kupić kable XLR'`);
  assert.deepEqual(row, { m: MSG_A1, c: CONV_A });

  const sel = await call('ola', {
    table: 'board_items', op: 'select', select: 'id, board_id, name, cells, source_message_id',
    filters: [{ type: 'in', column: 'source_message_id', value: [MSG_A1, MSG_A2] }],
  });
  assert.equal(sel.status, 200);
  assert.equal(sel.body.data.length, 1);
  assert.equal(sel.body.data[0].source_message_id, MSG_A1);
});

test('db: zadanie z cudzej (prywatnej) rozmowy — 403, nic nie zapisano', { skip: skipDb }, async () => {
  const res = await call('jan', {
    table: 'board_items', op: 'insert',
    values: { board_id: BOARD, group_id: GROUP, name: 'Podglądanie', source_message_id: MSG_B1 },
  });
  assert.equal(res.status, 403);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM board_items WHERE name = 'Podglądanie'`))[0].n, 0);
  // Podmiana rozmowy w istniejącym zadaniu bez wiadomości — 403.
  const [it] = await q1(`SELECT id::text AS id FROM board_items WHERE name = 'Kupić kable XLR'`);
  const upd = await call('jan', { table: 'board_items', op: 'update', values: { source_conversation_id: CONV_B }, filters: [eq('id', it.id)] });
  assert.equal(upd.status, 403);
  // Usunięcie wiadomości odpina zadanie (SET NULL), zadanie zostaje.
  await db.query(`INSERT INTO messages (id, conversation_id, sender_email, content) VALUES ('${id(29)}', '${CONV_A}', 'jan@x.pl', 'tymczasowa')`);
  const tmp = await call('jan', { table: 'board_items', op: 'insert', values: { board_id: BOARD, group_id: GROUP, name: 'Tymczasowe', source_message_id: id(29) } });
  assert.equal(tmp.status < 300, true, JSON.stringify(tmp.body));
  await db.query(`DELETE FROM messages WHERE id = '${id(29)}'`);
  const [left] = await q1(`SELECT source_message_id, source_conversation_id FROM board_items WHERE name = 'Tymczasowe'`);
  assert.deepEqual(left, { source_message_id: null, source_conversation_id: CONV_A });
});

test('db: zapisane wiadomości — moje, bez duplikatów, z rozmową z serwera; notatka zostaje', { skip: skipDb }, async () => {
  const first = await call('jan', { table: 'saved_messages', op: 'insert', values: { message_id: MSG_A1, note: 'na niedzielę' } });
  assert.ok(first.status < 300, JSON.stringify(first.body));
  const again = await call('jan', { table: 'saved_messages', op: 'insert', values: { message_id: MSG_A1 } });
  assert.ok(again.status < 300, JSON.stringify(again.body));
  const rows = await q1(`SELECT user_email, conversation_id::text AS c, note FROM saved_messages WHERE message_id = '${MSG_A1}'`);
  assert.deepEqual(rows, [{ user_email: 'jan@x.pl', c: CONV_A, note: 'na niedzielę' }]);

  // Prywatna rozmowa, w której nie jestem — 403.
  assert.equal((await call('jan', { table: 'saved_messages', op: 'insert', values: { message_id: MSG_B1 } })).status, 403);
  // Ola zapisuje tę samą wiadomość — osobny wiersz; nie widzi zakładek Jana i ich nie zmieni.
  assert.ok((await call('ola', { table: 'saved_messages', op: 'insert', values: { message_id: MSG_A1 } })).status < 300);
  const olaSees = await call('ola', { table: 'saved_messages', op: 'select', select: '*' });
  assert.equal(olaSees.body.data.length, 1);
  assert.equal(olaSees.body.data[0].user_email, 'ola@x.pl');
  const [janRow] = await q1(`SELECT id::text AS id FROM saved_messages WHERE user_email = 'jan@x.pl'`);
  await call('ola', { table: 'saved_messages', op: 'update', values: { note: 'cudza' }, filters: [eq('id', janRow.id)] });
  await call('ola', { table: 'saved_messages', op: 'delete', filters: [eq('id', janRow.id)] });
  assert.equal((await q1(`SELECT note FROM saved_messages WHERE id = '${janRow.id}'`))[0]?.note, 'na niedzielę');

  // Jan: zmiana notatki tak, przeniesienie do innej wiadomości — nie.
  const note = await call('jan', { table: 'saved_messages', op: 'update', values: { note: 'kupione?' }, filters: [eq('id', janRow.id)] });
  assert.ok(note.status < 300);
  assert.equal((await call('jan', { table: 'saved_messages', op: 'update', values: { message_id: MSG_A2 }, filters: [eq('id', janRow.id)] })).status, 403);
  assert.equal((await q1(`SELECT note FROM saved_messages WHERE id = '${janRow.id}'`))[0].note, 'kupione?');
});

test('db: lista „Zapisane” ukrywa wiadomości, do których straciłem dostęp; usunięta wiadomość = zakładka znika', { skip: skipDb }, async () => {
  await call('jan', { table: 'saved_messages', op: 'insert', values: { message_id: MSG_A2 } });
  const saved = (await call('jan', { table: 'saved_messages', op: 'select', select: '*' })).body.data;
  assert.equal(saved.length, 2);
  const read = async () => (await call('jan', {
    table: 'messages', op: 'select', select: 'id, conversation_id, sender_email, content, deleted_at, created_at',
    filters: [{ type: 'in', column: 'id', value: saved.map((s) => s.message_id) }],
  })).body.data;
  assert.equal(savedMessageRows(saved, await read()).length, 2);

  // Jan opuszcza kanał — zakładki zostają w bazie, ale lista ich nie pokazuje.
  await db.query(`DELETE FROM conversation_participants WHERE conversation_id = '${CONV_A}' AND lower(user_email) = 'jan@x.pl'`);
  assert.equal(savedMessageRows(saved, await read()).length, 0);
  await db.query(`INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ('${CONV_A}', 'jan@x.pl', 'member')`);

  await db.query(`DELETE FROM messages WHERE id = '${MSG_A2}'`);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM saved_messages WHERE message_id = '${MSG_A2}'`))[0].n, 0);
});
