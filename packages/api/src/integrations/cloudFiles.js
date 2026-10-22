// Faza 3 — pliki z Dysku Google i OneDrive / SharePoint BEZ kopiowania (migracja 120).
//
// Model:
//   • osoba łączy WŁASNE konto (połączenie scope_kind 'user', cel OAuth 'files' — zgoda przyrostowa,
//     to samo połączenie co kalendarz): Google drive.file, Microsoft delegowane Files.Read.All;
//   • wybór pliku w przeglądarce: Google Picker (token dostępu osoby + klucz API + numer projektu)
//     albo OneDrive/SharePoint File Picker v8 (okno Microsoftu prosi o tokeny dla zasobu SharePoint —
//     wydaje je serwer, msDelegatedToken). Do przeglądarki trafiają WYŁĄCZNIE krótko ważne tokeny
//     dostępu osoby, nigdy refresh token;
//   • po wyborze serwer pobiera AUTORYTATYWNE metadane od dostawcy (nazwa, typ, rozmiar, adres
//     „Otwórz w …”) i zwraca znormalizowany odnośnik (@avenit/shared/src/lib/cloudFiles.js);
//   • zapis odnośnika: materials_files (external_*) albo messages.attachments — walidacja w /api/db
//     (enforceCloudLinks): biała lista dostawców i hostów https, autor = osoba z sesji, wyłączenie
//     dostawcy przez kościół;
//   • Avenit NIE pobiera treści pliku ani nie zmienia uprawnień u dostawcy — wyjątek: jawna opcja
//     „Udostępnij osobom z linkiem w mojej organizacji” (Google: uprawnienie typu domain, reader;
//     nigdy „anyone”). Microsoft: createLink wymaga Files.ReadWrite — pomijamy, tylko komunikat.
import { config } from '../config.js';
import {
  GOOGLE, MICROSOFT, GOOGLE_DRIVE_BASE, GOOGLE_SCOPES, isProvider, resolveIntegrationCreds, connHasFilesScope, connHasCalendarScope,
} from './providers.js';
import {
  loadConnection, getAccessToken, apiGetJson, msDelegatedToken, decryptToken, IntegrationError, describeOAuthError,
} from './tokens.js';
import {
  normalizeCloudAttachment, cloudProviderFromUrl, isSharePointHost, isCloudProvider, isCloudAttachment, integrationProviderOf,
  cloudMessageAttachment, googleAppIdFromClientId, CLOUD_LINK_TYPE,
} from '@avenit/shared/src/lib/cloudFiles.js';

export const MAX_PICK = 10;
const lower = (v) => String(v ?? '').trim().toLowerCase();

// ── Ustawienia kościoła (workspace_integration_settings.files) ──────────────────────────────────
const FILES_KEYS = { google: ['enabled', 'picker_api_key', 'picker_app_id'], microsoft: ['enabled'] };

export async function loadFilesSettings(db, provider) {
  let files = {};
  try {
    const { rows } = await db.query(
      `SELECT to_jsonb(s)->'files' AS files FROM workspace_integration_settings s WHERE provider = $1`, [provider]);
    files = rows[0]?.files && typeof rows[0].files === 'object' ? rows[0].files : {};
  } catch { files = {}; }
  return {
    enabled: files.enabled !== false, // domyślnie włączone (gdy integracja ma aplikację OAuth)
    ...(provider === 'google' ? { picker_api_key: files.picker_api_key || null, picker_app_id: files.picker_app_id || null } : {}),
  };
}

export async function saveFilesSettings(db, provider, patch, actor) {
  const cur = await loadFilesSettings(db, provider);
  const next = { ...cur };
  for (const k of FILES_KEYS[provider] || []) {
    if (!(k in (patch || {}))) continue;
    if (k === 'enabled') next.enabled = patch.enabled !== false;
    else {
      const v = String(patch[k] ?? '').trim();
      if (k === 'picker_api_key' && v && !/^[A-Za-z0-9_-]{20,100}$/.test(v)) throw new IntegrationError('Nieprawidłowy klucz API Google.', { status: 400 });
      if (k === 'picker_app_id' && v && !/^\d{6,20}$/.test(v)) throw new IntegrationError('Numer projektu Google to same cyfry.', { status: 400 });
      next[k] = v || null;
    }
  }
  await db.query(
    `INSERT INTO workspace_integration_settings (provider, files, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (provider) DO UPDATE SET files = $2::jsonb, updated_by = $3, updated_at = now()`,
    [provider, JSON.stringify(next), actor || null]);
  return next;
}

