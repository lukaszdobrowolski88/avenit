import { supabase } from './supabase';
import { toast } from './toast';
import { tr } from '../i18n';

// Pliki z bucketów czytanych tylko przez podpisany link (deklaracje członkowskie). W bazie
// trzymamy zwykły adres /storage/<bucket>/<ścieżka> — przy otwarciu prosimy serwer o podpis
// (sprawdza uprawnienia) i otwieramy plik w nowej karcie.
const SIGNED_BUCKETS = new Set(['membership-declarations']);

export function isProtectedFileUrl(url) {
  const m = String(url || '').match(/\/storage\/([^/?#]+)\//);
  return !!m && SIGNED_BUCKETS.has(m[1]);
}

export async function openProtectedFile(url) {
  const m = String(url || '').match(/\/storage\/([^/?#]+)\/([^?#]+)/);
  if (!m || !SIGNED_BUCKETS.has(m[1])) { window.open(url, '_blank', 'noopener'); return; }
  // Okno otwieramy od razu (blokery wyskakujących okien), adres ustawiamy po podpisaniu.
  const win = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(m[1]).createSignedUrl(decodeURIComponent(m[2]), 300);
  if (error || !data?.signedUrl) {
    win?.close();
    toast.error(tr('Nie udało się otworzyć pliku. Sprawdź, czy masz dostęp.'));
    return;
  }
  if (win) win.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}
