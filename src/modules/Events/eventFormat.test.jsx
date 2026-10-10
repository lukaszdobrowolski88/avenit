import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ fn: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../Komunikator/calls/callApi', () => ({ callFn: vi.fn((name, body) => h.fn(name, body)) }));

const { callFn } = await import('../Komunikator/calls/callApi');
const { CallsContext } = await import('../Komunikator/calls/callContext');
const { initialCallState } = await import('../Komunikator/calls/callLogic');
const { EventFormatPicker, EventFormatBadge, JoinEventButton, joinWindowOpen, hasPlace, isOnlineFormat } = await import('./eventFormat');
const { default: OnlineMeetingCard } = await import('./OnlineMeetingCard');

const fakeCalls = (over = {}) => ({ state: initialCallState, callsEnabled: true, activeCallFor: () => null, startCall: vi.fn(), joinCall: vi.fn(), ...over });
const wrap = (ui, calls = fakeCalls()) => <MemoryRouter><CallsContext.Provider value={calls}>{ui}</CallsContext.Provider></MemoryRouter>;
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => ({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });

beforeEach(() => { callFn.mockClear(); });

describe('format wydarzenia', () => {
  it('reguły: online/hybrydowe mają spotkanie, online — bez miejsca', () => {
    expect([isOnlineFormat('online'), isOnlineFormat('hybrid'), isOnlineFormat('in_person'), isOnlineFormat(undefined)]).toEqual([true, true, false, false]);
    expect([hasPlace('online'), hasPlace('hybrid'), hasPlace('in_person')]).toEqual([false, true, true]);
  });

  it('„Dołącz” od 15 min przed początkiem do końca (bez końca — 3 h)', () => {
    const now = new Date(2026, 9, 12, 18, 0).getTime();
    const at = (h0, m0) => local(new Date(2026, 9, 12, h0, m0));
    expect(joinWindowOpen({ format: 'online', ...at(18, 10) }, now)).toBe(true);
    expect(joinWindowOpen({ format: 'online', ...at(18, 20) }, now)).toBe(false);
    expect(joinWindowOpen({ format: 'hybrid', ...at(16, 0) }, now)).toBe(true);
    expect(joinWindowOpen({ format: 'hybrid', ...at(16, 0), end_time: '17:00' }, now)).toBe(false);
    expect(joinWindowOpen({ format: 'in_person', ...at(18, 0) }, now)).toBe(false);
    expect(joinWindowOpen({ format: 'online', date: at(18, 0).date }, now)).toBe(false);
  });

  it('wybór formy i pigułka', () => {
    const onChange = vi.fn();
    render(<EventFormatPicker value="in_person" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Stacjonarne/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Hybrydowe/ }));
    expect(onChange).toHaveBeenCalledWith('hybrid');
    const { container } = render(<EventFormatBadge format="in_person" />);
    expect(container.textContent).toBe('');
    const badge = render(<EventFormatBadge format="online" />);
    expect(badge.container.textContent.trim()).toBe('Online');
  });

  it('„Dołącz”: serwer dopisuje do spotkania, potem start połączenia w rozmowie spotkania', async () => {
    h.fn = async () => ({ status: 'scheduled', joined: true, meeting: { id: 'm1', conversation_id: 'c9', title: 'Alpha', kind: 'video', participant: true } });
    const calls = fakeCalls();
    render(wrap(<JoinEventButton eventId="42" title="Kurs Alpha" />, calls));
    fireEvent.click(screen.getByRole('button', { name: /Dołącz/ }));
    await waitFor(() => expect(calls.startCall).toHaveBeenCalledWith(expect.objectContaining({ id: 'c9', type: 'meeting', name: 'Kurs Alpha' }), 'video'));
    expect(callFn).toHaveBeenCalledWith('event-meeting', { event_id: '42', join: true });
  });

  it('„Dołącz”, gdy spotkanie trwa — dołączenie do bieżącego połączenia', async () => {
    h.fn = async () => ({ status: 'scheduled', meeting: { id: 'm1', conversation_id: 'c9', kind: 'audio', participant: true } });
    const live = { id: 'k1', conversation_id: 'c9' };
    const calls = fakeCalls({ activeCallFor: () => live });
    render(wrap(<JoinEventButton eventId="42" title="Modlitwa" />, calls));
    fireEvent.click(screen.getByRole('button', { name: /Dołącz/ }));
    await waitFor(() => expect(calls.joinCall).toHaveBeenCalledWith(live, expect.objectContaining({ id: 'c9' }), 'audio'));
  });
});

describe('OnlineMeetingCard — strona wydarzenia', () => {
  it('bez godziny: prośba o ustawienie godziny', async () => {
    h.fn = async () => ({ status: 'needs_time' });
    render(wrap(<OnlineMeetingCard ev={{ id: '1', format: 'online', title: 'X' }} />));
    expect(await screen.findByText(/Ustaw godzinę rozpoczęcia/)).toBeTruthy();
  });

  it('zaplanowane: Dołącz, czat spotkania (uczestnik), ostrzeżenie przy całym kościele', async () => {
    h.fn = async () => ({ status: 'scheduled', meeting: { id: 'm1', conversation_id: 'c9', kind: 'video', participant: true, invited: 4, call_live: false } });
    render(wrap(<OnlineMeetingCard ev={{ id: '1', format: 'hybrid', title: 'Wieczór', date: '2026-10-12', time: '19:00' }} wideAudience />));
    expect(await screen.findByRole('button', { name: /Dołącz do spotkania/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Czat spotkania/ }).getAttribute('href')).toBe('/komunikator?conversation=c9');
    expect(screen.getByText('Zaproszonych: 4')).toBeTruthy();
    expect(screen.getByText(/do ok. 30 osób z kamerami/)).toBeTruthy();
  });

  it('stacjonarne — karta się nie pokazuje', () => {
    h.fn = async () => ({ status: 'none' });
    const { container } = render(wrap(<OnlineMeetingCard ev={{ id: '1', format: 'in_person' }} />));
    expect(container.textContent).toBe('');
  });
});
