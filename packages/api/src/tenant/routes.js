// Informacje o tenancie dla aplikacji kościoła: plan, wykorzystanie (dorośli), status subskrypcji.
// Dane mieszkają w bazie PLATFORM (nie w bazie tenanta), więc czytamy je stamtąd
// po req.tenant.id. Zmianę planu wykonuje admin platformy — kościół wysyła prośbę (plan-request).
//
// Cennik: płaci się za liczbę DOROSŁYCH w bazie członków; wszystkie moduły w każdym planie,
// bez limitu użytkowników. Nic nie blokujemy — przekroczenie to tylko komunikat dla adminów.
import { platformPool } from '../db.js';
import { config } from '../config.js';
import { loadGrants } from '../dataapi/registry.js';
import { can } from '@avenit/shared/src/permissions/resolve.js';
import { subscriptionPrice } from '@avenit/shared/src/billing/adults.js';
import { tenantPlanUsage } from './adults.js';

// Kto widzi rozliczenia (Ustawienia → Subskrypcja): superadmin, rola is_admin albo uprawnienie
// module:settings. Zwykli członkowie — nie (żadnych komunikatów o planie).
export async function canSeeBilling(req) {
  if (!req.user?.id || !req.db) return false;
  let u = null;
  try {
    const { rows } = await req.db.query(
      `SELECT u.id, u.is_active, u.is_super_admin, u.role, COALESCE(r.is_admin, false) AS role_admin
         FROM app_users u LEFT JOIN app_roles r ON u.role = r.key WHERE u.id = $1`,
      [req.user.id]
    );
    u = rows[0] || null;
  } catch {
    const { rows } = await req.db.query(
      `SELECT id, is_active, is_super_admin, role, false AS role_admin FROM app_users WHERE id = $1`, [req.user.id]
    ).catch(() => ({ rows: [] }));
    u = rows[0] || null;
  }
  if (!u || u.is_active === false) return false;
  if (u.is_super_admin || u.role_admin) return true;
  try {
    const { grants, adminRoles } = await loadGrants(req.db, req.tenant.db_name);
    if (adminRoles?.has?.(u.role)) return true;
    if (grants === null) return false; // tryb legacy: tylko administratorzy
    return can(grants, { role: u.role, userId: u.id }, 'module:settings');
  } catch {
    return false;
  }
}

