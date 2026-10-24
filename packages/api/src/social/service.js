// Social Media — posty, akceptacja, kolejka i publikacja (fn social + worker co minutę).
//
// Uprawnienia (macierz Ustawienia → Uprawnienia, moduł „Social Media”):
//   module:social                    — wgląd w moduł (kalendarz, kolejka, kanały),
//   res:social_posts:create          — tworzenie szkiców i wysyłanie do akceptacji; własne posty
//                                      (nieopublikowane) autor edytuje i usuwa zawsze,
//   res:social_posts:update/delete   — edycja / usuwanie CUDZYCH postów,
//   action:social:publish            — publikowanie i planowanie bez akceptacji, zatwierdzanie
//                                      i odsyłanie postów innych, ponawianie nieudanych,
//   action:social:manage_accounts    — podłączanie i odłączanie kanałów.
// Osoba bez prawa publikacji zmieniająca zaplanowany post odsyła go z powrotem do akceptacji.
//
// Statusy posta: draft → pending_approval → scheduled → publishing → published | partial | failed.
// Worker: należne posty → 'publishing', przejęcie celów (FOR UPDATE SKIP LOCKED + dzierżawa),
// publikacja, ponowienia błędów chwilowych z przerwą (1/5/15 min), status całości z celów,
// powiadomienie autora o błędzie. Cel „publishing” po wygaśnięciu dzierżawy NIE jest ponawiany
// automatycznie (post mógł już wyjść) — kończy jako błąd z prośbą o sprawdzenie strony.
//
// Zależności wstrzykiwane (testy): ctx.deps = { emit, deliver, now, sleep, convertImage }.
import { loadGrants } from '../dataapi/registry.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { emitChange } from '../realtime/hub.js';
import { deliverNotifications } from '../dataapi/boardNotify.js';
import { SocialError } from './meta.js';
import { decryptToken, markAccount, publicAccount, listAccounts } from './accounts.js';
import { publishTarget, postFirstComment, MEDIA_PATH_RE } from './publish.js';
import { loadSettings, shortenForTarget } from './links.js';
import {
  SOCIAL_PROVIDERS, validateTarget, effectiveTarget, nextQueueSlot, aggregatePostStatus, isValidSlot,
  EDITABLE_STATUSES, MAX_MEDIA, MAX_TARGETS, MAX_CONTENT, charCount,
} from '@avenit/shared/src/lib/social.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lower = (v) => String(v ?? '').trim().toLowerCase();
const MIN = 60_000;
export const MAX_ATTEMPTS = 4;
export const RETRY_DELAYS_MIN = [1, 5, 15];
export const PROCESSING_TIMEOUT_MS = 45 * MIN;
const CLAIM_BATCH = 20;

export const MSG = {
  noAccess: 'Brak dostępu do modułu Social Media.',
  noCreate: 'Nie masz uprawnień do tworzenia postów.',
  noPublish: 'Nie masz uprawnień do publikowania — wyślij post do akceptacji.',
  noManage: 'Nie masz uprawnień do zarządzania kanałami.',
  notFound: 'Nie znaleziono posta.',
  notEditable: 'Tego posta nie można już zmienić (jest publikowany albo opublikowany).',
  notYours: 'Możesz zmieniać tylko własne posty.',
  noTargets: 'Wybierz co najmniej jeden kanał.',
  badTime: 'Wybierz termin w przyszłości (najwyżej rok naprzód).',
  noSlots: 'Kolejka nie ma ustawionych godzin publikacji — dodaj je w zakładce Kanały albo wybierz termin.',
  badAccount: 'Wybrany kanał nie istnieje albo wymaga ponownego połączenia.',
  tooLong: 'Tekst jest za długi.',
  badMedia: 'Nieprawidłowy plik w poście.',
};

const err = (status, message, code = 'BAD_REQUEST', extra = {}) => Object.assign(new SocialError(message, { status, code }), extra);

// ── Kontekst ────────────────────────────────────────────────────────────────
export function socialDeps(extra = {}) {
  return { emit: emitChange, deliver: deliverNotifications, now: () => new Date(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), ...extra };
}

export function ctxFromRequest(req) {
  return {
    db: req.db,
    tenantSlug: req.tenant?.slug,
    tenantSubdomain: req.tenant?.subdomain || req.tenant?.slug,
    dbName: req.tenant?.db_name || req.tenant?.slug,
    log: req.log,
    deps: socialDeps(),
  };
}

export function ctxFromWorker(pool, w = {}, extra = {}) {
  return {
    db: pool,
    tenantSlug: w.tenantSlug,
    tenantSubdomain: w.tenantSubdomain || w.tenantSlug,
    dbName: w.tenantDbName || w.tenantSlug,
    log: { error: (o, m) => w.log?.(m || '', o?.err?.message || ''), warn: (o, m) => w.log?.(m || '', o?.err?.message || '') },
    deps: socialDeps(extra),
  };
}

const nowOf = (ctx) => (ctx.deps?.now ? ctx.deps.now() : new Date());
const emit = (ctx, table, op, rows) => {
  try { (ctx.deps?.emit || emitChange)(ctx.tenantSlug, table, op, rows); } catch { /* realtime nie blokuje */ }
};
const logErr = (ctx, e, msg) => { try { ctx.log?.error?.({ err: e }, msg); } catch { /* log */ } };

