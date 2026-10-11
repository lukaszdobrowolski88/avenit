// Finanse — uprawnienia po audycie 2026-10-11: lider bez pełnych Finansów, lider służby widzi
// tylko budżet i wydatki swojej służby (serwer zawęża po team_type), eksport raportów za
// action:finance:export, ślad zmian budżetu pisany przez serwer.
// /api/db przez Fastify inject z fałszywą bazą (rejestrujemy wygenerowany SQL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import dataApiRoutes from '../src/dataapi/routes.js';
import { applyTeamFinanceScope, financeTeamTypes, writeBudgetAudit } from '../src/dataapi/financeScope.js';
import { presetGrantRows, ROLE_PRESETS } from '@avenit/shared/src/permissions/presets.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { MODULES, FN_CAPABILITY } from '@avenit/shared/src/permissions/catalog.js';

let dbSeq = 0;

function fakeDb({ account, memberships = [], userGrants = [], handle = () => null }) {
  const log = [];
  return {
    log,
    query: async (sql, params = []) => {
      if (/FROM app_users WHERE id = \$1/.test(sql)) return { rows: [account] };
      if (/FROM app_modules/.test(sql)) return { rows: [{ key: 'media' }, { key: 'worship' }, { key: 'kobiety', label: 'Kobiety', component_name: null }] };
      if (/FROM permission_grants/.test(sql)) {
        return { rows: [...presetGrantRows(), ...userGrants.map(([capability, allowed = true]) => ({ role: null, user_id: account.id, capability, allowed }))] };
      }
      if (/FROM app_roles WHERE is_admin/.test(sql)) return { rows: [{ key: 'superadmin' }] };
      if (/FROM ministry_memberships/.test(sql)) return { rows: memberships.map((m) => ({ user_id: account.id, ...m })) };
      log.push({ sql, params });
      return handle(sql, params) || { rows: [], rowCount: 0 };
    },
  };
}

async function api({ role = 'czlonek', email = 'jan@x.pl', id = 'u1', memberships = [], userGrants = [], handle } = {}) {
  const account = { id, role, is_super_admin: false, campus_id: null, member_id: null };
  const db = fakeDb({ account, memberships, userGrants, handle });
  const app = Fastify();
  const tenant = { id: 't', slug: 'kosciol', subdomain: 'kosciol', db_name: `finscope_${++dbSeq}` };
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
  return { call, db };
}

const mainSql = (db, table) => db.log.map((x) => x).filter((x) => x.sql.includes(`"${table}"`));

// ── Preset lidera ────────────────────────────────────────────────────────────
test('preset lider: bez module:finance i bez zapisu w ŻADNEJ tabeli finansów', () => {
  const rows = presetGrantRows();
  const r = makeResolver(rows, { role: 'lider', userId: 'x', isAdmin: false });
  assert.equal(r.can('module:finance'), false);
  for (const res of MODULES.find((m) => m.key === 'finance').resources) {
    for (const op of ['create', 'update', 'delete']) assert.equal(r.can(`res:${res}:${op}`), false, `${res}:${op}`);
  }
  assert.equal(r.can('module:media'), true, 'służby dalej dostępne');
  assert.ok(ROLE_PRESETS.lider.some((g) => g.capability === 'module:finance' && g.allowed === false));
});

test('wysyłka raportu finansowego mailem wymaga prawa eksportu', () => {
  assert.equal(FN_CAPABILITY['finance-report-email'], 'action:finance:export');
});

// ── Zakres służby ────────────────────────────────────────────────────────────
test('lider bez zakładki Finanse: żadnych finansów (budżet, wpływy, wydatki)', async () => {
  const { call } = await api({ role: 'lider' });
  for (const table of ['budget_items', 'income_transactions', 'expense_transactions', 'finance_balances']) {
    assert.equal((await call({ table, op: 'select', select: '*' })).status, 403, table);
  }
});

