// Pule połączeń: jedna do bazy platform + cache pul per tenant.
// Architektura: baza per tenant (avenit_tenant_<slug>) — izolacja strukturalna,
// zapytania tenanta NIGDY nie trafiają do innej bazy.
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// URL bazy platform, np. postgres://user:pass@host:5432/avenit_platform
export const platformPool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
});

// Bazowy URL bez nazwy bazy — do budowania połączeń per tenant.
const baseUrl = new URL(config.DATABASE_URL);

const tenantPools = new Map(); // db_name -> Pool

export function getTenantPool(dbName) {
  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Nieprawidłowa nazwa bazy tenanta: ${dbName}`);
  }
  let pool = tenantPools.get(dbName);
  if (!pool) {
    const url = new URL(baseUrl);
    url.pathname = `/${dbName}`;
    pool = new Pool({
      connectionString: url.toString(),
      max: 5,
      idleTimeoutMillis: 60_000,
    });
    pool.on('error', (err) => {
      console.error(`[db] błąd puli ${dbName}:`, err.message);
    });
    tenantPools.set(dbName, pool);
  }
  return pool;
}

export async function closeTenantPool(dbName) {
  const pool = tenantPools.get(dbName);
  if (pool) {
    tenantPools.delete(dbName);
    await pool.end().catch(() => {});
  }
}

// Cache tenantów (slug -> wiersz z tenants) — odświeżany co 30 s,
// żeby nie odpytywać platform przy każdym żądaniu.
const tenantCache = new Map(); // slug -> { row, fetchedAt }
const TENANT_CACHE_TTL = 30_000;

export async function resolveTenant(slug) {
  if (!slug) return null;
  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < TENANT_CACHE_TTL) return cached.row;

  const { rows } = await platformPool.query(
    `SELECT id, name, slug, subdomain, db_name, status, trial_ends_at
       FROM tenants WHERE subdomain = $1 OR slug = $1`,
    [slug]
  );
  const row = rows[0] || null;
  tenantCache.set(slug, { row, fetchedAt: Date.now() });
  return row;
}

export function invalidateTenantCache(slug) {
  if (slug) tenantCache.delete(slug);
  else tenantCache.clear();
}

export async function closeAll() {
  await Promise.allSettled([
    platformPool.end(),
    ...[...tenantPools.values()].map((p) => p.end()),
  ]);
  tenantPools.clear();
}
