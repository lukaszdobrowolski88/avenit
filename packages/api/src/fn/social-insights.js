// Social Media — analityka (tylko worker, bez trasy HTTP — nie ma go w fn/index.js): metryki
// opublikowanych postów i obserwujący kanałów. Szczegóły: src/social/insights.js. Co 3 h.
import { runInsights } from '../social/insights.js';
import { ctxFromWorker } from '../social/service.js';

export const name = 'social-insights';

export async function runForTenant(pool, ctx = {}, extraDeps = {}) {
  try {
    const stats = await runInsights(ctxFromWorker(pool, ctx, extraDeps));
    if (stats.metrics || stats.followers) ctx.log?.(`social-insights: metryki ${stats.metrics}, obserwujący ${stats.followers}`);
    return stats;
  } catch (err) {
    if (err?.code === '42P01') return { metrics: 0, followers: 0, errors: 0 }; // tenant bez migracji 125
    throw err;
  }
}
