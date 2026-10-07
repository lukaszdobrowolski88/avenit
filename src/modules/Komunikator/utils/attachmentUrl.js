// Prywatne załączniki Komunikatora (K1). W bazie zostaje zwykły adres
// /storage/messenger-attachments/<conversationId>/<plik>; przy WYŚWIETLANIU prosimy serwer o podpisany,
// krótko ważny link (POST /api/storage/messenger-attachments/sign → { signedPath }) — serwer podpisuje
// tylko uczestnikowi rozmowy z pierwszego segmentu ścieżki. Gdy podpis się nie uda (stary plik, brak
// sieci, starszy serwer) — zwracamy zwykły adres (działa, dopóki chat_private_files jest wyłączone).
import { supabase } from '../../../lib/supabase';

export const MESSENGER_BUCKET = 'messenger-attachments';
const CACHE_MS = 4 * 60 * 1000;   // podpis trzymamy ~4 min w pamięci
const SIGN_SECONDS = 15 * 60;      // ważność linku dłuższa niż cache (odtwarzanie głosówki, przewijanie)

// Ścieżka pliku w buckecie albo null (obcy adres / już podpisany).
export function messengerStoragePath(url) {
  const s = String(url || '');
  const m = s.match(/\/storage\/messenger-attachments\/([^?#]+)/);
  if (!m) return null;
  if (/[?&](sig|signature|token|exp|expires)=/i.test(s)) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

// Ścieżka nowego pliku: pierwszy segment = id rozmowy (warunek podpisu po stronie serwera).
export function attachmentUploadPath(conversationId, fileName) {
  const safe = String(fileName || 'plik').replace(/[^\w.-]+/g, '_');
  return conversationId ? `${conversationId}/${safe}` : `attachments/${safe}`;
}

// Fabryka (testowalna): cache ~4 min, wspólna obietnica dla równoległych próśb o ten sam plik.
export function createAttachmentUrlResolver({ sign, ttlMs = CACHE_MS, now = () => Date.now() } = {}) {
  const cache = new Map();    // path -> { url, at }
  const inflight = new Map(); // path -> Promise<string>

  const fresh = (path) => {
    const hit = cache.get(path);
    if (hit && now() - hit.at < ttlMs) return hit.url;
    if (hit) cache.delete(path);
    return null;
  };

  // Synchronicznie: gotowy adres (podpisany z cache albo zwykły, gdy nie wymaga podpisu) lub null.
  function peek(url) {
    if (!url) return null;
    const path = messengerStoragePath(url);
    if (!path) return url;
    return fresh(path);
  }

  async function resolve(url) {
    if (!url) return url;
    const path = messengerStoragePath(url);
    if (!path) return url;
    const cached = fresh(path);
    if (cached) return cached;
    if (inflight.has(path)) return inflight.get(path);
    const p = (async () => {
      let out = url;
      try {
        const signed = await sign(path);
        if (signed) out = signed;
      } catch { /* fallback: zwykły adres */ }
      cache.set(path, { url: out, at: now() });
      return out;
    })().finally(() => inflight.delete(path));
    inflight.set(path, p);
    return p;
  }

  return { resolve, peek, clear: () => { cache.clear(); inflight.clear(); } };
}

async function signWithServer(path) {
  const { data, error } = await supabase.storage.from(MESSENGER_BUCKET).createSignedUrl(path, SIGN_SECONDS);
  if (error || !data?.signedUrl) throw error || new Error('sign failed');
  return data.signedUrl;
}

const defaultResolver = createAttachmentUrlResolver({ sign: signWithServer });

// Używać przy wyświetlaniu zdjęć/plików/głosówek/galerii.
export const resolveAttachmentUrl = (url) => defaultResolver.resolve(url);
export const peekAttachmentUrl = (url) => defaultResolver.peek(url);

// Pierwszy segment ścieżki (id rozmowy, do której plik należy).
export const attachmentConversationOf = (url) => {
  const p = messengerStoragePath(url);
  return p ? p.split('/')[0] : null;
};

// Przekazanie wiadomości do innej rozmowy: plik z cudzego folderu kopiujemy do folderu rozmowy
// docelowej (inaczej jej uczestnicy nie dostaliby podpisu). Każdy błąd → załącznik bez zmian.
export async function copyAttachmentToConversation(att, conversationId) {
  if (!att?.url || !conversationId) return att;
  const owner = attachmentConversationOf(att.url);
  if (!owner || owner === String(conversationId)) return att;
  try {
    const src = await resolveAttachmentUrl(att.url);
    const res = await fetch(src, { credentials: 'include' });
    if (!res.ok) return att;
    const blob = await res.blob();
    const base = String(messengerStoragePath(att.url) || '').split('/').pop() || 'plik';
    const path = attachmentUploadPath(conversationId, `${Date.now()}-${base}`);
    const { error } = await supabase.storage.from(MESSENGER_BUCKET).upload(path, blob, { contentType: att.type || blob.type || undefined });
    if (error) return att;
    const { data } = supabase.storage.from(MESSENGER_BUCKET).getPublicUrl(path);
    return data?.publicUrl ? { ...att, url: data.publicUrl } : att;
  } catch {
    return att;
  }
}

// Otwarcie pliku w nowej karcie z podpisem (okno od razu — blokery wyskakujących okien).
export async function openAttachment(url) {
  const ready = peekAttachmentUrl(url);
  if (ready) { window.open(ready, '_blank', 'noopener'); return; }
  const win = window.open('', '_blank');
  const target = await resolveAttachmentUrl(url);
  if (win) { try { win.opener = null; } catch { /* ignore */ } win.location.href = target; } else window.location.href = target;
}
