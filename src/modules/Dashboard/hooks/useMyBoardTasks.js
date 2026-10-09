import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAppModules } from '../../../hooks/useAppModules';
import { collectMyBoardTasks } from '../utils/myBoardTasks';

const EMPTY = { boards: [], columns: [], items: [] };
const asJson = (x) => (x === null || x === undefined) ? null : (typeof x === 'object' ? x : { value: x });
// 403 = brak dostępu do tablic (ani Projektów, ani tablic żadnej służby) — to nie błąd, po prostu pusto.
const isForbidden = (r) => r?.status === 403 || String(r?.error?.code || '') === '403';

// Tablice + potrzebne kolumny + elementy tablic z kolumną „Osoby” — trzy zapytania, bez N+1.
// Zakres wierszy wyznacza serwer: prywatne tablice (boardsScope.js) i dostęp „w zakresie służby”
// (moduleScope.js) — dlatego bez bramki module:boards po stronie klienta. → { boards, columns, items }
export async function loadAssignableBoardData() {
  const [b, c] = await Promise.all([
    supabase.from('boards').select('id, name, module_key, source_kind, is_template').eq('is_archived', false),
    supabase.from('board_columns').select('id, board_id, type, settings, display_order')
      .in('type', ['people', 'status', 'date', 'timeline']),
  ]);
  if (isForbidden(b) || isForbidden(c)) return EMPTY;
  if (b.error) throw b.error;
  if (c.error) throw c.error;
  const boardIds = new Set((b.data || []).map((x) => String(x.id)));
  const withPeople = [...new Set((c.data || []).filter((x) => x.type === 'people').map((x) => String(x.board_id)))]
    .filter((id) => boardIds.has(id));
  let items = [];
  if (withPeople.length) {
    const r = await supabase.from('board_items').select('id, board_id, name, cells, parent_item_id').in('board_id', withPeople);
    if (r.error && !isForbidden(r)) throw r.error;
    items = r.data || [];
  }
  return { boards: b.data || [], columns: c.data || [], items };
}

// Zadania z tablic przypisane do osoby (emails: adres albo lista kont tej osoby) — Projekty,
// zakładki „Zadania” modułów i zadania Kalendarza. Pulpit (ja) i zakładka „Zadania” w Opiece.
export function useAssignedBoardTasks(emails, { enabled = true, userEmail = null, userName = null } = {}) {
  const { modules } = useAppModules();
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);
  const key = (Array.isArray(emails) ? emails : [emails])
    .filter(Boolean).map((e) => String(e).trim().toLowerCase()).sort().join(',');

  const load = useCallback(async () => {
    const req = ++reqRef.current;
    if (!key || !enabled) { setRaw(EMPTY); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await loadAssignableBoardData();
      if (req !== reqRef.current) return;
      setRaw(data);
    } catch (e) {
      if (req !== reqRef.current) return;
      setError(e);
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [key, enabled]);

  useEffect(() => { load(); }, [load]);

  const tasks = useMemo(
    () => (raw && key ? collectMyBoardTasks({ ...raw, email: key.split(','), modules }) : []),
    [raw, key, modules],
  );

  // Szybkie „gotowe”: kolumna statusu → etykieta „gotowe” (tylko gdy tablica ją ma). Serwer scala
  // komórkę pod blokadą wiersza (fn board-item-patch) — nie nadpiszemy zmian, które ktoś zrobił od
  // wczytania listy. Optymistycznie, z cofnięciem przy błędzie.
  const markDone = useCallback(async (task) => {
    if (!task?.statusColId || !task.doneLabelId) return false;
    const setStatus = (val) => setRaw((prev) => prev && ({
      ...prev,
      items: prev.items.map((it) => (it.id === task.id ? { ...it, cells: { ...(it.cells || {}), [task.statusColId]: val } } : it)),
    }));
    const cached = raw?.items.find((it) => it.id === task.id);
    const prevVal = cached?.cells?.[task.statusColId] ?? null;
    setStatus(task.doneLabelId);
    try {
      const { data, error: e } = await supabase.functions.invoke('board-item-patch', {
        body: { item_id: task.id, cells: { [task.statusColId]: task.doneLabelId } },
      });
      if (e) throw e;
      if (data?.item?.cells) {
        setRaw((prev) => prev && ({ ...prev, items: prev.items.map((it) => (it.id === task.id ? { ...it, cells: data.item.cells } : it)) }));
      }
      // Dziennik aktywności jak przy zmianie na tablicy — błąd dziennika nie cofa zmiany.
      supabase.from('board_item_activity').insert({
        item_id: task.id, board_id: task.boardId, actor_email: userEmail || null, actor_name: userName || null,
        column_id: task.statusColId, action: 'status_changed', from_value: asJson(prevVal), to_value: asJson(task.doneLabelId),
      }).then(() => {}, () => {});
      return true;
    } catch (e) {
      setStatus(prevVal);
      throw e;
    }
  }, [raw, userEmail, userName]);

  return { tasks, loading: loading && !raw, refreshing: loading, error, reload: load, markDone };
}

// Moje zadania z tablic (Pulpit). Jedno źródło dla listy i licznika „do zrobienia”.
export function useMyBoardTasks(userEmail, { enabled = true, userName = null } = {}) {
  return useAssignedBoardTasks(userEmail, { enabled, userEmail, userName });
}
