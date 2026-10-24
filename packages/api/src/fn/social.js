// Social Media (migracja 121, src/social/*): planowanie i publikacja postów FB / IG.
// POST /api/fn/social { action, ... }
//   status       — kanały (bez tokenów), moje prawa, liczniki, czy aplikacja Meta jest skonfigurowana
//   connect      — adres logowania Meta + ciasteczko wiążące przeglądarkę (manage_accounts)
//   account_remove { id }                                    (manage_accounts)
//   list         { view: calendar|queue|approval|drafts|sent, from?, to?, limit? } → { posts }
//   get          { id }                                      → { post }
//   save         { id?, content, media, tags, targets, intent, scheduled_at? } → { post }
//   approve      { id, intent?, scheduled_at? }  reject { id, note }  unschedule { id }
//   reschedule   { id, scheduled_at }  publish_now { id }  retry { id, target_id? }
//   delete       { id }  duplicate { id }
//   slots        — harmonogram kolejki; slots_save { account_id?, slots: [{ weekday, time }] }
//   queue_preview { account_ids, id? } → { next_slot }
//   activity     { id } → { activity }  (historia + komentarze zespołu)
//   comment      { id, body } → { activity }   comment_delete { comment_id } → { activity }
//   share_prefill { kind: event|sermon, id } → gotowy szkic (treść z linkiem /l/…, miniatura kazania)
//   post_links   { id } → krótkie linki posta z kliknięciami
//   settings / settings_save { shorten_links, utm }       link_page / link_page_save (strona /linki)
//   rules / rule_save / rule_delete — reguły automatyczne
//   analytics { days, account_ids } — podsumowanie analityki; post_metrics { id } — metryki posta
//   inbox { status: new|all|hidden, account_id?, post_id? } — skrzynka komentarzy
//   inbox_reply { id, message }  inbox_hide { id, hidden }  inbox_delete { id }  inbox_mark { ids | all, status }
// Worker (co minutę): runForTenant — należne posty publikowane, ponowienia, przetwarzanie IG.
// Uprawnienia szczegółowe w funkcji (social/service.js → socialAccess); bramka: module:social.
import { config, isProd } from '../config.js';
import { canAccess } from '../dataapi/registry.js';
import { sharePrefill, postLinks, loadSettings, saveSettings, loadLinkPage, saveLinkPage, withClicks, tenantBase } from '../social/links.js';
import { listRules, saveRule, deleteRule } from '../social/rules.js';
import { analyticsSummary, targetMetrics } from '../social/insights.js';
import { listComments, newCommentsCount, replyComment, hideComment, deleteSocialComment, markComments } from '../social/comments.js';
import { SocialError, metaConfigured, metaRedirectUri } from '../social/meta.js';
import { startConnect, NONCE_COOKIE, STATE_TTL_MS } from '../social/accounts.js';
import {
  ctxFromRequest, ctxFromWorker, socialAccess, publicAccess, listPosts, loadPost, savePost, approvePost, rejectPost,
  unschedulePost, reschedulePost, publishNow, retryPost, deletePost, duplicatePost, getSlots, saveSlots, previewQueue,
  removeAccount, accountsPublic, counts, runDuePublishing, MSG, canSeePost, listActivity, addComment, deleteComment,
} from '../social/service.js';

export const name = 'social';
export const isPublic = false;
export const capability = 'module:social';
export const rateLimit = { max: 120, timeWindow: '1 minute' };

const forbid = (message) => new SocialError(message, { status: 403, code: 'FORBIDDEN' });

// Udostępnić wydarzenie / kazanie może osoba, która je widzi (te same reguły co /api/db).
async function assertCanRead(ctx, access, table) {
  if (access.admin) return;
  const me = access.me || {};
  const r = await canAccess({ pool: ctx.db, dbName: ctx.dbName, table, op: 'select', user: { id: me.id, role: me.role, is_super_admin: me.is_super_admin } });
  if (!r.ok) throw forbid('Nie masz dostępu do tej treści.');
}

