// Social Media — kanały (social_accounts) i łączenie z Meta.
//
// Start (fn social, akcja 'connect', prawo action:social:manage_accounts): wiersz
// social_oauth_states (hash nonce) + podpisany `state` { kościół, id stanu } + ciasteczko nonce na
// domenie nadrzędnej — callback na app.<domena> sprawdza, że wraca TA SAMA przeglądarka (bez tego
// cudzy link autoryzacji podpiąłby strony ofiary pod kościół atakującego).
// Callback (social/routes.js): kod → token długoterminowy → strony z tokenami + konta IG →
// upsert kanałów. Strony, na których osoba nie może tworzyć treści, pomijamy.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { encryptPassword, decryptPassword } from '../lib/mailcrypto.js';
import {
  SocialError, metaConfigured, authorizeUrl, exchangeCode, longLivedToken, fetchMe, fetchPages, fetchGrantedScopes,
  canCreateOnPage, REQUIRED_PAGE_SCOPE, REQUIRED_IG_SCOPE,
} from './meta.js';

export const STATE_TTL_MS = 10 * 60 * 1000;
export const NONCE_COOKIE = 'avenit_social';

const secret = () => config.MAIL_ENCRYPTION_SECRET || config.JWT_SECRET;
export const encryptToken = async (v) => encryptPassword(String(v), secret());
export const decryptToken = async (v) => (v ? decryptPassword(v, secret()) : null);

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const hmac = (payload) => crypto.createHmac('sha256', config.JWT_SECRET).update(`social:${payload}`).digest('hex');

