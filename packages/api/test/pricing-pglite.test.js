// Cennik 2026-10 na PRAWDZIWYM SQL (PGlite — Postgres w procesie):
//  • schema.sql + migracje platformy od 004 (cennik) wzwyż — w kolejności, jak runner — na bazie
//    „jak produkcja” (stare plany, tenant, subskrypcja): idempotentne przy ponownym uruchomieniu,
//    plany = katalog (strona), stare ukryte, subskrypcje nietknięte; na świeżej bazie 5 planów;
//    odczyty miesięczne mają kolumnę accounts (007), stara kolumna adults przestaje być wymagana;
//  • liczenie KONT UŻYTKOWNIKÓW (countTenantAccounts) na różnych wariantach tabeli app_users.
//
// PGlite nie jest zależnością API — test sam się pomija, gdy go brak. Uruchomienie:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitSqlStatements } from '../src/lib/sqlscript.js';
import { PRICING_PLANS, RETIRED_PLAN_KEYS } from '@avenit/shared/src/billing/catalog.js';
import { countAccounts } from '@avenit/shared/src/billing/accounts.js';
import { countTenantAccounts, recordUsageSnapshots } from '../src/tenant/accounts.js';
import { resolveSignupPlan } from '../src/admin/provisioning.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const SCHEMA = fs.readFileSync(new URL('../db/platform/schema.sql', import.meta.url), 'utf8');
// Wszystkie migracje platformy od cennika (004) wzwyż, w kolejności nazw — jak migrate.mjs applyDir.
// Dzięki temu test sprawdza STAN KOŃCOWY (np. 006 poprawia opisy planów), a nie treść jednego pliku.
const MIG_DIR = new URL('../db/platform/migrations/', import.meta.url);
const PRICING_MIGRATIONS = fs.readdirSync(MIG_DIR).filter((f) => /\.sql$/.test(f) && f >= '004').sort()
  .map((f) => ({ file: f, sql: fs.readFileSync(new URL(f, MIG_DIR), 'utf8') }));
async function applyPricingMigrations(pg) {
  for (const m of PRICING_MIGRATIONS) {
    try { await pg.exec(m.sql); } catch (err) { throw new Error(`${m.file}: ${err.message}`); }
  }
}

function poolOf(pg) {
  return { async query(sql, params) { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; } };
}

// Jak migrate.mjs applyFile: instrukcja po instrukcji. Jedyny tolerowany błąd: CREATE EXTENSION
// (PGlite nie ma pgcrypto; gen_random_uuid() jest wbudowane).
async function applySchema(pg) {
  for (const stmt of splitSqlStatements(SCHEMA)) {
    try { await pg.exec(stmt); } catch (err) {
      if (/CREATE EXTENSION/i.test(stmt)) continue;
      throw new Error(`schema.sql: ${err.message}\n${stmt.slice(0, 200)}`);
    }
  }
}

// Dawny seed (stan produkcji sprzed cennika „za dorosłych”).
const OLD_SEED = `INSERT INTO subscription_plans (name, slug, key, description, price_monthly, price_yearly, max_members, max_users, max_groups, max_kids, max_events, max_storage_mb, trial_days, features, sort_order) VALUES
('Starter', 'starter', 'starter', 'Idealny dla małych kościołów', 4900, 49000, 50, 2, 5, 20, 10, 100, 14, '{"calendar": true}'::jsonb, 1),
('Standard', 'standard', 'standard', 'Podstawowe funkcje', 9900, 99000, 200, 5, 20, 100, 50, 500, 14, '{"calendar": true}'::jsonb, 2),
('Professional', 'professional', 'professional', 'Zaawansowane', 19900, 199000, 500, 10, -1, -1, -1, 2000, 14, '{"finance": true}'::jsonb, 3),
('Enterprise', 'enterprise', 'enterprise', 'Pełna funkcjonalność', 39900, 399000, -1, -1, -1, -1, -1, -1, 30, '{"api": true}'::jsonb, 4)
ON CONFLICT (slug) DO NOTHING`;

const plansBySlug = async (pg) => Object.fromEntries((await pg.query(`SELECT * FROM subscription_plans`)).rows.map((r) => [r.slug, r]));

let prod; // baza „jak produkcja”
before(async () => {
  if (skip) return;
  prod = new PGlite();
  await applySchema(prod);
  await prod.exec(OLD_SEED);
  await prod.exec(`
    INSERT INTO tenants (id, name, slug, subdomain, db_name, email, status)
      VALUES ('00000000-0000-4000-8000-000000000001', 'Zbór', 'zbor', 'zbor', 'avenit_tenant_zbor', 'a@x.pl', 'active');
    INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, status, billing_cycle)
      SELECT '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', id, 'active', 'yearly'
        FROM subscription_plans WHERE slug = 'standard';
  `);
  // Migracje + ponowne uruchomienie całości (deploy po deployu).
  await applyPricingMigrations(prod);
  await applySchema(prod);
  await applyPricingMigrations(prod);
  await applySchema(prod);
});

