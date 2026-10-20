import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';

// Media / pliki / linki / głosówki rozmowy (fn chat-media): filtrowane po stronie serwera, paczkami
// od najnowszych z kursorem. Każda zakładka ma własną listę — przełączanie nie pobiera od nowa.
// enabled=false (okno zamknięte) → nic nie pobieramy; po zamknięciu i ponownym otwarciu — świeżo.
export const FILE_KINDS = ['media', 'files', 'links', 'voice'];
const PAGE = 40;
const EMPTY = { items: [], next: null, loaded: false, loading: false, loadingMore: false, error: null };

async function fetchPage(conversationId, kind, cursor) {
  const { data, error } = await supabase.functions.invoke('chat-media', {
    body: { conversation_id: conversationId, kind, cursor: cursor || undefined, limit: PAGE },
    silent: true,
  });
  if (error) throw new Error(error.message || tr('Nie udało się wczytać materiałów rozmowy.'));
  return { items: Array.isArray(data?.items) ? data.items : [], next: data?.next || null };
}

export default function useConversationFiles(conversationId, kind, enabled = true) {
  const [lists, setLists] = useState({});
  const seqRef = useRef(0);
  const listsRef = useRef(lists);
  listsRef.current = lists;

  const patch = (k, p) => setLists(prev => ({ ...prev, [k]: { ...(prev[k] || EMPTY), ...p } }));

  const load = useCallback(async (k) => {
    if (!conversationId) return;
    const seq = seqRef.current;
    patch(k, { loading: true, error: null });
    try {
      const page = await fetchPage(conversationId, k, null);
      if (seq !== seqRef.current) return;
      patch(k, { items: page.items, next: page.next, loaded: true, loading: false });
    } catch (err) {
      if (seq !== seqRef.current) return;
      patch(k, { loading: false, error: err, loaded: true });
    }
  }, [conversationId]);

  // Nowa rozmowa albo zamknięcie okna — zapomnij listy (przy kolejnym otwarciu świeże dane).
  useEffect(() => {
    seqRef.current += 1;
    setLists({});
  }, [conversationId, enabled]);

  useEffect(() => {
    if (!enabled || !conversationId) return;
    const cur = listsRef.current[kind];
    if (!cur || (!cur.loaded && !cur.loading)) load(kind);
  }, [enabled, conversationId, kind, load, lists]);

  const loadMore = useCallback(async () => {
    const cur = listsRef.current[kind];
    if (!cur?.next || cur.loadingMore) return;
    const seq = seqRef.current;
    patch(kind, { loadingMore: true });
    try {
      const page = await fetchPage(conversationId, kind, cur.next);
      if (seq !== seqRef.current) return;
      setLists(prev => {
        const p = prev[kind] || EMPTY;
        const keys = new Set(p.items.map(i => i.key));
        return { ...prev, [kind]: { ...p, items: [...p.items, ...page.items.filter(i => !keys.has(i.key))], next: page.next, loadingMore: false } };
      });
    } catch (err) {
      if (seq === seqRef.current) patch(kind, { loadingMore: false });
      throw err;
    }
  }, [conversationId, kind]);

  const cur = lists[kind] || EMPTY;
  return {
    items: cur.items,
    loading: cur.loading || (enabled && !cur.loaded),
    loadingMore: cur.loadingMore,
    hasMore: !!cur.next,
    error: cur.error,
    loadMore,
    retry: () => load(kind),
  };
}
