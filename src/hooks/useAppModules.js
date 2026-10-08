import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AI_ENABLED } from '../lib/features';

// Jedno źródło listy modułów (app_modules) dla powłoki aplikacji: menu boczne, trasy modułów
// z kreatora (App.jsx), wyszukiwarka ⌘K i biblioteka samouczków. Singleton: jeden fetch,
// jedna subskrypcja realtime, wspólny cache w localStorage (start bez migotania).
const CACHE_KEY = 'app_modules_cache';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const cached = readCache();
// loaded = pierwsze pobranie z serwera zakończone (sukcesem albo błędem).
let snapshot = { modules: (cached || []).filter((m) => AI_ENABLED || m?.key !== 'ai'), loaded: false, fromCache: !!cached, error: false };
const subs = new Set();
let inflight = null;
let channel = null;
let debounce = null;

function emit(patch) {
  // Moduł „Asystent AI” ukryty, gdy AI wyłączone (menu, ⌘K i trasy biorą listę stąd).
  if (!AI_ENABLED && patch.modules) patch = { ...patch, modules: patch.modules.filter((m) => m?.key !== 'ai') };
  snapshot = { ...snapshot, ...patch };
  subs.forEach((fn) => fn(snapshot));
}

function ensureRealtime() {
  if (channel) return;
  try {
    channel = supabase
      .channel('app-modules-store')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_modules' }, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { refreshAppModules(); }, 300);
      })
      .subscribe();
  } catch {
    channel = null;
  }
}

// Pobierz moduły z bazy (deduplikacja równoległych wywołań).
export function refreshAppModules() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('app_modules')
        .select('*')
        .order('display_order', { ascending: true });
      if (!error && Array.isArray(data)) {
        if (data.length) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* brak miejsca / tryb prywatny */ }
        }
        // Pusta odpowiedź (np. tabela jeszcze nie istnieje) — zostaw to, co było.
        emit({ modules: data.length ? data : snapshot.modules, loaded: true, error: false });
      } else {
        emit({ loaded: true, error: true });
      }
    } catch {
      emit({ loaded: true, error: true });
    } finally {
      inflight = null;
    }
  })();
  ensureRealtime();
  return inflight;
}

export function getAppModulesSnapshot() {
  return snapshot;
}

// { modules, loaded, fromCache, error }. autoLoad=false — tylko subskrypcja (App.jsx sam
// wywołuje refreshAppModules() dopiero, gdy jest sesja).
export function useAppModules({ autoLoad = true } = {}) {
  const [snap, setSnap] = useState(snapshot);
  useEffect(() => {
    subs.add(setSnap);
    setSnap(snapshot);
    if (autoLoad && !snapshot.loaded && !inflight) refreshAppModules();
    return () => { subs.delete(setSnap); };
  }, [autoLoad]);
  return snap;
}

export default useAppModules;
