import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

// Wątek aktualizacji + dziennik aktywności dla pojedynczego elementu.
export function useItemUpdates(item, boardId, { userEmail, userName } = {}) {
  const [updates, setUpdates] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!item?.id) return;
    setLoading(true);
    try {
      const [u, a] = await Promise.all([
        supabase.from('board_item_updates').select('*').eq('item_id', item.id).order('created_at', { ascending: true }),
        supabase.from('board_item_activity').select('*').eq('item_id', item.id).order('created_at', { ascending: false }).limit(100),
      ]);
      setUpdates(u.data || []);
      setActivity(a.data || []);
    } finally {
      setLoading(false);
    }
  }, [item?.id]);

  useEffect(() => { load(); }, [load]);

  // body + wykryte @wzmianki (emaile) → notyfikacje (Faza 3)
  const addUpdate = useCallback(async (body, mentions = [], parentId = null) => {
    if (!body?.trim() && mentions.length === 0) return;
    const { data, error } = await supabase.from('board_item_updates').insert({
      item_id: item.id, board_id: boardId, parent_update_id: parentId,
      author_email: userEmail || null, author_name: userName || null,
      body, mentions, likes: [],
    }).select().single();
    if (error) { console.error(error); return; }
    setUpdates(prev => [...prev, data]);

    // Powiadomienia dla wzmiankowanych osób (typ 'mention')
    for (const email of mentions) {
      if (email === userEmail) continue;
      supabase.from('notifications').insert({
        user_email: email, type: 'mention',
        title: `${userName || 'Ktoś'} wspomniał(a) o Tobie`,
        body: body?.slice(0, 140) || '',
        link: `/projekty?board=${boardId}&item=${item.id}`,
        data: { item_id: item.id, board_id: boardId },
      }).then(() => {}, () => {});
    }
    return data;
  }, [item?.id, boardId, userEmail, userName]);

  const toggleLike = useCallback(async (update) => {
    const likes = update.likes || [];
    const next = likes.includes(userEmail) ? likes.filter(e => e !== userEmail) : [...likes, userEmail];
    setUpdates(prev => prev.map(u => u.id === update.id ? { ...u, likes: next } : u));
    await supabase.from('board_item_updates').update({ likes: next }).eq('id', update.id);
  }, [userEmail]);

  const deleteUpdate = useCallback(async (id) => {
    setUpdates(prev => prev.filter(u => u.id !== id && u.parent_update_id !== id));
    await supabase.from('board_item_updates').delete().eq('id', id);
  }, []);

  return { updates, activity, loading, reload: load, addUpdate, toggleLike, deleteUpdate };
}
