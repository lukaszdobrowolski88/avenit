// Dostęp do plików storage z kodu serwera (odpowiednik supabase.storage.download
// w edge functions) — czyta bezpośrednio z dysku.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { config } from '../config.js';

export function storagePath(tenantSlug, bucket, filePath) {
  const base = path.resolve(config.STORAGE_DIR);
  const target = path.resolve(base, tenantSlug, bucket, filePath);
  if (!target.startsWith(base + path.sep)) throw new Error('Nieprawidłowa ścieżka');
  return target;
}

export async function readStorageFile(tenantSlug, bucket, filePath) {
  return fsp.readFile(storagePath(tenantSlug, bucket, filePath));
}

export async function readStorageFileBase64(tenantSlug, bucket, filePath) {
  const buf = await readStorageFile(tenantSlug, bucket, filePath);
  return buf.toString('base64');
}

export function publicStorageUrl(tenantSlug, bucket, filePath) {
  return `https://${tenantSlug}.${config.APP_DOMAIN}/storage/${bucket}/${filePath}`;
}
