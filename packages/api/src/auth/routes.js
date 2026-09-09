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
  hashRefreshToken,
  AUD_TENANT,
} from './tokens.js';
import { config, isProd } from '../config.js';
import { validatePassword, getPasswordPolicy } from '../lib/password-policy.js';
import { decryptPassword } from '../lib/mailcrypto.js';
import crypto from 'node:crypto';

// Provider OIDC (Google, Microsoft) — endpointy authorize/token.
const SSO_PROVIDERS = {
  google: {
    authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: () => 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
  },
  microsoft: {
    authUrl: (t) => `https://login.microsoftonline.com/${t || 'common'}/oauth2/v2.0/authorize`,
    tokenUrl: (t) => `https://login.microsoftonline.com/${t || 'common'}/oauth2/v2.0/token`,
    scope: 'openid email profile',
  },
};
const SSO_SECRET = () => config.MAIL_ENCRYPTION_SECRET || config.JWT_SECRET;

async function getSSOConfig(db) {
  const { rows } = await db.query(`SELECT key, value FROM app_settings WHERE key LIKE 'sso\\_%'`);
  const m = {};
  rows.forEach((r) => { m[r.key] = r.value; });
  return {
    google: { enabled: m.sso_google_enabled === 'on', clientId: m.sso_google_client_id || '', secretEnc: m.sso_google_client_secret_enc || '' },
    microsoft: { enabled: m.sso_microsoft_enabled === 'on', clientId: m.sso_microsoft_client_id || '', secretEnc: m.sso_microsoft_client_secret_enc || '', tenant: m.sso_microsoft_tenant || 'common' },
    autoProvision: m.sso_auto_provision === 'on',
    defaultRole: m.sso_default_role || null,
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
  remember: z.boolean().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6), // twarda podłoga; właściwą politykę egzekwuje validatePassword
  full_name: z.string().max(120).optional(),
});

// Konfiguracja rejestracji tenanta (app_settings). Domyślnie zamknięta (tylko admin tworzy konta).
const csvLower = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

async function getRegConfig(db) {
  const { rows } = await db.query(
    `SELECT key, value FROM app_settings WHERE key IN
      ('registration_mode','registration_default_role','registration_default_campus',
       'registration_allowed_domains','registration_captcha','registration_autoapprove_domains',
       'registration_require_consent','registration_consent_url','registration_consent_text')`
  );
  const m = {};
  rows.forEach((r) => { m[r.key] = r.value; });
  return {
    mode: m.registration_mode || 'closed',
    role: m.registration_default_role || null,
    campus: m.registration_default_campus || null,
    domains: csvLower(m.registration_allowed_domains),
    captcha: (m.registration_captcha || 'on') !== 'off', // domyślnie włączona
    autoapproveDomains: csvLower(m.registration_autoapprove_domains),
    consent: {
      required: m.registration_require_consent === 'on',
      url: m.registration_consent_url || '',
      text: m.registration_consent_text || '',
    },
  };
}