// Prawa osoby w module (żywa baza — granty z ról, nadpisań i przynależności do służb).
export async function socialAccess(db, user, dbName) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.is_active, COALESCE(u.is_super_admin, false) AS is_super_admin
       FROM app_users u WHERE u.id = $1`, [user?.id]);
  const me = rows[0];
  const none = { me, admin: false, view: false, create: false, updateAll: false, deleteAll: false, publish: false, manage: false, engage: false };
  if (!me || me.is_active === false) return none;
  const { grants, adminRoles } = await loadGrants(db, dbName);
  if (me.is_super_admin || adminRoles.has(me.role) || grants === null) {
    return { me, admin: true, view: true, create: true, updateAll: true, deleteAll: true, publish: true, manage: true, engage: true };
  }
  const r = makeResolver(grants, { role: me.role, userId: me.id, isAdmin: false });
  const view = r.can('module:social');
  if (!view) return none;
  return {
    me, admin: false, view,
    create: r.can('res:social_posts:create'),
    updateAll: r.can('res:social_posts:update'),
    deleteAll: r.can('res:social_posts:delete'),
    publish: r.can('action:social:publish'),
    manage: r.can('action:social:manage_accounts'),
    engage: r.can('action:social:engage'),
  };
}

export const publicAccess = (a) => ({
  view: a.view, create: a.create, update_all: a.updateAll, delete_all: a.deleteAll, publish: a.publish, manage: a.manage, engage: a.engage, admin: a.admin,
});

// Osoby z danym prawem (powiadomienia do zatwierdzających).
export async function usersWithCapability(db, dbName, capability) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, COALESCE(u.is_super_admin, false) AS is_super_admin
       FROM app_users u WHERE COALESCE(u.is_active, true) = true AND u.email IS NOT NULL`);
  const { grants, adminRoles } = await loadGrants(db, dbName);
  return rows.filter((u) => {
    if (u.is_super_admin || adminRoles.has(u.role)) return true;
    if (grants === null) return false;
    const r = makeResolver(grants, { role: u.role, userId: u.id, isAdmin: false });
    return r.can('module:social') && r.can(capability);
  }).map((u) => lower(u.email));
}

async function notify(ctx, emails, { title, body, postId }) {
  const list = [...new Set((emails || []).map(lower).filter(Boolean))];
  if (!list.length) return;
  try {
    await (ctx.deps?.deliver || deliverNotifications)({
      db: ctx.db, tenant: { slug: ctx.tenantSlug }, log: ctx.log,
      entries: list.map((user_email) => ({
        user_email, type: 'social', title, body, link: `/social?post=${postId}`, data: { post_id: postId },
      })),
    });
  } catch (e) { logErr(ctx, e, 'social: powiadomienie nie powiodło się'); }
}

// Historia posta (migracja 122). Brak tabeli (tenant przed migracją) nie blokuje akcji.
async function logActivity(ctx, postId, kind, actor = null, note = null) {
  try {
    await ctx.db.query(`INSERT INTO social_post_activity (post_id, kind, actor, note) VALUES ($1, $2, $3, $4)`,
      [postId, kind, actor ? lower(actor) : null, note ? String(note).slice(0, 2000) : null]);
  } catch (e) {
    if (e?.code !== '42P01') logErr(ctx, e, 'social: zapis historii');
  }
}

// Kto widzi post: szkic tylko autor, osoby edytujące cudze posty i publikujący.
export const canSeePost = (access, post) => post.status !== 'draft' || access.admin || access.updateAll || access.publish
  || lower(post.created_by) === lower(access.me?.email);

// ── Odczyt ──────────────────────────────────────────────────────────────────
async function targetsOf(db, postIds) {
  if (!postIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT id, post_id, account_id, provider, account_name, content, media, options, status, attempts,
            next_attempt_at, external_id, permalink, error, published_at, updated_at
       FROM social_post_targets WHERE post_id = ANY($1::uuid[]) ORDER BY created_at`, [postIds]);
  const map = new Map();
  for (const t of rows) {
    if (!map.has(t.post_id)) map.set(t.post_id, []);
    map.get(t.post_id).push(t);
  }
  return map;
}

async function withTargets(db, posts) {
  const map = await targetsOf(db, posts.map((p) => p.id));
  return posts.map((p) => ({ ...p, targets: map.get(p.id) || [] }));
}

export async function loadPost(db, id) {
  if (!UUID_RE.test(String(id || ''))) return null;
  const { rows } = await db.query(`SELECT * FROM social_posts WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  return (await withTargets(db, rows))[0];
}

// Widoki: calendar (zakres dat), queue (zaplanowane i w trakcie), approval, drafts, sent.
export async function listPosts(ctx, access, body = {}) {
  const view = String(body.view || 'queue');
  const params = [];
  let where;
  let order = 'ORDER BY COALESCE(p.scheduled_at, p.published_at, p.updated_at) ASC';
  let limit = 500;
  if (view === 'calendar') {
    const from = new Date(body.from), to = new Date(body.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to - from > 100 * 24 * 60 * MIN) {
      throw err(400, 'Nieprawidłowy zakres dat.');
    }
    params.push(from.toISOString(), to.toISOString());
    where = `COALESCE(p.published_at, p.scheduled_at) >= $1 AND COALESCE(p.published_at, p.scheduled_at) < $2`;
  } else if (view === 'approval') {
    where = `p.status = 'pending_approval'`;
  } else if (view === 'drafts') {
    where = `p.status = 'draft'`;
    order = 'ORDER BY p.updated_at DESC';
  } else if (view === 'sent') {
    where = `p.status IN ('published', 'partial', 'failed')`;
    order = 'ORDER BY COALESCE(p.published_at, p.updated_at) DESC';
    limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);
  } else {
    where = `p.status IN ('scheduled', 'publishing')`;
  }
  // Szkice są prywatne dla autora, chyba że osoba może edytować cudze posty albo publikuje.
  if (!access.admin && !access.updateAll && !access.publish) {
    params.push(lower(access.me?.email));
    where += ` AND (p.status <> 'draft' OR lower(p.created_by) = $${params.length})`;
  }
  const { rows } = await ctx.db.query(`SELECT p.* FROM social_posts p WHERE ${where} ${order} LIMIT ${limit}`, params);
  return withTargets(ctx.db, rows);
}

