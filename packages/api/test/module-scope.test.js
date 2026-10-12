// Uprawnienia „w zakresie służby” do wspólnych tabel (events, grafik, board_*):
// reguła (shared moduleScope.js), canAccess (registry), zawężenie wierszy i walidacja zapisu
// (dataapi/moduleScope.js), fn event-assignments-patch per sekcja, preset lidera ↔ migracja 091.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { presetGrantRows, LIDER_DELETE_RESOURCES, LIDER_SHARED_DELETE_RESOURCES, LIDER_MODULES, LIDER_DENIED_MODULES, LIDER_READONLY_MODULES, ROLE_PRESETS, LIDER_SHARED_DELETE_RESOURCES_103, LIDER_READONLY_SHARED_RESOURCES, LIDER_PROGRAM_ACTIONS, KOMUNIKATOR_OWN_DELETE_RESOURCES } from '@avenit/shared/src/permissions/presets.js';
import { ministryGrants } from '@avenit/shared/src/permissions/ministry.js';
import { MODULES } from '@avenit/shared/src/permissions/catalog.js';
import {
  MODULE_SLICES, SCOPED_TABLE_MODULE, boardModuleKey, canModuleScoped, moduleScopedAllows,
  globalAllows, teamAllows, assignmentsPatchAllowed, allowedModules, sliceResource,
} from '@avenit/shared/src/permissions/moduleScope.js';
import { REGISTRY, canAccess } from '../src/dataapi/registry.js';
import { moduleRowScope, andScopes, enforceModuleScopedWrite, applyModuleScope, canPatchTeams } from '../src/dataapi/moduleScope.js';
import { boardScope } from '../src/dataapi/boardsScope.js';
import { buildQuery } from '../src/dataapi/querybuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Granty: presety ról + przynależność do służb danej osoby (jak loadGrants).
function grantsFor(userId, memberships = []) {
  const rows = presetGrantRows();
  for (const g of ministryGrants(memberships)) rows.push({ role: null, user_id: userId, capability: g.capability, allowed: true });
  return rows;
}
const canOf = (role, userId, memberships) => makeResolver(grantsFor(userId, memberships), { role, userId, isAdmin: false }).can;

// Mateusz: rola bazowa „członek”, lider służby Media.
const mateusz = canOf('czlonek', 'u-mat', [{ ministry_key: 'media', role: 'leader' }]);
// Członek służby Media (rola bazowa członek).
const mediaMember = canOf('czlonek', 'u-mem', [{ ministry_key: 'media', role: 'member' }]);
// Osoba bez żadnej roli (brak grantów globalnych) — czysta ścieżka „w zakresie służby”.
const bareLeader = canOf('brak_roli', 'u-bare', [{ ministry_key: 'media', role: 'leader' }]);
const bareMember = canOf('brak_roli', 'u-bm', [{ ministry_key: 'media', role: 'member' }]);
const koordynator = canOf('koordynator', 'u-k');
const czlonek = canOf('czlonek', 'u-c');

test('spójność: wycinki służb to zasoby z katalogu tego modułu; tabele jak w registry', () => {
  for (const [key, slice] of Object.entries(MODULE_SLICES)) {
    const mod = MODULES.find((m) => m.key === key);
    assert.ok(mod, `moduł ${key} w katalogu`);
    for (const r of Object.values(slice)) assert.ok(mod.resources.includes(r), `${r} w zasobach ${key}`);
  }
  for (const [table, mod] of Object.entries(SCOPED_TABLE_MODULE)) {
    assert.equal(REGISTRY[table]?.resource, `module:${mod}`, `${table} → module:${mod}`);
  }
});

test('lider Mediów (członek): wydarzenia Mediów tak, Uwielbienia i ogólne nie', () => {
  for (const op of ['read', 'create', 'update', 'delete']) {
    assert.equal(canModuleScoped(mateusz, 'media', 'events', op), true, `media ${op}`);
  }
  assert.equal(canModuleScoped(mateusz, 'worship', 'events', 'create'), false);
  assert.equal(canModuleScoped(mateusz, 'worship', 'events', 'update'), false);
  assert.equal(canModuleScoped(mateusz, null, 'events', 'create'), false);
  assert.equal(canModuleScoped(mateusz, 'general', 'events', 'create'), false);
  // Odczyt wszystkich wydarzeń — globalnie (preset członka), bez zmian.
  assert.equal(canModuleScoped(mateusz, null, 'events', 'read'), true);
});

