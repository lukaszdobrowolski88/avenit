// Rejestr funkcji (port edge functions z Supabase).
// Każdy moduł w tym katalogu eksportuje:
//   export const name = 'send-program-email';       // ścieżka: POST /api/fn/<name>
//   export const isPublic = false;                   // true => bez logowania (webhooki)
//   export const method = 'POST';                    // opcjonalnie GET (ical)
//   export default async function handler(req, reply) { ... }
// Funkcje cykliczne (worker) eksportują dodatkowo: export async function runForTenant(pool, ctx)

const MODULES = [
  'send-program-email',
  'send-assignment-email',
  'send-form-email',
  'send-mailing-campaign',
  'send-mail',
  'sync-mail',
  'test-smtp',
  'encrypt-credentials',
  'send-push',
  'push-campaign-dispatch',
  'push-campaign-receipts',
  'push-action-handler',
  'push-event-track',
  'send-sms',
  'sms-campaign-dispatch',
  'sms-campaign-receipts',
  'sms-incoming-webhook',
  'przelewy24-create-payment',
  'przelewy24-webhook',
  'process-dunning',
  'ical',
];

export async function registerFunctions(app) {
  for (const modName of MODULES) {
    let mod;
    try {
      mod = await import(`./${modName}.js`);
    } catch (err) {
      app.log.warn(`[fn] pominięto ${modName}: ${err.message}`);
      continue;
    }
    if (mod.skipRoute) continue; // np. process-dunning: worker/admin only
    const name = mod.name || modName;
    const method = (mod.method || 'POST').toLowerCase();
    const preHandler = mod.isPublic ? app.requireTenant : app.requireUser;
    // routePath pozwala funkcji nadpisać ścieżkę (np. ical z tokenem w URL).
    const route = mod.routePath || `/api/fn/${name}`;
    app[method](route, { preHandler }, mod.default);
    if (mod.routePath && mod.routePathAlias) {
      app[method](mod.routePathAlias, { preHandler }, mod.default);
    }
  }
}