export async function counts(ctx, access) {
  const params = [];
  let draftCond = '';
  if (!access.admin && !access.updateAll && !access.publish) {
    params.push(lower(access.me?.email));
    draftCond = ` AND lower(created_by) = $1`;
  }
  const { rows } = await ctx.db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending_approval') AS approval,
       COUNT(*) FILTER (WHERE status IN ('scheduled', 'publishing')) AS queue,
       COUNT(*) FILTER (WHERE status = 'draft'${draftCond}) AS drafts,
       COUNT(*) FILTER (WHERE status IN ('failed', 'partial') AND updated_at > now() - interval '14 days') AS failed
     FROM social_posts`, params);
  const r = rows[0] || {};
  return { approval: Number(r.approval) || 0, queue: Number(r.queue) || 0, drafts: Number(r.drafts) || 0, failed: Number(r.failed) || 0 };
}

// ── Walidacja wejścia ───────────────────────────────────────────────────────
function cleanMedia(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > MAX_MEDIA) throw err(400, MSG.badMedia);
  return list.map((m) => {
    const path = String(m?.path || '');
    if (!MEDIA_PATH_RE.test(path) || path.includes('..')) throw err(400, MSG.badMedia);
    const mime = String(m?.mime || '').toLowerCase().slice(0, 100);
    const kind = m?.kind === 'video' || mime.startsWith('video/') ? 'video' : 'image';
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 1000) / 1000 : null);
    return {
      path, mime, kind,
      width: num(m.width), height: num(m.height), size: num(m.size), duration: num(m.duration),
      alt: m.alt ? String(m.alt).slice(0, 1000) : null,
      name: m.name ? String(m.name).slice(0, 200) : null,
    };
  });
}

function cleanOptions(provider, o = {}) {
  const out = {};
  if (o.first_comment) out.first_comment = String(o.first_comment).slice(0, 2200);
  if (provider === 'instagram' && SOCIAL_PROVIDERS.instagram.formats.includes(o.format)) out.format = o.format;
  if (provider === 'instagram' && o.share_to_feed === false) out.share_to_feed = false;
  if (provider === 'facebook' && o.link && /^https?:\/\/\S+$/i.test(String(o.link))) out.link = String(o.link).slice(0, 2000);
  if (provider === 'facebook' && o.format === 'reel') out.format = 'reel';
  return out;
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t || '').trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
}

function parseTime(v, now) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) return null;
  if (d.getTime() < now.getTime() - MIN || d.getTime() > now.getTime() + 366 * 24 * 60 * MIN) return null;
  return d;
}

// Kolejka: najbliższy wolny slot dla kanałów posta. Kanał z własnymi godzinami używa tylko ich,
// pozostałe — wspólnego harmonogramu; post z kilku kanałów bierze najbliższą godzinę z sumy.
async function queueTime(ctx, accountIds, excludePostId) {
  const { rows: all } = await ctx.db.query(
    `SELECT weekday, time, account_id FROM social_queue_slots WHERE account_id IS NULL OR account_id = ANY($1::uuid[])`, [accountIds]);
  const valid = all.filter(isValidSlot);
  const own = new Set(valid.filter((x) => x.account_id).map((x) => x.account_id));
  const slots = [...valid.filter((x) => x.account_id), ...(accountIds.some((id) => !own.has(id)) ? valid.filter((x) => !x.account_id) : [])];
  if (!slots.length) return null;
  const { rows: taken } = await ctx.db.query(
    `SELECT DISTINCT p.scheduled_at FROM social_posts p JOIN social_post_targets t ON t.post_id = p.id
      WHERE p.status IN ('scheduled', 'pending_approval') AND p.scheduled_at > now()
        AND t.account_id = ANY($1::uuid[]) AND ($2::uuid IS NULL OR p.id <> $2::uuid)`, [accountIds, excludePostId || null]);
  return nextQueueSlot(slots, { now: nowOf(ctx), taken: taken.map((r) => r.scheduled_at) });
}

async function resolveTime(ctx, intent, body, accountIds, postId) {
  const now = nowOf(ctx);
  if (intent === 'now') return now;
  if (intent === 'queue') {
    const at = await queueTime(ctx, accountIds, postId);
    if (!at) throw err(400, MSG.noSlots, 'NO_SLOTS');
    return at;
  }
  if (intent === 'schedule') {
    const at = parseTime(body.scheduled_at, now);
    if (!at) throw err(400, MSG.badTime, 'BAD_TIME');
    return at;
  }
  // Szkic / do akceptacji — termin proponowany (opcjonalny).
  return body.scheduled_at ? parseTime(body.scheduled_at, now) : null;
}

const canTouch = (access, post) => access.admin || access.updateAll || lower(post.created_by) === lower(access.me?.email);

// ── Zapis posta ─────────────────────────────────────────────────────────────
// body: { id?, content, media, tags, targets: [{ account_id, content?, media?, options? }],
//         intent: 'draft' | 'submit' | 'schedule' | 'queue' | 'now', scheduled_at? }
export async function savePost(ctx, access, body = {}) {
  if (!access.view) throw err(403, MSG.noAccess, 'FORBIDDEN');
  const intent = ['draft', 'submit', 'schedule', 'queue', 'now'].includes(body.intent) ? body.intent : 'draft';
  const publishing = intent === 'schedule' || intent === 'queue' || intent === 'now';
  if (publishing && !access.publish) throw err(403, MSG.noPublish, 'NO_PUBLISH');

  let existing = null;
  if (body.id) {
    existing = await loadPost(ctx.db, body.id);
    if (!existing) throw err(404, MSG.notFound, 'NOT_FOUND');
    if (!EDITABLE_STATUSES.has(existing.status)) throw err(409, MSG.notEditable, 'NOT_EDITABLE');
    if (!canTouch(access, existing) && !access.publish) throw err(403, MSG.notYours, 'FORBIDDEN');
    if (!access.create && !access.updateAll && !access.publish) throw err(403, MSG.noCreate, 'FORBIDDEN');
  } else if (!access.create && !access.publish) {
    throw err(403, MSG.noCreate, 'FORBIDDEN');
  }

  const content = String(body.content ?? '');
  if (charCount(content) > MAX_CONTENT) throw err(400, MSG.tooLong);
  const media = cleanMedia(body.media);
  const tags = cleanTags(body.tags);

  const rawTargets = Array.isArray(body.targets) ? body.targets.slice(0, MAX_TARGETS) : [];
  const ids = [...new Set(rawTargets.map((t) => String(t?.account_id || '')).filter((v) => UUID_RE.test(v)))];
  const accounts = ids.length
    ? (await ctx.db.query(`SELECT id, provider, name, status FROM social_accounts WHERE id = ANY($1::uuid[])`, [ids])).rows
    : [];
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const targets = [];
  for (const t of rawTargets) {
    const acc = accById.get(String(t?.account_id || ''));
    if (!acc) { if (intent !== 'draft') throw err(400, MSG.badAccount, 'BAD_ACCOUNT'); continue; }
    if (targets.some((x) => x.account_id === acc.id)) continue;
    targets.push({
      account_id: acc.id, provider: acc.provider, account_name: acc.name,
      content: t.content != null && String(t.content) !== '' ? String(t.content) : null,
      media: Array.isArray(t.media) && t.media.length ? cleanMedia(t.media) : null,
      options: cleanOptions(acc.provider, t.options || {}),
      _status: acc.status,
    });
  }

  if (intent !== 'draft') {
    if (!targets.length) throw err(400, MSG.noTargets, 'NO_TARGETS');
    const problems = [];
    for (const t of targets) {
      if (t._status === 'revoked') problems.push(`${t.account_name}: ${MSG.badAccount}`);
      const eff = effectiveTarget({ content, media }, t);
      const { errors } = validateTarget(t.provider, eff);
      for (const e of errors) problems.push(`${t.account_name}: ${e}`);
    }
    if (problems.length) throw err(400, problems[0], 'INVALID', { details: problems });
  }

  const scheduledAt = await resolveTime(ctx, intent, body, targets.map((t) => t.account_id), existing?.id);
  const status = intent === 'draft' ? 'draft' : intent === 'submit' ? 'pending_approval' : 'scheduled';
  const email = lower(access.me?.email);
  const approved = publishing ? email : null;

  const run = async (db) => {
    let post;
    if (existing) {
      const { rows } = await db.query(
        `UPDATE social_posts SET content = $2, media = $3::jsonb, tags = $4::text[], status = $5, scheduled_at = $6,
                updated_by = $7, approved_by = $8, approved_at = CASE WHEN $8::text IS NULL THEN NULL ELSE now() END,
                review_note = CASE WHEN $5 = 'draft' THEN review_note ELSE NULL END, updated_at = now()
          WHERE id = $1 AND status = ANY($9::text[]) RETURNING *`,
        [existing.id, content, JSON.stringify(media), tags, status, scheduledAt ? scheduledAt.toISOString() : null,
          email, approved, [...EDITABLE_STATUSES]]);
      post = rows[0];
      if (!post) throw err(409, MSG.notEditable, 'NOT_EDITABLE');
      await db.query(`DELETE FROM social_post_targets WHERE post_id = $1`, [post.id]);
    } else {
      const { rows } = await db.query(
        `INSERT INTO social_posts (content, media, tags, status, scheduled_at, created_by, updated_by, approved_by, approved_at,
                                   source_type, source_id)
         VALUES ($1, $2::jsonb, $3::text[], $4, $5, $6, $6, $7, CASE WHEN $7::text IS NULL THEN NULL ELSE now() END, $8, $9)
         RETURNING *`,
        [content, JSON.stringify(media), tags, status, scheduledAt ? scheduledAt.toISOString() : null, email, approved,
          body.source_type ? String(body.source_type).slice(0, 40) : null, body.source_id ? String(body.source_id).slice(0, 100) : null]);
      post = rows[0];
    }
    for (const t of targets) {
      await db.query(
        `INSERT INTO social_post_targets (post_id, account_id, provider, account_name, content, media, options)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [post.id, t.account_id, t.provider, t.account_name, t.content, t.media ? JSON.stringify(t.media) : null, JSON.stringify(t.options)]);
    }
    return post;
  };
  const post = await withTx(ctx.db, run);
  await registerMedia(ctx, [...media, ...targets.flatMap((t) => t.media || [])], email);
  // Post z pomysłu (migracja 124) — pomysł pokazuje, że został użyty.
  if (!existing && body.source_type === 'idea' && UUID_RE.test(String(body.source_id || ''))) {
    await ctx.db.query(`UPDATE social_ideas SET post_id = $1, updated_at = now() WHERE id = $2`, [post.id, body.source_id])
      .catch((e) => { if (e?.code !== '42P01') logErr(ctx, e, 'social: pomysł → post'); });
  }
  const full = await loadPost(ctx.db, post.id);
  emit(ctx, 'social_posts', existing ? 'update' : 'insert', [full]);

  await logActivity(ctx, post.id, existing ? 'edited' : 'created', email);
  if (status === 'pending_approval' && existing?.status !== 'pending_approval') await logActivity(ctx, post.id, 'submitted', email);
  if (status === 'scheduled') await logActivity(ctx, post.id, intent === 'now' ? 'published_now' : 'scheduled', email, scheduledAt?.toISOString());
  if (status === 'pending_approval' && existing?.status !== 'pending_approval') {
    const approvers = (await usersWithCapability(ctx.db, ctx.dbName, 'action:social:publish')).filter((e) => e !== email);
    await notify(ctx, approvers, { title: 'Post do akceptacji', body: snippet(content), postId: post.id });
  }
  if (intent === 'now') kickPublish(ctx);
  return full;
}