test('migracje cennika: 5 planów dokładnie jak w katalogu (ceny brutto, limity kont, opisy)', { skip }, async () => {
  const bySlug = await plansBySlug(prod);
  for (const p of PRICING_PLANS) {
    const r = bySlug[p.key];
    assert.ok(r, p.key);
    assert.equal(r.name, p.name);
    assert.equal(r.key, p.key);
    assert.equal(r.description, p.tagline);
    assert.equal(r.price_monthly, p.priceMonthly);
    assert.equal(r.price_yearly, p.priceYearly);
    assert.equal(r.max_members, p.maxAccounts, `${p.key}: limit kont w max_members`);
    for (const c of ['max_users', 'max_groups', 'max_kids', 'max_events', 'max_storage_mb']) assert.equal(r[c], -1, `${p.key}.${c}`);
    assert.deepEqual(r.features, { all_modules: true, priority_support: p.prioritySupport });
    assert.equal(r.trial_days, 14);
    assert.equal(r.limit_buffer_pct, 10);
    assert.equal(r.is_custom, p.isCustom);
    assert.equal(r.is_public, true);
    assert.equal(r.is_active, true);
    assert.equal(r.sort_order, p.sortOrder);
  }
});

test('migracje cennika: stare plany ukryte i nieaktywne, bez duplikatów, subskrypcje nietknięte', { skip }, async () => {
  const bySlug = await plansBySlug(prod);
  assert.equal(Object.keys(bySlug).length, PRICING_PLANS.length + RETIRED_PLAN_KEYS.length);
  for (const k of RETIRED_PLAN_KEYS) {
    assert.equal(bySlug[k].is_public, false, k);
    assert.equal(bySlug[k].is_active, false, k);
    assert.ok(bySlug[k].sort_order > 100, 'po nowych planach na liście admina');
    assert.ok(bySlug[k].sort_order < 200, 'przesunięte tylko raz (idempotentnie)');
  }
  assert.equal(bySlug.standard.price_monthly, 9900, 'ceny starych planów bez zmian');
  const { rows } = await prod.query(`SELECT ts.status, ts.billing_cycle, ts.custom_price_monthly, ts.custom_price_yearly, sp.slug
      FROM tenant_subscriptions ts JOIN subscription_plans sp ON sp.id = ts.plan_id`);
  assert.deepEqual(rows, [{ status: 'active', billing_cycle: 'yearly', custom_price_monthly: null, custom_price_yearly: null, slug: 'standard' }]);
  const { rows: snap } = await prod.query(`SELECT count(*)::int AS n FROM tenant_usage_snapshots`);
  assert.equal(snap[0].n, 0);
});

test('schema.sql ponownie po edycji planu w panelu nie nadpisuje cen (upsert tylko w migracji)', { skip }, async () => {
  await prod.exec(`UPDATE subscription_plans SET price_monthly = 8900 WHERE slug = 'start'`);
  await applySchema(prod);
  assert.equal((await plansBySlug(prod)).start.price_monthly, 8900);
  await applyPricingMigrations(prod); // migracje (uruchamiane raz przez runner) przywracają cennik strony
  assert.equal((await plansBySlug(prod)).start.price_monthly, 7900);
});

test('świeża baza: schema.sql + migracje → dokładnie 5 planów; provisioning wybiera start, a stary klucz → start', { skip }, async () => {
  const fresh = new PGlite();
  await applySchema(fresh);
  await applyPricingMigrations(fresh);
  const { rows } = await fresh.query(`SELECT slug FROM subscription_plans ORDER BY sort_order`);
  assert.deepEqual(rows.map((r) => r.slug), PRICING_PLANS.map((p) => p.key));
  const pool = poolOf(fresh);
  assert.equal((await resolveSignupPlan(undefined, pool)).key, 'start');
  assert.equal((await resolveSignupPlan('starter', pool)).key, 'start', 'nieistniejący stary plan');
  assert.equal((await resolveSignupPlan('kosciol', pool)).key, 'kosciol');
  assert.equal((await resolveSignupPlan('Wspólnota', pool)).key, 'wspolnota', 'po nazwie');
  assert.equal((await resolveSignupPlan('kosciol', pool)).trial_days, 14);
  // Wycofany plan (prod) → też start.
  assert.equal((await resolveSignupPlan('standard', poolOf(prod))).key, 'start');
});

