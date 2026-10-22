// Synchronizacja kont z katalogu Google Workspace / Microsoft 365 (Faza 1).
//
// Przebieg: pobranie użytkowników katalogu (paginacja) → normalizacja → plan (computeDirectoryPlan,
// czysta funkcja) → podgląd albo zastosowanie (applyDirectoryPlan) → wpis w directory_sync_runs.
//
// Zasady (nienegocjowalne):
//   • NIGDY nie zmieniamy ról istniejących kont; konto istniejące jest tylko POWIĄZANE (directory_links).
//   • NIGDY nie zakładamy kont spoza dozwolonych domen (ustawienie synchronizacji → sso_allowed_domains
//     → domena połączonego konta administratora).
//   • Pomijamy skrzynki współdzielone / sale / zasoby i gości: MS — accountEnabled=false, brak
//     adresu, userType Guest, #EXT#; Google — suspended / archived.
//   • Blokada przy wyłączeniu/usunięciu w katalogu tylko gdy ustawiono on_disable='block', tylko dla
//     kont POWIĄZANYCH przez synchronizację i NIGDY dla administratorów / superadministratorów.
//   • Pusty katalog albo błąd pobierania = przerwanie bez zmian (nie blokujemy wszystkich przez awarię API).
//   • Harmonogram nie blokuje hurtowo: > max(5, 30% powiązanych) blokad → blokady pominięte z ostrzeżeniem.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { GOOGLE, MICROSOFT, GOOGLE_SCOPES, loadProviderSettings, resolveIntegrationCreds } from './providers.js';
import { IntegrationError, apiGetJson, loadConnection, markConnection } from './tokens.js';
import { logAccountEvent } from '../lib/account-audit.js';
import { revokeSessions } from '../lib/user-admin.js';

export const MAX_PAGES = 200;
export const MAX_GROUPS = 200;

export const DEFAULT_DIRECTORY_SETTINGS = Object.freeze({
  enabled: false,          // synchronizacja automatyczna (co 6 h) — wymaga wcześniejszego „Zastosuj”
  allowed_domains: [],     // puste → sso_allowed_domains → domena połączonego konta
  default_role: 'czlonek',
  mode: 'queue',           // 'queue' — kolejka zatwierdzeń (pending) | 'active' — konta od razu aktywne
  on_disable: 'none',      // 'none' | 'block'
  send_invite: false,      // e-mail „ustaw hasło” dla nowych aktywnych kont (gdy logowanie przez SSO wyłączone)
  first_applied_at: null,
  last_run_at: null,
});

export function normalizeDirectorySettings(raw) {
  const s = { ...DEFAULT_DIRECTORY_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.enabled = s.enabled === true;
  s.allowed_domains = parseDomains(s.allowed_domains);
  s.default_role = String(s.default_role || 'czlonek').slice(0, 50);
  s.mode = s.mode === 'active' ? 'active' : 'queue';
  s.on_disable = s.on_disable === 'block' ? 'block' : 'none';
  s.send_invite = s.send_invite === true;
  return s;
}

export function parseDomains(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[,\s;]+/);
  return [...new Set(arr.map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))];
}

const normEmail = (e) => String(e || '').trim().toLowerCase();
const domainOf = (e) => normEmail(e).split('@')[1] || '';
const looksEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// ── Pobieranie katalogu ────────────────────────────────────────────────────────────────────────

// Google Admin SDK Directory API users.list (customer=my_customer), paginacja nextPageToken.
export async function fetchGoogleUsers(db, conn, opts = {}) {
  const users = [];
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      customer: 'my_customer', maxResults: '500', projection: 'basic', orderBy: 'email',
      fields: 'nextPageToken,users(id,primaryEmail,name/fullName,suspended,archived,aliases,emails,isAdmin)',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const body = await apiGetJson(db, conn, `${GOOGLE.directoryBase}/users?${q}`, opts);
    for (const u of body.users || []) users.push(normalizeGoogleUser(u));
    pageToken = body.nextPageToken || '';
    if (!pageToken) break;
  }
  return users;
}

export async function fetchGoogleGroups(db, conn, opts = {}) {
  if (!(conn.scopes || []).includes(GOOGLE_SCOPES.groupReadonly)) return null;
  const groups = [];
  let pageToken = '';
  for (let page = 0; page < 10 && groups.length < MAX_GROUPS; page++) {
    const q = new URLSearchParams({ customer: 'my_customer', maxResults: '200', fields: 'nextPageToken,groups(id,email,name,directMembersCount)' });
    if (pageToken) q.set('pageToken', pageToken);
    const body = await apiGetJson(db, conn, `${GOOGLE.directoryBase}/groups?${q}`, opts);
    for (const g of body.groups || []) groups.push({ id: g.id, email: g.email || null, name: g.name || g.email || '', members: Number(g.directMembersCount) || 0 });
    pageToken = body.nextPageToken || '';
    if (!pageToken) break;
  }
  return groups.slice(0, MAX_GROUPS);
}