test('lider Mediów: tablica Mediów (też z importu po source_kind), nie Projekty ani Młodzieżówka', () => {
  const mediaBoard = boardModuleKey({ module_key: 'media' });
  const importedBoard = boardModuleKey({ module_key: null, source_kind: 'media_tasks' });
  const projekty = boardModuleKey({ module_key: null, source_kind: null });
  const mlodz = boardModuleKey({ module_key: 'mlodziezowka', source_kind: 'mlodziezowka_tasks' });
  assert.equal(importedBoard, 'media');
  assert.equal(projekty, null);
  for (const [table, op] of [['board_columns', 'create'], ['board_columns', 'delete'], ['board_groups', 'update'], ['boards', 'update'], ['board_views', 'create'], ['board_automations', 'create']]) {
    assert.equal(canModuleScoped(mateusz, mediaBoard, table, op), true, `${table} ${op}`);
    assert.equal(canModuleScoped(mateusz, importedBoard, table, op), true, `import ${table} ${op}`);
    assert.equal(canModuleScoped(mateusz, projekty, table, op), false, `Projekty ${table} ${op}`);
    assert.equal(canModuleScoped(mateusz, mlodz, table, op), false, `Młodzieżówka ${table} ${op}`);
  }
});

test('członek służby: elementy i komentarze tak, struktura tablicy nie', () => {
  // Czysta ścieżka w zakresie służby (bez grantów roli).
  for (const op of ['read', 'create', 'update']) assert.equal(moduleScopedAllows(bareMember, 'media', 'board_items', op), true, `items ${op}`);
  assert.equal(moduleScopedAllows(bareMember, 'media', 'board_items', 'delete'), false);
  assert.equal(moduleScopedAllows(bareMember, 'media', 'board_item_updates', 'create'), true);
  assert.equal(moduleScopedAllows(bareMember, 'media', 'board_item_updates', 'update'), true, 'polubienie = komentowanie');
  assert.equal(moduleScopedAllows(bareMember, 'media', 'board_item_activity', 'create'), true);
  for (const t of ['board_columns', 'board_groups', 'board_views', 'board_automations', 'boards']) {
    assert.equal(moduleScopedAllows(bareMember, 'media', t, 'create'), false, `${t} create`);
    assert.equal(moduleScopedAllows(bareMember, 'media', t, 'update'), false, `${t} update`);
    assert.equal(moduleScopedAllows(bareMember, 'media', t, 'read'), true, `${t} read`);
  }
  // Z rolą członka: kolumny nadal nie (ani globalnie, ani w zakresie służby).
  assert.equal(canModuleScoped(mediaMember, 'media', 'board_columns', 'create'), false);
  assert.equal(canModuleScoped(mediaMember, 'media', 'board_items', 'create'), true);
  // Lider bez roli: pełna struktura swojej tablicy.
  assert.equal(moduleScopedAllows(bareLeader, 'media', 'board_columns', 'create'), true);
  assert.equal(moduleScopedAllows(bareLeader, 'worship', 'events', 'create'), false);
});

test('prawa globalne bez zmian; brak przynależności = brak ścieżki w zakresie służby', () => {
  assert.equal(globalAllows(koordynator, 'events', 'delete'), true);
  assert.equal(canModuleScoped(koordynator, 'worship', 'events', 'create'), true);
  assert.equal(canModuleScoped(koordynator, null, 'board_columns', 'create'), true);
  assert.equal(globalAllows(czlonek, 'events', 'create'), false);
  assert.equal(canModuleScoped(czlonek, 'media', 'events', 'create'), false);
  assert.equal(canModuleScoped(czlonek, 'media', 'board_columns', 'create'), false);
  assert.deepEqual(allowedModules(czlonek, 'events', 'insert', ['kobiety']), []);
  // Moduły nie-służbowe nie mają wycinka.
  assert.equal(sliceResource('finance', 'events'), null);
  assert.equal(sliceResource('kobiety', 'tasks'), 'custom_kobiety_tasks');
});

