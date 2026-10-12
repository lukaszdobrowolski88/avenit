// Natywne dzwonienie w aplikacji mobilnej — VoIP push (systemowy ekran połączenia, także przy
// zabitej aplikacji; po stronie telefonu payload czyta natywnie expo-callkit-telecom).
//
//  • iOS — APNs (PushKit): HTTP/2 do api.push.apple.com / api.sandbox.push.apple.com,
//    apns-push-type: voip, temat <bundle>.voip, JWT ES256 z klucza .p8 (cache ~50 min).
//  • Android — FCM HTTP v1: wiadomość „data” o wysokim priorytecie (bez bloku notification),
//    token OAuth2 z konta serwisowego (asercja RS256, cache do wygaśnięcia).
//
// Tokeny VoIP leżą w push_tokens (migracja 107: voip_token, voip_type, voip_env). Martwy token
// (APNs 410 / BadDeviceToken / Unregistered, FCM UNREGISTERED / zły token) jest zerowany.
// Pliki kluczy czytane leniwie; brak pliku = kanał wyłączony (log raz, bez wyjątku). Nic tu nie
// rzuca do logiki połączeń — każdy błąd kończy się wynikiem { ok: false } dla urządzenia.
// Same Node built-ins (node:http2, node:crypto) — bez dodatkowych zależności.
import http2 from 'node:http2';
import fs from 'node:fs';
import { randomUUID, createPrivateKey, sign } from 'node:crypto';
import { config } from '../config.js';

export const VOIP_TIMEOUT_MS = 5000;
const APNS_JWT_TTL_MS = 50 * 60 * 1000;
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const APNS_HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' };

const lower = (v) => String(v ?? '').trim().toLowerCase();
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

export function voipSettings(env = config) {
  return {
    apns: { keyPath: env.APNS_KEY_PATH, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, bundleId: env.APNS_BUNDLE_ID || 'pl.avenit.app' },
    fcm: { serviceAccountPath: env.FCM_SERVICE_ACCOUNT_PATH },
  };
}

// ── JWT ─────────────────────────────────────────────────────────────────────
// ES256 — podpis w formacie JOSE (r||s, 64 bajty), nie DER.
export function signJwt(header, claims, key, alg) {
  const input = `${b64url(header)}.${b64url(claims)}`;
  const sig = alg === 'ES256'
    ? sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
    : sign('sha256', Buffer.from(input), key);
  return `${input}.${sig.toString('base64url')}`;
}

export function apnsJwt({ key, keyId, teamId, now = Date.now() }) {
  return signJwt({ alg: 'ES256', kid: keyId }, { iss: teamId, iat: Math.floor(now / 1000) }, key, 'ES256');
}

export function fcmAssertion({ clientEmail, key, tokenUri = FCM_TOKEN_URI, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  return signJwt({ alg: 'RS256', typ: 'JWT' }, { iss: clientEmail, scope: FCM_SCOPE, aud: tokenUri, iat, exp: iat + 3600 }, key, 'RS256');
}

// ── Payload (KONTRAKT z aplikacją mobilną) ──────────────────────────────────
// Adres awatara musi być bezwzględny; ścieżka względna — względem webu tenanta.
export function absoluteUrl(url, tenantSlug, domain = config.APP_DOMAIN) {
  const u = String(url ?? '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/') && !u.startsWith('//') && tenantSlug) return `https://${tenantSlug}.${domain}${u}`;
  return null;
}

// IncomingCallEvent: metadane wyłącznie jako tekst (natywny parser).
export function buildIncomingCallEvent({ call, callerName, displayName, avatarUrl = null, tenantSlug, eventId = randomUUID() }) {
  const email = lower(call.started_by_email);
  const started = new Date(call.started_at ?? Date.now());
  const name = String(callerName || email);
  // Bez caller.email: przy obecnym polu expo-callkit-telecom ustawia uchwyt CallKit typu e-mail
  // i iOS pokazuje adres zamiast imienia. id = e-mail wystarcza aplikacji (oddzwonienie z Ostatnich).
  const caller = { id: email, displayName: String(displayName || name) };
  if (avatarUrl) caller.avatarUrl = avatarUrl;
  return {
    eventId,
    serverCallId: String(call.id),
    hasVideo: call.kind === 'video',
    startedAt: (Number.isNaN(started.getTime()) ? new Date() : started).toISOString(),
    caller,
    metadata: {
      conversationId: String(call.conversation_id),
      tenant: String(tenantSlug ?? ''),
      isGroup: call.is_group ? 'true' : 'false',
      kind: String(call.kind || 'audio'),
      callerName: name,
    },
  };
}

