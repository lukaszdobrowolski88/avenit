// Licencjonowanie = liczba KONT UŻYTKOWNIKÓW tenanta (app_users; reguła: shared/billing/accounts.js).
//
// Kolumny app_users czytamy z information_schema (migracje w repo ≠ produkcja), a zapytanie budujemy
// tylko z istniejących kolumn. Gdy i to padnie — liczymy wszystkie konta (approximate=true).
// Nic tu niczego nie blokuje: wynik służy wyłącznie komunikatom i panelowi admina.
import {
  accountsCountSql, planUsage, suggestPlan, planRef,
} from '@avenit/shared/src/billing/accounts.js';

export async function appUserColumns(pool) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'app_users' AND table_schema = current_schema()`
  );
  return rows;
}

// → { accounts, pending, blocked, total, approximate, columns } ; zera, gdy tabeli app_users brak.
export async function countTenantAccounts(pool) {
  const cols = await appUserColumns(pool);
  if (!cols.length) return { accounts: 0, pending: 0, blocked: 0, total: 0, approximate: false, columns: [] };
  try {
    const q = accountsCountSql(cols);
    const { rows } = await pool.query(q.text);
    const { accounts, pending, total } = rows[0];
    return { accounts, pending, blocked: Math.max(0, total - accounts - pending), total, approximate: false, columns: q.used };
  } catch { /* łagodniejsza próba niżej */ }
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM app_users`);
  return { accounts: rows[0].n, pending: 0, blocked: 0, total: rows[0].n, approximate: true, columns: [] };
}

// Aktywna subskrypcja tenanta + plan (baza platform). null gdy brak.
export async function activeSubscription(platformPool, tenantId) {
  const { rows } = await platformPool.query(
    `SELECT ts.id AS subscription_id, ts.status, ts.billing_cycle, ts.current_period_start, ts.current_period_end,
            ts.trial_ends_at, ts.custom_price_monthly, ts.custom_price_yearly,
            sp.id AS plan_id, COALESCE(sp.key, sp.slug) AS plan_key, sp.name AS plan_name, sp.description,
            sp.price_monthly, sp.price_yearly, sp.max_members, sp.limit_buffer_pct, sp.is_custom,
            sp.is_active AS plan_is_active, sp.is_public AS plan_is_public, sp.features
       FROM tenant_subscriptions ts JOIN subscription_plans sp ON ts.plan_id = sp.id
      WHERE ts.tenant_id = $1 AND ts.status IN ('trialing','active','past_due')
      ORDER BY ts.created_at DESC LIMIT 1`,
    [tenantId]
  );
  return rows[0] || null;
}

// Plany oferowane (publiczne i aktywne), w kolejności cennika.
export async function offeredPlans(platformPool) {
  const { rows } = await platformPool.query(
    `SELECT id, COALESCE(key, slug) AS key, slug, name, description, price_monthly, price_yearly,
            max_members, limit_buffer_pct, is_custom, is_active, is_public, sort_order, features, trial_days
       FROM subscription_plans WHERE is_active AND is_public ORDER BY sort_order, price_monthly`
  );
  return rows;
}

// Pełny obraz wykorzystania: kontrakt GET /api/admin/tenants/:id/usage
//   { accounts, pending, limit, bufferLimit, pct, state, plan:{key,name}, suggestedPlan:{key,name}, ... }
export async function tenantPlanUsage(platformPool, tenantId, tenantDb) {
  const [sub, plans, counted] = await Promise.all([
    activeSubscription(platformPool, tenantId),
    offeredPlans(platformPool),
    tenantDb ? countTenantAccounts(tenantDb).catch(() => null) : Promise.resolve(null),
  ]);
  const accounts = counted?.accounts ?? 0;
  const plan = sub ? {
    key: sub.plan_key, name: sub.plan_name, max_members: sub.max_members,
    limit_buffer_pct: sub.limit_buffer_pct, is_custom: sub.is_custom,
  } : null;
  const usage = planUsage({ accounts, plan });
  const suggested = suggestPlan(accounts, plans);
  return {
    ...usage,
    pending: counted?.pending ?? 0,
    blocked: counted?.blocked ?? 0,
    plan: plan ? { key: plan.key, name: plan.name } : null,
    planObj: plan,
    planRetired: sub ? (sub.plan_is_active === false || sub.plan_is_public === false) : false,
    suggestedPlan: planRef(suggested),
    counted: counted != null,
    approximate: counted?.approximate ?? true,
    totalAccounts: counted?.total ?? null,
    subscription: sub,
    plans,
  };
}

// Prognoza po zmianie liczby kont o `delta` (np. podgląd synchronizacji katalogu: nowe − blokowane):
// { current, accounts, limit, bufferLimit, state, exceedsBuffer, plan }. Tylko informacja — nikogo
// nie blokujemy. null, gdy nie da się policzyć kont.
export async function accountsForecast(platformPool, tenantId, tenantDb, delta = 0) {
  const u = await tenantPlanUsage(platformPool, tenantId, tenantDb);
  if (!u.counted) return null;
  const after = planUsage({ accounts: Math.max(0, u.accounts + (Number(delta) || 0)), plan: u.planObj });
  return {
    current: u.accounts, accounts: after.accounts, limit: after.limit, bufferLimit: after.bufferLimit,
    state: after.state, exceedsBuffer: after.state === 'over_buffer', plan: u.plan,
  };
}

// Comiesięczny zapis (worker, 1. dnia miesiąca): liczba kont per tenant → tenant_usage_snapshots
// (kolumna accounts; adults zostaje z historii sprzed zmiany metryki, dla nowych odczytów NULL).
export async function recordUsageSnapshots(platformPool, getTenantPool, { log = () => {} } = {}) {
  const { rows: tenants } = await platformPool.query(
    `SELECT id, slug, db_name FROM tenants WHERE status IN ('trial','active','suspended')`
  );
  let saved = 0;
  for (const t of tenants) {
    try {
      const u = await tenantPlanUsage(platformPool, t.id, getTenantPool(t.db_name));
      if (!u.counted) continue;
      await platformPool.query(
        `INSERT INTO tenant_usage_snapshots (tenant_id, period, accounts, pending_accounts, plan_key, plan_limit, state)
         VALUES ($1, date_trunc('month', now())::date, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, period) DO UPDATE SET accounts = EXCLUDED.accounts,
           pending_accounts = EXCLUDED.pending_accounts, plan_key = EXCLUDED.plan_key,
           plan_limit = EXCLUDED.plan_limit, state = EXCLUDED.state, created_at = now()`,
        [t.id, u.accounts, u.pending, u.plan?.key || null, u.limit, u.state]
      );
      saved++;
    } catch (err) {
      log(`usage-snapshot [${t.slug}] błąd: ${err.message}`);
    }
  }
  return { tenants: tenants.length, saved };
}
