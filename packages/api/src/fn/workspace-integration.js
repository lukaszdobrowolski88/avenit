// Ustawienia → Integracje → Google Workspace / Microsoft 365 (Faza 1: połączenie kościoła + katalog).
// POST /api/fn/workspace-integration { action, provider, ... }
//   status            — stan obu dostawców (bez tokenów i sekretów), ustawienia, historia synchronizacji
//   connect           — adres autoryzacji (Google / Microsoft) + ciasteczko wiążące przeglądarkę
//   disconnect        — usunięcie połączenia kościoła
//   save_settings     — ustawienia synchronizacji katalogu (włączenie automatu wymaga manage_users)
//   save_credentials  — własna aplikacja OAuth kościoła (tylko pełny administrator, sekret szyfrowany)
//   Faza 2 — kalendarz kościoła (calendarSync.js):
//   calendar_connect  — Google: połączenie konta administratora z zakresem kalendarza (church_calendar)
//   calendar_save     — skrzynka (Microsoft) / konto (Google), filtr modułów i typów, import, włączenie
//   calendar_remove   — wyłączenie (kalendarz u dostawcy zostaje)
//   calendar_sync     — pełne uzgodnienie teraz
//   Faza 3 — pliki z chmury (cloudFiles.js):
//   files_save        — włączenie / wyłączenie plików z chmury dla dostawcy; Google: klucz API i numer projektu Pickera
// Capability: action:settings:manage_integrations (FN_CAPABILITY) + kontrola w funkcji (access.js).
import { config, isProd } from '../config.js';
import { encryptPassword } from '../lib/mailcrypto.js';
import { roleIsAdmin, exceedsCaller } from '../lib/admin-guard.js';
import { logAccountEvent } from '../lib/account-audit.js';
import { integrationCaller } from '../integrations/access.js';
import {
  PROVIDERS, isProvider, integrationRedirectUri, integrationSecret, resolveIntegrationCreds, loadProviderSettings,
} from '../integrations/providers.js';
import { loadConnection, publicConnection, IntegrationError } from '../integrations/tokens.js';
import { startConnect, disconnect, NONCE_COOKIE, STATE_TTL_MS } from '../integrations/oauth.js';
import { loadFilesSettings, saveFilesSettings, googlePickerKeys } from '../integrations/cloudFiles.js';
import { loadDirectorySettings, saveDirectorySettings, effectiveAllowedDomains, syncHistory, parseDomains } from '../integrations/directory.js';
import {
  churchCalendarStatus, saveChurchCalendar, removeChurchCalendar, loadChurchTarget, syncTarget, calendarCtxFromRequest, publicTarget,
} from '../integrations/calendarSync.js';

export const name = 'workspace-integration';
export const isPublic = false;
export const capability = 'action:settings:manage_integrations';
export const rateLimit = { max: 60, timeWindow: '10 minutes' };

const SETTINGS_KEYS = ['enabled', 'allowed_domains', 'default_role', 'mode', 'on_disable', 'send_invite'];

// Pliki z chmury (Faza 3): stan dla administratora — klucz API Pickera nie jest sekretem (trafia do przeglądarek).
async function filesAdminStatus(db, provider, creds) {
  const settings = await loadFilesSettings(db, provider);
  if (provider !== 'google') return { enabled: settings.enabled };
  const keys = googlePickerKeys(settings, creds);
  return {
    enabled: settings.enabled,
    picker_api_key: settings.picker_api_key, picker_app_id: settings.picker_app_id,
    api_key_source: settings.picker_api_key ? 'tenant' : (config.GOOGLE_PICKER_API_KEY ? 'platform' : null),
    app_id_effective: keys.appId, ready: !!(keys.apiKey && keys.appId),
  };
}

