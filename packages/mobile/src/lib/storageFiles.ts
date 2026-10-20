import { supabase, tenantWebBase } from './supabase';
import { buildSignedUrl } from '../features/messenger/logic';
import { MATERIALS_BUCKET, materialNeedsSignature, materialsPathFromUrl, plainStorageUrl } from './storageUrls';

// Otwieranie plików z magazynu. Jeden pomocnik dla Plików, „Udostępnionych mi” i materiałów
// wydarzeń: plik przestrzeni wrażliwej (Finanse, Członkowie, Opieka, Dawanie) dostaje podpisany,
// krótko ważny link (POST /api/storage/<bucket>/sign → { signedPath }; serwer sprawdza dostęp
// do modułu), pozostałe — zwykły adres jak dotąd. Link budujemy na HOŚCIE KOŚCIOŁA
// (tenantWebBase): api.* bez nagłówka X-Tenant nie wie, czyj to plik. Bez zmian natywnych —
// sama logika JS (bezpieczne do OTA).

// Link ważny 10 min — wystarczy na otwarcie w przeglądarce / podglądzie systemu.
const SIGN_TTL_S = 600;

/** Podpisana ścieżka serwera (`/storage/<bucket>/<plik>?exp=…&sig=…`) albo null przy błędzie / braku prawa. */
export async function signStoragePath(bucket: string, path: string, expiresIn = SIGN_TTL_S): Promise<string | null> {
  try {
    const res: Response = await (supabase as any)._request(`/api/storage/${bucket}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, expiresIn }),
    });
    if (!res.ok) return null;
    const payload = (await res.json().catch(() => null)) as { signedPath?: string } | null;
    return payload?.signedPath ? String(payload.signedPath) : null;
  } catch {
    return null;
  }
}

/**
 * Adres do otwarcia pliku z Plików (materials_files.storage_path). Przestrzeń wrażliwa — podpisany
 * link (null, gdy serwer odmówi: brak dostępu albo brak sieci); pozostałe — zwykły adres.
 */
export async function materialFileUrl(storagePath: string | null | undefined): Promise<string | null> {
  const base = tenantWebBase();
  if (!base || !storagePath) return null;
  const path = String(storagePath).replace(/^\/+/, '');
  if (!materialNeedsSignature(path)) return plainStorageUrl(base, MATERIALS_BUCKET, path);
  const signed = await signStoragePath(MATERIALS_BUCKET, path);
  return signed ? buildSignedUrl(base, signed) : null;
}

/**
 * Adres do otwarcia gotowego adresu pliku (np. materiał wydarzenia, załącznik). Gdy wskazuje plik
 * przestrzeni wrażliwej w Plikach — zamieniany na podpisany link; inne adresy bez zmian.
 */
export async function resolveFileUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const path = materialsPathFromUrl(url);
  if (!path || !materialNeedsSignature(path)) return url;
  return materialFileUrl(path);
}
