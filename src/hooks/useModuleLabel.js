import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Dynamiczna etykieta + kolor modułu — żeby zmiana nazwy/koloru modułu w Ustawieniach
// była widoczna także w NAGŁÓWKU wewnątrz modułu, nie tylko w menu. Współdzielony cache
// (singleton): jeden fetch (app_modules.label + app_settings 'module_colors') na sesję;
// subskrypcja re-renderuje nagłówki po zmianie (invalidateModuleLabels).
let _labels = null;   // { key: label }
let _colors = null;   // { key: '#hex' }
let _covers = null;   // { key: {type:'color'|'gradient'|'image', value} }
let _inflight = null;
const _subs = new Set();

async function loadAll() {
  if (_labels) return;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const [mods, settings] = await Promise.all([
        supabase.from('app_modules').select('key, label'),
        supabase.from('app_settings').select('key, value').in('key', ['module_colors', 'module_covers']),
      ]);
      const lab = {};
      (mods.data || []).forEach((m) => { if (m.key) lab[m.key] = m.label; });
      _labels = lab;
      const sMap = {};
      (settings.data || []).forEach((s) => { sMap[s.key] = s.value; });
      try { _colors = JSON.parse(sMap['module_colors'] || '{}') || {}; } catch { _colors = {}; }
      try { _covers = JSON.parse(sMap['module_covers'] || '{}') || {}; } catch { _covers = {}; }
    } catch {
      _labels = _labels || {}; _colors = _colors || {}; _covers = _covers || {};
    }
    _inflight = null;
    _subs.forEach((fn) => fn());
  })();
  return _inflight;
}

// Wywołać po zmianie nazwy/koloru/okładki modułu — odświeża cache i nagłówki na żywo.
export function invalidateModuleLabels() {
  _labels = null; _colors = null; _covers = null;
  loadAll();
}

function useModuleData(key, pick, fallback) {
  const [val, setVal] = useState(() => (key && _labels ? pick() : fallback));
  useEffect(() => {
    if (!key) { setVal(fallback); return; }
    let alive = true;
    const update = () => { if (alive) setVal(pick()); };
    _subs.add(update);
    loadAll().then(update);
    return () => { alive = false; _subs.delete(update); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback]);
  return key ? val : fallback;
}

// Etykieta modułu z bazy (z fallbackiem). Gdy key pusty → fallback.
export function useModuleLabel(key, fallback) {
  return useModuleData(key, () => (_labels?.[key] || fallback), fallback);
}

// Kolor akcentu modułu (#hex) lub null.
export function useModuleColor(key) {
  return useModuleData(key, () => (_colors?.[key] || null), null);
}

// Okładka modułu {type,value} lub null (wtedy PageHeader użyje koloru/gradientu marki).
export function useModuleCover(key) {
  return useModuleData(key, () => (_covers?.[key] || null), null);
}

export default useModuleLabel;
