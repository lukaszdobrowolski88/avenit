// Testy własności wierszy w tabelach osobistych (zadania, nieobecności, preferencje…).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, ApiError } from '../src/dataapi/querybuilder.js';
import { enforceOwnedWrite, ownerScope, realtimeVisible, isOwnedTable } from '../src/dataapi/ownership.js';

const ANNA = { id: '11111111-1111-1111-1111-111111111111', email: 'Anna@Example.com' };

const q = (o) => ({ ...o, __ownerScope: ownerScope(o.table, ANNA) });

test('select user_tasks: tylko moje albo przypisane do mnie', () => {
  const b = buildQuery(q({ table: 'user_tasks', op: 'select', select: '*', filters: [{ column: 'status', type: 'eq', value: 'todo' }] }));
  assert.match(b.sql, /lower\(t\."user_email"\) = \$\d+ OR lower\(t\."assigned_to_email"\) = \$\d+/);
  assert.ok(b.params.includes('anna@example.com'));
});

test('select bez filtrów też dostaje zawężenie (nie da się pobrać całej tabeli)', () => {
  const b = buildQuery(q({ table: 'user_dashboard_layouts', op: 'select', select: '*' }));
  assert.match(b.sql, / WHERE \(lower\(t\."user_email"\) = \$1\)/);
});

test('delete user_tasks: tylko właściciel (przypisany nie usuwa)', () => {
  const b = buildQuery(q({ table: 'user_tasks', op: 'delete', filters: [{ column: 'id', type: 'eq', value: 'x' }] }));
  assert.match(b.sql, /lower\(t\."user_email"\) = \$\d+\)$/);
  assert.doesNotMatch(b.sql, /assigned_to_email/);
});

test('update user_tasks: właściciel albo przypisany', () => {
  const b = buildQuery(q({ table: 'user_tasks', op: 'update', values: { status: 'done' }, filters: [{ column: 'id', type: 'eq', value: 'x' }] }));
  assert.match(b.sql, /assigned_to_email/);
});

test('upsert układu pulpitu: nie nadpisze cudzego wiersza przy konflikcie', () => {
  const qq = q({ table: 'user_dashboard_layouts', op: 'upsert', values: { user_email: 'anna@example.com', layout: [] }, onConflict: 'user_email' });
  const b = buildQuery(qq);
  assert.match(b.sql, /INSERT INTO "user_dashboard_layouts" AS t/);
  assert.match(b.sql, /DO UPDATE SET .* WHERE \(lower\(t\."user_email"\) = \$\d+\)/);
});

test('upsert tokenu push: przejęcie urządzenia dozwolone (bez strażnika)', () => {
  const b = buildQuery(q({ table: 'push_tokens', op: 'upsert', values: { user_email: 'anna@example.com', expo_token: 'X' }, onConflict: 'expo_token' }));
  assert.doesNotMatch(b.sql, / AS t /);
  assert.doesNotMatch(b.sql, /DO UPDATE SET .* WHERE/);
});

test('tabela zwykła — bez zmian w SQL', () => {
  const b = buildQuery({ table: 'songs', op: 'select', select: 'id', __ownerScope: ownerScope('songs', ANNA) });
  assert.equal(ownerScope('songs', ANNA), null);
  assert.equal(b.sql, 'SELECT t."id" FROM "songs" t');
});

test('insert: brak właściciela → wstawiamy mój e-mail', () => {
  const qq = { table: 'user_tasks', op: 'insert', values: { title: 'A' } };
  enforceOwnedWrite(qq, ANNA);
  assert.equal(qq.values.user_email, ANNA.email);
});

test('insert: cudzy właściciel → 403', () => {
  assert.throws(() => enforceOwnedWrite({ table: 'user_tasks', op: 'insert', values: { title: 'A', user_email: 'jan@example.com' } }, ANNA), (e) => e instanceof ApiError && e.status === 403);
});

test('insert zadania przypisanego komuś innemu — dozwolony (właścicielem jestem ja)', () => {
  const qq = { table: 'user_tasks', op: 'insert', values: { title: 'A', user_email: 'anna@example.com', assigned_to_email: 'jan@example.com' } };
  assert.doesNotThrow(() => enforceOwnedWrite(qq, ANNA));
});

test('update nie przepisze wiersza na inną osobę', () => {
  assert.throws(() => enforceOwnedWrite({ table: 'user_tasks', op: 'update', values: { user_email: 'jan@example.com' } }, ANNA), (e) => e.status === 403);
});

test('powiadomienie dla kogoś innego — wolno wstawić, ale nie upsertem', () => {
  assert.doesNotThrow(() => enforceOwnedWrite({ table: 'notifications', op: 'insert', values: { user_email: 'jan@example.com', title: 'x' } }, ANNA));
  assert.throws(() => enforceOwnedWrite({ table: 'notifications', op: 'upsert', values: { user_email: 'jan@example.com' } }, ANNA), (e) => e.status === 403);
});

test('ical_subscriptions po user_id', () => {
  const b = buildQuery(q({ table: 'ical_subscriptions', op: 'select', select: '*' }));
  assert.match(b.sql, /t\."user_id"::text = \$1/);
  assert.deepEqual(b.params, [ANNA.id]);
});

test('komentarze do zadań: widoczne przez zadanie, autor wstawiany automatycznie', () => {
  const b = buildQuery(q({ table: 'user_task_comments', op: 'select', select: '*', filters: [{ column: 'task_id', type: 'eq', value: 'x' }] }));
  assert.match(b.sql, /EXISTS \(SELECT 1 FROM user_tasks ut WHERE ut\.id = t\.task_id/);
  const ins = { table: 'user_task_comments', op: 'insert', values: { task_id: 'x', content: 'hej' } };
  enforceOwnedWrite(ins, ANNA);
  assert.equal(ins.values.author_email, ANNA.email);
});

test('realtime: wiersz osobisty tylko dla właściciela/przypisanego', () => {
  const client = { userId: ANNA.id, email: 'anna@example.com' };
  assert.equal(realtimeVisible('user_tasks', { user_email: 'jan@example.com', assigned_to_email: 'ANNA@example.com' }, client), true);
  assert.equal(realtimeVisible('user_tasks', { user_email: 'jan@example.com' }, client), false);
  assert.equal(realtimeVisible('notifications', { user_email: 'jan@example.com' }, client), false);
  assert.equal(realtimeVisible('messages', { id: 1 }, client), null);
  assert.equal(isOwnedTable('messages'), false);
});
