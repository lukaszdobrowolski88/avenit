import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { defaultColumnSettings } from '../lib/columnTypes';
import { GROUP_COLORS, pickColor } from '../lib/constants';
import { tr } from '../../../i18n';
import { boardColor } from '../lib/palette';
import {
  createPendingEdits, createUndoQueue, patchBoardItem, reorderBoardItems, upsertRow, withDescendants,
} from '../lib/boardSync';

// Kolory etykiet/grup z palety Monday (zapisane w bazie) → paleta aplikacji, w jednym miejscu dla
// wszystkich widoków (tabela, kanban, kalendarz, panel). Edycja etykiet zapisuje już nowe kolory.
const normLabels = (arr) => (Array.isArray(arr) ? arr.map((l) => (l && l.color ? { ...l, color: boardColor(l.color) } : l)) : arr);
function normColumn(c) {
  const s = c?.settings;
  if (!s || (!s.labels && !s.options)) return c;
  return { ...c, settings: { ...s, ...(s.labels ? { labels: normLabels(s.labels) } : {}), ...(s.options ? { options: normLabels(s.options) } : {}) } };
}
const normGroup = (g) => (g?.color ? { ...g, color: boardColor(g.color) } : g);

// Ile czasu jest na „Cofnij” po usunięciu (toast) i kiedy usunięcie naprawdę idzie do bazy
// (chwilę później — klik w ostatniej chwili jeszcze zdąży).
export const UNDO_MS = 6000;
const DELETE_DELAY_MS = UNDO_MS + 500;
// Zdarzenie okna, które apiClient może wysłać po ponownym połączeniu WebSocket realtime.
export const REALTIME_RECONNECT_EVENT = 'avenit:realtime-reconnect';
const PATCH_FIELDS = new Set(['name', 'description', 'group_id', 'parent_item_id', 'event_id']);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// Silnik danych pojedynczej tablicy: ładuje kolumny, grupy, elementy, widoki, listę osób
// organizacji i udostępnia mutacje.
//  • Zapis zadania idzie przez fn board-item-patch — tylko zmienione komórki (bez gubienia cudzych zmian).
//  • Edycja w locie jest nakładana na każdy wiersz z realtime/odświeżenia (nie cofa wpisanej wartości).
//  • Po powrocie na kartę, odzyskaniu sieci i ponownym połączeniu realtime — ciche odświeżenie.
//  • Usunięcie zadań/grup czeka kilka sekund z „Cofnij” (UNDO_MS), potem idzie do bazy.
export function useBoardData(boardId, { userEmail, userName, scopeEmails } = {}) {
  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [views, setViews] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // null | 'notFound' | 'failed'
  const [hiddenItems, setHiddenItems] = useState(() => new Set()); // czekają na usunięcie (Cofnij)
  const [hiddenGroups, setHiddenGroups] = useState(() => new Set());
  // Sygnał „świeżo dodany element" — tabela ustawia fokus na nazwie nowego wiersza.
  const [focusItemId, setFocusItemId] = useState(null);
  const onAutomationRef = useRef(null);

  const pendingRef = useRef(null);
  if (!pendingRef.current) pendingRef.current = createPendingEdits();
  const pending = pendingRef.current;
  const undoRef = useRef(null);
  if (!undoRef.current) undoRef.current = createUndoQueue({ delayMs: DELETE_DELAY_MS });

  // Najświeższy stan dla mutacji (stabilne callbacki bez nieaktualnych domknięć).
  const itemsRef = useRef(items); itemsRef.current = items;
  const columnsRef = useRef(columns); columnsRef.current = columns;
  const groupsRef = useRef(groups); groupsRef.current = groups;
  const viewsRef = useRef(views); viewsRef.current = views;
  const loadedFor = useRef(null); // boardId, dla którego dane już są (kolejne ładowania — ciche)

  const errorToast = useCallback((err, fallback) => {
    if (typeof err === 'string') toast.error(err);
    else toast.error(err || fallback, { fallback });
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!boardId) return;
    if (!silent) { setLoading(true); setLoadError(null); }
    try {
      const [b, cols, grps, its, vws, ppl] = await Promise.all([
        supabase.from('boards').select('*').eq('id', boardId).single(),
        supabase.from('board_columns').select('*').eq('board_id', boardId).order('display_order'),
        supabase.from('board_groups').select('*').eq('board_id', boardId).order('display_order'),
        supabase.from('board_items').select('*').eq('board_id', boardId).order('display_order'),
        supabase.from('board_views').select('*').eq('board_id', boardId).order('display_order'),
        supabase.from('app_users').select('email, full_name, name, avatar_url').eq('is_active', true).order('full_name'),
      ]);
      if (b.error || !b.data) {
        if (silent) return; // ciche odświeżenie nie gasi otwartej tablicy
        const e = b.error;
        const notFound = !e || e.code === 'PGRST116' || [404, 406].includes(Number(e.status));
        if (!notFound) console.error('Błąd ładowania tablicy:', e);
        setBoard(null);
        setLoadError(notFound ? 'notFound' : 'failed');
        return;
      }
      const partErr = cols.error || grps.error || its.error;
      if (partErr) {
        if (silent) return;
        throw partErr;
      }
      setBoard(b.data);
      setColumns(cols.data || []);
      setGroups(grps.data || []);
      setItems((its.data || []).map((r) => pending.overlay(r)));
      if (!vws.error) setViews(vws.data || []);
      if (!ppl.error) {
        let list = (ppl.data || []).map(u => ({ email: u.email, name: u.full_name || u.name || u.email, avatar_url: u.avatar_url }));
        // Tablica osadzona w module zawęża picker „Osoby" do członków zespołu.
        if (Array.isArray(scopeEmails)) {
          const allow = new Set(scopeEmails.map(e => (e || '').toLowerCase()));
          list = list.filter(p => allow.has((p.email || '').toLowerCase()));
        }
        setPeople(list);
      }
      setLoadError(null);
      loadedFor.current = boardId;
    } catch (err) {
      console.error('Błąd ładowania tablicy:', err);
      if (!silent) { setBoard(null); setLoadError('failed'); }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [boardId, scopeEmails, pending]);

  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => { load({ silent: loadedFor.current === boardId }); }, [load, boardId]);

  // Ciche odświeżenie (bez spinnera), z dławieniem — wiele wyzwalaczy naraz = jedno zapytanie.
  const lastRefresh = useRef(0);
  const refresh = useCallback((force = false) => {
    if (loadedFor.current !== boardId) return Promise.resolve();
    const now = Date.now();
    if (!force && now - lastRefresh.current < 1500) return Promise.resolve();
    lastRefresh.current = now;
    return loadRef.current({ silent: true });
  }, [boardId]);
  const refreshRef = useRef(refresh); refreshRef.current = refresh;

  // Powrót na kartę / odzyskanie sieci / ponowne połączenie realtime → dociągnij zmiany,
  // które mogły przepaść, gdy karta spała (realtime nie odtwarza zaległych zdarzeń).
  useEffect(() => {
    if (!boardId) return undefined;
    const kick = () => { refreshRef.current(); };
    const onVis = () => { if (document.visibilityState === 'visible') kick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', kick);
    window.addEventListener(REALTIME_RECONNECT_EVENT, kick);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', kick);
      window.removeEventListener(REALTIME_RECONNECT_EVENT, kick);
    };
  }, [boardId]);

  // ── Realtime: zmiany board_* tej tablicy wmergowane GRANULARNIE (bez pełnego reloadu). Realtime
  // ignoruje filtr — odsiewamy po board_id. Wiersz zadania dostaje nakładkę edycji w locie.
  useEffect(() => {
    if (!boardId) return undefined;
    const setters = { board_items: setItems, board_columns: setColumns, board_groups: setGroups, board_views: setViews };
    const apply = (table, payload) => {
      const setter = setters[table];
      if (!setter) return;
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        if (id == null) return;
        if (table === 'board_items') setItems(prev => prev.filter(x => x.id !== id && x.parent_item_id !== id));
        else if (table === 'board_groups') {
          setGroups(prev => prev.filter(x => x.id !== id));
          setItems(prev => prev.filter(x => x.group_id !== id));
        } else setter(prev => prev.filter(x => x.id !== id));
        return;
      }
      const row = payload.new;
      if (!row || (row.board_id != null && !sameId(row.board_id, boardId))) return;
      if (table === 'board_items') setItems(prev => upsertRow(prev, row, pending.overlay));
      else setter(prev => upsertRow(prev, row));
    };
    const ch = supabase.channel(`board-${boardId}`);
    Object.keys(setters).forEach(t =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `board_id=eq.${boardId}` }, (payload) => apply(t, payload)));
    // supabase-js zgłasza SUBSCRIBED także po ponownym połączeniu — wtedy dociągamy zaległe zmiany.
    let subscribedOnce = false;
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (subscribedOnce) refreshRef.current();
      subscribedOnce = true;
    });
    return () => { supabase.removeChannel(ch); };
  }, [boardId, pending]);

  // Zaległe usunięcia (czekające na „Cofnij”) idą do bazy przy zmianie tablicy, odmontowaniu
  // i zamknięciu karty — nie zostają w zawieszeniu.
  useEffect(() => {
    const q = undoRef.current;
    const onHide = () => { q.flushAll(); };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); q.flushAll(); };
  }, [boardId]);

  // ── Dziennik aktywności ────────────────────────────────────────────
  // Kolumny from_value/to_value są JSONB — skalarne wartości opakowujemy w {value}.
  const logActivity = useCallback(async (itemId, action, columnId, fromValue, toValue) => {
    const asJson = (x) => (x === null || x === undefined) ? null : (typeof x === 'object' ? x : { value: x });
    try {
      await supabase.from('board_item_activity').insert({
        item_id: itemId, board_id: boardId, actor_email: userEmail || null, actor_name: userName || null,
        column_id: columnId || null, action, from_value: asJson(fromValue), to_value: asJson(toValue),
      });
    } catch { /* dziennik nie może blokować UX */ }
  }, [boardId, userEmail, userName]);

  // ── Kolumny ────────────────────────────────────────────────────────
  const addColumn = useCallback(async (type, name) => {
    const maxOrder = columnsRef.current.reduce((m, c) => Math.max(m, c.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_columns').insert({
      board_id: boardId, name: name || '', type,
      settings: defaultColumnSettings(type), display_order: maxOrder + 1, width: 160,
    }).select().single();
    if (e) { errorToast(e, tr('Nie udało się dodać kolumny')); return null; }
    setColumns(prev => prev.some(c => c.id === data.id) ? prev : [...prev, data]);
    return data;
  }, [boardId, errorToast]);

  const updateColumn = useCallback(async (columnId, updates) => {
    const { data, error: e } = await supabase.from('board_columns')
      .update(updates).eq('id', columnId).select().single();
    if (e) { errorToast(e, tr('Nie udało się zapisać kolumny')); return; }
    setColumns(prev => prev.map(c => c.id === columnId ? data : c));
  }, [errorToast]);

  // Podgląd szerokości podczas przeciągania uchwytu — tylko stan lokalny (zapis raz na koniec).
  const setColumnWidthLocal = useCallback((columnId, width) => {
    setColumns(prev => prev.map(c => c.id === columnId ? { ...c, width } : c));
  }, []);

  const deleteColumn = useCallback(async (columnId) => {
    const { error: e } = await supabase.from('board_columns').delete().eq('id', columnId);
    if (e) { errorToast(e, tr('Nie udało się usunąć kolumny')); return; }
    setColumns(prev => prev.filter(c => c.id !== columnId));
    setItems(prev => prev.map(it => {
      if (!it.cells || !(columnId in it.cells)) return it;
      const { [columnId]: _, ...rest } = it.cells;
      return { ...it, cells: rest };
    }));
  }, [errorToast]);

  const reorderColumns = useCallback(async (orderedIds) => {
    setColumns(prev => orderedIds.map((id, i) => ({ ...prev.find(c => c.id === id), display_order: i })));
    const results = await Promise.all(orderedIds.map((id, i) =>
      supabase.from('board_columns').update({ display_order: i }).eq('id', id)));
    if (results.find(r => r?.error)) { errorToast(tr('Nie udało się zapisać kolejności kolumn')); refreshRef.current(true); }
  }, [errorToast]);

  // ── Grupy ──────────────────────────────────────────────────────────
  const addGroup = useCallback(async (name) => {
    const list = groupsRef.current;
    const maxOrder = list.reduce((m, g) => Math.max(m, g.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_groups').insert({
      board_id: boardId, name: name || tr('Nowa grupa'),
      color: pickColor(GROUP_COLORS, list.length), display_order: maxOrder + 1,
    }).select().single();
    if (e) { errorToast(e, tr('Nie udało się dodać grupy')); return null; }
    setGroups(prev => prev.some(g => g.id === data.id) ? prev : [...prev, data]);
    return data;
  }, [boardId, errorToast]);

  const updateGroup = useCallback(async (groupId, updates) => {
    const { data, error: e } = await supabase.from('board_groups')
      .update(updates).eq('id', groupId).select().single();
    if (e) { errorToast(e, tr('Nie udało się zapisać grupy')); return; }
    setGroups(prev => prev.map(g => g.id === groupId ? data : g));
  }, [errorToast]);

  // Natychmiastowe usunięcie grupy (bez „Cofnij”) — dla kodu spoza interfejsu.
  const deleteGroup = useCallback(async (groupId) => {
    const { error: e } = await supabase.from('board_groups').delete().eq('id', groupId);
    if (e) { errorToast(e, tr('Nie udało się usunąć grupy')); return false; }
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setItems(prev => prev.filter(it => it.group_id !== groupId));
    return true;
  }, [errorToast]);

  const reorderGroups = useCallback(async (orderedIds) => {
    setGroups(prev => orderedIds.map((id, i) => ({ ...prev.find(g => g.id === id), display_order: i })));
    const results = await Promise.all(orderedIds.map((id, i) =>
      supabase.from('board_groups').update({ display_order: i }).eq('id', id)));
    if (results.find(r => r?.error)) { errorToast(tr('Nie udało się zapisać kolejności grup')); refreshRef.current(true); }
  }, [errorToast]);

  // ── Elementy ───────────────────────────────────────────────────────
  const addItem = useCallback(async (groupId, name, cells = {}) => {
    const maxOrder = itemsRef.current.filter(it => it.group_id === groupId)
      .reduce((m, it) => Math.max(m, it.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_items').insert({
      board_id: boardId, group_id: groupId, name: name || '', cells: cells || {},
      display_order: maxOrder + 1, created_by: userEmail || null,
    }).select().single();
    if (e) { errorToast(e, tr('Nie udało się dodać zadania')); return null; }
    // Dedup po id: realtime INSERT może dojść ZANIM rozwiąże się to `await`.
    setItems(prev => prev.some(it => it.id === data.id) ? prev : [...prev, data]);
    setFocusItemId(data.id);
    logActivity(data.id, 'created');
    if (onAutomationRef.current) onAutomationRef.current({ type: 'item_created', item: data });
    return data;
  }, [boardId, userEmail, logActivity, errorToast]);

  const addSubitem = useCallback(async (parent, name) => {
    const { data, error: e } = await supabase.from('board_items').insert({
      board_id: boardId, group_id: parent.group_id, parent_item_id: parent.id,
      name: name || '', cells: {}, display_order: 0, created_by: userEmail || null,
    }).select().single();
    if (e) { errorToast(e, tr('Nie udało się dodać podzadania')); return null; }
    setItems(prev => prev.some(it => it.id === data.id) ? prev : [...prev, data]);
    return data;
  }, [boardId, userEmail, errorToast]);

  // Wiersz z serwera → stan (z nakładką edycji w locie); zadanie usunięte w międzyczasie nie wraca.
  const applyServerRow = useCallback((row) => {
    if (!row) return;
    setItems(prev => (prev.some(it => it.id === row.id) ? upsertRow(prev, row, pending.overlay) : prev));
  }, [pending]);

  // Zmiana pól zadania (nazwa, opis, grupa, rodzic, wydarzenie, cells) — przez board-item-patch.
  // Inne kolumny wiersza (np. display_order) — zwykły zapis.
  const updateItem = useCallback(async (itemId, updates) => {
    const patch = {};
    const direct = {};
    for (const [k, v] of Object.entries(updates || {})) {
      if (k === 'cells' || PATCH_FIELDS.has(k)) patch[k] = v; else direct[k] = v;
    }
    const { cells: patchCells, ...fields } = patch;
    const token = pending.begin(itemId, { cells: patchCells || null, fields });
    setItems(prev => prev.map(it => it.id === itemId ? pending.overlay(it) : it));
    let row = null;
    if (Object.keys(patch).length) {
      const r = await patchBoardItem(supabase, itemId, patch);
      if (!r.ok) {
        pending.end(token);
        errorToast(r.error, tr('Nie udało się zapisać zmian'));
        refreshRef.current(true);
        return null;
      }
      row = r.item;
    }
    if (Object.keys(direct).length) {
      const { data, error: e } = await supabase.from('board_items').update(direct).eq('id', itemId).select().single();
      if (e) {
        pending.end(token);
        errorToast(e, tr('Nie udało się zapisać zmian'));
        refreshRef.current(true);
        return null;
      }
      row = data || row;
    }
    pending.end(token);
    applyServerRow(row);
    return row || itemsRef.current.find(it => it.id === itemId) || null;
  }, [pending, applyServerRow, errorToast]);

  // Zmiana pojedynczej komórki (najczęstsza operacja) — do serwera idzie TYLKO ta komórka.
  const updateCell = useCallback(async (itemId, columnId, value) => {
    const before = itemsRef.current.find(it => it.id === itemId);
    if (!before) return false;
    const prevVal = before.cells?.[columnId] ?? null;
    const token = pending.begin(itemId, { cells: { [columnId]: value } });
    const optimistic = pending.overlay(before);
    setItems(prev => prev.map(it => it.id === itemId ? pending.overlay(it) : it));
    const r = await patchBoardItem(supabase, itemId, { cells: { [columnId]: value } });
    pending.end(token);
    if (!r.ok) {
      errorToast(r.error, tr('Nie udało się zapisać zmian'));
      refreshRef.current(true); // wróć do stanu z serwera (inne edycje w locie zostają)
      return false;
    }
    applyServerRow(r.item);
    const col = columnsRef.current.find(c => c.id === columnId);
    const action = col && (col.type === 'status' || col.type === 'priority') ? 'status_changed'
      : col && col.type === 'people' ? 'assigned' : 'value_changed';
    logActivity(itemId, action, columnId, prevVal, value);
    if (onAutomationRef.current) onAutomationRef.current({ type: 'cell_changed', item: r.item ? pending.overlay(r.item) : optimistic, column: col, prevValue: prevVal, value });
    return true;
  }, [pending, applyServerRow, logActivity, errorToast]);

  // Natychmiastowe usunięcie (bez „Cofnij”) — dla automatyzacji i kodu spoza interfejsu.
  const deleteItem = useCallback(async (itemId) => {
    const { error: e } = await supabase.from('board_items').delete().eq('id', itemId);
    if (e) { errorToast(e, tr('Nie udało się usunąć.')); return false; }
    setItems(prev => prev.filter(it => it.id !== itemId && it.parent_item_id !== itemId));
    return true;
  }, [errorToast]);

  // Usunięcie z „Cofnij”: zadania (z podzadaniami) znikają od razu, a z bazy — po UNDO_MS.
  const removeItems = useCallback((ids, { label } = {}) => {
    const list = [...new Set((ids || []).filter(id => id != null))];
    if (!list.length) return null;
    const all = withDescendants(list, itemsRef.current);
    const unhide = () => setHiddenItems(prev => { const n = new Set(prev); all.forEach(id => n.delete(id)); return n; });
    setHiddenItems(prev => new Set([...prev, ...all]));
    const handle = undoRef.current.schedule(async () => {
      const q = supabase.from('board_items').delete();
      const { error: e } = await (list.length === 1 ? q.eq('id', list[0]) : q.in('id', list));
      if (e) { unhide(); errorToast(e, tr('Nie udało się usunąć.')); return; }
      setItems(prev => prev.filter(it => !all.has(it.id)));
      unhide();
    });
    const name = list.length === 1 ? (itemsRef.current.find(it => it.id === list[0])?.name || tr('Bez nazwy')) : null;
    toast.success({
      message: label || (name != null ? tr('Usunięto „{name}”', { name }) : tr('Usunięto: {n}', { n: list.length })),
      action: { label: tr('Cofnij'), onClick: () => { if (handle.undo()) unhide(); else toast.info(tr('Tego nie da się już cofnąć.')); } },
      duration: UNDO_MS,
    });
    return handle;
  }, [errorToast]);

  // Usunięcie grupy z „Cofnij” (potwierdzenie pyta wywołujący).
  const removeGroup = useCallback((groupId) => {
    const g = groupsRef.current.find(x => x.id === groupId);
    if (!g) return null;
    const unhide = () => setHiddenGroups(prev => { const n = new Set(prev); n.delete(groupId); return n; });
    setHiddenGroups(prev => new Set([...prev, groupId]));
    const handle = undoRef.current.schedule(async () => {
      const { error: e } = await supabase.from('board_groups').delete().eq('id', groupId);
      if (e) { unhide(); errorToast(e, tr('Nie udało się usunąć grupy')); return; }
      setGroups(prev => prev.filter(x => x.id !== groupId));
      setItems(prev => prev.filter(it => it.group_id !== groupId));
      unhide();
    });
    toast.success({
      message: tr('Usunięto grupę „{name}”', { name: g.name || '' }),
      action: { label: tr('Cofnij'), onClick: () => { if (handle.undo()) unhide(); else toast.info(tr('Tego nie da się już cofnąć.')); } },
      duration: UNDO_MS,
    });
    return handle;
  }, [errorToast]);

  // Kolejność + grupa wielu zadań naraz (board-items-reorder). Lokalnie zmieniamy TYLKO
  // group_id/display_order na najświeższych wierszach — bez nadpisywania cudzych zmian.
  const applyOrder = useCallback(async (groupId, orderedIds) => {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    setItems(prev => prev.map(it => (pos.has(it.id) ? { ...it, group_id: groupId, display_order: pos.get(it.id) } : it)));
    const r = await reorderBoardItems(supabase, { boardId, groupId, orderedIds });
    if (!r.ok) { refreshRef.current(true); return false; }
    return true;
  }, [boardId]);

  // Zadania najwyższego poziomu w grupie (bez podzadań), w bieżącej kolejności.
  const topLevelOf = useCallback((groupId, exclude) => itemsRef.current
    .filter(it => it.group_id === groupId && !it.parent_item_id && !exclude.has(it.id))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0)), []);

  // Przenieś WIELE elementów naraz na koniec grupy (operacje zbiorcze).
  const moveItems = useCallback(async (itemIds, toGroupId) => {
    const ids = new Set(itemIds);
    const moving = itemsRef.current.filter(it => ids.has(it.id));
    if (!moving.length) return 0;
    const ordered = [...topLevelOf(toGroupId, ids), ...moving].map(it => it.id);
    if (!await applyOrder(toGroupId, ordered)) { errorToast(tr('Nie udało się przenieść zadań')); return 0; }
    moving.forEach(it => logActivity(it.id, 'moved', null, null, { group_id: toGroupId }));
    return moving.length;
  }, [applyOrder, topLevelOf, logActivity, errorToast]);

  // Przenieś element do innej grupy i/lub pozycji (Kanban/reorder między grupami).
  const moveItem = useCallback(async (itemId, toGroupId, toIndex) => {
    const moving = itemsRef.current.find(it => it.id === itemId);
    if (!moving) return;
    const target = topLevelOf(toGroupId, new Set([itemId])).map(it => it.id);
    target.splice(toIndex ?? target.length, 0, itemId);
    if (!await applyOrder(toGroupId, target)) { errorToast(tr('Nie udało się przenieść elementu')); return; }
    logActivity(itemId, 'moved', null, null, { group_id: toGroupId });
  }, [applyOrder, topLevelOf, logActivity, errorToast]);

  const reorderItemsInGroup = useCallback(async (groupId, orderedIds) => {
    if (!await applyOrder(groupId, orderedIds)) errorToast(tr('Nie udało się zapisać kolejności'));
  }, [applyOrder, errorToast]);

  // ── Widoki ─────────────────────────────────────────────────────────
  const addView = useCallback(async (type, name) => {
    const maxOrder = viewsRef.current.reduce((m, v) => Math.max(m, v.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_views').insert({
      board_id: boardId, name: name || tr('Nowy widok'), type, config: {},
      owner_email: null, display_order: maxOrder + 1,
    }).select().single();
    if (e) { errorToast(e, tr('Nie udało się dodać widoku')); return null; }
    setViews(prev => prev.some(v => v.id === data.id) ? prev : [...prev, data]);
    return data;
  }, [boardId, errorToast]);

  const updateView = useCallback(async (viewId, updates) => {
    const { data, error: e } = await supabase.from('board_views')
      .update(updates).eq('id', viewId).select().single();
    if (e) { errorToast(e, tr('Nie udało się zapisać widoku')); return false; }
    setViews(prev => prev.map(v => v.id === viewId ? data : v));
    return true;
  }, [errorToast]);

  const deleteView = useCallback(async (viewId) => {
    const { error: e } = await supabase.from('board_views').delete().eq('id', viewId);
    if (e) { errorToast(e, tr('Nie udało się usunąć widoku')); return; }
    setViews(prev => prev.filter(v => v.id !== viewId));
  }, [errorToast]);

  const duplicateView = useCallback(async (view) => {
    const maxOrder = viewsRef.current.reduce((m, v) => Math.max(m, v.display_order || 0), -1);
    const { data, error: e } = await supabase.from('board_views').insert({
      board_id: boardId, name: tr('{name} (kopia)', { name: view.name }), type: view.type, config: view.config || {},
      owner_email: null, display_order: maxOrder + 1,
    }).select().single();
    if (e) { errorToast(e, tr('Nie udało się zduplikować widoku')); return null; }
    setViews(prev => prev.some(v => v.id === data.id) ? prev : [...prev, data]);
    return data;
  }, [boardId, errorToast]);

  const setDefaultView = useCallback(async (viewId) => {
    const list = viewsRef.current;
    setViews(prev => prev.map(v => ({ ...v, is_default: v.id === viewId })));
    await Promise.all(list.map(v => supabase.from('board_views').update({ is_default: v.id === viewId }).eq('id', v.id)));
  }, []);

  const clearFocusItem = useCallback(() => setFocusItemId(null), []);
  const registerAutomationRunner = useCallback((fn) => { onAutomationRef.current = fn; }, []);
  const reload = useCallback(() => load(), [load]);

  const viewColumns = useMemo(() => columns.map(normColumn), [columns]);
  const viewGroups = useMemo(
    () => (hiddenGroups.size ? groups.filter(g => !hiddenGroups.has(g.id)) : groups).map(normGroup),
    [groups, hiddenGroups]
  );
  const viewItems = useMemo(
    () => (hiddenItems.size || hiddenGroups.size
      ? items.filter(it => !hiddenItems.has(it.id) && !hiddenGroups.has(it.group_id))
      : items),
    [items, hiddenItems, hiddenGroups]
  );

  return useMemo(() => ({
    board, columns: viewColumns, groups: viewGroups, items: viewItems, views, people, loading,
    error: loadError, loadError, me: userEmail,
    reload, refresh, setBoard,
    addColumn, updateColumn, deleteColumn, reorderColumns, setColumnWidthLocal,
    addGroup, updateGroup, deleteGroup, removeGroup, reorderGroups,
    addItem, addSubitem, updateItem, updateCell, deleteItem, removeItems, moveItem, moveItems, reorderItemsInGroup,
    focusItemId, clearFocusItem,
    addView, updateView, deleteView, duplicateView, setDefaultView,
    registerAutomationRunner,
  }), [
    board, viewColumns, viewGroups, viewItems, views, people, loading, loadError, userEmail,
    reload, refresh,
    addColumn, updateColumn, deleteColumn, reorderColumns, setColumnWidthLocal,
    addGroup, updateGroup, deleteGroup, removeGroup, reorderGroups,
    addItem, addSubitem, updateItem, updateCell, deleteItem, removeItems, moveItem, moveItems, reorderItemsInGroup,
    focusItemId, clearFocusItem,
    addView, updateView, deleteView, duplicateView, setDefaultView,
    registerAutomationRunner,
  ]);
}
