// Integracje Google Workspace / Microsoft 365 — stałe dostawców, zakresy per faza i poświadczenia.
//
// Model jak SSO (lib/sso.js): JEDEN URI przekierowania na centralnym hoście app.<domena>, tenant
// w podpisanym `state`. Poświadczenia aplikacji OAuth (kolejność):
//   1) własna aplikacja kościoła z Ustawień → Integracje (workspace_integration_settings),
//   2) aplikacja SSO kościoła (app_settings sso_<provider>_client_id + sekret) — bez drugiego klienta,
//   3) platformowa (env MS_CLIENT_ID/SECRET, GOOGLE_CLIENT_ID/SECRET),
//   4) platformowa SSO (env SSO_<PROVIDER>_CLIENT_ID/SECRET).
// Szczegóły i kroki konfiguracji: docs/integrations-workspace.md.
import { config } from '../config.js';
import { decryptPassword } from '../lib/mailcrypto.js';

export const PROVIDERS = ['google', 'microsoft'];
export const isProvider = (p) => PROVIDERS.includes(p);

// Sekret szyfrowania tokenów i sekretów klienta — ten sam co dla SSO i poczty.
export const integrationSecret = () => config.MAIL_ENCRYPTION_SECRET || config.JWT_SECRET;

export const integrationRedirectUri = (provider) =>
  `https://app.${config.APP_DOMAIN}/api/integrations/oauth/${provider}/callback`;

export const GOOGLE = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  directoryBase: 'https://admin.googleapis.com/admin/directory/v1',
};

export const MICROSOFT = {
  authUrl: (t) => `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`,
  tokenUrl: (t) => `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
  adminConsentUrl: (t) => `https://login.microsoftonline.com/${t}/v2.0/adminconsent`,
  graphBase: 'https://graph.microsoft.com/v1.0',
  graphDefaultScope: 'https://graph.microsoft.com/.default',
};

export const GOOGLE_SCOPES = {
  userReadonly: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
  groupReadonly: 'https://www.googleapis.com/auth/admin.directory.group.readonly',
  // Faza 2: najwęższy zakres pozwalający założyć WŁASNY kalendarz pomocniczy i zarządzać jego
  // wydarzeniami — bez wglądu w kalendarz główny i inne kalendarze osoby.
  calendarAppCreated: 'https://www.googleapis.com/auth/calendar.app.created',
  // Kalendarz kościoła: udostępnienie kalendarza (ACL) domenie organizacji.
  calendarAcls: 'https://www.googleapis.com/auth/calendar.acls',
  // Faza 3: dostęp WYŁĄCZNIE do plików wybranych przez osobę w Google Picker (lub utworzonych przez
  // aplikację) — zakres „non-sensitive”, bez weryfikacji CASA (w przeciwieństwie do drive.readonly).
  driveFile: 'https://www.googleapis.com/auth/drive.file',
};

export const GOOGLE_DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

export const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

// Zakresy per cel połączenia. Faza 1: 'directory' (połączenie kościoła). Faza 2: 'calendar'
// (osobisty kalendarz osoby, scope_kind 'user') i 'church_calendar' (Google: kalendarz kościoła
// na koncie administratora — także scope_kind 'user', z dodatkowym calendar.acls). Microsoft:
// kalendarz kościoła = uprawnienie APLIKACJI Calendars.ReadWrite na połączeniu kościoła
// (zgoda administratora przy „Połącz” — .default obejmuje wszystkie uprawnienia rejestracji).
//   Google: zakresy kalendarza są „sensitive” (klient External → weryfikacja; zalecany Internal),
//   drive.file + Picker zamiast drive.readonly („restricted” → audyt CASA).
//   Microsoft: delegowane z offline_access (refresh token), katalog — uprawnienie APLIKACJI.
export const PURPOSES = {
  directory: {
    scopeKind: 'tenant',
    phase: 1,
    google: ['openid', 'email', 'profile', GOOGLE_SCOPES.userReadonly, GOOGLE_SCOPES.groupReadonly],
    // Logowanie administratora (potwierdzenie katalogu i roli) — dalej zgoda administratora na
    // uprawnienie aplikacji User.Read.All (adminconsent) i tokeny client credentials.
    microsoft: ['openid', 'profile', 'email', 'User.Read'],
    microsoftAppRoles: ['User.Read.All'],
  },
  calendar: {
    scopeKind: 'user',
    phase: 2,
    google: ['openid', 'email', GOOGLE_SCOPES.calendarAppCreated],
    microsoft: ['openid', 'profile', 'email', 'offline_access', 'Calendars.ReadWrite'],
  },
  church_calendar: {
    scopeKind: 'user',
    phase: 2,
    google: ['openid', 'email', GOOGLE_SCOPES.calendarAppCreated, GOOGLE_SCOPES.calendarAcls],
    // Microsoft: bez logowania osoby — uprawnienie aplikacji na połączeniu kościoła.
    microsoft: null,
    microsoftAppRoles: ['Calendars.ReadWrite'],
  },
  // Faza 3: wybór plików (Google Picker / OneDrive-SharePoint File Picker v8) — połączenie osoby.
  //   Google: drive.file (tylko pliki wybrane w Pickerze; udostępnienie domenie też w tym zakresie).
  //   Microsoft: delegowane Files.Read.All (odczyt plików, do których osoba ma dostęp — także
  //   SharePoint) + offline_access; tokeny dla zasobu SharePoint (File Picker v8) wydaje serwer
  //   z refresh tokenu osoby (scope https://<host>.sharepoint.com/.default — wymaga delegowanych
  //   uprawnień SharePoint w rejestracji: MyFiles.Read / AllSites.Read).
  files: {
    scopeKind: 'user',
    phase: 3,
    google: ['openid', 'email', GOOGLE_SCOPES.driveFile],
    microsoft: ['openid', 'profile', 'email', 'offline_access', 'Files.Read.All'],
  },
};
// Cele dostępne w tej wersji (Faza 1–3).
export const ENABLED_PURPOSES = new Set(['directory', 'calendar', 'church_calendar', 'files']);
// Cele połączeń osób (scope_kind 'user') — callback zapisuje połączenie osoby, nie kościoła.
export const USER_PURPOSES = new Set(['calendar', 'church_calendar', 'files']);

