// Zadania po stronie serwera (runda 3): fn board-item-patch / board-items-reorder / board-comment,
// my-board-items (assignee_emails, filtry przed limitem), powiadomienia (bez duplikatów, bez autora),
// przypisanie zadania osobistego, automatyzacje, poranny skrót, iCal, import starych zadań.
// Testy bez bazy (atrapy) — pełny przebieg na prawdziwym SQL: boards-pglite.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePatch, mergeCells, checkCellValue } from '../src/fn/board-item-patch.js';
import patchHandler from '../src/fn/board-item-patch.js';
import { parseReorder, reorderSql } from '../src/fn/board-items-reorder.js';
import { parseComment, mentionPreview } from '../src/fn/board-comment.js';
import {
  candidateBoardsSql, myItemsSql, boardCapability, listMyBoardItems, assignedPredicate, _resetAssignedCache,
} from '../src/fn/my-board-items.js';
import { buildQuery } from '../src/dataapi/querybuilder.js';
import { boardViewers, deliverNotifications } from '../src/dataapi/boardNotify.js';
import { userTaskAssignChanges, notifyUserTaskAssign, prepareUserTaskAssign } from '../src/realtime/push-hooks.js';
import { notifyTargets, isPeriodDue, warsawNow, addDaysYmd } from '../src/fn/board-automations-run.js';
import { digestConfig, tasksWord, digestTitle, digestPush, groupDigest, digestEmailHtml, userTaskDueExpr } from '../src/fn/task-digest.js';
import { todoStatus, feedOwner } from '../src/fn/ical.js';
import importHandler, { sourceBoardSql, IMPORT_MARKER } from '../src/fn/board-import-legacy.js';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

function fakeReply() {
  return {
    statusCode: 200, body: undefined,
    code(n) { this.statusCode = n; return this; },
    send(b) { this.body = b; return this; },
  };
}

// ── board-item-patch ─────────────────────────────────────────────────────────
test('patch: walidacja wejścia', () => {
  assert.throws(() => parsePatch({}), /item_id/);
  assert.throws(() => parsePatch({ item_id: 'x' }), /item_id/);
  assert.throws(() => parsePatch({ item_id: U1 }), /Brak zmian/);
  assert.throws(() => parsePatch({ item_id: U1, cells: [] }), /obiektem/);
  assert.throws(() => parsePatch({ item_id: U1, cells: { 'nie-uuid': 1 } }), /kolumny/);
  assert.throws(() => parsePatch({ item_id: U1, group_id: 'abc' }), /group_id/);
  assert.throws(() => parsePatch({ item_id: U1, name: 5 }), /name/);
  assert.throws(() => parsePatch({ item_id: U1, event_id: 'x;drop' }), /event_id/);
  const p = parsePatch({ item_id: U1, cells: { [U2]: 'done', [U3]: null }, name: 'A', group_id: null, event_id: 7 });
  assert.equal(p.itemId, U1);
  assert.deepEqual(p.cells, { [U2]: 'done', [U3]: null });
  assert.deepEqual(p.fields, { name: 'A', group_id: null, event_id: 7 });
});

test('patch: scalanie komórek — podane nadpisują, null usuwa, reszta zostaje', () => {
  const cur = { a: 'x', b: [{ email: 'o@x.pl' }], c: 3 };
  assert.deepEqual(mergeCells(cur, { a: 'y', c: null, d: true }), { a: 'y', b: [{ email: 'o@x.pl' }], d: true });
  assert.deepEqual(cur, { a: 'x', b: [{ email: 'o@x.pl' }], c: 3 }); // bez mutacji
  assert.deepEqual(mergeCells(null, { a: 1 }), { a: 1 });
  assert.deepEqual(mergeCells('{"a":1}', { b: 2 }), { a: 1, b: 2 });
});

test('patch: kolumna „Osoby” przyjmuje tylko listę osób z e-mailem', () => {
  const col = { id: 'c', name: 'Osoby', type: 'people' };
  checkCellValue(col, null);
  checkCellValue(col, [{ email: 'a@x.pl', name: 'A' }, 'b@x.pl']);
  assert.throws(() => checkCellValue(col, 'a@x.pl'), /listy osób/);
  assert.throws(() => checkCellValue(col, [{ name: 'bez maila' }]), /e-mail/);
  checkCellValue({ id: 's', type: 'status' }, 'done');
});

