// Adresy plików z magazynu (storage) — czysta logika, bez React Native (test parytetu w webie:
// src/lib/mobileStorageUrls.test.js).
//
// Audyt uprawnień 2026-10, runda 5/6: pliki przestrzeni wrażliwych w buckecie „materials”
// (finance/…, members/…, care/…, giving/… — @avenit/shared materialsAccess.js) serwer oddaje
// WYŁĄCZNIE podpisanym, krótko ważnym linkiem (POST /api/storage/materials/sign). Mobilka
// budowała zwykły adres /storage/materials/<ścieżka> — taki plik kończył się 403.
import { isSignedMaterialsPath } from '@avenit/shared/src/lib/materialsAccess.js';

export const MATERIALS_BUCKET = 'materials';

const cleanPath = (p: string | null | undefined): string => String(p ?? '').replace(/^\/+/, '');

/** Czy plik z bucketu „materials” czyta się tylko podpisanym linkiem. */
export const materialNeedsSignature = (storagePath: string | null | undefined): boolean =>
  !!storagePath && isSignedMaterialsPath(cleanPath(storagePath));

/** Zwykły adres pliku na hoście kościoła (segmenty zakodowane — polskie litery, spacje). */
export function plainStorageUrl(base: string, bucket: string, storagePath: string): string {
  const encoded = cleanPath(storagePath)
    .split('/')
    .map((seg) => {
      let s = seg;
      try {
        s = decodeURIComponent(seg);
      } catch {
        /* surowa nazwa z „%” */
      }
      return encodeURIComponent(s);
    })
    .join('/');
  return `${String(base || '').replace(/\/+$/, '')}/storage/${bucket}/${encoded}`;
}

/**
 * Ścieżka w buckecie „materials” z adresu `…/storage/materials/<ścieżka>` (bez zapytania), albo
 * null dla innych adresów. Segmenty odkodowane — tak, jak ścieżka leży w bazie (storage_path).
 */
export function materialsPathFromUrl(url: string | null | undefined): string | null {
  const m = String(url ?? '').match(/\/storage\/materials\/([^?#]+)/);
  if (!m) return null;
  const path = m[1]
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');
  return path || null;
}
