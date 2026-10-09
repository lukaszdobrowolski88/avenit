// Worker: zadania cykliczne (zastępuje pg_cron + pg_net z Supabase).
// Uruchamiany jako osobny proces (docker service avenit-worker).
//
// Harmonogram (jak w oryginalnych cronach):
//  - push-campaign-dispatch  co 1 min
//  - sms-campaign-dispatch   co 1 min
//  - send-mailing-campaign   co 1 min (Mailing: zaplanowane + dokańczanie wysyłki)
//  - push-campaign-receipts  co 5 min
//  - sms-campaign-receipts   co 5 min
//  - sync-mail               co 5 min
//  - chat-channels-sync      co 10 min (skład kanałów służb i grup domowych)
//  - schedule-reminders      codziennie 18:00 Europe/Warsaw (grafik: przypomnienia + ponaglenia)
//  - task-digest             codziennie 07:00 Europe/Warsaw (skrót zadań na dziś; nadrabianie przy starcie do 12:00)
//  - board-import-legacy     przy starcie + codziennie 03:40 (stare tabele *_tasks → Tablice, raz na tenanta)
//  - process-dunning         codziennie 08:00 (baza platform)
import cron from 'node-cron';
import { platformPool, getTenantPool } from './db.js';

const log = (...args) => console.log(new Date().toISOString(), '[worker]', ...args);

