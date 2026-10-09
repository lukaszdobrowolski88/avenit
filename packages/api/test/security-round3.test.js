// Audyt bezpieczeństwa 2026-10, runda 3 (S1): upsert = create+update, zakresy w złączeniach
// i licznikach, tablice (spójność board_id, komentarze, pola właściciela, source_kind), stare
// tabele zadań tylko do odczytu, realtime per subskrybent, zaproszenia do służby, formularze tablic.
// /api/db testowane przez Fastify inject z fałszywą bazą (rejestrujemy wygenerowany SQL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import dataApiRoutes from '../src/dataapi/routes.js';
import { canAccess, getTableRule } from '../src/dataapi/registry.js';
import { buildQuery, buildCountQuery } from '../src/dataapi/querybuilder.js';
import { boardScope, boardAudience, canModerateComments } from '../src/dataapi/boardsScope.js';
import { moduleRowScope } from '../src/dataapi/moduleScope.js';
import { enforceSharedWrite } from '../src/dataapi/sharedWrites.js';
import { realtimeRowFilter, boardInModules } from '../src/realtime/scope.js';
import { registerClient, emitChange } from '../src/realtime/hub.js';
import { isRestrictedEvent } from '../src/dataapi/eventVisibility.js';
import { inviteAccessError, tenantOrigin } from '../src/fn/send-assignment-invites.js';
import { patchResponse } from '../src/fn/event-assignments-patch.js';
import { sanitizeFormCells, formColumns, rateLimit as formSubmitLimit } from '../src/fn/board-form-submit.js';
import { rateLimit as formGetLimit } from '../src/fn/board-form-get.js';
import { rateLimit as publicFormLimit } from '../src/fn/public-form-submit.js';
import { presetGrantRows, ROLE_PRESETS } from '@avenit/shared/src/permissions/presets.js';
import { ministryGrants } from '@avenit/shared/src/permissions/ministry.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { crudCapabilities, FN_CAPABILITY } from '@avenit/shared/src/permissions/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let dbSeq = 0;

// ── Fałszywa baza tenanta ────────────────────────────────────────────────────
// account: wiersz app_users zalogowanego; memberships: przynależność do służb;
// handle(sql, params) → { rows, rowCount } dla zapytań spoza uprawnień (domyślnie puste).
function fakeDb({ account, memberships = [], handle = () => null }) {
  const log = [];
  return {
    log,
    query: async (sql, params = []) => {
      if (/FROM app_users WHERE id = \$1/.test(sql)) return { rows: [account] };
      if (/FROM app_modules/.test(sql)) return { rows: [{ key: 'media' }, { key: 'worship' }] };
      if (/FROM permission_grants/.test(sql)) return { rows: presetGrantRows() };
      if (/FROM app_roles WHERE is_admin/.test(sql)) return { rows: [{ key: 'superadmin' }] };
      if (/FROM ministry_memberships/.test(sql)) return { rows: memberships.map((m) => ({ user_id: account.id, ...m })) };
      log.push({ sql, params });
      return handle(sql, params) || { rows: [], rowCount: 0 };
    },
  };
}

async function api({ role = 'czlonek', email = 'jan@x.pl', id = 'u1', superAdmin = false, campusId = null, memberships = [], handle } = {}) {
  const account = { id, role, is_super_admin: superAdmin, campus_id: campusId, member_id: null };
  const db = fakeDb({ account, memberships, handle });
  const app = Fastify();
  const tenant = { id: 't', slug: 'kosciol', subdomain: 'kosciol', db_name: `sec3_${++dbSeq}` };
  app.decorateRequest('user', null);
  app.decorateRequest('db', null);
  app.decorateRequest('tenant', null);
  app.decorate('requireUser', async (req) => { req.user = { id, email, role }; req.db = db; req.tenant = tenant; });
  app.decorate('block2FAPending', async () => {});
  await app.register(dataApiRoutes);
  const call = async (body) => {
    const res = await app.inject({ method: 'POST', url: '/api/db', payload: body });
    return { status: res.statusCode, body: res.json() };
  };
  return { call, db, app };
}

