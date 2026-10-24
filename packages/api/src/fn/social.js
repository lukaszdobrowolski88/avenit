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
// Worker (co minutę): runForTenant — należne posty publikowane, ponowienia, przetwarzanie IG.
// Uprawnienia szczegółowe w funkcji (social/service.js → socialAccess); bramka: module:social.
import { config, isProd } from '../config.js';
import { SocialError, metaConfigured, metaRedirectUri } from '../social/meta.js';
import { startConnect, NONCE_COOKIE, STATE_TTL_MS } from '../social/accounts.js';
import {
  ctxFromRequest, ctxFromWorker, socialAccess, publicAccess, listPosts, loadPost, savePost, approvePost, rejectPost,
  unschedulePost, reschedulePost, publishNow, retryPost, deletePost, duplicatePost, getSlots, saveSlots, previewQueue,
  removeAccount, accountsPublic, counts, runDuePublishing, MSG,
} from '../social/service.js';

export const name = 'social';
export const isPublic = false;
export const capability = 'module:social';
export const rateLimit = { max: 120, timeWindow: '1 minute' };

const forbid = (message) => new SocialError(message, { status: 403, code: 'FORBIDDEN' });

const ACTIONS = {
  async status(ctx, access) {
    const [accounts, c] = await Promise.all([accountsPublic(ctx), counts(ctx, access)]);
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
    const mine = String(post.created_by || '').toLowerCase() === String(access.me?.email || '').toLowerCase();
    if (post.status === 'draft' && !mine && !access.admin && !access.updateAll && !access.publish) throw forbid(MSG.notYours);
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
