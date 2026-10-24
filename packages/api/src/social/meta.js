// Social Media — klient Graph API Meta (Facebook Login for Business, strony FB, Instagram).
//
// Jedna platformowa aplikacja Meta dla wszystkich kościołów (env META_APP_ID / META_APP_SECRET),
// jeden URI przekierowania na app.<domena> (jak integracje Google/Microsoft). Każde wywołanie
// z tokenem dostaje appsecret_proof (wymagane przy „Require App Secret” w ustawieniach aplikacji).
//
// Tokeny: kod → token użytkownika (krótki) → token długoterminowy (60 dni) → tokeny STRON
// z /me/accounts. Token strony wyprowadzony z tokenu długoterminowego nie wygasa — zapisujemy go
// (zaszyfrowany) dla strony i dla podpiętego do niej konta Instagram. Cofnięcie zgody / zmiana
// hasła administratora strony = błąd 190 → kanał 'revoked', trzeba połączyć ponownie.
import crypto from 'node:crypto';
import { config } from '../config.js';

export class SocialError extends Error {
  constructor(message, { code = 'error', status = 400, retryable = false, tokenInvalid = false, providerCode = null } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.tokenInvalid = tokenInvalid;
    this.providerCode = providerCode;
  }
}

export const metaConfigured = () => Boolean(config.META_APP_ID && config.META_APP_SECRET);
const ver = () => config.META_GRAPH_VERSION || 'v26.0';
export const graphBase = () => `https://graph.facebook.com/${ver()}`;
export const graphVideoBase = () => `https://graph-video.facebook.com/${ver()}`;
export const metaRedirectUri = () => `https://app.${config.APP_DOMAIN}/api/social/oauth/meta/callback`;

// Zakresy (klasyczne logowanie; przy META_CONFIG_ID zakresy definiuje konfiguracja w panelu Meta).
//   pages_manage_posts + pages_read_engagement + pages_show_list — publikacja na stronie,
//   pages_manage_engagement — pierwszy komentarz jako strona,
//   business_management — strony zarządzane przez Business Managera,
//   instagram_basic + instagram_content_publish — publikacja na koncie firmowym IG,
//   instagram_manage_comments — pierwszy komentarz i skrzynka komentarzy IG,
//   pages_read_user_content — czytanie komentarzy pod postami strony (skrzynka),
//   read_insights + instagram_manage_insights — analityka postów (migracja 125).
export const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement', 'pages_read_user_content',
  'read_insights', 'business_management', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments',
  'instagram_manage_insights',
];
// Zakresy potrzebne do analityki / komentarzy — kanał połączony wcześniej musi połączyć się ponownie.
export const INSIGHTS_SCOPES = { facebook: ['read_insights'], instagram: ['instagram_manage_insights'] };
export const COMMENTS_SCOPES = { facebook: ['pages_read_user_content', 'pages_manage_engagement'], instagram: ['instagram_manage_comments'] };
export const missingScopes = (account, needed) => {
  const have = new Set(account?.scopes || []);
  if (!have.size) return [];
  return (needed[account.provider] || []).filter((s) => !have.has(s));
};
export const REQUIRED_PAGE_SCOPE = 'pages_manage_posts';
export const REQUIRED_IG_SCOPE = 'instagram_content_publish';

export const appsecretProof = (token, secret = config.META_APP_SECRET) =>
  crypto.createHmac('sha256', String(secret || '')).update(String(token || '')).digest('hex');

// Błąd Graph API → SocialError z polskim komunikatem i klasą (ponowić? token nieważny?).
// https://developers.facebook.com/docs/graph-api/guides/error-handling
const RATE_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80004, 80005, 80006, 80008]);
export function classifyMetaError(body, httpStatus = 400) {
  const e = body?.error || {};
  const code = Number(e.code) || 0;
  const sub = Number(e.error_subcode) || 0;
  const raw = String(e.error_user_msg || e.message || `HTTP ${httpStatus}`).slice(0, 400);
  if (code === 190 || code === 102 || sub === 458 || sub === 460 || sub === 463 || sub === 467) {
    return new SocialError('Połączenie z kontem wygasło albo zostało cofnięte — połącz kanał ponownie.', {
      code: 'token_invalid', status: 401, tokenInvalid: true, providerCode: code,
    });
  }
  if (RATE_CODES.has(code) || sub === 2207042) {
    return new SocialError('Sieć chwilowo ogranicza liczbę publikacji — ponowimy za kilka minut.', {
      code: 'rate_limited', status: 429, retryable: true, providerCode: code,
    });
  }
  if (code === 10 || (code >= 200 && code <= 299)) {
    return new SocialError(`Brak uprawnień do publikacji (sprawdź swoją rolę na stronie i zgody aplikacji). Meta: ${raw}`, {
      code: 'permission', status: 403, providerCode: code,
    });
  }
  if (code === 9007 || sub === 2207027) {
    return new SocialError('Media są jeszcze przetwarzane.', { code: 'not_ready', status: 409, retryable: true, providerCode: code });
  }
  if (code === 1 || code === 2 || e.is_transient === true || httpStatus >= 500) {
    return new SocialError('Chwilowy błąd po stronie Meta — ponowimy publikację.', {
      code: 'transient', status: 503, retryable: true, providerCode: code,
    });
  }
  if (code === 368) {
    return new SocialError(`Meta zablokowała publikację (zasady społeczności). ${raw}`, { code: 'blocked', status: 403, providerCode: code });
  }
  if (code === 9004 || sub === 2207052) {
    return new SocialError('Meta nie mogła pobrać pliku z serwera Avenit — spróbuj ponownie za chwilę.', {
      code: 'media_fetch', status: 400, retryable: true, providerCode: code,
    });
  }
  return new SocialError(`Meta: ${raw}`, { code: 'provider', status: 400, providerCode: code });
}

