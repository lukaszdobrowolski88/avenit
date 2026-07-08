// Informacje o tenancie dla aplikacji kościoła: plan, limity, status subskrypcji.
// Dane mieszkają w bazie PLATFORM (nie w bazie tenanta), więc czytamy je stamtąd
// po req.tenant.id. Tylko do odczytu — zarządzanie planem jest w panelu admina.
import { platformPool } from '../db.js';

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
}