export function apnsRequest({ token, env, bundleId, jwt, event }) {
  return {
    origin: env === 'sandbox' ? APNS_HOSTS.sandbox : APNS_HOSTS.production,
    path: `/3/device/${token}`,
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-push-type': 'voip',
      'apns-topic': `${bundleId}.voip`,
      'apns-priority': '10',
      'apns-expiration': '0',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ incomingCall: event }),
  };
}

export function fcmMessage(token, event) {
  return {
    message: {
      token,
      android: { priority: 'HIGH', ttl: '45s' },
      data: { messageType: 'incomingCall', incomingCall: JSON.stringify(event) },
    },
  };
}

// ── Martwe tokeny ───────────────────────────────────────────────────────────
const parseJson = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { return {}; } };

export function apnsTokenInvalid(status, body) {
  const reason = parseJson(body)?.reason;
  return status === 410 || (status === 400 && ['BadDeviceToken', 'Unregistered'].includes(reason));
}

export function fcmTokenInvalid(status, body) {
  const err = parseJson(body)?.error || {};
  const codes = [err.status, ...(Array.isArray(err.details) ? err.details.map((d) => d?.errorCode) : [])];
  if (status === 404 || codes.includes('UNREGISTERED')) return true;
  // INVALID_ARGUMENT bywa też błędem naszej wiadomości — zerujemy tylko, gdy dotyczy tokenu.
  return status === 400 && codes.includes('INVALID_ARGUMENT') && /token/i.test(String(err.message || ''));
}

// ── Transport APNs (HTTP/2, sesja na host, wielokrotnego użytku) ────────────
const sessions = new Map();
function sessionFor(origin) {
  const cur = sessions.get(origin);
  if (cur && !cur.closed && !cur.destroyed) return cur;
  const s = http2.connect(origin);
  const drop = () => { if (sessions.get(origin) === s) sessions.delete(origin); };
  s.on('error', drop);
  s.on('close', drop);
  s.on('goaway', drop);
  s.setTimeout(10 * 60 * 1000, () => s.close());
  s.unref();
  sessions.set(origin, s);
  return s;
}

export function http2Post({ origin, path, headers, body, timeoutMs = VOIP_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    let done = false;
    let timer = null;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    let req;
    try {
      req = sessionFor(origin).request({ ':method': 'POST', ':path': path, ...headers });
    } catch (err) {
      finish(reject, err);
      return;
    }
    timer = setTimeout(() => {
      try { req.close(http2.constants.NGHTTP2_CANCEL); } catch { /* już zamknięte */ }
      finish(reject, new Error('APNs: przekroczony czas odpowiedzi'));
    }, timeoutMs);
    let status = 0;
    let data = '';
    req.setEncoding('utf8');
    req.on('response', (h) => { status = Number(h[':status']) || 0; });
    req.on('data', (c) => { data += c; });
    req.on('end', () => finish(resolve, { status, body: data }));
    req.on('close', () => finish(resolve, { status, body: data }));
    req.on('error', (err) => finish(reject, err));
    req.end(body);
  });
}

