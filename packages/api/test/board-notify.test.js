// Powiadomienia o przypisaniu do elementu tablicy (boardNotify.js): różnica osób, widoczność
// prywatnej tablicy, linki do zakładki „Zadania” / Projektów, przebieg przed/po zapisie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  peopleEmails, hasPeopleLike, anyNewPeople, newAssignees, boardVisibleTo, accessCoversBoard,
  changedItems, prepareBoardAssignNotify, notifyBoardAssignees,
} from '../src/dataapi/boardNotify.js';
import { taskItemLink as itemLink, taskBoardModuleKey } from '@avenit/shared/src/lib/taskLinks.js';

const P = (email, name = email) => ({ email, name });

test('osoby z komórki: kształt [{email}], gołe e-maile, śmieci pomijane', () => {
  assert.deepEqual([...peopleEmails([P('Ola@X.pl'), 'jan@x.pl', { name: 'bez maila' }, null, 'Jan Kowalski'])], ['ola@x.pl', 'jan@x.pl']);
  assert.equal(peopleEmails('x@y.pl').size, 0);
  assert.equal(peopleEmails(undefined).size, 0);
});

test('szybki filtr: tylko komórki z osobami', () => {
  assert.equal(hasPeopleLike({ s: 'done', d: '2026-10-01' }), false);
  assert.equal(hasPeopleLike({ p: [] }), false);
  assert.equal(hasPeopleLike({ p: [P('a@b.pl')] }), true);
  assert.equal(hasPeopleLike(JSON.stringify({ p: [P('a@b.pl')] })), true);
});

test('różnica: tylko nowo dodani, bez autora i bez już przypisanych (także w innej kolumnie)', () => {
  const res = newAssignees({
    oldCells: { c1: [P('ola@x.pl')], c2: [P('ewa@x.pl')] },
    newCells: { c1: [P('Ola@x.pl'), P('jan@x.pl'), P('ja@x.pl')], c2: [], c3: [P('ewa@x.pl')], txt: [P('obcy@x.pl')] },
    peopleColumnIds: ['c1', 'c2', 'c3'],
    actorEmail: 'JA@x.pl',
  });
  assert.deepEqual(res, [{ email: 'jan@x.pl', columnId: 'c1' }]);
});

test('różnica: ta sama osoba w dwóch kolumnach — jedno powiadomienie', () => {
  const res = newAssignees({ oldCells: {}, newCells: { a: [P('x@x.pl')], b: [P('x@x.pl')] }, peopleColumnIds: ['a', 'b'], actorEmail: '' });
  assert.deepEqual(res, [{ email: 'x@x.pl', columnId: 'a' }]);
});

test('prywatna tablica: tylko właściciel (awaryjnie twórca) i edytorzy', () => {
  const priv = { visibility: 'private', owner_email: 'Szef@x.pl', editors: ['ed@x.pl'] };
  assert.ok(boardVisibleTo(priv, 'szef@x.pl'));
  assert.ok(boardVisibleTo(priv, 'ED@x.pl'));
  assert.ok(!boardVisibleTo(priv, 'inny@x.pl'));
  assert.ok(boardVisibleTo({ visibility: 'private', created_by: 'tw@x.pl' }, 'tw@x.pl'));
  assert.ok(boardVisibleTo({ visibility: 'workspace' }, 'ktokolwiek@x.pl'));
  assert.ok(boardVisibleTo({}, 'ktokolwiek@x.pl'));
});

test('linki: zakładka Zadania modułu po ?item=, reszta do Projektów', () => {
  assert.equal(taskBoardModuleKey({ source_kind: 'media_tasks', module_key: 'media' }), 'media');
  assert.equal(taskBoardModuleKey({ source_kind: 'home_group_tasks' }), 'homegroups');
  assert.equal(taskBoardModuleKey({ source_kind: 'custom_chor_tasks' }), 'chor');
  assert.equal(taskBoardModuleKey({ module_key: 'chor' }), null); // tablica w zakładce „Tablica” — nie ModuleBoard
  assert.equal(itemLink({ id: 'b1', source_kind: 'media_tasks', module_key: 'media' }, 'i1', { media: '/media' }), '/media?item=i1');
  assert.equal(itemLink({ id: 'b1', source_kind: 'home_group_tasks', module_key: 'homegroups' }, 'i1'), '/home-groups?item=i1');
  assert.equal(itemLink({ id: 'b1', source_kind: 'custom_chor_tasks', module_key: 'chor' }, 'i1', { chor: '/chor' }), '/chor?item=i1');
  assert.equal(itemLink({ id: 'b1', source_kind: 'custom_x_tasks', module_key: 'x' }, 'i1'), '/module/x?item=i1');
  assert.equal(itemLink({ id: 'b1', module_key: null }, 'i1'), '/projekty?board=b1&item=i1');
});