// Zakres, bez którego połączenie osoby nie spełnia celu (sprawdzany po zgodzie i przy użyciu).
export const REQUIRED_USER_SCOPE = {
  calendar: { google: GOOGLE_SCOPES.calendarAppCreated, microsoft: /Calendars\.ReadWrite/i },
  church_calendar: { google: GOOGLE_SCOPES.calendarAppCreated, microsoft: null },
  files: { google: GOOGLE_SCOPES.driveFile, microsoft: /Files\.Read(\.All)?|Files\.ReadWrite/i },
};

// Czy połączenie osoby ma zakres plików (Faza 3).
export function connHasFilesScope(conn) {
  const scopes = Array.isArray(conn?.scopes) ? conn.scopes : [];
  if (conn?.provider === 'google') return scopes.includes(GOOGLE_SCOPES.driveFile);
  return scopes.some((s) => REQUIRED_USER_SCOPE.files.microsoft.test(String(s)));
}
// Czy połączenie osoby ma zakres kalendarza (Faza 2).
export function connHasCalendarScope(conn) {
  const scopes = Array.isArray(conn?.scopes) ? conn.scopes : [];
  if (conn?.provider === 'google') return scopes.includes(GOOGLE_SCOPES.calendarAppCreated);
  return scopes.some((s) => /Calendars\.ReadWrite/i.test(String(s)));
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v) => GUID_RE.test(String(v || ''));

// Katalog Microsoft do logowania administratora: konkretny (GUID / domena) albo 'organizations'
// (konta służbowe dowolnej organizacji; „common” wpuściłby konta prywatne, które nie mają katalogu).
export function msAuthority(msTenant) {
  const t = String(msTenant || '').trim();
  if (!t || t === 'common' || t === 'consumers') return 'organizations';
  return t;
}

async function tryDecrypt(enc) {
  if (!enc) return '';
  try { return await decryptPassword(enc, integrationSecret()); } catch { return ''; }
}

export async function loadProviderSettings(db, provider) {
  const { rows } = await db.query(
    `SELECT provider, client_id, client_secret_enc, ms_tenant, directory, updated_by, updated_at
       FROM workspace_integration_settings WHERE provider = $1`, [provider]);
  return rows[0] || null;
}

// Poświadczenia aplikacji OAuth dla dostawcy (patrz kolejność w nagłówku pliku).
// Zwraca { clientId, clientSecret, msTenant, source } — source: 'tenant' | 'sso' | 'platform' | null.
export async function resolveIntegrationCreds(db, provider) {
  const own = await loadProviderSettings(db, provider).catch(() => null);
  if (own?.client_id) {
    return { clientId: own.client_id, clientSecret: await tryDecrypt(own.client_secret_enc), msTenant: own.ms_tenant || '', source: 'tenant' };
  }
  const { rows } = await db.query(
    `SELECT key, value FROM app_settings WHERE key IN ($1, $2, 'sso_microsoft_tenant')`,
    [`sso_${provider}_client_id`, `sso_${provider}_client_secret_enc`]
  ).catch(() => ({ rows: [] }));
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const ssoId = m[`sso_${provider}_client_id`];
  if (ssoId) {
    return {
      clientId: ssoId, clientSecret: await tryDecrypt(m[`sso_${provider}_client_secret_enc`]),
      msTenant: provider === 'microsoft' ? (m.sso_microsoft_tenant || '') : '', source: 'sso',
    };
  }
  const envId = provider === 'microsoft' ? config.MS_CLIENT_ID : config.GOOGLE_CLIENT_ID;
  if (envId) {
    return { clientId: envId, clientSecret: (provider === 'microsoft' ? config.MS_CLIENT_SECRET : config.GOOGLE_CLIENT_SECRET) || '', msTenant: '', source: 'platform' };
  }
  const ssoEnvId = config[`SSO_${provider.toUpperCase()}_CLIENT_ID`];
  if (ssoEnvId) {
    return {
      clientId: ssoEnvId, clientSecret: config[`SSO_${provider.toUpperCase()}_CLIENT_SECRET`] || '',
      msTenant: provider === 'microsoft' ? (config.SSO_MICROSOFT_TENANT || '') : '', source: 'platform',
    };
  }
  return { clientId: '', clientSecret: '', msTenant: '', source: null };
}

// Dekodowanie JWT bez weryfikacji podpisu — WYŁĄCZNIE dla tokenów odebranych bezpośrednio
// z punktu wymiany tokenów dostawcy (TLS, uwierzytelnienie sekretem klienta), jak w lib/sso.js.
export function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()); } catch { return null; }
}
