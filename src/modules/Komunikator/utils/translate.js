// Tłumaczenie wiadomości (K3): POST /api/fn/translate-message { message_id, target } → { text, source_lang }.
// Serwer trzyma cache w message_translations; tu dodatkowo pamięć na czas sesji (bez ponownych zapytań).
// Brak konfiguracji AI → 503 AI_NOT_CONFIGURED z ludzkim komunikatem.
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';

const cache = new Map(); // `${id}:${lang}` -> { text, source_lang }
const inflight = new Map();

export const cachedTranslation = (messageId, lang) => cache.get(`${messageId}:${lang}`) || null;

const LANG_NAMES = { pl: 'polski', en: 'angielski', uk: 'ukraiński', de: 'niemiecki', ru: 'rosyjski', es: 'hiszpański', fr: 'francuski', it: 'włoski', cs: 'czeski', sk: 'słowacki', be: 'białoruski' };
export function languageName(code) {
  const c = String(code || '').toLowerCase().slice(0, 2);
  return LANG_NAMES[c] ? tr(LANG_NAMES[c]) : String(code || '').toUpperCase();
}

// Błąd z ludzkim tekstem (err.friendly) — do pokazania wprost w toast.error. Serwer (fn
// translate-message) zwraca { error: ludzki komunikat, code } — wtedy bierzemy jego tekst.
function translateError(error) {
  const code = error?.context?.code || null;
  const serverMsg = code ? error?.context?.error : null;
  const e = new Error(serverMsg || 'translate failed');
  e.code = code;
  if (serverMsg) e.friendly = serverMsg;
  else if (error?.status === 503) {
    e.friendly = tr('Tłumaczenie nie jest jeszcze włączone. Poproś administratora o skonfigurowanie asystenta AI w ustawieniach.');
  } else if (error?.status === 404) {
    e.friendly = tr('Tłumaczenie nie jest jeszcze dostępne na tym serwerze.');
  } else if (error?.status === 429) {
    e.friendly = tr('Zbyt wiele tłumaczeń naraz. Odczekaj chwilę i spróbuj ponownie.');
  }
  return e;
}

// Zwraca { text, source_lang } albo { same: true }, gdy wiadomość już jest w docelowym języku.
export async function translateMessage(messageId, target) {
  const lang = ['pl', 'en', 'uk'].includes(target) ? target : 'pl';
  const key = `${messageId}:${lang}`;
  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const { data, error } = await supabase.functions.invoke('translate-message', { body: { message_id: messageId, target: lang }, silent: true });
    if (error) throw translateError(error);
    const src = String(data?.source_lang || '').toLowerCase().slice(0, 2);
    if (src && src === lang) return { same: true };
    if (!data?.text) throw translateError({});
    const out = { text: String(data.text), source_lang: src && src !== 'un' ? data.source_lang : null };
    cache.set(key, out);
    return out;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
