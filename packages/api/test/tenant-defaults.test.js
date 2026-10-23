// Nowy kościół: wygląd Avenit + domyślny pulpit (seedTenantDefaults) na PRAWDZIWYM SQL (PGlite).
//  • szablon tenanta + migracje przyrostowe (jak provisionTenant) → seed → klucze są;
//  • szablon/migracje same NIE ustawiają tych kluczy (seed nie walczy z niczym);
//  • ON CONFLICT DO NOTHING: wybór admina / ponowne uruchomienie niczego nie nadpisuje;
//  • provisionTenant faktycznie woła seed (po migracjach).
//
// PGlite nie jest zależnością API — test sam się pomija, gdy go brak. Uruchomienie:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSqlScript } from '../src/lib/sqlscript.js';
import { applyTenantMigrations } from '../src/admin/provisioning.js';
import {
  seedTenantDefaults, TENANT_DEFAULT_SETTINGS, DEFAULT_APPEARANCE_SETTINGS,
  DASHBOARD_DEFAULT_LAYOUT_KEY, DEFAULT_DASHBOARD_LAYOUT,
} from '../src/admin/tenant-defaults.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const TEMPLATE = fs.readFileSync(new URL('../db/template/tenant_schema.sql', import.meta.url), 'utf8');
const KEYS = Object.keys(TENANT_DEFAULT_SETTINGS);

// pg-podobny pool: z parametrami → query, bez → exec (migracje mają wiele instrukcji).
function poolOf(pg) {
  return {
    async query(sql, params) {
      if (params) {
        const r = await pg.query(sql, params);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      }
      const rs = await pg.exec(sql);
      const last = rs[rs.length - 1] || { rows: [] };
      return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length };
    },
  };
}

const settingsOf = async (pool) => Object.fromEntries(
  (await pool.query(`SELECT key, value FROM app_settings WHERE key = ANY($1)`, [KEYS])).rows.map((r) => [r.key, r.value])
);

let pg; let pool;
before(async () => {
  if (skip) return;
  pg = new PGlite();
  pool = poolOf(pg);
  await runSqlScript(pool, TEMPLATE); // jak provisionTenant: łagodne błędy seedów szablonu są OK
  await applyTenantMigrations(pool);
});
after(async () => { await pg?.close(); });

test('szablon + migracje nie ustawiają kluczy wyglądu ani domyślnego pulpitu', { skip }, async () => {
  assert.deepEqual(await settingsOf(pool), {});
});

test('nowy tenant dostaje wygląd Avenit i pulpit jak w schwro', { skip }, async () => {
  const n = await seedTenantDefaults(pool);
  assert.equal(n, KEYS.length);
  const s = await settingsOf(pool);
  for (const [k, v] of Object.entries(DEFAULT_APPEARANCE_SETTINGS)) assert.equal(s[k], v, k);
  assert.equal(s.color_preset, 'avenit');
  assert.equal(s.appearance_theme, 'system');
  assert.equal(s.login_bg, 'default');
  const dash = JSON.parse(s[DASHBOARD_DEFAULT_LAYOUT_KEY]);
  assert.deepEqual(dash.layout, DEFAULT_DASHBOARD_LAYOUT);
  assert.equal(dash.mobile_layout, null);
  assert.equal(dash.layout.length, 13);
  assert.deepEqual(dash.layout.filter((w) => !w.visible).map((w) => w.widgetId),
    ['quickAccess', 'birthdays', 'rsvpSummary', 'attendance']);
});

test('ponowny seed nie nadpisuje wyboru admina (ON CONFLICT DO NOTHING)', { skip }, async () => {
  await pool.query(`UPDATE app_settings SET value = 'dark' WHERE key = 'appearance_theme'`, []);
  await pool.query(`UPDATE app_settings SET value = 'blue-indigo' WHERE key = 'color_preset'`, []);
  assert.equal(await seedTenantDefaults(pool), 0);
  const s = await settingsOf(pool);
  assert.equal(s.appearance_theme, 'dark');
  assert.equal(s.color_preset, 'blue-indigo');
});

test('provisionTenant woła seed po migracjach', () => {
  const src = fs.readFileSync(new URL('../src/admin/provisioning.js', import.meta.url), 'utf8');
  const mig = src.indexOf('await applyTenantMigrations(pool)');
  const seed = src.indexOf('await seedTenantDefaults(pool)');
  assert.ok(mig > 0 && seed > mig, 'seedTenantDefaults musi być po applyTenantMigrations');
});

test('nie kopiujemy własnej palety ani logo schwro', () => {
  assert.ok(!KEYS.some((k) => k.startsWith('custom_color_preset_') || k === 'org_logo_url'));
});