export function signSocialState({ tenant, stateId, provider }) {
  const payload = Buffer.from(JSON.stringify({ t: tenant, s: stateId, p: provider })).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function verifySocialState(state) {
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

// Kanał dla przeglądarki — bez tokenów.
export function publicAccount(a) {
  if (!a) return null;
  return {
    id: a.id, provider: a.provider, external_id: a.external_id, name: a.name, username: a.username,
    avatar_url: a.avatar_url, page_id: a.page_id, status: a.status, last_error: a.last_error,
    connected_by: a.connected_by, created_at: a.created_at, updated_at: a.updated_at,
  };
}

export async function listAccounts(db) {
  const { rows } = await db.query(`SELECT * FROM social_accounts ORDER BY provider, name`);
  return rows;
}

export async function loadAccount(db, id) {
  const { rows } = await db.query(`SELECT * FROM social_accounts WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function markAccount(db, id, status, error = null) {
  await db.query(`UPDATE social_accounts SET status = $2, last_error = $3, updated_at = now() WHERE id = $1`,
    [id, status, error ? String(error).slice(0, 500) : null]);
}

// ── Łączenie ─────────────────────────────────────────────────────────────────
export async function startConnect(db, { tenant, user }) {
  if (!metaConfigured()) {
    throw new SocialError('Łączenie z Facebookiem jest niedostępne — aplikacja Meta nie jest skonfigurowana na platformie.', {
      code: 'not_configured', status: 503,
    });
  }
  await db.query(`DELETE FROM social_oauth_states WHERE expires_at < now()`);
  const nonce = crypto.randomBytes(24).toString('base64url');
  const { rows } = await db.query(
    `INSERT INTO social_oauth_states (provider, user_id, user_email, nonce_hash, expires_at)
     VALUES ('meta', $1, $2, $3, $4) RETURNING id`,
    [user?.id ? String(user.id) : null, user?.email || null, sha256(nonce), new Date(Date.now() + STATE_TTL_MS).toISOString()]);
  const state = signSocialState({ tenant, stateId: rows[0].id, provider: 'meta' });
  return { url: authorizeUrl(state), nonce };
}

async function takeState(db, stateId, nonceCookie) {
  const { rows } = await db.query(`SELECT * FROM social_oauth_states WHERE id = $1`, [stateId]);
  const st = rows[0];
  if (!st) return null;
  await db.query(`DELETE FROM social_oauth_states WHERE id = $1`, [stateId]);
  if (new Date(st.expires_at).getTime() < Date.now()) return null;
  if (!nonceCookie || sha256(nonceCookie) !== st.nonce_hash) return null;
  return st;
}

// Upsert kanału po (provider, external_id). Ponowne połączenie odświeża token i przywraca 'active'.
async function upsertAccount(db, a) {
  const tokenEnc = await encryptToken(a.token);
  const { rows } = await db.query(
    `INSERT INTO social_accounts (provider, external_id, name, username, avatar_url, page_id, access_token_enc,
                                  token_expires_at, fb_user_id, scopes, status, last_error, connected_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], 'active', NULL, $11)
     ON CONFLICT (provider, external_id) DO UPDATE SET
       name = EXCLUDED.name, username = EXCLUDED.username, avatar_url = EXCLUDED.avatar_url,
       page_id = EXCLUDED.page_id, access_token_enc = EXCLUDED.access_token_enc,
       token_expires_at = EXCLUDED.token_expires_at, fb_user_id = EXCLUDED.fb_user_id, scopes = EXCLUDED.scopes,
       status = 'active', last_error = NULL, connected_by = EXCLUDED.connected_by, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [a.provider, a.external_id, a.name || '', a.username || null, a.avatar_url || null, a.page_id || null,
      tokenEnc, null, a.fb_user_id || null, a.scopes || [], a.connected_by || null]);
  return rows[0]?.inserted ? 'added' : 'updated';
}

// Callback → { result: 'connected' | 'error', reason?, added, updated, account? }. Nie rzuca dla
// błędów użytkownika — wołający przekierowuje do modułu z komunikatem.
export async function handleMetaCallback(db, { stateId, query, nonceCookie }) {
  const fail = (reason, message) => ({ result: 'error', reason, message });
  const st = await takeState(db, stateId, nonceCookie);
  if (!st) return fail('state', 'Sesja łączenia wygasła albo pochodzi z innej przeglądarki.');
  if (query.error) return fail(query.error === 'access_denied' || query.error_reason === 'user_denied' ? 'denied' : 'provider', String(query.error_description || query.error));
  const code = String(query.code || '');
  if (!code) return fail('error', 'Brak kodu autoryzacji.');
  if (!metaConfigured()) return fail('not_configured', 'Brak aplikacji Meta.');

  try {
    const short = await exchangeCode(code);
    const { token } = await longLivedToken(short);
    const [me, scopes, pages] = await Promise.all([fetchMe(token), fetchGrantedScopes(token).catch(() => []), fetchPages(token)]);
    if (!scopes.includes(REQUIRED_PAGE_SCOPE)) return fail('scopes', 'Nie udzielono zgody na publikowanie na stronach.');
    const usable = pages.filter((p) => p?.id && p.access_token && canCreateOnPage(p));
    if (!usable.length) return fail('no_pages', 'Nie znaleziono stron, na których możesz publikować.');
    const igAllowed = scopes.includes(REQUIRED_IG_SCOPE);
    let added = 0, updated = 0;
    for (const p of usable) {
      const base = { fb_user_id: me?.id, scopes, connected_by: st.user_email, token: p.access_token };
      const r1 = await upsertAccount(db, {
        ...base, provider: 'facebook', external_id: String(p.id), name: p.name,
        avatar_url: p.picture?.data?.url || null, page_id: String(p.id),
      });
      r1 === 'added' ? added++ : updated++;
      const ig = p.instagram_business_account;
      if (ig?.id && igAllowed) {
        const r2 = await upsertAccount(db, {
          ...base, provider: 'instagram', external_id: String(ig.id), name: ig.name || ig.username || p.name,
          username: ig.username || null, avatar_url: ig.profile_picture_url || null, page_id: String(p.id),
        });
        r2 === 'added' ? added++ : updated++;
      }
    }
    return { result: 'connected', added, updated, account: st.user_email };
  } catch (e) {
    return fail(e.code || 'error', e.message);
  }
}

// Usunięcie danych na żądanie Meta (data deletion / deauthorize) — kanały połączone przez tę osobę.
export async function removeAccountsOfMetaUser(db, fbUserId) {
  if (!fbUserId) return 0;
  const { rowCount } = await db.query(`DELETE FROM social_accounts WHERE fb_user_id = $1`, [String(fbUserId)]);
  return rowCount || 0;
}