export function normalizeGoogleUser(u) {
  const primary = normEmail(u.primaryEmail);
  const emails = new Set([primary]);
  for (const a of u.aliases || []) emails.add(normEmail(a));
  for (const e of u.emails || []) if (e?.address) emails.add(normEmail(e.address));
  let skip = null;
  if (u.suspended) skip = 'disabled';
  else if (u.archived) skip = 'disabled';
  else if (!looksEmail(primary)) skip = 'no_mail';
  return {
    externalId: String(u.id), email: primary, emails: [...emails].filter(looksEmail),
    name: u.name?.fullName || '', jobTitle: null, isDirectoryAdmin: !!u.isAdmin, skip,
  };
}

// Microsoft Graph GET /users (uprawnienie aplikacji User.Read.All), paginacja @odata.nextLink.
export async function fetchMicrosoftUsers(db, conn, opts = {}) {
  const users = [];
  const select = 'id,displayName,mail,userPrincipalName,accountEnabled,jobTitle,userType,proxyAddresses';
  let url = `${MICROSOFT.graphBase}/users?$select=${select}&$top=999`;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    // nextLink musi wskazywać Graph — nie wysyłamy tokenu pod inny adres.
    if (!url.startsWith(`${MICROSOFT.graphBase}/`)) throw new IntegrationError('Nieprawidłowy adres kolejnej strony z Microsoft Graph.', { code: 'bad_next_link', status: 502 });
    const body = await apiGetJson(db, conn, url, opts);
    for (const u of body.value || []) users.push(normalizeMicrosoftUser(u));
    url = body['@odata.nextLink'] || '';
  }
  return users;
}

export function normalizeMicrosoftUser(u) {
  const mail = normEmail(u.mail);
  const upn = normEmail(u.userPrincipalName);
  const emails = new Set();
  if (mail) emails.add(mail);
  if (upn && !upn.includes('#ext#')) emails.add(upn);
  for (const p of u.proxyAddresses || []) {
    const m = /^smtp:(.+)$/i.exec(String(p));
    if (m) emails.add(normEmail(m[1]));
  }
  let skip = null;
  if (String(u.userType || '').toLowerCase() === 'guest' || upn.includes('#ext#')) skip = 'guest';
  else if (u.accountEnabled === false) skip = 'disabled';
  else if (!mail) skip = 'no_mail'; // konta techniczne / bez skrzynki
  return {
    externalId: String(u.id), email: mail, emails: [...emails].filter(looksEmail),
    name: u.displayName || '', jobTitle: u.jobTitle || null, isDirectoryAdmin: false, skip,
  };
}

// ── Plan (czysta funkcja) ────────────────────────────────────────────────────────────────────