// ── 1. Upsert = create + update ──────────────────────────────────────────────
test('crudCapabilities: upsert wymaga create i update; ignoreDuplicates — tylko create', () => {
  assert.deepEqual(crudCapabilities('x', 'upsert'), ['res:x:create', 'res:x:update']);
  assert.deepEqual(crudCapabilities('x', 'upsert', { ignoreDuplicates: true }), ['res:x:create']);
  assert.deepEqual(crudCapabilities('x', 'insert'), ['res:x:create']);
});

test('canAccess: upsert bez prawa update odrzucony (członek: przebiegi automatyzacji tylko create)', async () => {
  const pool = fakeDb({ account: { id: 'u1', role: 'czlonek' } });
  const user = { id: 'u1', role: 'czlonek' };
  const dbName = `sec3_${++dbSeq}`;
  assert.equal((await canAccess({ pool, dbName, table: 'board_automation_runs', op: 'insert', user })).ok, true);
  const up = await canAccess({ pool, dbName, table: 'board_automation_runs', op: 'upsert', user });
  assert.equal(up.ok, false);
  assert.match(up.reason, /res:board_automation_runs:update/);
  assert.equal((await canAccess({ pool, dbName, table: 'board_automation_runs', op: 'upsert', user, ignoreDuplicates: true })).ok, true);
});

test('upsert: strażnik konfliktu obejmuje też kampus osoby', () => {
  const { sql } = buildQuery({
    table: 'members', op: 'upsert', values: { id: 1, first_name: 'A' }, __campusScope: { campusId: 4 },
  });
  assert.match(sql, /INSERT INTO "members" AS t/);
  assert.match(sql, /DO UPDATE SET .* WHERE \(t\."campus_id" = \$\d+ OR t\."campus_id" IS NULL\)/);
});

test('upsert tablicy zespołu / ściany / szablonów: odmowa nadpisania (DO UPDATE), dodanie bez nadpisania OK', async () => {
  const req = { user: { email: 'jan@x.pl' }, db: { query: async () => ({ rows: [] }) } };
  const r = { can: (c) => c === 'module:worship' };
  await assert.rejects(enforceSharedWrite({ table: 'wall_posts', op: 'upsert', values: { id: 1, content: 'x' } }, req, r), (e) => e.status === 403);
  await assert.rejects(enforceSharedWrite({ table: 'team_roles', op: 'upsert', values: { id: 1, team_type: 'worship' } }, req, r), (e) => e.status === 403);
  await enforceSharedWrite({ table: 'wall_posts', op: 'upsert', ignoreDuplicates: true, values: { content: 'x' } }, req, r);
});

test('/api/db: upsert pliku materiałów bez prawa edycji plików — odmowa; pola __ z żądania ignorowane', async () => {
  const { call } = await api({ role: 'czlonek' });
  const res = await call({ table: 'materials_files', op: 'upsert', values: { id: 'f1', name: 'x' } });
  assert.equal(res.status, 403);
  // Klient nie może podsunąć własnego zakresu (np. wyłączyć widoczności wydarzeń).
  const { call: call2, db } = await api({ role: 'czlonek' });
  await call2({ table: 'events', op: 'select', select: '*', __visibilityScope: null, __ownerScope: null });
  assert.match(db.log.at(-1).sql, /visibility_segments/);
});

