// Pliki z chmury (Faza 3 integracji): Dysk Google, OneDrive, SharePoint — BEZ kopiowania.
//
// W Avenit zapisujemy tylko metadane odnośnika (dostawca, id pliku, nazwa, typ, rozmiar, adres
// „Otwórz w …”, kto i kiedy wybrał). Treść pliku zostaje u dostawcy — Avenit jej nie pobiera ani
// nie przekazuje dalej, a o tym, kto może plik otworzyć, decydują uprawnienia u dostawcy.
//
// Ten moduł (czyste JS, bez zależności) jest wspólny dla serwera (walidacja przy zapisie przez
// /api/db), weba (wybór i wyświetlanie) i mobilki (wyświetlanie). Zasada: adres musi być https
// i wskazywać na host dostawcy z białej listy — nigdy javascript:, data:, http: ani obcy host.

export const CLOUD_PROVIDERS = ['google_drive', 'onedrive', 'sharepoint'];
export const isCloudProvider = (p) => CLOUD_PROVIDERS.includes(p);

// Typ MIME odnośnika w załącznikach Komunikatora. Starsze klienty (bez obsługi chmury) pokażą
// go jak zwykły plik (ikona + nazwa) i otworzą adres — nigdy jako obrazek ładowany z Dysku.
export const CLOUD_LINK_TYPE = 'application/vnd.avenit.cloud-link';

// Dostawca integracji (połączenie OAuth) dla dostawcy pliku.
export const integrationProviderOf = (p) => (p === 'google_drive' ? 'google' : (p === 'onedrive' || p === 'sharepoint') ? 'microsoft' : null);

const SHAREPOINT_HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.sharepoint\.com$/;
const GOOGLE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const ONEDRIVE_CONSUMER_HOSTS = new Set(['onedrive.live.com', '1drv.ms']);

export const isSharePointHost = (host) => SHAREPOINT_HOST.test(String(host || '').toLowerCase());
// OneDrive dla firm = osobista witryna SharePoint <organizacja>-my.sharepoint.com.
export const isOneDriveBusinessHost = (host) => isSharePointHost(host) && /-my\.sharepoint\.com$/i.test(String(host));

function parseHttps(url) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  const s = url.trim();
  // Bez znaków sterujących i spacji (np. „java\tscript:”, ukryte nowe linie).
  if (!s || /[\u0000-\u001f\u007f\s]/.test(s)) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  return u;
}

// Czy host adresu należy do dostawcy (provider) — albo, bez providera, do któregokolwiek.
export function cloudHostAllowed(host, provider = null) {
  const h = String(host || '').toLowerCase();
  if (provider === 'google_drive') return GOOGLE_HOSTS.has(h);
  if (provider === 'sharepoint') return isSharePointHost(h);
  if (provider === 'onedrive') return ONEDRIVE_CONSUMER_HOSTS.has(h) || isSharePointHost(h);
  if (provider == null) return GOOGLE_HOSTS.has(h) || ONEDRIVE_CONSUMER_HOSTS.has(h) || isSharePointHost(h);
  return false;
}

// Bezpieczny adres pliku w chmurze albo null.
export function safeCloudUrl(url, provider = null) {
  const u = parseHttps(url);
  if (!u || !cloudHostAllowed(u.hostname, provider)) return null;
  return u.toString();
}
export const isAllowedCloudUrl = (url, provider = null) => safeCloudUrl(url, provider) != null;

// Dostawca odczytany z adresu (Microsoft: OneDrive vs SharePoint) — do pliku z File Pickera.
export function cloudProviderFromUrl(url) {
  const u = parseHttps(url);
  if (!u) return null;
  const h = u.hostname.toLowerCase();
  if (GOOGLE_HOSTS.has(h)) return 'google_drive';
  if (ONEDRIVE_CONSUMER_HOSTS.has(h) || isOneDriveBusinessHost(h)) return 'onedrive';
  if (isSharePointHost(h)) return 'sharepoint';
  return null;
}

// Ikony dostawcy (Google iconLink / CDN Office) — wolno je zapisać, ale wyświetlamy własne.
const ICON_HOSTS = new Set(['drive-thirdparty.googleusercontent.com', 'ssl.gstatic.com', 'res.cdn.office.net', 'res-1.cdn.office.net', 'spoprod-a.akamaihd.net']);
export function safeIconUrl(url) {
  const u = parseHttps(url);
  return u && ICON_HOSTS.has(u.hostname.toLowerCase()) ? u.toString() : null;
}

const ID_RE = /^[A-Za-z0-9!_.\-:,=]{1,200}$/;
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