test('moduł własny (kreator): lider ma wydarzenia i tablicę swojego modułu', () => {
  const can = canOf('czlonek', 'u-kob', [{ ministry_key: 'kobiety', role: 'leader' }]);
  assert.equal(canModuleScoped(can, 'kobiety', 'events', 'create'), true);
  assert.equal(canModuleScoped(can, boardModuleKey({ source_kind: 'custom_kobiety_tasks' }), 'board_columns', 'create'), true);
  assert.deepEqual(allowedModules(can, 'events', 'insert', ['kobiety', 'inny']), ['kobiety']);
});

test('grafik (event-assignments-patch): każda sekcja musi być służby osoby', () => {
  assert.equal(assignmentsPatchAllowed(mateusz, [{ team: 'media', key: 'kamera', value: 'Ola' }]), true);
  assert.equal(assignmentsPatchAllowed(mateusz, [{ team: 'worship', key: 'piano', value: 'Ola' }]), false);
  assert.equal(assignmentsPatchAllowed(mateusz, [{ team: 'media', key: 'a', value: 1 }, { team: 'worship', key: 'b', value: 2 }]), false);
  assert.equal(assignmentsPatchAllowed(mateusz, []), false);
  assert.equal(assignmentsPatchAllowed(mediaMember, [{ team: 'media', key: 'kamera', value: 'Ola' }]), true);
  // Sekcja „mc” (Scena / MC) należy do Młodzieżówki.
  const mlodz = canOf('czlonek', 'u-ml', [{ ministry_key: 'mlodziezowka', role: 'leader' }]);
  assert.equal(teamAllows(mlodz, 'mc'), true);
  assert.equal(teamAllows(mateusz, 'mc'), false);
});

// ── canAccess z fałszywą bazą ──
let dbSeq = 0;
function fakePool({ role = 'czlonek', userId = 'u1', memberships = [], moduleKeys = ['media', 'worship'] } = {}) {
  return {
    query: async (sql) => {
      if (/FROM app_modules/.test(sql)) return { rows: moduleKeys.map((key) => ({ key })) };
      if (/FROM permission_grants/.test(sql)) return { rows: presetGrantRows() };
      if (/FROM app_roles/.test(sql)) return { rows: [{ key: 'superadmin' }] };
      if (/FROM ministry_memberships/.test(sql)) return { rows: memberships.map((m) => ({ user_id: userId, ...m })) };
      throw new Error(`nieoczekiwane zapytanie: ${sql}`);
    },
  };
}

test('canAccess: lider Mediów — zakres służby tylko z flagą /api/db; globalne bez zakresu', async () => {
  const pool = fakePool({ userId: 'u-mat', memberships: [{ ministry_key: 'media', role: 'leader' }] });
  const user = { id: 'u-mat', role: 'czlonek', email: 'm@x.pl' };
  const dbName = `t${++dbSeq}`;
  const plain = await canAccess({ pool, dbName, table: 'events', op: 'insert', user });
  assert.equal(plain.ok, false, 'bez flagi (realtime/fn) — jak dotąd');
  const scoped = await canAccess({ pool, dbName, table: 'events', op: 'insert', user, allowModuleScope: true });
  assert.equal(scoped.ok, true);
  assert.deepEqual(scoped.moduleScope.modules, ['media']);
  const read = await canAccess({ pool, dbName, table: 'events', op: 'select', user, allowModuleScope: true });
  assert.equal(read.ok, true);
  assert.equal(read.moduleScope, undefined, 'odczyt globalny — bez zawężenia');
  const cols = await canAccess({ pool, dbName, table: 'board_columns', op: 'insert', user, allowModuleScope: true });
  assert.deepEqual(cols.moduleScope.modules, ['media']);
  // Inne tabele — bez ścieżki w zakresie służby.
  const fin = await canAccess({ pool, dbName, table: 'finance_transactions', op: 'insert', user, allowModuleScope: true });
  assert.equal(fin.ok, false);
  const dash = await canAccess({ pool, dbName, table: 'board_dashboards', op: 'insert', user, allowModuleScope: true });
  assert.equal(dash.ok, false);
});

test('canAccess: członek bez służby — odmowa; koordynator — globalnie', async () => {
  const dbName = `t${++dbSeq}`;
  const pool = fakePool();
  const c = await canAccess({ pool, dbName, table: 'events', op: 'insert', user: { id: 'u1', role: 'czlonek' }, allowModuleScope: true });
  assert.equal(c.ok, false);
  const k = await canAccess({ pool, dbName, table: 'events', op: 'insert', user: { id: 'u2', role: 'koordynator' }, allowModuleScope: true });
  assert.equal(k.ok, true);
  assert.equal(k.moduleScope, undefined);
});