// Atrapa bazy pod canAccess/loadGrants: konto bez żadnych grantów (członek bez Projektów).
function grantsDb(dbRows = {}) {
  const log = [];
  return {
    log,
    query: async (sql, params) => {
      log.push({ sql, params });
      if (/FROM app_users WHERE id = \$1/.test(sql)) return { rows: dbRows.user ? [dbRows.user] : [] };
      if (/SELECT key FROM app_modules/.test(sql)) return { rows: [] };
      if (/FROM permission_grants/.test(sql)) return { rows: dbRows.grants || [] };
      if (/FROM app_roles/.test(sql)) return { rows: [{ key: 'superadmin' }] };
      if (/ministry_memberships/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    connect: async () => { throw new Error('nie powinno dojść do transakcji'); },
  };
}

test('patch HTTP: 400 przy złych danych, 403 bez prawa do elementów tablic, 403 bez konta', async () => {
  const tenant = { db_name: `t-patch-${Date.now()}`, slug: 't' };
  let reply = fakeReply();
  await patchHandler({ db: grantsDb(), tenant, user: { id: 'u1', email: 'a@x.pl' }, body: { item_id: 'zle' } }, reply);
  assert.equal(reply.statusCode, 400);

  reply = fakeReply();
  await patchHandler({ db: grantsDb(), tenant, user: { id: 'u1', email: 'a@x.pl' }, body: { item_id: U1, name: 'x' } }, reply);
  assert.equal(reply.statusCode, 403);
  assert.match(reply.body.error, /konta/);

  reply = fakeReply();
  const db = grantsDb({ user: { id: 'u1', email: 'a@x.pl', role: 'czlonek' } });
  await patchHandler({ db, tenant: { ...tenant, db_name: `${tenant.db_name}-2` }, user: { id: 'u1', email: 'a@x.pl' }, body: { item_id: U1, name: 'x' } }, reply);
  assert.equal(reply.statusCode, 403);
  assert.ok(!db.log.some((x) => /FOR UPDATE/.test(x.sql)));
});

// ── board-items-reorder ──────────────────────────────────────────────────────
test('reorder: walidacja i jedno UPDATE … unnest WITH ORDINALITY w zakresie wołającego', () => {
  assert.throws(() => parseReorder({ board_id: U1, group_id: U2, ordered_ids: [] }), /niepustą/);
  assert.throws(() => parseReorder({ board_id: U1, group_id: U2, ordered_ids: [U3, U3] }), /Powtórzony/);
  assert.throws(() => parseReorder({ board_id: 'x', group_id: U2, ordered_ids: [U3] }), /board_id/);
  const input = parseReorder({ board_id: U1, group_id: U2, ordered_ids: [U3, U1.toUpperCase()] });
  assert.deepEqual(input.ids, [U3, U1]);
  const q = { __ownerScope: { update: (a, push) => `SCOPE(${a}, $${push('me@x.pl')})` } };
  const { sql, params } = reorderSql(q, input);
  assert.match(sql, /^UPDATE board_items AS t/);
  assert.match(sql, /unnest\(\$3::uuid\[\]\) WITH ORDINALITY AS o\(id, ord\)/);
  assert.match(sql, /display_order = \(o\.ord - 1\)::int, group_id = \$2/);
  assert.match(sql, /t\.board_id = \$1 AND SCOPE\(t, \$4\)/);
  assert.deepEqual(params, [U1, U2, [U3, U1], 'me@x.pl']);
});

// ── board-comment ────────────────────────────────────────────────────────────
test('komentarz: walidacja, wzmianki małymi literami bez śmieci i duplikatów', () => {
  assert.throws(() => parseComment({ item_id: U1, body: '   ' }), /pusty/);
  assert.throws(() => parseComment({ item_id: U1, body: 'x', parent_id: 'zle' }), /parent_id/);
  assert.throws(() => parseComment({ item_id: U1, body: 'x', mentions: 'a@x.pl' }), /listą/);
  const c = parseComment({ item_id: U1, body: 'Hej @Ola', mentions: ['Ola@X.pl', 'ola@x.pl', 'nie-mail', null, ' jan@x.pl '] });
  assert.deepEqual(c.mentions, ['ola@x.pl', 'jan@x.pl']);
  assert.equal(c.parentId, null);
  assert.equal(mentionPreview('a\n\n b'), 'a b');
  assert.equal(mentionPreview('x'.repeat(200)).length, 140);
});

// ── my-board-items ───────────────────────────────────────────────────────────
test('przypisane mi: SQL po assignee_emails, exclude_board_id i zakres dat PRZED limitem, sortowanie po terminie', () => {
  const c = candidateBoardsSql({ email: 'ja@x.pl', excludeBoardId: U3 });
  assert.match(c.sql, /i\.assignee_emails @> ARRAY\[\$1::text\]/);
  assert.match(c.sql, /b\.id <> \$3::uuid/);
  assert.match(c.sql, /is_archived/);
  assert.match(c.sql, /is_template/);
  assert.doesNotMatch(c.sql, /::text = ANY/);
  assert.deepEqual(c.params, ['ja@x.pl', 'ja@x.pl', U3]);
  assert.doesNotMatch(candidateBoardsSql({ email: 'ja@x.pl' }).sql, /b\.id <>/);

  const m = myItemsSql({ email: 'ja@x.pl', boardIds: [U1], from: '2026-10-01', to: '2026-10-31' });
  assert.match(m.sql, /i\.board_id = ANY\(\$2::uuid\[\]\)/);
  const where = m.sql.indexOf('coalesce(x.due_end, x.due) >= $3');
  assert.ok(where > 0 && where < m.sql.lastIndexOf('LIMIT'));
  assert.ok(m.sql.indexOf('x.due <= $4') < m.sql.lastIndexOf('LIMIT'));
  assert.ok(m.sql.indexOf('ORDER BY x.due') < m.sql.lastIndexOf('LIMIT'));
  assert.deepEqual(m.params, ['ja@x.pl', [U1], '2026-10-01', '2026-10-31']);
  assert.match(assignedPredicate('i', 1, false), /jsonb_array_elements/);
});

test('przypisane mi: uprawnienie tablicy — moduł służby (także import bez module_key i Kalendarz), Projekty → module:boards', () => {
  const mods = new Map([['media', { resource_key: 'module:media' }]]);
  assert.equal(boardCapability({ module_key: 'media' }, mods), 'module:media');
  assert.equal(boardCapability({ module_key: null, source_kind: 'home_group_tasks' }), 'module:homegroups');
  assert.equal(boardCapability({ module_key: 'calendar', source_kind: 'tasks' }), 'module:calendar');
  assert.equal(boardCapability({ module_key: null, source_kind: 'tasks' }), 'module:calendar');
  assert.equal(boardCapability({ module_key: null, source_kind: null }), 'module:boards');
});

function myItemsDb({ candidates, items, statusCols = [], failNative = false }) {
  const log = [];
  return {
    log,
    query: async (sql, params) => {
      log.push({ sql, params });
      if (failNative && /assignee_emails/.test(sql)) { const e = new Error('column "assignee_emails" does not exist'); e.code = '42703'; throw e; }
      if (/FROM boards b/.test(sql)) return { rows: candidates };
      if (/FROM app_modules/.test(sql)) return { rows: [{ key: 'media', path: '/media', resource_key: 'module:media' }, { key: 'calendar', path: '/wydarzenia', resource_key: 'module:calendar' }] };
      if (/type = 'status'/.test(sql)) return { rows: statusCols };
      if (/FROM board_items i/.test(sql)) return { rows: items.filter((it) => params[1].includes(it.board_id)) };
      return { rows: [] };
    },
  };
}

test('przypisane mi: filtr uprawnień przed zapytaniem o elementy, done = isDoneLabel, link = taskItemLink', async () => {
  _resetAssignedCache();
  const candidates = [
    { id: 'b-media', name: 'Zadania Media', module_key: 'media', source_kind: 'media_tasks' },
    { id: 'b-proj', name: 'Remont', module_key: null, source_kind: null },
    { id: 'b-cal', name: 'Zadania', module_key: 'calendar', source_kind: 'tasks' },
  ];
  const items = [
    { id: 'i1', board_id: 'b-media', name: 'Plakat', cells: { s: 'fin' }, due: '2026-10-09', due_end: null },
    { id: 'i2', board_id: 'b-proj', name: 'Farba', cells: {}, due: '2026-10-10', due_end: null },
    { id: 'i3', board_id: 'b-cal', name: 'Sala', cells: { s: 'x' }, due: '2026-10-11', due_end: '2026-10-12' },
  ];
  const statusCols = [
    { id: 's', board_id: 'b-media', settings: { labels: [{ id: 'fin', title: 'Zamknięte', color: '#1', done: true }] } },
    { id: 's', board_id: 'b-cal', settings: { labels: [{ id: 'x', title: 'Gotowe', color: '#2' }] } },
  ];
  const db = myItemsDb({ candidates, items, statusCols });
  const can = (cap) => cap === 'module:media' || cap === 'module:calendar'; // bez Projektów
  const out = await listMyBoardItems({ db, email: 'JA@x.pl', can, from: '2026-10-01', excludeBoardId: 'nie-uuid' });
  assert.deepEqual(out.map((x) => x.id), ['i1', 'i3']);
  const itemsQuery = db.log.find((x) => /FROM board_items i\b/.test(x.sql) && /ORDER BY x.due/.test(x.sql));
  assert.deepEqual(itemsQuery.params[1], ['b-media', 'b-cal']); // Projekty odfiltrowane przed zapytaniem
  assert.equal(itemsQuery.params[0], 'ja@x.pl');
  assert.equal(out[0].done, true); // jawna flaga done
  assert.equal(out[0].link, '/media?item=i1');
  assert.equal(out[1].done, true); // nazwa „Gotowe”
  assert.equal(out[1].link, '/wydarzenia?item=i3');
  assert.equal(out[1].end, '2026-10-12');
  assert.equal(out[1].module_path, '/wydarzenia');
  // exclude_board_id spoza formatu UUID ignorowany (nie trafia do SQL)
  assert.ok(!db.log[0].params.includes('nie-uuid'));
});

test('przypisane mi: baza sprzed migracji 094 — skan komórek zamiast assignee_emails', async () => {
  _resetAssignedCache();
  const db = myItemsDb({ candidates: [{ id: 'b', name: 'B', module_key: null }], items: [{ id: 'i', board_id: 'b', name: 'X', cells: {}, due: '2026-10-09' }], failNative: true });
  const out = await listMyBoardItems({ db, email: 'ja@x.pl', can: () => true });
  assert.deepEqual(out.map((x) => x.id), ['i']);
  assert.ok(db.log.some((x) => /jsonb_array_elements/.test(x.sql)));
  _resetAssignedCache();
});

// ── Data API: .contains() na natywnej tablicy ───────────────────────────────
test('Data API: .contains(assignee_emails) → text[] @>, jsonb bez zmian', () => {
  const q = buildQuery({ table: 'board_items', op: 'select', select: 'id', filters: [{ type: 'contains', column: 'assignee_emails', value: ['ja@x.pl'] }] });
  assert.match(q.sql, /"assignee_emails" @> \$1::text\[\]/);
  assert.deepEqual(q.params[0], ['ja@x.pl']);
  const j = buildQuery({ table: 'board_items', op: 'select', select: 'id', filters: [{ type: 'contains', column: 'cells', value: { a: 1 } }] });
  assert.match(j.sql, /"cells" @> \$1::jsonb/);
});

// ── Powiadomienia ────────────────────────────────────────────────────────────
test('odbiorcy: autor pomijany bez względu na wielkość liter, tylko aktywne konta widzące tablicę', async () => {
  const db = { query: async () => ({ rows: [{ id: 1, email: 'Ja@X.pl', role: 'lider' }, { id: 2, email: 'Ola@x.pl', role: 'lider' }] }) };
  const board = { id: 'b', visibility: 'private', owner_email: 'ja@x.pl', editors: ['OLA@x.pl'] };
  const res = await boardViewers({
    db, pairs: [{ email: 'JA@x.pl', board }, { email: 'ola@x.pl', board }, { email: 'obcy@x.pl', board }],
    actorEmail: 'ja@X.PL', deps: { canAccess: async () => ({ ok: true }) },
  });
  assert.deepEqual(res.map((r) => r.account.email), ['Ola@x.pl']);
});

test('doręczenie: duplikaty z ostatnich minut i w paczce pomijane; push z danymi', async () => {
  const log = [];
  const db = {
    query: async (sql, params) => {
      log.push({ sql, params });
      if (/FROM notifications/.test(sql)) return { rows: [{ user_email: 'a@x.pl', type: 'task', link: '/l1' }] };
      if (/INSERT INTO notifications/.test(sql)) return { rows: [{ id: 'n' }] };
      return { rows: [] };
    },
  };
  const pushes = [];
  const res = await deliverNotifications({
    db, tenant: { slug: 't' },
    entries: [
      { user_email: 'A@x.pl', type: 'task', title: 'T', body: 'B', link: '/l1' }, // było przed chwilą
      { user_email: 'b@x.pl', type: 'task', title: 'T', body: 'B', link: '/l1', data: { item_id: 'i' } },
      { user_email: 'B@x.pl', type: 'task', title: 'T', body: 'B', link: '/l1' }, // duplikat w paczce
    ],
    deps: { sendPush: async (_d, p) => pushes.push(p), emit: () => {} },
  });
  assert.equal(res.sent, 1);
  assert.deepEqual(pushes.map((p) => p.user_email), ['b@x.pl']);
  assert.deepEqual(pushes[0].data, { type: 'task', item_id: 'i' });
  const insert = log.find((x) => /INSERT INTO notifications/.test(x.sql));
  assert.equal(insert.params[0], 'b@x.pl');
});

// ── Zadania osobiste: przypisanie ────────────────────────────────────────────
test('zadanie osobiste: powiadomienie tylko przy NOWYM przypisaniu innej osobie', async () => {
  const before = new Map([['t1', { id: 't1', assigned_to_email: 'ola@x.pl', title: 'Stare' }], ['t2', { id: 't2', assigned_to_email: null, title: 'Nowe' }]]);
  assert.deepEqual(userTaskAssignChanges({ op: 'update', values: [{ assigned_to_email: 'OLA@x.pl' }], before }, [], 2).map((c) => c.id), ['t2']);
  assert.deepEqual(userTaskAssignChanges({ op: 'insert', values: [{ title: 'X', assigned_to_email: 'jan@x.pl' }], before: new Map() }, [], 1),
    [{ id: null, title: 'X', due_date: null, to: 'jan@x.pl' }]);
  assert.deepEqual(userTaskAssignChanges({ op: 'insert', values: [{}], before: new Map() }, [{ id: 'n1', title: 'R', assigned_to_email: 'Jan@x.pl', due_date: '2026-10-10' }], 1),
    [{ id: 'n1', title: 'R', due_date: '2026-10-10', to: 'jan@x.pl' }]);
  assert.deepEqual(userTaskAssignChanges({ op: 'update', values: [{ assigned_to_email: 'x@x.pl' }], before }, [], 0), []);
  // przed zapisem: bez zapytań, gdy zapis nie przypisuje nikogo
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  assert.equal(await prepareUserTaskAssign(db, { table: 'user_tasks', op: 'update', values: { title: 'x' }, filters: [{ type: 'eq', column: 'id', value: 't1' }] }), null);
  assert.equal(await prepareUserTaskAssign(db, { table: 'user_tasks', op: 'update', values: { assigned_to_email: null }, filters: [{ type: 'eq', column: 'id', value: 't1' }] }), null);
  assert.equal(calls, 0);
});

test('zadanie osobiste: wpis + push dla aktywnego konta, bez autora', async () => {
  const log = [];
  const db = {
    query: async (sql, params) => {
      log.push({ sql, params });
      if (/SELECT email FROM app_users/.test(sql)) return { rows: [{ email: 'Jan@x.pl' }] };
      if (/AS display/.test(sql)) return { rows: [{ display: 'Anna' }] };
      if (/INSERT INTO notifications/.test(sql)) return { rows: [{ id: 'n' }] };
      return { rows: [] };
    },
  };
  const pushes = [];
  const prep = { op: 'insert', values: [{ title: 'Kup kawę', assigned_to_email: 'jan@x.pl', due_date: '2026-10-12' }, { title: 'Sam', assigned_to_email: 'ANNA@x.pl' }], before: new Map() };
  const res = await notifyUserTaskAssign({ db, tenant: { slug: 't' }, prep, data: [], rowCount: 2, actor: { email: 'anna@x.pl' }, deps: { sendPush: async (_d, p) => pushes.push(p), emit: () => {} } });
  assert.equal(res.sent, 1);
  assert.equal(pushes[0].user_email, 'Jan@x.pl');
  assert.equal(pushes[0].title, 'Anna przypisał(a) Ci zadanie');
  assert.equal(pushes[0].body, 'Kup kawę · termin 12.10');
  const accountsQuery = log.find((x) => /SELECT email FROM app_users/.test(x.sql));
  assert.deepEqual(accountsQuery.params[0], ['jan@x.pl']); // autor (anna) odpadł przed zapytaniem
});

// ── Automatyzacje ────────────────────────────────────────────────────────────
test('automatyzacje: adresaci małymi literami, bez śmieciowych „twórców”', () => {
  const item = { created_by: 'formularz', cells: { p: [{ email: 'Ola@X.pl' }, 'jan@x.pl', { name: 'bez' }], t: [{ email: 'tekst@x.pl' }] } };
  assert.deepEqual(notifyTargets({ params: { targetType: 'creator' } }, item, ['p']), []);
  assert.deepEqual(notifyTargets({ params: { targetType: 'creator' } }, { created_by: 'automatyzacja' }, []), []);
  assert.deepEqual(notifyTargets({ params: { targetType: 'creator' } }, { created_by: 'system:board-import' }, []), []);
  assert.deepEqual(notifyTargets({ params: { targetType: 'creator' } }, { created_by: 'Szef@X.pl' }, []), ['szef@x.pl']);
  assert.deepEqual(notifyTargets({ params: { targetType: 'specific', email: ' A@x.pl ' } }, item, []), ['a@x.pl']);
  assert.deepEqual(notifyTargets({ params: {} }, item, ['p']), ['ola@x.pl', 'jan@x.pl']);
});

test('automatyzacje: cykliczne raz dziennie wg czasu Warszawy', () => {
  const now = new Date('2026-10-09T22:30:00Z'); // w Warszawie już 10.10 (sobota)
  assert.equal(warsawNow(now).ymd, '2026-10-10');
  assert.equal(warsawNow(now).dow, 6);
  assert.equal(isPeriodDue({ period: 'daily' }, '2026-10-09T21:00:00Z', now), true); // 9.10 23:00 w Warszawie — inny dzień
  assert.equal(isPeriodDue({ period: 'daily' }, '2026-10-09T22:10:00Z', now), false); // ten sam dzień w Warszawie
  assert.equal(isPeriodDue({ period: 'weekly', dayOfWeek: 6 }, null, now), true);
  assert.equal(isPeriodDue({ period: 'monthly', dayOfMonth: 10 }, null, now), true);
  assert.equal(addDaysYmd('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysYmd('2026-03-01', -14), '2026-02-15');
});

// ── Poranny skrót ────────────────────────────────────────────────────────────
test('skrót: konfiguracja (domyślnie włączony), odmiana, push i grupy', () => {
  assert.deepEqual(digestConfig(null), { enabled: true, overdue_days: 14 });
  assert.equal(digestConfig('false').enabled, false);
  assert.equal(digestConfig('{"enabled":false}').enabled, false);
  assert.equal(digestConfig({ enabled: true, overdue_days: 500 }).overdue_days, 90);
  assert.deepEqual([1, 2, 4, 5, 12, 22, 25].map(tasksWord), ['zadanie', 'zadania', 'zadania', 'zadań', 'zadań', 'zadania', 'zadań']);
  assert.equal(digestTitle(3), 'Masz 3 zadania na dziś');
  const groups = groupDigest([
    { name: 'B', due: '2026-10-09' }, { name: 'A', due: '2026-10-01' }, { name: 'C', due: '2026-10-09' }, { name: 'D', due: '2026-10-09' },
  ], '2026-10-09');
  assert.deepEqual(groups.overdue.map((t) => t.name), ['A']);
  assert.deepEqual(groups.today.map((t) => t.name), ['B', 'C', 'D']);
  const p = digestPush(groups);
  assert.equal(p.title, 'Masz 4 zadania na dziś');
  assert.equal(p.body, 'A · B · C i 1 więcej');
  assert.equal(p.data.type, 'task_digest');
  const html = digestEmailHtml({ name: '<Ola>', groups: { overdue: [], today: [{ name: '<b>x</b>', due: '2026-10-09', where: 'Remont', url: 'https://t.avenit.pl/projekty?board=b&item=i' }] }, appUrl: 'https://t.avenit.pl/' });
  assert.ok(html.includes('&lt;Ola&gt;') && html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
  assert.ok(html.includes('Masz 1 zadanie na dziś'));
  assert.ok(!/gradient/i.test(html));
  assert.match(userTaskDueExpr('timestamp with time zone'), /AT TIME ZONE 'Europe\/Warsaw'/);
  assert.equal(userTaskDueExpr('date'), "to_char(t.due_date, 'YYYY-MM-DD')");
});

// ── iCal ─────────────────────────────────────────────────────────────────────
test('iCal: kanał tylko dla aktywnego konta; status zadań w formacie iCal', async () => {
  const db = (row) => ({ query: async () => ({ rows: row ? [row] : [] }) });
  assert.equal(await feedOwner(db(null), { user_email: 'a@x.pl' }), null);
  assert.equal(await feedOwner(db({ id: 'u', email: 'a@x.pl', active: false }), { user_email: 'a@x.pl' }), null);
  assert.deepEqual(await feedOwner(db({ id: 'u', email: 'A@x.pl', active: true }), { user_email: 'a@x.pl' }), { id: 'u', email: 'a@x.pl' });
  assert.deepEqual(await feedOwner(db({ id: 'u', email: 'A@x.pl', active: true }), { user_id: 'u' }), { id: 'u', email: 'a@x.pl' });
  assert.equal(await feedOwner(db(null), {}), null);
  assert.equal(todoStatus('done'), 'COMPLETED');
  assert.equal(todoStatus('completed'), 'COMPLETED');
  assert.equal(todoStatus('todo'), 'NEEDS-ACTION');
  assert.equal(todoStatus(null), 'NEEDS-ACTION');
});

// ── Import starych zadań ─────────────────────────────────────────────────────
test('import: wybór tablicy — najpierw z importu, nigdy cudza prywatna, bez szablonów', () => {
  const sql = sourceBoardSql();
  assert.match(sql, /\(created_by = \$2 OR coalesce\(visibility, 'workspace'\) <> 'private'\)/);
  assert.match(sql, /coalesce\(is_template, false\) = false/);
  assert.ok(sql.indexOf('(created_by = $2) DESC') < sql.indexOf('created_at ASC'));
  assert.equal(IMPORT_MARKER, 'system:board-import');
});

test('import HTTP: 400 nieznane źródło, 403 bez konta i bez dostępu do modułu', async () => {
  const tenant = { db_name: `t-imp-${Date.now()}`, slug: 't' };
  let reply = fakeReply();
  await importHandler({ db: grantsDb(), tenant, user: { id: 'u1' }, body: { source: 'app_users' } }, reply);
  assert.equal(reply.statusCode, 400);
  reply = fakeReply();
  await importHandler({ db: grantsDb(), tenant, user: { id: 'u1' }, body: { source: 'custom_nieistnieje_tasks' } }, reply);
  assert.equal(reply.statusCode, 400);
  reply = fakeReply();
  await importHandler({ db: grantsDb(), tenant, user: { id: 'u1' }, body: { source: 'media_tasks' } }, reply);
  assert.equal(reply.statusCode, 403);
  reply = fakeReply();
  const db = grantsDb({ user: { id: 'u1', email: 'a@x.pl', role: 'czlonek' }, grants: [{ role: 'czlonek', user_id: null, capability: 'module:media', allowed: true }] });
  await importHandler({ db, tenant: { ...tenant, db_name: `${tenant.db_name}-2` }, user: { id: 'u1' }, body: { source: 'tasks' } }, reply);
  assert.equal(reply.statusCode, 403);
  assert.match(reply.body.error, /module:calendar/);
});