// ── Odczyty miesięczne: kolumna accounts (007) ───────────────────────────────
test('migracja 007: tenant_usage_snapshots ma accounts/pending_accounts, adults już nie wymagane; worker zapisuje konta', { skip }, async () => {
  const { rows: cols } = await prod.query(`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'tenant_usage_snapshots'`);
  const byName = Object.fromEntries(cols.map((c) => [c.column_name, c.is_nullable]));
  assert.equal(byName.accounts, 'YES');
  assert.equal(byName.pending_accounts, 'YES');
  assert.equal(byName.adults, 'YES', 'historia: kolumna zostaje, ale nie jest wymagana');
  // Stary odczyt (sprzed zmiany) przeżywa migrację.
  await prod.exec(`INSERT INTO tenant_usage_snapshots (tenant_id, period, adults, plan_key, plan_limit, state)
    VALUES ('00000000-0000-4000-8000-000000000001', '2026-09-01', 120, 'standard', 200, 'ok')`);
  // Worker: tenant z bazą app_users (2 aktywne, 1 oczekujące, 1 zablokowane).
  const tenantPg = new PGlite();
  await tenantPg.exec(`CREATE TABLE app_users (id SERIAL PRIMARY KEY, email TEXT, is_active BOOLEAN DEFAULT TRUE, status VARCHAR(20) NOT NULL DEFAULT 'active');
    INSERT INTO app_users (email, is_active, status) VALUES ('a@x', true, 'active'), ('b@x', true, 'active'), ('c@x', false, 'pending'), ('d@x', false, 'blocked');`);
  const r = await recordUsageSnapshots(poolOf(prod), () => poolOf(tenantPg));
  assert.deepEqual(r, { tenants: 1, saved: 1 });
  const { rows } = await prod.query(`SELECT period::text AS period, accounts, pending_accounts, adults, plan_key FROM tenant_usage_snapshots ORDER BY period`);
  assert.deepEqual(rows[0], { period: '2026-09-01', accounts: null, pending_accounts: null, adults: 120, plan_key: 'standard' });
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[1].accounts, rows[1].pending_accounts, rows[1].adults, rows[1].plan_key], [2, 1, null, 'standard']);
  // Ponowny zapis w tym samym miesiącu nadpisuje (bez duplikatu).
  await tenantPg.exec(`UPDATE app_users SET status = 'active', is_active = true WHERE email = 'c@x'`);
  await recordUsageSnapshots(poolOf(prod), () => poolOf(tenantPg));
  const { rows: again } = await prod.query(`SELECT accounts, pending_accounts FROM tenant_usage_snapshots WHERE adults IS NULL`);
  assert.deepEqual(again, [{ accounts: 3, pending_accounts: 0 }]);
  await prod.exec(`DELETE FROM tenant_usage_snapshots`);
});

// ── Konta użytkowników na prawdziwym SQL ─────────────────────────────────────
const USERS = [
  { email: 'admin@k.pl', is_active: true, status: 'active', is_super_admin: true, role: 'superadmin' }, // liczy się
  { email: 'lider@k.pl', is_active: true, status: 'active', role: 'lider' },                             // liczy się
  { email: 'czl@k.pl', is_active: null, status: 'active', role: 'czlonek' },                             // NULL = aktywne
  { email: 'mail@k.pl', is_active: false, status: 'pending', pending_kind: 'email' },                    // oczekujące
  { email: 'zgoda@k.pl', is_active: false, status: 'pending', pending_kind: 'admin' },                   // oczekujące
  { email: 'blok@k.pl', is_active: false, status: 'blocked' },                                           // zablokowane
  { email: 'wyl@k.pl', is_active: false, status: 'active' },                                             // wyłączone
  { email: 'Duzy@k.pl', is_active: true, status: 'ACTIVE ' },                                            // liczy się
];

test('countTenantAccounts: app_users jak na produkcji (status + is_active) = lustro countAccounts w JS', { skip }, async () => {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE app_users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'user', is_active BOOLEAN DEFAULT TRUE, is_super_admin BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active', pending_kind VARCHAR(10))`);
  for (const u of USERS) {
    await pg.query(`INSERT INTO app_users (email, role, is_active, is_super_admin, status, pending_kind) VALUES ($1, $2, $3, $4, $5, $6)`,
      [u.email, u.role || 'user', u.is_active, !!u.is_super_admin, u.status, u.pending_kind || null]);
  }
  const r = await countTenantAccounts(poolOf(pg));
  const js = countAccounts(USERS);
  assert.deepEqual(js, { accounts: 4, pending: 2, blocked: 2, total: 8 });
  assert.deepEqual(r, { ...js, approximate: false, columns: ['status', 'is_active'] });
});

test('countTenantAccounts: stara baza bez kolumny status (tylko is_active) i brak tabeli', { skip }, async () => {
  const v1 = new PGlite();
  await v1.exec(`CREATE TABLE app_users (id SERIAL PRIMARY KEY, email TEXT, is_active BOOLEAN DEFAULT TRUE);
    INSERT INTO app_users (email, is_active) VALUES ('a', true), ('b', NULL), ('c', false);`);
  assert.deepEqual(await countTenantAccounts(poolOf(v1)), { accounts: 2, pending: 0, blocked: 1, total: 3, approximate: false, columns: ['is_active'] });
  const none = new PGlite();
  assert.deepEqual(await countTenantAccounts(poolOf(none)), { accounts: 0, pending: 0, blocked: 0, total: 0, approximate: false, columns: [] });
});
