// Łączenie kościoła z Google Workspace / Microsoft 365 (OAuth 2.0 + PKCE, wspólny URI przekierowania).
//
// Start (fn workspace-integration, akcja 'connect', z sesją administratora):
//   wiersz integration_oauth_states (code_verifier PKCE, hash nonce) + podpisany `state`
//   { tenant, id stanu, dostawca } + ciasteczko z nonce na domenie nadrzędnej (callback na app.<domena>
//   sprawdza, że wraca TA SAMA przeglądarka — bez tego cudzy link autoryzacji mógł podpiąć katalog
//   ofiary pod kościół atakującego).
// Callback (src/integrations/routes.js, host app.<domena>):
//   Google   — wymiana kodu (PKCE) → refresh token (access_type=offline, prompt=consent), domena hd
//              z id_token (konto Workspace, nie prywatne Gmail), próba users.list (czy administrator).
//   Microsoft — krok 1: logowanie administratora (delegowane openid/User.Read, PKCE) → tid i rola:
//              Administrator globalny / Administrator ról uprzywilejowanych (oświadczenie `wids`
//              albo /me/memberOf). Krok 2: zgoda administratora (adminconsent) dla TEGO SAMEGO tid
//              → token client credentials z rolą User.Read.All. Parametry callbacku zgody nie są
//              podpisane przez Microsoft, dlatego tid musi się zgadzać z potwierdzonym w kroku 1,
//              a uprawnienie sprawdzamy realnym tokenem aplikacji.
import crypto from 'node:crypto';
import { config } from '../config.js';
import {
  GOOGLE, MICROSOFT, PURPOSES, ENABLED_PURPOSES, GOOGLE_SCOPES, integrationRedirectUri, msAuthority,
  isGuid, decodeJwt,
} from './providers.js';
import { IntegrationError, saveTenantConnection, markConnection, msClientCredentialsToken, describeOAuthError, loadConnection } from './tokens.js';

export const STATE_TTL_MS = 10 * 60 * 1000;
export const NONCE_COOKIE = 'avenit_intg';

// Role katalogowe Entra, które mogą udzielić zgody administratora na uprawnienia aplikacji Graph.
export const MS_CONSENT_ROLES = new Set([
  '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
  'e8611ab8-c189-46e8-94e1-60213ab1f814', // Privileged Role Administrator
]);

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (payload) => crypto.createHmac('sha256', config.JWT_SECRET).update(`intg:${payload}`).digest('hex');

export function signIntegrationState({ tenant, stateId, provider }) {
  const payload = b64url(JSON.stringify({ t: tenant, s: stateId, p: provider }));
  return `${payload}.${hmac(payload)}`;
}

export function verifyIntegrationState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expect = hmac(payload);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const o = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!o?.t || !o?.s || !o?.p) return null;
    return { tenant: String(o.t), stateId: String(o.s), provider: String(o.p) };
  } catch { return null; }
}