export async function filesEnabled(db, provider) {
  return (await loadFilesSettings(db, provider)).enabled;
}

// Google Picker: klucz API przeglądarki (kościoła → platformy) i numer projektu (kościoła → z klienta
// OAuth → platformy). Klucz API nie jest sekretem (trafia do każdej przeglądarki) — ograniczenie
// do odwołań HTTP *.avenit.pl i samego Picker API ustawia się w Google Cloud.
export function googlePickerKeys(settings, creds) {
  const apiKey = settings?.picker_api_key || config.GOOGLE_PICKER_API_KEY || null;
  const appId = settings?.picker_app_id || googleAppIdFromClientId(creds?.clientId) || config.GOOGLE_PICKER_APP_ID || null;
  return { apiKey, appId };
}

// ── Stan dla osoby (Mój profil, przycisk wyboru) ─────────────────────────────────────────────────
export async function filesStatus(db, userId) {
  const out = {};
  for (const provider of ['google', 'microsoft']) {
    const [creds, settings, conn] = await Promise.all([
      resolveIntegrationCreds(db, provider), loadFilesSettings(db, provider),
      loadConnection(db, provider, { scopeKind: 'user', userId }).catch(() => null),
    ]);
    const connected = !!conn && connHasFilesScope(conn);
    const keys = provider === 'google' ? googlePickerKeys(settings, creds) : null;
    out[provider] = {
      enabled: settings.enabled,
      available: !!(creds.clientId && creds.clientSecret) && (provider !== 'google' || !!(keys.apiKey && keys.appId)),
      connected,
      status: connected ? conn.status : null,
      account_email: connected ? conn.account_email || null : null,
      last_error: connected && conn.status !== 'active' ? conn.last_error || null : null,
      // Udostępnienie organizacji: tylko konto Google Workspace (domena hd).
      can_share_domain: provider === 'google' && connected && !!conn.external_tenant,
      domain: provider === 'google' && connected ? conn.external_tenant || null : null,
    };
  }
  return out;
}

async function filesConn(db, userId, provider) {
  if (!isProvider(provider)) throw new IntegrationError('Nieznany dostawca.', { status: 400 });
  if (!(await filesEnabled(db, provider))) {
    throw new IntegrationError('Pliki z tej usługi są wyłączone przez administratora kościoła.', { status: 403, code: 'files_disabled' });
  }
  const conn = await loadConnection(db, provider, { scopeKind: 'user', userId });
  if (!conn || !connHasFilesScope(conn)) {
    throw new IntegrationError('Najpierw połącz swoje konto, aby wybierać pliki.', { status: 409, code: 'not_connected' });
  }
  if (conn.status === 'revoked') throw new IntegrationError('Połączenie zostało cofnięte — połącz ponownie.', { status: 409, code: 'revoked' });
  return conn;
}

