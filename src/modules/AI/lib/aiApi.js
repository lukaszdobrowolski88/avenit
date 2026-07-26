// Klient modułu AI — wywołanie funkcji backendowej /api/fn/ai-assist
// dokładnie wzorcem aplikacji (supabase.functions.invoke).
import { supabase } from '../../../lib/supabase';

// Wywołaj asystenta AI. Zwraca tekst wyniku lub rzuca Error z czytelnym komunikatem.
export async function callAi(task, input, context = null) {
  const { data, error } = await supabase.functions.invoke('ai-assist', {
    body: { task, input, context },
  });

  if (error) {
    throw new Error(error.message || 'Błąd połączenia z asystentem AI.');
  }
  // Handler może zwrócić czytelny błąd w polu error (np. brak klucza API / odmowa).
  if (data?.error) {
    throw new Error(data.error);
  }
  if (!data?.result) {
    throw new Error('Asystent AI nie zwrócił treści.');
  }
  return data.result;
}
