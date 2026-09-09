// Faza 4 — twarda izolacja kampusów: weryfikacja generowanego SQL (bez potrzeby realnych
// kampusów). Klauzula kampusa dokładana TYLKO gdy __campusScope.campusId != null i tabela
// jest w CAMPUS_SCOPED_TABLES.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, CAMPUS_SCOPED_TABLES } from '../src/dataapi/querybuilder.js';

test('SELECT na tabeli kampusowej z zakresem → klauzula kampusa (kampus LUB NULL)', () => {
  const { sql, params } = buildQuery({ table: 'members', op: 'select', select: '*', filters: [], __campusScope: { campusId: 7 } });
  assert.match(sql, /"campus_id" = \$\d+ OR .*"campus_id" IS NULL/);
  assert.ok(params.includes(7));
});

test('SELECT bez zakresu → BEZ klauzuli kampusa (SQL jak dotąd)', () => {
  const { sql } = buildQuery({ table: 'members', op: 'select', select: '*', filters: [] });
  assert.doesNotMatch(sql, /campus_id/);
});

test('SELECT z campusId=null → uśpione, BEZ klauzuli', () => {
  const { sql } = buildQuery({ table: 'members', op: 'select', select: '*', filters: [], __campusScope: { campusId: null } });
  assert.doesNotMatch(sql, /campus_id/);
});

test('Tabela spoza zakresu kampusowego (app_users) → BEZ klauzuli mimo zakresu', () => {
  const { sql } = buildQuery({ table: 'app_users', op: 'select', select: 'id', filters: [], __campusScope: { campusId: 7 } });
  assert.doesNotMatch(sql, /campus_id/);
});

test('INSERT na tabeli kampusowej z zakresem → wiersz stemplowany campus_id', () => {
  const { sql, params } = buildQuery({ table: 'members', op: 'insert', values: { first_name: 'A' }, __campusScope: { campusId: 3 } });
  assert.match(sql, /campus_id/);
  assert.ok(params.includes(3));
});

test('DELETE na tabeli kampusowej z zakresem → klauzula kampusa w WHERE', () => {
  const { sql } = buildQuery({ table: 'members', op: 'delete', filters: [{ type: 'eq', column: 'id', value: 1 }], __campusScope: { campusId: 9 } });
  assert.match(sql, /"campus_id" = \$\d+ OR .*"campus_id" IS NULL/);
});

test('CAMPUS_SCOPED_TABLES nie zawiera app_users ani ministry_memberships', () => {
  assert.ok(!CAMPUS_SCOPED_TABLES.has('app_users'));
  assert.ok(!CAMPUS_SCOPED_TABLES.has('ministry_memberships'));
  assert.ok(CAMPUS_SCOPED_TABLES.has('members'));
});
