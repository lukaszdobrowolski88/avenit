#!/usr/bin/env node
// Runner migracji: platform + wszystkie bazy tenantów.
//
//   node db/migrate.mjs platform      → migruje bazę platform (db/platform/*.sql)
//   node db/migrate.mjs tenants       → migruje wszystkie bazy tenantów (db/tenant-migrations/*.sql)
//   node db/migrate.mjs tenant <db>   → migruje jedną bazę tenanta
//
// Każda baza ma tabelę _migrations (nazwa pliku + hash). Plik uruchamiany jest raz.
// Schemat bazowy tenanta (template/tenant_schema.sql) zakłada provisioning; tutaj
// nakładamy tylko przyrostowe migracje z tenant-migrations/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dollar-quote-aware podział na instrukcje (jak w src/lib/sqlscript.js).
function splitSql(sql) {
  const out = []; let cur = ''; let i = 0; let tag = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (tag) { if (sql.startsWith(tag, i)) { cur += tag; i += tag.length; tag = null; continue; } cur += ch; i++; continue; }
    if (ch === '$') { const m = sql.slice(i).match(/^\$[a-zA-Z_]*\$/); if (m) { tag = m[0]; cur += tag; i += tag.length; continue; } }
    if (ch === '-' && sql[i + 1] === '-') { const nl = sql.indexOf('\n', i); const e = nl === -1 ? sql.length : nl; cur += sql.slice(i, e); i = e; continue; }
    if (ch === ';') { out.push(cur.trim()); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
const BASE_URL = process.env.DATABASE_URL || 'postgres://avenit:avenit@localhost:5432/avenit_platform';

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      hash TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now()
    )`);
}

async function applyDir(dbName, dir) {
  const url = new URL(BASE_URL);
  url.pathname = `/${dbName}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      : [];
    const { rows } = await client.query(`SELECT filename FROM _migrations`);
    const applied = new Set(rows.map((r) => r.filename));
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');
      console.log(`[${dbName}] ${file} ...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO _migrations (filename, hash) VALUES ($1, $2)`, [file, hash]);
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migracja ${file} nie powiodła się: ${err.message}`);
      }
    }
    console.log(`[${dbName}] zastosowano ${count} nowych migracji.`);
  } finally {
    await client.end();
  }
}

async function listTenantDbs() {
  const client = new Client({ connectionString: BASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT db_name FROM tenants ORDER BY created_at`);
    return rows.map((r) => r.db_name);
  } finally {
    await client.end();
  }
}

// Załaduj pojedynczy plik SQL (idempotentny) bez śledzenia w _migrations.
async function applyFile(dbName, filePath) {
  const url = new URL(BASE_URL);
  url.pathname = `/${dbName}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    // Instrukcja po instrukcji — tolerancja łagodnych błędów seedów (jak psql).
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = splitSql(sql);
    let ok = 0, failed = 0;
    for (const stmt of statements) {
      try { await client.query(stmt); ok++; }
      catch (err) { failed++; if (process.env.MIGRATE_VERBOSE) console.warn(`  ⚠ ${err.message}`); }
    }
    console.log(`[${dbName}] załadowano ${path.basename(filePath)} (${ok} ok, ${failed} pominięto)`);
  } finally {
    await client.end();
  }
}

const [, , target, arg] = process.argv;
const platformDb = new URL(BASE_URL).pathname.slice(1);

if (target === 'platform') {
  // Pełny schemat (idempotentny) + ewentualne migracje przyrostowe.
  await applyFile(platformDb, path.join(__dirname, 'platform/schema.sql'));
  await applyDir(platformDb, path.join(__dirname, 'platform/migrations'));
} else if (target === 'tenant' && arg) {
  await applyDir(arg, path.join(__dirname, 'tenant-migrations'));
} else if (target === 'tenants') {
  const dbs = await listTenantDbs();
  for (const db of dbs) await applyDir(db, path.join(__dirname, 'tenant-migrations'));
} else {
  console.error('Użycie: migrate.mjs platform | tenants | tenant <db_name>');
  process.exit(1);
}
