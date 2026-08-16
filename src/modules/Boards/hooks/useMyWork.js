import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

// Agregacja „Moja praca": elementy z wszystkich tablic, gdzie bieżący użytkownik
// jest przypisany (kolumna typu people), wraz z terminem i statusem.
export function useMyWork(userEmail) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    try {
      const [boardsRes, colsRes, itemsRes] = await Promise.all([
        supabase.from('boards').select('id, name, color').eq('is_archived', false),
        supabase.from('board_columns').select('id, board_id, type, name, settings'),
        supabase.from('board_items').select('id, board_id, group_id, name, cells').is('parent_item_id', null),
      ]);
      const boards = Object.fromEntries((boardsRes.data || []).map(b => [b.id, b]));
      const colsByBoard = {};
      for (const c of (colsRes.data || [])) (colsByBoard[c.board_id] = colsByBoard[c.board_id] || []).push(c);

      const out = [];
      for (const it of (itemsRes.data || [])) {
        const cols = colsByBoard[it.board_id] || [];
        const peopleCols = cols.filter(c => c.type === 'people');
        const assigned = peopleCols.some(c => (it.cells?.[c.id] || []).some(p => p.email === userEmail));
        if (!assigned) continue;

        const dateCol = cols.find(c => c.type === 'date') || cols.find(c => c.type === 'timeline');
        let due = null;
        if (dateCol) {
          const v = it.cells?.[dateCol.id];
          due = dateCol.type === 'timeline' ? (v?.end || v?.start || null) : (v || null);
        }
        const statusCol = cols.find(c => c.type === 'status' || c.type === 'priority');
        const statusVal = statusCol ? it.cells?.[statusCol.id] : null;
        const statusLabel = statusCol ? (statusCol.settings?.labels || []).find(l => l.id === statusVal) : null;

        out.push({
          item: it,
          boardId: it.board_id,
          boardName: boards[it.board_id]?.name || 'Tablica',
          boardColor: boards[it.board_id]?.color || '#6366f1',
          due,
          status: statusLabel || null,
          done: statusLabel && /gotow|done|zrobion|ukończ/i.test(statusLabel.title),
        });
      }
      setRows(out);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  return { rows, loading, reload: load };
}
