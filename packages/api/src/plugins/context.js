// Kontekst żądania: rozpoznanie tenanta (subdomena lub nagłówek X-Tenant)
// oraz uwierzytelnienie JWT. Dekorruje request o: tenant, db, user.
import fp from 'fastify-plugin';
import { getTenantPool, resolveTenant } from '../db.js';
import { verifyAccessToken, AUD_TENANT, AUD_ADMIN } from '../auth/tokens.js';
import { config } from '../config.js';

// Subdomena z Host: "schwro.avenit.pl" -> "schwro"; "admin."/"api." to nie tenanci.
const RESERVED_SUBDOMAINS = new Set(['admin', 'api', 'www']);

export function tenantSlugFromHost(host) {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  const domain = config.APP_DOMAIN.toLowerCase();
  if (hostname === domain) return null;
  if (!hostname.endsWith(`.${domain}`)) return null;
  const sub = hostname.slice(0, -(domain.length + 1));
  if (!sub || sub.includes('.') || RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

export default fp(async function contextPlugin(app) {
  app.decorateRequest('tenant', null);
  app.decorateRequest('db', null);
  app.decorateRequest('user', null);
  app.decorateRequest('admin', null);

  app.addHook('onRequest', async (req) => {
    const slug = req.headers['x-tenant'] || tenantSlugFromHost(req.headers.host);
    if (slug) {
      const tenant = await resolveTenant(String(slug));
      if (tenant) {
        req.tenant = tenant;
        req.db = getTenantPool(tenant.db_name);
      }
    }
  });

  // Wymaga tenanta (404 jeśli subdomena nie istnieje).
  app.decorate('requireTenant', async (req, reply) => {
    if (!req.tenant) {
      return reply.code(404).send({ error: 'Nieznany tenant' });
    }
    // Zawieszony/anulowany tenant: 402 — frontend pokazuje ekran "subskrypcja nieaktywna".
    // Logowanie nadal działa (admin kościoła musi zobaczyć komunikat po zalogowaniu).
    const t = req.tenant;
    const trialExpired =
      t.status === 'trial' && t.trial_ends_at && new Date(t.trial_ends_at) < new Date();
    if (t.status === 'suspended' || t.status === 'cancelled' || trialExpired) {
      req.tenantBlocked = true;
    }
  });

  app.decorate('requireTenantActive', async (req, reply) => {
    await app.requireTenant(req, reply);
    if (reply.sent) return;
    if (req.tenantBlocked) {
      return reply.code(402).send({
        error: 'Subskrypcja nieaktywna',
        status: req.tenant.status,
      });
    }
  });

  // Uwierzytelnienie użytkownika tenanta (Bearer lub cookie).
  app.decorate('requireUser', async (req, reply) => {
    await app.requireTenantActive(req, reply);
    if (reply.sent) return;
    const token = bearerOrCookie(req, 'avenit_at');
    if (!token) return reply.code(401).send({ error: 'Brak autoryzacji' });
    try {
      const payload = await verifyAccessToken(token, AUD_TENANT);
      if (payload.ten !== req.tenant.slug && payload.ten !== req.tenant.subdomain) {
        return reply.code(401).send({ error: 'Token nie pasuje do tenanta' });
      }
      // legacyId (auid) — identyfikator zgodny z danymi z czasów GoTrue.
      req.user = { id: payload.sub, legacyId: payload.auid || payload.sub, role: payload.role, email: payload.email };
    } catch {
      return reply.code(401).send({ error: 'Nieprawidłowy lub wygasły token' });
    }
  });

  // Uwierzytelnienie admina platformy.
  app.decorate('requireAdmin', async (req, reply) => {
    const token = bearerOrCookie(req, 'avenit_admin_at');
    if (!token) return reply.code(401).send({ error: 'Brak autoryzacji' });
    try {
      const payload = await verifyAccessToken(token, AUD_ADMIN);
      req.admin = { id: payload.sub, email: payload.email };
    } catch {
      return reply.code(401).send({ error: 'Nieprawidłowy lub wygasły token' });
    }
  });
});

function bearerOrCookie(req, cookieName) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies?.[cookieName] || null;
}