// Normalizacja odnośnika (zapis / wysłanie). Zwraca { ok: true, value } albo { ok: false, error }.
// pickedBy / now — serwer nadpisuje autora i czas (klient nie może podszyć się pod inną osobę).
export function normalizeCloudAttachment(input, { pickedBy = null, now = null } = {}) {
  const a = input && typeof input === 'object' ? input : null;
  if (!a) return { ok: false, error: 'Nieprawidłowy załącznik z chmury.' };
  const provider = String(a.provider || '');
  if (!isCloudProvider(provider)) return { ok: false, error: 'Nieobsługiwany dostawca plików.' };
  const fileId = String(a.file_id ?? '').trim();
  if (!ID_RE.test(fileId)) return { ok: false, error: 'Nieprawidłowy identyfikator pliku.' };
  const driveId = a.drive_id == null || a.drive_id === '' ? null : String(a.drive_id).trim();
  if (driveId != null && !ID_RE.test(driveId)) return { ok: false, error: 'Nieprawidłowy identyfikator dysku.' };
  const webUrl = safeCloudUrl(a.web_url ?? a.url, provider);
  if (!webUrl) return { ok: false, error: 'Adres pliku musi prowadzić do Dysku Google, OneDrive albo SharePoint (https).' };
  const name = cleanText(a.name, 255) || 'Plik';
  const mime = cleanText(a.mime_type, 255);
  const size = Number(a.size);
  const value = {
    kind: 'cloud',
    provider,
    file_id: fileId,
    drive_id: driveId,
    name,
    mime_type: MIME_RE.test(mime) ? mime.toLowerCase() : null,
    size: Number.isFinite(size) && size >= 0 && size < 1e15 ? Math.round(size) : null,
    web_url: webUrl,
    icon_url: safeIconUrl(a.icon_url),
    picked_by: pickedBy != null ? String(pickedBy) : (a.picked_by ? cleanText(a.picked_by, 255) : null),
    picked_at: now ? new Date(now).toISOString() : (a.picked_at && !Number.isNaN(Date.parse(a.picked_at)) ? new Date(a.picked_at).toISOString() : null),
  };
  return { ok: true, value };
}

// Załącznik wiadomości z chmury? (kind 'cloud' albo typ odnośnika).
export const isCloudAttachment = (a) => !!a && typeof a === 'object' && (a.kind === 'cloud' || a.type === CLOUD_LINK_TYPE) && isCloudProvider(a.provider);

// Załącznik wiadomości (Komunikator): pola zwykłego pliku (url/name/type/size) dla starszych
// klientów + metadane chmury.
export function cloudMessageAttachment(v) {
  return { ...v, url: v.web_url, type: CLOUD_LINK_TYPE, size: v.size ?? null };
}

// Wiersz materials_files dla odnośnika (Pliki / materiały wydarzeń).
export function cloudMaterialRow(v, { folderId = null, teamType = null, uploadedBy = null } = {}) {
  return {
    name: v.name,
    storage_path: null,
    file_size: v.size ?? null,
    mime_type: v.mime_type || null,
    folder_id: folderId,
    team_type: teamType,
    uploaded_by: uploadedBy ?? v.picked_by ?? null,
    external_provider: v.provider,
    external_id: v.file_id,
    external_drive_id: v.drive_id ?? null,
    external_url: v.web_url,
  };
}

// Wiersz materials_files → odnośnik (null, gdy to zwykły plik z magazynu).
export function cloudFromMaterialRow(row) {
  if (!row || !isCloudProvider(row.external_provider)) return null;
  const url = safeCloudUrl(row.external_url, row.external_provider);
  if (!url) return null;
  return {
    kind: 'cloud', provider: row.external_provider, file_id: row.external_id || null, drive_id: row.external_drive_id || null,
    name: row.name || 'Plik', mime_type: row.mime_type || null, size: row.file_size ?? null, web_url: url,
    picked_by: row.uploaded_by || null, picked_at: row.created_at || null,
  };
}

// Adres do otwarcia (wyświetlanie) — tylko z białej listy; inaczej null (link nieaktywny).
export function cloudOpenUrl(att) {
  if (!att) return null;
  const provider = att.provider || att.external_provider || null;
  return safeCloudUrl(att.web_url || att.external_url || att.url, isCloudProvider(provider) ? provider : null);
}

// Etykiety (polski tekst źródłowy — UI tłumaczy przez tr()).
export const CLOUD_PROVIDER_LABEL = { google_drive: 'Dysk Google', onedrive: 'OneDrive', sharepoint: 'SharePoint' };
export const CLOUD_OPEN_LABEL = { google_drive: 'Otwórz w Dysku Google', onedrive: 'Otwórz w OneDrive', sharepoint: 'Otwórz w SharePoint' };
export const cloudProviderLabel = (p) => CLOUD_PROVIDER_LABEL[p] || 'Chmura';
export const cloudOpenLabel = (p) => CLOUD_OPEN_LABEL[p] || 'Otwórz';
// Dostawca wyboru (Google / Microsoft) → nazwa w komunikacie o dostępie.
export const accessNoticeTarget = (integrationProvider) => (integrationProvider === 'google' ? 'Dysk Google' : 'OneDrive / SharePoint');

// Id projektu Google (numer) z identyfikatora klienta OAuth „123456789012-abc….apps.googleusercontent.com”
// — Google Picker potrzebuje go jako appId, żeby drive.file objęło wybrane pliki.
export function googleAppIdFromClientId(clientId) {
  const m = String(clientId || '').match(/^(\d{6,20})-[a-z0-9]+\.apps\.googleusercontent\.com$/i);
  return m ? m[1] : null;
}
