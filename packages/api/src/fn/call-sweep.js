// Worker (co minutę, per tenant): połączenia dzwoniące > 45 s → nieodebrane / trwające (grupa),
// uzgodnienie z LiveKit (pokój zniknął, a webhook nie dotarł) i twardy limit długości.
// Bez trasy HTTP. Główną ścieżką jest timer w API (z realtime) — worker to siatka bezpieczeństwa
// po restarcie API (zmiany z workera nie idą przez realtime; klient odświeża stan sam).
import { callDeps, sweepCalls } from '../calls/service.js';
import { expireStaleGuestRequests } from '../calls/guests.js';

export const name = 'call-sweep';
export const skipRoute = true;

export async function runForTenant(pool, ctx = {}) {
  let changed = 0;
  try {
    changed = await sweepCalls({
      db: pool,
      tenantSlug: ctx.tenantSlug,
      log: { warn: (o, m) => ctx.log?.(m || '', o?.err?.message || '') },
      deps: callDeps({ timers: false }),
    });
  } catch (err) {
    if (err?.code === '42P01') return { changed: 0 }; // tenant bez migracji 096 — nic do zrobienia
    throw err;
  }
  // Goście (097): prośby z poczekalni, od których gość się nie odzywa — wygaszone.
  try {
    const stale = await expireStaleGuestRequests({ db: pool, tenantSlug: ctx.tenantSlug, deps: callDeps({ timers: false }) });
    if (stale) ctx.log?.(`call-sweep: wygaszono prośby gości: ${stale}`);
  } catch (err) {
    if (err?.code !== '42P01') throw err; // tenant bez migracji 097
  }
  if (changed) ctx.log?.(`call-sweep: zmieniono ${changed}`);
  return { changed };
}
