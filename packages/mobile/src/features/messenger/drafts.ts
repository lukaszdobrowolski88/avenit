import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// K11 — szkice: niewysłany tekst zapamiętany per rozmowa (na tym telefonie). Pamięć + AsyncStorage,
// lista rozmów pokazuje „Szkic: …”. Klucz zawiera e-mail — po zmianie konta szkice się nie mieszają.

const PREFIX = "messenger:draft:";
const key = (email: string, cid: string) => `${PREFIX}${email.toLowerCase()}:${cid}`;

let owner: string | null = null;
let drafts: Record<string, string> = {};
let hydrated: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const hydrate = (email: string): Promise<void> => {
  if (owner === email.toLowerCase() && hydrated) return hydrated;
  owner = email.toLowerCase();
  drafts = {};
  const prefix = `${PREFIX}${owner}:`;
  hydrated = (async () => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
      if (!keys.length) return;
      const pairs = await AsyncStorage.multiGet(keys);
      const next: Record<string, string> = {};
      for (const [k, v] of pairs) if (v) next[k.slice(prefix.length)] = v;
      // Zapis z bieżącej sesji (np. wpisany zanim pamięć się wczytała) ma pierwszeństwo.
      drafts = { ...next, ...drafts };
      emit();
    } catch {
      /* brak pamięci telefonu — szkice tylko do zamknięcia aplikacji */
    }
  })();
  return hydrated;
};

/** Szkic rozmowy (po wczytaniu pamięci). */
export async function loadDraft(email: string | null, cid: string): Promise<string> {
  if (!email || !cid) return "";
  await hydrate(email);
  return drafts[cid] ?? "";
}

/** Zapisz (pusty tekst = usuń) szkic rozmowy. */
export function saveDraft(email: string | null, cid: string, text: string): void {
  if (!email || !cid) return;
  if (owner !== email.toLowerCase()) void hydrate(email);
  const value = text.trim() ? text : "";
  if ((drafts[cid] ?? "") === value) return;
  if (value) drafts = { ...drafts, [cid]: value };
  else {
    const { [cid]: _gone, ...rest } = drafts;
    drafts = rest;
  }
  emit();
  (value ? AsyncStorage.setItem(key(email, cid), value) : AsyncStorage.removeItem(key(email, cid))).catch(() => undefined);
}

/** Mapa rozmowa → szkic (reaktywna) — do listy rozmów. */
export function useDrafts(email: string | null): Record<string, string> {
  const [snap, setSnap] = useState<Record<string, string>>(() => (email && owner === email.toLowerCase() ? drafts : {}));
  useEffect(() => {
    if (!email) return;
    const update = () => setSnap(owner === email.toLowerCase() ? drafts : {});
    listeners.add(update);
    hydrate(email).then(update);
    return () => {
      listeners.delete(update);
    };
  }, [email]);
  return snap;
}
