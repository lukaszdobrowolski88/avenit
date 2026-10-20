// „Utwórz zadanie” z wiadomości i „Zapisane” (migracja 114): tablice docelowe wg uprawnień,
// zapis zadania z powiązaniem z wiadomością, wskaźnik pod wiadomością, lista zapisanych.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ writes: [], data: {}, filters: [] }));

// Łańcuch zapytań jak supabase-js: wynik = h.data[tabela] (przefiltrowany po in/eq dla id).
vi.mock('../../../lib/supabase', () => {
  const builder = (table) => {
    const state = { table, filters: [] };
    const result = () => {
      let rows = [...(h.data[table] || [])];
      for (const f of state.filters) {
        if (f.type === 'in') rows = rows.filter((r) => f.value.map(String).includes(String(r[f.col])));
        if (f.type === 'eq') rows = rows.filter((r) => String(r[f.col]) === String(f.value));
        if (f.type === 'is') rows = rows.filter((r) => (r[f.col] ?? null) === f.value);
      }
      return { data: rows, error: null };
    };
    const b = {
      select: () => b,
      in: (col, value) => { state.filters.push({ type: 'in', col, value }); h.filters.push({ table, col, value }); return b; },
      eq: (col, value) => { state.filters.push({ type: 'eq', col, value }); return b; },
      is: (col, value) => { state.filters.push({ type: 'is', col, value }); return b; },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: result().data[0] || null, error: null }),
      single: async () => ({ data: result().data[0] || null, error: null }),
      then: (ok, bad) => Promise.resolve(result()).then(ok, bad),
      insert: (payload) => {
        h.writes.push({ table, op: 'insert', payload });
        const row = { id: `new-${h.writes.length}`, ...payload };
        const res = { data: row, error: null };
        return { select: () => ({ single: async () => res }), then: (ok, bad) => Promise.resolve(res).then(ok, bad) };
      },
      delete: () => {
        const d = { eq: async (col, value) => { h.writes.push({ table, op: 'delete', col, value }); return { error: null }; } };
        return d;
      },
    };
    return b;
  };
  return { supabase: { from: builder }, getCachedUser: async () => ({ email: 'ja@test.pl' }) };
});
vi.mock('../../../lib/toast', () => ({ toast: { success: () => {}, error: () => {}, info: () => {} } }));
vi.mock('../../../hooks/useAppModules', () => ({ useAppModules: () => ({ modules: [{ key: 'media', label: 'Media Team', path: '/media' }] }) }));
vi.mock('../../Events/eventTasks', () => ({
  eventTasksSource: (k) => (k === 'media' ? 'media_tasks' : 'tasks'),
  eventTasksModule: (k) => (k === 'media' ? 'media' : 'calendar'),
  resolveEventTaskBoard: async () => ({ board: { id: 'bm', source_kind: 'media_tasks', module_key: 'media' }, columns: [], groupId: 'gm' }),
  newTaskCells: (columns, { due, people }) => {
    const cells = {};
    const d = columns.find((c) => c.type === 'date');
    const p = columns.find((c) => c.type === 'people');
    if (d && due) cells[d.id] = due;
    if (p && people?.length) cells[p.id] = people;
    return cells;
  },
}));

import { loadTaskTargets, createTaskFromMessage, loadMessageTasks, taskDescriptionFor } from './api';
import MessageTaskChips from './MessageTaskChips';
import SavedMessagesPanel from './SavedMessagesPanel';

beforeEach(() => {
  h.writes = [];
  h.filters = [];
  h.data = {
    boards: [
      { id: 'b1', name: 'Remont', is_template: false, module_key: null },
      { id: 'b2', name: 'Stara', is_template: false, module_key: null, is_archived: true },
      { id: 'b3', name: 'Z importu', is_template: false, module_key: null, source_kind: 'tasks' },
    ],
    board_columns: [
      { id: 'cd', board_id: 'b1', type: 'date', display_order: 1 },
      { id: 'cp', board_id: 'b1', type: 'people', display_order: 2 },
      { id: 'cs', board_id: 'b1', type: 'status', display_order: 0, settings: { labels: [{ id: 'todo', title: 'Do zrobienia', color: '#579bfc' }] } },
    ],
    board_groups: [{ id: 'g1', board_id: 'b1', display_order: 0 }],
    board_items: [],
  };
});

