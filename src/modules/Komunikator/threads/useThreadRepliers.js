import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { hasThread, repliersByRoot } from './threadLogic';

// Awatary pod „N odpowiedzi”: ostatni odpowiadający w wątkach wczytanych wiadomości. Jedno lekkie
// zapytanie na zmianę liczników (klucz = id + liczba odpowiedzi), bez treści odpowiedzi.
const MAX_ROWS = 600;

export default function useThreadRepliers(messages = []) {
  const [byRoot, setByRoot] = useState({});
  const key = useMemo(
    () => messages.filter(hasThread).map((m) => `${m.id}:${m.thread_reply_count}`).sort().join(','),
    [messages]
  );

  useEffect(() => {
    const ids = key ? key.split(',').map((k) => k.split(':')[0]) : [];
    if (!ids.length) return undefined;
    let alive = true;
    supabase
      .from('messages')
      .select('thread_root_id, sender_email, created_at')
      .in('thread_root_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS)
      .then(({ data }) => {
        if (alive && data) setByRoot((prev) => ({ ...prev, ...repliersByRoot(data) }));
      }, () => {});
    return () => { alive = false; };
  }, [key]);

  return byRoot;
}
