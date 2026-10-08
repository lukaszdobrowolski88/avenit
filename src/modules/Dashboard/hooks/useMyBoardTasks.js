import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAppModules } from '../../../hooks/useAppModules';
import { collectMyBoardTasks } from '../utils/myBoardTasks';

const EMPTY = { boards: [], columns: [], items: [] };
const asJson = (x) => (x === null || x === undefined) ? null : (typeof x === 'object' ? x : { value: x });
// 403 = brak dostępu do tablic (ani Projektów, ani tablic żadnej służby) — to nie błąd, po prostu pusto.
const isForbidden = (r) => r?.status === 403 || String(r?.error?.code || '') === '403';

// Zadania z tablic przypisane do mnie (Projekty + zakładki „Zadania” modułów). Zakres wierszy
// wyznacza serwer: prywatne tablice (boardsScope.js) i dostęp „w zakresie służby” (moduleScope.js) —
// dlatego bez bramki module:boards po stronie klienta. Trzy zapytania, bez N+1: tablice + potrzebne
// kolumny (równolegle), potem elementy tylko tych tablic, które mają kolumnę „Osoby”.
export function useMyBoardTasks(userEmail, { enabled = true, userName = null } = {}) {
  const { modules } = useAppModules();
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const req = ++reqRef.current;
    if (!userEmail || !enabled) { setRaw(EMPTY); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [b, c] = await Promise.all([
        supabase.from('boards').select('id, name, module_key, source_kind, is_template').eq('is_archived', false),
        supabase.from('board_columns').select('id, board_id, type, settings, display_order')
          .in('type', ['people', 'status', 'date', 'timeline']),
      ]);
      if (isForbidden(b) || isForbidden(c)) {
        if (req === reqRef.current) setRaw(EMPTY);
        return;
      }
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
      if (req !== reqRef.current) return;
      setRaw({ boards: b.data || [], columns: c.data || [], items });
    } catch (e) {
      if (req !== reqRef.current) return;
      setError(e);
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [userEmail, enabled]);

  useEffect(() => { load(); }, [load]);

  const tasks = useMemo(
    () => (raw ? collectMyBoardTasks({ ...raw, email: userEmail, modules }) : []),
    [raw, userEmail, modules],
  );

  // Szybkie „gotowe”: kolumna statusu → etykieta „gotowe” (tylko gdy tablica ją ma). Komórki
  // zapisuje się w całości, więc tuż przed zapisem dociągamy świeży stan elementu — nie nadpiszemy
  // zmian, które ktoś zrobił od wczytania Pulpitu. Optymistycznie, z cofnięciem przy błędzie.
  const markDone = useCallback(async (task) => {
    if (!task?.statusColId || !task.doneLabelId) return false;
    const setStatus = (val) => setRaw((prev) => prev && ({
      ...prev,
      items: prev.items.map((it) => (it.id === task.id ? { ...it, cells: { ...(it.cells || {}), [task.statusColId]: val } } : it)),
    }));
    const cached = raw?.items.find((it) => it.id === task.id);
    const cachedVal = cached?.cells?.[task.statusColId] ?? null;
    setStatus(task.doneLabelId);
    try {
      const { data: fresh, error: e1 } = await supabase.from('board_items').select('cells').eq('id', task.id).maybeSingle();
      if (e1 || !fresh) throw e1 || new Error('not found');
      const prevVal = fresh.cells?.[task.statusColId] ?? null;
      const cells = { ...(fresh.cells || {}), [task.statusColId]: task.doneLabelId };
      const { error: e2 } = await supabase.from('board_items').update({ cells }).eq('id', task.id);
      if (e2) throw e2;
      setRaw((prev) => prev && ({ ...prev, items: prev.items.map((it) => (it.id === task.id ? { ...it, cells } : it)) }));
      // Dziennik aktywności jak przy zmianie na tablicy — błąd dziennika nie cofa zmiany.
      supabase.from('board_item_activity').insert({
        item_id: task.id, board_id: task.boardId, actor_email: userEmail || null, actor_name: userName || null,
        column_id: task.statusColId, action: 'status_changed', from_value: asJson(prevVal), to_value: asJson(task.doneLabelId),
      }).then(() => {}, () => {});
      return true;
    } catch (e) {
      setStatus(cachedVal);
      throw e;
    }
  }, [raw, userEmail, userName]);

  return { tasks, loading: loading && !raw, refreshing: loading, error, reload: load, markDone };
}
