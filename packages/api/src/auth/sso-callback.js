// Globalny callback SSO — trafia na centralny host app.<domena> (jeden URI przekierowania dla
// WSZYSTKICH subdomen). Tenant odczytywany ze `state`; dane konta i bilet lądują w bazie tenanta,
// po czym przekierowujemy na jego subdomenę z ?ticket (SPA wymienia bilet na sesję).
import crypto from 'node:crypto';
import { config } from '../config.js';
import { platformPool, getTenantPool } from '../db.js';
import { verifyState, resolveProviderCreds, exchangeCode } from '../lib/sso.js';

export default async function ssoCallbackRoutes(app) {
  app.get('/api/auth/oauth/:provider/callback', async (req, reply) => {
    const provider = String(req.params.provider || '');
    const parsed = verifyState(String(req.query?.state || ''));
    const nonceCookie = req.cookies?.avenit_oauth || '';
    reply.clearCookie('avenit_oauth', { path: '/', domain: `.${config.APP_DOMAIN}` });

    const fallback = `https://app.${config.APP_DOMAIN}/login?sso=error`;
    if (!parsed || parsed.provider !== provider || parsed.nonce !== nonceCookie) return reply.redirect(fallback);

    // Tenant ze state → baza tenanta.
    const { rows: trows } = await platformPool.query(
      `SELECT subdomain, db_name FROM tenants WHERE subdomain = $1 OR slug = $1 LIMIT 1`,
      [parsed.tenant]
    );
    const t = trows[0];
    if (!t) return reply.redirect(fallback);
    const base = `https://${t.subdomain}.${config.APP_DOMAIN}`;
    const fail = (r) => reply.redirect(`${base}/login?sso=${r}`);

    const code = String(req.query?.code || '');
    if (!code) return fail('error');

    const db = getTenantPool(t.db_name);
    const creds = await resolveProviderCreds(db, provider);
    if (!creds.enabled || !creds.clientId || !creds.clientSecret) return fail('disabled');

    const idToken = await exchangeCode(provider, { clientId: creds.clientId, clientSecret: creds.clientSecret, msTenant: creds.msTenant, code });
    if (!idToken) { req.log.error({ provider, tenant: t.subdomain }, 'sso token exchange failed'); return fail('error'); }
    const email = String(idToken.email || '').toLowerCase();
    const name = idToken.name || idToken.given_name || '';
    if (!email) return fail('error');

    // Znajdź lub (opcjonalnie) utwórz konto w bazie tenanta.
    const { rows: found } = await db.query(`SELECT id, is_active, status FROM app_users WHERE lower(email) = lower($1)`, [email]);
    let user = found[0];
    if (!user) {
      if (!creds.autoProvision) return fail('nouser');
      const ins = await db.query(
        `INSERT INTO app_users (email, full_name, name, role, is_active, status, email_verified, password_hash)
         VALUES ($1,$2,$2,$3,true,'active',true,'') RETURNING id, is_active, status`,
        [email, name, creds.defaultRole || 'czlonek']
      );
      user = ins.rows[0];
      const { logAccountEvent } = await import('../lib/account-audit.js');
      await logAccountEvent(db, { email, action: 'created', actor: `sso:${provider}` });
    }
    if (!user.is_active || user.status === 'pending' || user.status === 'blocked') return fail('inactive');

    // Bilet jednorazowy → przekierowanie na subdomenę tenanta (SPA wymieni na sesję).
    const raw = crypto.randomBytes(32).toString('base64url');
    const codeHash = crypto.createHash('sha256').update(raw).digest('hex');
    await db.query(`INSERT INTO login_tickets (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '5 minutes')`, [user.id, codeHash]);
    return reply.redirect(`${base}/login?ticket=${raw}`);
  });
}
