// Cennik „za dorosłych” na PRAWDZIWYM SQL (PGlite — Postgres w procesie):
//  • schema.sql + migracja platform 004 na bazie „jak produkcja” (stare plany, tenant, subskrypcja)
//    — idempotentne przy ponownym uruchomieniu, plany = katalog (strona), stare ukryte, subskrypcje
//    nietknięte; na świeżej bazie dokładnie 5 planów;
//  • liczenie dorosłych (countTenantAdults) na różnych wariantach tabeli members.
//
// PGlite nie jest zależnością API — test sam się pomija, gdy go brak. Uruchomienie:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitSqlStatements } from '../src/lib/sqlscript.js';
import { PRICING_PLANS, RETIRED_PLAN_KEYS } from '@avenit/shared/src/billing/catalog.js';
import { isAdultMember } from '@avenit/shared/src/billing/adults.js';
import { countTenantAdults } from '../src/tenant/adults.js';
import { resolveSignupPlan } from '../src/admin/provisioning.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const SCHEMA = fs.readFileSync(new URL('../db/platform/schema.sql', import.meta.url), 'utf8');
const MIG_004 = fs.readFileSync(new URL('../db/platform/migrations/004_pricing_adults.sql', import.meta.url), 'utf8');
const TODAY = '2026-10-09';

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
  // Migracja + ponowne uruchomienie całości (deploy po deployu).
  await prod.exec(MIG_004);
  await applySchema(prod);
  await prod.exec(MIG_004);
  await applySchema(prod);
});

test('migracja 004: 5 planów dokładnie jak na stronie (ceny brutto, limity dorosłych, opisy)', { skip }, async () => {
  const bySlug = await plansBySlug(prod);
  for (const p of PRICING_PLANS) {
    const r = bySlug[p.key];
    assert.ok(r, p.key);
    assert.equal(r.name, p.name);
    assert.equal(r.key, p.key);
    assert.equal(r.description, p.tagline);
    assert.equal(r.price_monthly, p.priceMonthly);
    assert.equal(r.price_yearly, p.priceYearly);
    assert.equal(r.max_members, p.maxAdults);
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

test('migracja 004: stare plany ukryte i nieaktywne, bez duplikatów, subskrypcje nietknięte', { skip }, async () => {
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
  await prod.exec(MIG_004); // migracja (uruchamiana raz przez runner) przywraca cennik strony
  assert.equal((await plansBySlug(prod)).start.price_monthly, 7900);
});

test('świeża baza: schema.sql + 004 → dokładnie 5 planów; provisioning wybiera start, a stary klucz → start', { skip }, async () => {
  const fresh = new PGlite();
  await applySchema(fresh);
  await fresh.exec(MIG_004);
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

// ── Dorośli na prawdziwym SQL ────────────────────────────────────────────────
const PEOPLE = [
  { first_name: 'Anna', status: 'Członek', birth_date: '1980-05-01' },        // dorosła
  { first_name: 'Bartek', status: 'Sympatyk', birth_date: null },             // brak daty → dorosły
  { first_name: 'Cela', status: 'Gość', birth_date: '1990-01-01' },           // gość
  { first_name: 'Darek', status: 'Członek', birth_date: '2010-03-03' },       // dziecko
  { first_name: 'Ewa', status: 'Członek', birth_date: '2008-10-09' },         // 18 dziś
  { first_name: 'Franek', status: 'Członek', birth_date: '2008-10-10' },      // 18 jutro
  { first_name: 'Gosia', status: 'zarchiwizowany', birth_date: '1970-01-01' },// archiwum
  { first_name: 'Henio', status: null, birth_date: null },                    // dorosły
];

test('countTenantAdults: tabela members jak na produkcji (status + birth_date DATE)', { skip }, async () => {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE members (id SERIAL PRIMARY KEY, first_name TEXT, last_name TEXT, status TEXT, birth_date DATE, home_group_id UUID)`);
  for (const p of PEOPLE) await pg.query(`INSERT INTO members (first_name, status, birth_date) VALUES ($1, $2, $3)`, [p.first_name, p.status, p.birth_date]);
  const r = await countTenantAdults(poolOf(pg), { today: TODAY });
  const expected = PEOPLE.filter((p) => isAdultMember(p, { today: TODAY })).length;
  assert.equal(expected, 4, 'Anna, Bartek, Ewa, Henio');
  assert.deepEqual(r, { adults: expected, total: PEOPLE.length, approximate: false, columns: ['birth_date', 'status'] });
  // Bez parametru — dzisiejsza data liczona w SQL w strefie Europe/Warsaw (nie wysypuje się).
  const live = await countTenantAdults(poolOf(pg));
  assert.equal(live.approximate, false);
  assert.ok(live.adults >= 3 && live.adults <= 5);
});

test('countTenantAdults: szablon v1 (membership_status, is_active) i tekstowa data ze śmieciami', { skip }, async () => {
  const v1 = new PGlite();
  await v1.exec(`CREATE TABLE members (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), first_name VARCHAR(100), birth_date DATE,
    membership_status VARCHAR(50) DEFAULT 'active', is_active BOOLEAN DEFAULT TRUE, archived_at TIMESTAMPTZ)`);
  await v1.exec(`INSERT INTO members (first_name, birth_date, membership_status, is_active, archived_at) VALUES
    ('a', '1980-01-01', 'active', true, NULL), ('b', NULL, 'inactive', true, NULL), ('c', NULL, 'active', false, NULL),
    ('d', NULL, 'active', NULL, NULL), ('e', NULL, 'active', true, now()), ('f', '2015-01-01', 'active', true, NULL)`);
  const r1 = await countTenantAdults(poolOf(v1), { today: TODAY });
  assert.equal(r1.adults, 2, 'a i d');
  assert.deepEqual(r1.columns, ['birth_date', 'membership_status', 'is_active', 'archived_at']);

  const txt = new PGlite();
  await txt.exec(`CREATE TABLE members (id SERIAL PRIMARY KEY, status TEXT, birth_date TEXT)`);
  await txt.exec(`INSERT INTO members (status, birth_date) VALUES ('Członek', '1980-01-01'), ('Członek', '2015-01-01'), ('Gość', NULL), ('Członek', 'kiedyś')`);
  const ok = await countTenantAdults(poolOf(txt), { today: TODAY });
  assert.deepEqual([ok.adults, ok.approximate], [2, false], 'tekst ISO rzutowany, „kiedyś” = brak daty');
  await txt.exec(`INSERT INTO members (status, birth_date) VALUES ('Członek', '2020-13-45')`);
  const bad = await countTenantAdults(poolOf(txt), { today: TODAY });
  assert.deepEqual([bad.adults, bad.approximate, bad.total], [4, true, 5], 'nierzutowalna data → liczymy bez wieku');

  const none = new PGlite();
  assert.deepEqual(await countTenantAdults(poolOf(none)), { adults: 0, total: 0, approximate: false, columns: [] });
});
