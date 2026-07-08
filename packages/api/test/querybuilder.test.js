// Testy budowniczego SQL Data API — kontrakt filtrów, selectów, izolacji operacji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, ApiError } from '../src/dataapi/querybuilder.js';
import { parseSelect } from '../src/dataapi/selectparser.js';

test('parseSelect: proste kolumny', () => {
  const r = parseSelect('id, title, date');
  assert.deepEqual(r.columns, ['id', 'title', 'date']);
  assert.equal(r.embeds.length, 0);
});

test('parseSelect: embed to-one z hintem FK', () => {
  const r = parseSelect('*, forms:form_id (id, title)');
  assert.ok(r.columns.includes('*'));
  assert.equal(r.embeds.length, 1);
  assert.equal(r.embeds[0].alias, 'forms');
  assert.equal(r.embeds[0].target, 'form_id');
  assert.deepEqual(r.embeds[0].columns, ['id', 'title']);
});

test('parseSelect: zagnieżdżony embed', () => {
  const r = parseSelect('id, labels:mail_message_labels(label:mail_labels(id, name))');
  const labels = r.embeds.find((e) => e.alias === 'labels');
  assert.ok(labels);
  assert.equal(labels.embeds[0].alias, 'label');
  assert.deepEqual(labels.embeds[0].columns, ['id', 'name']);
});

test('buildQuery: SELECT z eq i order', () => {
  const { sql, params } = buildQuery({
    table: 'members', op: 'select', select: 'id,first_name',
    filters: [{ type: 'eq', column: 'email', value: 'a@b.pl' }],
    order: [{ column: 'first_name', ascending: false }], limit: 10,
  });
  assert.match(sql, /SELECT .*FROM "members"/s);
  assert.match(sql, /WHERE t\."email" = \$1/);
  assert.match(sql, /ORDER BY t\."first_name" DESC/);
  assert.match(sql, /LIMIT 10/);
  assert.deepEqual(params, ['a@b.pl']);
});

test('buildQuery: operatory in/is/contains/or', () => {
  const q1 = buildQuery({ table: 'members', op: 'select', filters: [{ type: 'in', column: 'id', value: [1, 2, 3] }] });
  assert.match(q1.sql, /"id" IN \(\$1, \$2, \$3\)/);
  const q2 = buildQuery({ table: 'members', op: 'select', filters: [{ type: 'is', column: 'phone', value: null }] });
  assert.match(q2.sql, /"phone" IS NULL/);
  const q3 = buildQuery({ table: 'programs', op: 'select', filters: [{ type: 'contains', column: 'song_ids', value: [5] }] });
  assert.match(q3.sql, /@>/);
});

test('buildQuery: UPDATE bez filtrów jest zabroniony', () => {
  assert.throws(() => buildQuery({ table: 'members', op: 'update', values: { first_name: 'X' } }), ApiError);
});

test('buildQuery: DELETE bez filtrów jest zabroniony', () => {
  assert.throws(() => buildQuery({ table: 'members', op: 'delete' }), ApiError);
});

test('buildQuery: tabela spoza rejestru odrzucona', () => {
  assert.throws(() => buildQuery({ table: 'pg_shadow', op: 'select' }), ApiError);
});

test('buildQuery: ukryta kolumna w INSERT odrzucona', () => {
  assert.throws(
    () => buildQuery({ table: 'app_users', op: 'insert', values: { email: 'a@b.pl', password_hash: 'x' } }),
    ApiError
  );
});

test('buildQuery: upsert z onConflict', () => {
  const { sql } = buildQuery({
    table: 'app_settings', op: 'upsert', values: { key: 'k', value: 'v' }, onConflict: 'key',
  });
  assert.match(sql, /ON CONFLICT \("key"\) DO UPDATE SET/);
});

test('buildQuery: identyfikator SQL-injection odrzucony', () => {
  assert.throws(
    () => buildQuery({ table: 'members', op: 'select', filters: [{ type: 'eq', column: 'id; DROP TABLE', value: 1 }] }),
    ApiError
  );
});
