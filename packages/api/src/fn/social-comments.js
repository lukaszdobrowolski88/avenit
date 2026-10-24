// Social Media — skrzynka komentarzy (tylko worker, bez trasy HTTP — nie ma go w fn/index.js):
// komentarze pod publikacjami z ostatnich 30 dni. Szczegóły: src/social/comments.js. Co 10 min.
import { syncComments } from '../social/comments.js';
import { ctxFromWorker } from '../social/service.js';

export const name = 'social-comments';

export async function runForTenant(pool, ctx = {}, extraDeps = {}) {
  try {
    const stats = await syncComments(ctxFromWorker(pool, ctx, extraDeps));
    if (stats.added) ctx.log?.(`social-comments: nowe komentarze ${stats.added}`);
    return stats;
  } catch (err) {
    if (err?.code === '42P01') return { synced: 0, added: 0, errors: 0 }; // tenant bez migracji 125
    throw err;
  }
}
