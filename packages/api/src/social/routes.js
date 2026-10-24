// Social Media — trasy bez sesji Avenit (host app.<domena>, jeden adres dla wszystkich kościołów):
//   GET  /api/social/oauth/meta/callback  — powrót z logowania Meta (kościół z podpisanego `state`)
//   POST /api/social/meta/data-deletion   — żądanie usunięcia danych (wymóg Meta, signed_request)
//   POST /api/social/meta/deauthorize     — cofnięcie autoryzacji aplikacji przez osobę
//   GET  /api/social/meta/deletion        — strona statusu usunięcia (adres z odpowiedzi powyżej)
import crypto from 'node:crypto';
import { config, isProd } from '../config.js';
import { platformPool, getTenantPool } from '../db.js';
import { verifySocialState, handleMetaCallback, removeAccountsOfMetaUser, NONCE_COOKIE } from './accounts.js';
import { parseSignedRequest } from './meta.js';

export function socialReturnUrl(subdomain, result, { reason, added } = {}) {
  const q = new URLSearchParams({ tab: 'channels', sm_result: result });
  if (reason) q.set('sm_reason', String(reason).slice(0, 60));
  if (added) q.set('sm_added', String(added));
  return `https://${subdomain}.${config.APP_DOMAIN}/social?${q}`;
}

// Usunięcie kanałów osoby Meta we wszystkich kościołach (id osoby jest per aplikacja).
async function removeEverywhere(fbUserId, log) {
  const { rows } = await platformPool.query(`SELECT slug, db_name FROM tenants WHERE status IN ('trial', 'active', 'suspended')`);
  let removed = 0;
  for (const t of rows) {
    try { removed += await removeAccountsOfMetaUser(getTenantPool(t.db_name), fbUserId); }
    catch (err) { if (err?.code !== '42P01') log?.warn?.({ err, tenant: t.slug }, 'social: usuwanie danych Meta'); }
  }
  return removed;
}

export default async function socialRoutes(app) {
  app.get('/api/social/oauth/meta/callback', {
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const fallback = `https://app.${config.APP_DOMAIN}/login`;
    const parsed = verifySocialState(String(req.query?.state || ''));
    if (!parsed || parsed.provider !== 'meta') return reply.redirect(fallback);
    const { rows } = await platformPool.query(
      `SELECT subdomain, db_name, status FROM tenants WHERE subdomain = $1 OR slug = $1 LIMIT 1`, [parsed.tenant]);
    const t = rows[0];
    if (!t || t.status === 'suspended' || t.status === 'cancelled') return reply.redirect(fallback);
    const db = getTenantPool(t.db_name);
    let out;
    try {
      out = await handleMetaCallback(db, { stateId: parsed.stateId, query: req.query || {}, nonceCookie: req.cookies?.[NONCE_COOKIE] || '' });
    } catch (err) {
      req.log.error({ err, tenant: t.subdomain }, 'social callback failed');
      out = { result: 'error', reason: 'error' };
    }
    reply.clearCookie(NONCE_COOKIE, { path: '/', domain: `.${config.APP_DOMAIN}`, secure: isProd });
    if (out.result !== 'connected') {
      req.log.warn({ tenant: t.subdomain, reason: out.reason, message: out.message }, 'social connect failed');
    } else {
      const { logAccountEvent } = await import('../lib/account-audit.js');
      await logAccountEvent(db, { email: out.account || null, action: 'integration_connected', actor: 'integration:meta', detail: `social:+${out.added}/~${out.updated}` });
    }
    return reply.redirect(socialReturnUrl(t.subdomain, out.result === 'connected' ? 'connected' : 'error', { reason: out.reason, added: out.added }));
  });

  const deletion = async (req, reply, { status }) => {
    const data = parseSignedRequest(req.body?.signed_request);
    if (!data?.user_id) return reply.code(400).send({ error: 'invalid signed_request' });
    await removeEverywhere(data.user_id, req.log);
    if (!status) return reply.send({ success: true });
    const code = crypto.randomBytes(8).toString('hex');
    return reply.send({ url: `https://app.${config.APP_DOMAIN}/api/social/meta/deletion?code=${code}`, confirmation_code: code });
  };
  app.post('/api/social/meta/data-deletion', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    (req, reply) => deletion(req, reply, { status: true }));
  app.post('/api/social/meta/deauthorize', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    (req, reply) => deletion(req, reply, { status: false }));

  // Usuwamy od razu przy żądaniu — strona tylko to potwierdza.
  app.get('/api/social/meta/deletion', async (req, reply) => {
    const code = String(req.query?.code || '').replace(/[^a-f0-9]/g, '').slice(0, 32);
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avenit — usunięcie danych</title></head>`
      + `<body style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#222">`
      + `<h1 style="font-size:22px">Dane zostały usunięte</h1>`
      + `<p>Połączenia stron Facebooka i kont Instagram autoryzowane przez Ciebie w Avenit zostały usunięte wraz z tokenami dostępu.</p>`
      + (code ? `<p>Kod potwierdzenia: <code>${code}</code></p>` : '')
      + `<p>Pytania: <a href="mailto:lukasz@avenit.pl">lukasz@avenit.pl</a></p></body></html>`;
  });
}
