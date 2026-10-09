import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { addDays, format } from 'date-fns';
import { tr } from '../../../i18n';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import { getAppModulesSnapshot } from '../../../hooks/useAppModules';
import { modulePaths } from '../lib/myWork';
import { buildCreatedItem } from '../lib/automations';

// Silnik automatyzacji (natychmiastowe wyzwalacze po stronie klienta) + CRUD.
// Wyzwalacze czasowe (date_arrives / every_period) obsługuje worker packages/api.
export function useBoardAutomations(boardId, data, { userEmail, userName } = {}) {
  const [automations, setAutomations] = useState([]);
  const running = useRef(false); // zabezpieczenie przed pętlą (akcja → wyzwalacz)

  const load = useCallback(async () => {
    if (!boardId) return;
    const { data: rows } = await supabase.from('board_automations').select('*').eq('board_id', boardId).order('created_at');
    setAutomations(rows || []);
  }, [boardId]);
  useEffect(() => { load(); }, [load]);

  // ── CRUD ────────────────────────────────────────────────────────────
  const addAutomation = useCallback(async (name, trigger, actions) => {
    const { data: row, error } = await supabase.from('board_automations')
      .insert({ board_id: boardId, name, trigger, actions, enabled: true, created_by: userEmail || null })
      .select().single();
    if (error) { toast.error(error.message ? tr('Nie udało się zapisać automatyzacji: {msg}', { msg: error.message }) : tr('Nie udało się zapisać automatyzacji')); return null; }
    setAutomations(prev => [...prev, row]);
    return row;
  }, [boardId, userEmail]);

  const updateAutomation = useCallback(async (id, updates) => {
    const { data: row, error } = await supabase.from('board_automations').update(updates).eq('id', id).select().single();
    if (error) { toast.error(error, { fallback: tr('Nie udało się zmienić automatyzacji.') }); return; }
    if (row) setAutomations(prev => prev.map(a => a.id === id ? row : a));
  }, []);

  const deleteAutomation = useCallback(async (id) => {
    // Wcześniej błąd (np. brak uprawnień) był połykany — reguła znikała z listy i wracała po odświeżeniu.
    const { error } = await supabase.from('board_automations').delete().eq('id', id);
    if (error) { toast.error(error, { fallback: tr('Nie udało się usunąć automatyzacji.') }); return; }
    setAutomations(prev => prev.filter(a => a.id !== id));
  }, []);

  // ── Dopasowanie wyzwalacza do zdarzenia ─────────────────────────────
  const matches = (trigger, event) => {
    switch (trigger.type) {
      case 'item_created':
        return event.type === 'item_created';
      case 'status_changes_to':
        return event.type === 'cell_changed' && event.column?.id === trigger.columnId && event.value === trigger.value;
      case 'column_changes':
        return event.type === 'cell_changed' && event.column?.id === trigger.columnId;
      case 'person_assigned':
        return event.type === 'cell_changed' && event.column?.type === 'people'
          && (!trigger.columnId || event.column.id === trigger.columnId)
          && (event.value || []).length > (event.prevValue || []).length;
      default:
        return false; // date_arrives / every_period → worker
    }
  };

  // ── Wykonanie akcji ─────────────────────────────────────────────────
  const peopleOfItem = (item) => {
    const cols = data.columns.filter(c => c.type === 'people');
    const emails = new Set();
    cols.forEach(c => (item.cells?.[c.id] || []).forEach(p => p?.email && emails.add(p.email)));
    return [...emails];
  };

  // Link do zadania — wspólna reguła (zadania służby → moduł, Kalendarz → /wydarzenia, reszta → Projekty).
  const itemLink = (itemId) => taskItemLink(data.board || { id: boardId }, itemId, modulePaths(getAppModulesSnapshot().modules));

  // skip: e-maile, które już dostały powiadomienie z serwera (nowo przypisani — boardNotify.js),
  // żeby automatyzacja „przypisano osobę → powiadom” nie dublowała powiadomienia.
  const runActions = async (automation, item, skip = new Set()) => {
    const detail = [];
    for (const action of (automation.actions || [])) {
      const p = action.params || {};
      try {
        if (action.type === 'notify') {
          let targets = [];
          if (p.targetType === 'creator') targets = item.created_by ? [item.created_by] : [];
          else if (p.targetType === 'specific') targets = p.email ? [p.email] : [];
          else targets = peopleOfItem(item); // assignee (domyślnie)
          targets = targets.filter((e) => e && e.includes('@') && !skip.has(String(e).toLowerCase()));
          for (const email of targets) {
            await supabase.from('notifications').insert({
              user_email: email, type: 'task',
              title: p.title || tr('Automatyzacja: {name}', { name: automation.name || tr('tablica') }),
              body: `${item.name || tr('Element')}`,
              link: itemLink(item.id),
              data: { item_id: item.id, board_id: boardId, automation_id: automation.id },
            });
          }
          detail.push(`notify:${targets.length}`);
        } else if (action.type === 'change_status') {
          if (p.columnId) { await data.updateCell(item.id, p.columnId, p.value); detail.push('change_status'); }
        } else if (action.type === 'set_date') {
          if (p.columnId) { await data.updateCell(item.id, p.columnId, format(addDays(new Date(), p.offsetDays || 0), 'yyyy-MM-dd')); detail.push('set_date'); }
        } else if (action.type === 'assign_person') {
          if (p.columnId && p.email) {
            const cur = item.cells?.[p.columnId] || [];
            if (!cur.some(x => x.email === p.email)) await data.updateCell(item.id, p.columnId, [...cur, { email: p.email, name: p.name || p.email }]);
            detail.push('assign_person');
          }
        } else if (action.type === 'create_update') {
          await supabase.from('board_item_updates').insert({
            item_id: item.id, board_id: boardId, author_email: userEmail || null, author_name: userName || tr('Automatyzacja'),
            body: p.text || '', mentions: [], likes: [],
          });
          detail.push('create_update');
        } else if (action.type === 'create_item') {
          // Nowy element na tej tablicy (nazwa, grupa, status, osoba, termin „dziś + N”). Zapis
          // z RETURNING — serwer powiadomi przypisaną osobę; widok dostanie wiersz przez realtime.
          // Bez data.addItem: nie przenosimy kursora do nowego wiersza i nie wywołujemy kolejnych reguł.
          const row = buildCreatedItem({
            params: p, boardId, groups: data.groups, items: data.items, columns: data.columns,
            userEmail: userEmail || null, fallbackName: tr('Nowe zadanie'),
          });
          if (!row) throw new Error('no group');
          const { error } = await supabase.from('board_items').insert(row).select().single();
          if (error) throw error;
          detail.push('create_item');
          data.refresh?.();
        }
      } catch (e) {
        detail.push(`err:${action.type}`);
      }
    }
    // Status uczciwy: jeśli któraś akcja padła, przebieg nie jest „success”.
    const failed = detail.some((d) => String(d).startsWith('err:'));
    await supabase.from('board_automation_runs').insert({
      automation_id: automation.id, board_id: boardId, item_id: item.id, status: failed ? 'error' : 'success', detail: { actions: detail },
    });
    await supabase.from('board_automations').update({ last_run_at: new Date().toISOString() }).eq('id', automation.id);
  };

  // ── Runner podpięty do zdarzeń tablicy ──────────────────────────────
  const run = useCallback(async (event) => {
    if (running.current) return;
    const active = automations.filter(a => a.enabled);
    const hits = active.filter(a => matches(a.trigger || {}, event));
    if (!hits.length) return;
    running.current = true;
    try {
      // Nowo przypisane osoby powiadamia już serwer — automatyzacja ich pomija.
      const prev = new Set((event.prevValue || []).map((p) => String(p?.email || '').toLowerCase()));
      const added = event.type === 'cell_changed' && event.column?.type === 'people'
        ? new Set((event.value || []).map((p) => String(p?.email || '').toLowerCase()).filter((e) => e && !prev.has(e)))
        : new Set();
      for (const a of hits) await runActions(a, event.item, added);
    } finally {
      running.current = false;
    }
  }, [automations, data]);

  useEffect(() => {
    data.registerAutomationRunner((event) => { run(event); });
    return () => data.registerAutomationRunner(null);
  }, [run, data]);

  return { automations, addAutomation, updateAutomation, deleteAutomation, reload: load };
}
