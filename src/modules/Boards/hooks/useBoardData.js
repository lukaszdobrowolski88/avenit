import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { defaultColumnSettings, defaultCellValue } from '../lib/columnTypes';
import { GROUP_COLORS, pickColor } from '../lib/constants';

// Silnik danych pojedynczej tablicy: ładuje kolumny, grupy, elementy, widoki,
// listę osób organizacji, oraz udostępnia wszystkie mutacje. Po każdej mutacji
// aktualizuje stan lokalny (web ma realtime wyłączony — polegamy na optymistyce).
export function useBoardData(boardId, { userEmail, userName } = {}) {
  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [views, setViews] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setErrorState] = useState(null);
  // KAŻDY błąd mutacji pokazuj użytkownikowi (toast) — koniec cichych awarii „nic się nie dzieje".
  // Opakowanie sprawia, że wszystkie istniejące setError(e.message) automatycznie robią toast.
  const setError = useCallback((msg) => { setErrorState(msg); if (msg) toast.error(typeof msg === 'string' ? msg : 'Wystąpił błąd'); }, []);
  const onAutomationRef = useRef(null); // hook automatyzacji podpina się tu w Fazie 5

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setError(null);
    try {
      const [b, cols, grps, its, vws, ppl] = await Promise.all([
        supabase.from('boards').select('*').eq('id', boardId).single(),
        supabase.from('board_columns').select('*').eq('board_id', boardId).order('display_order'),
        supabase.from('board_groups').select('*').eq('board_id', boardId).order('display_order'),
        supabase.from('board_items').select('*').eq('board_id', boardId).order('display_order'),
        supabase.from('board_views').select('*').eq('board_id', boardId).order('display_order'),
        supabase.from('app_users').select('email, full_name, name, avatar_url').eq('is_active', true).order('full_name'),
      ]);
      if (b.error) throw b.error;
      setBoard(b.data);
      setColumns(cols.data || []);
      setGroups(grps.data || []);
      setItems(its.data || []);
      setViews((vws.data && vws.data.length) ? vws.data : []);
      setPeople((ppl.data || []).map(u => ({ email: u.email, name: u.full_name || u.name || u.email, avatar_url: u.avatar_url })));
    } catch (err) {
      console.error('Błąd ładowania tablicy:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  // ── Dziennik aktywności (Faza 3) ───────────────────────────────────
  // Kolumny from_value/to_value są JSONB — skalarne wartości opakowujemy w {value},
  // by były poprawnym JSON-em (goły string np. 'done' nie skonwertuje się na jsonb).
  const asJson = (x) => (x === null || x === undefined) ? null : (typeof x === 'object' ? x : { value: x });
  const logActivity = useCallback(async (itemId, action, columnId, fromValue, toValue) => {
    try {
      await supabase.from('board_item_activity').insert({
        item_id: itemId, board_id: boardId, actor_email: userEmail || null, actor_name: userName || null,
        column_id: columnId || null, action, from_value: asJson(fromValue), to_value: asJson(toValue),
      });
    } catch { /* dziennik nie może blokować UX */ }
  }, [boardId, userEmail, userName]);

  // ── Kolumny ────────────────────────────────────────────────────────
  const addColumn = useCallback(async (type, name) => {
    const maxOrder = columns.reduce((m, c) => Math.max(m, c.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_columns').insert({
      board_id: boardId, name: name || '', type,
      settings: defaultColumnSettings(type), display_order: maxOrder + 1, width: 160,
    }).select().single();
    if (e) { setError(e.message); return null; }
    setColumns(prev => [...prev, data]);
    return data;
  }, [boardId, columns]);

  const updateColumn = useCallback(async (columnId, updates) => {
    const { data, error: e } = await supabase.from('board_columns')
      .update(updates).eq('id', columnId).select().single();
    if (e) { setError(e.message); return; }
    setColumns(prev => prev.map(c => c.id === columnId ? data : c));
  }, []);

  // Podgląd szerokości podczas przeciągania uchwytu — tylko stan lokalny (bez zapisu do bazy).
  // Zapis następuje raz na koniec przez updateColumn({ width }).
  const setColumnWidthLocal = useCallback((columnId, width) => {
    setColumns(prev => prev.map(c => c.id === columnId ? { ...c, width } : c));
  }, []);

  const deleteColumn = useCallback(async (columnId) => {
    const { error: e } = await supabase.from('board_columns').delete().eq('id', columnId);
    if (e) { setError(e.message); return; }
    setColumns(prev => prev.filter(c => c.id !== columnId));
    // wyczyść wartości tej kolumny w elementach (lokalnie; DB zostawia sierotę w cells — nieszkodliwe)
    setItems(prev => prev.map(it => {
      if (!it.cells || !(columnId in it.cells)) return it;
      const { [columnId]: _, ...rest } = it.cells;
      return { ...it, cells: rest };
    }));
  }, []);

  const reorderColumns = useCallback(async (orderedIds) => {
    setColumns(prev => orderedIds.map((id, i) => ({ ...prev.find(c => c.id === id), display_order: i })));
    const results = await Promise.all(orderedIds.map((id, i) =>
      supabase.from('board_columns').update({ display_order: i }).eq('id', id)));
    if (results.find(r => r?.error)) { setError('Nie udało się zapisać kolejności kolumn'); load(); }
  }, [load]);

  // ── Grupy ──────────────────────────────────────────────────────────
  const addGroup = useCallback(async (name) => {
    const maxOrder = groups.reduce((m, g) => Math.max(m, g.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_groups').insert({
      board_id: boardId, name: name || 'Nowa grupa',
      color: pickColor(GROUP_COLORS, groups.length), display_order: maxOrder + 1,
    }).select().single();
    if (e) { setError(e.message); return null; }
    setGroups(prev => [...prev, data]);
    return data;
  }, [boardId, groups]);

  const updateGroup = useCallback(async (groupId, updates) => {
    const { data, error: e } = await supabase.from('board_groups')
      .update(updates).eq('id', groupId).select().single();
    if (e) { setError(e.message); return; }
    setGroups(prev => prev.map(g => g.id === groupId ? data : g));
  }, []);

  const deleteGroup = useCallback(async (groupId) => {
    const { error: e } = await supabase.from('board_groups').delete().eq('id', groupId);
    if (e) { setError(e.message); return; }
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setItems(prev => prev.filter(it => it.group_id !== groupId));
  }, []);

  const reorderGroups = useCallback(async (orderedIds) => {
    setGroups(prev => orderedIds.map((id, i) => ({ ...prev.find(g => g.id === id), display_order: i })));
    const results = await Promise.all(orderedIds.map((id, i) =>
      supabase.from('board_groups').update({ display_order: i }).eq('id', id)));
    if (results.find(r => r?.error)) { setError('Nie udało się zapisać kolejności grup'); load(); }
  }, [load]);

  // ── Elementy ───────────────────────────────────────────────────────
  const addItem = useCallback(async (groupId, name, cells = {}) => {
    const groupItems = items.filter(it => it.group_id === groupId);
    const maxOrder = groupItems.reduce((m, it) => Math.max(m, it.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_items').insert({
      board_id: boardId, group_id: groupId, name: name || '', cells: cells || {},
      display_order: maxOrder + 1, created_by: userEmail || null,
    }).select().single();
    if (e) { setError(e.message); return null; }
    setItems(prev => [...prev, data]);
    logActivity(data.id, 'created');
    if (onAutomationRef.current) onAutomationRef.current({ type: 'item_created', item: data });
    return data;
  }, [boardId, items, userEmail, logActivity]);

  const addSubitem = useCallback(async (parent, name) => {
    const { data, error: e } = await supabase.from('board_items').insert({
      board_id: boardId, group_id: parent.group_id, parent_item_id: parent.id,
      name: name || '', cells: {}, display_order: 0, created_by: userEmail || null,
    }).select().single();
    if (e) { setError(e.message); return null; }
    setItems(prev => [...prev, data]);
    return data;
  }, [boardId, userEmail]);

  const updateItem = useCallback(async (itemId, updates) => {
    const { data, error: e } = await supabase.from('board_items')
      .update(updates).eq('id', itemId).select().single();
    if (e) { setError(e.message); return; }
    setItems(prev => prev.map(it => it.id === itemId ? data : it));
    return data;
  }, []);

  // Zmiana pojedynczej komórki (najczęstsza operacja)
  const updateCell = useCallback(async (itemId, columnId, value) => {
    const item = items.find(it => it.id === itemId);
    if (!item) return;
    const prevVal = item.cells?.[columnId] ?? null;
    const newCells = { ...(item.cells || {}), [columnId]: value };
    const optimistic = { ...item, cells: newCells };
    setItems(prev => prev.map(it => it.id === itemId ? optimistic : it));
    const { error: e } = await supabase.from('board_items')
      .update({ cells: newCells }).eq('id', itemId);
    if (e) { setError(e.message); load(); return; }
    const col = columns.find(c => c.id === columnId);
    const action = col && (col.type === 'status' || col.type === 'priority') ? 'status_changed'
      : col && col.type === 'people' ? 'assigned' : 'value_changed';
    logActivity(itemId, action, columnId, prevVal, value);
    if (onAutomationRef.current) onAutomationRef.current({ type: 'cell_changed', item: optimistic, column: col, prevValue: prevVal, value });
  }, [items, columns, logActivity, load]);

  const deleteItem = useCallback(async (itemId) => {
    const { error: e } = await supabase.from('board_items').delete().eq('id', itemId);
    if (e) { setError(e.message); return; }
    setItems(prev => prev.filter(it => it.id !== itemId && it.parent_item_id !== itemId));
  }, []);

  // Przenieś element do innej grupy i/lub pozycji (Kanban/reorder między grupami).
  const moveItem = useCallback(async (itemId, toGroupId, toIndex) => {
    const moving = items.find(it => it.id === itemId);
    if (!moving) return;
    const rest = items.filter(it => it.id !== itemId);
    const target = rest.filter(it => it.group_id === toGroupId).sort((a, b) => a.display_order - b.display_order);
    target.splice(toIndex ?? target.length, 0, { ...moving, group_id: toGroupId });
    const reindexed = target.map((it, i) => ({ ...it, display_order: i }));
    const orderedTargetIds = reindexed.map(it => it.id);
    const others = rest.filter(it => it.group_id !== toGroupId);
    setItems([...others, ...reindexed]);
    // Zapisz group_id + display_order CAŁEJ grupy docelowej (inaczej po reloadzie kolejność się miesza).
    const results = await Promise.all(orderedTargetIds.map((id, i) =>
      supabase.from('board_items').update({ display_order: i, group_id: toGroupId }).eq('id', id)));
    if (results.find(r => r?.error)) { setError('Nie udało się przenieść elementu'); load(); return; }
    logActivity(itemId, 'moved', null, null, { group_id: toGroupId });
  }, [items, logActivity, load]);

  const reorderItemsInGroup = useCallback(async (groupId, orderedIds) => {
    setItems(prev => {
      const map = new Map(prev.map(it => [it.id, it]));
      orderedIds.forEach((id, i) => { const it = map.get(id); if (it) map.set(id, { ...it, display_order: i, group_id: groupId }); });
      return Array.from(map.values());
    });
    const results = await Promise.all(orderedIds.map((id, i) =>
      supabase.from('board_items').update({ display_order: i, group_id: groupId }).eq('id', id)));
    if (results.find(r => r?.error)) { setError('Nie udało się zapisać kolejności'); load(); }
  }, [load]);

  // ── Widoki ─────────────────────────────────────────────────────────
  const addView = useCallback(async (type, name) => {
    const maxOrder = views.reduce((m, v) => Math.max(m, v.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_views').insert({
      board_id: boardId, name: name || 'Nowy widok', type, config: {},
      owner_email: null, display_order: maxOrder + 1,
    }).select().single();
    if (e) { setError(e.message); return null; }
    setViews(prev => [...prev, data]);
    return data;
  }, [boardId, views]);

  const updateView = useCallback(async (viewId, updates) => {
    const { data, error: e } = await supabase.from('board_views')
      .update(updates).eq('id', viewId).select().single();
    if (e) { setError(e.message); return; }
    setViews(prev => prev.map(v => v.id === viewId ? data : v));
  }, []);

  const deleteView = useCallback(async (viewId) => {
    const { error: e } = await supabase.from('board_views').delete().eq('id', viewId);
    if (e) { setError(e.message); return; }
    setViews(prev => prev.filter(v => v.id !== viewId));
  }, []);

  const duplicateView = useCallback(async (view) => {
    const maxOrder = views.reduce((m, v) => Math.max(m, v.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_views').insert({
      board_id: boardId, name: `${view.name} (kopia)`, type: view.type, config: view.config || {},
      owner_email: null, display_order: maxOrder + 1,
    }).select().single();
    if (e) { setError(e.message); return null; }
    setViews(prev => [...prev, data]);
    return data;
  }, [boardId, views]);

  const setDefaultView = useCallback(async (viewId) => {
    setViews(prev => prev.map(v => ({ ...v, is_default: v.id === viewId })));
    await Promise.all(views.map(v => supabase.from('board_views').update({ is_default: v.id === viewId }).eq('id', v.id)));
  }, [views]);

  return {
    board, columns, groups, items, views, people, loading, error, me: userEmail,
    reload: load, setBoard,
    addColumn, updateColumn, deleteColumn, reorderColumns, setColumnWidthLocal,
    addGroup, updateGroup, deleteGroup, reorderGroups,
    addItem, addSubitem, updateItem, updateCell, deleteItem, moveItem, reorderItemsInGroup,
    addView, updateView, deleteView, duplicateView, setDefaultView,
    registerAutomationRunner: (fn) => { onAutomationRef.current = fn; },
  };
}
