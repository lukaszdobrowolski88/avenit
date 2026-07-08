// API panelu administracyjnego platformy (/api/admin/*).
// Autoryzacja: platform_admins + JWT z audience 'admin' + obowiązkowe TOTP.
// Wszystkie operacje logowane w audit_log (w przeciwieństwie do martwego
// modułu SuperAdmin, który działał anon-keyem z przeglądarki).
import { z } from 'zod';
import { platformPool } from '../db.js';
import { verifyPassword, hashPassword } from '../auth/passwords.js';
import { verifyTOTP, consumeBackupCode } from '../auth/totp.js';
import {
  signAccessToken, newRefreshToken, storeRefreshToken,
  rotateRefreshToken, revokeRefreshToken, AUD_ADMIN,
} from '../auth/tokens.js';
import { provisionTenant, dropTenantDatabase } from './provisioning.js';
import { getTenantPool } from '../db.js';
import { isProd, config } from '../config.js';

const adminCookie = { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' };

async function audit(adminId, action, targetType, targetId, details) {
  await platformPool.query(
    `INSERT INTO audit_log (admin_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, targetType, targetId ? String(targetId) : null, details ? JSON.stringify(details) : null]
  ).catch(() => {});
}

export default async function adminRoutes(app) {
  // ── AUTH ADMINA ────────────────────────────────────────────────────
  app.post('/api/admin/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({
      email: z.string().email(), password: z.string().min(1), totpCode: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowe dane' });
    const { email, password, totpCode } = body.data;

    const { rows } = await platformPool.query(
      `SELECT * FROM platform_admins WHERE lower(email) = lower($1)`, [email]
    );
    const admin = rows[0];
    if (!admin || !admin.is_active || !(await verifyPassword(password, admin.password_hash))) {
      return reply.code(401).send({ error: 'Błędny e-mail lub hasło' });
    }
    // TOTP obowiązkowe dla adminów platformy (jeśli skonfigurowane).
    if (admin.totp_enabled) {
      if (!totpCode) return reply.send({ requires2fa: true });
      let ok = admin.totp_secret && verifyTOTP(admin.totp_secret, totpCode);
      if (!ok) {
        const backup = consumeBackupCode(admin.totp_backup_codes, totpCode);
        if (backup.ok) {
          ok = true;
          await platformPool.query(`UPDATE platform_admins SET totp_backup_codes = $1 WHERE id = $2`,
            [JSON.stringify(backup.updated), admin.id]);
        }
      }
      if (!ok) return reply.code(401).send({ error: 'Nieprawidłowy kod weryfikacyjny' });
    }
    await platformPool.query(`UPDATE platform_admins SET last_login_at = now() WHERE id = $1`, [admin.id]);

    const accessToken = await signAccessToken({ userId: admin.id, email: admin.email, aud: AUD_ADMIN });
    const { token: refreshToken, hash } = newRefreshToken();
    await storeRefreshToken(platformPool, 'admin_refresh_tokens', 'admin_id', admin.id, hash, req.headers['user-agent']);
    reply.setCookie('avenit_admin_at', accessToken, adminCookie);
    reply.setCookie('avenit_admin_rt', refreshToken, { ...adminCookie, maxAge: 30 * 24 * 3600 });
    await audit(admin.id, 'login', 'admin', admin.id);
    return reply.send({
      access_token: accessToken, refresh_token: refreshToken,
      admin: { id: admin.id, email: admin.email, full_name: admin.full_name },
    });
  });

  app.post('/api/admin/refresh', async (req, reply) => {
    const token = req.body?.refresh_token || req.cookies?.avenit_admin_rt;
    if (!token) return reply.code(401).send({ error: 'Brak tokena' });
    const rotated = await rotateRefreshToken(platformPool, 'admin_refresh_tokens', 'admin_id', token, req.headers['user-agent']);
    if (!rotated) return reply.code(401).send({ error: 'Sesja wygasła' });
    const { rows } = await platformPool.query(`SELECT * FROM platform_admins WHERE id = $1 AND is_active`, [rotated.userId]);
    if (!rows[0]) return reply.code(401).send({ error: 'Konto nieaktywne' });
    const accessToken = await signAccessToken({ userId: rows[0].id, email: rows[0].email, aud: AUD_ADMIN });
    reply.setCookie('avenit_admin_at', accessToken, adminCookie);
    reply.setCookie('avenit_admin_rt', rotated.token, { ...adminCookie, maxAge: 30 * 24 * 3600 });
    return reply.send({ access_token: accessToken, refresh_token: rotated.token });
  });

  app.post('/api/admin/logout', { preHandler: app.requireAdmin }, async (req, reply) => {
    const token = req.body?.refresh_token || req.cookies?.avenit_admin_rt;
    if (token) await revokeRefreshToken(platformPool, 'admin_refresh_tokens', token);
    reply.clearCookie('avenit_admin_at', { path: '/' });
    reply.clearCookie('avenit_admin_rt', { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/admin/me', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(
      `SELECT id, email, full_name, totp_enabled FROM platform_admins WHERE id = $1`, [req.admin.id]
    );
    return reply.send({ admin: rows[0] || null });
  });

  // ── DASHBOARD (KPI) ────────────────────────────────────────────────
  app.get('/api/admin/dashboard', { preHandler: app.requireAdmin }, async (req, reply) => {
    const [tenants, invoices, mrr, trials] = await Promise.all([
      platformPool.query(`SELECT status, count(*)::int AS n FROM tenants GROUP BY status`),
      platformPool.query(`SELECT status, count(*)::int AS n, COALESCE(sum(total),0)::bigint AS sum FROM invoices GROUP BY status`),
      platformPool.query(`
        SELECT COALESCE(SUM(CASE WHEN ts.billing_cycle='yearly' THEN sp.price_yearly/12 ELSE sp.price_monthly END),0)::bigint AS mrr
        FROM tenant_subscriptions ts JOIN subscription_plans sp ON ts.plan_id = sp.id
        WHERE ts.status IN ('active','trialing')`),
      platformPool.query(`SELECT count(*)::int AS n FROM tenants WHERE status='trial' AND trial_ends_at < now() + interval '7 days'`),
    ]);
    return reply.send({
      tenantsByStatus: tenants.rows,
      invoices: invoices.rows,
      mrr: Number(mrr.rows[0].mrr),
      trialsEndingSoon: trials.rows[0].n,
    });
  });

  // ── TENANCI ────────────────────────────────────────────────────────
  app.get('/api/admin/tenants', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`
      SELECT t.*, sp.name AS plan_name, ts.status AS subscription_status, ts.current_period_end
        FROM tenants t
        LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.status IN ('trialing','active','past_due')
        LEFT JOIN subscription_plans sp ON ts.plan_id = sp.id
       ORDER BY t.created_at DESC`);
    return reply.send({ tenants: rows });
  });

  app.get('/api/admin/tenants/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`SELECT * FROM tenants WHERE id = $1`, [req.params.id]);
    const tenant = rows[0];
    if (!tenant) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    const [sub, invoices, modules] = await Promise.all([
      platformPool.query(`SELECT ts.*, sp.name AS plan_name FROM tenant_subscriptions ts
                          JOIN subscription_plans sp ON ts.plan_id = sp.id
                          WHERE ts.tenant_id = $1 ORDER BY ts.created_at DESC LIMIT 1`, [tenant.id]),
      platformPool.query(`SELECT * FROM invoices WHERE tenant_id = $1 ORDER BY issue_date DESC LIMIT 20`, [tenant.id]),
      platformPool.query(`SELECT module_key, is_enabled FROM tenant_modules WHERE tenant_id = $1`, [tenant.id]),
    ]);
    // Statystyki użycia z bazy tenanta.
    let usage = null;
    try {
      const tp = getTenantPool(tenant.db_name);
      const [m, u, g] = await Promise.all([
        tp.query(`SELECT count(*)::int AS n FROM members`).catch(() => ({ rows: [{ n: 0 }] })),
        tp.query(`SELECT count(*)::int AS n FROM app_users`).catch(() => ({ rows: [{ n: 0 }] })),
        tp.query(`SELECT count(*)::int AS n FROM groups`).catch(() => ({ rows: [{ n: 0 }] })),
      ]);
      usage = { members: m.rows[0].n, users: u.rows[0].n, groups: g.rows[0].n };
    } catch { /* baza może nie odpowiadać */ }
    return reply.send({ tenant, subscription: sub.rows[0] || null, invoices: invoices.rows, modules: modules.rows, usage });
  });

  app.post('/api/admin/tenants', { preHandler: app.requireAdmin }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1), slug: z.string().min(2),
      email: z.string().email().optional(), adminEmail: z.string().email(),
      adminName: z.string().optional(), adminPassword: z.string().min(8).optional(),
      planKey: z.string().optional(), company: z.record(z.any()).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowe dane', details: body.error.issues });
    try {
      const result = await provisionTenant(body.data);
      await audit(req.admin.id, 'tenant.create', 'tenant', result.tenant.id, { slug: body.data.slug });
      return reply.send(result);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Akcje cyklu życia tenanta.
  const setStatus = async (req, reply, status, action) => {
    const { rows } = await platformPool.query(
      `UPDATE tenants SET status = $1 WHERE id = $2 RETURNING *`, [status, req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    if (status === 'suspended') {
      await platformPool.query(`UPDATE tenant_subscriptions SET status='suspended'
        WHERE tenant_id=$1 AND status IN ('trialing','active','past_due')`, [req.params.id]);
    }
    await audit(req.admin.id, action, 'tenant', req.params.id);
    return reply.send({ tenant: rows[0] });
  };
  app.post('/api/admin/tenants/:id/suspend', { preHandler: app.requireAdmin }, (req, reply) => setStatus(req, reply, 'suspended', 'tenant.suspend'));
  app.post('/api/admin/tenants/:id/resume', { preHandler: app.requireAdmin }, (req, reply) => setStatus(req, reply, 'active', 'tenant.resume'));

  app.post('/api/admin/tenants/:id/extend-trial', { preHandler: app.requireAdmin }, async (req, reply) => {
    const days = parseInt(req.body?.days || 14, 10);
    const { rows } = await platformPool.query(
      `UPDATE tenants SET trial_ends_at = COALESCE(trial_ends_at, now()) + ($1 || ' days')::interval, status='trial'
        WHERE id = $2 RETURNING *`, [String(days), req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    await audit(req.admin.id, 'tenant.extend_trial', 'tenant', req.params.id, { days });
    return reply.send({ tenant: rows[0] });
  });

  app.post('/api/admin/tenants/:id/change-plan', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { planId, billingCycle = 'monthly' } = req.body || {};
    const { rows: existing } = await platformPool.query(
      `SELECT id FROM tenant_subscriptions WHERE tenant_id=$1 AND status IN ('trialing','active','past_due') LIMIT 1`,
      [req.params.id]
    );
    if (existing[0]) {
      await platformPool.query(`UPDATE tenant_subscriptions SET plan_id=$1, billing_cycle=$2 WHERE id=$3`,
        [planId, billingCycle, existing[0].id]);
    } else {
      await platformPool.query(
        `INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', $3, now(), now() + interval '30 days')`,
        [req.params.id, planId, billingCycle]
      );
    }
    await audit(req.admin.id, 'tenant.change_plan', 'tenant', req.params.id, { planId, billingCycle });
    return reply.send({ ok: true });
  });

  // Twarde usunięcie bazy tenanta (po ręcznym backupie).
  app.delete('/api/admin/tenants/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`SELECT * FROM tenants WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    if (req.body?.confirm !== rows[0].slug) {
      return reply.code(400).send({ error: 'Potwierdź slug tenanta w polu confirm' });
    }
    await dropTenantDatabase(rows[0].db_name);
    await platformPool.query(`DELETE FROM tenants WHERE id = $1`, [req.params.id]);
    await audit(req.admin.id, 'tenant.delete', 'tenant', req.params.id, { slug: rows[0].slug });
    return reply.send({ ok: true });
  });

  // ── MODUŁY PER TENANT ──────────────────────────────────────────────
  app.put('/api/admin/tenants/:id/modules/:key', { preHandler: app.requireAdmin }, async (req, reply) => {
    const enabled = req.body?.is_enabled !== false;
    await platformPool.query(
      `INSERT INTO tenant_modules (tenant_id, module_key, is_enabled) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, module_key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = now()`,
      [req.params.id, req.params.key, enabled]
    );
    await audit(req.admin.id, 'tenant.module_toggle', 'tenant', req.params.id, { module: req.params.key, enabled });
    return reply.send({ ok: true });
  });

  // ── PLANY ──────────────────────────────────────────────────────────
  app.get('/api/admin/plans', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`SELECT * FROM subscription_plans ORDER BY sort_order`);
    return reply.send({ plans: rows });
  });
  app.post('/api/admin/plans', { preHandler: app.requireAdmin }, async (req, reply) => {
    const p = req.body || {};
    const { rows } = await platformPool.query(
      `INSERT INTO subscription_plans (name, slug, key, description, price_monthly, price_yearly,
        max_members, max_users, max_groups, max_kids, max_events, max_storage_mb, trial_days, features, is_active, is_public, sort_order)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [p.name, p.slug, p.description || null, p.price_monthly || 0, p.price_yearly || null,
       p.max_members ?? -1, p.max_users ?? -1, p.max_groups ?? -1, p.max_kids ?? -1, p.max_events ?? -1,
       p.max_storage_mb ?? 100, p.trial_days ?? 14, JSON.stringify(p.features || {}),
       p.is_active !== false, p.is_public !== false, p.sort_order || 0]
    );
    await audit(req.admin.id, 'plan.create', 'plan', rows[0].id);
    return reply.send({ plan: rows[0] });
  });
  app.put('/api/admin/plans/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const p = req.body || {};
    const { rows } = await platformPool.query(
      `UPDATE subscription_plans SET name=$1, description=$2, price_monthly=$3, price_yearly=$4,
        max_members=$5, max_users=$6, max_groups=$7, max_kids=$8, max_events=$9, max_storage_mb=$10,
        trial_days=$11, features=$12, is_active=$13, is_public=$14, sort_order=$15 WHERE id=$16 RETURNING *`,
      [p.name, p.description || null, p.price_monthly || 0, p.price_yearly || null,
       p.max_members ?? -1, p.max_users ?? -1, p.max_groups ?? -1, p.max_kids ?? -1, p.max_events ?? -1,
       p.max_storage_mb ?? 100, p.trial_days ?? 14, JSON.stringify(p.features || {}),
       p.is_active !== false, p.is_public !== false, p.sort_order || 0, req.params.id]
    );
    await audit(req.admin.id, 'plan.update', 'plan', req.params.id);
    return reply.send({ plan: rows[0] });
  });

  // ── FAKTURY ────────────────────────────────────────────────────────
  app.get('/api/admin/invoices', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`
      SELECT i.*, t.name AS tenant_name FROM invoices i JOIN tenants t ON i.tenant_id = t.id
       ORDER BY i.issue_date DESC LIMIT 200`);
    return reply.send({ invoices: rows });
  });
  app.post('/api/admin/invoices', { preHandler: app.requireAdmin }, async (req, reply) => {
    const p = req.body || {};
    const subtotal = Math.round(p.subtotal || 0);
    const taxRate = p.tax_rate ?? 23;
    const taxAmount = Math.round(subtotal * taxRate / 100);
    const { rows } = await platformPool.query(
      `INSERT INTO invoices (tenant_id, subscription_id, buyer_name, buyer_company_name, buyer_tax_id,
        buyer_address, buyer_email, subtotal, tax_rate, tax_amount, total, items, status, due_date, period_start, period_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,'pending'),$14,$15,$16) RETURNING *`,
      [p.tenant_id, p.subscription_id || null, p.buyer_name, p.buyer_company_name || null, p.buyer_tax_id || null,
       p.buyer_address || null, p.buyer_email || null, subtotal, taxRate, taxAmount, subtotal + taxAmount,
       JSON.stringify(p.items || []), p.status, p.due_date, p.period_start || null, p.period_end || null]
    );
    await audit(req.admin.id, 'invoice.create', 'invoice', rows[0].id);
    return reply.send({ invoice: rows[0] });
  });
  app.post('/api/admin/invoices/:id/mark-paid', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(
      `UPDATE invoices SET status='paid', paid_at=now(), payment_method='manual' WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Faktura nie istnieje' });
    // Odnów okres subskrypcji (logika z useInvoices.markAsPaid).
    if (rows[0].subscription_id) {
      await platformPool.query(
        `UPDATE tenant_subscriptions SET status='active',
           current_period_start=now(), current_period_end=now() + interval '30 days'
         WHERE id=$1`, [rows[0].subscription_id]
      );
    }
    await audit(req.admin.id, 'invoice.mark_paid', 'invoice', req.params.id);
    return reply.send({ invoice: rows[0] });
  });
  app.post('/api/admin/invoices/:id/cancel', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`UPDATE invoices SET status='cancelled' WHERE id=$1 RETURNING *`, [req.params.id]);
    await audit(req.admin.id, 'invoice.cancel', 'invoice', req.params.id);
    return reply.send({ invoice: rows[0] });
  });

  // ── KUPONY ─────────────────────────────────────────────────────────
  app.get('/api/admin/coupons', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`SELECT * FROM coupons ORDER BY created_at DESC`);
    return reply.send({ coupons: rows });
  });
  app.post('/api/admin/coupons', { preHandler: app.requireAdmin }, async (req, reply) => {
    const p = req.body || {};
    const { rows } = await platformPool.query(
      `INSERT INTO coupons (code, name, description, discount_type, discount_value, valid_from, valid_until,
        max_uses, max_uses_per_tenant, duration_months, is_active)
       VALUES (UPPER($1),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [p.code, p.name, p.description || null, p.discount_type, p.discount_value,
       p.valid_from || null, p.valid_until || null, p.max_uses || null,
       p.max_uses_per_tenant ?? 1, p.duration_months || null, p.is_active !== false]
    );
    await audit(req.admin.id, 'coupon.create', 'coupon', rows[0].id);
    return reply.send({ coupon: rows[0] });
  });

  // ── WINDYKACJA (ręczne uruchomienie) ───────────────────────────────
  app.post('/api/admin/dunning/run', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { run } = await import('../fn/process-dunning.js');
    const results = await run(platformPool, { log: (m) => req.log.info(m) });
    await audit(req.admin.id, 'dunning.run', null, null, results);
    return reply.send({ success: true, results });
  });

  // ── AUDIT LOG ──────────────────────────────────────────────────────
  app.get('/api/admin/audit', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`
      SELECT a.*, pa.email AS admin_email FROM audit_log a
        LEFT JOIN platform_admins pa ON a.admin_id = pa.id
       ORDER BY a.created_at DESC LIMIT 200`);
    return reply.send({ entries: rows });
  });

  // ── ADMINI PLATFORMY ───────────────────────────────────────────────
  app.get('/api/admin/admins', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(
      `SELECT id, email, full_name, is_active, totp_enabled, last_login_at, created_at FROM platform_admins ORDER BY created_at`
    );
    return reply.send({ admins: rows });
  });
  app.post('/api/admin/admins', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { email, full_name, password } = req.body || {};
    if (!email || !password || password.length < 8) {
      return reply.code(400).send({ error: 'Email i hasło (min. 8 znaków) wymagane' });
    }
    const { rows } = await platformPool.query(
      `INSERT INTO platform_admins (email, full_name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING id, email, full_name`,
      [email, full_name || null, await hashPassword(password)]
    );
    if (!rows[0]) return reply.code(409).send({ error: 'Administrator o tym e-mailu już istnieje' });
    await audit(req.admin.id, 'admin.create', 'admin', rows[0].id, { email });
    return reply.send({ admin: rows[0] });
  });
}