// ── Nadawca ─────────────────────────────────────────────────────────────────
// transport: { http2Post?, fetch? } — testy podmieniają sieć; readFile — testy podmieniają pliki.
export function createVoipSender({ settings = voipSettings(), transport = {}, now = () => Date.now(), readFile = fs.readFileSync } = {}) {
  const post2 = transport.http2Post || http2Post;
  const doFetch = transport.fetch || ((...a) => globalThis.fetch(...a));
  let apnsKey; // undefined = nie czytano, null = brak
  let apnsTok = null; // { jwt, at }
  let fcmSa; // undefined | null | { clientEmail, projectId, tokenUri, key }
  let fcmTok = null; // { token, exp }
  let fcmTokPending = null;
  const warned = new Set();
  const warnOnce = (log, key, msg, err) => {
    if (warned.has(key)) return;
    warned.add(key);
    (log?.warn ? log.warn.bind(log) : console.warn)({ err }, `voip: ${msg}`);
  };

  function loadApns(log) {
    if (apnsKey !== undefined) return apnsKey;
    try {
      apnsKey = createPrivateKey(readFile(settings.apns.keyPath, 'utf8'));
    } catch (err) {
      apnsKey = null;
      warnOnce(log, 'apns', 'brak klucza APNs — VoIP na iOS wyłączony', err?.code || err?.message);
    }
    return apnsKey;
  }

  function loadFcm(log) {
    if (fcmSa !== undefined) return fcmSa;
    try {
      const sa = JSON.parse(readFile(settings.fcm.serviceAccountPath, 'utf8'));
      if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('niepełne konto serwisowe');
      fcmSa = { clientEmail: sa.client_email, projectId: sa.project_id, tokenUri: sa.token_uri || FCM_TOKEN_URI, key: createPrivateKey(sa.private_key) };
    } catch (err) {
      fcmSa = null;
      warnOnce(log, 'fcm', 'brak konta serwisowego FCM — VoIP na Androidzie wyłączony', err?.code || err?.message);
    }
    return fcmSa;
  }

  function apnsBearer() {
    if (apnsTok && now() - apnsTok.at < APNS_JWT_TTL_MS) return apnsTok.jwt;
    const at = now();
    apnsTok = { jwt: apnsJwt({ key: apnsKey, keyId: settings.apns.keyId, teamId: settings.apns.teamId, now: at }), at };
    return apnsTok.jwt;
  }

  async function fcmAccessToken() {
    if (fcmTok && fcmTok.exp - 60_000 > now()) return fcmTok.token;
    if (!fcmTokPending) {
      fcmTokPending = (async () => {
        const assertion = fcmAssertion({ clientEmail: fcmSa.clientEmail, key: fcmSa.key, tokenUri: fcmSa.tokenUri, now: now() });
        const res = await doFetch(fcmSa.tokenUri, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
          signal: AbortSignal.timeout(VOIP_TIMEOUT_MS),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.access_token) throw new Error(`FCM OAuth ${res.status}: ${json.error || 'brak tokenu'}`);
        fcmTok = { token: json.access_token, exp: now() + (Number(json.expires_in) || 3600) * 1000 };
        return fcmTok.token;
      })().finally(() => { fcmTokPending = null; });
    }
    return fcmTokPending;
  }

  async function sendApns(device, event) {
    const req = apnsRequest({ token: device.voip_token, env: device.voip_env, bundleId: settings.apns.bundleId, jwt: apnsBearer(), event });
    const res = await post2({ ...req, timeoutMs: VOIP_TIMEOUT_MS });
    if (res.status === 200) return { ok: true, status: 200 };
    const reason = parseJson(res.body)?.reason;
    if (res.status === 403 && /ProviderToken/.test(String(reason))) apnsTok = null; // nowy JWT przy następnej próbie
    return { ok: false, status: res.status, error: reason || `HTTP ${res.status}`, invalid: apnsTokenInvalid(res.status, res.body) };
  }

  async function sendFcm(device, event) {
    const access = await fcmAccessToken();
    const res = await doFetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmSa.projectId)}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify(fcmMessage(device.voip_token, event)),
      signal: AbortSignal.timeout(VOIP_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => '');
    if (res.status === 401) fcmTok = null;
    const err = parseJson(text)?.error;
    return { ok: false, status: res.status, error: err?.status || err?.message || `HTTP ${res.status}`, invalid: fcmTokenInvalid(res.status, text) };
  }

  // Czy dany kanał działa (leniwie czyta pliki).
  function enabledFor(type, log) {
    if (type === 'APNS_VOIP') return !!loadApns(log);
    if (type === 'FCM') return !!loadFcm(log);
    return false;
  }

  // devices: wiersze push_tokens { id, expo_token, voip_token, voip_type, voip_env }.
  // Zwraca wynik per wiersz: { id, expo_token, ok, invalid?, skipped?, error? } — nigdy nie rzuca.
  async function send(db, devices, event, { log } = {}) {
    const list = (devices || []).filter((d) => d?.voip_token);
    // Ten sam token w kilku wierszach (stare tokeny Expo tego urządzenia) — wysyłka raz.
    const byToken = new Map();
    for (const d of list) {
      const k = `${d.voip_type}:${d.voip_token}`;
      if (!byToken.has(k)) byToken.set(k, d);
    }
    const outcome = new Map();
    await Promise.all([...byToken.entries()].map(async ([k, d]) => {
      let r;
      try {
        if (!enabledFor(d.voip_type, log)) r = { ok: false, skipped: 'disabled' };
        else if (d.voip_type === 'APNS_VOIP') r = await sendApns(d, event);
        else r = await sendFcm(d, event);
      } catch (err) {
        r = { ok: false, error: err?.message || String(err) };
      }
      if (!r.ok && !r.skipped) log?.warn?.({ status: r.status, error: r.error, type: d.voip_type }, 'voip: wysyłka nieudana');
      if (r.invalid && db) {
        try {
          await db.query(`UPDATE push_tokens SET voip_token = NULL, voip_updated_at = now() WHERE voip_token = $1`, [d.voip_token]);
        } catch (err) {
          log?.warn?.({ err }, 'voip: czyszczenie tokenu');
        }
      }
      outcome.set(k, r);
    }));
    return list.map((d) => ({ id: d.id, expo_token: d.expo_token, ...outcome.get(`${d.voip_type}:${d.voip_token}`) }));
  }

  return { send, enabledFor };
}

// Domyślny nadawca procesu (ustawienia z config.js) — wstrzykiwany w callDeps jako sendVoip.
let defaultSender = null;
export function sendVoip(db, devices, event, opts) {
  if (!defaultSender) defaultSender = createVoipSender();
  return defaultSender.send(db, devices, event, opts);
}
