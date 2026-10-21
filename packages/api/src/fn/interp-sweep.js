// Worker (co minutę, per tenant): tłumaczenie na żywo — sesje po wydarzeniu (+6 h) i usuniętych
// wydarzeń kończone (pokoje zamknięte), kanały bez tłumacza od 3 min → „nie nadaje”. Bez trasy HTTP.
import { interpDeps, sweepInterpretation } from '../interpretation/service.js';

export const name = 'interp-sweep';
export const skipRoute = true;

export async function runForTenant(pool, ctx = {}) {
  let changed = 0;
  try {
    changed = await sweepInterpretation({
      db: pool,
      tenantSlug: ctx.tenantSlug,
      tenant: { dbName: ctx.tenantDbName, slug: ctx.tenantSlug, subdomain: ctx.tenantSubdomain },
      log: { warn: (o, m) => ctx.log?.(m || '', o?.err?.message || '') },
      deps: interpDeps(),
    });
  } catch (err) {
    if (err?.code === '42P01') return { changed: 0 }; // tenant bez migracji 116
    throw err;
  }
  if (changed) ctx.log?.(`interp-sweep: zmieniono ${changed}`);
  return { changed };
}