// Zasób SharePoint/Graph, o który prosi File Picker v8 → zakres tokenu albo null (odmowa).
export function pickerResourceScope(resource) {
  let u;
  try { u = new URL(String(resource || '')); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase();
  if (isSharePointHost(host)) return `https://${host}/.default`;
  // Część widoków Pickera (np. „Udostępnione”) korzysta z Graph — tylko odczyt plików.
  if (host === 'graph.microsoft.com') return 'https://graph.microsoft.com/Files.Read.All';
  return null;
}

// Sesja wyboru: Google — token + klucze Pickera; Microsoft — adres OneDrive osoby + token dla niego.
export async function pickerSession(db, userId, provider) {
  const conn = await filesConn(db, userId, provider);
  if (provider === 'google') {
    const creds = await resolveIntegrationCreds(db, 'google');
    const { apiKey, appId } = googlePickerKeys(await loadFilesSettings(db, 'google'), creds);
    if (!apiKey || !appId) {
      throw new IntegrationError('Wybór plików z Dysku Google nie jest skonfigurowany (brak klucza API Google Picker).', { status: 503, code: 'not_configured' });
    }
    const accessToken = await getAccessToken(db, conn, { creds });
    return { provider, access_token: accessToken, expires_at: conn.expires_at ? new Date(conn.expires_at).toISOString() : null, api_key: apiKey, app_id: appId };
  }
  // OneDrive dla firm: https://<organizacja>-my.sharepoint.com (z /me/drive).
  const drive = await apiGetJson(db, conn, `${MICROSOFT.graphBase}/me/drive?$select=webUrl,driveType`);
  let base = null;
  try { base = new URL(String(drive.webUrl || '')).origin; } catch { base = null; }
  if (!base || !pickerResourceScope(base) || base.includes('graph.microsoft.com')) {
    throw new IntegrationError('Nie znaleziono OneDrive dla tego konta (wymagane konto służbowe lub szkolne Microsoft 365).', { status: 409, code: 'no_drive' });
  }
  const tok = await msDelegatedToken(db, conn, pickerResourceScope(base));
  return { provider, base_url: base, access_token: tok.accessToken, expires_at: tok.expiresAt };
}

export async function pickerToken(db, userId, provider, resource) {
  if (provider !== 'microsoft') throw new IntegrationError('Tokeny dla zasobu wydajemy tylko dla OneDrive / SharePoint.', { status: 400 });
  const scope = pickerResourceScope(resource);
  if (!scope) throw new IntegrationError('Niedozwolony zasób tokenu.', { status: 400, code: 'bad_resource' });
  const conn = await filesConn(db, userId, provider);
  const tok = await msDelegatedToken(db, conn, scope);
  return { access_token: tok.accessToken, expires_at: tok.expiresAt };
}

// ── Metadane wybranych plików od dostawcy ────────────────────────────────────────────────────────
const ITEM_ID = /^[A-Za-z0-9!_.\-:,=]{1,200}$/;

export async function resolvePicked(db, user, provider, items) {
  const conn = await filesConn(db, user.id, provider);
  const list = (Array.isArray(items) ? items : []).slice(0, MAX_PICK + 1);
  if (!list.length) throw new IntegrationError('Nie wybrano plików.', { status: 400 });
  if (list.length > MAX_PICK) throw new IntegrationError(`Najwyżej ${MAX_PICK} plików naraz.`, { status: 400 });
  const now = new Date();
  const attachments = [];
  const failed = [];
  for (const it of list) {
    const fileId = String(it?.file_id ?? it?.id ?? '');
    const driveId = it?.drive_id != null ? String(it.drive_id) : null;
    if (!ITEM_ID.test(fileId) || (driveId && !ITEM_ID.test(driveId))) { failed.push({ file_id: fileId.slice(0, 80), error: 'Nieprawidłowy identyfikator.' }); continue; }
    try {
      let raw;
      if (provider === 'google') {
        const f = await apiGetJson(db, conn,
          `${GOOGLE_DRIVE_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,iconLink,driveId&supportsAllDrives=true`);
        raw = { provider: 'google_drive', file_id: f.id || fileId, drive_id: f.driveId || null, name: f.name, mime_type: f.mimeType, size: f.size, web_url: f.webViewLink, icon_url: f.iconLink };
      } else {
        if (!driveId) throw new IntegrationError('Brak identyfikatora dysku.', { status: 400 });
        const f = await apiGetJson(db, conn,
          `${MICROSOFT.graphBase}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(fileId)}?$select=id,name,size,webUrl,file,folder,parentReference`);
        if (f.folder) throw new IntegrationError('Foldery nie są obsługiwane — wybierz plik.', { status: 400 });
        raw = {
          provider: cloudProviderFromUrl(f.webUrl) || 'sharepoint', file_id: f.id || fileId, drive_id: f.parentReference?.driveId || driveId,
          name: f.name, mime_type: f.file?.mimeType, size: f.size, web_url: f.webUrl,
        };
      }
      const n = normalizeCloudAttachment(raw, { pickedBy: user.email, now });
      if (!n.ok) throw new IntegrationError(n.error, { status: 400 });
      attachments.push(n.value);
    } catch (e) {
      failed.push({ file_id: fileId, error: e instanceof IntegrationError ? e.message : 'Nie udało się odczytać pliku.' });
    }
  }
  return { attachments, failed };
}

// ── Udostępnienie organizacji (Google: uprawnienie typu domain, tylko do odczytu) ────────────────
export async function shareWithOrganization(db, user, provider, fileIds) {
  if (provider !== 'google') {
    // Microsoft: createLink (scope=organization) wymaga Files.ReadWrite — świadomie nie prosimy o zapis.
    throw new IntegrationError('Automatyczne udostępnianie jest dostępne tylko dla Dysku Google. Udostępnij plik w OneDrive / SharePoint.', { status: 400, code: 'unsupported' });
  }
  const conn = await filesConn(db, user.id, provider);
  const domain = lower(conn.external_tenant);
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    throw new IntegrationError('Twoje konto Google nie należy do organizacji (Google Workspace) — udostępnij plik ręcznie.', { status: 409, code: 'no_domain' });
  }
  const ids = (Array.isArray(fileIds) ? fileIds : []).map(String).filter((id) => ITEM_ID.test(id)).slice(0, MAX_PICK);
  const shared = [];
  const failed = [];
  for (const id of ids) {
    let ok = false;
    let lastErr = null;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const token = await getAccessToken(db, conn, { force: attempt > 0 });
      const res = await globalThis.fetch(`${GOOGLE_DRIVE_BASE}/files/${encodeURIComponent(id)}/permissions?supportsAllDrives=true`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        // NIGDY type 'anyone' — tylko osoby z organizacji, które mają link (bez wyszukiwania pliku).
        body: JSON.stringify({ type: 'domain', role: 'reader', domain, allowFileDiscovery: false }),
      });
      if (res.status === 401 && attempt === 0) continue;
      if (res.ok) { ok = true; break; }
      const body = await res.json().catch(() => ({}));
      lastErr = res.status === 403
        ? 'Brak prawa do udostępniania tego pliku (albo organizacja blokuje udostępnianie).'
        : `Google: ${describeOAuthError(body)}`;
      break;
    }
    if (ok) shared.push(id); else failed.push({ file_id: id, error: lastErr || 'Nie udało się udostępnić.' });
  }
  return { shared, failed, domain };
}