// ── Zawężenie wierszy i walidacja zapisu ──
const pushTo = (params) => (v) => { params.push(v); return params.length; };

test('zakres wierszy: events po module_key, grafik po team_type (z aliasem mc), tablice po module_key/source_kind', () => {
  let params = [];
  assert.equal(moduleRowScope('events', ['media']).update('t', pushTo(params)), 't."module_key" = ANY($1::text[])');
  assert.deepEqual(params, [['media']]);
  params = [];
  moduleRowScope('schedule_assignments', ['mlodziezowka']).delete('t', pushTo(params));
  assert.deepEqual(params, [['mlodziezowka', 'mc']]);
  params = [];
  const sql = moduleRowScope('board_columns', ['media']).select('t', pushTo(params));
  assert.match(sql, /EXISTS \(SELECT 1 FROM boards mb_ WHERE mb_\."id" = t\."board_id"/);
  assert.match(sql, /source_kind/);
  assert.deepEqual(params, [['media'], ['media_tasks']]);
  assert.equal(moduleRowScope('members', ['media']), null);
});

test('zakres tablic AND zakres prywatnych tablic; SQL UPDATE zawiera oba', () => {
  const q = { table: 'board_columns', op: 'update', values: { name: 'X' }, filters: [{ type: 'eq', column: 'id', value: 'c1' }] };
  q.__ownerScope = andScopes(boardScope('board_columns', { email: 'm@x.pl' }), moduleRowScope('board_columns', ['media']));
  const { sql, params } = buildQuery(q);
  assert.match(sql, /visibility/);
  assert.match(sql, /mb_\."module_key" = ANY/);
  assert.ok(params.some((p) => Array.isArray(p) && p[0] === 'media'));
});

test('zapis: wydarzenie tylko w kalendarzu swojej służby, bez przenoszenia', async () => {
  const req = { db: { query: async () => ({ rows: [{ n: 0 }] }) } };
  await enforceModuleScopedWrite({ table: 'events', op: 'insert', values: [{ title: 'A', module_key: 'media' }] }, req, ['media']);
  await assert.rejects(enforceModuleScopedWrite({ table: 'events', op: 'insert', values: { title: 'A', module_key: 'worship' } }, req, ['media']), (e) => e.status === 403);
  await assert.rejects(enforceModuleScopedWrite({ table: 'events', op: 'insert', values: { title: 'A' } }, req, ['media']), (e) => e.status === 403);
  await enforceModuleScopedWrite({ table: 'events', op: 'update', values: { title: 'B' } }, req, ['media']);
  await assert.rejects(enforceModuleScopedWrite({ table: 'events', op: 'update', values: { module_key: 'worship' } }, req, ['media']), (e) => e.status === 403);
  await assert.rejects(enforceModuleScopedWrite({ table: 'schedule_assignments', op: 'insert', values: { team_type: 'worship' } }, req, ['media']), (e) => e.status === 403);
  await enforceModuleScopedWrite({ table: 'schedule_assignments', op: 'insert', values: { team_type: 'media', event_id: 5 } }, req, ['media']);
});

test('zapis: kolumna tylko na tablicy swojej służby; nowa tablica tylko w swoim module', async () => {
  const reqWith = (n) => ({ db: { query: async () => ({ rows: [{ n }] }) } });
  const q = { table: 'board_columns', op: 'insert', values: { board_id: 'b1', name: 'Status' } };
  await enforceModuleScopedWrite(q, reqWith(1), ['media']);
  await assert.rejects(enforceModuleScopedWrite(q, reqWith(0), ['media']), (e) => e.status === 403);
  await assert.rejects(enforceModuleScopedWrite({ table: 'board_items', op: 'insert', values: { name: 'x' } }, reqWith(1), ['media']), (e) => e.status === 403);
  await enforceModuleScopedWrite({ table: 'boards', op: 'insert', values: { name: 'Z', module_key: 'media' } }, reqWith(0), ['media']);
  await enforceModuleScopedWrite({ table: 'boards', op: 'insert', values: { name: 'Z', source_kind: 'media_tasks' } }, reqWith(0), ['media']);
  await assert.rejects(enforceModuleScopedWrite({ table: 'boards', op: 'insert', values: { name: 'P' } }, reqWith(0), ['media']), (e) => e.status === 403);
  await assert.rejects(enforceModuleScopedWrite({ table: 'boards', op: 'update', values: { module_key: null } }, reqWith(0), ['media']), (e) => e.status === 403);
});

test('applyModuleScope: składa zakres z istniejącym i waliduje', async () => {
  const q = { table: 'events', op: 'delete', filters: [{ type: 'eq', column: 'id', value: 7 }] };
  await applyModuleScope(q, { db: {} }, { modules: ['media'] });
  const { sql, params } = buildQuery(q);
  assert.match(sql, /DELETE FROM "events" AS t WHERE .* AND t\."module_key" = ANY\(\$2::text\[\]\)/);
  assert.deepEqual(params, [7, ['media']]);
});

test('canPatchTeams: lider Mediów zmienia sekcję media, nie worship; admin wszystko', async () => {
  const dbName = `t${++dbSeq}`;
  const pool = fakePool({ userId: 'u-mat', memberships: [{ ministry_key: 'media', role: 'leader' }] });
  const user = { id: 'u-mat', role: 'czlonek' };
  assert.equal(await canPatchTeams({ pool, dbName, user, ops: [{ team: 'media', key: 'kamera', value: 'Ola' }] }), true);
  assert.equal(await canPatchTeams({ pool, dbName, user, ops: [{ team: 'worship', key: 'piano', value: 'Ola' }] }), false);
  assert.equal(await canPatchTeams({ pool, dbName, user: { id: 'a', role: 'superadmin' }, ops: [{ team: 'worship', key: 'x', value: 1 }] }), true);
});

test('lider służby może wysłać zaproszenia z grafiku; członek służby nie', () => {
  assert.equal(mateusz('action:programs:send_assignment'), true);
  assert.equal(mediaMember('action:programs:send_assignment'), false);
});

// ── Preset lidera ↔ migracja 091 ──
test('preset lider: z roli usuwa tylko dane wspólne; dane służby — lider TEJ służby', () => {
  const lider = canOf('lider', 'u-l');
  for (const r of ['board_columns', 'board_items', 'equipment']) {
    assert.equal(lider(`res:${r}:delete`), true, r);
  }
  // Od migracji 106: wydarzenia, grafik i programy — nie z roli (tylko swoje służby).
  for (const r of ['events', 'schedule_assignments', 'programs', 'program_songs']) {
    assert.equal(lider(`res:${r}:delete`), false, r);
  }
  for (const r of ['media_team', 'songs', 'kids_events', 'home_groups', 'finance_transactions', 'expenses', 'budget_items', 'members', 'member_notes', 'app_users', 'donations']) {
    assert.equal(lider(`res:${r}:delete`), false, r);
  }
  const forbidden = new Set(['finance', 'settings', 'members', 'mailing', 'mail', 'giving', 'sms_campaigns', 'push_campaigns', 'automation']);
  const catalogRes = new Map();
  for (const m of MODULES) for (const r of m.resources) catalogRes.set(r, m.key);
  for (const r of LIDER_SHARED_DELETE_RESOURCES) {
    assert.ok(catalogRes.has(r), `${r} w katalogu`);
    assert.ok(!forbidden.has(catalogRes.get(r)), `${r} (${catalogRes.get(r)}) poza danymi służbowymi`);
  }
});

test('lider jednej służby, członek drugiej: usuwa i widzi finanse tylko w swojej', () => {
  const rows = presetGrantRows().map((g) => ({ ...g }));
  for (const g of ministryGrants([{ ministry_key: 'media', role: 'leader' }, { ministry_key: 'worship', role: 'member' }])) {
    rows.push({ role: null, user_id: 'u-m', capability: g.capability, allowed: g.allowed });
  }
  const can = makeResolver(rows, { role: 'lider', userId: 'u-m', isAdmin: false }).can;
  assert.equal(can('module:media'), true);
  assert.equal(can('module:worship'), true);
  assert.equal(can('module:kids'), false);
  assert.equal(can('res:home_group_members:update'), false);
  assert.equal(can('res:media_team:delete'), true);
  assert.equal(can('tab:media:finances'), true);
  assert.equal(can('res:worship_team:update'), true);
  assert.equal(can('res:worship_team:delete'), false);
  assert.equal(can('res:songs:delete'), false);
  assert.equal(can('tab:worship:finances'), false);
});

test('migracja 103 = preset lidera (moduły, zakazy, usuwanie danych służb)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/tenant-migrations/103_lider_own_ministries.sql'), 'utf8');
  const caps = [...sql.matchAll(/\('((?:module|res):[a-z_*]+(?::delete)?)'\)/g)].map((m) => m[1]);
  const mod = caps.filter((c) => c.startsWith('module:'));
  assert.deepEqual(mod.sort(), [...LIDER_MODULES, ...LIDER_DENIED_MODULES].map((m) => `module:${m}`).sort());
  const del = caps.filter((c) => c.startsWith('res:'));
  const ministryDel = LIDER_DELETE_RESOURCES.filter((r) => !LIDER_SHARED_DELETE_RESOURCES_103.includes(r));
  assert.deepEqual(del.sort(), ministryDel.map((r) => `res:${r}:delete`).sort());
  assert.match(sql, /capability = 'module:\*' AND allowed/, 'tylko tenanty ze starym presetem');
  assert.match(sql, /ON CONFLICT \(role, capability\) WHERE user_id IS NULL DO NOTHING/, 'decyzje admina zostają');
});