test('lider z zakładką Finanse Mediów: tylko budżet i wydatki MediaTeam', async () => {
  const { call, db } = await api({ role: 'lider', userGrants: [['tab:media:finances']] });
  const res = await call({ table: 'budget_items', op: 'select', select: '*', filters: [{ type: 'eq', column: 'year', value: 2026 }] });
  assert.equal(res.status, 200);
  const q = mainSql(db, 'budget_items').at(-1);
  assert.match(q.sql, /"team_type" = ANY\(\$\d+::text\[\]\)/);
  assert.ok(q.params.some((p) => Array.isArray(p) && p.length === 1 && p[0] === 'MediaTeam'), 'zakres = MediaTeam');

  // Nawet filtr na inną służbę nie wyjdzie poza zakres (AND z team_type = ANY).
  await call({ table: 'expense_transactions', op: 'select', select: '*', filters: [{ type: 'eq', column: 'team_type', value: 'Grupa Uwielbienia' }] });
  assert.match(mainSql(db, 'expense_transactions').at(-1).sql, /"team_type" = ANY/);

  // Wpływy (ofiarodawcy) i salda — poza zakresem służby.
  assert.equal((await call({ table: 'income_transactions', op: 'select', select: '*' })).status, 403);
  assert.equal((await call({ table: 'finance_balances', op: 'select', select: '*' })).status, 403);
  // Budżetu nie zmienia, wydatków nie edytuje ani nie usuwa.
  assert.equal((await call({ table: 'budget_items', op: 'update', values: { planned_amount: 1 }, filters: [{ type: 'eq', column: 'id', value: 'b1' }] })).status, 403);
  assert.equal((await call({ table: 'expense_transactions', op: 'update', values: { amount: 1 }, filters: [{ type: 'eq', column: 'id', value: 'e1' }] })).status, 403);
  assert.equal((await call({ table: 'expense_transactions', op: 'delete', filters: [{ type: 'eq', column: 'id', value: 'e1' }] })).status, 403);
  // Złączenie ominęłoby zakres — odrzucone.
  assert.equal((await call({ table: 'budget_items', op: 'select', select: '*, finance_projects(*)' })).status >= 400, true);
});

test('lider służby zgłasza wydatek tylko dla swojej służby — jako wniosek, bez decyzji', async () => {
  const { call, db } = await api({ role: 'lider', userGrants: [['tab:media:finances']] });
  const ok = await call({ table: 'expense_transactions', op: 'insert', values: { team_type: 'MediaTeam', category: 'Administracja', amount: 50, description: 'Kabel', project_id: 'p1', is_paid: true } });
  assert.equal(ok.status, 403, 'opłacone = decyzja zatwierdzającego');
  const req = await call({ table: 'expense_transactions', op: 'insert', values: { team_type: 'MediaTeam', category: 'Administracja', amount: 50, description: 'Kabel', project_id: 'p1' } });
  assert.equal(req.status, 200);
  const ins = mainSql(db, 'expense_transactions').at(-1);
  assert.match(ins.sql, /INSERT INTO/);
  assert.ok(ins.params.includes('submitted'), 'status = wniosek');
  assert.ok(ins.params.includes(false), 'nieopłacony');
  assert.ok(!ins.params.includes('Administracja'), 'kategoria innej służby podmieniona na własną');
  assert.ok(!ins.params.includes('p1'), 'bez przypinania do projektu');
  const other = await call({ table: 'expense_transactions', op: 'insert', values: { team_type: 'Grupa Uwielbienia', amount: 50, description: 'X' } });
  assert.equal(other.status, 403);
});

test('przynależność do służby: lider widzi finanse służby, członek nie', async () => {
  const leader = await api({ memberships: [{ ministry_key: 'media', role: 'leader' }] });
  assert.equal((await leader.call({ table: 'budget_items', op: 'select', select: '*' })).status, 200);
  const member = await api({ memberships: [{ ministry_key: 'media', role: 'member' }] });
  assert.equal((await member.call({ table: 'budget_items', op: 'select', select: '*' })).status, 403);
});