// Weryfikacja captchy (bezstanowa: token = "exp.hmac", hmac wiąże poprawny wynik z wygaśnięciem).
function captchaOk(body) {
  if (String(body?.website || '')) return false; // honeypot — bot wypełnia ukryte pole
  const token = String(body?.captcha_token || '');
  const answer = String(body?.captcha_answer || '').trim();
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!sig || !exp || exp < Date.now()) return false;
  const expected = crypto.createHmac('sha256', config.JWT_SECRET).update(`${answer}:${exp}`).digest('hex');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

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
                password_hash, totp_enabled, totp_secret, totp_backup_codes,
                onboarding, last_login_at, status, pending_kind, failed_login_count, locked_until
           FROM app_users WHERE lower(email) = lower($1)`,
        [email]
      );
      const user = rows[0];
      // Jednolity komunikat — nie zdradzamy, czy konto istnieje.
      if (!user) {
        return reply.code(401).send({ error: 'Błędny e-mail lub hasło' });
      }
      // Czasowa blokada po zbyt wielu nieudanych próbach (anty-brute-force, próg 5 / 15 min).
      // Ten sam komunikat co przy błędnym haśle — bez ujawniania istnienia/stanu konta (bez enumeracji).
      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        return reply.code(401).send({ error: 'Błędny e-mail lub hasło' });
      }
      if (!(await verifyPassword(password, user.password_hash))) {
        const count = (user.failed_login_count || 0) + 1;
        if (count >= 5) {
          await req.db.query(`UPDATE app_users SET failed_login_count = 0, locked_until = now() + interval '15 minutes' WHERE id = $1`, [user.id]);
        } else {
          await req.db.query(`UPDATE app_users SET failed_login_count = $1 WHERE id = $2`, [count, user.id]);
        }
        return reply.code(401).send({ error: 'Błędny e-mail lub hasło' });
      }
      if (!user.is_active || user.status === 'pending' || user.status === 'blocked') {
        if (user.status === 'pending' && user.pending_kind === 'email') {
          return reply.code(403).send({ error: 'Potwierdź adres e-mail — sprawdź skrzynkę.' });
        }
        if (user.status === 'pending') {
          return reply.code(403).send({ error: 'Konto oczekuje na zatwierdzenie przez administratora.' });
        }
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
        if (!ok) {
          // Błędny kod 2FA też liczy się do progu blokady (throttle zgadywania TOTP per konto).
          const count = (user.failed_login_count || 0) + 1;
          if (count >= 5) {
            await req.db.query(`UPDATE app_users SET failed_login_count = 0, locked_until = now() + interval '15 minutes' WHERE id = $1`, [user.id]);
          } else {
            await req.db.query(`UPDATE app_users SET failed_login_count = $1 WHERE id = $2`, [count, user.id]);
          }
          return reply.code(401).send({ error: 'Nieprawidłowy kod weryfikacyjny' });
        }
      }

      // Sukces — reset licznika nieudanych prób + znacznik logowania.
      await req.db.query(
        `UPDATE app_users SET last_login_at = now(), failed_login_count = 0, locked_until = NULL WHERE id = $1`,
        [user.id]
      );

      // Wymóg 2FA (org lub konto) bez skonfigurowanego 2FA → token oznaczony n2fa (dane blokowane).
      const { rows: r2fa } = await req.db.query(`SELECT value FROM app_settings WHERE key = 'require_2fa_all'`);
      const needs2fa = ((r2fa[0]?.value === 'on') || user.totp_required) && !user.totp_enabled;

      const accessToken = await signAccessToken({
        userId: user.id,
        authUserId: user.auth_user_id,
        tenantSlug: req.tenant.slug,
        role: user.role,
        email: user.email,
        aud: AUD_TENANT,
        needs2fa,
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

  // Status 2FA WŁASNEGO konta (wymaga zalogowania). Wcześniej publiczne po e-mailu → enumeracja,
  // kto ma 2FA. Teraz zwraca tylko status wywołującego (ignoruje e-mail z body).
  app.post('/api/auth/2fa-status', { preHandler: app.requireUser }, async (req, reply) => {
    const { rows } = await req.db.query(
      `SELECT totp_enabled, totp_required, totp_verified_at FROM app_users WHERE id = $1`,
      [req.user.id]
    );
    return reply.send({
      enabled: Boolean(rows[0]?.totp_enabled),
      required: Boolean(rows[0]?.totp_required),
      verifiedAt: rows[0]?.totp_verified_at || null,
    });
  });

  app.post('/api/auth/refresh', { preHandler: app.requireTenant }, async (req, reply) => {
    const token = req.body?.refresh_token || req.cookies?.avenit_rt;
    if (!token) return reply.code(401).send({ error: 'Brak refresh tokena' });
    const rotated = await rotateRefreshToken(
      req.db, 'refresh_tokens', 'user_id', token, req.headers['user-agent']
    );
    if (!rotated) return reply.code(401).send({ error: 'Sesja wygasła' });

    const { rows } = await req.db.query(
      `SELECT id, email, full_name, name, role, is_active, is_super_admin, auth_user_id,
              onboarding, last_login_at, totp_enabled, totp_required
         FROM app_users WHERE id = $1`,
      [rotated.userId]
    );
    const user = rows[0];
    if (!user || !user.is_active) return reply.code(401).send({ error: 'Konto nieaktywne' });

    const { rows: r2fa } = await req.db.query(`SELECT value FROM app_settings WHERE key = 'require_2fa_all'`);
    const needs2fa = ((r2fa[0]?.value === 'on') || user.totp_required) && !user.totp_enabled;

    const accessToken = await signAccessToken({
      userId: user.id,
      authUserId: user.auth_user_id,
      tenantSlug: req.tenant.slug,
      role: user.role,
      email: user.email,
      aud: AUD_TENANT,
      needs2fa,
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
      `SELECT id, email, full_name, name, role, is_active, is_super_admin, auth_user_id,
              onboarding, last_login_at, totp_enabled, totp_required
         FROM app_users WHERE id = $1`,
      [rows[0].user_id]
    );
    const user = userRows[0];
    if (!user || !user.is_active) return reply.code(401).send({ error: 'Konto nieaktywne' });

    await req.db.query(`UPDATE app_users SET last_login_at = now() WHERE id = $1`, [user.id]);

    const { rows: r2fa } = await req.db.query(`SELECT value FROM app_settings WHERE key = 'require_2fa_all'`);
    const needs2fa = ((r2fa[0]?.value === 'on') || user.totp_required) && !user.totp_enabled;
    const accessToken = await signAccessToken({
      userId: user.id,
      authUserId: user.auth_user_id,
      tenantSlug: req.tenant.slug,
      role: user.role,
      email: user.email,
      aud: AUD_TENANT,
      needs2fa,
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

  // ── SSO (OIDC: Google / Microsoft) ─────────────────────────────────────────
  // Publiczna informacja: którzy dostawcy są włączeni (przyciski na ekranie logowania).
  app.get('/api/auth/sso-config', { preHandler: app.requireTenant }, async (req, reply) => {
    const cfg = await getSSOConfig(req.db);
    return reply.send({
      google: cfg.google.enabled && !!cfg.google.clientId,
      microsoft: cfg.microsoft.enabled && !!cfg.microsoft.clientId,
    });
  });

  // Start OAuth: redirect do dostawcy z podpisanym state + nonce w cookie (CSRF).
  app.get('/api/auth/oauth/:provider/start', { preHandler: app.requireTenant }, async (req, reply) => {
    const provider = String(req.params.provider || '');
    const P = SSO_PROVIDERS[provider];
    const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
    if (!P) return reply.redirect(`${base}/login?sso=error`);
    const cfg = await getSSOConfig(req.db);
    const pc = cfg[provider];
    if (!pc?.enabled || !pc.clientId) return reply.redirect(`${base}/login?sso=disabled`);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const exp = Date.now() + 10 * 60 * 1000;
    const payload = Buffer.from(`${provider}.${nonce}.${exp}`).toString('base64url');
    const sig = crypto.createHmac('sha256', config.JWT_SECRET).update(payload).digest('hex');
    reply.setCookie('avenit_oauth', nonce, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 600 });

    const redirectUri = `${base}/api/auth/oauth/${provider}/callback`;
    const params = new URLSearchParams({
      client_id: pc.clientId, redirect_uri: redirectUri, response_type: 'code',
      scope: P.scope, state: `${payload}.${sig}`, prompt: 'select_account',
    });
    return reply.redirect(`${P.authUrl(pc.tenant)}?${params.toString()}`);
  });

  // Callback OAuth: weryfikacja state, wymiana code→token, e-mail z id_token, sesja przez bilet.
  app.get('/api/auth/oauth/:provider/callback', { preHandler: app.requireTenant }, async (req, reply) => {
    const provider = String(req.params.provider || '');
    const P = SSO_PROVIDERS[provider];
    const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
    const fail = (r) => reply.redirect(`${base}/login?sso=${r}`);
    if (!P) return fail('error');

    // Weryfikacja state (HMAC + exp + nonce z cookie).
    const state = String(req.query?.state || '');
    const [payload, sig] = state.split('.');
    const nonceCookie = req.cookies?.avenit_oauth || '';
    reply.clearCookie('avenit_oauth', { path: '/' });
    if (!payload || !sig) return fail('error');
    const expectSig = crypto.createHmac('sha256', config.JWT_SECRET).update(payload).digest('hex');
    if (sig.length !== expectSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectSig))) return fail('error');
    let sp, snonce, sexp;
    try { [sp, snonce, sexp] = Buffer.from(payload, 'base64url').toString().split('.'); } catch { return fail('error'); }
    if (sp !== provider || snonce !== nonceCookie || Number(sexp) < Date.now()) return fail('error');

    const code = String(req.query?.code || '');
    if (!code) return fail('error');

    const cfg = await getSSOConfig(req.db);
    const pc = cfg[provider];
    if (!pc?.enabled || !pc.clientId || !pc.secretEnc) return fail('disabled');
    let clientSecret = '';
    try { clientSecret = await decryptPassword(pc.secretEnc, SSO_SECRET()); } catch { return fail('error'); }

    const redirectUri = `${base}/api/auth/oauth/${provider}/callback`;
    let idToken;
    try {
      const tokRes = await fetch(P.tokenUrl(pc.tenant), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: pc.clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });
      const tok = await tokRes.json();
      if (!tokRes.ok || !tok.id_token) { req.log.error({ status: tokRes.status }, 'oauth token exchange failed'); return fail('error'); }
      idToken = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString());
    } catch (err) { req.log.error({ err }, 'oauth exchange error'); return fail('error'); }

    const email = String(idToken.email || '').toLowerCase();
    const name = idToken.name || idToken.given_name || '';
    if (!email) return fail('error');

    // Znajdź lub (opcjonalnie) utwórz konto.
    const { rows: found } = await req.db.query(`SELECT id, is_active, status FROM app_users WHERE lower(email) = lower($1)`, [email]);
    let user = found[0];
    if (!user) {
      if (!cfg.autoProvision) return fail('nouser');
      const ins = await req.db.query(
        `INSERT INTO app_users (email, full_name, name, role, is_active, status, email_verified, password_hash)
         VALUES ($1,$2,$2,$3,true,'active',true,'') RETURNING id, is_active, status`,
        [email, name, cfg.defaultRole || 'czlonek']
      );
      user = ins.rows[0];
      const { logAccountEvent } = await import('../lib/account-audit.js');
      await logAccountEvent(req.db, { email, action: 'created', actor: `sso:${provider}` });
    }
    if (!user.is_active || user.status === 'pending' || user.status === 'blocked') return fail('inactive');

    // Bilet jednorazowy → SPA wymieni na sesję (jak SSO z app.<domena>).
    const raw = crypto.randomBytes(32).toString('base64url');
    const codeHash = crypto.createHash('sha256').update(raw).digest('hex');
    await req.db.query(`INSERT INTO login_tickets (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '5 minutes')`, [user.id, codeHash]);
    return reply.redirect(`${base}/login?ticket=${raw}`);
  });

  app.get('/api/auth/me', { preHandler: app.requireUser }, async (req, reply) => {
    const { rows } = await req.db.query(
      `SELECT id, email, full_name, name, role, is_active, is_super_admin, campus_id,
              totp_enabled, totp_required, auth_user_id, created_at,
              onboarding, last_login_at
         FROM app_users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Użytkownik nie istnieje' });
    const { rows: r2fa } = await req.db.query(`SELECT value FROM app_settings WHERE key = 'require_2fa_all'`);
    const needs2fa = ((r2fa[0]?.value === 'on') || rows[0].totp_required) && !rows[0].totp_enabled;
    return reply.send({ user: { ...publicUser(rows[0]), needs2fa } });
  });

  // Zmiana własnego hasła (odpowiednik supabase.auth.updateUser({password})).
  app.post('/api/auth/update-password', { preHandler: app.requireUser }, async (req, reply) => {
    const password = String(req.body?.password || '');
    const pwErr = await validatePassword(req.db, password);
    if (pwErr) return reply.code(400).send({ error: pwErr });
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
    if (!token) return reply.code(400).send({ error: 'Nieprawidłowe dane' });
    const pwErr = await validatePassword(req.db, password);
    if (pwErr) return reply.code(400).send({ error: pwErr });
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const { rows } = await req.db.query(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [tokenHash]
    );
    if (!rows[0]) return reply.code(400).send({ error: 'Link wygasł lub został użyty' });
    // Ustaw hasło + zdejmij ewentualną blokadę logowania (anty-brute-force) + znacznik zaproszenia.
    await req.db.query(`UPDATE app_users SET password_hash = $1, invited_at = NULL, failed_login_count = 0, locked_until = NULL WHERE id = $2`, [
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

  // Publiczna, minimalna konfiguracja rejestracji — Login pyta, czy pokazać „Zarejestruj się".
  app.get('/api/auth/registration-config', { preHandler: app.requireTenant }, async (req, reply) => {
    const cfg = await getRegConfig(req.db);
    const passwordPolicy = await getPasswordPolicy(req.db);
    return reply.send({ mode: cfg.mode, captcha: cfg.captcha, consent: cfg.consent, passwordPolicy });
  });

  // Captcha (bezstanowa, samodzielna): proste działanie do przepisania + honeypot na froncie.
  app.get(
    '/api/auth/captcha',
    { preHandler: app.requireTenant, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const a = 1 + Math.floor(Math.random() * 9);
      const b = 1 + Math.floor(Math.random() * 9);
      const exp = Date.now() + 10 * 60 * 1000;
      const sig = crypto.createHmac('sha256', config.JWT_SECRET).update(`${a + b}:${exp}`).digest('hex');
      return reply.send({ token: `${exp}.${sig}`, question: `${a} + ${b}` });
    }
  );

  // Samodzielna rejestracja konta — zależnie od trybu tenanta (closed/approval/open).
  app.post(
    '/api/auth/register',
    { preHandler: app.requireTenant, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = registerSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowe dane (e-mail i hasło min. 8 znaków)' });
      const { email, password, full_name } = body.data;

      const cfg = await getRegConfig(req.db);
      if (cfg.mode !== 'approval' && cfg.mode !== 'open') {
        return reply.code(403).send({ error: 'Rejestracja jest wyłączona' });
      }
      if (cfg.captcha) {
        if (!captchaOk(req.body)) {
          return reply.code(400).send({ error: 'Nieprawidłowy wynik weryfikacji — spróbuj ponownie' });
        }
        // Jednorazowość: ten sam rozwiązany captcha nie przejdzie drugi raz.
        const cHash = crypto.createHash('sha256').update(String(req.body?.captcha_token || '')).digest('hex');
        await req.db.query('DELETE FROM used_captchas WHERE expires_at < now()').catch(() => {});
        const consumed = await req.db.query(
          `INSERT INTO used_captchas (token_hash, expires_at) VALUES ($1, now() + interval '15 minutes') ON CONFLICT DO NOTHING`,
          [cHash]
        );
        if (consumed.rowCount === 0) {
          return reply.code(400).send({ error: 'Weryfikacja już użyta — odśwież i spróbuj ponownie' });
        }
      }
      if (cfg.consent.required && req.body?.consent !== true) {
        return reply.code(400).send({ error: 'Wymagana akceptacja regulaminu / polityki prywatności' });
      }
      const pwErr = await validatePassword(req.db, password);
      if (pwErr) return reply.code(400).send({ error: pwErr });
      const domain = String(email.split('@')[1] || '').toLowerCase();
      if (cfg.domains.length && !cfg.domains.includes(domain)) {
        return reply.code(400).send({ error: 'Rejestracja dozwolona tylko dla wybranych domen e-mail' });
      }
      const { rows: exist } = await req.db.query(`SELECT id FROM app_users WHERE lower(email) = lower($1)`, [email]);
      if (exist[0]) return reply.code(409).send({ error: 'Konto z tym adresem e-mail już istnieje' });

      const role = cfg.role || 'czlonek';
      const passwordHash = await hashPassword(password);
      const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
      const consentAt = req.body?.consent === true ? new Date() : null;
      const { logAccountEvent } = await import('../lib/account-audit.js');

      if (cfg.mode === 'open') {
        // Otwarta: konto powstaje, ale aktywne dopiero po potwierdzeniu e-mail.
        const raw = crypto.randomBytes(32).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
        await req.db.query(
          `INSERT INTO app_users
             (email, full_name, name, role, is_active, status, pending_kind, email_verified, verify_token_hash, verify_expires, password_hash, campus_id, consent_at)
           VALUES ($1,$2,$2,$3,false,'pending','email',false,$4, now() + interval '24 hours',$5,$6,$7)`,
          [email, full_name || '', role, tokenHash, passwordHash, cfg.campus, consentAt]
        );
        const { sendVerifyEmail } = await import('../lib/email.js');
        await sendVerifyEmail(email, `${base}/api/auth/verify-email?token=${raw}`).catch((err) =>
          req.log.error({ err }, 'verify email failed')
        );
        await logAccountEvent(req.db, { email, action: 'registered', actor: 'self', detail: 'open (e-mail)' });
        return reply.code(202).send({ status: 'pending', reason: 'email' });
      }

      // Tryb „za zgodą": zaufane domeny aktywują się od razu; reszta czeka na administratora.
      if (cfg.autoapproveDomains.includes(domain)) {
        await req.db.query(
          `INSERT INTO app_users
             (email, full_name, name, role, is_active, status, email_verified, password_hash, campus_id, consent_at)
           VALUES ($1,$2,$2,$3,true,'active',true,$4,$5,$6)`,
          [email, full_name || '', role, passwordHash, cfg.campus, consentAt]
        );
        const { sendWelcomeEmail } = await import('../lib/email.js');
        await sendWelcomeEmail(email, { name: full_name, loginUrl: base }).catch((err) => req.log.error({ err }, 'welcome email failed'));
        await logAccountEvent(req.db, { email, action: 'approved', actor: 'auto', detail: `zaufana domena ${domain}` });
        return reply.code(201).send({ status: 'active', reason: 'auto' });
      }

      await req.db.query(
        `INSERT INTO app_users
           (email, full_name, name, role, is_active, status, pending_kind, email_verified, password_hash, campus_id, consent_at)
         VALUES ($1,$2,$2,$3,false,'pending','admin',false,$4,$5,$6)`,
        [email, full_name || '', role, passwordHash, cfg.campus, consentAt]
      );
      const { rows: admins } = await req.db.query(
        `SELECT u.email FROM app_users u JOIN app_roles r ON u.role = r.key
          WHERE r.is_admin = true AND u.is_active = true AND u.email IS NOT NULL`
      );
      if (admins.length) {
        const { sendAdminNewUserEmail } = await import('../lib/email.js');
        await sendAdminNewUserEmail(admins.map((a) => a.email), { email, name: full_name, link: `${base}/settings` })
          .catch((err) => req.log.error({ err }, 'admin notify failed'));
      }
      await logAccountEvent(req.db, { email, action: 'registered', actor: 'self', detail: 'approval' });
      return reply.code(202).send({ status: 'pending', reason: 'admin' });
    }
  );

  // Potwierdzenie e-mail (klik z linku) → aktywacja konta i przekierowanie do logowania.
  app.get('/api/auth/verify-email', { preHandler: app.requireTenant }, async (req, reply) => {
    const raw = String(req.query?.token || '');
    const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
    if (!raw) return reply.redirect(`${base}/?verify=invalid`);
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const { rows } = await req.db.query(
      `UPDATE app_users
          SET status='active', is_active=true, email_verified=true, verify_token_hash=NULL, verify_expires=NULL
        WHERE verify_token_hash = $1 AND verify_expires > now() AND status='pending' AND pending_kind='email'
        RETURNING email, full_name`,
      [tokenHash]
    );
    if (rows[0]) {
      const { sendWelcomeEmail } = await import('../lib/email.js');
      await sendWelcomeEmail(rows[0].email, { name: rows[0].full_name, loginUrl: base }).catch((err) =>
        req.log.error({ err }, 'welcome email failed')
      );
      const { logAccountEvent } = await import('../lib/account-audit.js');
      await logAccountEvent(req.db, { email: rows[0].email, action: 'verified', actor: 'self' });
    }
    return reply.redirect(`${base}/?verify=${rows[0] ? 'ok' : 'expired'}`);
  });

  // Aktywne sesje bieżącego użytkownika (urządzenia). Oznacza bieżącą sesję.
  app.get('/api/auth/sessions', { preHandler: app.requireUser }, async (req, reply) => {
    const cur = req.cookies?.avenit_rt || req.headers['x-refresh-token'] || '';
    const curHash = cur ? hashRefreshToken(cur) : null;
    const { rows } = await req.db.query(
      `SELECT id, user_agent, created_at, token_hash FROM refresh_tokens
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
      [req.user.id]
    );
    return reply.send({
      sessions: rows.map((r) => ({
        id: r.id, user_agent: r.user_agent, created_at: r.created_at,
        current: curHash != null && r.token_hash === curHash,
      })),
    });
  });

  // Wyloguj ze wszystkich innych urządzeń (rewokacja wszystkich sesji poza bieżącą).
  app.post('/api/auth/logout-others', { preHandler: app.requireUser }, async (req, reply) => {
    const cur = req.body?.refresh_token || req.cookies?.avenit_rt || '';
    const curHash = cur ? hashRefreshToken(cur) : null;
    if (curHash) {
      await req.db.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND token_hash <> $2`,
        [req.user.id, curHash]
      );
    } else {
      await req.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
    }
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
    last_login_at: u.last_login_at,
    onboarding: u.onboarding || {},
  };
}
