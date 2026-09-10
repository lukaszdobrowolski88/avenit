// SSO (OIDC Google / Microsoft) — wspólna logika. Model WIELOTENANTOWY:
// jeden stały URI przekierowania na centralnym hoście app.<domena>, tenant przenoszony w `state`.
// Dzięki temu jedna aplikacja OAuth na dostawcę obsługuje WSZYSTKIE subdomeny — bez zakładania
// nowej aplikacji per subdomena. Poświadczenia: platformowe (env) LUB własne tenanta (app_settings).
import crypto from 'node:crypto';
import { config } from '../config.js';
import { decryptPassword } from './mailcrypto.js';

export const SSO_PROVIDERS = {
  google: {
    authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: () => 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
  },
  microsoft: {
    authUrl: (t) => `https://login.microsoftonline.com/${t || 'common'}/oauth2/v2.0/authorize`,
    tokenUrl: (t) => `https://login.microsoftonline.com/${t || 'common'}/oauth2/v2.0/token`,
    scope: 'openid email profile',
  },
};

const SSO_SECRET = () => config.MAIL_ENCRYPTION_SECRET || config.JWT_SECRET;

// Jeden URI przekierowania dla wszystkich tenantów (centralny host app.<domena>).
export const ssoRedirectBase = () => `https://app.${config.APP_DOMAIN}`;
export const ssoRedirectUri = (provider) => `${ssoRedirectBase()}/api/auth/oauth/${provider}/callback`;

// Ustawienia SSO tenanta (włączenie + ewentualne własne poświadczenia).
export async function getSSOTenantConfig(db) {
  const { rows } = await db.query(`SELECT key, value FROM app_settings WHERE key LIKE 'sso\\_%'`);
  const m = {};
  rows.forEach((r) => { m[r.key] = r.value; });
  return {
    google: { enabled: m.sso_google_enabled === 'on', clientId: m.sso_google_client_id || '', secretEnc: m.sso_google_client_secret_enc || '' },
    microsoft: { enabled: m.sso_microsoft_enabled === 'on', clientId: m.sso_microsoft_client_id || '', secretEnc: m.sso_microsoft_client_secret_enc || '', tenant: m.sso_microsoft_tenant || '' },
    autoProvision: m.sso_auto_provision === 'on',
    defaultRole: m.sso_default_role || null,
    // Zabezpieczenia auto-provisioningu: allowlist domen e-mail (pusta = dowolna)
    // oraz wymóg zatwierdzenia (nowe konta SSO lądują jako pending do akceptacji).
    allowedDomains: String(m.sso_allowed_domains || '')
      .split(/[,\s]+/).map((s) => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
    requireApproval: m.sso_provision_approval === 'on',
  };
}

// Poświadczenia dostawcy: własne tenanta (jeśli podane) albo platformowe (env). enabled — z tenanta.
export async function resolveProviderCreds(db, provider) {
  const cfg = await getSSOTenantConfig(db);
  const pc = cfg[provider] || {};
  let clientId = pc.clientId;
  let clientSecret = '';
  if (pc.secretEnc) { try { clientSecret = await decryptPassword(pc.secretEnc, SSO_SECRET()); } catch { clientSecret = ''; } }
  let msTenant = provider === 'microsoft' ? (pc.tenant || '') : '';
  if (!clientId) {
    clientId = config[`SSO_${provider.toUpperCase()}_CLIENT_ID`] || '';
    clientSecret = config[`SSO_${provider.toUpperCase()}_CLIENT_SECRET`] || '';
    if (provider === 'microsoft') msTenant = msTenant || config.SSO_MICROSOFT_TENANT || 'common';
  }
  if (provider === 'microsoft' && !msTenant) msTenant = 'common';
  return {
    enabled: !!pc.enabled, clientId, clientSecret, msTenant,
    autoProvision: cfg.autoProvision, defaultRole: cfg.defaultRole,
    allowedDomains: cfg.allowedDomains, requireApproval: cfg.requireApproval,
  };
}

// Dostępność dostawcy dla przycisków logowania: włączony przez tenanta + są jakiekolwiek poświadczenia.
export async function ssoAvailability(db) {
  const g = await resolveProviderCreds(db, 'google');
  const m = await resolveProviderCreds(db, 'microsoft');
  return { google: g.enabled && !!g.clientId, microsoft: m.enabled && !!m.clientId, redirectBase: ssoRedirectBase() };
}

// State: podpisany HMAC payload z providerem, slug tenanta, nonce i exp.
export function signState({ provider, tenant, nonce, exp }) {
  const payload = Buffer.from(`${provider}.${tenant}.${nonce}.${exp}`).toString('base64url');
  const sig = crypto.createHmac('sha256', config.JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
export function verifyState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', config.JWT_SECRET).update(payload).digest('hex');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let parts;
  try { parts = Buffer.from(payload, 'base64url').toString().split('.'); } catch { return null; }
  const [provider, tenant, nonce, exp] = parts;
  if (!provider || !tenant || Number(exp) < Date.now()) return null;
  return { provider, tenant, nonce };
}

// Wymiana kodu na id_token → zwraca payload (email, name) lub null.
export async function exchangeCode(provider, { clientId, clientSecret, msTenant, code }) {
  const P = SSO_PROVIDERS[provider];
  if (!P) return null;
  const res = await fetch(P.tokenUrl(msTenant), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, code,
      redirect_uri: ssoRedirectUri(provider), grant_type: 'authorization_code',
    }),
  });
  const tok = await res.json().catch(() => null);
  if (!res.ok || !tok?.id_token) return null;
  try { return JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString()); } catch { return null; }
}
