import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { normEmail, emailPattern } from '../utils/chatLogic';

// Zablokowane osoby (K10) — tabela osobista user_blocks (właściciel: blocker_email).
// Wspólny stan modułu: nagłówek, wątek i dymki widzą tę samą listę bez osobnych zapytań.
const store = { email: null, set: new Set(), loaded: false, loading: null };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(store.set));

async function load(userEmail) {
  if (!userEmail) return;
  if (store.email === normEmail(userEmail) && (store.loaded || store.loading)) return store.loading;
  store.email = normEmail(userEmail);
  store.loaded = false;
  store.loading = (async () => {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_email')
      .ilike('blocker_email', emailPattern(userEmail))
      .silent();
    // Brak tabeli (serwer przed migracją) albo błąd — po prostu nikogo nie blokujemy.
    store.set = new Set(error ? [] : (data || []).map((r) => normEmail(r.blocked_email)).filter(Boolean));
    store.loaded = true;
    store.loading = null;
    emit();
  })();
  return store.loading;
}

export default function useBlocks(userEmail) {
  const [blocked, setBlocked] = useState(store.set);

  useEffect(() => {
    const l = (s) => setBlocked(new Set(s));
    listeners.add(l);
    load(userEmail);
    return () => { listeners.delete(l); };
  }, [userEmail]);

  const isBlocked = useCallback((email) => !!email && blocked.has(normEmail(email)), [blocked]);

  // Rzuca błąd — wywołujący pokazuje komunikat.
  const block = useCallback(async (email) => {
    if (!userEmail || !email) return;
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocker_email: userEmail, blocked_email: email })
      .select('blocker_email, blocked_email');
    // Już zablokowana (duplikat) — to też sukces.
    if (error && !(String(error.code) === '23505' || String(error.code) === '409')) throw error;
    store.set = new Set([...store.set, normEmail(email)]);
    emit();
  }, [userEmail]);

  const unblock = useCallback(async (email) => {
    if (!userEmail || !email) return;
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .ilike('blocker_email', emailPattern(userEmail))
      .ilike('blocked_email', emailPattern(email))
      .select('blocker_email, blocked_email');
    if (error) throw error;
    const next = new Set(store.set);
    next.delete(normEmail(email));
    store.set = next;
    emit();
  }, [userEmail]);

  return { blocked, isBlocked, block, unblock };
}