const conv = { id: 'c1', type: 'ministry', name: 'Media', ministry_key: 'media_team' };

describe('tablice docelowe', () => {
  it('kanał służby: zadania służby najpierw, Kalendarz, aktywne tablice Projektów', async () => {
    const list = await loadTaskTargets(conv, { canModule: () => true, moduleLabel: (k) => (k === 'media' ? 'Media Team' : null) });
    expect(list.map((t) => t.key)).toEqual(['tasks:media', 'tasks:calendar', 'board:b1']);
    expect(list[0].label).toBe('Zadania — Media Team');
  });

  it('bez prawa do Projektów i służby — tylko Kalendarz; bez żadnego — pusto', async () => {
    const onlyCal = await loadTaskTargets(conv, { canModule: (m) => m === 'calendar' });
    expect(onlyCal.map((t) => t.key)).toEqual(['tasks:calendar']);
    expect(await loadTaskTargets({ id: 'd', type: 'direct' }, { canModule: () => false })).toEqual([]);
  });
});

describe('zadanie z wiadomości', () => {
  it('zapis: nazwa, opis z linkiem, osoba, termin, powiązanie z wiadomością', async () => {
    const message = { id: 'm1', conversation_id: 'c1', sender_email: 'ola@test.pl', content: 'Kupić kable\nna niedzielę' };
    const description = taskDescriptionFor(message, conv, 'Ola Nowak');
    expect(description).toContain('Kupić kable\nna niedzielę');
    expect(description).toContain('Z wiadomości od Ola Nowak w „Media”');
    expect(description).toContain(`${window.location.origin}/komunikator?conversation=c1&message=m1`);
    // Odpowiedź w wątku — link z &thread= (jak przypomnienie: rozmowa + panel wątku).
    expect(taskDescriptionFor({ ...message, id: 'm2', thread_root_id: 'm1' }, conv, 'Ola Nowak'))
      .toContain('/komunikator?conversation=c1&message=m2&thread=m1');

    const target = { key: 'board:b1', kind: 'board', board: h.data.boards[0] };
    const res = await createTaskFromMessage({
      target, message, userEmail: 'ja@test.pl', userName: 'Ja',
      input: { name: 'Kupić kable', description, due: '2026-10-25', people: [{ email: 'ola@test.pl', name: 'Ola Nowak' }] },
    });
    const ins = h.writes.find((w) => w.table === 'board_items');
    expect(ins.payload).toMatchObject({
      board_id: 'b1', group_id: 'g1', name: 'Kupić kable', source_message_id: 'm1', source_conversation_id: 'c1',
      cells: { cd: '2026-10-25', cp: [{ email: 'ola@test.pl', name: 'Ola Nowak' }] }, created_by: 'ja@test.pl',
    });
    expect(res.board.id).toBe('b1');
    await waitFor(() => expect(h.writes.some((w) => w.table === 'board_item_activity')).toBe(true));
  });

  it('wskaźnik: zadania widocznych wiadomości jednym zapytaniem, ze statusem', async () => {
    h.data.board_items = [{ id: 'i1', board_id: 'b1', name: 'Kupić kable', cells: { cs: 'todo' }, source_message_id: 'm1' }];
    const map = await loadMessageTasks(['m1', 'm2', 'm1']);
    expect(h.filters.filter((f) => f.table === 'board_items')).toEqual([{ table: 'board_items', col: 'source_message_id', value: ['m1', 'm2'] }]);
    const tasks = map.get('m1');
    expect(tasks[0]).toMatchObject({ id: 'i1', name: 'Kupić kable', status: { title: 'Do zrobienia' } });

    render(<MemoryRouter><MessageTaskChips tasks={tasks} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Zadanie: Kupić kable/ })).toBeTruthy();
    expect(screen.getByText('Do zrobienia')).toBeTruthy();
  });
});

