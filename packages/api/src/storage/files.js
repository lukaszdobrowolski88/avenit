// Dostęp do plików storage z kodu serwera (odpowiednik supabase.storage.download
// w edge functions) — czyta bezpośrednio z dysku.
//
// Ścieżka jest zamknięta w katalogu <STORAGE_DIR>/<tenant>/<bucket>/ (audyt 2026-10, runda 3):
// wcześniej sprawdzano tylko korzeń STORAGE_DIR, więc "../../<inny-tenant>/<bucket>/x.pdf"
// czytało pliki innego kościoła (np. jako załącznik maila z programem).
import path from 'node:path';
import fsp from 'node:fs/promises';
import { config } from '../config.js';

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

function badPath() {
  const err = new Error('Nieprawidłowa ścieżka');
  err.status = 400;
  return err;
}

// Względna ścieżka w buckecie: bez "..", ".", pustych segmentów, ukośników wstecznych,
// bajtu NUL i ścieżek bezwzględnych. base — korzeń storage (parametr dla testów).
export function storagePath(tenantSlug, bucket, filePath, base = path.resolve(config.STORAGE_DIR)) {
  const slug = String(tenantSlug ?? '');
  const b = String(bucket ?? '');
  if (!NAME_RE.test(slug) || !NAME_RE.test(b)) throw badPath();
  const rel = String(filePath ?? '');
  if (!rel || rel.length > 500 || rel.includes('\0') || rel.includes('\\') || rel.startsWith('/') || path.isAbsolute(rel)) {
    throw badPath();
  }
  if (rel.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) throw badPath();
  const root = path.resolve(base, slug, b);
  const target = path.resolve(root, rel);
  if (!target.startsWith(root + path.sep)) throw badPath();
  return target;
}

export async function readStorageFile(tenantSlug, bucket, filePath) {
  const target = storagePath(tenantSlug, bucket, filePath);
  // Dowiązanie symboliczne nie może wyprowadzić poza katalog bucketu.
  const root = path.resolve(config.STORAGE_DIR, String(tenantSlug), String(bucket));
  const [realRoot, realTarget] = await Promise.all([fsp.realpath(root), fsp.realpath(target)]);
  if (!realTarget.startsWith(realRoot + path.sep)) throw badPath();
  return fsp.readFile(realTarget);
}

export async function readStorageFileBase64(tenantSlug, bucket, filePath) {
  const buf = await readStorageFile(tenantSlug, bucket, filePath);
  return buf.toString('base64');
}

export function publicStorageUrl(tenantSlug, bucket, filePath) {
  return `https://${tenantSlug}.${config.APP_DOMAIN}/storage/${bucket}/${filePath}`;
}