async function activeTenants() {
  const { rows } = await platformPool.query(
    `SELECT slug, subdomain, name, db_name FROM tenants WHERE status IN ('trial', 'active')`
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
        tenantDbName: t.db_name, // klucz pamięci uprawnień (loadGrants) — osobny dla każdego tenanta
        tenantSubdomain: t.subdomain || t.slug,
        tenantName: t.name,
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
// Mailing: co minutę — zaplanowane maile, którym minął termin, oraz dokańczanie wysyłki
// rozpoczętej przez „Wyślij teraz” (paczkami, z pominięciem wypisanych).
cron.schedule('* * * * *', exclusive(() => forEachTenant('mailing', 'send-mailing-campaign')));
cron.schedule('*/15 * * * *', exclusive(() => forEachTenant('board-automations', 'board-automations-run')));
// Komunikator+: kanały służb i grup domowych — skład z zespołów/grup (dopisz/usuń/role), co 10 min.
cron.schedule('*/10 * * * *', exclusive(() => forEachTenant('chat-channels-sync', 'chat-channels-sync')));

// Automatyzacje: co 5 min — auto-zapis nowych oraz wykonanie należnych kroków.
cron.schedule('*/5 * * * *', exclusive(() => forEachTenant('automation', 'automation-run')));
// Dawanie cykliczne: codziennie 07:00 — generuj należne darowizny i przesuń terminy.
cron.schedule('0 7 * * *', exclusive(() => forEachTenant('giving-recurring', 'giving-recurring')));
// Finanse cykliczne: codziennie 07:05 — generuj należne wpływy/wydatki i przesuń terminy.
cron.schedule('5 7 * * *', exclusive(() => forEachTenant('finance-recurring', 'finance-recurring')));
// Harmonogramy raportów finansowych: 1. dnia miesiąca 07:10 — fn sam wybiera należne
// harmonogramy (next_run_date), więc jeden cron obsługuje miesiąc/kwartał/rok.
cron.schedule('10 7 1 * *', exclusive(() => forEachTenant('finance-report', 'finance-report-schedule')));
// Przypomnienia RSVP: codziennie 10:00 — ponaglenie niepotwierdzonych przed wydarzeniem.
cron.schedule('0 10 * * *', exclusive(() => forEachTenant('rsvp-reminders', 'rsvp-reminders')));
// Serie RSVP: codziennie 06:00 — generuj kolejne wystąpienia cyklicznych kampanii.
cron.schedule('0 6 * * *', exclusive(() => forEachTenant('rsvp-series', 'rsvp-series')));
// Przypomnienia urodzinowe: codziennie 08:00 — funkcja sama decyduje wg configu (daily/weekly).
cron.schedule('0 8 * * *', exclusive(() => forEachTenant('birthday-reminders', 'birthday-reminders')));
// Grafik służb: codziennie 18:00 (czas polski — wieczór przed, nie w nocy) — przypomnienie
// potwierdzonym na N dni przed wydarzeniem + ponaglenie osób bez odpowiedzi (app_settings
// schedule_reminders). Strefa jawnie — kontener workera nie ma ustawionego TZ (domyślnie UTC).
cron.schedule('0 18 * * *', exclusive(() => forEachTenant('schedule-reminders', 'schedule-reminders')), { timezone: 'Europe/Warsaw' });

// Zadania: poranny skrót (zadania na dziś i zaległe) — codziennie 07:00 czasu polskiego. Raz dziennie
// na osobę pilnuje znacznik task_digest_sends, więc nadrabianie przy starcie (wdrożenie rano) nie dubluje.
const taskDigest = exclusive(() => forEachTenant('task-digest', 'task-digest'));
cron.schedule('0 7 * * *', taskDigest, { timezone: 'Europe/Warsaw' });
// Zadania: jednorazowe przeniesienie starych tabel *_tasks na Tablice dla KAŻDEGO tenanta (bez czekania,
// aż ktoś otworzy zakładkę „Zadania”) + uzupełnienie osób/komentarzy. Idempotentne — przy starcie i co noc.
const legacyTasksImport = exclusive(() => forEachTenant('board-import-legacy', 'board-import-legacy'));
cron.schedule('40 3 * * *', legacyTasksImport, { timezone: 'Europe/Warsaw' });
setTimeout(() => {
  legacyTasksImport().catch((err) => log(`board-import-legacy start: błąd: ${err.message}`));
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hour >= 7 && hour < 12) taskDigest().catch((err) => log(`task-digest start: błąd: ${err.message}`));
}, 30_000);

cron.schedule('0 8 * * *', exclusive(async () => {
  try {
    const mod = await import('./fn/process-dunning.js');
    if (mod.run) await mod.run(platformPool, { log });
  } catch (err) {
    log(`dunning: błąd: ${err.message}`);
  }
}));

// ── Analityka (baza platform) ────────────────────────────────────────
// Co 10 min: domknij przeterminowane sesje + odśwież rollup dzisiejszego dnia
// (wykresy "dziś" w panelu admina są aktualne bez czekania na noc).
cron.schedule('*/10 * * * *', exclusive(async () => {
  try {
    const { closeStaleSessions, rollupDay, dayISO } = await import('./analytics/rollup.js');
    await closeStaleSessions(platformPool);
    await rollupDay(platformPool, dayISO());
  } catch (err) {
    log(`analytics-rollup: błąd: ${err.message}`);
  }
}));

// W nocy: finalny rollup wczorajszego dnia + retencja surowych danych.
cron.schedule('15 3 * * *', exclusive(async () => {
  try {
    const { rollupDay, runRetention, yesterdayISO } = await import('./analytics/rollup.js');
    await rollupDay(platformPool, yesterdayISO());
    await runRetention(platformPool);
  } catch (err) {
    log(`analytics-retencja: błąd: ${err.message}`);
  }
}));

// Poniedziałek 7:00: tygodniowy raport analityki e-mailem do właściciela.
cron.schedule('0 7 * * 1', exclusive(async () => {
  try {
    const { sendWeeklyReport } = await import('./analytics/report.js');
    await sendWeeklyReport(platformPool, { log });
  } catch (err) {
    log(`raport-tygodniowy: błąd: ${err.message}`);
  }
}));

// Raz w tygodniu: świeże bazy GeoIP; przy starcie dograj, jeśli ich brak.
cron.schedule('0 4 * * 1', exclusive(async () => {
  try {
    const { updateGeoipDb } = await import('../scripts/update-geoip.mjs');
    await updateGeoipDb();
  } catch (err) {
    log(`geoip: błąd: ${err.message}`);
  }
}));
(async () => {
  const { geoipFilesPresent, updateGeoipDb } = await import('../scripts/update-geoip.mjs');
  if (!geoipFilesPresent()) {
    log('geoip: brak baz — pobieram przy starcie...');
    await updateGeoipDb();
  }
})().catch((err) => log(`geoip start: błąd: ${err.message}`));

log('Worker wystartował — harmonogram aktywny.');
