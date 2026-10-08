import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';

const asLikes = (v) => (Array.isArray(v) ? v : []); // likes bywa {} (domyślny JSONB)

// Link w powiadomieniu prowadzi tam, skąd pisał autor: samodzielne Projekty → /projekty?board=…&item=…,
// zakładka „Zadania” w module → bieżąca strona modułu z dopisanym ?item=… (gdy go brak).
function itemLink(boardId, itemId) {
  const fallback = `/projekty?board=${boardId}&item=${itemId}`;
  try {
    const { pathname, search } = window.location;
    if (!pathname || pathname.startsWith('/projekty')) return fallback;
    const params = new URLSearchParams(search);
    params.set('item', itemId);
    return `${pathname}?${params.toString()}`;
  } catch { return fallback; }
}

// Wątek komentarzy + dziennik aktywności dla pojedynczego elementu.
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

  // body + @wzmianki (e-maile) → powiadomienia. Zwraca true/false — kompozytor czyści tekst
  // dopiero po udanym zapisie (przy błędzie wpis zostaje do ponownej próby).
  const addUpdate = useCallback(async (body, mentions = [], parentId = null) => {
    if (!body?.trim() || !itemId) return false;
    const { data, error } = await supabase.from('board_item_updates').insert({
      item_id: itemId, board_id: boardId, parent_update_id: parentId,
      author_email: userEmail || null, author_name: userName || null,
      body, mentions, likes: [],
    }).select().single();
    if (error || !data) { toast.error(error || tr('Nie udało się dodać komentarza'), { fallback: tr('Nie udało się dodać komentarza') }); return false; }
    setUpdates(prev => (prev.some(u => u.id === data.id) ? prev : [...prev, data]));

    // Powiadomienia dla wzmiankowanych osób (typ 'mention') — błąd powiadomienia nie cofa komentarza.
    const link = itemLink(boardId, itemId);
    for (const email of mentions) {
      if (email === userEmail) continue;
      supabase.from('notifications').insert({
        user_email: email, type: 'mention',
        title: tr('{name} wspomniał(a) o Tobie', { name: userName || userEmail || tr('Ktoś') }),
        body: body?.slice(0, 140) || '',
        link,
        data: { item_id: itemId, board_id: boardId },
      }).then(() => {}, () => {});
    }
    return true;
  }, [itemId, boardId, userEmail, userName]);

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
      setUpdates(prev => [...prev, ...removed.filter(r => !prev.some(u => u.id === r.id))]
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
      toast.error(error, { fallback: tr('Nie udało się usunąć komentarza') });
      return false;
    }
    return true;
  }, []);

  const loading = !!itemId && loadedId !== itemId;
  return { updates: loading ? [] : updates, activity: loading ? [] : activity, loading, reload: load, addUpdate, toggleLike, deleteUpdate };
}
