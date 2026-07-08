// Prowizjonowanie tenantów: CREATE DATABASE + szablon schematu + seed + konto admina.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { platformPool, getTenantPool, closeTenantPool, invalidateTenantCache } from '../db.js';
import { hashPassword } from '../auth/passwords.js';
import { runSqlScript } from '../lib/sqlscript.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../../db/template/tenant_schema.sql');
const TENANT_MIGRATIONS_DIR = path.resolve(__dirname, '../../db/tenant-migrations');

const SLUG_RE = /^[a-z][a-z0-9-]{1,40}$/;

// Nakłada migracje przyrostowe z db/tenant-migrations na bazę tenanta (raz każdą).
export async function applyTenantMigrations(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY, filename TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT now())`);
  let files = [];
  try {
    files = (await fs.readdir(TENANT_MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return;
  }
  const { rows } = await pool.query(`SELECT filename FROM _migrations`);
  const applied = new Set(rows.map((r) => r.filename));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(TENANT_MIGRATIONS_DIR, file), 'utf8');
    await pool.query(sql);
    await pool.query(`INSERT INTO _migrations (filename) VALUES ($1)`, [file]);
  }
}

export function slugToDbName(slug) {
  return `avenit_tenant_${slug.replaceAll('-', '_')}`;
}

export async function provisionTenant({
  name,
  slug,
  email,
  adminEmail,
  adminName,
  adminPassword,
  planKey = 'starter',
  company = {},
}) {
  if (!SLUG_RE.test(String(slug || ''))) {
    throw new Error('Nieprawidłowy slug (dozwolone: a-z, 0-9, myślnik, 2-41 znaków)');
  }
  const dbName = slugToDbName(slug);

  const { rows: existing } = await platformPool.query(
    `SELECT 1 FROM tenants WHERE slug = $1 OR subdomain = $1 OR db_name = $2`,
    [slug, dbName]
  );
  if (existing.length) throw new Error(`Tenant '${slug}' już istnieje`);

  // 1. CREATE DATABASE (poza transakcją — Postgres tego wymaga).
  await platformPool.query(`CREATE DATABASE "${dbName}"`);

  try {
    // 2. Schemat z szablonu — instrukcja po instrukcji (szablon zawiera łagodne
    //    błędy seedów, które nie mogą przerwać tworzenia struktury).
    const templateSql = await fs.readFile(TEMPLATE_PATH, 'utf8');
    const pool = getTenantPool(dbName);
    const result = await runSqlScript(pool, templateSql);
    // Sanity: kluczowa tabela musi istnieć, inaczej coś poszło poważnie źle.
    const { rows: check } = await pool.query(`SELECT to_regclass('public.app_users') AS t`);
    if (!check[0].t) {
      throw new Error(`Szablon nie utworzył app_users (${result.failed} błędów instrukcji)`);
    }

    // 2b. Migracje przyrostowe po szablonie (szablon = baza, migracje = przyrosty).
    //     Dzięki temu nowe tabele wystarczy dodać jako migrację — bez regeneracji
    //     szablonu. Śledzone w tabeli _migrations.
    await applyTenantMigrations(pool);

    // 3. Konto administratora kościoła.
    const password = adminPassword || crypto.randomBytes(9).toString('base64url');
    await pool.query(
      `INSERT INTO app_users (email, full_name, role, is_active, password_hash)
       VALUES ($1, $2, 'superadmin', true, $3)
       ON CONFLICT (email) DO NOTHING`,
      [adminEmail, adminName || 'Administrator', await hashPassword(password)]
    );

    // 4. Wpis w control plane + subskrypcja trial wg planu.
    const { rows: planRows } = await platformPool.query(
      `SELECT id, trial_days FROM subscription_plans WHERE key = $1 OR name ILIKE $1 LIMIT 1`,
      [planKey]
    );
    const plan = planRows[0] || null;
    const trialDays = plan?.trial_days ?? 14;

    const { rows: tenantRows } = await platformPool.query(
      `INSERT INTO tenants (name, slug, subdomain, db_name, email, status, trial_ends_at,
                            company_name, tax_id, address, city, postal_code, country, phone)
       VALUES ($1, $2, $2, $3, $4, 'trial', now() + ($5 || ' days')::interval,
               $6, $7, $8, $9, $10, COALESCE($11, 'PL'), $12)
       RETURNING *`,
      [
        name, slug, dbName, email || adminEmail, String(trialDays),
        company.company_name || null, company.tax_id || null, company.address || null,
        company.city || null, company.postal_code || null, company.country || null,
        company.phone || null,
      ]
    );
    const tenant = tenantRows[0];

    if (plan) {
      await platformPool.query(
        `INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_cycle,
                                           current_period_start, current_period_end)
         VALUES ($1, $2, 'trialing', 'monthly', now(), now() + ($3 || ' days')::interval)`,
        [tenant.id, plan.id, String(trialDays)]
      );
    }

    invalidateTenantCache(slug);
    return { tenant, adminPassword: adminPassword ? undefined : password };
  } catch (err) {
    // Sprzątanie po nieudanym prowizjonowaniu.
    await closeTenantPool(dbName);
    await platformPool.query(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {});
    await platformPool.query(`DELETE FROM tenants WHERE db_name = $1`, [dbName]).catch(() => {});
    throw err;
  }
}

// Usunięcie/archiwizacja: baza zostaje zrzucona do pliku przez skrypt backupu,
// tutaj tylko odcinamy dostęp (status) — twarde DROP DATABASE wykonuje się świadomie.
export async function dropTenantDatabase(dbName) {
  await closeTenantPool(dbName);
  await platformPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
    [dbName]
  );
  await platformPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
}
