// Worker (co minutę, per tenant): tłumaczenie na żywo — sesje po wydarzeniu (+6 h) i usuniętych
// wydarzeń kończone (pokoje zamknięte), kanały bez tłumacza od 3 min → „nie nadaje”; co 10 min
// uzgodnienie potwierdzonych tłumaczy z grafiku Tłumaczeń (scheduleSync.js). Bez trasy HTTP.
import { interpDeps, sweepInterpretation } from '../interpretation/service.js';
import { reconcileUpcoming } from '../interpretation/scheduleSync.js';

export const name = 'interp-sweep';
export const skipRoute = true;

export async function runForTenant(pool, ctx = {}) {
  let changed = 0;
  const ictx = {
    db: pool,
    tenantSlug: ctx.tenantSlug,
    tenant: { dbName: ctx.tenantDbName, slug: ctx.tenantSlug, subdomain: ctx.tenantSubdomain },
    log: { warn: (o, m) => ctx.log?.(m || '', o?.err?.message || '') },
    deps: interpDeps(),
  };
  try {
    changed = await sweepInterpretation(ictx);
  } catch (err) {
    if (err?.code === '42P01') return { changed: 0 }; // tenant bez migracji 116
    throw err;
  }
  if (changed) ctx.log?.(`interp-sweep: zmieniono ${changed}`);
  // Grafik Tłumaczeń → kanały (117): siatka bezpieczeństwa co 10 min, wydarzenia od wczoraj do +14 dni.
  let synced = 0;
  try {
    const res = await reconcileUpcoming(ictx);
    synced = (res || []).filter((r) => r.added || r.removed || r.channels_added || r.channels_removed || r.session_created).length;
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') ctx.log?.(`interp-sweep: grafik tłumaczy — ${err?.message || err}`);
  }
  if (synced) ctx.log?.(`interp-sweep: uzgodniono tłumaczy z grafiku (${synced} wydarzeń)`);
  return { changed, synced };
}