describe('Zapisane', () => {
  it('lista: nadawca, rozmowa, treść; niedostępne i usunięte ukryte; klik otwiera wiadomość', async () => {
    h.data.saved_messages = [
      { id: 's1', message_id: 'm1', conversation_id: 'c1', created_at: '2026-10-01T10:00:00Z' },
      { id: 's2', message_id: 'm-obca', conversation_id: 'c9', created_at: '2026-10-02T10:00:00Z' },
      { id: 's3', message_id: 'm3', conversation_id: 'c1', created_at: '2026-10-03T10:00:00Z' },
    ];
    h.data.messages = [
      { id: 'm1', conversation_id: 'c1', sender_email: 'ola@test.pl', content: 'Kupić kable', created_at: '2026-09-30T10:00:00Z' },
      { id: 'm3', conversation_id: 'c1', sender_email: 'ola@test.pl', content: 'usunięta', deleted_at: '2026-10-04T00:00:00Z' },
    ];
    h.data.app_users = [{ email: 'ola@test.pl', full_name: 'Ola Nowak' }];
    const onOpenMessage = vi.fn();
    const onClose = vi.fn();
    render(<SavedMessagesPanel isOpen onClose={onClose} conversations={[conv]} onOpenMessage={onOpenMessage} />);
    await waitFor(() => expect(screen.getByText('Kupić kable')).toBeTruthy());
    expect(screen.getByText('Ola Nowak')).toBeTruthy();
    expect(screen.getByText('Media')).toBeTruthy();
    expect(screen.queryByText('usunięta')).toBeNull();
    fireEvent.click(screen.getByText('Kupić kable'));
    expect(onOpenMessage).toHaveBeenCalledWith('c1', 'm1', null);
  });

  it('odpowiedź w wątku: klik podaje wiadomość główną (skok do niej + panel wątku)', async () => {
    h.data.saved_messages = [{ id: 's4', message_id: 'm4', conversation_id: 'c1', created_at: '2026-10-01T10:00:00Z' }];
    h.data.messages = [
      { id: 'm4', conversation_id: 'c1', thread_root_id: 'm1', sender_email: 'ola@test.pl', content: 'Odpowiedź w wątku', created_at: '2026-09-30T11:00:00Z' },
    ];
    h.data.app_users = [{ email: 'ola@test.pl', full_name: 'Ola Nowak' }];
    const onOpenMessage = vi.fn();
    render(<SavedMessagesPanel isOpen onClose={() => {}} conversations={[conv]} onOpenMessage={onOpenMessage} />);
    await waitFor(() => expect(screen.getByText('Odpowiedź w wątku')).toBeTruthy());
    fireEvent.click(screen.getByText('Odpowiedź w wątku'));
    expect(onOpenMessage).toHaveBeenCalledWith('c1', 'm4', 'm1');
  });

  it('usunięcie z zapisanych', async () => {
    h.data.saved_messages = [{ id: 's1', message_id: 'm1', conversation_id: 'c1', created_at: '2026-10-01T10:00:00Z' }];
    h.data.messages = [{ id: 'm1', conversation_id: 'c1', sender_email: 'ola@test.pl', content: 'Kupić kable' }];
    render(<SavedMessagesPanel isOpen onClose={() => {}} conversations={[conv]} />);
    await waitFor(() => expect(screen.getByText('Kupić kable')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Usuń z zapisanych' }));
    await waitFor(() => expect(screen.queryByText('Kupić kable')).toBeNull());
    expect(h.writes).toContainEqual({ table: 'saved_messages', op: 'delete', col: 'message_id', value: 'm1' });
  });
});