test('migracja 104 = Grupy domowe lidera tylko do odczytu (spójność z presetem)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/tenant-migrations/104_lider_homegroups_read.sql'), 'utf8');
  assert.deepEqual(LIDER_READONLY_MODULES, ['homegroups']);
  assert.match(sql, /'module:homegroups', true/);
  const lider = ROLE_PRESETS.lider;
  const denied = lider.filter((g) => !g.allowed && /^res:(home_group|homegroups)/.test(g.capability)).map((g) => g.capability.split(':')[1]);
  const listed = sql.match(/unnest\(ARRAY\[([^\]]+)\]\) AS r/)[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual([...new Set(denied)].sort(), [...listed].sort());
  assert.match(sql, /capability = 'module:members' AND NOT allowed/, 'tylko tenanty z modelem lidera 103');
  assert.match(sql, /ON CONFLICT \(role, capability\) WHERE user_id IS NULL DO NOTHING/);
});

test('lider: Grupy domowe — odczyt z roli, edycja tylko z przynależności do służby', async () => {
  const dbName = `t${++dbSeq}`;
  const pool = fakePool({ userId: 'hg', memberships: [{ ministry_key: 'homegroups', role: 'leader' }], moduleKeys: ['homegroups'] });
  const lider = { id: 'l1', role: 'lider' };
  assert.equal((await canAccess({ pool, dbName, table: 'home_groups', op: 'select', user: lider })).ok, true);
  assert.equal((await canAccess({ pool, dbName, table: 'home_group_members', op: 'update', user: lider })).ok, false);
  assert.equal((await canAccess({ pool, dbName, table: 'home_group_members', op: 'insert', user: lider })).ok, false);
  const hgLeader = { id: 'hg', role: 'lider' };
  assert.equal((await canAccess({ pool, dbName, table: 'home_group_members', op: 'update', user: hgLeader })).ok, true);
});

