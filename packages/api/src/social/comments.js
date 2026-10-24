// Social Media — skrzynka komentarzy (migracja 125). Worker social-comments (co 10 min) pobiera
// komentarze pod publikacjami z ostatnich 30 dni (najświeższe najczęściej) razem z odpowiedziami.
// Facebook wymaga pages_read_user_content (czytanie) i pages_manage_engagement (odpowiedź, ukrycie,
// usunięcie), Instagram — instagram_manage_comments. Własne odpowiedzi (strona / konto IG) mają
// is_own i nie trafiają do „Nowych”. Nowe komentarze → jedno powiadomienie autora posta na przebieg.
import { graph, SocialError } from './meta.js';
import { decryptToken } from './accounts.js';
import { deliverNotifications } from '../dataapi/boardNotify.js';
import { emitChange } from '../realtime/hub.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lower = (v) => String(v ?? '').trim().toLowerCase();
const BATCH = 40;
const err = (status, message, code = 'BAD_REQUEST') => new SocialError(message, { status, code });

// Komentarze publikacji → płaska lista { external_id, parent_external_id, author_name, author_external_id, message, created_time, like_count }.
export async function fetchComments(account, token, externalId) {
  const out = [];
  if (account.provider === 'instagram') {
    const r = await graph('GET', `/${externalId}/comments`, {
      token, params: { fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}', limit: 50 },
    });
    for (const c of r.data || []) {
      out.push({ external_id: c.id, parent_external_id: null, author_name: c.username, author_external_id: c.username, message: c.text || '', created_time: c.timestamp, like_count: c.like_count || 0 });
      for (const rep of c.replies?.data || []) {
        out.push({ external_id: rep.id, parent_external_id: c.id, author_name: rep.username, author_external_id: rep.username, message: rep.text || '', created_time: rep.timestamp, like_count: rep.like_count || 0 });
      }
    }
    return out;
  }
  const r = await graph('GET', `/${externalId}/comments`, {
    token, params: { fields: 'id,message,from{id,name},created_time,like_count,comments.limit(50){id,message,from{id,name},created_time,like_count}', filter: 'toplevel', order: 'reverse_chronological', limit: 50 },
  });
  for (const c of r.data || []) {
    out.push({ external_id: c.id, parent_external_id: null, author_name: c.from?.name || null, author_external_id: c.from?.id || null, message: c.message || '', created_time: c.created_time, like_count: c.like_count || 0 });
    for (const rep of c.comments?.data || []) {
      out.push({ external_id: rep.id, parent_external_id: c.id, author_name: rep.from?.name || null, author_external_id: rep.from?.id || null, message: rep.message || '', created_time: rep.created_time, like_count: rep.like_count || 0 });
    }
  }
  return out;
}

const isOwn = (account, c) => (account.provider === 'instagram'
  ? lower(c.author_external_id) === lower(account.username)
  : String(c.author_external_id || '') === String(account.external_id));

