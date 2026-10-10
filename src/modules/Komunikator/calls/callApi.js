import { supabase } from '../../../lib/supabase';

// API połączeń (funkcje serwera) — błędy obsługujemy sami (silent: bez globalnego toastu).
// Błąd ma status, code (np. calls_disabled, GUESTS_MINORS) i context (odpowiedź serwera).
export async function callFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body, silent: true });
  if (error) {
    const err = new Error(error.message || 'HTTP error');
    err.status = error.status;
    err.context = error.context;
    err.code = error.context?.code || null;
    throw err;
  }
  return data || {};
}