test('elementy po zapisie: update bez RETURNING bierze zapisane cells; 0 wierszy = nic', () => {
  const prep = { op: 'update', values: [{ cells: { c: [P('n@x.pl')] } }], before: new Map([['i1', { id: 'i1', board_id: 'b1', name: 'Plakat', cells: {} }]]) };
  assert.deepEqual(changedItems(prep, [], 1), [{ id: 'i1', board_id: 'b1', name: 'Plakat', oldCells: {}, newCells: { c: [P('n@x.pl')] } }]);
  assert.deepEqual(changedItems(prep, [], 0), []);
  // insert bez RETURNING (kopiowanie tablicy) — pomijany
  assert.deepEqual(changedItems({ op: 'insert', values: [{}], before: new Map() }, [], 3), []);
  // insert z RETURNING
  const ins = changedItems({ op: 'insert', values: [{}], before: new Map() }, { id: 'i9', board_id: 'b1', name: 'X', cells: { c: [] } }, 1);
  assert.equal(ins[0].id, 'i9');
});

test('przed zapisem: bez zapytań, gdy zapis nie dotyczy osób w board_items', async () => {
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  assert.equal(await prepareBoardAssignNotify(db, { table: 'events', op: 'update', values: { cells: { c: [P('a@b.pl')] } } }), null);
  assert.equal(await prepareBoardAssignNotify(db, { table: 'board_items', op: 'update', values: { name: 'x' }, filters: [{ type: 'eq', column: 'id', value: 'i1' }] }), null);
  assert.equal(await prepareBoardAssignNotify(db, { table: 'board_items', op: 'update', values: { cells: { s: 'done' } }, filters: [{ type: 'eq', column: 'id', value: 'i1' }] }), null);
  assert.equal(await prepareBoardAssignNotify(db, { table: 'board_items', op: 'select' }), null);
  assert.equal(calls, 0);
});

test('przed zapisem: update czyta stan w zakresie zapisu (filtry + zakres tablic); błąd = null', async () => {
  const seen = [];
  const db = { query: async (sql, params) => { seen.push({ sql, params }); return { rows: [{ id: 'i1', board_id: 'b1', name: 'A', cells: {} }] }; } };
  const scope = { select: () => 'SCOPE_OK', update: () => 'SCOPE_OK' };
  const prep = await prepareBoardAssignNotify(db, {
    table: 'board_items', op: 'update', values: { cells: { c: [P('a@b.pl')] } },
    filters: [{ type: 'eq', column: 'id', value: 'i1' }], __ownerScope: scope,
  });
  assert.equal(prep.before.get('i1').name, 'A');
  assert.match(seen[0].sql, /SELECT .*FROM "board_items"/);
  assert.match(seen[0].sql, /SCOPE_OK/);
  assert.deepEqual(seen[0].params, ['i1']);
  const broken = { query: async () => { throw new Error('db down'); } };
  assert.equal(await prepareBoardAssignNotify(broken, { table: 'board_items', op: 'update', values: { cells: { c: [P('a@b.pl')] } }, filters: [{ type: 'eq', column: 'id', value: 'i1' }] }), null);
});

const FULL = async () => ({ ok: true });

test('dostęp odbiorcy: globalny, w zakresie służby tablicy albo brak', () => {
  const media = { id: 'b1', module_key: 'media', source_kind: 'media_tasks' };
  const imported = { id: 'b2', module_key: null, source_kind: 'mlodziezowka_tasks' };
  const projekty = { id: 'b3', module_key: null };
  assert.ok(accessCoversBoard({ ok: true }, projekty));
  assert.ok(accessCoversBoard({ ok: true, moduleScope: { modules: ['media'] } }, media));
  assert.ok(accessCoversBoard({ ok: true, moduleScope: { modules: ['mlodziezowka'] } }, imported));
  assert.ok(!accessCoversBoard({ ok: true, moduleScope: { modules: ['media'] } }, imported));
  assert.ok(!accessCoversBoard({ ok: true, moduleScope: { modules: ['media'] } }, projekty));
  assert.ok(!accessCoversBoard({ ok: false }, projekty));
  assert.ok(!accessCoversBoard(null, projekty));
});