// Wywołanie Graph API. GET — parametry w adresie, POST — formularz. Zwraca JSON odpowiedzi.
export async function graph(method, path, { token, params = {}, base } = {}) {
  const url = new URL(`${base || graphBase()}${path.startsWith('/') ? path : `/${path}`}`);
  const all = { ...params };
  if (token) {
    all.access_token = token;
    if (config.META_APP_SECRET) all.appsecret_proof = appsecretProof(token);
  }
  const flat = Object.fromEntries(Object.entries(all)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  let res;
  try {
    if (method === 'GET' || method === 'DELETE') {
      for (const [k, v] of Object.entries(flat)) url.searchParams.set(k, v);
      res = await globalThis.fetch(url, { method, headers: { Accept: 'application/json' } });
    } else {
      res = await globalThis.fetch(url, {
        method,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(flat),
      });
    }
  } catch {
    throw new SocialError('Brak połączenia z Meta — ponowimy publikację.', { code: 'network', status: 503, retryable: true });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw classifyMetaError(body, res.status);
  return body;
}

// ── Logowanie (OAuth) ────────────────────────────────────────────────────────
export function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.META_APP_ID || '',
    redirect_uri: metaRedirectUri(),
    state,
    response_type: 'code',
  });
  if (config.META_CONFIG_ID) params.set('config_id', config.META_CONFIG_ID);
  else params.set('scope', META_SCOPES.join(','));
  return `https://www.facebook.com/${ver()}/dialog/oauth?${params}`;
}

export async function exchangeCode(code) {
  const out = await graph('GET', '/oauth/access_token', {
    params: { client_id: config.META_APP_ID, client_secret: config.META_APP_SECRET, redirect_uri: metaRedirectUri(), code },
  });
  if (!out.access_token) throw new SocialError('Meta nie zwróciła tokenu.', { code: 'no_token' });
  return out.access_token;
}

export async function longLivedToken(shortToken) {
  const out = await graph('GET', '/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token', client_id: config.META_APP_ID, client_secret: config.META_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  });
  return { token: out.access_token || shortToken, expiresIn: Number(out.expires_in) || null };
}

export async function fetchMe(token) {
  return graph('GET', '/me', { token, params: { fields: 'id,name' } });
}

export async function fetchGrantedScopes(token) {
  const out = await graph('GET', '/me/permissions', { token });
  return (out.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
}

// Strony, którymi osoba zarządza (z tokenami stron) + podpięte konta firmowe Instagram.
export async function fetchPages(token) {
  const fields = 'id,name,access_token,tasks,picture.type(large){url},instagram_business_account{id,username,name,profile_picture_url}';
  const pages = [];
  let out = await graph('GET', '/me/accounts', { token, params: { fields, limit: 100 } });
  for (let i = 0; i < 10; i += 1) {
    pages.push(...(out.data || []));
    const after = out.paging?.cursors?.after;
    if (!out.paging?.next || !after) break;
    out = await graph('GET', '/me/accounts', { token, params: { fields, limit: 100, after } });
  }
  return pages;
}

// Czy osoba może tworzyć treści na stronie (zadania strony: CREATE_CONTENT albo MANAGE).
export const canCreateOnPage = (page) => {
  const tasks = Array.isArray(page?.tasks) ? page.tasks : null;
  return !tasks || tasks.includes('CREATE_CONTENT') || tasks.includes('MANAGE');
};

// signed_request (callbacki usuwania danych / cofnięcia autoryzacji) → payload albo null.
export function parseSignedRequest(signed, secret = config.META_APP_SECRET) {
  const [sig, payload] = String(signed || '').split('.');
  if (!sig || !payload || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (String(data.algorithm || '').toUpperCase() !== 'HMAC-SHA256') return null;
    return data;
  } catch { return null; }
}
