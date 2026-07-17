// API panelu administracyjnego platformy (/api/admin/*).
// Autoryzacja: platform_admins + JWT z audience 'admin' + obowiązkowe TOTP.
// Wszystkie operacje logowane w audit_log (w przeciwieństwie do martwego
// modułu SuperAdmin, który działał anon-keyem z przeglądarki).
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { platformPool } from '../db.js';
import { verifyPassword, hashPassword } from '../auth/passwords.js';
import { verifyTOTP, consumeBackupCode, generateSecret } from '../auth/totp.js';
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
    const [tenants, invoices, mrr, trials, planDist, revenue, newTenants, recentAudit] = await Promise.all([
      platformPool.query(`SELECT status, count(*)::int AS n FROM tenants GROUP BY status`),
      platformPool.query(`SELECT status, count(*)::int AS n, COALESCE(sum(total),0)::bigint AS sum FROM invoices GROUP BY status`),
      platformPool.query(`
        SELECT COALESCE(SUM(CASE WHEN ts.billing_cycle='yearly' THEN sp.price_yearly/12 ELSE sp.price_monthly END),0)::bigint AS mrr
        FROM tenant_subscriptions ts JOIN subscription_plans sp ON ts.plan_id = sp.id
        WHERE ts.status IN ('active','trialing')`),
      platformPool.query(`SELECT count(*)::int AS n FROM tenants WHERE status='trial' AND trial_ends_at < now() + interval '7 days'`),
      platformPool.query(`
        SELECT sp.name AS plan, count(*)::int AS n FROM tenant_subscriptions ts
          JOIN subscription_plans sp ON ts.plan_id = sp.id
         WHERE ts.status IN ('active','trialing') GROUP BY sp.name ORDER BY n DESC`),
      platformPool.query(`SELECT COALESCE(sum(total),0)::bigint AS sum FROM invoices WHERE status='paid' AND paid_at >= date_trunc('month', now())`),
      platformPool.query(`SELECT count(*)::int AS n FROM tenants WHERE created_at >= now() - interval '30 days'`),
      platformPool.query(`
        SELECT a.action, a.target_type, a.created_at, pa.email AS admin_email FROM audit_log a
          LEFT JOIN platform_admins pa ON a.admin_id = pa.id ORDER BY a.created_at DESC LIMIT 8`),
    ]);
    // Listy alertów (klikalne w panelu).
    const [trialsList, unpaidList] = await Promise.all([
      platformPool.query(`SELECT id, name, subdomain, trial_ends_at FROM tenants
        WHERE status='trial' AND trial_ends_at < now() + interval '7 days' ORDER BY trial_ends_at LIMIT 10`),
      platformPool.query(`SELECT i.id, i.invoice_number, i.total, i.due_date, i.status, t.name AS tenant_name, t.id AS tenant_id
        FROM invoices i JOIN tenants t ON i.tenant_id = t.id
        WHERE i.status IN ('pending','overdue') ORDER BY i.due_date LIMIT 10`),
    ]);
    return reply.send({
      tenantsByStatus: tenants.rows,
      invoices: invoices.rows,
      mrr: Number(mrr.rows[0].mrr),
      trialsEndingSoon: trials.rows[0].n,
      planDistribution: planDist.rows,
      revenueThisMonth: Number(revenue.rows[0].sum),
      newTenants30d: newTenants.rows[0].n,
      recentActivity: recentAudit.rows,
      trialsEndingList: trialsList.rows,
      unpaidInvoicesList: unpaidList.rows,
    });
  });

  // ── 2FA ADMINA PLATFORMY ───────────────────────────────────────────
  app.post('/api/admin/2fa/setup', { preHandler: app.requireAdmin }, async (req, reply) => {
    const secret = generateSecret();
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8)
    );
    return reply.send({
      secret,
      backupCodes,
      otpauthUrl: `otpauth://totp/${encodeURIComponent('Avenit Admin')}:${encodeURIComponent(req.admin.email)}?secret=${secret}&issuer=Avenit`,
    });
  });
  app.post('/api/admin/2fa/enable', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { secret, code, backupCodes } = req.body || {};
    if (!secret || !verifyTOTP(String(secret), String(code || ''))) {
      return reply.code(400).send({ error: 'Nieprawidłowy kod — spróbuj ponownie' });
    }
    const codes = (backupCodes || []).map((c) => (typeof c === 'string' ? { code: c.toUpperCase(), used: false } : c));
    await platformPool.query(
      `UPDATE platform_admins SET totp_secret=$1, totp_enabled=true, totp_backup_codes=$2 WHERE id=$3`,
      [String(secret), JSON.stringify(codes), req.admin.id]
    );
    await audit(req.admin.id, 'admin.2fa_enable', 'admin', req.admin.id);
    return reply.send({ ok: true });
  });
  app.post('/api/admin/2fa/disable', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`SELECT totp_secret FROM platform_admins WHERE id=$1`, [req.admin.id]);
    if (!rows[0]?.totp_secret || !verifyTOTP(rows[0].totp_secret, String(req.body?.code || ''))) {
      return reply.code(400).send({ error: 'Nieprawidłowy kod weryfikacyjny' });
    }
    await platformPool.query(
      `UPDATE platform_admins SET totp_secret=NULL, totp_enabled=false, totp_backup_codes='[]'::jsonb WHERE id=$1`,
      [req.admin.id]
    );
    await audit(req.admin.id, 'admin.2fa_disable', 'admin', req.admin.id);
    return reply.send({ ok: true });
  });

  // ── NOTATKI O TENANCIE (CRM) ───────────────────────────────────────
  app.put('/api/admin/tenants/:id/notes', { preHandler: app.requireAdmin }, async (req, reply) => {
    await platformPool.query(`UPDATE tenants SET admin_notes=$1 WHERE id=$2`, [req.body?.notes ?? null, req.params.id]);
    return reply.send({ ok: true });
  });

  // ── WZROST (dashboard: wykresy czasowe) ────────────────────────────
  app.get('/api/admin/growth', { preHandler: app.requireAdmin }, async (req, reply) => {
    const [tenantsByMonth, revenueByMonth] = await Promise.all([
      platformPool.query(`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS m, count(*)::int AS n
          FROM tenants WHERE created_at >= date_trunc('month', now()) - interval '11 months'
         GROUP BY 1 ORDER BY 1`),
      platformPool.query(`
        SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') AS m, COALESCE(sum(total),0)::bigint AS sum
          FROM invoices WHERE status='paid' AND paid_at >= date_trunc('month', now()) - interval '11 months'
         GROUP BY 1 ORDER BY 1`),
    ]);
    // Uzupełnij 12 miesięcy (zera tam, gdzie brak danych).
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const tMap = Object.fromEntries(tenantsByMonth.rows.map((r) => [r.m, r.n]));
    const rMap = Object.fromEntries(revenueByMonth.rows.map((r) => [r.m, Number(r.sum)]));
    return reply.send({
      months,
      tenants: months.map((m) => tMap[m] || 0),
      revenue: months.map((m) => rMap[m] || 0),
    });
  });

  // ── GLOBALNA WYSZUKIWARKA (tenanci + użytkownicy cross-tenant) ──────
  app.get('/api/admin/search', { preHandler: app.requireAdmin }, async (req, reply) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return reply.send({ tenants: [], users: [] });
    const like = `%${q}%`;
    const { rows: tenants } = await platformPool.query(
      `SELECT id, name, subdomain, status FROM tenants
        WHERE name ILIKE $1 OR subdomain ILIKE $1 OR email ILIKE $1 ORDER BY name LIMIT 10`,
      [like]
    );
    // Szukaj kont po wszystkich aktywnych bazach tenantów (limit dla wydajności).
    const { rows: activeTenants } = await platformPool.query(
      `SELECT id, name, subdomain, db_name FROM tenants WHERE status IN ('trial','active','suspended') LIMIT 50`
    );
    const users = [];
    for (const t of activeTenants) {
      if (users.length >= 20) break;
      try {
        const { rows } = await getTenantPool(t.db_name).query(
          `SELECT id, email, full_name, role FROM app_users
            WHERE email ILIKE $1 OR full_name ILIKE $1 ORDER BY email LIMIT 5`,
          [like]
        );
        for (const u of rows) {
          users.push({ ...u, tenant: { id: t.id, name: t.name, subdomain: t.subdomain } });
        }
      } catch { /* pomiń bazę bez odpowiedzi */ }
    }
    return reply.send({ tenants, users: users.slice(0, 20) });
  });

  // ── E-MAIL DO TENANTÓW ─────────────────────────────────────────────
  // Do administratorów jednego tenanta.
  app.post('/api/admin/tenants/:id/email', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { subject, body, to } = req.body || {};
    if (!subject || !body) return reply.code(400).send({ error: 'Temat i treść są wymagane' });
    const { rows: t } = await platformPool.query(`SELECT db_name, email FROM tenants WHERE id = $1`, [req.params.id]);
    if (!t[0]) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    let recipients = to ? [to] : [];
    if (!recipients.length) {
      try {
        const { rows } = await getTenantPool(t[0].db_name).query(
          `SELECT email FROM app_users WHERE is_active AND (is_super_admin OR role='superadmin')`
        );
        recipients = rows.map((r) => r.email);
      } catch {}
      if (!recipients.length && t[0].email) recipients = [t[0].email];
    }
    if (!recipients.length) return reply.code(400).send({ error: 'Brak odbiorców' });
    const { sendEmail } = await import('../lib/email.js');
    const html = `<div style="font-family:sans-serif;max-width:560px">${String(body).replace(/\n/g, '<br>')}</div>`;
    await sendEmail({ to: recipients, subject, html }).catch((err) => { throw new Error(err.message); });
    await audit(req.admin.id, 'tenant.email', 'tenant', req.params.id, { subject, recipients: recipients.length });
    return reply.send({ ok: true, sent: recipients.length });
  });

  // Broadcast do administratorów wszystkich tenantów.
  app.post('/api/admin/broadcast-email', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { subject, body } = req.body || {};
    if (!subject || !body) return reply.code(400).send({ error: 'Temat i treść są wymagane' });
    const { rows: tenants } = await platformPool.query(
      `SELECT db_name, email FROM tenants WHERE status IN ('trial','active')`
    );
    const recipients = new Set();
    for (const t of tenants) {
      try {
        const { rows } = await getTenantPool(t.db_name).query(
          `SELECT email FROM app_users WHERE is_active AND (is_super_admin OR role='superadmin')`
        );
        rows.forEach((r) => r.email && recipients.add(r.email));
      } catch {}
      if (t.email) recipients.add(t.email);
    }
    if (!recipients.size) return reply.code(400).send({ error: 'Brak odbiorców' });
    const { sendEmail } = await import('../lib/email.js');
    const html = `<div style="font-family:sans-serif;max-width:560px">${String(body).replace(/\n/g, '<br>')}</div>`;
    // Wyślij pojedynczo (BCC nie jest gwarantowane przez wszystkie bramki).
    let sent = 0;
    for (const email of recipients) {
      try { await sendEmail({ to: email, subject, html }); sent++; } catch {}
    }
    await audit(req.admin.id, 'broadcast.email', null, null, { subject, recipients: sent });
    return reply.send({ ok: true, sent });
  });

  // ── RESET HASŁA KONTA TENANTA ──────────────────────────────────────
  app.post('/api/admin/tenants/:id/reset-user-password', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { userId } = req.body || {};
    if (!userId) return reply.code(400).send({ error: 'Brak userId' });
    const { rows: t } = await platformPool.query(`SELECT db_name FROM tenants WHERE id = $1`, [req.params.id]);
    if (!t[0]) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    const password = crypto.randomBytes(9).toString('base64url');
    const { rows } = await getTenantPool(t[0].db_name).query(
      `UPDATE app_users SET password_hash = $1 WHERE id = $2 RETURNING email`,
      [await hashPassword(password), userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Konto nie istnieje' });
    await audit(req.admin.id, 'tenant.reset_password', 'tenant', req.params.id, { userId });
    return reply.send({ ok: true, email: rows[0].email, password });
  });

  // ── STATUS INTEGRACJI (bez ujawniania sekretów) ────────────────────
  app.get('/api/admin/integrations-status', { preHandler: app.requireAdmin }, async (req, reply) => {
    return reply.send({
      integrations: [
        { key: 'sendgrid', label: 'SendGrid (e-mail)', configured: !!config.SENDGRID_API_KEY },
        { key: 'resend', label: 'Resend (windykacja)', configured: !!config.RESEND_API_KEY },
        { key: 'smsapi', label: 'SMSAPI (SMS)', configured: !!config.SMSAPI_TOKEN },
        { key: 'vapid', label: 'Web Push (VAPID)', configured: !!config.VAPID_PUBLIC_KEY },
        { key: 'expo', label: 'Expo Push (mobile)', configured: !!config.EXPO_ACCESS_TOKEN },
        { key: 'p24', label: 'Przelewy24 (płatności)', configured: !!config.P24_MERCHANT_ID },
        { key: 'mailcrypto', label: 'Szyfrowanie poczty', configured: !!config.MAIL_ENCRYPTION_SECRET },
      ],
    });
  });

  // ── SYSTEM / MONITORING ────────────────────────────────────────────
  app.get('/api/admin/system', { preHandler: app.requireAdmin }, async (req, reply) => {
    const [ver, dbs, totals] = await Promise.all([
      platformPool.query(`SHOW server_version`),
      platformPool.query(`SELECT datname, pg_database_size(datname) AS size FROM pg_database WHERE datname LIKE 'avenit_%' ORDER BY size DESC`),
      platformPool.query(`SELECT (SELECT count(*) FROM tenants)::int AS tenants, (SELECT count(*) FROM platform_admins)::int AS admins`),
    ]);
    const databases = dbs.rows.map((r) => ({ name: r.datname, sizeBytes: Number(r.size) }));
    return reply.send({
      postgresVersion: ver.rows[0].server_version,
      databases,
      totalDbBytes: databases.reduce((a, d) => a + d.sizeBytes, 0),
      tenants: totals.rows[0].tenants,
      admins: totals.rows[0].admins,
      serverTime: new Date().toISOString(),
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
      sendWelcome: z.boolean().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowe dane', details: body.error.issues });
    try {
      const result = await provisionTenant(body.data);
      await audit(req.admin.id, 'tenant.create', 'tenant', result.tenant.id, { slug: body.data.slug });
      // E-mail powitalny do administratora kościoła (opcjonalny).
      if (body.data.sendWelcome) {
        try {
          const { sendEmail } = await import('../lib/email.js');
          const url = `https://${result.tenant.subdomain}.${config.APP_DOMAIN}`;
          const pass = body.data.adminPassword || result.adminPassword;
          await sendEmail({
            to: body.data.adminEmail,
            subject: 'Witaj w Avenit — Twój kościół jest gotowy',
            html: `<div style="font-family:sans-serif;max-width:520px">
              <h2>Witaj w Avenit!</h2>
              <p>Utworzyliśmy przestrzeń dla <strong>${result.tenant.name}</strong>.</p>
              <p><strong>Adres:</strong> <a href="${url}">${url}</a><br>
              <strong>Login:</strong> ${body.data.adminEmail}${pass ? `<br><strong>Hasło:</strong> ${pass}` : ''}</p>
              <p style="margin:24px 0"><a href="${url}" style="background:#d97706;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Otwórz aplikację →</a></p>
              <p style="color:#6b7280;font-size:13px">Zalecamy zmianę hasła po pierwszym logowaniu.</p>
            </div>`,
          });
          result.welcomeSent = true;
        } catch (err) {
          result.welcomeError = err.message;
        }
      }
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

  // Backup bazy tenanta na żądanie (pg_dump -Fc, strumień pliku do pobrania).
  app.get('/api/admin/tenants/:id/backup', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`SELECT slug, db_name FROM tenants WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    const dbName = rows[0].db_name;
    if (!/^[a-z0-9_]+$/.test(dbName)) return reply.code(400).send({ error: 'Nieprawidłowa nazwa bazy' });
    const url = new URL(config.DATABASE_URL);
    const child = spawn('pg_dump', [
      '-Fc', '-h', url.hostname, '-p', url.port || '5432',
      '-U', decodeURIComponent(url.username), dbName,
    ], { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString().slice(0, 2000); });
    child.on('close', (code) => { if (code !== 0) req.log.error(`pg_dump ${dbName} zakończył się kodem ${code}: ${stderr}`); });
    child.on('error', (e) => { req.log.error(`pg_dump: ${e.message}`); reply.raw.destroy(); });
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    await audit(req.admin.id, 'tenant.backup', 'tenant', req.params.id, { db: dbName });
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${rows[0].slug}_${stamp}.dump"`);
    return reply.send(child.stdout);
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
  app.put('/api/admin/coupons/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const p = req.body || {};
    const { rows } = await platformPool.query(
      `UPDATE coupons SET code=UPPER($1), name=$2, description=$3, discount_type=$4, discount_value=$5,
        valid_from=$6, valid_until=$7, max_uses=$8, max_uses_per_tenant=$9, duration_months=$10,
        is_active=$11, updated_at=now()
       WHERE id=$12 RETURNING *`,
      [p.code, p.name, p.description || null, p.discount_type, p.discount_value,
       p.valid_from || null, p.valid_until || null, p.max_uses || null,
       p.max_uses_per_tenant ?? 1, p.duration_months || null, p.is_active !== false, req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Kupon nie istnieje' });
    await audit(req.admin.id, 'coupon.update', 'coupon', rows[0].id);
    return reply.send({ coupon: rows[0] });
  });
  app.delete('/api/admin/coupons/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`SELECT code FROM coupons WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Kupon nie istnieje' });
    const used = await platformPool.query(`SELECT 1 FROM coupon_redemptions WHERE coupon_id = $1 LIMIT 1`, [req.params.id]);
    if (used.rows.length) {
      return reply.code(409).send({ error: 'Kupon był już wykorzystany — dezaktywuj go zamiast usuwać.' });
    }
    await platformPool.query(`DELETE FROM coupons WHERE id = $1`, [req.params.id]);
    await audit(req.admin.id, 'coupon.delete', 'coupon', req.params.id, { code: rows[0].code });
    return reply.send({ ok: true });
  });

  // ── WINDYKACJA (ręczne uruchomienie) ───────────────────────────────
  app.post('/api/admin/dunning/run', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { run } = await import('../fn/process-dunning.js');
    const results = await run(platformPool, { log: (m) => req.log.info(m) });
    await audit(req.admin.id, 'dunning.run', null, null, results);
    return reply.send({ success: true, results });
  });

  // ── AUDIT LOG (z filtrowaniem) ─────────────────────────────────────
  app.get('/api/admin/audit', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { action, admin, since } = req.query || {};
    const conds = [];
    const params = [];
    if (action) { params.push(`%${action}%`); conds.push(`a.action ILIKE $${params.length}`); }
    if (admin) { params.push(`%${admin}%`); conds.push(`pa.email ILIKE $${params.length}`); }
    if (since) { params.push(since); conds.push(`a.created_at >= $${params.length}::timestamptz`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await platformPool.query(
      `SELECT a.*, pa.email AS admin_email FROM audit_log a
         LEFT JOIN platform_admins pa ON a.admin_id = pa.id
        ${where} ORDER BY a.created_at DESC LIMIT 200`,
      params
    );
    // Lista akcji do filtra.
    const { rows: actions } = await platformPool.query(`SELECT DISTINCT action FROM audit_log ORDER BY action`);
    return reply.send({ entries: rows, actions: actions.map((r) => r.action) });
  });

  // ── IMPERSONACJA (zaloguj się jako użytkownik tenanta) ─────────────
  // Lista kont tenanta do wyboru.
  app.get('/api/admin/tenants/:id/users', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows: t } = await platformPool.query(`SELECT db_name FROM tenants WHERE id = $1`, [req.params.id]);
    if (!t[0]) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    try {
      const { rows } = await getTenantPool(t[0].db_name).query(
        `SELECT id, email, full_name, role, is_active, is_super_admin
           FROM app_users ORDER BY is_super_admin DESC, role, email LIMIT 200`
      );
      return reply.send({ users: rows });
    } catch {
      return reply.send({ users: [] });
    }
  });

  // Wygeneruj jednorazowy bilet SSO i URL do wejścia jako dany użytkownik.
  app.post('/api/admin/tenants/:id/impersonate', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows: t } = await platformPool.query(
      `SELECT db_name, subdomain FROM tenants WHERE id = $1`, [req.params.id]
    );
    if (!t[0]) return reply.code(404).send({ error: 'Tenant nie istnieje' });
    const pool = getTenantPool(t[0].db_name);
    let userId = req.body?.userId;
    if (!userId) {
      const { rows } = await pool.query(
        `SELECT id FROM app_users WHERE is_active AND (is_super_admin OR role = 'superadmin')
          ORDER BY is_super_admin DESC LIMIT 1`
      );
      userId = rows[0]?.id;
    }
    if (!userId) return reply.code(400).send({ error: 'Brak aktywnego konta administratora w tym kościele' });
    const raw = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await pool.query(
      `INSERT INTO login_tickets (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '60 seconds')`,
      [userId, hash]
    );
    await audit(req.admin.id, 'tenant.impersonate', 'tenant', req.params.id, { userId });
    return reply.send({ redirect: `https://${t[0].subdomain}.${config.APP_DOMAIN}/login?ticket=${raw}` });
  });

  // ── OGŁOSZENIA SYSTEMOWE (baner u tenantów) ────────────────────────
  app.get('/api/admin/announcements', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rows } = await platformPool.query(`SELECT * FROM platform_announcements ORDER BY created_at DESC`);
    return reply.send({ announcements: rows });
  });
  app.post('/api/admin/announcements', { preHandler: app.requireAdmin }, async (req, reply) => {
    const p = req.body || {};
    const { rows } = await platformPool.query(
      `INSERT INTO platform_announcements (title, body, level, is_active, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [p.title, p.body || null, p.level || 'info', p.is_active !== false, p.starts_at || null, p.ends_at || null]
    );
    await audit(req.admin.id, 'announcement.create', 'announcement', rows[0].id);
    return reply.send({ announcement: rows[0] });
  });
  app.put('/api/admin/announcements/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const p = req.body || {};
    const { rows } = await platformPool.query(
      `UPDATE platform_announcements SET title=$1, body=$2, level=$3, is_active=$4, starts_at=$5, ends_at=$6
        WHERE id=$7 RETURNING *`,
      [p.title, p.body || null, p.level || 'info', p.is_active !== false, p.starts_at || null, p.ends_at || null, req.params.id]
    );
    await audit(req.admin.id, 'announcement.update', 'announcement', req.params.id);
    return reply.send({ announcement: rows[0] });
  });
  app.delete('/api/admin/announcements/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    await platformPool.query(`DELETE FROM platform_announcements WHERE id = $1`, [req.params.id]);
    await audit(req.admin.id, 'announcement.delete', 'announcement', req.params.id);
    return reply.send({ ok: true });
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

  // ── ZGŁOSZENIA ZE STRONY (landing_leads) ──────────────────────────
  const LEAD_STATUSES = ['new', 'contacted', 'converted', 'rejected'];

  app.get('/api/admin/landing-leads', { preHandler: app.requireAdmin }, async (req, reply) => {
    const status = LEAD_STATUSES.includes(req.query.status) ? req.query.status : null;
    const { rows: leads } = await platformPool.query(
      `SELECT id, name, email, phone, church, message, status, created_at
         FROM landing_leads
        WHERE ($1::text IS NULL OR status = $1)
        ORDER BY created_at DESC LIMIT 500`,
      [status]
    );
    const { rows: counts } = await platformPool.query(
      `SELECT status, count(*)::int AS n FROM landing_leads GROUP BY status`
    );
    return reply.send({
      leads,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    });
  });

  app.patch('/api/admin/landing-leads/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const body = z.object({ status: z.enum(LEAD_STATUSES) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowy status' });
    const { rows } = await platformPool.query(
      `UPDATE landing_leads SET status = $1 WHERE id = $2
       RETURNING id, name, email, phone, church, message, status, created_at`,
      [body.data.status, req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Zgłoszenie nie istnieje' });
    await audit(req.admin.id, 'lead.status', 'lead', req.params.id, { status: body.data.status });
    return reply.send({ lead: rows[0] });
  });

  app.delete('/api/admin/landing-leads/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { rowCount } = await platformPool.query(`DELETE FROM landing_leads WHERE id = $1`, [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Zgłoszenie nie istnieje' });
    await audit(req.admin.id, 'lead.delete', 'lead', req.params.id);
    return reply.send({ ok: true });
  });
}
