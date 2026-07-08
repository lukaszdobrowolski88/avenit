// Składanie serwera Fastify: pluginy, konteksty, trasy.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import contextPlugin from './plugins/context.js';
import authRoutes from './auth/routes.js';
import dataApiRoutes from './dataapi/routes.js';
import storageRoutes from './storage/routes.js';
import { registerClient } from './realtime/hub.js';
import { verifyAccessToken, AUD_TENANT } from './auth/tokens.js';
import { config, isProd } from './config.js';

export async function buildServer() {
  const app = Fastify({
    logger: { level: isProd ? 'info' : 'debug' },
    trustProxy: true, // za Caddy
    bodyLimit: 50 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: true, // subdomeny tenantów + admin; Caddy i tak ogranicza hosty
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(websocket);

  // Surowe body dla uploadów spoza multipart (supabase-js wysyła plik jako body).
  // WAŻNE: tylko typy binarne — nie ruszamy domyślnego parsera application/json.
  const BINARY_TYPES = [
    'application/octet-stream', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'image/svg+xml', 'application/pdf', 'audio/mpeg', 'video/mp4', 'application/zip',
    'text/plain',
  ];
  for (const t of BINARY_TYPES) {
    app.addContentTypeParser(t, { parseAs: 'buffer' }, (req, body, done) => done(null, body));
  }
  // Formularze P24 (webhook może wysłać x-www-form-urlencoded).
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(body)));
    } catch (err) {
      done(err);
    }
  });

  await app.register(contextPlugin);

  app.get('/api/health', async () => ({ ok: true, service: 'avenit-api' }));

  // Kontrola on-demand TLS dla Caddy: zwraca 200 tylko dla znanych hostów
  // (admin/api/domena główna lub istniejący tenant), inaczej 403 — zapobiega
  // wystawianiu certyfikatów dla przypadkowych domen wskazujących na to IP.
  app.get('/api/internal/tls-check', async (req, reply) => {
    const domain = String(req.query.domain || '').toLowerCase();
    const base = config.APP_DOMAIN.toLowerCase();
    if (domain === base) return reply.code(200).send('ok');
    if (!domain.endsWith(`.${base}`)) return reply.code(403).send('no');
    const sub = domain.slice(0, -(base.length + 1));
    if (['admin', 'api', 'www', 'app'].includes(sub)) return reply.code(200).send('ok');
    const { resolveTenant } = await import('./db.js');
    const tenant = await resolveTenant(sub).catch(() => null);
    return tenant ? reply.code(200).send('ok') : reply.code(403).send('no');
  });

  await app.register(authRoutes);
  // Globalne logowanie z app.<domena> (bez kontekstu tenanta).
  const { default: appLoginRoutes } = await import('./auth/app-login.js');
  await app.register(appLoginRoutes);
  await app.register(dataApiRoutes);
  await app.register(storageRoutes);

  // Funkcje (port edge functions) — rejestrowane dynamicznie z katalogu fn/.
  const { registerFunctions } = await import('./fn/index.js');
  await registerFunctions(app);

  // Informacje o tenancie (plan, limity) dla aplikacji kościoła.
  const { default: tenantRoutes } = await import('./tenant/routes.js');
  await app.register(tenantRoutes);

  // Admin API (panel administracyjny platformy).
  const { default: adminRoutes } = await import('./admin/routes.js');
  await app.register(adminRoutes);

  // Odnowienie subskrypcji web push po pushsubscriptionchange (woła sw-push.js).
  // Publiczny — service worker nie ma tokenów; identyfikacja po starym endpoincie.
  app.post('/api/push/resubscribe', { preHandler: app.requireTenant }, async (req, reply) => {
    const { oldEndpoint, newSubscription } = req.body || {};
    if (!newSubscription?.endpoint) return reply.code(400).send({ error: 'Brak subskrypcji' });
    if (oldEndpoint) {
      await req.db.query(
        `UPDATE push_subscriptions
            SET endpoint = $1, subscription = $2, updated_at = now()
          WHERE endpoint = $3`,
        [newSubscription.endpoint, JSON.stringify(newSubscription), oldEndpoint]
      ).catch((err) => req.log.warn({ err }, 'push resubscribe update failed'));
    }
    return reply.send({ ok: true });
  });

  // Realtime WS: /api/realtime?token=<access_token>
  app.get('/api/realtime', { websocket: true }, async (socket, req) => {
    try {
      const url = new URL(req.url, 'http://x');
      const token = url.searchParams.get('token') || '';
      const payload = await verifyAccessToken(token, AUD_TENANT);
      const slug = req.headers['x-tenant'] || payload.ten;
      registerClient(socket, String(slug), payload.sub);
    } catch {
      socket.close(4401, 'unauthorized');
    }
  });

  return app;
}