const ACTIONS = {
  async status(ctx, access) {
    const [accounts, c, inboxNew] = await Promise.all([accountsPublic(ctx), counts(ctx, access), newCommentsCount(ctx.db)]);
    c.inbox = inboxNew;
    return {
      accounts, access: publicAccess(access), counts: c, me: { email: access.me?.email || null },
      meta: { configured: metaConfigured(), redirect_uri: metaRedirectUri() },
    };
  },
  async connect(ctx, access, body, req) {
    if (!access.manage) throw forbid(MSG.noManage);
    const { url, nonce } = await startConnect(ctx.db, { tenant: req.tenant.subdomain || req.tenant.slug, user: { id: req.user.id, email: access.me?.email } });
    return { url, __cookie: nonce };
  },
  account_remove: (ctx, access, body) => removeAccount(ctx, access, body),
  async list(ctx, access, body) { return { posts: await listPosts(ctx, access, body) }; },
  async get(ctx, access, body) {
    const post = await loadPost(ctx.db, body.id);
    if (!post) throw new SocialError(MSG.notFound, { status: 404, code: 'NOT_FOUND' });
    if (!canSeePost(access, post)) throw forbid(MSG.notYours);
    return { post };
  },
  async save(ctx, access, body) { return { post: await savePost(ctx, access, body) }; },
  async approve(ctx, access, body) { return { post: await approvePost(ctx, access, body) }; },
  async reject(ctx, access, body) { return { post: await rejectPost(ctx, access, body) }; },
  async unschedule(ctx, access, body) { return { post: await unschedulePost(ctx, access, body) }; },
  async reschedule(ctx, access, body) { return { post: await reschedulePost(ctx, access, body) }; },
  async publish_now(ctx, access, body) { return { post: await publishNow(ctx, access, body) }; },
  async retry(ctx, access, body) { return { post: await retryPost(ctx, access, body) }; },
  delete: (ctx, access, body) => deletePost(ctx, access, body),
  async duplicate(ctx, access, body) { return { post: await duplicatePost(ctx, access, body) }; },
  async slots(ctx) { return { slots: await getSlots(ctx) }; },
  async slots_save(ctx, access, body) { return { slots: await saveSlots(ctx, access, body) }; },
  queue_preview: (ctx, access, body) => previewQueue(ctx, access, body),
  async activity(ctx, access, body) { return { activity: await listActivity(ctx, access, body) }; },
  async comment(ctx, access, body) { return { activity: await addComment(ctx, access, body) }; },
  async comment_delete(ctx, access, body) { return { activity: await deleteComment(ctx, access, body) }; },
  async share_prefill(ctx, access, body) {
    if (!access.create && !access.publish) throw forbid(MSG.noCreate);
    await assertCanRead(ctx, access, body.kind === 'sermon' ? 'sermons' : 'events');
    return { prefill: await sharePrefill(ctx, access, { kind: body.kind, id: body.id }) };
  },
  async post_links(ctx, access, body) {
    const post = await loadPost(ctx.db, body.id);
    if (!post) throw new SocialError(MSG.notFound, { status: 404, code: 'NOT_FOUND' });
    if (!canSeePost(access, post)) throw forbid(MSG.notYours);
    return { links: await postLinks(ctx.db, post.id) };
  },
  async settings(ctx) { return { settings: await loadSettings(ctx.db) }; },
  async settings_save(ctx, access, body) {
    if (!access.publish && !access.manage) throw forbid(MSG.noManage);
    return { settings: await saveSettings(ctx.db, body) };
  },
  async link_page(ctx) {
    const page = await withClicks(ctx.db, await loadLinkPage(ctx.db));
    return { page, url: `${tenantBase(ctx.tenantSubdomain || ctx.tenantSlug)}/linki` };
  },
  async link_page_save(ctx, access, body) {
    if (!access.publish && !access.manage) throw forbid(MSG.noManage);
    return { page: await saveLinkPage(ctx, body), url: `${tenantBase(ctx.tenantSubdomain || ctx.tenantSlug)}/linki` };
  },
  async rules(ctx) { return { rules: await listRules(ctx) }; },
  async rule_save(ctx, access, body) { return { rules: await saveRule(ctx, access, body) }; },
  async rule_delete(ctx, access, body) { return { rules: await deleteRule(ctx, access, body) }; },
  async analytics(ctx, access, body) { return { analytics: await analyticsSummary(ctx, body) }; },
  async post_metrics(ctx, access, body) {
    const post = await loadPost(ctx.db, body.id);
    if (!post) throw new SocialError(MSG.notFound, { status: 404, code: 'NOT_FOUND' });
    if (!canSeePost(access, post)) throw forbid(MSG.notYours);
    return { metrics: await targetMetrics(ctx.db, post.id) };
  },
  async inbox(ctx, access, body) { return { comments: await listComments(ctx, body) }; },
  inbox_reply: (ctx, access, body) => replyComment(ctx, access, body),
  inbox_hide: (ctx, access, body) => hideComment(ctx, access, body),
  inbox_delete: (ctx, access, body) => deleteSocialComment(ctx, access, body),
  inbox_mark: (ctx, access, body) => markComments(ctx, access, body),
};

export async function socialAction(req, access) {
  const body = req.body || {};
  const fn = ACTIONS[String(body.action || '')];
  if (!fn) throw new SocialError('Nieznana operacja.', { status: 400, code: 'BAD_ACTION' });
  if (!access.view) throw forbid(MSG.noAccess);
  return fn(ctxFromRequest(req), access, body, req);
}

export default async function handler(req, reply) {
  try {
    const access = await socialAccess(req.db, req.user, req.tenant.db_name);
    const out = await socialAction(req, access);
    if (out && out.__cookie) {
      // Nonce na domenie nadrzędnej — czytelny na centralnym callbacku app.<domena>.
      reply.setCookie(NONCE_COOKIE, out.__cookie, {
        httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', domain: `.${config.APP_DOMAIN}`, maxAge: Math.floor(STATE_TTL_MS / 1000),
      });
      delete out.__cookie;
    }
    return reply.send(out);
  } catch (e) {
    if (e instanceof SocialError || Number.isInteger(e?.status)) {
      return reply.code(e.status || 400).send({ error: e.message, code: e.code, ...(e.details ? { details: e.details } : {}) });
    }
    if (e?.code === '42P01') return reply.code(503).send({ error: 'Moduł Social Media nie jest jeszcze zainstalowany w tej bazie.', code: 'NOT_INSTALLED' });
    req.log.error({ err: e }, 'social failed');
    return reply.code(500).send({ error: 'Nie udało się wykonać operacji. Spróbuj ponownie.' });
  }
}

export async function runForTenant(pool, ctx = {}, extraDeps = {}) {
  try {
    const stats = await runDuePublishing(ctxFromWorker(pool, ctx, extraDeps));
    if (stats.published || stats.failed) ctx.log?.(`social: opublikowano ${stats.published}, błędy ${stats.failed}`);
    return stats;
  } catch (err) {
    if (err?.code === '42P01') return { published: 0, failed: 0, processing: 0, retry: 0 }; // tenant bez migracji 121
    throw err;
  }
}
