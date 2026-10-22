// Tokeny połączeń Google / Microsoft (integration_connections) — szyfrowanie, odświeżanie, status.
//
// getAccessToken(db, conn) zwraca ważny token dostępu:
//   • zapisany i ważny jeszcze ≥ 60 s → odszyfrowany z bazy,
//   • Microsoft, połączenie kościoła (katalog) → nowy token client credentials dla katalogu kościoła
//     (external_tenant = tid) — bez refresh tokenu; zgoda administratora daje uprawnienia aplikacji,
//   • w pozostałych przypadkach → odświeżenie refresh tokenem (Google; Microsoft delegowany w Fazie 2+).
// Nowy token jest zapisywany (zaszyfrowany). Błąd → status 'error' (albo 'revoked' przy cofniętej
// zgodzie: invalid_grant) i last_error — karta w Ustawieniach pokazuje problem administratorowi.
// Tokeny NIGDY nie wychodzą do przeglądarki (fn zwracają tylko publicConnection()).
import { encryptPassword, decryptPassword } from '../lib/mailcrypto.js';
import { GOOGLE, MICROSOFT, integrationSecret, resolveIntegrationCreds, decodeJwt } from './providers.js';

export class IntegrationError extends Error {
  constructor(message, { code = 'integration_error', status = 400, detail } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const encryptToken = async (v) => (v ? encryptPassword(String(v), integrationSecret()) : null);
export const decryptToken = async (v) => (v ? decryptPassword(String(v), integrationSecret()) : '');

const CONN_COLS = `id, provider, scope_kind, user_id, external_tenant, account_email, scopes, access_token_enc,
  refresh_token_enc, expires_at, status, last_error, created_by, created_at, updated_at`;

export async function loadConnection(db, provider, { scopeKind = 'tenant', userId = null } = {}) {
  const { rows } = scopeKind === 'tenant'
    ? await db.query(`SELECT ${CONN_COLS} FROM integration_connections WHERE provider = $1 AND scope_kind = 'tenant'`, [provider])
    : await db.query(`SELECT ${CONN_COLS} FROM integration_connections WHERE provider = $1 AND scope_kind = 'user' AND user_id = $2`, [provider, userId]);
  return rows[0] || null;
}

// Widok połączenia dla klienta — bez tokenów.
export function publicConnection(conn) {
  if (!conn) return null;
  return {
    id: conn.id, provider: conn.provider, scope_kind: conn.scope_kind,
    external_tenant: conn.external_tenant || null, account_email: conn.account_email || null,
    scopes: conn.scopes || [], status: conn.status, last_error: conn.last_error || null,
    created_by: conn.created_by || null, created_at: conn.created_at, updated_at: conn.updated_at,
    has_refresh_token: !!conn.refresh_token_enc,
  };
}

// Zapis połączenia kościoła (jedno na dostawcę) — upsert po (provider) dla scope_kind 'tenant'.
export async function saveTenantConnection(db, {
  provider, externalTenant = null, accountEmail = null, scopes = [], accessToken = null,
  refreshToken = null, expiresIn = null, createdBy = null, status = 'active', lastError = null,
}) {
  const accessEnc = await encryptToken(accessToken);
  const refreshEnc = await encryptToken(refreshToken);
  const expiresAt = expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString() : null;
  const existing = await loadConnection(db, provider);
  if (existing) {
    const { rows } = await db.query(
      `UPDATE integration_connections
          SET external_tenant = $2, account_email = $3, scopes = $4::text[], access_token_enc = $5,
              refresh_token_enc = COALESCE($6, refresh_token_enc), expires_at = $7, status = $8,
              last_error = $9, created_by = $10, updated_at = now()
        WHERE id = $1 RETURNING ${CONN_COLS}`,
      [existing.id, externalTenant, accountEmail, scopes, accessEnc, refreshEnc, expiresAt, status, lastError, createdBy]
    );
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO integration_connections
       (provider, scope_kind, external_tenant, account_email, scopes, access_token_enc, refresh_token_enc, expires_at, status, last_error, created_by)
     VALUES ($1, 'tenant', $2, $3, $4::text[], $5, $6, $7, $8, $9, $10) RETURNING ${CONN_COLS}`,
    [provider, externalTenant, accountEmail, scopes, accessEnc, refreshEnc, expiresAt, status, lastError, createdBy]
  );
  return rows[0];
}

export async function markConnection(db, id, status, lastError = null) {
  await db.query(
    `UPDATE integration_connections SET status = $2, last_error = $3, updated_at = now() WHERE id = $1`,
    [id, status, lastError ? String(lastError).slice(0, 500) : null]
  );
}

async function postForm(url, params) {
  const res = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export const describeOAuthError = (body) =>
  String(body?.error_description || body?.error?.message || body?.error || 'nieznany błąd').split('\n')[0].slice(0, 300);

// Token client credentials Microsoft Graph dla katalogu kościoła (tid).
export async function msClientCredentialsToken(creds, tid) {
  const r = await postForm(MICROSOFT.tokenUrl(tid), {
    client_id: creds.clientId, client_secret: creds.clientSecret,
    grant_type: 'client_credentials', scope: MICROSOFT.graphDefaultScope,
  });
  if (!r.ok || !r.body?.access_token) {
    throw new IntegrationError(`Microsoft odrzucił token aplikacji: ${describeOAuthError(r.body)}`, {
      code: r.body?.error || 'token_failed', status: 502,
    });
  }
  const claims = decodeJwt(r.body.access_token) || {};
  return { accessToken: r.body.access_token, expiresIn: Number(r.body.expires_in) || 3600, roles: Array.isArray(claims.roles) ? claims.roles : [] };
}

// Cofnięta zgoda / unieważniony refresh token → 'revoked' (trzeba połączyć ponownie).
const REVOKED_ERRORS = new Set(['invalid_grant']);

export async function getAccessToken(db, conn, { creds = null, force = false } = {}) {
  if (!conn) throw new IntegrationError('Brak połączenia z dostawcą.', { code: 'not_connected', status: 409 });
  if (conn.status === 'revoked') {
    throw new IntegrationError('Połączenie zostało cofnięte — połącz ponownie.', { code: 'revoked', status: 409 });
  }
  const exp = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (!force && conn.access_token_enc && exp - Date.now() > 60_000) {
    try { return await decryptToken(conn.access_token_enc); } catch { /* odśwież niżej */ }
  }
  const c = creds || await resolveIntegrationCreds(db, conn.provider);
  if (!c.clientId || !c.clientSecret) {
    await markConnection(db, conn.id, 'error', 'Brak poświadczeń aplikacji OAuth (skonfiguruj integrację).');
    throw new IntegrationError('Integracja nie jest skonfigurowana (brak aplikacji OAuth).', { code: 'not_configured', status: 503 });
  }

  let r;
  if (conn.provider === 'microsoft' && conn.scope_kind === 'tenant') {
    try {
      const t = await msClientCredentialsToken(c, conn.external_tenant);
      r = { ok: true, body: { access_token: t.accessToken, expires_in: t.expiresIn } };
    } catch (e) {
      await markConnection(db, conn.id, 'error', e.message);
      throw e;
    }
  } else {
    let refresh = '';
    try { refresh = await decryptToken(conn.refresh_token_enc); } catch { refresh = ''; }
    if (!refresh) {
      await markConnection(db, conn.id, 'revoked', 'Brak tokenu odświeżania — połącz ponownie.');
      throw new IntegrationError('Brak tokenu odświeżania — połącz ponownie.', { code: 'revoked', status: 409 });
    }
    const url = conn.provider === 'google' ? GOOGLE.tokenUrl : MICROSOFT.tokenUrl(conn.external_tenant || 'organizations');
    r = await postForm(url, {
      client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: refresh,
    });
    if (!r.ok || !r.body?.access_token) {
      const revoked = REVOKED_ERRORS.has(r.body?.error);
      const msg = `${revoked ? 'Zgoda cofnięta lub token wygasł' : 'Nie udało się odświeżyć tokenu'}: ${describeOAuthError(r.body)}`;
      await markConnection(db, conn.id, revoked ? 'revoked' : 'error', msg);
      throw new IntegrationError(msg, { code: revoked ? 'revoked' : 'refresh_failed', status: revoked ? 409 : 502 });
    }
  }

  const accessEnc = await encryptToken(r.body.access_token);
  const refreshEnc = r.body.refresh_token ? await encryptToken(r.body.refresh_token) : null;
  const expiresAt = new Date(Date.now() + (Number(r.body.expires_in) || 3600) * 1000).toISOString();
  const scopes = typeof r.body.scope === 'string' && r.body.scope && conn.provider === 'google' ? r.body.scope.split(/\s+/) : null;
  await db.query(
    `UPDATE integration_connections
        SET access_token_enc = $2, refresh_token_enc = COALESCE($3, refresh_token_enc), expires_at = $4,
            scopes = COALESCE($5::text[], scopes), status = 'active', last_error = NULL, updated_at = now()
      WHERE id = $1`,
    [conn.id, accessEnc, refreshEnc, expiresAt, scopes]
  );
  Object.assign(conn, { access_token_enc: accessEnc, expires_at: expiresAt, status: 'active', last_error: null });
  if (refreshEnc) conn.refresh_token_enc = refreshEnc;
  if (scopes) conn.scopes = scopes;
  return r.body.access_token;
}

// GET JSON z API dostawcy z tokenem połączenia; 401 → jedno wymuszone odświeżenie i ponowienie.
export async function apiGetJson(db, conn, url, { creds = null, headers = {} } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(db, conn, { creds, force: attempt > 0 });
    const res = await globalThis.fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers } });
    if (res.status === 401 && attempt === 0) continue;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new IntegrationError(`${conn.provider === 'google' ? 'Google' : 'Microsoft'}: ${describeOAuthError(body)}`, {
        code: res.status === 403 ? 'forbidden' : 'api_error', status: res.status === 403 ? 403 : 502, detail: res.status,
      });
    }
    return body;
  }
  throw new IntegrationError('Token odrzucony przez dostawcę.', { code: 'unauthorized', status: 502 });
}
