// Cennik „za dorosłych” (2026-10): wspólny helper shared/billing (predykat dorosłych, planUsage,
// suggestPlan, ceny brutto), katalog = strona avenit.pl oraz autoryzacja endpointów
// GET /api/admin/tenants/:id/usage (tylko admin platformy) i GET /api/tenant/plan-usage
// (tylko osoby z dostępem do rozliczeń). Bez prawdziwej bazy — fałszywe pule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
  isAdultMember, countAdults, adultsWhereSql, countAdultsSql, planUsage, suggestPlan,
  subscriptionPrice, splitGross, billingToday, EXCLUDED_STATUS_VALUES,
} from '@avenit/shared/src/billing/adults.js';
import { PRICING_PLANS, PLAN_BY_KEY, LIMIT_BUFFER_PCT, DEFAULT_PLAN_KEY } from '@avenit/shared/src/billing/catalog.js';
import { presetGrantRows } from '@avenit/shared/src/permissions/presets.js';
import { platformPool } from '../src/db.js';
import { signAccessToken, AUD_ADMIN, AUD_TENANT } from '../src/auth/tokens.js';
import contextPlugin from '../src/plugins/context.js';
import adminRoutes from '../src/admin/routes.js';
import tenantRoutes from '../src/tenant/routes.js';
import { countTenantAdults } from '../src/tenant/adults.js';

const TODAY = '2026-10-09';

// ── Katalog = strona ─────────────────────────────────────────────────────────
test('katalog: 5 planów, ceny brutto i limity jak na avenit.pl, rok = 10 × miesiąc', () => {
  assert.deepEqual(PRICING_PLANS.map((p) => p.key), ['start', 'wspolnota', 'kosciol', 'kosciol_plus', 'siec']);
  assert.deepEqual(PRICING_PLANS.map((p) => p.name), ['Start', 'Wspólnota', 'Kościół', 'Kościół+', 'Sieć']);
  assert.deepEqual(PRICING_PLANS.map((p) => p.priceMonthly), [7900, 15900, 29900, 49900, 89900]);
  assert.deepEqual(PRICING_PLANS.map((p) => p.maxAdults), [50, 150, 400, 1000, -1]);
  for (const p of PRICING_PLANS.filter((x) => !x.isCustom)) assert.equal(p.priceYearly, p.priceMonthly * 10);
  assert.equal(PLAN_BY_KEY.siec.priceYearly, null);
  assert.equal(PLAN_BY_KEY.siec.isCustom, true);
  assert.equal(PLAN_BY_KEY.kosciol_plus.prioritySupport, true);
  assert.equal(PLAN_BY_KEY.kosciol.prioritySupport, false);
  assert.equal(LIMIT_BUFFER_PCT, 10);
  assert.equal(DEFAULT_PLAN_KEY, 'start');
});

// ── Kto jest dorosłym ────────────────────────────────────────────────────────
test('isAdultMember: wiek wg daty urodzenia (≥ 18 dziś), brak daty = dorosły', () => {
  const o = { today: TODAY };
  assert.equal(isAdultMember({ birth_date: '2008-10-09' }, o), true, '18 lat dokładnie dziś');
  assert.equal(isAdultMember({ birth_date: '2008-10-10' }, o), false, '18 lat jutro');
  assert.equal(isAdultMember({ birth_date: '1980-01-01T00:00:00Z' }, o), true);
  assert.equal(isAdultMember({ birth_date: '2015-05-05' }, o), false);
  assert.equal(isAdultMember({ birth_date: null, status: 'Członek' }, o), true);
  assert.equal(isAdultMember({ first_name: 'Jan' }, o), true);
  assert.equal(isAdultMember({ birth_date: 'nieznana' }, o), true, 'śmieci w dacie = brak daty');
});

