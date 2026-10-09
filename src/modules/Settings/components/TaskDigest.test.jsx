import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Atrapa Data API: push_user_preferences (wiersz osoby) + app_settings.
const db = vi.hoisted(() => ({ prefs: null, org: null, upserts: [] }));
vi.mock('../../../lib/supabase', () => {
  const builder = (table) => {
    const q = {
      select: () => q, ilike: () => q, eq: () => q, limit: () => q,
      maybeSingle: async () => ({ data: table === 'app_settings' ? (db.org == null ? null : { value: db.org }) : db.prefs, error: null }),
      upsert: (row) => {
        db.upserts.push({ table, row });
        if (table === 'push_user_preferences') db.prefs = { ...(db.prefs || {}), ...row };
        return { select: async () => ({ data: [row], error: null }) };
      },
    };
    return q;
  };
  return { supabase: { from: (t) => builder(t) } };
});
vi.mock('../../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import TaskDigestPreference from './TaskDigestPreference';
import TaskDigestSettings from './TaskDigestSettings';

beforeEach(() => { db.prefs = null; db.org = null; db.upserts = []; });

describe('TaskDigestPreference (Mój profil)', () => {
  const name = 'Poranny przegląd zadań (e-mail i push)';

  it('domyślnie włączony; wyłączenie dopisuje task_digest i zachowuje inne kategorie', async () => {
    db.prefs = { user_email: 'Ola@x.pl', category_opt_outs: ['chat'] };
    render(<TaskDigestPreference userEmail="ola@x.pl" />);
    const sw = await screen.findByRole('switch', { name });
    await waitFor(() => expect(sw.disabled).toBe(false));
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    await waitFor(() => expect(db.upserts).toHaveLength(1));
    expect(db.upserts[0]).toEqual({ table: 'push_user_preferences', row: { user_email: 'Ola@x.pl', category_opt_outs: ['chat', 'task_digest'] } });
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('false'));
  });

  it('pokazuje rezygnację i ponowne włączenie usuwa tylko task_digest', async () => {
    db.prefs = { user_email: 'ola@x.pl', category_opt_outs: ['task_digest', 'chat'] };
    render(<TaskDigestPreference userEmail="ola@x.pl" />);
    const sw = await screen.findByRole('switch', { name });
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(sw);
    await waitFor(() => expect(db.upserts).toHaveLength(1));
    expect(db.upserts[0].row.category_opt_outs).toEqual(['chat']);
  });

  it('wyłączony dla organizacji — przełącznik nieaktywny z wyjaśnieniem', async () => {
    db.org = '{"enabled":false,"overdue_days":14}';
    render(<TaskDigestPreference userEmail="ola@x.pl" />);
    expect(await screen.findByText('Przegląd zadań jest wyłączony dla całej organizacji.')).toBeTruthy();
    expect(screen.getByRole('switch', { name }).disabled).toBe(true);
  });
});

describe('TaskDigestSettings (Ustawienia → Organizacja)', () => {
  it('domyślnie włączony z oknem 14 dni; zapis jako JSON', async () => {
    const onSave = vi.fn(async () => true);
    render(<TaskDigestSettings raw={undefined} onSave={onSave} />);
    const sw = screen.getByRole('switch', { name: 'Wysyłaj poranny przegląd zadań' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    const days = screen.getByLabelText('Zaległe z ostatnich (dni)');
    expect(days.value).toBe('14');
    expect(screen.getByRole('button', { name: 'Zapisz' }).disabled).toBe(true);
    fireEvent.change(days, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('{"enabled":true,"overdue_days":7}'));
  });

  it('wyłączenie dla organizacji i walidacja zakresu dni', async () => {
    const onSave = vi.fn(async () => true);
    render(<TaskDigestSettings raw='{"enabled":true,"overdue_days":3}' onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Zaległe z ostatnich (dni)'), { target: { value: '120' } });
    expect(screen.getByText('Podaj liczbę od 0 do 90.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zapisz' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Zaległe z ostatnich (dni)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Wysyłaj poranny przegląd zadań' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('{"enabled":false,"overdue_days":3}'));
  });
});
