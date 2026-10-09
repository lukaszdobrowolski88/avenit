// Edytor etykiet: przełącznik „Oznacza zakończenie” (done) dla kolumny Status.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LabelsEditor from './LabelsEditor';

const statusCol = {
  id: 'c1', type: 'status',
  settings: { labels: [{ id: 'todo', title: 'Do zrobienia', color: '#999999' }, { id: 'ok', title: 'Gotowe', color: '#00aa00' }] },
};

describe('LabelsEditor — „Oznacza zakończenie”', () => {
  it('pokazuje stan z nazwy (Gotowe) i zapisuje jawną flagę done', async () => {
    const onUpdateColumn = vi.fn(() => Promise.resolve());
    render(<LabelsEditor column={statusCol} onUpdateColumn={onUpdateColumn} />);
    const todo = screen.getByRole('button', { name: /Oznacza zakończenie: Do zrobienia/ });
    const ok = screen.getByRole('button', { name: /Oznacza zakończenie: Gotowe/ });
    expect(todo.getAttribute('aria-pressed')).toBe('false');
    expect(ok.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(todo);
    const labels = onUpdateColumn.mock.calls[0][1].settings.labels;
    expect(labels.find(l => l.id === 'todo').done).toBe(true);

    // Odznaczenie „Gotowe” zapisuje done: false (nazwa już nie decyduje).
    fireEvent.click(screen.getByRole('button', { name: /Oznacza zakończenie: Gotowe/ }));
    const labels2 = onUpdateColumn.mock.calls[1][1].settings.labels;
    expect(labels2.find(l => l.id === 'ok').done).toBe(false);
    await act(async () => {}); // zapis kolumny (Promise) kończy stan „w toku”
  });

  it('priorytet i opcje listy nie mają przełącznika', () => {
    const { rerender } = render(<LabelsEditor column={{ ...statusCol, type: 'priority' }} onUpdateColumn={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Oznacza zakończenie/ })).toBeNull();
    rerender(<LabelsEditor column={{ id: 'c2', type: 'dropdown', settings: { options: [{ id: 'o', title: 'A' }] } }} field="options" onUpdateColumn={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Oznacza zakończenie/ })).toBeNull();
  });
});
