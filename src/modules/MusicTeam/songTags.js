// Tagi pieśni: wspólny słownik w bazie (app_settings `song_tags`) zamiast localStorage jednej
// przeglądarki. Odczyt: wprost z app_settings (czyta każdy zalogowany). Zapis: funkcja serwerowa
// `song-tags` (zapis do app_settings wymaga uprawnień administratora, a tagi dodaje lider).
import { supabase } from '../../lib/supabase';

export const SONG_TAGS_KEY = 'song_tags';
const LEGACY_KEY = 'worship_custom_tags'; // dawny zapis tylko w tej przeglądarce

// Wartość z app_settings (text / jsonb / podwójnie zakodowany JSON / tablica) → tablica tekstów.
export function parseTagValue(value) {
  let v = value;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try { v = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
}

// Pełna lista tagów do wyboru: słownik + tagi użyte na pieśniach + dawne tagi z przeglądarki.
// Bez duplikatów (wielkość liter), posortowana po polsku.
export function buildSongTagList({ dictValue = null, songs = [], legacy = [] } = {}) {
  const out = [];
  const add = (t) => { const c = String(t ?? '').trim(); if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c); };
  parseTagValue(dictValue).forEach(add);
  (songs || []).forEach((s) => (Array.isArray(s?.tags) ? s.tags : []).forEach(add));
  (legacy || []).forEach(add);
  return out.sort((a, b) => a.localeCompare(b, 'pl'));
}

export function readLegacyTags() {
  try { return parseTagValue(localStorage.getItem(LEGACY_KEY) || '[]'); } catch { return []; }
}
export function clearLegacyTags() {
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
}

// Zapis do słownika: { action: 'add'|'remove'|'rename'|'merge', tag?, to?, tags? } → { tags, error }.
export async function saveSongTags(body) {
  try {
    const { data, error } = await supabase.functions.invoke('song-tags', { body, silent: body?.action === 'merge' });
    if (error) return { tags: null, error };
    return { tags: Array.isArray(data?.tags) ? data.tags : null, error: null };
  } catch (error) {
    return { tags: null, error };
  }
}
