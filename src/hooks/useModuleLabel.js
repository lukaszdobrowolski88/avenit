import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Dynamiczna etykieta modułu (z app_modules.label) — żeby zmiana nazwy modułu w
// Ustawieniach była widoczna także w NAGŁÓWKU wewnątrz modułu, nie tylko w menu.
// Współdzielony cache (singleton) — jeden fetch na sesję, subskrypcja re-renderuje
// wszystkie nagłówki po zmianie nazwy (invalidateModuleLabels).
let _cache = null;        // { key: label }
let _inflight = null;
const _subs = new Set();

async function loadLabels() {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const { data } = await supabase.from('app_modules').select('key, label');
      const map = {};
      (data || []).forEach((m) => { if (m.key) map[m.key] = m.label; });
      _cache = map;
    } catch {
      _cache = {};
    }
    _inflight = null;
    _subs.forEach((fn) => fn(_cache));
    return _cache;
  })();
  return _inflight;
}

// Wywołać po zmianie nazwy modułu — odświeża cache i nagłówki na żywo.
export function invalidateModuleLabels() {
  _cache = null;
  loadLabels();
}

// Zwraca etykietę modułu z bazy (z fallbackiem). Gdy key pusty → zwraca fallback.
export function useModuleLabel(key, fallback) {
  const [label, setLabel] = useState(() => (key && _cache?.[key]) || fallback);
  useEffect(() => {
    if (!key) { setLabel(fallback); return; }
    let alive = true;
    const update = (map) => { if (alive) setLabel(map[key] || fallback); };
    _subs.add(update);
    loadLabels().then(update);
    return () => { alive = false; _subs.delete(update); };
  }, [key, fallback]);
  return key ? label : fallback;
}

export default useModuleLabel;