test('moduł własny: finanse po kluczu i nazwie, tylko z zakładką Finanse modułu', async () => {
  const r = makeResolver([...presetGrantRows(), { role: null, user_id: 'u1', capability: 'module:kobiety', allowed: true }], { role: 'czlonek', userId: 'u1', isAdmin: false });
  const db = fakeDb({ account: { id: 'u1', role: 'czlonek' } });
  assert.deepEqual(await financeTeamTypes(db, r), [], 'sam dostęp do modułu nie wystarcza');
  const r2 = makeResolver([...presetGrantRows(), ...['module:kobiety', 'tab:kobiety:finances'].map((capability) => ({ role: null, user_id: 'u1', capability, allowed: true }))], { role: 'czlonek', userId: 'u1', isAdmin: false });
  assert.deepEqual((await financeTeamTypes(db, r2)).sort(), ['Kobiety', 'kobiety']);
});

test('rada starszych: pełne finanse bez zawężenia', async () => {
  const { call, db } = await api({ role: 'rada_starszych' });
  assert.equal((await call({ table: 'income_transactions', op: 'select', select: '*' })).status, 200);
  assert.doesNotMatch(mainSql(db, 'income_transactions').at(-1).sql, /team_type/);
});

test('applyTeamFinanceScope: operacje spoza zakresu i pusta lista służb → 403', () => {
  assert.throws(() => applyTeamFinanceScope({ table: 'income_transactions', op: 'select' }, ['MediaTeam']), /Brak dostępu/);
  assert.throws(() => applyTeamFinanceScope({ table: 'budget_items', op: 'select' }, []), /Brak dostępu/);
  assert.throws(() => applyTeamFinanceScope({ table: 'budget_items', op: 'insert', values: { team_type: 'MediaTeam' } }, ['MediaTeam']), /Brak dostępu/);
});

// ── Harmonogram raportów i audyt budżetu ─────────────────────────────────────
test('harmonogram raportów: zapis tylko z prawem eksportu', async () => {
  const base = [['module:finance'], ['res:finance_report_schedules:create'], ['res:finance_report_schedules:read']];
  const noExport = await api({ userGrants: base });
  assert.equal((await noExport.call({ table: 'finance_report_schedules', op: 'select', select: '*' })).status, 200);
  assert.equal((await noExport.call({ table: 'finance_report_schedules', op: 'insert', values: { cadence: 'monthly', recipients: ['x@zewn.pl'] } })).status, 403);
  const withExport = await api({ userGrants: [...base, ['action:finance:export']] });
  assert.equal((await withExport.call({ table: 'finance_report_schedules', op: 'insert', values: { cadence: 'monthly', recipients: ['x@zewn.pl'] } })).status, 200);
});

test('budżet: ślad zmian pisze serwer; budget_audit tylko do odczytu przez API', async () => {
  const handle = (sql) => (/INSERT INTO "budget_items"/.test(sql) ? { rows: [{ id: 'b1', year: 2026, category: 'Budynek', description: 'Wynajem', planned_amount: '100' }], rowCount: 1 } : null);
  const { call, db } = await api({ role: 'rada_starszych', email: 'skarbnik@x.pl', handle });
  assert.equal((await call({ table: 'budget_items', op: 'insert', values: { year: 2026, category: 'Budynek', description: 'Wynajem', planned_amount: 100 } })).status, 200);
  const audit = db.log.find((x) => /INSERT INTO budget_audit/.test(x.sql));
  assert.ok(audit, 'wpis audytu');
  assert.equal(audit.params[2], 'created');
  assert.equal(audit.params[7], 'skarbnik@x.pl');
  assert.equal((await call({ table: 'budget_audit', op: 'insert', values: { action: 'created' } })).status, 403);
});

test('writeBudgetAudit: update i delete z wierszami „przed”', async () => {
  const log = [];
  const db = { query: async (sql, params) => { log.push({ sql, params }); return { rows: [] }; } };
  const before = [{ id: 'b1', year: 2026, category: 'Budynek', description: 'Wynajem', planned_amount: 100 }];
  await writeBudgetAudit(db, { table: 'budget_items', op: 'update' }, before, [{ ...before[0], planned_amount: 200 }], 'a@x.pl');
  await writeBudgetAudit(db, { table: 'budget_items', op: 'delete' }, before, [], 'a@x.pl');
  assert.deepEqual(log.map((x) => x.params[2]), ['updated', 'deleted']);
  assert.match(log[0].params[5], /"planned_amount":100/);
  assert.match(log[0].params[6], /"planned_amount":200/);
});