export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// Start łączenia → { url, nonce }. Wołający ustawia ciasteczko NONCE_COOKIE = nonce.
export async function startConnect(db, { provider, purpose = 'directory', tenant, user, creds }) {
  if (!ENABLED_PURPOSES.has(purpose)) throw new IntegrationError('Ten rodzaj połączenia nie jest jeszcze dostępny.', { code: 'purpose_disabled' });
  const P = PURPOSES[purpose];
  if (!creds?.clientId || !creds?.clientSecret) {
    throw new IntegrationError('Integracja niedostępna — brak aplikacji OAuth (skonfiguruj na platformie albo podaj własną).', { code: 'not_configured', status: 503 });
  }
  await db.query(`DELETE FROM integration_oauth_states WHERE expires_at < now()`);
  const nonce = b64url(crypto.randomBytes(24));
  const { verifier, challenge } = pkcePair();
  const { rows } = await db.query(
    `INSERT INTO integration_oauth_states (provider, purpose, scope_kind, user_id, user_email, code_verifier, nonce_hash, step, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'authorize', $8) RETURNING id`,
    [provider, purpose, P.scopeKind, user?.id ? String(user.id) : null, user?.email || null, verifier, sha256(nonce),
      new Date(Date.now() + STATE_TTL_MS).toISOString()]
  );
  const state = signIntegrationState({ tenant, stateId: rows[0].id, provider });
  const common = {
    client_id: creds.clientId, redirect_uri: integrationRedirectUri(provider), response_type: 'code',
    state, code_challenge: challenge, code_challenge_method: 'S256',
  };
  let url;
  if (provider === 'google') {
    const params = new URLSearchParams({
      ...common, scope: P.google.join(' '),
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    });
    url = `${GOOGLE.authUrl}?${params}`;
  } else {
    const params = new URLSearchParams({
      ...common, scope: P.microsoft.join(' '), response_mode: 'query', prompt: 'select_account',
    });
    url = `${MICROSOFT.authUrl(msAuthority(creds.msTenant))}?${params}`;
  }
  return { url, nonce, stateId: rows[0].id };
}

async function takeState(db, stateId, provider, nonceCookie) {
  const { rows } = await db.query(`SELECT * FROM integration_oauth_states WHERE id = $1`, [stateId]);
  const st = rows[0];
  if (!st || st.provider !== provider) return null;
  if (new Date(st.expires_at).getTime() < Date.now()) { await db.query(`DELETE FROM integration_oauth_states WHERE id = $1`, [stateId]); return null; }
  if (!nonceCookie || sha256(nonceCookie) !== st.nonce_hash) return null;
  return st;
}

