import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

// CRUD dashboardów BI (board_dashboards.layout = [widget...]).
export function useDashboards(userEmail) {
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('board_dashboards').select('*').order('created_at');
    setDashboards(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const createDashboard = useCallback(async (name) => {
    const { data } = await supabase.from('board_dashboards')
      .insert({ name: name || 'Nowy dashboard', layout: [], owner_email: userEmail || null, created_by: userEmail || null })
      .select().single();
    if (data) setDashboards(prev => [...prev, data]);
    return data;
  }, [userEmail]);

  const updateDashboard = useCallback(async (id, updates) => {
    const { data } = await supabase.from('board_dashboards').update(updates).eq('id', id).select().single();
    if (data) setDashboards(prev => prev.map(d => d.id === id ? data : d));
    return data;
  }, []);

  const deleteDashboard = useCallback(async (id) => {
    await supabase.from('board_dashboards').delete().eq('id', id);
    setDashboards(prev => prev.filter(d => d.id !== id));
  }, []);

  return { dashboards, loading, reload: load, createDashboard, updateDashboard, deleteDashboard };
}

// Ładuje kolumny + elementy dla zbioru tablic (na potrzeby widżetów dashboardu).
export function useBoardsBundle(boardIds) {
  const [bundle, setBundle] = useState({ boards: {}, columns: {}, items: {} });
  const [loading, setLoading] = useState(false);
  const key = (boardIds || []).slice().sort().join(',');

  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(',') : [];
    if (!ids.length) { setBundle({ boards: {}, columns: {}, items: {} }); return; }
    setLoading(true);
    (async () => {
      const [b, c, it] = await Promise.all([
        supabase.from('boards').select('id, name, color').in('id', ids),
        supabase.from('board_columns').select('*').in('board_id', ids),
        supabase.from('board_items').select('*').in('board_id', ids).is('parent_item_id', null),
      ]);
      if (!alive) return;
      const columns = {}; (c.data || []).forEach(col => (columns[col.board_id] = columns[col.board_id] || []).push(col));
      const items = {}; (it.data || []).forEach(i => (items[i.board_id] = items[i.board_id] || []).push(i));
      const boards = Object.fromEntries((b.data || []).map(x => [x.id, x]));
      setBundle({ boards, columns, items });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [key]);

  return { ...bundle, loading };
}
