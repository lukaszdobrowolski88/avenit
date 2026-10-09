import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { invokeFn, applyCommentEvent } from '../lib/boardSync';

const asLikes = (v) => (Array.isArray(v) ? v : []); // likes bywa {} (domyślny JSONB)
const byCreated = (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''));
let channelSeq = 0;

// Wątek komentarzy + dziennik aktywności dla pojedynczego elementu.
// Komentarz zapisuje fn board-comment (autor i tablica ustawiane na serwerze, który też powiadamia
// @wzmiankowane osoby — z linkiem do zadania wg taskItemLink). Nowe komentarze innych osób
// dochodzą na żywo (realtime board_item_updates, filtrowane po zadaniu po stronie klienta).
export function useItemUpdates(item, boardId, { userEmail, userName } = {}) {
  const itemId = item?.id;
  const [updates, setUpdates] = useState([]);
  const [activity, setActivity] = useState([]);
  // Dla którego elementu mamy już dane — do tego czasu `loading` (panel pokazuje spinner,
  // a nie mignięcie „Brak komentarzy” albo komentarze poprzedniego elementu).
  const [loadedId, setLoadedId] = useState(null);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!itemId) return;
    const req = ++reqRef.current; // odpowiedź dla poprzedniego elementu nie nadpisze bieżącego
    try {
      const [u, a] = await Promise.all([
        supabase.from('board_item_updates').select('*').eq('item_id', itemId).order('created_at', { ascending: true }),
        supabase.from('board_item_activity').select('*').eq('item_id', itemId).order('created_at', { ascending: false }).limit(100),
      ]);
      if (req !== reqRef.current) return;
      if (u.error) toast.error(u.error, { fallback: tr('Nie udało się wczytać komentarzy') });
      setUpdates(u.data || []);
      setActivity(a.data || []);
    } catch (e) {
      if (req !== reqRef.current) return;
      toast.error(e, { fallback: tr('Nie udało się wczytać komentarzy') });
      setUpdates([]);
      setActivity([]);
    } finally {
      if (req === reqRef.current) setLoadedId(itemId);
    }
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  // Na żywo: komentarze tego zadania (realtime ignoruje filtr — odsiewamy po item_id).
  useEffect(() => {
    if (!itemId) return undefined;
    const ch = supabase.channel(`item-updates-${itemId}-${++channelSeq}`);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'board_item_updates', filter: `item_id=eq.${itemId}` }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = p.old?.id;
        if (id == null) return;
        setUpdates(prev => (prev.some(u => u.id === id || u.parent_update_id === id)
          ? prev.filter(u => u.id !== id && u.parent_update_id !== id) : prev));
        return;
      }
      const row = p.new;
      if (!row || row.id == null || String(row.item_id) !== String(itemId)) return;
      setUpdates(prev => (prev.some(u => u.id === row.id)
        ? prev.map(u => (u.id === row.id ? { ...u, ...row } : u))
        : [...prev, row].sort(byCreated)));
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [itemId]);

  // body + @wzmianki (e-maile). Zwraca true/false — kompozytor czyści tekst dopiero po udanym
  // zapisie (przy błędzie wpis zostaje do ponownej próby).
  const addUpdate = useCallback(async (body, mentions = [], parentId = null) => {
    if (!body?.trim() || !itemId) return false;
    const fail = (err) => { toast.error(err || tr('Nie udało się dodać komentarza'), { fallback: tr('Nie udało się dodać komentarza') }); return false; };
    const r = await invokeFn(supabase, 'board-comment', {
      item_id: itemId, body, ...(parentId ? { parent_id: parentId } : {}), mentions: mentions || [],
    });
    let row = null;
    if (!r.missing) {
      if (r.error) return fail(r.error);
      row = r.data?.update || null;
    } else {
      // Stary serwer (bez board-comment) — zwykły zapis komentarza (bez powiadomień z klienta).
      const { data, error } = await supabase.from('board_item_updates').insert({
        item_id: itemId, board_id: boardId, parent_update_id: parentId,
        author_email: userEmail || null, author_name: userName || null,
        body, mentions, likes: [],
      }).select().single();
      if (error || !data) return fail(error);
      row = data;
    }
    if (row) setUpdates(prev => (prev.some(u => u.id === row.id) ? prev : [...prev, row].sort(byCreated)));
    else load();
    return true;
  }, [itemId, boardId, userEmail, userName, load]);

  const toggleLike = useCallback(async (update) => {
    const likes = asLikes(update.likes);
    const next = likes.includes(userEmail) ? likes.filter(e => e !== userEmail) : [...likes, userEmail];
    setUpdates(prev => prev.map(u => u.id === update.id ? { ...u, likes: next } : u));
    const { error } = await supabase.from('board_item_updates').update({ likes: next }).eq('id', update.id);
    if (error) {
      setUpdates(prev => prev.map(u => u.id === update.id ? { ...u, likes } : u));
      toast.error(error, { fallback: tr('Nie udało się zapisać reakcji') });
      return false;
    }
    return true;
  }, [userEmail]);

  const deleteUpdate = useCallback(async (id) => {
    let removed = [];
    setUpdates(prev => { removed = prev.filter(u => u.id === id || u.parent_update_id === id); return prev.filter(u => u.id !== id && u.parent_update_id !== id); });
    const { error } = await supabase.from('board_item_updates').delete().eq('id', id);
    if (error) {
      // Przywróć tylko to, co usunęliśmy (inne zmiany w międzyczasie zostają).
      setUpdates(prev => [...prev, ...removed.filter(r => !prev.some(u => u.id === r.id))].sort(byCreated));
      toast.error(error, { fallback: tr('Nie udało się usunąć komentarza') });
      return false;
    }
    return true;
  }, []);

  const loading = !!itemId && loadedId !== itemId;
  return { updates: loading ? [] : updates, activity: loading ? [] : activity, loading, reload: load, addUpdate, toggleLike, deleteUpdate };
}