async function providerStatus(db, provider, access) {
  const [creds, own, conn, settings] = await Promise.all([
    resolveIntegrationCreds(db, provider), loadProviderSettings(db, provider).catch(() => null),
    loadConnection(db, provider), loadDirectorySettings(db, provider),
  ]);
  const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [`sso_${provider}_enabled`]).catch(() => ({ rows: [] }));
  const effective = await effectiveAllowedDomains(db, settings, conn);
  return {
    provider,
    available: !!(creds.clientId && creds.clientSecret),
    creds_source: creds.source,
    own_client_id: own?.client_id || null,
    own_secret_set: !!own?.client_secret_enc,
    own_ms_tenant: own?.ms_tenant || null,
    redirect_uri: integrationRedirectUri(provider),
    sso_enabled: rows[0]?.value === 'on',
    connection: publicConnection(conn),
    settings,
    allowed_domains_effective: effective.domains,
    allowed_domains_source: effective.source,
    history: await syncHistory(db, provider, 10),
    calendar: await churchCalendarStatus(db, provider, access.caller?.id).catch(() => null),
    files: await filesAdminStatus(db, provider, creds),
    can_apply: !!access.canUsers,
    can_credentials: !!access.fullAdmin,
  };
}

export async function workspaceAction(req, access) {
  const db = req.db;
  const b = req.body || {};
  const action = String(b.action || 'status');
  const provider = String(b.provider || '');
  if (!access.canIntegrations) throw new IntegrationError('Integracjami zarządza osoba z uprawnieniem „Zarządzaj integracjami”.', { status: 403, code: 'forbidden' });
  if (action !== 'status' && !isProvider(provider)) throw new IntegrationError('Nieznany dostawca.', { status: 400 });
  const actor = access.caller?.email || null;

  if (action === 'status') {
    const out = {};
    for (const p of PROVIDERS) out[p] = await providerStatus(db, p, access);
    return { providers: out, purposes: ['directory', 'church_calendar', 'files'] };
  }

  if (action === 'connect') {
    const creds = await resolveIntegrationCreds(db, provider);
    const { url, nonce } = await startConnect(db, {
      provider, purpose: 'directory', tenant: req.tenant.subdomain, user: { id: access.caller.id, email: actor }, creds,
    });
    return { url, __cookie: nonce };
  }

  if (action === 'calendar_connect') {
    if (provider !== 'google') throw new IntegrationError('Kalendarz kościoła Microsoft 365 korzysta z połączenia organizacji (uprawnienie aplikacji).', { status: 400 });
    const creds = await resolveIntegrationCreds(db, provider);
    const { url, nonce } = await startConnect(db, {
      provider, purpose: 'church_calendar', tenant: req.tenant.subdomain, user: { id: access.caller.id, email: actor }, creds,
    });
    return { url, __cookie: nonce };
  }
  if (action === 'calendar_save') {
    const target = await saveChurchCalendar(db, provider, { ...(b.settings || {}), prefs: b.settings?.prefs }, access.caller);
    await logAccountEvent(db, { email: actor, action: 'integration_calendar', actor, detail: `${provider}:${target?.enabled ? 'on' : 'off'}` });
    return { success: true, target };
  }
  if (action === 'calendar_remove') {
    const removed = await removeChurchCalendar(db, provider);
    if (removed) await logAccountEvent(db, { email: actor, action: 'integration_calendar', actor, detail: `${provider}:removed` });
    return { success: true, removed };
  }
  if (action === 'calendar_sync') {
    const t = await loadChurchTarget(db, provider);
    if (!t) throw new IntegrationError('Kalendarz kościoła nie jest skonfigurowany.', { status: 409 });
    const result = await syncTarget(db, { ...t, backoff_until: null }, calendarCtxFromRequest(req), { forceFull: true, forcePull: true });
    return { success: !result.error, result, target: await publicTarget(db, await loadChurchTarget(db, provider)) };
  }

  if (action === 'files_save') {
    const files = await saveFilesSettings(db, provider, b.settings || {}, actor);
    await logAccountEvent(db, { email: actor, action: 'integration_files', actor, detail: `${provider}:${files.enabled ? 'on' : 'off'}` });
    return { success: true, files: await filesAdminStatus(db, provider, await resolveIntegrationCreds(db, provider)) };
  }

  if (action === 'disconnect') {
    const removed = await disconnect(db, provider);
    if (removed) await logAccountEvent(db, { email: actor, action: 'integration_disconnected', actor, detail: provider });
    return { success: true, removed };
  }

  if (action === 'save_settings') {
    const patch = {};
    for (const k of SETTINGS_KEYS) if (b.settings && k in b.settings) patch[k] = b.settings[k];
    if ('allowed_domains' in patch) patch.allowed_domains = parseDomains(patch.allowed_domains);
    const cur = await loadDirectorySettings(db, provider);
    // Automat zakłada / blokuje konta bez udziału człowieka — jak „Zastosuj”: także manage_users.
    const touchesAccounts = (patch.enabled === true && !cur.enabled)
      || (cur.enabled && ((patch.mode && patch.mode !== cur.mode) || (patch.on_disable && patch.on_disable !== cur.on_disable)));
    if (touchesAccounts && !access.canUsers) {
      throw new IntegrationError('Synchronizację automatyczną włącza osoba z uprawnieniem „Zarządzaj użytkownikami”.', { status: 403, code: 'forbidden' });
    }
    if (patch.enabled === true && !cur.first_applied_at) {
      throw new IntegrationError('Najpierw wykonaj podgląd i zastosuj synchronizację ręcznie.', { status: 409, code: 'preview_first' });
    }
    if ('default_role' in patch) {
      const role = String(patch.default_role || '').trim() || 'czlonek';
      if (await roleIsAdmin(db, role)) throw new IntegrationError('Rola administratora nie może być domyślną rolą kont z katalogu.', { status: 403 });
      if (!access.fullAdmin && await exceedsCaller(db, req.tenant.db_name, { role, userId: null }, access.caller)) {
        throw new IntegrationError('Nie możesz ustawić domyślnej roli z uprawnieniami, których sam nie masz.', { status: 403 });
      }
      const { rows } = await db.query(`SELECT 1 FROM app_roles WHERE key = $1`, [role]);
      if (!rows[0]) throw new IntegrationError('Nieznana rola.', { status: 400 });
      patch.default_role = role;
    }
    const settings = await saveDirectorySettings(db, provider, patch, actor);
    return { success: true, settings };
  }

  if (action === 'save_credentials') {
    if (!access.fullAdmin) throw new IntegrationError('Własną aplikację OAuth ustawia tylko administrator.', { status: 403, code: 'forbidden' });
    const clientId = String(b.client_id ?? '').trim().slice(0, 300);
    const secret = b.client_secret ? String(b.client_secret).trim().slice(0, 500) : '';
    const msTenant = provider === 'microsoft' ? String(b.ms_tenant ?? '').trim().slice(0, 100) : null;
    if (!clientId) {
      await db.query(
        `UPDATE workspace_integration_settings SET client_id = NULL, client_secret_enc = NULL, ms_tenant = NULL, updated_by = $2, updated_at = now() WHERE provider = $1`,
        [provider, actor]);
      return { success: true, cleared: true };
    }
    const enc = secret ? await encryptPassword(secret, integrationSecret()) : null;
    await db.query(
      `INSERT INTO workspace_integration_settings (provider, client_id, client_secret_enc, ms_tenant, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (provider) DO UPDATE SET client_id = $2, client_secret_enc = COALESCE($3, workspace_integration_settings.client_secret_enc),
         ms_tenant = $4, updated_by = $5, updated_at = now()`,
      [provider, clientId, enc, msTenant || null, actor]);
    return { success: true };
  }

  throw new IntegrationError('Nieznana akcja.', { status: 400 });
}

export default async function handler(req, reply) {
  try {
    const access = await integrationCaller(req.db, req.user.id, req.tenant.db_name);
    const out = await workspaceAction(req, access);
    if (out.__cookie) {
      // Nonce na domenie nadrzędnej — czytelny na centralnym callbacku app.<domena> (jak SSO).
      reply.setCookie(NONCE_COOKIE, out.__cookie, {
        httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', domain: `.${config.APP_DOMAIN}`, maxAge: Math.floor(STATE_TTL_MS / 1000),
      });
      delete out.__cookie;
    }
    return reply.send(out);
  } catch (e) {
    if (e instanceof IntegrationError) return reply.code(e.status || 400).send({ error: e.message, code: e.code });
    req.log.error({ err: e }, 'workspace-integration failed');
    return reply.code(500).send({ error: 'Błąd integracji.' });
  }
}