// appUsers: [{ id, email, role, is_active, status, is_super_admin, role_admin }]
// links:    [{ user_id, external_id, email }]
// Zwraca { create, link, linked, block, skipped, counts }.
export function computeDirectoryPlan({ dirUsers, appUsers, links, settings, allowedDomains }) {
  const s = normalizeDirectorySettings(settings);
  const allowed = new Set(allowedDomains || []);
  const byEmail = new Map();
  for (const u of appUsers) { const e = normEmail(u.email); if (e && !byEmail.has(e)) byEmail.set(e, u); }
  const byId = new Map(appUsers.map((u) => [String(u.id), u]));
  const linkByExt = new Map(links.map((l) => [String(l.external_id), l]));
  const linkByUser = new Map(links.map((l) => [String(l.user_id), l]));
  const isProtected = (u) => !!(u && (u.is_super_admin || u.role_admin));
  const isBlocked = (u) => !!(u && (u.status === 'blocked' || u.is_active === false) && u.status !== 'pending');

  const plan = { create: [], link: [], linked: [], block: [], skipped: [], protected: [] };
  const seenExt = new Set();
  const claimedUsers = new Set(); // jedno konto Avenit ↔ jeden użytkownik katalogu
  const createdEmails = new Set();

  const matchUser = (d) => {
    const l = linkByExt.get(d.externalId);
    if (l && byId.has(String(l.user_id))) return { user: byId.get(String(l.user_id)), linked: true };
    for (const e of d.emails) {
      const u = byEmail.get(e);
      if (u && !claimedUsers.has(String(u.id))) {
        const other = linkByUser.get(String(u.id));
        if (other && String(other.external_id) !== d.externalId) continue; // konto powiązane z kimś innym
        return { user: u, linked: false };
      }
    }
    return { user: null, linked: false };
  };

  const blockCandidate = (user, d, reason) => {
    if (s.on_disable !== 'block' || !user || isBlocked(user)) return;
    if (isProtected(user)) { plan.protected.push({ user_id: user.id, email: user.email, reason }); return; }
    plan.block.push({ user_id: user.id, email: user.email, name: d?.name || '', reason });
  };

  for (const d of dirUsers) {
    seenExt.add(d.externalId);
    const { user, linked } = matchUser(d);
    if (user) claimedUsers.add(String(user.id));
    if (d.skip === 'disabled') {
      // Wyłączone w katalogu: tylko konta, które synchronizacja zna (powiązane) albo do których pasuje adres.
      if (user && linked) blockCandidate(user, d, 'disabled');
      else plan.skipped.push({ email: d.email, name: d.name, reason: 'disabled' });
      continue;
    }
    if (d.skip) { plan.skipped.push({ email: d.email || d.emails[0] || null, name: d.name, reason: d.skip }); continue; }
    if (user) {
      const entry = { user_id: user.id, email: user.email, dir_email: d.email, name: d.name, external_id: d.externalId };
      (linked ? plan.linked : plan.link).push(entry);
      continue;
    }
    if (!allowed.has(domainOf(d.email))) { plan.skipped.push({ email: d.email, name: d.name, reason: 'outside_domain' }); continue; }
    if (createdEmails.has(d.email)) { plan.skipped.push({ email: d.email, name: d.name, reason: 'duplicate' }); continue; }
    createdEmails.add(d.email);
    plan.create.push({ email: d.email, name: d.name, external_id: d.externalId, job_title: d.jobTitle });
  }

  // Usunięci z katalogu: powiązania, których external_id nie ma w odpowiedzi.
  for (const l of links) {
    if (seenExt.has(String(l.external_id))) continue;
    const user = byId.get(String(l.user_id));
    blockCandidate(user, { name: '' }, 'removed');
  }

  plan.counts = {
    directory: dirUsers.length,
    create: plan.create.length,
    link: plan.link.length,
    linked: plan.linked.length,
    block: plan.block.length,
    protected: plan.protected.length,
    skipped: plan.skipped.length,
  };
  return plan;
}

// ── Ustawienia / dane wejściowe ─────────────────────────────────────────────────────────────

export async function loadDirectorySettings(db, provider) {
  const row = await loadProviderSettings(db, provider).catch(() => null);
  return normalizeDirectorySettings(row?.directory);
}

export async function saveDirectorySettings(db, provider, patch, actor) {
  const cur = await loadDirectorySettings(db, provider);
  const next = normalizeDirectorySettings({ ...cur, ...patch });
  await db.query(
    `INSERT INTO workspace_integration_settings (provider, directory, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (provider) DO UPDATE SET directory = $2::jsonb, updated_by = $3, updated_at = now()`,
    [provider, JSON.stringify(next), actor || null]
  );
  return next;
}

// Dozwolone domeny: ustawienie synchronizacji → sso_allowed_domains → domena połączonego konta.
export async function effectiveAllowedDomains(db, settings, conn) {
  if (settings.allowed_domains.length) return { domains: settings.allowed_domains, source: 'sync' };
  const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'sso_allowed_domains'`).catch(() => ({ rows: [] }));
  const sso = parseDomains(rows[0]?.value);
  if (sso.length) return { domains: sso, source: 'sso' };
  const own = domainOf(conn?.account_email);
  const ext = conn?.provider === 'google' ? String(conn.external_tenant || '').toLowerCase() : '';
  return { domains: parseDomains([own, ext]), source: 'connection' };
}

async function loadAppUsers(db) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.is_active, u.status, COALESCE(u.is_super_admin, false) AS is_super_admin,
            COALESCE(r.is_admin, false) AS role_admin
       FROM app_users u LEFT JOIN app_roles r ON r.key = u.role`);
  return rows;
}

async function loadLinks(db, provider) {
  const { rows } = await db.query(`SELECT user_id, external_id, email FROM directory_links WHERE provider = $1`, [provider]);
  return rows;
}

