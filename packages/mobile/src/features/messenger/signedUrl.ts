import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { supabase, tenantWebBase } from "../../lib/supabase";
import { showError } from "../../lib/errors";
import { attachmentStoragePath, buildSignedUrl } from "./logic";

// K1 — prywatne załączniki czatu. Pliki rozmowy czytamy przez krótko ważny, podpisany link
// (POST /api/storage/messenger-attachments/sign → { signedPath }); serwer podpisuje tylko
// uczestnikowi rozmowy, której id jest pierwszym segmentem ścieżki. W bazie zostaje zwykły
// adres — podpis jest wyłącznie do WYŚWIETLENIA. Gdy podpis się nie uda (stary serwer, brak
// sieci), wracamy do zwykłego adresu (działa, dopóki właściciel nie włączy chat_private_files).

const BUCKET = "messenger-attachments";
// Link ważny 10 min, w pamięci trzymamy 4 min — zawsze zostaje zapas na wczytanie pliku.
const SIGN_TTL_S = 600;
const CACHE_MS = 4 * 60 * 1000;
// Nieudany podpis nie jest ponawiany przy każdym renderze (minuta przerwy).
const FAIL_MS = 60 * 1000;

const cache = new Map<string, { url: string; until: number }>();
const inflight = new Map<string, Promise<string>>();

const absolute = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = tenantWebBase();
  return base ? `${base}${url.startsWith("/") ? "" : "/"}${url}` : url;
};

// Gdzie stoi plik: host kościoła (api.* bez nagłówka nie wie, czyj to plik); bez niego — host z adresu.
const baseFor = (url: string): string => {
  const base = tenantWebBase();
  if (base) return base;
  const m = url.match(/^(https?:\/\/[^/]+)/i);
  return m ? m[1] : "";
};

const sign = async (path: string): Promise<string | null> => {
  try {
    const res: Response = await (supabase as any)._request(`/api/storage/${BUCKET}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, expiresIn: SIGN_TTL_S }),
    });
    if (!res.ok) return null;
    const payload = (await res.json().catch(() => null)) as { signedPath?: string } | null;
    return payload?.signedPath ? String(payload.signedPath) : null;
  } catch {
    return null;
  }
};

/** Czy adres wymaga podpisu (plik z magazynu czatu). */
export const needsSigning = (url: string | null | undefined): boolean => !!attachmentStoragePath(url);

/** Natychmiastowy wynik z pamięci (bez sieci) — do pierwszego renderu. */
export const cachedAttachmentUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const path = attachmentStoragePath(url);
  if (!path) return absolute(url);
  const hit = cache.get(path);
  return hit && hit.until > Date.now() ? hit.url : null;
};

/**
 * Adres do wyświetlenia załącznika (zdjęcie, plik, głosówka, galeria). Dla plików czatu —
 * podpisany link (pamięć ~4 min, równoległe prośby o ten sam plik łączone w jedną).
 * Zawsze zwraca jakiś adres: przy błędzie podpisu — zwykły.
 */
export async function resolveAttachmentUrl(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  const path = attachmentStoragePath(url);
  if (!path) return absolute(url);
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const pending = inflight.get(path);
  if (pending) return pending;
  const p = (async () => {
    const signedPath = await sign(path);
    const plain = absolute(url);
    if (!signedPath) {
      cache.set(path, { url: plain, until: Date.now() + FAIL_MS });
      return plain;
    }
    const base = baseFor(plain);
    const full = base ? buildSignedUrl(base, signedPath) : plain;
    cache.set(path, { url: full, until: Date.now() + CACHE_MS });
    return full;
  })().finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

/**
 * Hook dla obrazków: zwraca adres do `source.uri` (null = jeszcze podpisujemy — pokaż tło).
 * Adres nie zmienia się przez życie komponentu (obrazek nie wczytuje się drugi raz).
 */
export function useAttachmentUrl(url: string | null | undefined): string | null {
  const [state, setState] = useState<{ src: string | null | undefined; uri: string | null }>(() => ({
    src: url,
    uri: cachedAttachmentUrl(url),
  }));
  useEffect(() => {
    let alive = true;
    setState((prev) => {
      if (prev.src === url && prev.uri) return prev;
      return { src: url, uri: cachedAttachmentUrl(url) };
    });
    if (!cachedAttachmentUrl(url)) {
      resolveAttachmentUrl(url).then((u) => {
        if (alive) setState((prev) => (prev.src === url && prev.uri ? prev : { src: url, uri: u || null }));
      });
    }
    return () => {
      alive = false;
    };
  }, [url]);
  return state.src === url ? state.uri : null;
}

/** Otwórz plik czatu w przeglądarce/podglądzie systemu (z podpisanym linkiem). */
export async function openAttachment(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    const target = await resolveAttachmentUrl(url);
    await Linking.openURL(target);
  } catch (e) {
    showError("Nie udało się otworzyć pliku", e, "Spróbuj ponownie za chwilę.");
  }
}