// Media użyte w poście trafiają do biblioteki (migracja 124) — do ponownego użycia w kolejnych postach.
async function registerMedia(ctx, list, email) {
  const seen = new Set();
  for (const m of list || []) {
    if (!m?.path || seen.has(m.path)) continue;
    seen.add(m.path);
    try {
      await ctx.db.query(
        `INSERT INTO social_media_items (path, mime, kind, width, height, size, duration, alt, name, source, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'post', $10) ON CONFLICT (path) DO NOTHING`,
        [m.path, m.mime || null, m.kind === 'video' ? 'video' : 'image', m.width ? Math.round(m.width) : null, m.height ? Math.round(m.height) : null,
          m.size ? Math.round(m.size) : null, m.duration || null, m.alt || null, m.name || null, email || null]);
    } catch (e) {
      if (e?.code === '42P01') return; // tenant przed migracją 124
      logErr(ctx, e, 'social: biblioteka mediów');
    }
  }
}

const snippet = (text) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > 120 ? `${s.slice(0, 117)}…` : (s || 'Post bez tekstu');
};

// Publikacja „teraz” — od razu, bez czekania na minutę workera (worker i tak to złapie).
function kickPublish(ctx) {
  if (ctx.deps?.noKick) return;
  setTimeout(() => { runDuePublishing(ctx).catch((e) => logErr(ctx, e, 'social: publikacja teraz nie powiodła się')); }, 0);
}

