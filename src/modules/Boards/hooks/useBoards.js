import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { DEFAULT_STATUS_LABELS, GROUP_COLORS, STATUS_COLORS, pickColor, uid } from '../lib/constants';

const ALLOWED_AI_TYPES = new Set(['status', 'priority', 'text', 'long_text', 'number', 'date', 'timeline', 'people', 'dropdown', 'checkbox', 'link', 'rating', 'progress']);

// Zarządzanie listą tablic (CRUD) — wzorzec jak useForms.
export function useBoards(userEmail, userName) {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // moduleKey (opcjonalny) — filtruje tablice osadzone w danym module (zakładka board)
  const fetchBoards = useCallback(async (moduleKey = null) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('boards')
        .select('*')
        .eq('is_template', false)
        .eq('is_archived', false)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

      query = moduleKey ? query.eq('module_key', moduleKey) : query.is('module_key', null);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      // Filtr widoczności: prywatne widoczne dla właściciela + edytorów
      const visible = (data || []).filter(b =>
        b.visibility !== 'private' || b.owner_email === userEmail || (b.editors || []).includes(userEmail));
      setBoards(visible);
      return visible;
    } catch (err) {
      console.error('Błąd pobierania tablic:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Utwórz tablicę wraz z domyślną grupą, kolumnami i widokiem tabeli.
  const createBoard = useCallback(async (boardData = {}) => {
    setError(null);
    try {
      const maxOrder = boards.reduce((m, b) => Math.max(m, b.display_order || 0), 0);
      const newBoard = {
        name: boardData.name || 'Nowa tablica',
        description: boardData.description || '',
        icon: boardData.icon || 'LayoutGrid',
        color: boardData.color || '#6366f1',
        module_key: boardData.module_key ?? null,
        campus_id: boardData.campus_id ?? null,
        owner_email: userEmail || null,
        created_by: userEmail || null,
        display_order: maxOrder + 1,
      };
      const { data: board, error: insErr } = await supabase
        .from('boards').insert(newBoard).select().single();
      if (insErr) throw insErr;

      // Domyślne kolumny (Status, Osoby, Termin)
      await supabase.from('board_columns').insert([
        { board_id: board.id, name: 'Status', type: 'status', display_order: 0, width: 160,
          settings: { labels: DEFAULT_STATUS_LABELS.map(l => ({ ...l })) } },
        { board_id: board.id, name: 'Osoby', type: 'people', display_order: 1, width: 160, settings: {} },
        { board_id: board.id, name: 'Termin', type: 'date', display_order: 2, width: 150, settings: {} },
      ]);

      // Dwie startowe grupy
      await supabase.from('board_groups').insert([
        { board_id: board.id, name: 'Grupa zadań', color: pickColor(GROUP_COLORS, 0), display_order: 0 },
        { board_id: board.id, name: 'Ukończone', color: pickColor(GROUP_COLORS, 1), display_order: 1 },
      ]);

      // Domyślny widok tabeli
      await supabase.from('board_views').insert({
        board_id: board.id, name: 'Tabela główna', type: 'table', is_default: true, display_order: 0, config: {},
      });

      setBoards(prev => [...prev, board]);
      return { success: true, data: board };
    } catch (err) {
      console.error('Błąd tworzenia tablicy:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [boards, userEmail]);

  // Utwórz tablicę z szablonu (kolumny → id, grupy → id, przykładowe elementy).
  const createFromTemplate = useCallback(async (template, extra = {}) => {
    setError(null);
    try {
      const maxOrder = boards.reduce((m, b) => Math.max(m, b.display_order || 0), 0);
      const { data: board, error: e } = await supabase.from('boards').insert({
        name: extra.name || template.name, description: template.description || '',
        icon: template.icon || 'LayoutGrid', color: template.color || '#6366f1',
        module_key: extra.module_key ?? null, campus_id: extra.campus_id ?? null,
        owner_email: userEmail || null, created_by: userEmail || null, display_order: maxOrder + 1,
      }).select().single();
      if (e) throw e;

      // Kolumny → mapa ref→id
      const refToId = {};
      for (let i = 0; i < template.columns.length; i++) {
        const col = template.columns[i];
        const { data } = await supabase.from('board_columns').insert({
          board_id: board.id, name: col.name, type: col.type, settings: col.settings || {}, display_order: i, width: 160,
        }).select().single();
        if (data) refToId[col.ref] = data.id;
      }
      // Grupy → mapa index→id
      const groupIds = [];
      for (let i = 0; i < (template.groups || []).length; i++) {
        const g = template.groups[i];
        const { data } = await supabase.from('board_groups').insert({ board_id: board.id, name: g.name, color: g.color, display_order: i }).select().single();
        groupIds.push(data?.id);
      }
      // Widok domyślny
      await supabase.from('board_views').insert({ board_id: board.id, name: 'Tabela główna', type: 'table', is_default: true, display_order: 0, config: {} });

      // Przykładowe elementy (cells kluczowane ref → id kolumny)
      for (let i = 0; i < (template.items || []).length; i++) {
        const it = template.items[i];
        const cells = {};
        for (const [ref, val] of Object.entries(it.cells || {})) if (refToId[ref]) cells[refToId[ref]] = val;
        await supabase.from('board_items').insert({
          board_id: board.id, group_id: groupIds[it.group ?? 0] || groupIds[0], name: it.name,
          cells, display_order: i, created_by: userEmail || null,
        });
      }

      setBoards(prev => [...prev, board]);
      return { success: true, data: board };
    } catch (err) {
      console.error('Błąd tworzenia z szablonu:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [boards, userEmail]);

  // Utwórz tablicę z specyfikacji AI (name-keyed → mapowanie na realne id).
  const createFromSpec = useCallback(async (spec, extra = {}) => {
    setError(null);
    try {
      const maxOrder = boards.reduce((m, b) => Math.max(m, b.display_order || 0), 0);
      const { data: board, error: e } = await supabase.from('boards').insert({
        name: (spec.name || 'Nowa tablica').slice(0, 200), description: (spec.description || '').slice(0, 500),
        icon: 'LayoutGrid', color: extra.color || '#6366f1', module_key: extra.module_key ?? null,
        owner_email: userEmail || null, created_by: userEmail || null, display_order: maxOrder + 1,
      }).select().single();
      if (e) throw e;

      // Kolumny (etykiety/opcje dostają id; mapy title→id do rozwiązywania komórek)
      const nameToCol = {};
      let ord = 0;
      for (const col of (spec.columns || [])) {
        const type = ALLOWED_AI_TYPES.has(col.type) ? col.type : 'text';
        const settings = {};
        const labelTitleToId = {}, optionTitleToId = {};
        if (type === 'status' || type === 'priority') {
          settings.labels = (col.labels || DEFAULT_STATUS_LABELS).map((l, i) => {
            const id = uid('lbl'); labelTitleToId[l.title] = id;
            return { id, title: l.title, color: l.color || STATUS_COLORS[i % STATUS_COLORS.length] };
          });
        }
        if (type === 'dropdown') {
          settings.options = (col.options || []).map((o, i) => {
            const id = uid('opt'); optionTitleToId[o.title] = id;
            return { id, title: o.title, color: o.color || STATUS_COLORS[i % STATUS_COLORS.length] };
          });
        }
        if (type === 'number' && col.unit) settings.unit = col.unit;
        const { data } = await supabase.from('board_columns').insert({
          board_id: board.id, name: col.name, type, settings, display_order: ord++, width: 160,
        }).select().single();
        if (data) nameToCol[col.name] = { id: data.id, type, labelTitleToId, optionTitleToId };
      }

      // Grupy
      const groupIds = [];
      const groups = (spec.groups && spec.groups.length) ? spec.groups : [{ name: 'Elementy', color: GROUP_COLORS[0] }];
      for (let i = 0; i < groups.length; i++) {
        const { data } = await supabase.from('board_groups').insert({
          board_id: board.id, name: groups[i].name || `Grupa ${i + 1}`, color: groups[i].color || pickColor(GROUP_COLORS, i), display_order: i,
        }).select().single();
        groupIds.push(data?.id);
      }
      await supabase.from('board_views').insert({ board_id: board.id, name: 'Tabela główna', type: 'table', is_default: true, display_order: 0, config: {} });

      // Elementy (cells: nazwa kolumny → id; wartości status/dropdown: title → id)
      const items = spec.items || [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const cells = {};
        for (const [colName, val] of Object.entries(it.cells || {})) {
          const col = nameToCol[colName];
          if (!col) continue;
          if (col.type === 'status' || col.type === 'priority') { const id = col.labelTitleToId[val]; if (id) cells[col.id] = id; }
          else if (col.type === 'dropdown') { const ids = (Array.isArray(val) ? val : [val]).map(t => col.optionTitleToId[t]).filter(Boolean); if (ids.length) cells[col.id] = ids; }
          else if (col.type === 'people') { /* pomiń — AI nie zna realnych osób */ }
          else if (col.type === 'checkbox') cells[col.id] = !!val;
          else if (col.type === 'number' || col.type === 'rating' || col.type === 'progress') { const n = Number(val); if (!isNaN(n)) cells[col.id] = n; }
          else if (val != null && val !== '') cells[col.id] = String(val);
        }
        await supabase.from('board_items').insert({
          board_id: board.id, group_id: groupIds[it.group ?? 0] || groupIds[0], name: String(it.name || 'Element'),
          cells, display_order: i, created_by: userEmail || null,
        });
      }

      setBoards(prev => [...prev, board]);
      return { success: true, data: board };
    } catch (err) {
      console.error('Błąd tworzenia z AI:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [boards, userEmail]);

  const updateBoard = useCallback(async (boardId, updates) => {
    setError(null);
    try {
      const { data, error: updErr } = await supabase
        .from('boards').update(updates).eq('id', boardId).select().single();
      if (updErr) throw updErr;
      setBoards(prev => prev.map(b => b.id === boardId ? data : b));
      return { success: true, data };
    } catch (err) {
      console.error('Błąd aktualizacji tablicy:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const deleteBoard = useCallback(async (boardId) => {
    setError(null);
    try {
      const { error: delErr } = await supabase.from('boards').delete().eq('id', boardId);
      if (delErr) throw delErr;
      setBoards(prev => prev.filter(b => b.id !== boardId));
      return { success: true };
    } catch (err) {
      console.error('Błąd usuwania tablicy:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const duplicateBoard = useCallback(async (boardId) => {
    setError(null);
    try {
      const [{ data: orig }, { data: cols }, { data: groups }, { data: items }, { data: views }] = await Promise.all([
        supabase.from('boards').select('*').eq('id', boardId).single(),
        supabase.from('board_columns').select('*').eq('board_id', boardId),
        supabase.from('board_groups').select('*').eq('board_id', boardId),
        supabase.from('board_items').select('*').eq('board_id', boardId),
        supabase.from('board_views').select('*').eq('board_id', boardId),
      ]);
      if (!orig) throw new Error('Tablica nie istnieje');

      const maxOrder = boards.reduce((m, b) => Math.max(m, b.display_order || 0), 0);
      const { data: board } = await supabase.from('boards').insert({
        name: `${orig.name} (kopia)`, description: orig.description, icon: orig.icon, color: orig.color,
        module_key: orig.module_key, owner_email: userEmail, created_by: userEmail, display_order: maxOrder + 1,
      }).select().single();

      // Odtwórz kolumny/grupy z mapowaniem starych id → nowych
      const colMap = {}, groupMap = {};
      for (const c of (cols || [])) {
        const { data } = await supabase.from('board_columns').insert({
          board_id: board.id, name: c.name, type: c.type, settings: c.settings,
          display_order: c.display_order, width: c.width }).select().single();
        colMap[c.id] = data.id;
      }
      for (const g of (groups || [])) {
        const { data } = await supabase.from('board_groups').insert({
          board_id: board.id, name: g.name, color: g.color, display_order: g.display_order }).select().single();
        groupMap[g.id] = data.id;
      }
      // Odtwórz elementy z przemapowaniem kluczy komórek na nowe id kolumn
      for (const it of (items || [])) {
        const newCells = {};
        for (const [k, v] of Object.entries(it.cells || {})) {
          if (colMap[k]) newCells[colMap[k]] = v;
        }
        await supabase.from('board_items').insert({
          board_id: board.id, group_id: groupMap[it.group_id] || null, name: it.name,
          cells: newCells, display_order: it.display_order, created_by: userEmail });
      }
      for (const v of (views || [])) {
        await supabase.from('board_views').insert({
          board_id: board.id, name: v.name, type: v.type, config: v.config,
          is_default: v.is_default, display_order: v.display_order });
      }

      setBoards(prev => [...prev, board]);
      return { success: true, data: board };
    } catch (err) {
      console.error('Błąd kopiowania tablicy:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [boards, userEmail]);

  return { boards, loading, error, fetchBoards, createBoard, createFromTemplate, createFromSpec, updateBoard, deleteBoard, duplicateBoard };
}
