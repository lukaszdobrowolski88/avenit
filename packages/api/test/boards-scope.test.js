// Projekty: prywatne tablice — zakres SQL, wstawianie do cudzej prywatnej tablicy, odbiorcy realtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardScope, enforceBoardWrite, boardAudience, isBoardTable } from '../src/dataapi/boardsScope.js';

test('zakres: tablica prywatna widoczna dla właściciela i edytorów', () => {
  const params = [];
  const sql = boardScope('boards', { email: 'Jan@X.pl' }).select('t', (v) => { params.push(v); return params.length; });
  assert.match(sql, /visibility/);
  assert.match(sql, /owner_email/);
  assert.match(sql, /editors/);
  assert.deepEqual(params, ['jan@x.pl']);
});

test('zakres: elementy przez board_id', () => {
  const sql = boardScope('board_items', { email: 'a@b.pl' }).select('t', () => 1);
  assert.match(sql, /FROM boards b_ WHERE b_\."id" = t\."board_id"/);
  assert.ok(isBoardTable('board_groups'));
  assert.ok(!isBoardTable('events'));
});

test('wstawienie elementu do niewidocznej tablicy — odmowa', async () => {
  const req = (n) => ({ user: { email: 'a@b.pl' }, db: { query: async () => ({ rows: [{ n }] }) } });
  const q = { table: 'board_items', op: 'insert', values: { board_id: 'b1', name: 'x' } };
  await assert.rejects(enforceBoardWrite(q, req(0)), (e) => e.status === 403);
  await enforceBoardWrite(q, req(1));
});

test('realtime: prywatna tablica tylko do właściciela i edytorów; wspólna bez ograniczeń', async () => {
  const db = { query: async () => ({ rows: [{ id: 'b1', visibility: 'private', owner_email: 'Ola@x.pl', editors: ['jan@x.pl'] }] }) };
  const aud = await boardAudience(db, 'board_items', [{ id: 1, board_id: 'b1' }]);
  assert.deepEqual([...aud].sort(), ['jan@x.pl', 'ola@x.pl']);
  const shared = { query: async () => ({ rows: [{ id: 'b2', visibility: 'workspace' }] }) };
  assert.equal(await boardAudience(shared, 'board_items', [{ board_id: 'b2' }]), null);
  assert.equal(await boardAudience(db, 'events', [{ id: 1 }]), null);
});