test('isAdultMember: goście, dzieci, zarchiwizowani i nieaktywni się nie liczą', () => {
  const o = { today: TODAY };
  for (const status of ['Gość', ' gość ', 'Guest', 'Dziecko', 'archiwum', 'Nieaktywny', 'Zarchiwizowany']) {
    assert.equal(isAdultMember({ status, birth_date: '1980-01-01' }, o), false, status);
  }
  assert.equal(isAdultMember({ status: 'Sympatyk' }, o), true);
  assert.equal(isAdultMember({ membership_status: 'inactive' }, o), false);
  assert.equal(isAdultMember({ is_active: false }, o), false);
  assert.equal(isAdultMember({ is_active: null }, o), true);
  assert.equal(isAdultMember({ is_archived: true }, o), false);
  assert.equal(isAdultMember({ archived_at: '2026-01-01' }, o), false);
  assert.equal(isAdultMember({ deleted_at: null }, o), true);
  assert.equal(countAdults([{ status: 'Członek' }, { status: 'Gość' }, { birth_date: '2020-01-01' }, {}], o), 2);
});

test('adultsWhereSql: predykat tylko z istniejących kolumn, typ daty uwzględniony', () => {
  const none = adultsWhereSql([]);
  assert.equal(none.sql, 'TRUE');
  const prod = adultsWhereSql([
    { column_name: 'status', data_type: 'text' }, { column_name: 'birth_date', data_type: 'date' },
    { column_name: 'first_name', data_type: 'text' },
  ], { today: TODAY });
  assert.deepEqual(prod.params, [TODAY]);
  assert.deepEqual(prod.used, ['birth_date', 'status']);
  assert.match(prod.sql, /"birth_date" IS NULL OR "birth_date" <= \(\$1::date - INTERVAL '18 years'\)::date/);
  assert.match(prod.sql, /lower\(btrim\(COALESCE\("status"::text, ''\)\)\) NOT IN \(/);
  for (const v of ['gość', 'dziecko', 'archiwum']) assert.ok(prod.sql.includes(`'${v}'`));
  // Tekstowa data → ostrożne rzutowanie tylko formatu ISO.
  const txt = adultsWhereSql({ birth_date: 'character varying' });
  assert.match(txt.sql, /CASE WHEN "birth_date"::text ~ '\^\[0-9\]\{4\}/);
  assert.match(txt.sql, /AT TIME ZONE 'Europe\/Warsaw'/);
  // Kolumna is_active nie-boolean jest pomijana (nie wysadzi zapytania).
  assert.equal(adultsWhereSql({ is_active: 'text' }).sql, 'TRUE');
  assert.match(adultsWhereSql({ is_active: 'boolean', archived_at: 'timestamp with time zone' }).sql, /COALESCE\("is_active", TRUE\) AND "archived_at" IS NULL/);
  assert.match(countAdultsSql(['status'], { today: TODAY, paramIndex: 3 }).text, /^SELECT count\(\*\)::int AS n FROM members WHERE /);
  assert.ok(EXCLUDED_STATUS_VALUES.every((v) => v === v.toLowerCase().trim()));
});

test('billingToday: data w strefie Europe/Warsaw', () => {
  assert.equal(billingToday(new Date('2026-10-09T22:30:00Z')), '2026-10-10');
  assert.equal(billingToday(new Date('2026-01-09T22:30:00Z')), '2026-01-09');
});

// ── planUsage ────────────────────────────────────────────────────────────────
test('planUsage: stany ok / near / over (10% zapasu) / over_buffer / unlimited', () => {
  const start = { max_members: 50, limit_buffer_pct: 10 };
  assert.deepEqual(planUsage({ adults: 10, plan: start }), { adults: 10, limit: 50, bufferLimit: 55, pct: 20, state: 'ok' });
  assert.equal(planUsage({ adults: 44, plan: start }).state, 'ok');
  assert.equal(planUsage({ adults: 45, plan: start }).state, 'near');
  assert.equal(planUsage({ adults: 50, plan: start }).state, 'near');
  assert.equal(planUsage({ adults: 51, plan: start }).state, 'over');
  assert.equal(planUsage({ adults: 55, plan: start }).state, 'over');
  assert.equal(planUsage({ adults: 56, plan: start }).state, 'over_buffer');
  assert.equal(planUsage({ adults: 56, plan: start }).pct, 112);
  assert.equal(planUsage({ adults: 165, plan: { max_members: 150 } }).state, 'over', 'domyślny zapas 10%');
  assert.equal(planUsage({ adults: 166, plan: { max_members: 150 } }).state, 'over_buffer');
  assert.equal(planUsage({ adults: 420, plan: { maxAdults: 400, limitBufferPct: 0 } }).state, 'over_buffer');
  assert.deepEqual(planUsage({ adults: 5000, plan: { max_members: -1 } }), { adults: 5000, limit: -1, bufferLimit: null, pct: null, state: 'unlimited' });
  assert.equal(planUsage({ adults: 3, plan: null }).state, 'unlimited');
  assert.equal(planUsage({ adults: -2, plan: start }).adults, 0);
});

test('suggestPlan: najmniejszy pasujący plan, ponad 1000 → Sieć, wycofane pomijane', () => {
  const plans = [
    ...PRICING_PLANS.map((p) => ({ key: p.key, name: p.name, max_members: p.maxAdults, is_custom: p.isCustom, sort_order: p.sortOrder })),
    { key: 'enterprise', name: 'Enterprise', max_members: -1, is_active: false, is_public: false, sort_order: 104 },
  ];
  assert.equal(suggestPlan(0, plans).key, 'start');
  assert.equal(suggestPlan(50, plans).key, 'start');
  assert.equal(suggestPlan(51, plans).key, 'wspolnota');
  assert.equal(suggestPlan(400, plans).key, 'kosciol');
  assert.equal(suggestPlan(999, plans).key, 'kosciol_plus');
  assert.equal(suggestPlan(1001, plans).key, 'siec');
  assert.equal(suggestPlan(10, []), null);
});

test('ceny: brutto, rok = price_yearly, cena indywidualna ma pierwszeństwo, Sieć nigdy z cennika', () => {
  const wsp = { price_monthly: 15900, price_yearly: 159000, is_custom: false };
  assert.deepEqual(subscriptionPrice({ plan: wsp }), { amount: 15900, source: 'list', cycle: 'monthly' });
  assert.deepEqual(subscriptionPrice({ plan: wsp, billingCycle: 'yearly' }), { amount: 159000, source: 'list', cycle: 'yearly' });
  assert.equal(subscriptionPrice({ plan: wsp, customPriceMonthly: 12000 }).amount, 12000);
  const siec = { price_monthly: 89900, price_yearly: null, is_custom: true };
  assert.equal(subscriptionPrice({ plan: siec }).amount, null);
  assert.equal(subscriptionPrice({ plan: siec }).source, 'custom_required');
  assert.deepEqual(subscriptionPrice({ plan: siec, billingCycle: 'yearly', customPriceYearly: 1500000 }), { amount: 1500000, source: 'custom', cycle: 'yearly' });
  // Brutto 79 zł: VAT wyliczony Z kwoty (nie doliczony).
  assert.deepEqual(splitGross(7900), { subtotal: 6423, taxAmount: 1477, total: 7900, taxRate: 23 });
  assert.equal(splitGross(79000).total, 79000);
});

// ── Liczenie w bazie tenanta (fałszywa pula) ─────────────────────────────────
test('countTenantAdults: introspekcja kolumn, a przy błędzie rzutowania liczenie bez wieku', async () => {
  const seen = [];
  let failBirth = true;
  const pool = {
    async query(sql, params) {
      seen.push(sql);
      if (/information_schema\.columns/.test(sql)) return { rows: [{ column_name: 'status', data_type: 'text' }, { column_name: 'birth_date', data_type: 'text' }] };
      if (/WHERE .*birth_date/.test(sql) && failBirth) throw new Error('invalid input syntax for type date');
      if (/FROM members WHERE/.test(sql)) return { rows: [{ n: 7 }] };
      if (/count\(\*\)::int AS n FROM members$/.test(sql.trim())) return { rows: [{ n: 9 }] };
      return { rows: [] };
    },
  };
  const r = await countTenantAdults(pool, { today: TODAY });
  assert.deepEqual(r, { adults: 7, total: 9, approximate: true, columns: ['status'] });
  failBirth = false;
  const ok = await countTenantAdults(pool, { today: TODAY });
  assert.equal(ok.approximate, false);
  assert.deepEqual(ok.columns, ['birth_date', 'status']);
  const empty = await countTenantAdults({ query: async () => ({ rows: [] }) });
  assert.deepEqual(empty, { adults: 0, total: 0, approximate: false, columns: [] });
});

// ── Endpointy: autoryzacja ───────────────────────────────────────────────────
const PLANS_ROWS = PRICING_PLANS.map((p) => ({
  id: `plan-${p.key}`, key: p.key, slug: p.key, name: p.name, description: p.tagline, price_monthly: p.priceMonthly,
  price_yearly: p.priceYearly, max_members: p.maxAdults, limit_buffer_pct: 10, is_custom: p.isCustom,
  is_active: true, is_public: true, sort_order: p.sortOrder, features: { all_modules: true, priority_support: p.prioritySupport }, trial_days: 14,
}));
const SUB_ROW = {
  subscription_id: 's1', status: 'active', billing_cycle: 'yearly', current_period_start: null, current_period_end: '2027-01-01',
  trial_ends_at: null, custom_price_monthly: null, custom_price_yearly: null, plan_id: 'plan-start', plan_key: 'start', plan_name: 'Start',
  description: 'x', price_monthly: 7900, price_yearly: 79000, max_members: 50, limit_buffer_pct: 10, is_custom: false,
  plan_is_active: true, plan_is_public: true, features: {},
};
const origQuery = platformPool.query;
function patchPlatform() {
  platformPool.query = async (sql) => {
    if (/FROM tenants WHERE id = \$1/.test(sql)) return { rows: [{ id: 't1', db_name: 'BAD-NAME' }] };
    if (/FROM tenant_subscriptions ts JOIN subscription_plans sp/.test(sql)) return { rows: [SUB_ROW] };
    if (/FROM subscription_plans WHERE is_active AND is_public/.test(sql)) return { rows: PLANS_ROWS };
    return { rows: [] };
  };
}
const restorePlatform = () => { platformPool.query = origQuery; };

test('GET /api/admin/tenants/:id/usage: tylko admin platformy (token admina), kontrakt odpowiedzi', async (t) => {
  patchPlatform();
  t.after(restorePlatform);
  const app = Fastify();
  await app.register(contextPlugin);
  await app.register(adminRoutes);
  const noAuth = await app.inject({ method: 'GET', url: '/api/admin/tenants/t1/usage' });
  assert.equal(noAuth.statusCode, 401);
  const tenantTok = await signAccessToken({ userId: 'u1', tenantSlug: 'kosciol', role: 'superadmin', email: 'a@x.pl', aud: AUD_TENANT });
  const asTenant = await app.inject({ method: 'GET', url: '/api/admin/tenants/t1/usage', headers: { authorization: `Bearer ${tenantTok}` } });
  assert.equal(asTenant.statusCode, 401, 'token użytkownika kościoła nie otwiera panelu');
  const adminTok = await signAccessToken({ userId: 'a1', email: 'admin@avenit.pl', aud: AUD_ADMIN });
  const ok = await app.inject({ method: 'GET', url: '/api/admin/tenants/t1/usage', headers: { authorization: `Bearer ${adminTok}` } });
  assert.equal(ok.statusCode, 200);
  const body = ok.json();
  for (const k of ['adults', 'limit', 'bufferLimit', 'pct', 'state', 'plan', 'suggestedPlan']) assert.ok(k in body, k);
  assert.deepEqual(body.plan, { key: 'start', name: 'Start' });
  assert.deepEqual(body.suggestedPlan, { key: 'start', name: 'Start' });
  assert.equal(body.limit, 50);
  assert.equal(body.bufferLimit, 55);
  assert.equal(body.counted, false, 'baza tenanta niedostępna → nie policzono, bez wyjątku');
  await app.close();
});

function tenantDb(account, grants = presetGrantRows()) {
  return {
    async query(sql) {
      if (/FROM app_users u LEFT JOIN app_roles r/.test(sql)) return { rows: account ? [account] : [] };
      if (/FROM permission_grants/.test(sql)) return { rows: grants };
      if (/FROM app_roles WHERE is_admin/.test(sql)) return { rows: [{ key: 'superadmin' }] };
      if (/FROM app_modules/.test(sql)) return { rows: [] };
      if (/FROM ministry_memberships/.test(sql)) return { rows: [] };
      if (/information_schema\.columns/.test(sql)) return { rows: [{ column_name: 'status', data_type: 'text' }] };
      if (/FROM members WHERE/.test(sql)) return { rows: [{ n: 53 }] };
      if (/FROM members/.test(sql)) return { rows: [{ n: 60 }] };
      return { rows: [] };
    },
  };
}
let dbSeq = 0;
async function tenantApp(account, grants) {
  const app = Fastify();
  const db = tenantDb(account, grants);
  const tenant = { id: 't1', name: 'Zbór', slug: 'kosciol', subdomain: 'kosciol', db_name: `billing_${++dbSeq}`, status: 'active', trial_ends_at: null };
  app.decorateRequest('user', null);
  app.decorateRequest('db', null);
  app.decorateRequest('tenant', null);
  app.decorate('requireUser', async (req) => { req.user = { id: account?.id || 'x', email: 'u@x.pl', role: account?.role }; req.db = db; req.tenant = tenant; });
  await app.register(tenantRoutes);
  return app;
}
const acct = (over) => ({ id: 'u1', is_active: true, is_super_admin: false, role: 'czlonek', role_admin: false, ...over });

test('GET /api/tenant/plan-usage: członek 403, admin/koordynator 200 z wykorzystaniem i planami', async (t) => {
  patchPlatform();
  t.after(restorePlatform);
  for (const [account, expected] of [
    [acct(), 403],
    [acct({ role: 'lider' }), 403],
    [acct({ is_active: false, is_super_admin: true }), 403],
    [null, 403],
    [acct({ is_super_admin: true, role: 'superadmin' }), 200],
    [acct({ role: 'kustom', role_admin: true }), 200],
    [acct({ role: 'koordynator' }), 200],
  ]) {
    const app = await tenantApp(account);
    const res = await app.inject({ method: 'GET', url: '/api/tenant/plan-usage' });
    assert.equal(res.statusCode, expected, JSON.stringify(account));
    if (expected === 200) {
      const b = res.json();
      assert.deepEqual(b.usage, { adults: 53, limit: 50, bufferLimit: 55, pct: 106, state: 'over', approximate: false });
      assert.equal(b.plan.name, 'Start');
      assert.equal(b.subscription.price.amount, 79000, 'rozliczenie roczne = price_yearly');
      assert.equal(b.plans.length, 5);
      assert.equal(b.plans[4].isCustom, true);
      assert.equal(b.suggestedPlan.key, 'wspolnota');
    }
    await app.close();
  }
  // Pojedynczy grant module:settings dla członka (override użytkownika) też otwiera rozliczenia.
  const grants = [...presetGrantRows(), { role: null, user_id: 'u1', capability: 'module:settings', allowed: true }];
  const app = await tenantApp(acct(), grants);
  assert.equal((await app.inject({ method: 'GET', url: '/api/tenant/plan-usage' })).statusCode, 200);
  await app.close();
});

test('POST /api/tenant/plan-request: członek 403, nieznany plan 400', async (t) => {
  patchPlatform();
  t.after(restorePlatform);
  const member = await tenantApp(acct());
  assert.equal((await member.inject({ method: 'POST', url: '/api/tenant/plan-request', payload: { planKey: 'wspolnota' } })).statusCode, 403);
  await member.close();
  const admin = await tenantApp(acct({ is_super_admin: true }));
  assert.equal((await admin.inject({ method: 'POST', url: '/api/tenant/plan-request', payload: { planKey: 'enterprise' } })).statusCode, 400);
  await admin.close();
});
