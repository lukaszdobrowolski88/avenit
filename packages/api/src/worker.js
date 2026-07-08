// Worker: zadania cykliczne (zastępuje pg_cron + pg_net z Supabase).
// Uruchamiany jako osobny proces (docker service avenit-worker).
//
// Harmonogram (jak w oryginalnych cronach):
//  - push-campaign-dispatch  co 1 min
//  - sms-campaign-dispatch   co 1 min
//  - push-campaign-receipts  co 5 min
//  - sms-campaign-receipts   co 5 min
//  - sync-mail               co 5 min
//  - process-dunning         codziennie 08:00 (baza platform)
import cron from 'node-cron';
import { platformPool, getTenantPool } from './db.js';

const log = (...args) => console.log(new Date().toISOString(), '[worker]', ...args);

async function activeTenants() {
  const { rows } = await platformPool.query(
    `SELECT slug, db_name FROM tenants WHERE status IN ('trial', 'active')`
  );
  return rows;
}

// Odpal runner per tenant; błędy jednego tenanta nie blokują pozostałych.
async function forEachTenant(jobName, moduleName) {
  let mod;
  try {
    mod = await import(`./fn/${moduleName}.js`);
  } catch (err) {
    log(`${jobName}: brak modułu (${err.message})`);
    return;
  }
  if (!mod.runForTenant) {
    log(`${jobName}: moduł nie eksportuje runForTenant`);
    return;
  }
  const tenants = await activeTenants().catch((err) => {
    log(`${jobName}: błąd pobierania tenantów: ${err.message}`);
    return [];
  });
  for (const t of tenants) {
    try {
      await mod.runForTenant(getTenantPool(t.db_name), {
        tenantSlug: t.slug,
        log: (...a) => log(`[${t.slug}]`, ...a),
      });
    } catch (err) {
      log(`${jobName}: [${t.slug}] błąd: ${err.message}`);
    }
  }
}

// Prosty mutex — nie nakładaj kolejnego przebiegu, jeśli poprzedni trwa.
function exclusive(fn) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } finally {
      running = false;
    }
  };
}

cron.schedule('* * * * *', exclusive(() => forEachTenant('push-dispatch', 'push-campaign-dispatch')));
cron.schedule('* * * * *', exclusive(() => forEachTenant('sms-dispatch', 'sms-campaign-dispatch')));
cron.schedule('*/5 * * * *', exclusive(() => forEachTenant('push-receipts', 'push-campaign-receipts')));
cron.schedule('*/5 * * * *', exclusive(() => forEachTenant('sms-receipts', 'sms-campaign-receipts')));
cron.schedule('*/5 * * * *', exclusive(() => forEachTenant('sync-mail', 'sync-mail')));

cron.schedule('0 8 * * *', exclusive(async () => {
  try {
    const mod = await import('./fn/process-dunning.js');
    if (mod.run) await mod.run(platformPool, { log });
  } catch (err) {
    log(`dunning: błąd: ${err.message}`);
  }
}));

log('Worker wystartował — harmonogram aktywny.');