// ── Akcje na poście ─────────────────────────────────────────────────────────
async function mustLoad(ctx, id) {
  const post = await loadPost(ctx.db, id);
  if (!post) throw err(404, MSG.notFound, 'NOT_FOUND');
  return post;
}

async function setStatus(ctx, id, fromStatuses, sets, params = []) {
  const { rows } = await ctx.db.query(
    `UPDATE social_posts SET ${sets}, updated_at = now() WHERE id = $1 AND status = ANY($2::text[]) RETURNING id`,
    [id, fromStatuses, ...params]);
  if (!rows[0]) throw err(409, 'Status posta zmienił się w międzyczasie — odśwież widok.', 'CONFLICT');
  const full = await loadPost(ctx.db, id);
  emit(ctx, 'social_posts', 'update', [full]);
  return full;
}

// Zatwierdź (i zaplanuj): intent 'schedule' (scheduled_at) | 'queue' | 'now'; bez intentu — termin
// zaproponowany przez autora albo najbliższy slot kolejki.
export async function approvePost(ctx, access, body = {}) {
  if (!access.publish) throw err(403, MSG.noPublish, 'NO_PUBLISH');
  const post = await mustLoad(ctx, body.id);
  if (post.status !== 'pending_approval') throw err(409, 'Ten post nie czeka na akceptację.', 'CONFLICT');
  const accountIds = post.targets.map((t) => t.account_id).filter(Boolean);
  let intent = body.intent;
  const now = nowOf(ctx);
  if (!intent) intent = post.scheduled_at && new Date(post.scheduled_at) > now ? 'keep' : 'queue';
  const at = intent === 'keep' ? new Date(post.scheduled_at) : await resolveTime(ctx, intent, body, accountIds, post.id);
  const full = await setStatus(ctx, post.id, ['pending_approval'],
    `status = 'scheduled', scheduled_at = $3, approved_by = $4, approved_at = now(), review_note = NULL`,
    [at.toISOString(), lower(access.me?.email)]);
  await logActivity(ctx, post.id, 'approved', access.me?.email, at.toISOString());
  if (lower(post.created_by) !== lower(access.me?.email)) {
    await notify(ctx, [post.created_by], { title: 'Post zatwierdzony', body: snippet(post.content), postId: post.id });
  }
  if (intent === 'now') kickPublish(ctx);
  return full;
}

export async function rejectPost(ctx, access, body = {}) {
  if (!access.publish) throw err(403, MSG.noPublish, 'NO_PUBLISH');
  const post = await mustLoad(ctx, body.id);
  const note = String(body.note || '').trim().slice(0, 2000) || null;
  const full = await setStatus(ctx, post.id, ['pending_approval'], `status = 'draft', review_note = $3`, [note]);
  await logActivity(ctx, post.id, 'rejected', access.me?.email, note);
  await notify(ctx, [post.created_by], { title: 'Post odesłany do poprawy', body: note || snippet(post.content), postId: post.id });
  return full;
}

// Wstrzymaj: zaplanowany → szkic (publikujący), do akceptacji → szkic (autor albo publikujący).
export async function unschedulePost(ctx, access, body = {}) {
  const post = await mustLoad(ctx, body.id);
  if (post.status === 'scheduled' && !access.publish) throw err(403, MSG.noPublish, 'NO_PUBLISH');
  if (post.status === 'pending_approval' && !access.publish && !canTouch(access, post)) throw err(403, MSG.notYours, 'FORBIDDEN');
  const full = await setStatus(ctx, post.id, ['scheduled', 'pending_approval'], `status = 'draft', approved_by = NULL, approved_at = NULL`);
  await logActivity(ctx, post.id, 'unscheduled', access.me?.email);
  return full;
}

export async function reschedulePost(ctx, access, body = {}) {
  const post = await mustLoad(ctx, body.id);
  const at = parseTime(body.scheduled_at, nowOf(ctx));
  if (!at || at <= nowOf(ctx)) throw err(400, MSG.badTime, 'BAD_TIME');
  if (post.status === 'scheduled') {
    if (!access.publish) throw err(403, MSG.noPublish, 'NO_PUBLISH');
  } else if (post.status === 'draft' || post.status === 'pending_approval') {
    if (!canTouch(access, post) && !access.publish) throw err(403, MSG.notYours, 'FORBIDDEN');
  } else {
    throw err(409, MSG.notEditable, 'NOT_EDITABLE');
  }
  const full = await setStatus(ctx, post.id, [post.status], `scheduled_at = $3`, [at.toISOString()]);
  await logActivity(ctx, post.id, 'rescheduled', access.me?.email, at.toISOString());
  return full;
}

export async function publishNow(ctx, access, body = {}) {
  if (!access.publish) throw err(403, MSG.noPublish, 'NO_PUBLISH');
  const post = await mustLoad(ctx, body.id);
  if (post.status !== 'scheduled') throw err(409, 'Opublikować od razu można zaplanowany post.', 'CONFLICT');
  const full = await setStatus(ctx, post.id, ['scheduled'], `scheduled_at = $3`, [nowOf(ctx).toISOString()]);
  await logActivity(ctx, post.id, 'published_now', access.me?.email);
  kickPublish(ctx);
  return full;
}