// Rola nowych kont: istniejąca, nieadministracyjna; inaczej 'czlonek'.
export async function safeDefaultRole(db, role) {
  const r = String(role || '').trim() || 'czlonek';
  const { rows } = await db.query(`SELECT key, COALESCE(is_admin, false) AS is_admin FROM app_roles WHERE key = $1`, [r]).catch(() => ({ rows: [] }));
  if (!rows[0] || rows[0].is_admin) return 'czlonek';
  return r;
}

// ── Przebieg synchronizacji ─────────────────────────────────────────────────────────────────

async function startRun(db, provider, trigger, dryRun, actor) {
  const { rows } = await db.query(
    `INSERT INTO directory_sync_runs (provider, trigger, dry_run, actor) VALUES ($1, $2, $3, $4) RETURNING id`,
    [provider, trigger, dryRun, actor || null]);
  return rows[0].id;
}
async function finishRun(db, id, status, counts, errors) {
  await db.query(
    `UPDATE directory_sync_runs SET status = $2, counts = $3::jsonb, errors = $4::jsonb, finished_at = now() WHERE id = $1`,
    [id, status, JSON.stringify(counts || {}), JSON.stringify((errors || []).slice(0, 50))]);
}

export async function fetchDirectory(db, conn, opts = {}) {
  if (conn.provider === 'google') return fetchGoogleUsers(db, conn, opts);
  return fetchMicrosoftUsers(db, conn, opts);
}

// Podgląd (dryRun=true) albo zastosowanie. trigger: 'preview' | 'manual' | 'schedule'.
// ctx: { tenantSubdomain, sendInvite (fn(email,{name,link})), log }
export async function runDirectorySync(db, provider, { dryRun = true, trigger = 'manual', actor = null, ctx = {} } = {}) {
  const conn = await loadConnection(db, provider);
  if (!conn) throw new IntegrationError('Najpierw połącz konto administratora.', { code: 'not_connected', status: 409 });
  const settings = await loadDirectorySettings(db, provider);
  const runId = await startRun(db, provider, dryRun ? 'preview' : trigger, dryRun, actor);
  const errors = [];
  try {
    const creds = await resolveIntegrationCreds(db, provider);
    let dirUsers;
    try {
      dirUsers = await fetchDirectory(db, conn, { creds });
    } catch (e) {
      if (e instanceof IntegrationError && e.code !== 'revoked' && e.code !== 'not_configured') {
        await markConnection(db, conn.id, 'error', e.message);
      }
      throw e;
    }
    if (!dirUsers.length) throw new IntegrationError('Katalog nie zwrócił żadnych użytkowników — synchronizacja przerwana bez zmian.', { code: 'empty_directory', status: 502 });
    const { domains, source } = await effectiveAllowedDomains(db, settings, conn);
    const plan = computeDirectoryPlan({
      dirUsers, appUsers: await loadAppUsers(db), links: await loadLinks(db, provider), settings, allowedDomains: domains,
    });
    let groups = null;
    if (dryRun && provider === 'google') groups = await fetchGoogleGroups(db, conn, { creds }).catch(() => null);

    let applied = null;
    if (!dryRun) applied = await applyDirectoryPlan(db, provider, plan, settings, { trigger, actor, ctx, errors });

    const counts = { ...plan.counts, ...(applied ? { applied } : {}) };
    await finishRun(db, runId, errors.length ? 'error' : 'ok', counts, errors);
    if (!dryRun) {
      await saveDirectorySettings(db, provider, {
        last_run_at: new Date().toISOString(),
        ...(settings.first_applied_at ? {} : { first_applied_at: new Date().toISOString() }),
      }, actor);
    }
    return { runId, plan: trimPlan(plan), allowed_domains: domains, allowed_domains_source: source, groups, applied, errors };
  } catch (e) {
    errors.push(e.message);
    await finishRun(db, runId, 'error', {}, errors);
    throw e;
  }
}

// Podgląd dla klienta — listy ograniczone (liczniki pełne).
const LIST_LIMIT = 500;
function trimPlan(plan) {
  const cut = (a) => a.slice(0, LIST_LIMIT);
  return {
    counts: plan.counts,
    create: cut(plan.create), link: cut(plan.link), block: cut(plan.block), protected: cut(plan.protected),
    skipped: cut(plan.skipped), linked_count: plan.linked.length,
  };
}

