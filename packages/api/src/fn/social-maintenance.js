// Social Media — codzienne utrzymanie (tylko worker, bez trasy HTTP — nie ma go w fn/index.js):
// sprawdzenie tokenów kanałów + odświeżenie nazw/zdjęć, sprzątanie nieużywanych plików postów.
// Szczegóły: src/social/maintenance.js.
import { runMaintenance } from '../social/maintenance.js';
import { ctxFromWorker } from '../social/service.js';

export const name = 'social-maintenance';

export async function runForTenant(pool, ctx = {}, extraDeps = {}) {
  try {
    const stats = await runMaintenance(ctxFromWorker(pool, ctx, extraDeps));
    if (stats.revoked || stats.removed) ctx.log?.(`social-maintenance: kanały do połączenia ${stats.revoked}, usunięte katalogi plików ${stats.removed}`);
    return stats;
  } catch (err) {
    if (err?.code === '42P01') return { ok: 0, revoked: 0, errors: 0, removed: 0 }; // tenant bez migracji 121
    throw err;
  }
}
