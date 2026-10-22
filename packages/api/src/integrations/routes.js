// Globalny callback integracji Google / Microsoft — host app.<domena> (jeden URI przekierowania dla
// wszystkich kościołów, jak SSO). Tenant z podpisanego `state`, dalej baza tenanta; po zakończeniu
// przekierowanie na kartę Ustawienia → Integracje kościoła z wynikiem w parametrach adresu.
import { config, isProd } from '../config.js';
import { platformPool, getTenantPool } from '../db.js';
import { isProvider, resolveIntegrationCreds } from './providers.js';
import { verifyIntegrationState, handleCallback, NONCE_COOKIE } from './oauth.js';

export function settingsReturnUrl(subdomain, provider, result, reason) {
  const q = new URLSearchParams({ tab: 'integrations', ws: provider, ws_result: result });
  if (reason) q.set('ws_reason', String(reason).slice(0, 60));
  return `https://${subdomain}.${config.APP_DOMAIN}/settings?${q}`;
}

export default async function integrationRoutes(app) {
  app.get('/api/integrations/oauth/:provider/callback', {
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const provider = String(req.params.provider || '');
    const fallback = `https://app.${config.APP_DOMAIN}/login`;
    const parsed = verifyIntegrationState(String(req.query?.state || ''));
    if (!isProvider(provider) || !parsed || parsed.provider !== provider) return reply.redirect(fallback);

    const { rows } = await platformPool.query(
      `SELECT subdomain, db_name, status FROM tenants WHERE subdomain = $1 OR slug = $1 LIMIT 1`, [parsed.tenant]);
    const t = rows[0];
    if (!t || t.status === 'suspended' || t.status === 'cancelled') return reply.redirect(fallback);

    const db = getTenantPool(t.db_name);
    const creds = await resolveIntegrationCreds(db, provider);
    let out;
    try {
      out = await handleCallback(db, {
        provider, stateId: parsed.stateId, query: req.query || {}, nonceCookie: req.cookies?.[NONCE_COOKIE] || '',
        creds, tenant: t.subdomain,
      });
    } catch (err) {
      req.log.error({ err, provider, tenant: t.subdomain }, 'integration callback failed');
      out = { result: 'error', reason: 'error' };
    }
    // Microsoft: po logowaniu administratora — przekierowanie na zgodę administratora (ciasteczko zostaje).
    if (out.result === 'next' && out.next) return reply.redirect(out.next);
    reply.clearCookie(NONCE_COOKIE, { path: '/', domain: `.${config.APP_DOMAIN}`, secure: isProd });
    if (out.result !== 'connected') {
      req.log.warn({ provider, tenant: t.subdomain, reason: out.reason, message: out.message }, 'integration connect failed');
    } else {
      const { logAccountEvent } = await import('../lib/account-audit.js');
      await logAccountEvent(db, { email: out.account || null, action: 'integration_connected', actor: `integration:${provider}`, detail: provider });
    }
    return reply.redirect(settingsReturnUrl(t.subdomain, provider, out.result === 'connected' ? 'connected' : 'error', out.reason));
  });
}