test('migracja 106 = lider tylko swoje służby (spójność z presetem)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/tenant-migrations/106_lider_own_ministries_only.sql'), 'utf8');
  const arr = (label) => sql.match(new RegExp(`unnest\\(ARRAY\\[([^\\]]+)\\]\\) AS ${label}`))[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(arr('r').sort(), [...LIDER_READONLY_SHARED_RESOURCES].sort());
  assert.deepEqual(arr('a').sort(), [...LIDER_PROGRAM_ACTIONS].sort());
  const removed = sql.match(/capability IN \(([^)]+)\)/)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
  for (const r of LIDER_SHARED_DELETE_RESOURCES_103.filter((x) => !LIDER_SHARED_DELETE_RESOURCES.includes(x))) {
    if (r === 'tasks') continue;
    assert.ok(removed.includes(`res:${r}:delete`), r);
  }
  assert.ok(removed.includes('action:programs:*'));
  assert.match(sql, /capability = 'module:members' AND NOT allowed/);
});

test('lider: wydarzenia tylko swoich służb, program — lider Uwielbienia', async () => {
  const dbName = `t${++dbSeq}`;
  const media = fakePool({ userId: 'm', memberships: [{ ministry_key: 'media', role: 'leader' }] });
  const user = { id: 'm', role: 'lider', email: 'm@x.pl' };
  const glob = await canAccess({ pool: media, dbName, table: 'events', op: 'update', user });
  assert.equal(glob.ok, false, 'bez globalnej edycji wydarzeń');
  const scoped = await canAccess({ pool: media, dbName, table: 'events', op: 'update', user, allowModuleScope: true });
  assert.deepEqual(scoped.moduleScope?.modules, ['media']);
  assert.equal((await canAccess({ pool: media, dbName, table: 'programs', op: 'update', user })).ok, false);
  assert.equal((await canAccess({ pool: media, dbName, table: 'programs', op: 'select', user })).ok, true);
  assert.equal((await canAccess({ pool: media, dbName, table: 'teachings', op: 'update', user })).ok, false);
  const db2 = `t${++dbSeq}`;
  const worship = fakePool({ userId: 'w', memberships: [{ ministry_key: 'worship', role: 'leader' }] });
  const wl = { id: 'w', role: 'lider', email: 'w@x.pl' };
  assert.equal((await canAccess({ pool: worship, dbName: db2, table: 'programs', op: 'update', user: wl })).ok, true);
  assert.equal((await canAccess({ pool: worship, dbName: db2, table: 'program_songs', op: 'insert', user: wl })).ok, true);
  assert.equal((await canAccess({ pool: worship, dbName: db2, table: 'programs', op: 'delete', user: wl })).ok, false);
  const db3 = `t${++dbSeq}`;
  const worshipMember = fakePool({ userId: 'wm', memberships: [{ ministry_key: 'worship', role: 'member' }] });
  assert.equal((await canAccess({ pool: worshipMember, dbName: db3, table: 'programs', op: 'update', user: { id: 'wm', role: 'czlonek' } })).ok, false);
});

