// Testy budowniczego SQL Data API — kontrakt filtrów, selectów, izolacji operacji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, ApiError, embeddedTablePairs } from '../src/dataapi/querybuilder.js';
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

test('normalizeValue: pusta tablica do kolumny jsonb -> JSON "[]" (nie literał PG {})', () => {
  // Regresja: [] przekazana surowo stawała się '{}'::jsonb = pusty obiekt -> crash "d.find is not a function".
  const { params } = buildQuery({ table: 'forms', op: 'insert', values: { fields: [] } });
  assert.equal(params[0], '[]');
});

test('normalizeValue: tablica obiektów do jsonb -> JSON string', () => {
  const { params } = buildQuery({ table: 'forms', op: 'insert', values: { fields: [{ id: 'x', type: 'text' }] } });
  assert.equal(params[0], JSON.stringify([{ id: 'x', type: 'text' }]));
});

test('normalizeValue: UPDATE pustej tablicy jsonb -> JSON "[]"', () => {
  const { params } = buildQuery({ table: 'forms', op: 'update', values: { fields: [] }, filters: [{ type: 'eq', column: 'id', value: '1' }] });
  assert.equal(params[0], '[]');
});

test('normalizeValue: natywna kolumna text[] (members.tags) zostaje surową tablicą', () => {
  const nonEmpty = buildQuery({ table: 'members', op: 'insert', values: { tags: ['vip', 'nowy'] } });
  assert.deepEqual(nonEmpty.params[0], ['vip', 'nowy']);
  const empty = buildQuery({ table: 'members', op: 'insert', values: { tags: [] } });
  assert.deepEqual(empty.params[0], []);
});

test('widoczność: BEZ __visibilityScope events SELECT nie ma klauzuli (non-breaking)', () => {
  const { sql } = buildQuery({ table: 'events', op: 'select' });
  assert.ok(!sql.includes('visibility_segments'), 'nie powinno być klauzuli widoczności');
});

test('widoczność: Z __visibilityScope events SELECT dokleja klauzulę segmentów', () => {
  const { sql, params } = buildQuery({
    table: 'events', op: 'select',
    __visibilityScope: { role: 'lider', email: 'a@b.pl', campusId: null, homeGroupId: null, memberId: 5, ministries: ['media_team'], tags: [] },
  });
  assert.ok(sql.includes('visibility_segments'), 'powinna być kolumna widoczności');
  assert.ok(sql.includes('jsonb_array_elements'), 'iteracja po segmentach');
  assert.ok(sql.includes('jsonb_exists'), 'sprawdzenie przynależności do segmentu');
  assert.ok(sql.includes("seg->>'type' = 'invited'"), 'segment invited');
  assert.ok(params.includes('a@b.pl') && params.includes('lider'), 'parametry kontekstu użytkownika');
});

test('widoczność: __visibilityScope ignorowany dla tabel innych niż events', () => {
  const { sql } = buildQuery({
    table: 'members', op: 'select',
    __visibilityScope: { role: 'lider', email: 'a@b.pl', memberId: 5, ministries: [], tags: [] },
  });
  assert.ok(!sql.includes('visibility_segments'), 'widoczność tylko dla events');
});

// ── Złączenia: lista dociąganych tabel (podstawa kontroli dostępu w routes.js) ──
test('embeddedTablePairs: brak złączeń → pusta lista', () => {
  assert.deepEqual(embeddedTablePairs('checkins', '*'), []);
  assert.deepEqual(embeddedTablePairs('checkins', 'id, security_code'), []);
});

test('embeddedTablePairs: relacje z registry i alias po FK', () => {
  assert.deepEqual(embeddedTablePairs('checkins', '*, kids_students(*), households(*)'), [
    ['checkins', 'kids_students'],
    ['checkins', 'households'],
  ]);
  // alias:kolumna_fk → tabela o nazwie aliasu (fallback resolveRelationship)
  assert.deepEqual(embeddedTablePairs('programs', 'id, type:program_types(name)'), [['programs', 'program_types']]);
});

test('embeddedTablePairs: zagnieżdżenie jest przechodzone rekurencyjnie', () => {
  assert.deepEqual(embeddedTablePairs('households', '*, kids_students(*), parent_contacts(id)'), [
    ['households', 'kids_students'],
    ['households', 'parent_contacts'],
  ]);
});

test('parseSelect: podpowiedzi PostgREST po „!” są odcinane z aliasu i celu', () => {
  const a = parseSelect('id, conversation_participants!inner (user_email)').embeds[0];
  assert.equal(a.alias, 'conversation_participants');
  assert.equal(a.target, 'conversation_participants');
  const b = parseSelect('*, creator:app_users!email_templates_created_by_fkey(full_name)').embeds[0];
  assert.equal(b.alias, 'creator');
  assert.equal(b.target, 'app_users');
});

test('buildQuery: to-one z `references` łączy po wskazanej kolumnie celu (SMS creator po e-mailu)', () => {
  const { sql } = buildQuery({
    table: 'sms_campaigns',
    op: 'select',
    select: '*, segments:sms_campaign_segments(*), creator:app_users!sms_campaigns_created_by_fkey(full_name, avatar_url)',
  });
  assert.match(sql, /\."email" = t\."created_by"/);
  assert.match(sql, /\."campaign_id" = t\."id"/);
  assert.doesNotMatch(sql, /password_hash/);
});

test('buildQuery: __proposalScope zawęża budget_proposals do zespołów i własnych zgłoszeń', () => {
  const { sql, params } = buildQuery({
    table: 'budget_proposals',
    op: 'select',
    select: '*',
    filters: [{ type: 'eq', column: 'status', value: 'pending' }],
    __proposalScope: { teamTypes: ['MediaTeam'], email: 'jan@x.pl' },
  });
  assert.match(sql, /t\."team_type" = ANY\(\$2::text\[\]\) OR \(\$3 <> '' AND lower\(t\."submitted_by"\) = lower\(\$3\)\)/);
  assert.deepEqual(params, ['pending', ['MediaTeam'], 'jan@x.pl']);
  // Inna tabela — zakres ignorowany.
  const other = buildQuery({ table: 'events', op: 'select', select: '*', __proposalScope: { teamTypes: [], email: '' } });
  assert.doesNotMatch(other.sql, /team_type/);
});