// ── Rozłączenie plików ───────────────────────────────────────────────────────────────────────────
const FILES_SCOPE_RE = /drive\.file|Files\.Read|Files\.ReadWrite/i;

export async function disconnectFiles(db, userId, provider) {
  const conn = await loadConnection(db, provider, { scopeKind: 'user', userId });
  if (!conn || !connHasFilesScope(conn)) return false;
  // To samo połączenie obsługuje kalendarz → tylko odbieramy cel „pliki” (bez unieważniania tokenu).
  const { rows } = await db.query(`SELECT 1 AS x FROM calendar_sync_targets WHERE connection_id = $1 LIMIT 1`, [conn.id]).catch(() => ({ rows: [] }));
  if (rows[0] || connHasCalendarScope(conn)) {
    const scopes = (conn.scopes || []).filter((s) => !FILES_SCOPE_RE.test(String(s)));
    await db.query(`UPDATE integration_connections SET scopes = $2::text[], updated_at = now() WHERE id = $1`, [conn.id, scopes]);
    return true;
  }
  if (provider === 'google' && conn.refresh_token_enc) {
    try {
      const token = await decryptToken(conn.refresh_token_enc);
      await globalThis.fetch(`${GOOGLE.revokeUrl}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
    } catch { /* best-effort */ }
  }
  await db.query(`DELETE FROM integration_connections WHERE id = $1`, [conn.id]);
  return true;
}

// ── Walidacja zapisu przez /api/db (materials_files, messages) ───────────────────────────────────
export const EXTERNAL_COLS = ['external_provider', 'external_id', 'external_drive_id', 'external_url'];
const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);

// Adres zwykłego załącznika: ścieżka względna (/storage/…) albo http(s) — nigdy javascript:/data:.
export function safeAttachmentUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return false;
  if (s.startsWith('/') && !s.startsWith('//') && !/[\u0000-\u001f]/.test(s)) return true;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

export async function enforceCloudLinks(q, req, { enabled = filesEnabled } = {}) {
  if (!['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  const me = req.user?.email || null;
  const enabledCache = new Map();
  const assertEnabled = async (cloudProvider) => {
    const ip = integrationProviderOf(cloudProvider);
    if (!enabledCache.has(ip)) enabledCache.set(ip, await enabled(req.db, ip).catch(() => true));
    if (!enabledCache.get(ip)) throw new IntegrationError('Pliki z tej usługi są wyłączone przez administratora kościoła.', { status: 403, code: 'files_disabled' });
  };

  if (q.table === 'materials_files') {
    for (const r of rowsOf(q)) {
      if (!EXTERNAL_COLS.some((c) => c in r)) continue;
      if (q.op === 'update') {
        // Odnośnik ustala serwer przy dodaniu (autorytatywne metadane) — nie podmienisz adresu w istniejącym pliku.
        throw new IntegrationError('Odnośnika do pliku w chmurze nie można zmienić — dodaj plik ponownie.', { status: 403, code: 'cloud_link_immutable' });
      }
      if (EXTERNAL_COLS.every((c) => r[c] == null)) { for (const c of EXTERNAL_COLS) delete r[c]; continue; }
      if (r.storage_path) throw new IntegrationError('Odnośnik do pliku w chmurze nie może mieć pliku w magazynie.', { status: 400 });
      const n = normalizeCloudAttachment({
        provider: r.external_provider, file_id: r.external_id, drive_id: r.external_drive_id, web_url: r.external_url,
        name: r.name, mime_type: r.mime_type, size: r.file_size,
      }, { pickedBy: me });
      if (!n.ok) throw new IntegrationError(n.error, { status: 400, code: 'bad_cloud_link' });
      await assertEnabled(n.value.provider);
      Object.assign(r, {
        external_provider: n.value.provider, external_id: n.value.file_id, external_drive_id: n.value.drive_id, external_url: n.value.web_url,
        name: n.value.name, mime_type: n.value.mime_type, file_size: n.value.size, storage_path: null,
      });
      if (me) r.uploaded_by = me; // autor odnośnika = osoba z sesji
    }
    return;
  }

  if (q.table === 'messages') {
    for (const r of rowsOf(q)) {
      if (!('attachments' in r) || r.attachments == null) continue;
      let list = r.attachments;
      if (typeof list === 'string') { try { list = JSON.parse(list); } catch { throw new IntegrationError('Nieprawidłowe załączniki.', { status: 400 }); } }
      if (!Array.isArray(list)) continue; // stare {} — bez zmian
      let cloud = 0;
      const out = [];
      for (const a of list) {
        if (!a || typeof a !== 'object') continue;
        const looksCloud = a.kind === 'cloud' || a.type === CLOUD_LINK_TYPE || (a.provider != null && a.file_id != null);
        if (looksCloud) {
          if (++cloud > MAX_PICK) throw new IntegrationError(`Najwyżej ${MAX_PICK} plików z chmury w wiadomości.`, { status: 400 });
          const n = normalizeCloudAttachment(a, q.op === 'update' ? {} : { pickedBy: me });
          if (!n.ok) throw new IntegrationError(n.error, { status: 400, code: 'bad_cloud_link' });
          if (!n.value.picked_at) n.value.picked_at = new Date().toISOString();
          if (q.op !== 'update') await assertEnabled(n.value.provider);
          out.push(cloudMessageAttachment(n.value));
          continue;
        }
        if (a.url != null && !safeAttachmentUrl(a.url)) throw new IntegrationError('Nieprawidłowy adres załącznika.', { status: 400, code: 'bad_attachment_url' });
        out.push(a);
      }
      r.attachments = out;
    }
  }
}

export { isCloudAttachment, isCloudProvider };