test('migracja 091 = LIDER_DELETE_RESOURCES (spójność presetu i migracji)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/tenant-migrations/091_lider_delete_grants.sql'), 'utf8');
  const caps = [...sql.matchAll(/\('(res:[a-z_]+:delete)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(caps, LIDER_DELETE_RESOURCES.map((r) => `res:${r}:delete`).sort());
  assert.match(sql, /pg\.role = 'lider' AND pg\.user_id IS NULL AND pg\.capability = v\.cap/);
});

test('canAccess: upsert to zapis — tabele app_* wymagają manage_*, writeRoles obowiązują', async () => {
  const dbName = `t${++dbSeq}`;
  const pool = fakePool();
  const member = { id: 'u1', role: 'czlonek' };
  for (const table of ['app_settings', 'app_users', 'permission_grants', 'app_roles']) {
    const r = await canAccess({ pool, dbName, table, op: 'upsert', user: member });
    assert.equal(r.ok, false, `upsert ${table} przez członka musi być odrzucony`);
  }
  const sermons = await canAccess({ pool, dbName, table: 'sermons', op: 'upsert', user: member });
  assert.equal(sermons.ok, false, 'writeRoles dotyczy też upsertu');
  // Odczyt app_settings — dalej otwarty.
  const read = await canAccess({ pool, dbName, table: 'app_settings', op: 'select', user: member });
  assert.equal(read.ok, true);
});

test('migracja 109 = lider usuwa własne dane czatu (ankiety, „Modlę się”, reakcje)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/tenant-migrations/109_komunikator_own_delete_grants.sql'), 'utf8');
  const listed = sql.match(/unnest\(ARRAY\[([^\]]+)\]\) AS c/)[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual([...listed].sort(), [...KOMUNIKATOR_OWN_DELETE_RESOURCES].sort());
  const komunikator = MODULES.find((m) => m.key === 'komunikator').resources;
  for (const r of KOMUNIKATOR_OWN_DELETE_RESOURCES) assert.ok(komunikator.includes(r), `${r} w module Komunikator`);
  const lider = makeResolver(presetGrantRows(), { role: 'lider', userId: 'l', isAdmin: false }).can;
  const czlonek = makeResolver(presetGrantRows(), { role: 'czlonek', userId: 'c', isAdmin: false }).can;
  for (const r of KOMUNIKATOR_OWN_DELETE_RESOURCES) {
    assert.equal(lider(`res:${r}:delete`), true, `lider: ${r}`);
    assert.equal(czlonek(`res:${r}:delete`), true, `członek: ${r}`);
  }
  assert.match(sql, /ON CONFLICT \(role, capability\) WHERE user_id IS NULL DO NOTHING/, 'decyzje admina zostają');
});
