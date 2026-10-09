// Licencjonowanie = liczba dorosłych w bazie członków tenanta (reguła: shared/billing/adults.js).
//
// Kolumny `members` czytamy z information_schema (migracje w repo ≠ produkcja), a predykat budujemy
// tylko z istniejących kolumn. Gdy dane mają śmieci (np. tekstowa data urodzenia, której nie da się
// rzutować) — liczymy bez warunku wieku (approximate=true), a gdy i to padnie — wszystkich (count(*)).
// Nic tu niczego nie blokuje: wynik służy wyłącznie komunikatom i panelowi admina.
import {
  countAdultsSql, planUsage, suggestPlan, planRef,
} from '@avenit/shared/src/billing/adults.js';

export async function memberColumns(pool) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'members' AND table_schema = current_schema()`
  );
  return rows;
}

// → { adults, total, approximate, columns } ; adults=0 gdy tabeli members brak.
export async function countTenantAdults(pool, opts = {}) {
  const cols = await memberColumns(pool);
  if (!cols.length) return { adults: 0, total: 0, approximate: false, columns: [] };
  const attempts = [opts, { ...opts, skipBirthDate: true }];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const q = countAdultsSql(cols, attempts[i]);
      const [{ rows }, tot] = await Promise.all([
        pool.query(q.text, q.params),
        pool.query(`SELECT count(*)::int AS n FROM members`),
      ]);
      return { adults: rows[0].n, total: tot.rows[0].n, approximate: i > 0, columns: q.used };
    } catch { /* kolejna, łagodniejsza próba */ }
  }
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM members`);
  return { adults: rows[0].n, total: rows[0].n, approximate: true, columns: [] };
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
//   { adults, limit, bufferLimit, pct, state, plan:{key,name}, suggestedPlan:{key,name}, ... }
export async function tenantPlanUsage(platformPool, tenantId, tenantDb, opts = {}) {
  const [sub, plans, counted] = await Promise.all([
    activeSubscription(platformPool, tenantId),
    offeredPlans(platformPool),
    tenantDb ? countTenantAdults(tenantDb, opts).catch(() => null) : Promise.resolve(null),
  ]);
  const adults = counted?.adults ?? 0;
  const plan = sub ? {
    key: sub.plan_key, name: sub.plan_name, max_members: sub.max_members,
    limit_buffer_pct: sub.limit_buffer_pct, is_custom: sub.is_custom,
  } : null;
  const usage = planUsage({ adults, plan });
  const suggested = suggestPlan(adults, plans);
  return {
    ...usage,
    plan: plan ? { key: plan.key, name: plan.name } : null,
    planRetired: sub ? (sub.plan_is_active === false || sub.plan_is_public === false) : false,
    suggestedPlan: planRef(suggested),
    counted: counted != null,
    approximate: counted?.approximate ?? true,
    totalMembers: counted?.total ?? null,
    subscription: sub,
    plans,
  };
}

// Comiesięczny zapis (worker, 1. dnia miesiąca): liczba dorosłych per tenant → tenant_usage_snapshots.
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
        `INSERT INTO tenant_usage_snapshots (tenant_id, period, adults, plan_key, plan_limit, state)
         VALUES ($1, date_trunc('month', now())::date, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, period) DO UPDATE SET adults = EXCLUDED.adults, plan_key = EXCLUDED.plan_key,
           plan_limit = EXCLUDED.plan_limit, state = EXCLUDED.state, created_at = now()`,
        [t.id, u.adults, u.plan?.key || null, u.limit, u.state]
      );
      saved++;
    } catch (err) {
      log(`usage-snapshot [${t.slug}] błąd: ${err.message}`);
    }
  }
  return { tenants: tenants.length, saved };
}