async function postForm(url, params) {
  const res = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

// Callback → { result: 'connected' | 'error', reason?, next? (kolejne przekierowanie — zgoda MS) }.
// Nigdy nie rzuca dla błędów użytkownika — wołający przekierowuje na kartę z komunikatem.
export async function handleCallback(db, { provider, stateId, query, nonceCookie, creds, tenant }) {
  const fail = (reason, message) => ({ result: 'error', reason, message });
  const st = await takeState(db, stateId, provider, nonceCookie);
  if (!st) return fail('state', 'Sesja łączenia wygasła albo pochodzi z innej przeglądarki. Spróbuj ponownie.');
  const consume = () => db.query(`DELETE FROM integration_oauth_states WHERE id = $1`, [st.id]);

  if (query.error) {
    await consume();
    return fail(query.error === 'access_denied' ? 'denied' : 'provider', describeOAuthError(query));
  }
  if (!creds?.clientId || !creds?.clientSecret) { await consume(); return fail('not_configured', 'Brak aplikacji OAuth.'); }

  try {
    if (provider === 'google') return await googleCallback(db, st, query, creds, consume);
    return await microsoftCallback(db, st, query, creds, consume, tenant);
  } catch (e) {
    await consume();
    return fail(e.code || 'error', e.message);
  }
}

async function googleCallback(db, st, query, creds, consume) {
  const code = String(query.code || '');
  if (!code) { await consume(); return { result: 'error', reason: 'error', message: 'Brak kodu autoryzacji.' }; }
  const r = await postForm(GOOGLE.tokenUrl, {
    client_id: creds.clientId, client_secret: creds.clientSecret, code, code_verifier: st.code_verifier,
    redirect_uri: integrationRedirectUri('google'), grant_type: 'authorization_code',
  });
  await consume();
  if (!r.ok || !r.body?.access_token) return { result: 'error', reason: 'token', message: `Google: ${describeOAuthError(r.body)}` };
  const id = decodeJwt(r.body.id_token) || {};
  const email = String(id.email || '').toLowerCase();
  if (!id.hd) {
    return { result: 'error', reason: 'not_workspace', message: 'To konto Google nie należy do Google Workspace (brak domeny organizacji).' };
  }
  const scopes = String(r.body.scope || '').split(/\s+/).filter(Boolean);
  if (!scopes.includes(GOOGLE_SCOPES.userReadonly)) {
    return { result: 'error', reason: 'scopes', message: 'Nie udzielono dostępu do listy użytkowników katalogu (zaznacz wszystkie uprawnienia).' };
  }
  const conn = await saveTenantConnection(db, {
    provider: 'google', externalTenant: String(id.hd).toLowerCase(), accountEmail: email, scopes,
    accessToken: r.body.access_token, refreshToken: r.body.refresh_token || null, expiresIn: r.body.expires_in,
    createdBy: st.user_email,
  });
  if (!conn.refresh_token_enc) {
    await markConnection(db, conn.id, 'error', 'Google nie zwrócił tokenu odświeżania — rozłącz i połącz ponownie.');
    return { result: 'error', reason: 'no_refresh', message: 'Google nie zwrócił tokenu odświeżania.' };
  }
  // Czy połączone konto jest administratorem Workspace (Directory API odmawia zwykłym kontom)?
  const res = await globalThis.fetch(`${GOOGLE.directoryBase}/users?customer=my_customer&maxResults=1&fields=users(id)`, {
    headers: { Authorization: `Bearer ${r.body.access_token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = res.status === 403
      ? 'Konto nie ma uprawnień administratora Google Workspace (albo Admin SDK API jest wyłączone w projekcie Google Cloud).'
      : `Google Directory API: ${describeOAuthError(body)}`;
    await markConnection(db, conn.id, 'error', msg);
    return { result: 'error', reason: 'not_admin', message: msg };
  }
  return { result: 'connected', account: email };
}

async function msIsConsentAdmin(idClaims, accessToken) {
  const wids = Array.isArray(idClaims.wids) ? idClaims.wids : [];
  if (wids.some((w) => MS_CONSENT_ROLES.has(String(w).toLowerCase()))) return true;
  // Bez oświadczenia wids: role katalogowe zalogowanej osoby (User.Read wystarcza dla /me/memberOf).
  const res = await globalThis.fetch(`${MICROSOFT.graphBase}/me/memberOf/microsoft.graph.directoryRole?$select=roleTemplateId,displayName`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) return false;
  const body = await res.json().catch(() => ({}));
  return (body.value || []).some((r) => r && MS_CONSENT_ROLES.has(String(r.roleTemplateId || '').toLowerCase()));
}

async function microsoftCallback(db, st, query, creds, consume, tenant) {
  if (st.step === 'authorize') {
    const code = String(query.code || '');
    if (!code) { await consume(); return { result: 'error', reason: 'error', message: 'Brak kodu autoryzacji.' }; }
    const r = await postForm(MICROSOFT.tokenUrl(msAuthority(creds.msTenant)), {
      client_id: creds.clientId, client_secret: creds.clientSecret, code, code_verifier: st.code_verifier,
      redirect_uri: integrationRedirectUri('microsoft'), grant_type: 'authorization_code',
      scope: PURPOSES.directory.microsoft.join(' '),
    });
    if (!r.ok || !r.body?.id_token) { await consume(); return { result: 'error', reason: 'token', message: `Microsoft: ${describeOAuthError(r.body)}` }; }
    const id = decodeJwt(r.body.id_token) || {};
    const tid = String(id.tid || '').toLowerCase();
    const aud = Array.isArray(id.aud) ? id.aud : [id.aud];
    if (!isGuid(tid) || !aud.includes(creds.clientId)) { await consume(); return { result: 'error', reason: 'token', message: 'Nieprawidłowy token Microsoft.' }; }
    if (isGuid(creds.msTenant) && creds.msTenant.toLowerCase() !== tid) {
      await consume(); return { result: 'error', reason: 'tenant', message: 'Zalogowano do innego katalogu niż skonfigurowany.' };
    }
    if (!(await msIsConsentAdmin(id, r.body.access_token))) {
      await consume();
      return { result: 'error', reason: 'not_admin', message: 'Połączyć katalog może tylko Administrator globalny (albo Administrator ról uprzywilejowanych) Microsoft 365.' };
    }
    const email = String(id.email || id.preferred_username || '').toLowerCase();
    await db.query(
      `UPDATE integration_oauth_states SET step = 'admin_consent', ext_tenant = $2, account_email = $3, expires_at = $4 WHERE id = $1`,
      [st.id, tid, email, new Date(Date.now() + STATE_TTL_MS).toISOString()]
    );
    const params = new URLSearchParams({
      client_id: creds.clientId, scope: MICROSOFT.graphDefaultScope, redirect_uri: integrationRedirectUri('microsoft'),
      state: signIntegrationState({ tenant, stateId: st.id, provider: 'microsoft' }),
    });
    return { result: 'next', next: `${MICROSOFT.adminConsentUrl(tid)}?${params}` };
  }

  if (st.step === 'admin_consent') {
    await consume();
    const granted = String(query.admin_consent || '').toLowerCase() === 'true';
    const tid = String(query.tenant || '').toLowerCase();
    if (!granted) return { result: 'error', reason: 'denied', message: 'Nie udzielono zgody administratora.' };
    if (!tid || tid !== String(st.ext_tenant || '').toLowerCase()) {
      return { result: 'error', reason: 'tenant', message: 'Zgoda dotyczy innego katalogu niż konto, którym się zalogowano.' };
    }
    // Zgoda jest propagowana z opóźnieniem — kilka prób tokenu z rolą User.Read.All.
    let tok = null; let lastErr = null;
    for (let i = 0; i < 3; i++) {
      try {
        tok = await msClientCredentialsToken(creds, tid);
        if (PURPOSES.directory.microsoftAppRoles.every((r) => tok.roles.includes(r))) break;
      } catch (e) { lastErr = e; tok = null; }
      if (i < 2) await new Promise((res) => setTimeout(res, consentRetryDelayMs));
    }
    const missing = tok ? PURPOSES.directory.microsoftAppRoles.filter((r) => !tok.roles.includes(r)) : PURPOSES.directory.microsoftAppRoles;
    const conn = await saveTenantConnection(db, {
      provider: 'microsoft', externalTenant: tid, accountEmail: st.account_email, scopes: tok?.roles || [],
      accessToken: tok?.accessToken || null, expiresIn: tok?.expiresIn || null, createdBy: st.user_email,
      status: missing.length ? 'error' : 'active',
      lastError: missing.length
        ? (lastErr ? lastErr.message : `Brak uprawnienia aplikacji: ${missing.join(', ')} — zgoda mogła się jeszcze nie rozpropagować; spróbuj „Synchronizuj teraz” za kilka minut.`)
        : null,
    });
    if (missing.length) return { result: 'error', reason: 'consent_pending', message: conn.last_error };
    return { result: 'connected', account: st.account_email };
  }
  await consume();
  return { result: 'error', reason: 'state', message: 'Nieznany krok łączenia.' };
}

// Opóźnienie między próbami tokenu po zgodzie (test ustawia 0).
export let consentRetryDelayMs = 1500;
export function setConsentRetryDelay(ms) { consentRetryDelayMs = ms; }

// Rozłączenie: usunięcie połączenia kościoła (+ próba unieważnienia tokenu Google).
export async function disconnect(db, provider) {
  const conn = await loadConnection(db, provider);
  if (!conn) return false;
  if (provider === 'google' && conn.refresh_token_enc) {
    try {
      const { decryptToken } = await import('./tokens.js');
      const token = await decryptToken(conn.refresh_token_enc);
      await globalThis.fetch(`${GOOGLE.revokeUrl}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
    } catch { /* best-effort */ }
  }
  await db.query(`DELETE FROM integration_connections WHERE id = $1`, [conn.id]);
  return true;
}
