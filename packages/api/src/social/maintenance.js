// Social Media — codzienne utrzymanie (worker: fn/social-maintenance.js, 04:20 czasu polskiego).
//
// 1) Kanały: lekkie zapytanie Graph każdym tokenem. Nieważny token → 'revoked' + powiadomienie
//    zarządzających kanałami i autorów postów zaplanowanych na ten kanał — zanim publikacja
//    się wyłoży. Przy okazji odświeżamy nazwę i zdjęcie profilowe (adresy zdjęć z CDN Meta
//    wygasają po kilku dniach, więc bez tego awatary w Avenit znikały).
// 2) Pliki: katalogi w buckecie social-media, do których nie odwołuje się żaden post ani
//    publikacja w kanale, starsze niż ORPHAN_DAYS (świeże mogą należeć do niezapisanego
//    jeszcze kompozytora) — usuwane razem z miniaturami i wpisami storage_objects.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { graph } from './meta.js';
import { decryptToken, markAccount } from './accounts.js';
import { usersWithCapability } from './service.js';
import { deliverNotifications } from '../dataapi/boardNotify.js';
import { emitChange } from '../realtime/hub.js';
import { SOCIAL_BUCKET } from './publish.js';

export const ORPHAN_DAYS = 3;
const DAY = 86_400_000;
const lower = (v) => String(v ?? '').trim().toLowerCase();

async function fetchProfile(account, token) {
  if (account.provider === 'instagram') {
    const r = await graph('GET', `/${account.external_id}`, { token, params: { fields: 'id,username,name,profile_picture_url' } });
    return { name: r.name || r.username || account.name, username: r.username || account.username, avatar_url: r.profile_picture_url || null };
  }
  const r = await graph('GET', `/${account.external_id}`, { token, params: { fields: 'id,name,picture.type(large){url}' } });
  return { name: r.name || account.name, username: null, avatar_url: r.picture?.data?.url || null };
}

export async function checkAccounts(ctx) {
  const db = ctx.db;
  const deliver = ctx.deps?.deliver || deliverNotifications;
  const { rows: accounts } = await db.query(`SELECT * FROM social_accounts`);
  const stats = { ok: 0, revoked: 0, errors: 0 };
  const newlyRevoked = [];
  for (const a of accounts) {
    try {
      const token = await decryptToken(a.access_token_enc);
      if (!token) throw Object.assign(new Error('Brak tokenu kanału — połącz kanał ponownie.'), { tokenInvalid: true });
      const p = await fetchProfile(a, token);
      await db.query(
        `UPDATE social_accounts SET name = $2, username = COALESCE($3, username), avatar_url = COALESCE($4, avatar_url),
                status = 'active', last_error = NULL, updated_at = now() WHERE id = $1`,
        [a.id, p.name, p.username, p.avatar_url]);
      stats.ok += 1;
    } catch (e) {
      if (e.tokenInvalid) {
        if (a.status !== 'revoked') newlyRevoked.push(a);
        await markAccount(db, a.id, 'revoked', e.message);
        stats.revoked += 1;
      } else if (e.code === 'permission') {
        await markAccount(db, a.id, 'error', e.message);
        stats.errors += 1;
      } else {
        stats.errors += 1; // chwilowy błąd Meta — nie zmieniamy statusu
      }
    }
  }
  if (newlyRevoked.length) {
    const managers = await usersWithCapability(db, ctx.dbName, 'action:social:manage_accounts');
    for (const a of newlyRevoked) {
      const { rows } = await db.query(
        `SELECT DISTINCT p.created_by FROM social_posts p JOIN social_post_targets t ON t.post_id = p.id
          WHERE t.account_id = $1 AND p.status IN ('scheduled', 'pending_approval') AND p.created_by IS NOT NULL`, [a.id]);
      const who = [...new Set([...managers, ...rows.map((r) => lower(r.created_by))])].filter(Boolean);
      const name = a.provider === 'instagram' && a.username ? `@${a.username}` : a.name;
      try {
        await deliver({
          db, tenant: { slug: ctx.tenantSlug }, log: ctx.log,
          entries: who.map((user_email) => ({
            user_email, type: 'social', title: 'Kanał wymaga ponownego połączenia',
            body: rows.length ? `${name} — zaplanowane posty się nie opublikują, dopóki ktoś nie połączy kanału ponownie.` : `${name} — połącz kanał ponownie w zakładce Kanały.`,
            link: '/social?tab=channels', data: { account_id: a.id },
          })),
        });
      } catch { /* powiadomienie nie blokuje */ }
    }
  }
  if (accounts.length) {
    try { (ctx.deps?.emit || emitChange)(ctx.tenantSlug, 'social_accounts', 'update', [{ id: null }]); } catch { /* realtime */ }
  }
  return stats;
}

// Ścieżki plików używanych przez posty (media posta i własne media kanałów).
async function referencedDirs(db) {
  const { rows } = await db.query(
    `SELECT media FROM social_posts UNION ALL SELECT media FROM social_post_targets WHERE media IS NOT NULL`);
  const dirs = new Set();
  const add = (p) => { const dir = String(p || '').split('/')[0]; if (dir) dirs.add(dir); };
  for (const r of rows) for (const m of Array.isArray(r.media) ? r.media : []) add(m?.path);
  // Pomysły i biblioteka mediów (migracja 124) — ich plików też nie usuwamy.
  const { rows: ideas } = await db.query(`SELECT media FROM social_ideas`).catch(() => ({ rows: [] }));
  for (const r of ideas) for (const m of Array.isArray(r.media) ? r.media : []) add(m?.path);
  const { rows: lib } = await db.query(`SELECT path FROM social_media_items`).catch(() => ({ rows: [] }));
  for (const r of lib) add(r.path);
  return dirs;
}

export async function cleanupMedia(ctx, { now = Date.now(), baseDir = config.STORAGE_DIR } = {}) {
  const root = path.resolve(baseDir, String(ctx.tenantSlug), SOCIAL_BUCKET);
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return { removed: 0 }; }
  const used = await referencedDirs(ctx.db);
  let removed = 0;
  for (const e of entries) {
    if (!e.isDirectory() || used.has(e.name) || !/^[A-Za-z0-9_-]{1,80}$/.test(e.name)) continue;
    const dir = path.join(root, e.name);
    const st = await fs.stat(dir).catch(() => null);
    if (!st || now - st.mtimeMs < ORPHAN_DAYS * DAY) continue;
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(path.resolve(baseDir, String(ctx.tenantSlug), '.thumbs', SOCIAL_BUCKET, e.name), { recursive: true, force: true }).catch(() => {});
    await ctx.db.query(`DELETE FROM storage_objects WHERE bucket = $1 AND path LIKE $2`, [SOCIAL_BUCKET, `${e.name}/%`]).catch(() => {});
    removed += 1;
  }
  return { removed };
}

export async function runMaintenance(ctx) {
  const accounts = await checkAccounts(ctx);
  const media = await cleanupMedia(ctx).catch((e) => { ctx.log?.error?.({ err: e }, 'social: sprzątanie plików'); return { removed: 0 }; });
  return { ...accounts, removed: media.removed };
}
