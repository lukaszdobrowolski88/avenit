// Formularz pieśni (UXB-12/13) i słownik tagów (UXB-14).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({}),
    functions: { invoke: async () => ({ data: { tags: ['a'] }, error: null }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}));
vi.mock('../../lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../../lib/dialog', () => ({ confirmDialog: async () => true }));

import SongForm, { visibleChordsLength } from './SongForm';
import { buildSongTagList, parseTagValue } from './songTags';

describe('SongForm', () => {
  it('bez tytułu: błąd przy polu, przejście na „Informacje podstawowe”, brak zapisu', async () => {
    const onSave = vi.fn();
    render(<SongForm initialData={{}} onSave={onSave} onCancel={() => {}} allTags={[]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tekst i chwyty' }));
    fireEvent.click(screen.getByText('Zapisz pieśń'));
    expect(await screen.findByText('Podaj tytuł pieśni.')).toBeTruthy();
    expect(screen.getByLabelText('Tytuł *').getAttribute('aria-invalid')).toBe('true');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('bez wybranej tonacji zapisuje pustą tonację (nie „C”)', async () => {
    const onSave = vi.fn(async () => {});
    render(<SongForm initialData={{}} onSave={onSave} onCancel={() => {}} allTags={[]} />);
    fireEvent.change(screen.getByLabelText('Tytuł *'), { target: { value: 'Jak wielki jest Bóg' } });
    fireEvent.click(screen.getByText('Zapisz pieśń'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].key || '').toBe('');
  });

  it('licznik liczy widoczny tekst, nie HTML', () => {
    expect(visibleChordsLength('<span class="bar" style="min-width:80px">​</span><b>C</b>&nbsp;G')).toBe(3);
  });
});

describe('słownik tagów pieśni', () => {
  it('łączy słownik z bazy, tagi pieśni i dawne tagi przeglądarki bez duplikatów', () => {
    const out = buildSongTagList({ dictValue: '["Adwent","kolęda"]', songs: [{ tags: ['Kolęda', 'Uwielbienie'] }], legacy: ['adwent', 'Nowy'] });
    expect(out).toEqual(['Adwent', 'kolęda', 'Nowy', 'Uwielbienie']);
  });
  it('czyta różne formy wartości app_settings', () => {
    expect(parseTagValue(['a'])).toEqual(['a']);
    expect(parseTagValue(JSON.stringify('["a"]'))).toEqual(['a']);
    expect(parseTagValue('zepsute')).toEqual([]);
  });
});
