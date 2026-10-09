// POST /api/calls/livekit-webhook — zdarzenia LiveKit (participant_joined/left, room_finished).
// Publiczny (LiveKit woła http://api:3001 z sieci compose), ale każde żądanie musi mieć ważny
// podpis: nagłówek Authorization = JWT podpisany sekretem API z sha256 SUROWEGO body
// (WebhookReceiver). Tenant z nazwy pokoju (avn_<slug>_<uuid>); nieznany pokój — 200 i nic.
// Parser body tylko w tym (enkapsulowanym) pluginie: surowy tekst zamiast JSON — podpis liczony
// jest z bajtów, a LiveKit wysyła Content-Type application/webhook+json.
import { getTenantPool, resolveTenant } from '../db.js';
import { parseRoomName } from './logic.js';
import { callDeps, handleLivekitEvent } from './service.js';
import { CALLS_DISABLED } from './livekit.js';

export const WEBHOOK_PATH = '/api/calls/livekit-webhook';

// deps (testy): { livekit, resolveTenant, getTenantPool, serviceDeps }
export function buildCallsRoutes(deps = {}) {
  return async function callsRoutes(app) {
    app.removeContentTypeParser(['application/json']);
    app.addContentTypeParser(
      ['application/json', 'application/webhook+json'],
      { parseAs: 'string', bodyLimit: 1024 * 1024 },
      (req, body, done) => done(null, body),
    );

    app.post(WEBHOOK_PATH, async (req, reply) => {
      const base = callDeps(deps.serviceDeps || {});
      const livekit = deps.livekit || base.livekit;
      if (!livekit?.enabled) return reply.code(503).send(CALLS_DISABLED);

      let event;
      try {
        const raw = typeof req.body === 'string' ? req.body : '';
        event = await livekit.receiveWebhook(raw, req.headers.authorization);
      } catch {
        return reply.code(401).send({ error: 'Nieprawidłowy podpis webhooka' });
      }

      const parsed = parseRoomName(event?.room?.name);
      if (!parsed) return reply.send({ ok: true, ignored: 'foreign_room' });
      const tenant = await (deps.resolveTenant || resolveTenant)(parsed.tenantSlug).catch(() => null);
      if (!tenant) return reply.send({ ok: true, ignored: 'unknown_tenant' });
      const db = (deps.getTenantPool || getTenantPool)(tenant.db_name);
      const ctx = { db, tenantSlug: tenant.slug, log: req.log, deps: { ...base, livekit } };
      try {
        const result = await handleLivekitEvent(ctx, event);
        return reply.send({ ok: true, ...result });
      } catch (err) {
        // 5xx → LiveKit ponowi; przejścia stanu są idempotentne.
        req.log.error({ err, event: event?.event }, 'calls: webhook');
        return reply.code(500).send({ error: 'Błąd obsługi webhooka' });
      }
    });
  };
}

export default buildCallsRoutes();