// Atrapa bazy: odpowiedzi po fragmencie SQL.
function fakeDb({ board, users = [], failInboxData = false } = {}) {
  const log = [];
  return {
    log,
    query: async (sql, params) => {
      log.push({ sql, params });
      if (/FROM board_columns/.test(sql)) return { rows: [{ id: 'cp', board_id: 'b1' }] };
      if (/FROM boards/.test(sql)) return { rows: [board] };
      if (/AS display/.test(sql)) return { rows: [{ display: 'Anna Nowak' }] };
      if (/FROM app_users/.test(sql)) return { rows: users.map((email) => ({ id: `u-${email}`, email, role: 'czlonek' })) };
      if (/FROM app_modules/.test(sql)) return { rows: [{ key: 'media', path: '/media' }] };
      if (/INSERT INTO notifications/.test(sql)) {
        if (failInboxData && /, data\)/.test(sql)) throw new Error('column "data" does not exist');
        return { rows: [{ id: 'n1', user_email: params[0] }] };
      }
      return { rows: [] };
    },
  };
}

test('po zapisie: wpis + push + realtime tylko dla nowo przypisanego konta', async () => {
  const db = fakeDb({ board: { id: 'b1', name: 'Zadania Media Team', source_kind: 'media_tasks', module_key: 'media' }, users: ['Jan@x.pl'] });
  const pushes = []; const emits = [];
  const prep = { op: 'update', values: [{ cells: { cp: [P('ja@x.pl'), P('jan@x.pl'), P('brak@x.pl')] } }], before: new Map([['i1', { id: 'i1', board_id: 'b1', name: 'Nagłośnienie', cells: { cp: [] } }]]) };
  const res = await notifyBoardAssignees({
    db, tenant: { slug: 't1' }, prep, data: [], rowCount: 1, actor: { email: 'ja@x.pl' },
    deps: { sendPush: async (_db, p) => { pushes.push(p); }, emit: (...a) => emits.push(a), canAccess: FULL },
  });
  assert.equal(res.sent, 1);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].user_email, 'Jan@x.pl'); // kanoniczny e-mail z app_users
  assert.equal(pushes[0].title, 'Anna Nowak przypisał(a) Cię do zadania');
  assert.equal(pushes[0].body, 'Nagłośnienie · Zadania Media Team');
  assert.equal(pushes[0].link, '/media?item=i1');
  assert.deepEqual(pushes[0].data, { type: 'task', item_id: 'i1', board_id: 'b1', column_id: 'cp' });
  const inbox = db.log.find((x) => /INSERT INTO notifications/.test(x.sql));
  assert.deepEqual(inbox.params.slice(0, 5), ['Jan@x.pl', 'task', 'Anna Nowak przypisał(a) Cię do zadania', 'Nagłośnienie · Zadania Media Team', '/media?item=i1']);
  assert.equal(emits[0][0], 't1');
  assert.equal(emits[0][1], 'notifications');
});

test('po zapisie: prywatna tablica — kto jej nie widzi, nie dostaje powiadomienia', async () => {
  const db = fakeDb({ board: { id: 'b1', name: 'Prywatna', visibility: 'private', owner_email: 'szef@x.pl', editors: [] }, users: ['obcy@x.pl'] });
  const pushes = [];
  const prep = { op: 'update', values: [{ cells: { cp: [P('obcy@x.pl')] } }], before: new Map([['i1', { id: 'i1', board_id: 'b1', name: 'X', cells: {} }]]) };
  const res = await notifyBoardAssignees({ db, prep, data: [], rowCount: 1, actor: { email: 'szef@x.pl' }, deps: { sendPush: async (_d, p) => pushes.push(p), emit: () => {}, canAccess: FULL } });
  assert.equal(res.sent, 0);
  assert.equal(pushes.length, 0);
  assert.ok(!db.log.some((x) => /INSERT INTO notifications/.test(x.sql)));
});