// ── 3. Złączenia dziedziczą zakresy ──────────────────────────────────────────
test('złączenie board_items:item_id(*) z komentarzy — zakres prywatnych tablic w podzapytaniu', async () => {
  const { call, db } = await api({ role: 'czlonek', email: 'ola@x.pl' });
  const res = await call({ table: 'board_item_updates', op: 'select', select: '*, board_items:item_id(*)', filters: [{ type: 'eq', column: 'item_id', value: 'i1' }] });
  assert.equal(res.status, 200);
  const { sql, params } = db.log.at(-1);
  // podzapytanie złączenia ma własny EXISTS po boards (visibility/owner/editors) …
  const embed = sql.slice(sql.indexOf('FROM "board_items"'), sql.indexOf('AS "board_items"'));
  assert.match(embed, /EXISTS \(SELECT 1 FROM boards b_ WHERE b_\."id" = e_\d+\."board_id" AND \(coalesce\(b_\."visibility"/);
  assert.ok(params.includes('ola@x.pl'));
});

test('złączenie events:event_id(*) — widoczność wydarzeń (segmenty) i kampus także w złączeniu', async () => {
  const { call, db } = await api({ role: 'czlonek', campusId: 3 });
  const res = await call({ table: 'schedule_assignments', op: 'select', select: 'id, events:event_id(id, title)' });
  assert.equal(res.status, 200);
  const { sql, params } = db.log.at(-1);
  const embed = sql.slice(sql.indexOf('FROM "events"'));
  assert.match(embed, /visibility_segments/);
  assert.match(embed, /"campus_id" = \$\d+ OR e_\d+\."campus_id" IS NULL/);
  assert.ok(params.includes(3));
});

test('złączenie tabeli wspólnej służb w zakresie służby — zawężenie do modułów osoby', async () => {
  // Osoba bez roli globalnej, lider Mediów: board_items widzi tylko z tablic Mediów.
  const { call, db } = await api({ role: 'brak_roli', memberships: [{ ministry_key: 'media', role: 'leader' }] });
  const res = await call({ table: 'board_item_updates', op: 'select', select: '*, board_items:item_id(*)' });
  assert.equal(res.status, 200);
  const embed = db.log.at(-1).sql.split('FROM "board_items"')[1];
  assert.match(embed, /mb_\."module_key" = ANY/);
});

test('złączenie: głosy w ankietach i tabele osobiste — odmowa', async () => {
  const { call } = await api({ role: 'czlonek' });
  assert.equal((await call({ table: 'messages', op: 'select', select: '*, poll_votes:message_id(*)' })).status, 403);
  assert.equal((await call({ table: 'board_items', op: 'select', select: '*, user_tasks:task_id(*)' })).status, 403);
});

test('querybuilder: zagnieżdżone złączenie dostaje poprawnie numerowane parametry zakresu', () => {
  const scope = (a, push) => `${a}."x" = $${push('v')}`;
  const { sql, params } = buildQuery({
    table: 'households', op: 'select', select: 'id, members(id, kids_students:household_id(id))',
    __embedScopes: { members: scope, kids_students: scope },
  });
  assert.equal(params.length, 2);
  assert.match(sql, /\$1/);
  assert.match(sql, /\$2/);
});

test('złączenie: kolumny bez prawa odczytu (field:…:read) wycinane w złączeniu', () => {
  const { sql } = buildQuery({ table: 'households', op: 'select', select: '*, members(*)', __embedHidden: { members: ['phone'] } });
  assert.match(sql, /to_jsonb\(e_\d+\.\*\) - 'phone'/);
});

// ── 10. count / head z tymi samymi zakresami ─────────────────────────────────
test('count/head: widoczność wydarzeń, kampus, prywatne tablice — jak SELECT', async () => {
  const { call, db } = await api({ role: 'czlonek', campusId: 5, handle: (sql) => (/count\(\*\)/.test(sql) ? { rows: [{ count: 2 }] } : null) });
  const res = await call({ table: 'events', op: 'select', select: '*', head: true, count: 'exact' });
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 2);
  const { sql, params } = db.log.at(-1);
  assert.match(sql, /SELECT count\(\*\)::int AS count FROM "events" t/);
  assert.match(sql, /visibility_segments/);
  assert.match(sql, /t\."campus_id" = \$\d+ OR t\."campus_id" IS NULL/);
  assert.ok(params.includes(5));

  const b = await api({ role: 'czlonek', handle: (sql) => (/count\(\*\)/.test(sql) ? { rows: [{ count: 0 }] } : null) });
  await b.call({ table: 'board_items', op: 'select', select: '*', count: 'exact', head: true });
  assert.match(b.db.log.at(-1).sql, /EXISTS \(SELECT 1 FROM boards b_/);
});

test('buildCountQuery: zakres służby (q.__ownerScope) i propozycje budżetu', () => {
  const q = { table: 'events', op: 'select', __ownerScope: moduleRowScope('events', ['media']) };
  assert.match(buildCountQuery(q).sql, /t\."module_key" = ANY\(\$1::text\[\]\)/);
  const p = buildCountQuery({ table: 'budget_proposals', op: 'select', __proposalScope: { teamTypes: ['MediaTeam'], email: 'a@b.pl' } });
  assert.deepEqual(p.params, [['MediaTeam'], 'a@b.pl']);
});

// ── 6. Wiersze podrzędne tablic ──────────────────────────────────────────────
test('zakres: komentarz/dziennik bez board_id — tablica przez element, nigdy „widoczny dla wszystkich”', () => {
  const sql = boardScope('board_item_updates', { email: 'a@b.pl' }).select('t', () => 1);
  assert.doesNotMatch(sql, /board_id" IS NULL OR/);
  assert.match(sql, /COALESCE\(t\."board_id", \(SELECT bi_\."board_id" FROM board_items bi_ WHERE bi_\."id" = t\."item_id"\)\)/);
  const mod = moduleRowScope('board_item_activity', ['media']).select('t', () => 1);
  assert.match(mod, /COALESCE\(t\."board_id"/);
});

const boardHandle = ({ items = {}, groups = {}, visible = true, authors = [] } = {}) => (sql, params) => {
  if (/FROM board_items WHERE id::text = ANY/.test(sql)) return { rows: params[0].filter((id) => id in items).map((id) => ({ id, board_id: items[id] })) };
  if (/FROM board_groups WHERE id::text = ANY/.test(sql)) return { rows: params[0].filter((id) => id in groups).map((id) => ({ id, board_id: groups[id] })) };
  if (/count\(\*\)::int AS n FROM boards b/.test(sql)) return { rows: [{ n: visible ? params[0].length : 0 }] };
  if (/to_jsonb\(u\) AS u FROM app_users u/.test(sql)) return { rows: [{ u: { full_name: 'Jan Kowalski' } }] };
  if (/FROM board_item_updates t LEFT JOIN boards b/.test(sql)) return { rows: authors };
  if (/SELECT DISTINCT/.test(sql)) return { rows: [{ board_id: 'B1' }] };
  if (/^INSERT|^UPDATE|^DELETE/.test(sql.trim())) return { rows: [], rowCount: 1 };
  return null;
};

test('komentarz: board_id z elementu, autor i podpis z konta (nie z klienta)', async () => {
  const { call, db } = await api({ role: 'czlonek', email: 'jan@x.pl', handle: boardHandle({ items: { i1: 'B1' } }) });
  const res = await call({ table: 'board_item_updates', op: 'insert', values: { item_id: 'i1', body: 'Hej', author_name: 'Admin' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const ins = db.log.find((l) => /^INSERT INTO "board_item_updates"/.test(l.sql));
  assert.ok(ins.params.includes('B1'), 'board_id z elementu');
  assert.ok(ins.params.includes('jan@x.pl'));
  assert.ok(ins.params.includes('Jan Kowalski'));
  assert.ok(!ins.params.includes('Admin'));
  // cudzy autor → 403; board_id niezgodny z elementem → 403
  const r2 = await (await api({ handle: boardHandle({ items: { i1: 'B1' } }) })).call({ table: 'board_item_updates', op: 'insert', values: { item_id: 'i1', body: 'x', author_email: 'inny@x.pl' } });
  assert.equal(r2.status, 403);
  const r3 = await (await api({ handle: boardHandle({ items: { i1: 'B1' } }) })).call({ table: 'board_item_updates', op: 'insert', values: { item_id: 'i1', board_id: 'B2', body: 'x' } });
  assert.equal(r3.status, 403);
});

test('element: grupa z innej tablicy → 403; brak tablicy → 403; tablica niewidoczna → 403', async () => {
  const h = boardHandle({ groups: { g1: 'B2' } });
  assert.equal((await (await api({ handle: h })).call({ table: 'board_items', op: 'insert', values: { board_id: 'B1', group_id: 'g1', name: 'x' } })).status, 403);
  assert.equal((await (await api({ handle: h })).call({ table: 'board_items', op: 'insert', values: { name: 'x' } })).status, 403);
  const hidden = boardHandle({ groups: { g1: 'B1' }, visible: false });
  assert.equal((await (await api({ handle: hidden })).call({ table: 'board_items', op: 'insert', values: { group_id: 'g1', name: 'x' } })).status, 403);
  // zmiana grupy na grupę innej tablicy (bez jawnego przeniesienia) → 403
  const mv = await (await api({ handle: h })).call({ table: 'board_items', op: 'update', values: { group_id: 'g1' }, filters: [{ type: 'eq', column: 'id', value: 'i9' }] });
  assert.equal(mv.status, 403);
});

test('komentarz: zmiana/usunięcie cudzego — 403; polubienie — OK; własny — OK; zarządzający — OK', async () => {
  const f = [{ type: 'eq', column: 'id', value: 'c1' }];
  const foreign = boardHandle({ authors: [{ author_email: 'inny@x.pl', module_key: null, source_kind: null }] });
  assert.equal((await (await api({ handle: foreign })).call({ table: 'board_item_updates', op: 'delete', filters: f })).status, 403);
  assert.equal((await (await api({ handle: foreign })).call({ table: 'board_item_updates', op: 'update', values: { body: 'zmiana' }, filters: f })).status, 403);
  assert.equal((await (await api({ handle: foreign })).call({ table: 'board_item_updates', op: 'update', values: { likes: ['jan@x.pl'] }, filters: f })).status, 200);
  const own = boardHandle({ authors: [{ author_email: 'JAN@x.pl' }] });
  const mine = await api({ handle: own });
  assert.equal((await mine.call({ table: 'board_item_updates', op: 'delete', filters: f })).status, 200);
  assert.match(mine.db.log.at(-1).sql, /lower\(t\."author_email"\) = \$\d+/, 'SQL także zawęża do własnych');
  // lider (res:boards:delete + res:board_item_updates:delete) zarządza cudzymi
  assert.equal((await (await api({ role: 'lider', handle: foreign })).call({ table: 'board_item_updates', op: 'delete', filters: f })).status, 200);
  assert.equal(canModerateComments(makeResolver(presetGrantRows(), { role: 'czlonek' })), false);
  assert.equal(canModerateComments(makeResolver(presetGrantRows(), { role: 'lider' })), true);
});

test('realtime tablic: wiersz bez ustalonej tablicy nie idzie do wszystkich', async () => {
  const db = { query: async () => ({ rows: [] }) };
  assert.deepEqual([...(await boardAudience(db, 'board_items', [{ id: 1, board_id: null }]))], []);
  assert.deepEqual([...(await boardAudience(db, 'board_item_updates', [{ id: 1, board_id: null, item_id: 'x' }]))], []);
});

test('migracja 093 = preset członka (własne komentarze: update + delete)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/tenant-migrations/093_member_own_board_comments.sql'), 'utf8');
  const caps = [...sql.matchAll(/\('(res:[a-z_]+:[a-z]+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(caps, ['res:board_item_updates:delete', 'res:board_item_updates:update']);
  const preset = ROLE_PRESETS.czlonek.filter((g) => g.allowed).map((g) => g.capability);
  for (const c of caps) assert.ok(preset.includes(c), c);
  assert.match(sql, /pg\.role = 'czlonek' AND pg\.user_id IS NULL AND pg\.capability = v\.cap/);
});

// ── 7. Tablice: pola właściciela i source_kind ───────────────────────────────
const boardRow = { owner_email: 'ola@x.pl', created_by: 'ola@x.pl', visibility: 'workspace', editors: ['jan@x.pl'], form_enabled: false, form_token: null };
const ownerHandle = (row = boardRow, diff = 0) => (sql) => {
  if (/SELECT t\."owner_email"/.test(sql)) return { rows: [row] };
  if (/source_kind" IS DISTINCT FROM/.test(sql)) return { rows: [{ n: diff }] };
  if (/^(INSERT|UPDATE)/.test(sql.trim())) return { rows: [], rowCount: 1 };
  return null;
};
const idf = [{ type: 'eq', column: 'id', value: 'B1' }];

test('tablica: udostępnianie/formularz zmienia tylko właściciel albo admin', async () => {
  // Jan (edytor, nie właściciel) — zmiana widoczności/edytorów/formularza: 403.
  for (const values of [{ visibility: 'private' }, { editors: ['jan@x.pl', 'obcy@x.pl'] }, { form_enabled: true, form_token: 'frm1' }, { owner_email: 'jan@x.pl' }]) {
    const res = await (await api({ role: 'lider', handle: ownerHandle() })).call({ table: 'boards', op: 'update', values, filters: idf });
    assert.equal(res.status, 403, JSON.stringify(values));
  }
  // … ale nazwę i niezmienione pola (zapis całego obiektu) — tak.
  const ok = await (await api({ role: 'lider', handle: ownerHandle() })).call({ table: 'boards', op: 'update', values: { name: 'Nowa', visibility: 'workspace', editors: ['JAN@x.pl'] }, filters: idf });
  assert.equal(ok.status, 200);
  // Właścicielka — tak; admin — tak.
  assert.equal((await (await api({ role: 'lider', email: 'ola@x.pl', handle: ownerHandle() })).call({ table: 'boards', op: 'update', values: { visibility: 'private' }, filters: idf })).status, 200);
  assert.equal((await (await api({ role: 'superadmin', handle: ownerHandle() })).call({ table: 'boards', op: 'update', values: { visibility: 'private' }, filters: idf })).status, 200);
  // Nowa tablica tylko z sobą jako właścicielem.
  assert.equal((await (await api({ role: 'lider', handle: ownerHandle() })).call({ table: 'boards', op: 'insert', values: { name: 'X', owner_email: 'ola@x.pl' } })).status, 403);
});

test('tablica: source_kind ustawia tylko serwer — także admin (rola admina) dostaje 403, superadmin nie', async () => {
  assert.equal((await (await api({ role: 'lider', handle: ownerHandle() })).call({ table: 'boards', op: 'insert', values: { name: 'X', source_kind: 'media_tasks' } })).status, 403);
  // rola z app_roles.is_admin (tu: klucz 'superadmin'), ale bez is_super_admin
  assert.equal((await (await api({ role: 'superadmin', handle: ownerHandle() })).call({ table: 'boards', op: 'insert', values: { name: 'X', source_kind: 'tasks' } })).status, 403);
  assert.equal((await (await api({ role: 'superadmin', handle: ownerHandle(boardRow, 1) })).call({ table: 'boards', op: 'update', values: { source_kind: 'tasks' }, filters: idf })).status, 403);
  // ten sam source_kind odesłany bez zmiany — OK
  assert.equal((await (await api({ role: 'lider', email: 'ola@x.pl', handle: ownerHandle(boardRow, 0) })).call({ table: 'boards', op: 'update', values: { name: 'A', source_kind: 'tasks' }, filters: idf })).status, 200);
  assert.equal((await (await api({ role: 'superadmin', superAdmin: true, handle: ownerHandle() })).call({ table: 'boards', op: 'insert', values: { name: 'X', source_kind: 'tasks' } })).status, 200);
});

// ── 8. Stare tabele zadań tylko do odczytu ───────────────────────────────────
test('stare tabele zadań: zapis zablokowany dla wszystkich (także superadmina), odczyt bez zmian', async () => {
  const tables = ['media_tasks', 'media_task_comments', 'mlodziezowka_tasks', 'mlodziezowka_task_comments',
    'home_group_tasks', 'home_group_task_comments', 'tasks', 'custom_chor_tasks', 'custom_chor_task_comments'];
  const pool = fakeDb({ account: { id: 'a', role: 'superadmin' } });
  const dbName = `sec3_${++dbSeq}`;
  for (const table of tables) {
    assert.equal(getTableRule(table).readOnly, true, table);
    for (const op of ['insert', 'update', 'delete', 'upsert']) {
      const r = await canAccess({ pool, dbName, table, op, user: { id: 'a', role: 'superadmin', is_super_admin: true } });
      assert.equal(r.ok, false, `${table} ${op}`);
    }
    assert.equal((await canAccess({ pool, dbName, table, op: 'select', user: { id: 'a', role: 'superadmin', is_super_admin: true } })).ok, true);
  }
  // Zadania osobiste i inne tabele modułów własnych — zapisywalne.
  assert.equal(getTableRule('user_tasks').readOnly, undefined);
  assert.equal(getTableRule('custom_chor_members').readOnly, undefined);
  const res = await (await api({ role: 'superadmin', superAdmin: true })).call({ table: 'media_tasks', op: 'insert', values: { title: 'x' } });
  assert.equal(res.status, 403);
});

// ── 2. Funkcje bez capability ────────────────────────────────────────────────
test('FN_CAPABILITY: automation-run, rsvp-send i funkcje kampanii/poczty mają wymagane uprawnienie', () => {
  assert.equal(FN_CAPABILITY['automation-run'], 'module:automation');
  assert.equal(FN_CAPABILITY['rsvp-send'], 'module:rsvp');
  assert.equal(FN_CAPABILITY['push-campaign-receipts'], 'action:push_campaigns:send');
  assert.equal(FN_CAPABILITY['sms-campaign-receipts'], 'action:sms_campaigns:send');
  assert.equal(FN_CAPABILITY['encrypt-credentials'], 'module:mail');
});

// ── 4. Zaproszenia do służby ─────────────────────────────────────────────────
test('send-assignment-invites: bez globalnej edycji grafiku — wymagana własna służba (teamType)', () => {
  const canOf = (role, memberships = []) => {
    const rows = presetGrantRows();
    for (const g of ministryGrants(memberships)) rows.push({ role: null, user_id: 'u', capability: g.capability, allowed: true });
    return makeResolver(rows, { role, userId: 'u', isAdmin: false }).can;
  };
  const mediaLeader = canOf('czlonek', [{ ministry_key: 'media', role: 'leader' }]);
  assert.equal(inviteAccessError(mediaLeader, 'media'), null);
  assert.ok(inviteAccessError(mediaLeader, 'worship'));
  assert.ok(inviteAccessError(mediaLeader, undefined), 'teamType wymagany');
  assert.equal(inviteAccessError(canOf('koordynator'), undefined), null, 'globalnie — bez teamType');
  assert.equal(inviteAccessError(canOf('lider'), 'worship'), null);
});

test('send-assignment-invites: linki z domeny tenanta, nie z baseUrl żądania', () => {
  const o = tenantOrigin({ slug: 'kosciol', subdomain: 'schwro' });
  assert.match(o, /^https?:\/\/schwro\./);
  assert.doesNotMatch(o, /evil/);
});

// ── 5. event-assignments-patch ───────────────────────────────────────────────
test('event-assignments-patch: odpowiedź tylko { id, assignments }; zapytanie bez id::text', () => {
  assert.deepEqual(patchResponse({ id: 'e1', title: 'Tajne', visibility_segments: [{ type: 'role' }], assignments: { media: { a: 'B' } } }), { id: 'e1', assignments: { media: { a: 'B' } } });
  const src = fs.readFileSync(path.join(__dirname, '../src/fn/event-assignments-patch.js'), 'utf8');
  assert.doesNotMatch(src, /id::text = \$1/);
});

// ── 5 / 11. Realtime per subskrybent ─────────────────────────────────────────
test('realtime wydarzeń: wydarzenie z ograniczonym audytorium tylko dla widzących (ten sam predykat SQL)', async () => {
  const restricted = { id: 'e1', module_key: 'media', created_by: 'ola@x.pl', visibility_segments: [{ type: 'role', values: ['lider'] }] };
  const open = { id: 'e2', module_key: 'media', visibility_segments: [] };
  assert.equal(isRestrictedEvent(restricted), true);
  assert.equal(isRestrictedEvent({ visibility_segments: [{ type: 'everyone' }] }), false);
  const seen = [];
  const pool = { query: async (sql, params) => { seen.push(sql); return /FROM events t WHERE t\.id = ANY/.test(sql) ? { rows: [] } : { rows: [] }; } };
  const filter = realtimeRowFilter({ pool, table: 'events', user: { email: 'jan@x.pl', role: 'czlonek' }, isAdmin: false });
  assert.deepEqual((await filter('update', [restricted, open])).map((r) => r.id), ['e2']);
  assert.ok(seen.some((s) => /visibility_segments/.test(s)));
  // usunięcie: tylko autor
  assert.deepEqual((await filter('delete', [restricted])).map((r) => r.id), []);
  const owner = realtimeRowFilter({ pool, table: 'events', user: { email: 'OLA@x.pl', role: 'czlonek' }, isAdmin: false });
  assert.deepEqual((await owner('delete', [restricted])).map((r) => r.id), ['e1']);
  assert.equal(realtimeRowFilter({ pool, table: 'events', user: {}, isAdmin: true }), null);
});

test('realtime w zakresie służby: tylko wiersze modułów osoby', async () => {
  const pool = { query: async (sql) => (/FROM boards WHERE id::text/.test(sql) ? { rows: [{ id: 'B1', module_key: 'media' }, { id: 'B2', module_key: 'worship' }] } : { rows: [] }) };
  const f = realtimeRowFilter({ pool, table: 'board_items', user: { email: 'a@b.pl' }, isAdmin: false, moduleScope: { modules: ['media'] } });
  assert.deepEqual((await f('update', [{ id: 1, board_id: 'B1' }, { id: 2, board_id: 'B2' }])).map((r) => r.id), [1]);
  const sa = realtimeRowFilter({ pool, table: 'schedule_assignments', user: {}, isAdmin: false, moduleScope: { modules: ['mlodziezowka'] } });
  assert.deepEqual((await sa('insert', [{ id: 1, team_type: 'mc' }, { id: 2, team_type: 'worship' }])).map((r) => r.id), [1]);
  assert.equal(boardInModules({ module_key: null, source_kind: 'media_tasks' }, ['media']), true);
  assert.equal(realtimeRowFilter({ pool, table: 'board_items', user: {}, isAdmin: false }), null, 'globalnie — bez filtra');
});

test('hub: subskrypcja z filtrem dostaje tylko przefiltrowane wiersze', async () => {
  const sent = [];
  const handlers = {};
  const socket = { on: (ev, fn) => { handlers[ev] = fn; }, send: (m) => sent.push(JSON.parse(m)) };
  registerClient(socket, {
    tenant: 'tq', userId: 'u', email: 'a@b.pl', isAdmin: false,
    authorize: async () => ({ filter: async (op, rows) => rows.filter((r) => r.ok) }),
  });
  await handlers.message(JSON.stringify({ type: 'subscribe', table: 'events' }));
  emitChange('tq', 'events', 'update', [{ id: 1, ok: true }, { id: 2, ok: false }]);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent.map((m) => m.new?.id), [1]);
  handlers.close();
});

// ── 9. Formularze tablic ─────────────────────────────────────────────────────
test('formularz tablicy: limit wysyłek jak publiczne formularze, tylko wybrane pola, przycięte wartości', () => {
  assert.deepEqual(formSubmitLimit, publicFormLimit);
  assert.ok(formGetLimit && formGetLimit.max > 0);
  const cols = [
    { id: 'a', type: 'text' }, { id: 'b', type: 'long_text' }, { id: 'c', type: 'dropdown', settings: { options: [{ id: 'o1' }, { id: 'o2' }] } },
    { id: 'd', type: 'people' }, { id: 'e', type: 'link' }, { id: 'f', type: 'status', settings: { labels: [{ id: 'l1' }] } },
    { id: 'g', type: 'rating' },
  ];
  assert.deepEqual(formColumns(cols, { fields: ['a', 'c', 'd'] }).map((c) => c.id), ['a', 'c']);
  assert.equal(formColumns(cols, {}).length, 6);
  const out = sanitizeFormCells(formColumns(cols, {}), {
    a: 'x'.repeat(5000), b: 'y'.repeat(20000), c: ['o1', 'o1', 'zly', ...Array(100).fill('o2')], d: [{ email: 'a@b.pl' }],
    e: { url: 'javascript:alert(1)' }, f: 'nieznana', g: 99, z: 'spoza',
  });
  assert.equal(out.a.length, 2000);
  assert.equal(out.b.length, 10000);
  assert.deepEqual(out.c, ['o1', 'o2']);
  assert.equal(out.d, undefined);
  assert.equal(out.e, undefined);
  assert.equal(out.f, undefined);
  assert.equal(out.g, 10);
  assert.equal(out.z, undefined);
  assert.deepEqual(sanitizeFormCells(formColumns(cols, { fields: ['a'] }), { a: 'ok', c: ['o1'] }), { a: 'ok' });
});
