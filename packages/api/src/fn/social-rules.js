// Social Media — reguły automatyczne (tylko worker, bez trasy HTTP — nie ma go w fn/index.js):
// nowe kazanie / przypomnienie o wydarzeniu → post (szkic, do akceptacji albo kolejka).
// Szczegóły: src/social/rules.js. Co godzinę (minuta 7).
import { runRules } from '../social/rules.js';
import { ctxFromWorker } from '../social/service.js';

export const name = 'social-rules';

export async function runForTenant(pool, ctx = {}, extraDeps = {}) {
  try {
    const stats = await runRules(ctxFromWorker(pool, ctx, extraDeps));
    if (stats.created) ctx.log?.(`social-rules: utworzone posty ${stats.created}`);
    return stats;
  } catch (err) {
    if (err?.code === '42P01') return { created: 0, skipped: 0 }; // tenant bez migracji 123
    throw err;
  }
}
