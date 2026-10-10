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
  'giving-create-payment',
  'my-giving',
  'giving-campaigns',
  'my-invitations',
  'my-home-groups',
  'my-permissions',
  'web-ticket',
  'home-groups-map',
  'my-blockouts',
  'ministry-roster',
  'team-availability',
  'my-shared-materials',
  'program-songs-preview',
  'prayer-wall',
  'campaign-progress',
  'automation-run',
  'rsvp-send',
  'rsvp-respond',
  'process-dunning',
  'ical',
  'ai-assist',
  'send-assignment-invites',
  'board-form-get',
  'board-form-submit',
  // Zadania: import/uzupełnienie starych tabel *_tasks na Tablice + „przypisane mi” w Kalendarzu.
  // Uprawnienie modułu sprawdzane w funkcji (zależy od źródła), więc bez wpisu w FN_CAPABILITY.
  'board-import-legacy',
  'my-board-items',
  // Elementy tablic po stronie serwera: scalanie komórek pod blokadą, kolejność jednym zapytaniem,
  // komentarze z autorem z sesji i @wzmiankami. Dostęp jak /api/db (board_items / board_item_updates
  // + prywatne tablice + zakres służby) — liczony w funkcji, bez wpisu w FN_CAPABILITY.
  'board-item-patch',
  'board-items-reorder',
  'board-comment',
  'public-form-get',
  'public-form-submit',
  'admin-set-user-password',
  'approve-user',
  'admin-create-user',
  'reject-user',
  'resend-verification',
  'account-events',
  'admin-update-user',
  'set-user-status',
  'delete-user',
  'admin-reset-2fa',
  'force-logout-user',
  'resend-invite',
  'unlock-login',
  'sso-save-config',
  'finance-report-email',
  'budget-proposal-notify',
  'event-assignments-patch',
  'mailing-unsubscribe',
  'song-tags',
  'push-test',
  // Komunikator+ (K2/K3/K8/K9)
  'link-preview',
  'translate-message',
  'chat-policy',
  'chat-channels-sync',
  'content-report',
  'moderate-content',
  'community-terms',
  'delete-my-account',
  // Połączenia audio/wideo (LiveKit) — capability module:komunikator z eksportu `capability`
  // modułu; uczestnictwo w rozmowie, posting_policy i reguły 1:1 sprawdza src/calls/service.js.
  'call-start',
  'call-join',
  'call-decline',
  'call-cancel',
  'call-leave',
  'call-config',
  // Goście z linku (migracja 097, src/calls/guests.js): linki i poczekalnia — z sesją
  // (module:komunikator); strona gościa /rozmowa/<token> — publiczne z limitem per IP.
  'call-link-create',
  'call-link-list',
  'call-link-revoke',
  'call-guest-admit',
  'call-guest-deny',
  'call-guest-info',
  'call-guest-request',
  'call-guest-status',
  'call-guest-leave',
  // Spotkania online z zaproszeniami (migracja 098, src/meetings): członkowie po koncie, goście po
  // e-mailu (osobisty link); meeting-guest-rsvp publiczne (strona gościa) z limitem per IP.
  'meeting-create',
  'meeting-update',
  'meeting-cancel',
  'meeting-respond',
  'meeting-get',
  'meeting-list',
  'meeting-ics',
  'meeting-guest-rsvp',
  // Wydarzenia online/hybrydowe (099): stan spotkania wydarzenia i „Dołącz” wg widoczności wydarzenia.
  'event-meeting',
];

export async function registerFunctions(app) {
  const { FN_CAPABILITY } = await import('@avenit/shared/src/permissions/catalog.js');
  const { requireCapability } = await import('../dataapi/registry.js');
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
    // Akcje użytkownika egzekwują capability (webhooki/publiczne bez zmian). Moduł może podać
    // własne `capability`, gdy nie ma wpisu we wspólnym FN_CAPABILITY (wpis w katalogu wygrywa).
    const cap = !mod.isPublic ? (FN_CAPABILITY[name] || mod.capability || null) : null;
    const preHandler = mod.isPublic
      ? app.requireTenant
      : (cap ? [app.requireUser, app.block2FAPending, requireCapability(cap)] : [app.requireUser, app.block2FAPending]);
    // routePath pozwala funkcji nadpisać ścieżkę (np. ical z tokenem w URL).
    const route = mod.routePath || `/api/fn/${name}`;
    // rateLimit (publiczne formularze) — limit per IP, jak przy rejestracji/logowaniu.
    const routeOpts = { preHandler, ...(mod.rateLimit ? { config: { rateLimit: mod.rateLimit } } : {}) };
    // methods: kilka metod pod tą samą ścieżką (np. wypis z mailingu: GET strona, POST jednym kliknięciem).
    const methods = Array.isArray(mod.methods) && mod.methods.length ? mod.methods.map((m) => m.toLowerCase()) : [method];
    for (const m of methods) app[m](route, routeOpts, mod.default);
    if (mod.routePath && mod.routePathAlias) {
      app[method](mod.routePathAlias, routeOpts, mod.default);
    }
  }
}