export async function applyDirectoryPlan(db, provider, plan, settings, { trigger, actor, ctx = {}, errors = [] }) {
  const s = normalizeDirectorySettings(settings);
  const actorTag = `directory:${provider}`;
  const role = await safeDefaultRole(db, s.default_role);
  const active = s.mode === 'active';
  const out = { created: 0, linked: 0, blocked: 0, invited: 0, block_skipped: 0 };

  for (const c of plan.create) {
    try {
      const ins = await db.query(
        // Bez ON CONFLICT (email): unikat na produkcji bywa różny (email / lower(email)) — jawne sprawdzenie.
        `INSERT INTO app_users (email, full_name, name, role, is_active, status, pending_kind, email_verified, password_hash)
         SELECT $1::text, $2::text, $3::text, $4::text, $5::boolean, $6::text, $7::text, true, ''
          WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE lower(email) = lower($1::text))
         RETURNING id`,
        [c.email, c.name || '', c.name || '', role, active, active ? 'active' : 'pending', active ? null : 'admin']
      );
      const id = ins.rows[0]?.id;
      if (!id) { errors.push(`${c.email}: konto już istnieje`); continue; }
      await db.query(
        `INSERT INTO directory_links (provider, external_id, user_id, email, last_seen_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (provider, external_id) DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email, last_seen_at = now()`,
        [provider, c.external_id, id, c.email]);
      out.created++;
      await logAccountEvent(db, { email: c.email, action: active ? 'created' : 'registered', actor: actorTag, detail: trigger });
      if (active && s.send_invite && ctx.sendInvite) {
        try { if (await sendInvitation(db, id, c, ctx)) out.invited++; } catch (e) { errors.push(`${c.email}: zaproszenie — ${e.message}`); }
      }
    } catch (e) { errors.push(`${c.email}: ${e.message}`); }
  }

  for (const l of plan.link) {
    try {
      await db.query(
        `INSERT INTO directory_links (provider, external_id, user_id, email, last_seen_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (provider, external_id) DO NOTHING`,
        [provider, l.external_id, l.user_id, l.dir_email || l.email]);
      out.linked++;
      await logAccountEvent(db, { email: l.email, action: 'directory_linked', actor: actorTag, detail: trigger });
    } catch (e) { errors.push(`${l.email}: ${e.message}`); }
  }

  if (plan.linked.length) {
    await db.query(
      `UPDATE directory_links SET last_seen_at = now() WHERE provider = $1 AND external_id = ANY($2::text[])`,
      [provider, plan.linked.map((l) => String(l.external_id))]);
  }

  if (plan.block.length) {
    const linkedTotal = plan.linked.length + plan.block.length;
    const tooMany = trigger === 'schedule' && plan.block.length > Math.max(5, Math.ceil(linkedTotal * 0.3));
    if (tooMany) {
      out.block_skipped = plan.block.length;
      errors.push(`Pominięto ${plan.block.length} blokad — zbyt wiele naraz w synchronizacji automatycznej; sprawdź podgląd i zastosuj ręcznie.`);
    } else {
      for (const b of plan.block) {
        try {
          // Ponowna kontrola w bazie: nigdy administrator / superadministrator.
          const { rowCount } = await db.query(
            `UPDATE app_users u SET is_active = false, status = 'blocked', pending_kind = NULL
              WHERE u.id = $1 AND COALESCE(u.is_super_admin, false) = false
                AND NOT EXISTS (SELECT 1 FROM app_roles r WHERE r.key = u.role AND r.is_admin = true)`,
            [b.user_id]);
          if (!rowCount) continue;
          await revokeSessions(db, b.user_id);
          await db.query(`UPDATE directory_links SET blocked_by_sync_at = now() WHERE provider = $1 AND user_id = $2`, [provider, b.user_id]);
          out.blocked++;
          await logAccountEvent(db, { email: b.email, action: 'blocked', actor: actorTag, detail: b.reason === 'removed' ? 'usunięte z katalogu' : 'wyłączone w katalogu' });
        } catch (e) { errors.push(`${b.email}: ${e.message}`); }
      }
    }
  }
  return out;
}

// Zaproszenie „ustaw hasło” (jak admin-create-user): token 7-dniowy + e-mail.
async function sendInvitation(db, userId, c, ctx) {
  if (!ctx.tenantSubdomain) return false;
  const raw = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  await db.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '7 days')`, [userId, tokenHash]);
  await db.query(`UPDATE app_users SET invited_at = now() WHERE id = $1`, [userId]).catch(() => {});
  await ctx.sendInvite(c.email, { name: c.name, link: `https://${ctx.tenantSubdomain}.${config.APP_DOMAIN}/reset-password?token=${raw}` });
  return true;
}

export async function syncHistory(db, provider, limit = 20) {
  const { rows } = await db.query(
    `SELECT id, provider, trigger, dry_run, status, counts, errors, actor, started_at, finished_at
       FROM directory_sync_runs WHERE provider = $1 ORDER BY started_at DESC LIMIT $2`, [provider, limit]);
  return rows;
}
