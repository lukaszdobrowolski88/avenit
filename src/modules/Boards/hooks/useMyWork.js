import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAppModules } from '../../../hooks/useAppModules';
import { buildMyWorkRows, rowsFromFn, modulePaths } from '../lib/myWork';

const LIMIT = 1000;

// „Moja praca”: elementy tablic przypisane do mnie — bez pobierania wszystkich elementów.
// Główna ścieżka: board_items.assignee_emails (utrzymywane triggerem) przez Data API, więc
// serwer stosuje te same zakresy co wszędzie (prywatne tablice, tablice służb). Zawiera też
// elementy bez terminu. Gdy kolumny jeszcze nie ma (stara baza) — fn my-board-items (tylko
// elementy z terminem).
export function useMyWork(userEmail) {
  const { modules } = useAppModules();
  const paths = useMemo(() => modulePaths(modules), [modules]);
  const [raw, setRaw] = useState(null); // { kind: 'db', items, boards, columns } | { kind: 'fn', items }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const me = String(userEmail || '').trim().toLowerCase();
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const { data: items, error: e } = await supabase
        .from('board_items')
        .select('id, board_id, name, cells')
        .contains('assignee_emails', [me])
        .is('parent_item_id', null)
        .limit(LIMIT);
      if (!e) {
        const ids = [...new Set((items || []).map((i) => i.board_id))];
        if (!ids.length) { setRaw({ kind: 'db', items: [], boards: [], columns: [] }); return; }
        const [b, c] = await Promise.all([
          supabase.from('boards').select('id, name, color, module_key, source_kind, is_archived, is_template').in('id', ids),
          supabase.from('board_columns').select('id, board_id, type, settings, display_order').in('board_id', ids).in('type', ['people', 'status', 'date', 'timeline']),
        ]);
        if (b.error || c.error) throw (b.error || c.error);
        setRaw({ kind: 'db', items: items || [], boards: b.data || [], columns: c.data || [] });
        return;
      }
      // Zapas: serwerowa lista przypisanych elementów z terminem.
      const { data, error: fnErr } = await supabase.functions.invoke('my-board-items', { body: {} });
      if (fnErr) throw fnErr;
      setRaw({ kind: 'fn', items: data?.items || [] });
    } catch (err) {
      console.error('Moja praca:', err);
      setError(err?.message || String(err));
      setRaw({ kind: 'fn', items: [] });
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!raw) return [];
    return raw.kind === 'db'
      ? buildMyWorkRows({ items: raw.items, boards: raw.boards, columns: raw.columns, email: userEmail, paths })
      : rowsFromFn(raw.items, paths);
  }, [raw, userEmail, paths]);

  return { rows, loading: loading && !raw, error, partial: raw?.kind === 'fn', reload: load };
}