test('po zapisie: Projekty → link /projekty, starszy schemat bez kolumny data, błąd pusha nie przerywa', async () => {
  const db = fakeDb({ board: { id: 'b1', name: 'Remont' }, users: ['a@x.pl', 'b@x.pl'], failInboxData: true });
  let n = 0; const ok = [];
  const prep = { op: 'insert', values: [{}], before: new Map() };
  const res = await notifyBoardAssignees({
    db, prep, data: { id: 'i7', board_id: 'b1', name: '', cells: { cp: [P('a@x.pl'), P('b@x.pl')] } }, rowCount: 1, actor: { email: 'z@x.pl' },
    deps: { sendPush: async (_d, p) => { if (n++ === 0) throw new Error('expo down'); ok.push(p); }, emit: () => {}, canAccess: FULL },
  });
  assert.equal(res.sent, 1);
  assert.equal(ok[0].link, '/projekty?board=b1&item=i7');
  assert.equal(ok[0].body, 'Zadanie · Remont');
  assert.ok(db.log.some((x) => /INSERT INTO notifications \(user_email, type, title, body, link\) VALUES/.test(x.sql)));
});

test('po zapisie: nic się nie zmieniło w osobach — bez zapytań o konta i bez pushy', async () => {
  const db = fakeDb({ board: { id: 'b1', name: 'B' }, users: ['a@x.pl'] });
  const pushes = [];
  const prep = { op: 'update', values: [{ cells: { cp: [P('a@x.pl')], s: 'done' } }], before: new Map([['i1', { id: 'i1', board_id: 'b1', name: 'X', cells: { cp: [P('a@x.pl')] } }]]) };
  const res = await notifyBoardAssignees({ db, prep, data: [], rowCount: 1, actor: { email: 'z@x.pl' }, deps: { sendPush: async (_d, p) => pushes.push(p), emit: () => {}, canAccess: FULL } });
  assert.equal(res.sent, 0);
  assert.equal(db.log.length, 0); // zmiana statusu przy przypisanych osobach — zero zapytań
});

test('szybki filtr różnicy: nowy e-mail w dowolnej komórce', () => {
  assert.equal(anyNewPeople({ a: [P('x@x.pl')] }, { a: [P('X@x.pl')], s: 'done' }), false);
  assert.equal(anyNewPeople({ a: [P('x@x.pl')] }, { b: [P('x@x.pl')] }), false);
  assert.equal(anyNewPeople({ a: [P('x@x.pl')] }, { a: [P('x@x.pl'), P('y@x.pl')] }), true);
  assert.equal(anyNewPeople(null, { a: [P('y@x.pl')] }), true);
});

test('po zapisie: bez prawa do elementów tablicy (albo błąd sprawdzenia) — bez powiadomienia', async () => {
  const board = { id: 'b1', name: 'Zadania Media Team', source_kind: 'media_tasks', module_key: 'media' };
  const prep = () => ({ op: 'update', values: [{ cells: { cp: [P('a@x.pl'), P('b@x.pl'), P('c@x.pl')] } }], before: new Map([['i1', { id: 'i1', board_id: 'b1', name: 'X', cells: {} }]]) });
  const db = fakeDb({ board, users: ['a@x.pl', 'b@x.pl', 'c@x.pl'] });
  const pushes = []; const asked = [];
  const canAccess = async ({ user, table, op, allowModuleScope, dbName }) => {
    asked.push({ table, op, allowModuleScope, dbName });
    if (user.email === 'a@x.pl') return { ok: true, moduleScope: { modules: ['media'] } };
    if (user.email === 'b@x.pl') return { ok: true, moduleScope: { modules: ['kids'] } };
    throw new Error('grants down');
  };
  const res = await notifyBoardAssignees({ db, tenant: { slug: 't', db_name: 'tenant_t' }, prep: prep(), data: [], rowCount: 1, actor: { email: 'z@x.pl' },
    deps: { sendPush: async (_d, p) => pushes.push(p), emit: () => {}, canAccess } });
  assert.equal(res.sent, 1);
  assert.deepEqual(pushes.map((p) => p.user_email), ['a@x.pl']);
  assert.deepEqual(asked[0], { table: 'board_items', op: 'select', allowModuleScope: true, dbName: 'tenant_t' });
});