// Ponów nieudane publikacje (wszystkie albo jedną) — post wraca do publikacji od razu.
export async function retryPost(ctx, access, body = {}) {
  if (!access.publish) throw err(403, MSG.noPublish, 'NO_PUBLISH');
  const post = await mustLoad(ctx, body.id);
  if (!['failed', 'partial'].includes(post.status)) throw err(409, 'Ponowić można tylko nieudaną publikację.', 'CONFLICT');
  const targetId = body.target_id && UUID_RE.test(String(body.target_id)) ? String(body.target_id) : null;
  const { rowCount } = await ctx.db.query(
    `UPDATE social_post_targets SET status = 'pending', attempts = 0, next_attempt_at = NULL, lease_until = NULL,
            progress = '{}'::jsonb, error = NULL, updated_at = now()
      WHERE post_id = $1 AND status = 'failed' AND ($2::uuid IS NULL OR id = $2::uuid)`, [post.id, targetId]);
  if (!rowCount) throw err(409, 'Brak nieudanych publikacji do ponowienia.', 'CONFLICT');
  const full = await setStatus(ctx, post.id, ['failed', 'partial'], `status = 'publishing', scheduled_at = COALESCE(scheduled_at, now())`);
  await logActivity(ctx, post.id, 'retried', access.me?.email);
  kickPublish(ctx);
  return full;
}

export async function deletePost(ctx, access, body = {}) {
  const post = await mustLoad(ctx, body.id);
  if (post.status === 'publishing') throw err(409, 'Post jest właśnie publikowany — poczekaj chwilę.', 'CONFLICT');
  const own = lower(post.created_by) === lower(access.me?.email);
  const ownEditable = own && access.view && ['draft', 'pending_approval', 'failed'].includes(post.status);
  if (!access.admin && !access.deleteAll && !ownEditable && !(post.status === 'scheduled' && access.publish && own)) {
    throw err(403, 'Nie masz uprawnień do usunięcia tego posta.', 'FORBIDDEN');
  }
  await ctx.db.query(`DELETE FROM social_posts WHERE id = $1`, [post.id]);
  emit(ctx, 'social_posts', 'delete', [{ id: post.id }]);
  return { deleted: post.id };
}

export async function duplicatePost(ctx, access, body = {}) {
  if (!access.create && !access.publish) throw err(403, MSG.noCreate, 'FORBIDDEN');
  const post = await mustLoad(ctx, body.id);
  return savePost(ctx, access, {
    content: post.content, media: post.media, tags: post.tags, intent: 'draft',
    targets: post.targets.filter((t) => t.account_id).map((t) => ({ account_id: t.account_id, content: t.content, media: t.media, options: t.options })),
  });
}

// ── Komentarze zespołu i historia ───────────────────────────────────────────
export async function listActivity(ctx, access, body = {}) {
  const post = await mustLoad(ctx, body.id);
  if (!canSeePost(access, post)) throw err(403, MSG.notYours, 'FORBIDDEN');
  try {
    const { rows } = await ctx.db.query(
      `SELECT id, kind, actor, note, created_at FROM social_post_activity WHERE post_id = $1 ORDER BY seq LIMIT 500`, [post.id]);
    return rows;
  } catch (e) {
    if (e?.code === '42P01') return [];
    throw e;
  }
}

// Komentarz: każdy, kto widzi post. Powiadomienie: autor, zatwierdzający i wcześniejsi komentujący.
export async function addComment(ctx, access, body = {}) {
  const post = await mustLoad(ctx, body.id);
  if (!canSeePost(access, post)) throw err(403, MSG.notYours, 'FORBIDDEN');
  const text = String(body.body || '').trim();
  if (!text) throw err(400, 'Komentarz jest pusty.');
  if (text.length > 2000) throw err(400, 'Komentarz jest za długi (najwyżej 2000 znaków).');
  const me = lower(access.me?.email);
  await logActivity(ctx, post.id, 'comment', me, text);
  const { rows } = await ctx.db.query(
    `SELECT DISTINCT actor FROM social_post_activity WHERE post_id = $1 AND kind = 'comment' AND actor IS NOT NULL`, [post.id]).catch(() => ({ rows: [] }));
  const who = [post.created_by, post.approved_by, ...rows.map((r) => r.actor)].map(lower).filter((e) => e && e !== me);
  await notify(ctx, who, { title: 'Nowy komentarz do posta', body: text.length > 120 ? `${text.slice(0, 117)}…` : text, postId: post.id });
  emit(ctx, 'social_posts', 'update', [post]);
  return listActivity(ctx, access, { id: post.id });
}

export async function deleteComment(ctx, access, body = {}) {
  const id = String(body.comment_id || '');
  if (!UUID_RE.test(id)) throw err(400, 'Nie wybrano komentarza.');
  const { rows } = await ctx.db.query(`SELECT * FROM social_post_activity WHERE id = $1 AND kind = 'comment'`, [id]);
  const c = rows[0];
  if (!c) throw err(404, 'Nie znaleziono komentarza.', 'NOT_FOUND');
  if (!access.admin && lower(c.actor) !== lower(access.me?.email)) throw err(403, 'Usunąć można tylko własny komentarz.', 'FORBIDDEN');
  await ctx.db.query(`DELETE FROM social_post_activity WHERE id = $1`, [id]);
  return listActivity(ctx, access, { id: c.post_id });
}

// ── Kolejka (sloty) ─────────────────────────────────────────────────────────
export async function getSlots(ctx) {
  const { rows } = await ctx.db.query(`SELECT id, account_id, weekday, time FROM social_queue_slots ORDER BY weekday, time`);
  return rows;
}

