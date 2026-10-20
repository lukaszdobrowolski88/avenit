import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { scheduledApi } from './scheduleUi';

// Moje zaplanowane wiadomości w rozmowie (oczekujące i nieudane). Zmiany (wysłanie przez worker,
// edycja na innym urządzeniu) przychodzą realtime — serwer wysyła je tylko nadawcy.
export default function useScheduledMessages(conversationId, enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const convRef = useRef(conversationId);
  convRef.current = conversationId;

  const refresh = useCallback(async () => {
    const convId = conversationId;
    if (!convId || !enabled) { setItems([]); return; }
    setLoading(true);
    try {
      const { scheduled } = await scheduledApi.list(convId);
      if (convRef.current === convId) setItems(Array.isArray(scheduled) ? scheduled : []);
    } catch {
      // Bez listy (np. serwer przed migracją) — po prostu nic nie pokazujemy.
      if (convRef.current === convId) setItems([]);
    } finally {
      if (convRef.current === convId) setLoading(false);
    }
  }, [conversationId, enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: wiersz tej rozmowy — aktualizacja na miejscu (wysłana/anulowana znika).
  useEffect(() => {
    if (!conversationId || !enabled) return undefined;
    const channel = supabase
      .channel(`scheduled_messages:${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_messages' }, (payload) => {
        const row = payload?.new;
        if (!row?.id || String(row.conversation_id) !== String(convRef.current)) return;
        setItems((prev) => {
          const rest = prev.filter((s) => s.id !== row.id);
          if (row.status !== 'pending' && row.status !== 'failed') return rest;
          return [...rest, row].sort((a, b) => new Date(a.send_at) - new Date(b.send_at));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, enabled]);

  const upsertLocal = useCallback((row) => {
    if (!row?.id) return;
    setItems((prev) => {
      const rest = prev.filter((s) => s.id !== row.id);
      if (row.status !== 'pending' && row.status !== 'failed') return rest;
      return [...rest, row].sort((a, b) => new Date(a.send_at) - new Date(b.send_at));
    });
  }, []);

  const create = useCallback(async (input) => {
    const { scheduled } = await scheduledApi.create({ conversation_id: conversationId, ...input });
    upsertLocal(scheduled);
    return scheduled;
  }, [conversationId, upsertLocal]);

  const update = useCallback(async (id, patch) => {
    const { scheduled } = await scheduledApi.update(id, patch);
    upsertLocal(scheduled);
    return scheduled;
  }, [upsertLocal]);

  const cancel = useCallback(async (id) => {
    const { scheduled } = await scheduledApi.cancel(id);
    upsertLocal(scheduled);
    return scheduled;
  }, [upsertLocal]);

  const sendNow = useCallback(async (id) => {
    try {
      const out = await scheduledApi.sendNow(id);
      upsertLocal(out.scheduled);
      return out;
    } catch (err) {
      refresh(); // np. odmowa → „nieudana” z powodem
      throw err;
    }
  }, [upsertLocal, refresh]);

  return { items, loading, refresh, create, update, cancel, sendNow };
}