const planOut = (p) => ({
  key: p.key, name: p.name, description: p.description,
  priceMonthly: p.price_monthly, priceYearly: p.price_yearly,
  maxAdults: p.max_members, limitBufferPct: p.limit_buffer_pct ?? 10,
  isCustom: !!p.is_custom, prioritySupport: !!p.features?.priority_support,
});

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function tenantRoutes(app) {
  // Aktywne ogłoszenia systemowe (baner w aplikacji kościoła).
  app.get('/api/announcements', { preHandler: app.requireUser }, async (req, reply) => {
    const { rows } = await platformPool.query(
      `SELECT id, title, body, level, created_at FROM platform_announcements
        WHERE is_active
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
        ORDER BY created_at DESC LIMIT 5`
    );
    return reply.send({ announcements: rows });
  });

  app.get('/api/tenant/info', { preHandler: app.requireUser }, async (req, reply) => {
    const tenantId = req.tenant.id;

    const [tenantRes, subRes] = await Promise.all([
      platformPool.query(
        `SELECT name, slug, subdomain, status, trial_ends_at, created_at FROM tenants WHERE id = $1`,
        [tenantId]
      ),
      platformPool.query(
        `SELECT ts.status, ts.billing_cycle, ts.current_period_end, ts.trial_ends_at,
                sp.name AS plan_name, sp.price_monthly, sp.price_yearly, sp.features,
                sp.max_members, sp.max_users, sp.max_groups, sp.max_kids, sp.max_events, sp.max_storage_mb
           FROM tenant_subscriptions ts
           JOIN subscription_plans sp ON ts.plan_id = sp.id
          WHERE ts.tenant_id = $1 AND ts.status IN ('trialing','active','past_due')
          ORDER BY ts.created_at DESC LIMIT 1`,
        [tenantId]
      ),
    ]);

    const tenant = tenantRes.rows[0] || null;
    const sub = subRes.rows[0] || null;

    return reply.send({
      tenant: tenant && {
        name: tenant.name,
        subdomain: tenant.subdomain,
        status: tenant.status,
        trialEndsAt: tenant.trial_ends_at,
        createdAt: tenant.created_at,
      },
      subscription: sub && {
        status: sub.status,
        billingCycle: sub.billing_cycle,
        currentPeriodEnd: sub.current_period_end,
        planName: sub.plan_name,
        priceMonthly: sub.price_monthly,
        priceYearly: sub.price_yearly,
        features: sub.features || {},
        limits: {
          members: sub.max_members,
          users: sub.max_users,
          groups: sub.max_groups,
          kids: sub.max_kids,
          events: sub.max_events,
          storageMb: sub.max_storage_mb,
        },
      },
    });
  });

  // Rozliczenia kościoła (ekran Ustawienia → Subskrypcja i dyskretny komunikat dla adminów).
  // Tylko osoby z dostępem do rozliczeń (canSeeBilling) — pozostali dostają 403.
  app.get('/api/tenant/plan-usage', { preHandler: app.requireUser }, async (req, reply) => {
    if (!(await canSeeBilling(req))) return reply.code(403).send({ error: 'Brak dostępu do rozliczeń' });
    const u = await tenantPlanUsage(platformPool, req.tenant.id, req.db);
    const sub = u.subscription;
    const price = sub ? subscriptionPrice({
      plan: sub, billingCycle: sub.billing_cycle,
      customPriceMonthly: sub.custom_price_monthly, customPriceYearly: sub.custom_price_yearly,
    }) : null;
    return reply.send({
      tenant: { status: req.tenant.status, trialEndsAt: req.tenant.trial_ends_at },
      plan: sub ? {
        key: sub.plan_key, name: sub.plan_name, description: sub.description,
        priceMonthly: sub.custom_price_monthly ?? sub.price_monthly,
        priceYearly: sub.custom_price_yearly ?? sub.price_yearly,
        isCustom: !!sub.is_custom, customPrice: sub.custom_price_monthly != null || sub.custom_price_yearly != null,
        retired: u.planRetired,
      } : null,
      subscription: sub ? {
        status: sub.status, billingCycle: sub.billing_cycle,
        currentPeriodEnd: sub.current_period_end, trialEndsAt: sub.trial_ends_at,
        price: price && price.amount != null ? { amount: price.amount, cycle: price.cycle } : null,
      } : null,
      usage: { adults: u.adults, limit: u.limit, bufferLimit: u.bufferLimit, pct: u.pct, state: u.state, approximate: u.approximate },
      suggestedPlan: u.suggestedPlan,
      plans: u.plans.map(planOut),
    });
  });

  // Prośba o zmianę planu / rozmowę (Sieć → „Porozmawiajmy”). Plan zmienia admin platformy
  // od kolejnego okresu — tu tylko e-mail do zespołu Avenit + ślad w audit_log i metadata tenanta.
  app.post('/api/tenant/plan-request', {
    preHandler: app.requireUser,
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    if (!(await canSeeBilling(req))) return reply.code(403).send({ error: 'Brak dostępu do rozliczeń' });
    const b = req.body || {};
    const planKey = String(b.planKey || '').slice(0, 50);
    const billingCycle = b.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const message = String(b.message || '').slice(0, 1000);
    const u = await tenantPlanUsage(platformPool, req.tenant.id, req.db);
    const plan = u.plans.find((p) => p.key === planKey);
    if (!plan) return reply.code(400).send({ error: 'Nieznany plan' });
    const request = {
      planKey, planName: plan.name, billingCycle, message: message || null,
      requestedBy: req.user.email || req.user.id, requestedAt: new Date().toISOString(),
      adults: u.adults, currentPlan: u.plan?.key || null,
    };
    await platformPool.query(
      `UPDATE tenants SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('plan_request', $2::jsonb) WHERE id = $1`,
      [req.tenant.id, JSON.stringify(request)]
    ).catch(() => {});
    await platformPool.query(
      `INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (NULL, 'tenant.plan_request', 'tenant', $1, $2)`,
      [String(req.tenant.id), JSON.stringify(request)]
    ).catch(() => {});
    let sent = false;
    try {
      const { sendEmail } = await import('../lib/email.js');
      const cycle = billingCycle === 'yearly' ? 'rocznie' : 'miesięcznie';
      await sendEmail({
        to: config.LANDING_CONTACT_EMAIL,
        replyTo: req.user.email || undefined,
        subject: `${plan.is_custom ? 'Rozmowa o planie' : 'Zmiana planu'}: ${req.tenant.name} → ${plan.name}`,
        html: `<div style="font-family:sans-serif;max-width:560px">
          <h2>${plan.is_custom ? 'Prośba o rozmowę' : 'Prośba o zmianę planu'}</h2>
          <p><strong>Kościół:</strong> ${esc(req.tenant.name)} (${esc(req.tenant.subdomain || req.tenant.slug)})<br>
          <strong>Obecny plan:</strong> ${esc(u.plan?.name || '—')}<br>
          <strong>Wybrany plan:</strong> ${esc(plan.name)} (${cycle})<br>
          <strong>Dorośli w bazie:</strong> ${u.adults}${u.limit > 0 ? ` / ${u.limit}` : ''}<br>
          <strong>Zgłasza:</strong> ${esc(req.user.email || req.user.id)}</p>
          ${message ? `<p><strong>Wiadomość:</strong><br>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
        </div>`,
      });
      sent = true;
    } catch (err) {
      req.log?.warn?.(`plan-request e-mail: ${err.message}`);
    }
    return reply.send({ ok: true, sent });
  });
}