// Zastąpienie harmonogramu kolejki (dla wszystkich kanałów albo jednego): slots [{weekday, time}].
export async function saveSlots(ctx, access, body = {}) {
  if (!access.publish && !access.manage) throw err(403, MSG.noPublish, 'NO_PUBLISH');
  const accountId = body.account_id && UUID_RE.test(String(body.account_id)) ? String(body.account_id) : null;
  const list = (Array.isArray(body.slots) ? body.slots : []).filter(isValidSlot).slice(0, 200);
  const uniq = [...new Map(list.map((s) => [`${Number(s.weekday)}|${s.time}`, { weekday: Number(s.weekday), time: s.time }])).values()];
  await withTx(ctx.db, async (db) => {
    await db.query(`DELETE FROM social_queue_slots WHERE account_id IS NOT DISTINCT FROM $1::uuid`, [accountId]);
    for (const s of uniq) {
      await db.query(`INSERT INTO social_queue_slots (account_id, weekday, time) VALUES ($1, $2, $3)`, [accountId, s.weekday, s.time]);
    }
  });
  return getSlots(ctx);
}

export async function previewQueue(ctx, access, body = {}) {
  const ids = (Array.isArray(body.account_ids) ? body.account_ids : []).filter((v) => UUID_RE.test(String(v)));
  const at = ids.length ? await queueTime(ctx, ids, body.id || null) : null;
  return { next_slot: at ? at.toISOString() : null };
}

// ── Kanały ──────────────────────────────────────────────────────────────────
export async function removeAccount(ctx, access, body = {}) {
  if (!access.manage) throw err(403, MSG.noManage, 'FORBIDDEN');
  const id = String(body.id || '');
  if (!UUID_RE.test(id)) throw err(400, 'Nie wybrano kanału.');
  await ctx.db.query(`DELETE FROM social_accounts WHERE id = $1`, [id]);
  emit(ctx, 'social_accounts', 'delete', [{ id }]);
  return { deleted: id };
}

export async function accountsPublic(ctx) {
  return (await listAccounts(ctx.db)).map(publicAccount);
}

