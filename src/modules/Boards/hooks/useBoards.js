import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { BOARD_TEMPLATES, localizeTemplate } from '../lib/templates';
import { planBoardCopy, newId, chunk } from '../lib/boardCopy';
import { filterTemplates } from '../lib/boardList';

async function insertRows(table, rows) {
  for (const part of chunk(rows)) {
    const { error } = await supabase.from(table).insert(part);
    if (error) throw error;
  }
}

// Zarządzanie listą tablic (CRUD + archiwum + kopie i szablony) — wzorzec jak useForms.
export function useBoards(userEmail) {
  const [boards, setBoards] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setErrorState] = useState(null);
  // Pokaż każdy błąd użytkownikowi (toast) — koniec cichych awarii przy tworzeniu/usuwaniu tablic.
  const setError = useCallback((msg) => {
    setErrorState(msg);
    if (msg) toast.error(typeof msg === 'string' ? msg : tr('Wystąpił błąd'));
  }, []);

  // Tablice listy (aktywne i zarchiwizowane — filtr robi lista, lib/boardList.js), bez szablonów.
  // moduleKey (opcjonalny) — tablice osadzone w danym module (zakładka „Tablica”).
  const fetchBoards = useCallback(async (moduleKey = null) => {
    setLoading(true);
    setErrorState(null);
    try {
      let query = supabase
        .from('boards')
        .select('*')
        .eq('is_template', false)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      query = moduleKey ? query.eq('module_key', moduleKey) : query.is('module_key', null);
      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setBoards(data || []);
      return data || [];
    } catch (err) {
      console.error('Błąd pobierania tablic:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // Szablony zapisane z tablic („Zapisz jako szablon”) — boards.is_template, widoczne dla mnie.
  const fetchTemplates = useCallback(async () => {
    const { data, error: e } = await supabase.from('boards').select('*').eq('is_template', true);
    if (e) { console.error('Błąd pobierania szablonów:', e); return []; }
    const list = filterTemplates(data || [], userEmail);
    setTemplates(list);
    return list;
  }, [userEmail]);

  const nextOrder = useCallback(() => boards.reduce((m, b) => Math.max(m, b.display_order || 0), 0) + 1, [boards]);

  // Utwórz tablicę z wbudowanego szablonu: kolumny, grupy, widok i przykładowe elementy w języku
  // interfejsu, kolory z palety aplikacji. Id nadane z góry → zapis paczkami.
  const createFromTemplate = useCallback(async (template, extra = {}) => {
    setErrorState(null);
    const tpl = localizeTemplate(template);
    let boardId = null;
    try {
      const { data: board, error: e } = await supabase.from('boards').insert({
        id: newId(),
        name: extra.name || tpl.name, description: extra.description ?? (tpl.key === 'blank' ? '' : tpl.description || ''),
        icon: tpl.icon || 'LayoutGrid', color: tpl.color,
        module_key: extra.module_key ?? null, campus_id: extra.campus_id ?? null,
        owner_email: userEmail || null, created_by: userEmail || null, display_order: nextOrder(),
      }).select().single();
      if (e) throw e;
      boardId = board.id;

      const refToId = {};
      const columns = tpl.columns.map((col, i) => {
        const id = newId();
        refToId[col.ref] = id;
        return { id, board_id: board.id, name: col.name, type: col.type, settings: col.settings || {}, display_order: i, width: 160 };
      });
      const groups = (tpl.groups || []).map((g, i) => ({ id: newId(), board_id: board.id, name: g.name, color: g.color, display_order: i }));
      await insertRows('board_columns', columns);
      await insertRows('board_groups', groups);
      await insertRows('board_views', [{ id: newId(), board_id: board.id, name: tr('Tabela główna'), type: 'table', is_default: true, display_order: 0, config: {} }]);
      // Przykładowe elementy (cells kluczowane ref → id kolumny)
      const items = (tpl.items || []).map((it, i) => {
        const cells = {};
        for (const [ref, val] of Object.entries(it.cells || {})) if (refToId[ref]) cells[refToId[ref]] = val;
        return { id: newId(), board_id: board.id, group_id: groups[it.group ?? 0]?.id || groups[0]?.id || null, name: it.name, cells, display_order: i, created_by: userEmail || null };
      });
      await insertRows('board_items', items);

      setBoards(prev => [...prev, board]);
      return { success: true, data: board };
    } catch (err) {
      console.error('Błąd tworzenia z szablonu:', err);
      if (boardId) await supabase.from('boards').delete().eq('id', boardId);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [nextOrder, userEmail, setError]);

  // Pusta tablica (Status / Osoby / Termin + dwie grupy + widok tabeli).
  const createBoard = useCallback((boardData = {}) => createFromTemplate(BOARD_TEMPLATES[0], {
    ...boardData, name: boardData.name || tr('Nowa tablica'),
  }), [createFromTemplate]);

  const updateBoard = useCallback(async (boardId, updates) => {
    setErrorState(null);
    try {
      const { data, error: updErr } = await supabase
        .from('boards').update(updates).eq('id', boardId).select().single();
      if (updErr) throw updErr;
      setBoards(prev => prev.map(b => b.id === boardId ? data : b));
      setTemplates(prev => prev.map(b => b.id === boardId ? data : b));
      return { success: true, data };
    } catch (err) {
      console.error('Błąd aktualizacji tablicy:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [setError]);

  // Archiwum zamiast usuwania: tablica znika z listy (i z „Mojej pracy”), dane zostają.
  const archiveBoard = useCallback((boardId, archived = true) => updateBoard(boardId, { is_archived: archived }), [updateBoard]);

  // Trwałe usunięcie (z archiwum, po potwierdzeniu) — kaskadowo kolumny, grupy, elementy.
  const deleteBoard = useCallback(async (boardId) => {
    setErrorState(null);
    try {
      const { error: delErr } = await supabase.from('boards').delete().eq('id', boardId);
      if (delErr) throw delErr;
      setBoards(prev => prev.filter(b => b.id !== boardId));
      setTemplates(prev => prev.filter(b => b.id !== boardId));
      return { success: true };
    } catch (err) {
      console.error('Błąd usuwania tablicy:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [setError]);

  // Kopia tablicy: struktura (kolumny, grupy, widoki, ustawienia formularza) i — opcjonalnie —
  // elementy z podelementami. Przy błędzie w połowie usuwa niedokończoną kopię.
  //   opts: { name, isTemplate, moduleKey (undefined = jak źródło), withItems, keepFolder, fromTemplate }
  const copyBoard = useCallback(async (sourceId, opts = {}) => {
    setErrorState(null);
    let createdId = null;
    try {
      const withItems = opts.withItems !== false;
      const [o, c, g, it, v] = await Promise.all([
        supabase.from('boards').select('*').eq('id', sourceId).single(),
        supabase.from('board_columns').select('*').eq('board_id', sourceId),
        supabase.from('board_groups').select('*').eq('board_id', sourceId),
        withItems ? supabase.from('board_items').select('*').eq('board_id', sourceId) : Promise.resolve({ data: [] }),
        supabase.from('board_views').select('*').eq('board_id', sourceId),
      ]);
      const failed = [o, c, g, it, v].find(r => r?.error);
      if (failed) throw failed.error;
      const orig = o.data;
      if (!orig) throw new Error(tr('Tablica nie istnieje'));

      const boardId = newId();
      const plan = planBoardCopy(
        { columns: c.data, groups: g.data, items: it.data, views: v.data, formSettings: orig.form_settings || null },
        { boardId, userEmail: userEmail || null, withItems },
      );
      const isTemplate = !!opts.isTemplate;
      const row = {
        id: boardId,
        name: String(opts.name || orig.name || tr('Nowa tablica')).slice(0, 200),
        description: orig.description || '', icon: orig.icon || 'LayoutGrid', color: orig.color,
        module_key: opts.moduleKey !== undefined ? opts.moduleKey : (orig.module_key ?? null),
        ...('campus_id' in orig ? { campus_id: orig.campus_id ?? null } : {}),
        is_template: isTemplate, is_archived: false,
        owner_email: userEmail || null, created_by: userEmail || null,
        display_order: nextOrder(),
      };
      if (opts.keepFolder && orig.folder) row.folder = orig.folder;
      // Kopia prywatnej tablicy zostaje prywatna (z tymi samymi edytorami); tablica z szablonu — dla zespołu.
      if ('visibility' in orig) row.visibility = opts.fromTemplate ? 'workspace' : (orig.visibility || 'workspace');
      if ('editors' in orig && !opts.fromTemplate) row.editors = orig.editors || [];
      if (plan.formSettings) row.form_settings = plan.formSettings; // formularz wyłączony, nowy link po włączeniu

      const { data: board, error: insErr } = await supabase.from('boards').insert(row).select().single();
      if (insErr) throw insErr;
      createdId = board.id;
      await insertRows('board_columns', plan.columns);
      await insertRows('board_groups', plan.groups);
      for (const level of plan.itemLevels) await insertRows('board_items', level);
      await insertRows('board_views', plan.views);

      if (isTemplate) setTemplates(prev => filterTemplates([...prev, board], userEmail));
      else setBoards(prev => [...prev, board]);
      return { success: true, data: board };
    } catch (err) {
      console.error('Błąd kopiowania tablicy:', err);
      if (createdId) await supabase.from('boards').delete().eq('id', createdId);
      setError(err.message || tr('Nie udało się skopiować tablicy.'));
      return { success: false, error: err.message };
    }
  }, [nextOrder, userEmail, setError]);

  const duplicateBoard = useCallback((boardId, name) => {
    const src = boards.find(b => b.id === boardId);
    return copyBoard(boardId, { name: name || tr('{name} (kopia)', { name: src?.name || '' }), keepFolder: true });
  }, [boards, copyBoard]);

  const saveAsTemplate = useCallback((boardId, { name, withItems = true } = {}) =>
    copyBoard(boardId, { name, isTemplate: true, withItems }), [copyBoard]);

  // Nowa tablica z szablonu użytkownika — w bieżącym kontekście (Projekty albo moduł).
  const createFromBoardTemplate = useCallback((templateId, { name, module_key = null } = {}) =>
    copyBoard(templateId, { name, moduleKey: module_key, fromTemplate: true }), [copyBoard]);

  return {
    boards, templates, loading, error,
    fetchBoards, fetchTemplates, createBoard, createFromTemplate, createFromBoardTemplate,
    updateBoard, archiveBoard, deleteBoard, duplicateBoard, saveAsTemplate, copyBoard,
  };
}
