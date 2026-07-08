#!/usr/bin/env node
// Przeniesienie plików ze Storage Supabase do katalogu tenanta na VPS.
// Listuje obiekty w każdym buckecie przez API Supabase Storage i pobiera je
// do STORAGE_DIR/<tenantSlug>/<bucket>/<path>.
//
// Użycie:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   TENANT_SLUG=schwro \
//   STORAGE_DIR=/srv/storage \
//   node deploy/migrate-storage.mjs
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_SLUG = process.env.TENANT_SLUG;
const STORAGE_DIR = process.env.STORAGE_DIR || './storage';

if (!SUPABASE_URL || !KEY || !TENANT_SLUG) {
  console.error('Ustaw SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TENANT_SLUG');
  process.exit(1);
}

const BUCKETS = [
  'public-assets', 'finance', 'programs', 'materials', 'equipment',
  'kids-materials', 'membership-declarations', 'mail-attachments', 'messenger-attachments',
];

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function listAll(bucket, prefix = '') {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!res.ok) return [];
  const items = await res.json();
  let files = [];
  for (const it of items) {
    const full = prefix ? `${prefix}/${it.name}` : it.name;
    if (it.id === null || it.metadata === null) {
      // katalog — rekurencja
      files = files.concat(await listAll(bucket, full));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function download(bucket, objPath, dest) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(objPath)}`, { headers });
  if (!res.ok) { console.warn(`  ⚠ pominięto ${bucket}/${objPath} (${res.status})`); return false; }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
  return true;
}

let total = 0;
for (const bucket of BUCKETS) {
  const files = await listAll(bucket);
  if (files.length) console.log(`Bucket ${bucket}: ${files.length} plików`);
  for (const f of files) {
    const dest = path.join(STORAGE_DIR, TENANT_SLUG, bucket, f);
    if (await download(bucket, f, dest)) total++;
  }
}
console.log(`\nGotowe: przeniesiono ${total} plików do ${path.join(STORAGE_DIR, TENANT_SLUG)}`);