// ── Worker: publikacja należnych ────────────────────────────────────────────
async function withTx(db, fn) {
  if (typeof db.connect !== 'function') return fn(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function updateTarget(db, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}${k === 'progress' ? '::jsonb' : ''}`);
  const vals = keys.map((k) => (k === 'progress' ? JSON.stringify(fields[k] || {}) : fields[k]));
  await db.query(`UPDATE social_post_targets SET ${sets.join(', ')}, lease_until = NULL, updated_at = now() WHERE id = $1`, [id, ...vals]);
}

// Status całości z celów; przy zakończeniu (opublikowany / częściowo / błąd) powiadomienie autora.
async function refreshPostStatus(ctx, postId, { changed = false } = {}) {
  const { rows } = await ctx.db.query(`SELECT status FROM social_post_targets WHERE post_id = $1`, [postId]);
  const next = aggregatePostStatus(rows.map((r) => r.status));
  const { rows: upd } = await ctx.db.query(
    `UPDATE social_posts SET status = $2,
            published_at = CASE WHEN $2 IN ('published', 'partial') THEN COALESCE(published_at, now()) ELSE published_at END,
            updated_at = now()
      WHERE id = $1 AND status = 'publishing' AND status IS DISTINCT FROM $2 RETURNING *`, [postId, next]);
  // Realtime tylko przy zmianie (status całości albo celów) — nie co minutę dla każdego posta w toku.
  const full = upd[0] || changed ? await loadPost(ctx.db, postId) : null;
  if (full) emit(ctx, 'social_posts', 'update', [full]);
  if (upd[0] && ['published', 'partial', 'failed'].includes(next)) {
    const failedNames = (full?.targets || []).filter((t) => t.status === 'failed').map((t) => `${t.account_name}: ${t.error || ''}`.trim());
    await logActivity(ctx, postId, next, null, failedNames.join('\n') || null);
  }
  if (upd[0] && (next === 'failed' || next === 'partial')) {
    const who = [upd[0].created_by, upd[0].approved_by].filter(Boolean);
    const failed = (full?.targets || []).filter((t) => t.status === 'failed').map((t) => t.account_name).filter(Boolean);
    await notify(ctx, who, {
      title: next === 'failed' ? 'Publikacja posta nie powiodła się' : 'Post opublikowany tylko częściowo',
      body: failed.length ? `Błąd: ${failed.join(', ')}` : snippet(upd[0].content),
      postId,
    });
  }
  return next;
}

async function processTarget(ctx, t) {
  const now = nowOf(ctx);
  const { rows: pr } = await ctx.db.query(`SELECT * FROM social_posts WHERE id = $1`, [t.post_id]);
  const post = pr[0];
  const { rows: ar } = t.account_id ? await ctx.db.query(`SELECT * FROM social_accounts WHERE id = $1`, [t.account_id]) : { rows: [] };
  const account = ar[0];
  if (!post) return;
  if (!account) {
    await updateTarget(ctx.db, t.id, { status: 'failed', error: 'Kanał został odłączony.' });
    return;
  }
  if (account.status === 'revoked') {
    await updateTarget(ctx.db, t.id, { status: 'failed', error: account.last_error || 'Połączenie z kontem wygasło — połącz kanał ponownie.' });
    return;
  }
  let progress = t.progress || {};
  if (progress.started_at && now - new Date(progress.started_at) > PROCESSING_TIMEOUT_MS) {
    await updateTarget(ctx.db, t.id, { status: 'failed', error: 'Przetwarzanie pliku przez sieć trwało zbyt długo. Spróbuj krótszego wideo.', progress: {} });
    return;
  }
  const eff = effectiveTarget(post, t);
  try {
    // Facebook: adresy w treści → krótkie linki z UTM (raz na kanał; ponowienia biorą zapisany wynik).
    if (account.provider === 'facebook') {
      if (!progress.short_done) {
        const settings = await loadSettings(ctx.db);
        const out = await shortenForTarget(ctx, { text: eff.content, link: eff.options.link, post, target: t, settings }).catch((e) => {
          logErr(ctx, e, 'social: skracanie linków');
          return { text: eff.content, link: eff.options.link };
        });
        progress = { ...progress, short_done: true, short_content: out.text, short_link: out.link || null };
        await ctx.db.query(`UPDATE social_post_targets SET progress = $2::jsonb WHERE id = $1`, [t.id, JSON.stringify(progress)]);
      }
      eff.content = progress.short_content ?? eff.content;
      if (progress.short_link) eff.options = { ...eff.options, link: progress.short_link };
    }
    const token = await decryptToken(account.access_token_enc);
    if (!token) throw new SocialError('Brak tokenu kanału — połącz kanał ponownie.', { code: 'token_invalid', tokenInvalid: true });
    const out = await publishTarget(ctx, { account, token, content: eff.content, media: eff.media, options: eff.options, progress });
    if (out.status === 'processing') {
      await updateTarget(ctx.db, t.id, {
        status: 'processing', progress: { ...out.progress, started_at: progress.started_at || now.toISOString() },
        next_attempt_at: new Date(now.getTime() + MIN).toISOString(), error: null,
      });
      return;
    }
    let commentError = null;
    if (eff.options.first_comment) {
      try { await postFirstComment({ account, token, externalId: out.external_id, message: eff.options.first_comment }); }
      catch (e) { commentError = `Post opublikowany, ale pierwszy komentarz nie: ${e.message}`; }
    }
    await updateTarget(ctx.db, t.id, {
      status: 'published', external_id: out.external_id, permalink: out.permalink || null,
      published_at: now.toISOString(), error: commentError, progress: {},
    });
    if (account.status === 'error') await markAccount(ctx.db, account.id, 'active', null);
  } catch (e) {
    const se = e instanceof SocialError ? e : new SocialError(e?.message || 'Nieznany błąd publikacji.', { code: 'error' });
    if (se.tokenInvalid) await markAccount(ctx.db, account.id, 'revoked', se.message);
    const attempts = Number(t.attempts) || 1;
    if (se.retryable && attempts < MAX_ATTEMPTS) {
      const delay = RETRY_DELAYS_MIN[Math.min(attempts - 1, RETRY_DELAYS_MIN.length - 1)];
      await updateTarget(ctx.db, t.id, {
        status: progress.container || progress.children || progress.reel_video_id ? 'processing' : 'pending',
        next_attempt_at: new Date(now.getTime() + delay * MIN).toISOString(), error: se.message,
      });
      return;
    }
    // Przy błędzie pliku kontenery do wyrzucenia — ponowienie zacznie od nowa.
    await updateTarget(ctx.db, t.id, { status: 'failed', error: se.message, progress: se.code === 'remote_media' ? {} : progress });
    if (!se.tokenInvalid && se.code === 'permission') await markAccount(ctx.db, account.id, 'error', se.message);
  }
}

export async function runDuePublishing(ctx) {
  const stats = { published: 0, failed: 0, processing: 0, retry: 0 };
  // 1) Należne posty → w publikacji.
  await ctx.db.query(
    `UPDATE social_posts SET status = 'publishing', updated_at = now() WHERE status = 'scheduled' AND scheduled_at <= now()`);
  // 2) Porzucone (dzierżawa minęła w trakcie publikacji) — bez automatycznego ponowienia.
  const { rows: stale } = await ctx.db.query(
    `UPDATE social_post_targets SET status = 'failed', lease_until = NULL, updated_at = now(),
            error = 'Publikacja została przerwana. Sprawdź na stronie, czy post się pojawił — jeśli nie, ponów.'
      WHERE status = 'publishing' AND lease_until < now() RETURNING post_id`);
  // 3) Przejęcie celów (zablokowane wiersze pomija równoległy przebieg).
  const { rows: claimed } = await ctx.db.query(
    `WITH due AS (
       SELECT t.id FROM social_post_targets t JOIN social_posts p ON p.id = t.post_id
        WHERE p.status = 'publishing' AND t.status IN ('pending', 'processing')
          AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
        ORDER BY p.scheduled_at NULLS FIRST, t.created_at
        LIMIT ${CLAIM_BATCH}
        FOR UPDATE OF t SKIP LOCKED)
     UPDATE social_post_targets t
        SET attempts = CASE WHEN t.status = 'pending' THEN t.attempts + 1 ELSE t.attempts END,
            status = 'publishing', lease_until = now() + interval '10 minutes', updated_at = now()
       FROM due WHERE t.id = due.id
     RETURNING t.*`);
  const changed = new Set(stale.map((r) => r.post_id));
  for (const t of claimed) {
    changed.add(t.post_id);
    try {
      await processTarget(ctx, t);
    } catch (e) {
      logErr(ctx, e, 'social: błąd celu');
      await updateTarget(ctx.db, t.id, { status: 'failed', error: 'Nieoczekiwany błąd publikacji.' }).catch(() => {});
    }
  }
  if (claimed.length) {
    const { rows } = await ctx.db.query(`SELECT status, COUNT(*)::int AS n FROM social_post_targets WHERE id = ANY($1::uuid[]) GROUP BY status`,
      [claimed.map((t) => t.id)]);
    for (const r of rows) {
      if (r.status === 'published') stats.published += r.n;
      else if (r.status === 'failed') stats.failed += r.n;
      else if (r.status === 'processing') stats.processing += r.n;
      else stats.retry += r.n;
    }
  }
  // 4) Posty w publikacji bez celów do zrobienia (np. wszystkie zakończone) — status całości.
  const { rows: open } = await ctx.db.query(`SELECT id FROM social_posts WHERE status = 'publishing'`);
  const all = new Set([...changed, ...open.map((p) => p.id)]);
  for (const id of all) {
    try { await refreshPostStatus(ctx, id, { changed: changed.has(id) }); } catch (e) { logErr(ctx, e, 'social: status posta'); }
  }
  return stats;
}