export async function syncComments(ctx) {
  const stats = { synced: 0, added: 0, errors: 0 };
  const { rows: targets } = await ctx.db.query(
    `SELECT t.id, t.post_id, t.account_id, t.provider, t.external_id, t.published_at, p.created_by, p.content
       FROM social_post_targets t JOIN social_posts p ON p.id = t.post_id
      WHERE t.status = 'published' AND t.external_id IS NOT NULL AND t.account_id IS NOT NULL
        AND t.published_at > now() - interval '30 days'
        AND (t.comments_synced_at IS NULL
             OR (t.published_at > now() - interval '3 days' AND t.comments_synced_at < now() - interval '9 minutes')
             OR (t.published_at > now() - interval '10 days' AND t.comments_synced_at < now() - interval '1 hour')
             OR t.comments_synced_at < now() - interval '6 hours')
      ORDER BY t.comments_synced_at NULLS FIRST LIMIT ${BATCH}`);
  if (!targets.length) return stats;
  const { rows: accRows } = await ctx.db.query(`SELECT * FROM social_accounts WHERE status <> 'revoked'`);
  const accounts = new Map(accRows.map((a) => [a.id, a]));
  const tokens = new Map();
  const newByPost = new Map();
  for (const t of targets) {
    const account = accounts.get(t.account_id);
    if (!account) continue;
    try {
      if (!tokens.has(account.id)) tokens.set(account.id, await decryptToken(account.access_token_enc));
      const token = tokens.get(account.id);
      if (!token) continue;
      const list = await fetchComments(account, token, t.external_id);
      for (const c of list) {
        const own = isOwn(account, c);
        const { rows } = await ctx.db.query(
          `INSERT INTO social_comments (provider, external_id, account_id, target_id, post_external_id, parent_external_id, author_name,
                                        author_external_id, message, created_time, like_count, is_own, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (provider, external_id) DO UPDATE SET message = EXCLUDED.message, like_count = EXCLUDED.like_count, fetched_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [account.provider, c.external_id, account.id, t.id, t.external_id, c.parent_external_id, c.author_name, c.author_external_id,
            c.message, c.created_time || null, c.like_count || 0, own, own ? 'read' : 'new']);
        if (rows[0]?.inserted && !own) {
          stats.added += 1;
          const cur = newByPost.get(t.post_id) || { n: 0, created_by: t.created_by, content: t.content };
          cur.n += 1;
          newByPost.set(t.post_id, cur);
        }
      }
      await ctx.db.query(`UPDATE social_post_targets SET comments_synced_at = now() WHERE id = $1`, [t.id]);
      stats.synced += 1;
    } catch (e) {
      stats.errors += 1;
      // Brak zgody (stary kanał bez pages_read_user_content) — nie odpytujemy co 10 min.
      await ctx.db.query(`UPDATE social_post_targets SET comments_synced_at = now() WHERE id = $1`, [t.id]).catch(() => {});
      if (!(e instanceof SocialError)) ctx.log?.error?.({ err: e }, 'social-comments: synchronizacja');
    }
  }
  if (newByPost.size) {
    const entries = [];
    for (const [postId, v] of newByPost) {
      if (!v.created_by) continue;
      const s = String(v.content || '').replace(/\s+/g, ' ').trim();
      entries.push({
        user_email: lower(v.created_by), type: 'social', link: `/social?tab=inbox&post=${postId}`, data: { post_id: postId },
        title: v.n === 1 ? 'Nowy komentarz pod Twoim postem' : `Nowe komentarze pod Twoim postem (${v.n})`,
        body: s.length > 100 ? `${s.slice(0, 97)}…` : (s || 'Post bez tekstu'),
      });
    }
    try { await (ctx.deps?.deliver || deliverNotifications)({ db: ctx.db, tenant: { slug: ctx.tenantSlug }, log: ctx.log, entries }); } catch { /* bez powiadomień */ }
    try { (ctx.deps?.emit || emitChange)(ctx.tenantSlug, 'social_posts', 'update', [{ id: null }]); } catch { /* realtime */ }
  }
  return stats;
}

// ── Skrzynka: lista i akcje ─────────────────────────────────────────────────
export async function listComments(ctx, { status = 'new', account_id: accountId, post_id: postId, limit = 60 } = {}) {
  const conds = ['c.parent_external_id IS NULL', 'c.is_own = false'];
  const params = [];
  if (status === 'new') conds.push(`(c.status = 'new' OR EXISTS (SELECT 1 FROM social_comments r WHERE r.parent_external_id = c.external_id AND r.provider = c.provider AND r.status = 'new' AND r.is_own = false))`);
  if (status === 'hidden') conds.push('c.hidden = true');
  if (accountId && UUID_RE.test(String(accountId))) { params.push(accountId); conds.push(`c.account_id = $${params.length}`); }
  if (postId && UUID_RE.test(String(postId))) { params.push(postId); conds.push(`t.post_id = $${params.length}`); }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 60, 1), 200);
  const { rows: tops } = await ctx.db.query(
    `SELECT c.*, t.post_id, t.permalink, t.account_name, p.content AS post_content, COALESCE(t.media, p.media) AS post_media
       FROM social_comments c LEFT JOIN social_post_targets t ON t.id = c.target_id LEFT JOIN social_posts p ON p.id = t.post_id
      WHERE ${conds.join(' AND ')} ORDER BY c.created_time DESC NULLS LAST LIMIT ${lim}`, params);
  if (!tops.length) return [];
  const { rows: replies } = await ctx.db.query(
    `SELECT * FROM social_comments WHERE parent_external_id = ANY($1::text[]) ORDER BY created_time NULLS LAST`, [tops.map((c) => c.external_id)]);
  const byParent = new Map();
  for (const r of replies) {
    const k = `${r.provider}:${r.parent_external_id}`;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(r);
  }
  return tops.map((c) => ({ ...c, replies: byParent.get(`${c.provider}:${c.external_id}`) || [] }));
}

export async function newCommentsCount(db) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM social_comments WHERE status = 'new' AND is_own = false`).catch(() => ({ rows: [{ n: 0 }] }));
  return rows[0]?.n || 0;
}

async function loadWithAccount(ctx, id) {
  if (!UUID_RE.test(String(id || ''))) throw err(400, 'Nie wybrano komentarza.');
  const { rows } = await ctx.db.query(`SELECT * FROM social_comments WHERE id = $1`, [id]);
  const c = rows[0];
  if (!c) throw err(404, 'Nie znaleziono komentarza.', 'NOT_FOUND');
  const { rows: ar } = await ctx.db.query(`SELECT * FROM social_accounts WHERE id = $1`, [c.account_id]);
  const account = ar[0];
  if (!account || account.status === 'revoked') throw err(409, 'Kanał wymaga ponownego połączenia.', 'ACCOUNT');
  const token = await decryptToken(account.access_token_enc);
  if (!token) throw err(409, 'Kanał wymaga ponownego połączenia.', 'ACCOUNT');
  return { c, account, token };
}

export async function replyComment(ctx, access, body = {}) {
  if (!access.engage) throw err(403, 'Nie masz uprawnień do odpowiadania na komentarze.', 'FORBIDDEN');
  const message = String(body.message || '').trim();
  if (!message) throw err(400, 'Odpowiedź jest pusta.');
  if (message.length > 2200) throw err(400, 'Odpowiedź jest za długa.');
  const { c, account, token } = await loadWithAccount(ctx, body.id);
  // Odpowiadamy w wątku komentarza najwyższego poziomu (FB i IG nie zagnieżdżają głębiej).
  const parentExt = c.parent_external_id || c.external_id;
  const r = account.provider === 'instagram'
    ? await graph('POST', `/${parentExt}/replies`, { token, params: { message } })
    : await graph('POST', `/${parentExt}/comments`, { token, params: { message } });
  const me = lower(access.me?.email);
  if (r?.id) {
    await ctx.db.query(
      `INSERT INTO social_comments (provider, external_id, account_id, target_id, post_external_id, parent_external_id, author_name,
                                    author_external_id, message, created_time, is_own, status, replied_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), true, 'read', $10) ON CONFLICT (provider, external_id) DO NOTHING`,
      [c.provider, String(r.id), c.account_id, c.target_id, c.post_external_id, parentExt, account.name,
        account.provider === 'instagram' ? account.username : account.external_id, message, me]);
  }
  await ctx.db.query(
    `UPDATE social_comments SET status = 'replied', replied_by = $3, replied_at = now()
      WHERE provider = $1 AND (external_id = $2 OR (parent_external_id = $2 AND is_own = false AND status = 'new'))`, [c.provider, parentExt, me]);
  return { ok: true };
}

export async function hideComment(ctx, access, body = {}) {
  if (!access.engage) throw err(403, 'Nie masz uprawnień do moderowania komentarzy.', 'FORBIDDEN');
  const hidden = body.hidden !== false;
  const { c, account, token } = await loadWithAccount(ctx, body.id);
  await graph('POST', `/${c.external_id}`, { token, params: account.provider === 'instagram' ? { hide: hidden } : { is_hidden: hidden } });
  await ctx.db.query(`UPDATE social_comments SET hidden = $2, status = CASE WHEN status = 'new' THEN 'read' ELSE status END WHERE id = $1`, [c.id, hidden]);
  return { ok: true };
}

export async function deleteSocialComment(ctx, access, body = {}) {
  if (!access.engage) throw err(403, 'Nie masz uprawnień do moderowania komentarzy.', 'FORBIDDEN');
  const { c, token } = await loadWithAccount(ctx, body.id);
  await graph('DELETE', `/${c.external_id}`, { token });
  await ctx.db.query(`DELETE FROM social_comments WHERE id = $1 OR (provider = $2 AND parent_external_id = $3)`, [c.id, c.provider, c.external_id]);
  return { ok: true };
}

export async function markComments(ctx, access, body = {}) {
  if (!access.view) throw err(403, 'Brak dostępu.', 'FORBIDDEN');
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((v) => UUID_RE.test(String(v))).slice(0, 500);
  const status = body.status === 'new' ? 'new' : 'read';
  if (body.all && status === 'read') {
    await ctx.db.query(`UPDATE social_comments SET status = 'read' WHERE status = 'new'`);
    return { ok: true };
  }
  if (!ids.length) return { ok: true };
  // Wątek: oznaczenie komentarza oznacza też jego nowe odpowiedzi.
  await ctx.db.query(
    `UPDATE social_comments SET status = $2 WHERE status <> 'replied' AND (id = ANY($1::uuid[])
       OR (is_own = false AND (provider, parent_external_id) IN (SELECT provider, external_id FROM social_comments WHERE id = ANY($1::uuid[]))))`,
    [ids, status]);
  return { ok: true };
}
