import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { addDays, format } from 'date-fns';

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
    if (error) { toast.error('Nie udało się zapisać automatyzacji' + (error.message ? `: ${error.message}` : '')); return null; }
    setAutomations(prev => [...prev, row]);
    return row;
  }, [boardId, userEmail]);

  const updateAutomation = useCallback(async (id, updates) => {
    const { data: row } = await supabase.from('board_automations').update(updates).eq('id', id).select().single();
    if (row) setAutomations(prev => prev.map(a => a.id === id ? row : a));
  }, []);

  const deleteAutomation = useCallback(async (id) => {
    await supabase.from('board_automations').delete().eq('id', id);
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
    cols.forEach(c => (item.cells?.[c.id] || []).forEach(p => emails.add(p.email)));
    return [...emails];
  };

  const runActions = async (automation, item) => {
    const detail = [];
    for (const action of (automation.actions || [])) {
      const p = action.params || {};
      try {
        if (action.type === 'notify') {
          let targets = [];
          if (p.targetType === 'creator') targets = item.created_by ? [item.created_by] : [];
          else if (p.targetType === 'specific') targets = p.email ? [p.email] : [];
          else targets = peopleOfItem(item); // assignee (domyślnie)
          for (const email of targets) {
            await supabase.from('notifications').insert({
              user_email: email, type: 'task',
              title: p.title || `Automatyzacja: ${automation.name || 'tablica'}`,
              body: `${item.name || 'Element'}`,
              link: `/projekty?board=${boardId}&item=${item.id}`,
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
            item_id: item.id, board_id: boardId, author_email: userEmail || null, author_name: userName || 'Automatyzacja',
            body: p.text || '', mentions: [], likes: [],
          });
          detail.push('create_update');
        }
      } catch (e) {
        detail.push(`err:${action.type}`);
      }
    }
    await supabase.from('board_automation_runs').insert({
      automation_id: automation.id, board_id: boardId, item_id: item.id, status: 'success', detail: { actions: detail },
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
      for (const a of hits) await runActions(a, event.item);
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