// Liczniki komentarzy per zadanie (plakietki w wierszach/kartach). Zbiór id per zadanie, więc echo
// realtime własnego komentarza i synchronizacja z otwartego panelu (syncItem) nie liczą podwójnie.
export function useBoardCommentCounts(boardId) {
  const [byItem, setByItem] = useState(() => new Map());

  const load = useCallback(async () => {
    if (!boardId) return;
    const { data: rows, error } = await supabase.from('board_item_updates').select('id, item_id').eq('board_id', boardId);
    if (error) return;
    const m = new Map();
    for (const r of rows || []) {
      const k = String(r.item_id);
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(r.id);
    }
    setByItem(m);
  }, [boardId]);

  useEffect(() => { setByItem(new Map()); load(); }, [load]);

  useEffect(() => {
    if (!boardId) return undefined;
    const ch = supabase.channel(`board-updates-${boardId}-${++channelSeq}`);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'board_item_updates', filter: `board_id=eq.${boardId}` },
      (p) => setByItem(prev => applyCommentEvent(prev, p, boardId)));
    ch.subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  }, [boardId, load]);

  // Otwarty panel zna pełną listę komentarzy zadania — ustawia ją jako prawdę dla licznika.
  const syncItem = useCallback((itemId, ids) => {
    const k = String(itemId);
    setByItem(prev => {
      const cur = prev.get(k);
      if (cur && cur.size === ids.length && ids.every(id => cur.has(id))) return prev;
      if (!cur && !ids.length) return prev;
      const next = new Map(prev);
      next.set(k, new Set(ids));
      return next;
    });
  }, []);

  const counts = useMemo(() => {
    const out = {};
    for (const [k, set] of byItem) if (set.size) out[k] = set.size;
    return out;
  }, [byItem]);

  return { counts, syncItem, reload: load };
}
