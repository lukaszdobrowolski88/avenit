// Auth tenanta: logowanie (hasło + opcjonalnie TOTP), refresh, logout,
// reset hasła, /me. Weryfikacja TOTP dzieje się TYLKO po stronie serwera
// (poprzednio klient czytał totp_secret z bazy — luka bezpieczeństwa).
import { z } from 'zod';
import { verifyPassword, hashPassword } from './passwords.js';
import { verifyTOTP, consumeBackupCode, generateSecret } from './totp.js';
import {
  signAccessToken,
  newRefreshToken,
  storeRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  AUD_TENANT,
} from './tokens.js';
import { config, isProd } from '../config.js';
import crypto from 'node:crypto';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
  remember: z.boolean().optional(),
});

const cookieOpts = (req) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  // Cookie per subdomena tenanta — bez domain, przeglądarka ograniczy do hosta.
});

export default async function authRoutes(app) {
  // Logowanie działa też dla zawieszonych tenantów (żeby pokazać ekran blokady),
  // dlatego requireTenant, nie requireTenantActive.
  app.post(
    '/api/auth/login',
    {
      preHandler: app.requireTenant,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowe dane' });
      const { email, password, totpCode, remember } = body.data;

      const { rows } = await req.db.query(
        `SELECT id, email, full_name, name, role, is_active, is_super_admin, auth_user_id,
                password_hash, totp_enabled, totp_secret, totp_backup_codes
           FROM app_users WHERE lower(email) = lower($1)`,
        [email]
      );
      const user = rows[0];
      // Jednolity komunikat — nie zdradzamy, czy konto istnieje.
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return reply.code(401).send({ error: 'Błędny e-mail lub hasło' });
      }
      if (!user.is_active) {
        return reply.code(403).send({ error: 'Konto jest zablokowane' });
      }

      if (user.totp_enabled) {
        if (!totpCode) {
          return reply.send({ requires2fa: true });
        }
        let ok = user.totp_secret && verifyTOTP(user.totp_secret, totpCode);
        if (!ok) {
          const backup = consumeBackupCode(user.totp_backup_codes, totpCode);
          if (backup.ok) {
            ok = true;
            await req.db.query(
              `UPDATE app_users SET totp_backup_codes = $1 WHERE id = $2`,
              [JSON.stringify(backup.updated), user.id]
            );
          }
        }
        if (!ok) return reply.code(401).send({ error: 'Nieprawidłowy kod weryfikacyjny' });
      }

      await req.db.query(`UPDATE app_users SET last_login_at = now() WHERE id = $1`, [user.id]);

      const accessToken = await signAccessToken({
        userId: user.id,
        authUserId: user.auth_user_id,
        tenantSlug: req.tenant.slug,
        role: user.role,
        email: user.email,
        aud: AUD_TENANT,
      });
      const { token: refreshToken, hash } = newRefreshToken();
      await storeRefreshToken(
        req.db, 'refresh_tokens', 'user_id', user.id, hash, req.headers['user-agent']
      );

      reply.setCookie('avenit_at', accessToken, cookieOpts(req));
      if (remember !== false) {
        reply.setCookie('avenit_rt', refreshToken, {
          ...cookieOpts(req),
          maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 3600,
        });
      }

      return reply.send({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: publicUser(user),
        tenant_blocked: Boolean(req.tenantBlocked),
      });
    }
  );

  // Status 2FA dla ekranu logowania (jak dawne checkTwoFactorStatus) — bez sekretów.
  app.post(
    '/api/auth/2fa-status',
    {
      preHandler: app.requireTenant,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const email = String(req.body?.email || '');
      if (!email) return reply.code(400).send({ error: 'Brak e-maila' });
      const { rows } = await req.db.query(
        `SELECT totp_enabled, totp_required, totp_verified_at FROM app_users WHERE lower(email) = lower($1)`,
        [email]
      );
      return reply.send({
        enabled: Boolean(rows[0]?.totp_enabled),
        required: Boolean(rows[0]?.totp_required),
        verifiedAt: rows[0]?.totp_verified_at || null,
      });
    }
  );

  app.post('/api/auth/refresh', { preHandler: app.requireTenant }, async (req, reply) => {
    const token = req.body?.refresh_token || req.cookies?.avenit_rt;
    if (!token) return reply.code(401).send({ error: 'Brak refresh tokena' });
    const rotated = await rotateRefreshToken(
      req.db, 'refresh_tokens', 'user_id', token, req.headers['user-agent']
    );
    if (!rotated) return reply.code(401).send({ error: 'Sesja wygasła' });

    const { rows } = await req.db.query(
      `SELECT id, email, full_name, name, role, is_active, is_super_admin, auth_user_id
         FROM app_users WHERE id = $1`,
      [rotated.userId]
    );
    const user = rows[0];
    if (!user || !user.is_active) return reply.code(401).send({ error: 'Konto nieaktywne' });

    const accessToken = await signAccessToken({
      userId: user.id,
      authUserId: user.auth_user_id,
      tenantSlug: req.tenant.slug,
      role: user.role,
      email: user.email,
      aud: AUD_TENANT,
    });
    reply.setCookie('avenit_at', accessToken, cookieOpts(req));
    reply.setCookie('avenit_rt', rotated.token, {
      ...cookieOpts(req),
      maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 3600,
    });
    return reply.send({
      access_token: accessToken,
      refresh_token: rotated.token,
      user: publicUser(user),
    });
  });

  // Wymiana jednorazowego biletu SSO (z app.<domena>) na sesję kościoła.
  app.post('/api/auth/ticket', { preHandler: app.requireTenant }, async (req, reply) => {
    const ticket = String(req.body?.ticket || '');
    if (!ticket) return reply.code(400).send({ error: 'Brak biletu' });
    const codeHash = crypto.createHash('sha256').update(ticket).digest('hex');
    const { rows } = await req.db.query(
      `UPDATE login_tickets SET used_at = now()
        WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [codeHash]
    );
    if (!rows[0]) return reply.code(400).send({ error: 'Link logowania wygasł lub został użyty' });

    const { rows: userRows } = await req.db.query(
      `SELECT id, email, full_name, name, role, is_active, is_super_admin, auth_user_id
         FROM app_users WHERE id = $1`,
      [rows[0].user_id]
    );
    const user = userRows[0];
    if (!user || !user.is_active) return reply.code(401).send({ error: 'Konto nieaktywne' });

    await req.db.query(`UPDATE app_users SET last_login_at = now() WHERE id = $1`, [user.id]);

    const accessToken = await signAccessToken({
      userId: user.id,
      authUserId: user.auth_user_id,
      tenantSlug: req.tenant.slug,
      role: user.role,
      email: user.email,
      aud: AUD_TENANT,
    });
    const { token: refreshToken, hash } = newRefreshToken();
    await storeRefreshToken(req.db, 'refresh_tokens', 'user_id', user.id, hash, req.headers['user-agent']);
    reply.setCookie('avenit_at', accessToken, cookieOpts(req));
    reply.setCookie('avenit_rt', refreshToken, {
      ...cookieOpts(req),
      maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 3600,
    });
    return reply.send({ access_token: accessToken, refresh_token: refreshToken, user: publicUser(user) });
  });

  app.post('/api/auth/logout', { preHandler: app.requireTenant }, async (req, reply) => {
    const token = req.body?.refresh_token || req.cookies?.avenit_rt;
    if (token) await revokeRefreshToken(req.db, 'refresh_tokens', token);
    reply.clearCookie('avenit_at', { path: '/' });
    reply.clearCookie('avenit_rt', { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', { preHandler: app.requireUser }, async (req, reply) => {
    const { rows } = await req.db.query(
      `SELECT id, email, full_name, name, role, is_active, is_super_admin, campus_id,
              totp_enabled, totp_required, auth_user_id, created_at
         FROM app_users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Użytkownik nie istnieje' });
    return reply.send({ user: publicUser(rows[0]) });
  });

  // Zmiana własnego hasła (odpowiednik supabase.auth.updateUser({password})).
  app.post('/api/auth/update-password', { preHandler: app.requireUser }, async (req, reply) => {
    const password = String(req.body?.password || '');
    if (password.length < 8) {
      return reply.code(400).send({ error: 'Hasło musi mieć min. 8 znaków' });
    }
    await req.db.query(`UPDATE app_users SET password_hash = $1 WHERE id = $2`, [
      await hashPassword(password),
      req.user.id,
    ]);
    return reply.send({ ok: true });
  });

  // Reset hasła: generujemy jednorazowy token (1 h), wysyłamy link mailem.
  app.post(
    '/api/auth/reset-password',
    {
      preHandler: app.requireTenant,
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      const email = String(req.body?.email || '');
      const { rows } = await req.db.query(
        `SELECT id, email, full_name FROM app_users WHERE lower(email) = lower($1) AND is_active`,
        [email]
      );
      // Zawsze 200 — nie zdradzamy istnienia konta.
      if (rows[0]) {
        const raw = crypto.randomBytes(32).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
        await req.db.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + interval '1 hour')`,
          [rows[0].id, tokenHash]
        );
        const { sendResetPasswordEmail } = await import('../lib/email.js');
        const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
        await sendResetPasswordEmail(rows[0].email, `${base}/reset-password?token=${raw}`).catch(
          (err) => req.log.error({ err }, 'reset-password email failed')
        );
      }
      return reply.send({ ok: true });
    }
  );

  // Ustawienie nowego hasła z tokenu resetu.
  app.post('/api/auth/reset-password/confirm', { preHandler: app.requireTenant }, async (req, reply) => {
    const { token, password } = req.body || {};
    if (!token || String(password || '').length < 8) {
      return reply.code(400).send({ error: 'Nieprawidłowe dane' });
    }
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const { rows } = await req.db.query(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [tokenHash]
    );
    if (!rows[0]) return reply.code(400).send({ error: 'Link wygasł lub został użyty' });
    await req.db.query(`UPDATE app_users SET password_hash = $1 WHERE id = $2`, [
      await hashPassword(String(password)),
      rows[0].user_id,
    ]);
    // Unieważnij wszystkie sesje użytkownika.
    await req.db.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [rows[0].user_id]
    );
    return reply.send({ ok: true });
  });

  // Konfiguracja 2FA dla zalogowanego użytkownika (generacja sekretu + włączenie).
  app.post('/api/auth/2fa/setup', { preHandler: app.requireUser }, async (req, reply) => {
    const secret = generateSecret();
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8)
    );
    // Sekret zapisujemy dopiero po weryfikacji pierwszym kodem (endpoint /enable),
    // do tego czasu zwracamy go klientowi do wyświetlenia QR.
    return reply.send({
      secret,
      backupCodes,
      otpauthUrl: `otpauth://totp/${encodeURIComponent(config.MAILING_FROM_NAME)}:${encodeURIComponent(
        req.user.email
      )}?secret=${secret}&issuer=${encodeURIComponent('Avenit')}`,
    });
  });

  app.post('/api/auth/2fa/enable', { preHandler: app.requireUser }, async (req, reply) => {
    const { secret, code, backupCodes } = req.body || {};
    if (!secret || !verifyTOTP(String(secret), String(code || ''))) {
      return reply.code(400).send({ error: 'Nieprawidłowy kod — spróbuj ponownie' });
    }
    // Kody zapasowe w formacie [{code, used}] (jak dotychczasowe dane).
    const codes = (backupCodes || []).map((c) =>
      typeof c === 'string' ? { code: c.toUpperCase(), used: false } : c
    );
    await req.db.query(
      `UPDATE app_users SET totp_secret = $1, totp_enabled = true, totp_verified_at = now(),
              totp_backup_codes = $2
        WHERE id = $3`,
      [String(secret), JSON.stringify(codes), req.user.id]
    );
    return reply.send({ ok: true });
  });

  // Wyłączenie 2FA — wymaga poprawnego kodu (jak dotychczasowy przepływ w UserSettings).
  app.post('/api/auth/2fa/disable', { preHandler: app.requireUser }, async (req, reply) => {
    const code = String(req.body?.code || '');
    const { rows } = await req.db.query(
      `SELECT totp_secret, totp_backup_codes FROM app_users WHERE id = $1`,
      [req.user.id]
    );
    const row = rows[0];
    if (!row?.totp_secret) return reply.code(400).send({ error: '2FA nie jest skonfigurowane' });
    if (!verifyTOTP(row.totp_secret, code)) {
      return reply.code(400).send({ error: 'Nieprawidłowy kod weryfikacyjny' });
    }
    await req.db.query(
      `UPDATE app_users SET totp_secret = NULL, totp_enabled = false, totp_verified_at = NULL,
              totp_backup_codes = '[]'::jsonb
        WHERE id = $1`,
      [req.user.id]
    );
    return reply.send({ ok: true });
  });

  // Kody zapasowe: podgląd pozostałych.
  app.get('/api/auth/2fa/backup-codes', { preHandler: app.requireUser }, async (req, reply) => {
    const { rows } = await req.db.query(
      `SELECT totp_backup_codes FROM app_users WHERE id = $1`,
      [req.user.id]
    );
    return reply.send({ codes: rows[0]?.totp_backup_codes || [] });
  });

  // Kody zapasowe: regeneracja (wymaga poprawnego kodu TOTP).
  app.post('/api/auth/2fa/backup-codes', { preHandler: app.requireUser }, async (req, reply) => {
    const code = String(req.body?.code || '');
    const { rows } = await req.db.query(
      `SELECT totp_secret FROM app_users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]?.totp_secret || !verifyTOTP(rows[0].totp_secret, code)) {
      return reply.code(400).send({ error: 'Nieprawidłowy kod weryfikacyjny' });
    }
    const newCodes = Array.from({ length: 10 }, () => ({
      code: crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8),
      used: false,
    }));
    await req.db.query(`UPDATE app_users SET totp_backup_codes = $1 WHERE id = $2`, [
      JSON.stringify(newCodes),
      req.user.id,
    ]);
    return reply.send({ codes: newCodes.map((c) => c.code) });
  });
}

function publicUser(u) {
  return {
    // Zgodność wstecz: dane produkcyjne kluczowane są ID z GoTrue (auth_user_id).
    id: u.auth_user_id || u.id,
    app_user_id: u.id,
    email: u.email,
    full_name: u.full_name,
    name: u.name,
    role: u.role,
    is_active: u.is_active,
    is_super_admin: u.is_super_admin,
    campus_id: u.campus_id,
    totp_enabled: u.totp_enabled,
    totp_required: u.totp_required,
    created_at: u.created_at,
  };
}
