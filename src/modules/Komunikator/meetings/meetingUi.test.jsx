import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ users: [], fn: null, confirm: true }));

vi.mock('../../../lib/supabase', () => {
  const chain = () => {
    const b = {
      select: () => b,
      order: () => Promise.resolve({ data: h.users, error: null }),
    };
    return b;
  };
  return {
    supabase: {
      from: () => chain(),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});
vi.mock('../calls/callApi', () => ({ callFn: vi.fn((name, body) => h.fn(name, body)) }));
vi.mock('../../../lib/dialog', () => ({ confirmDialog: vi.fn(async () => h.confirm) }));

const { callFn } = await import('../calls/callApi');
const { CallsContext } = await import('../calls/callContext');
const { initialCallState } = await import('../calls/callLogic');
const { default: MeetingModal } = await import('./MeetingModal');
const { default: MeetingPanel } = await import('./MeetingPanel');

const fakeCalls = (over = {}) => ({
  state: initialCallState, callsEnabled: true, activeCallFor: () => null, isCallLive: () => false,
  startCall: vi.fn(), joinCall: vi.fn(), ...over,
});
const withCalls = (ui, value = fakeCalls()) => <CallsContext.Provider value={value}>{ui}</CallsContext.Provider>;

const future = (h0) => new Date(Date.now() + h0 * 3_600_000).toISOString();
const meeting = (over = {}) => ({
  id: 'm1', conversation_id: 'c1', title: 'Rada starszych', description: 'Plan na jesień',
  starts_at: future(24), ends_at: future(25), kind: 'video', status: 'scheduled', guests_auto_admit: false,
  organizer: { email: 'jan@x.pl', name: 'Jan Kowalski' }, can_manage: false, my_response: 'pending', call_live: false,
  members: [
    { email: 'jan@x.pl', name: 'Jan Kowalski', response: 'accepted', organizer: true },
    { email: 'ola@x.pl', name: 'Ola Nowak', response: 'pending', organizer: false },
  ],
  guests: [{ id: 'g1', name: 'Anna', response: 'accepted' }],
  ...over,
});

beforeEach(() => {
  h.users = [
    { email: 'ola@x.pl', full_name: 'Ola Nowak', is_active: true, status: 'active' },
    { email: 'piotr@x.pl', full_name: 'Piotr Zieliński', is_active: true, status: 'active' },
    { email: 'jan@x.pl', full_name: 'Jan Kowalski', is_active: true, status: 'active' },
  ];
  h.confirm = true;
  callFn.mockClear();
});

describe('MeetingModal — zaplanuj spotkanie', () => {
  it('członek po koncie, gość po e-mailu (adres konta trafia do członków), zapis', async () => {
    h.fn = async (name) => (name === 'meeting-create' ? { meeting: meeting({ id: 'new', conversation_id: 'c9' }) } : {});
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(withCalls(<MeetingModal isOpen onClose={onClose} currentUserEmail="jan@x.pl" onSaved={onSaved} />));
    fireEvent.change(screen.getByLabelText('Nazwa'), { target: { value: 'Rada starszych' } });
    // Wyszukanie i dodanie członka.
    fireEvent.change(screen.getByLabelText('Szukaj osób'), { target: { value: 'piotr' } });
    fireEvent.click(await screen.findByRole('button', { name: /Piotr Zieliński/ }));
    expect(screen.getByRole('button', { name: 'Usuń z zaproszonych: Piotr Zieliński' })).toBeTruthy();
    // Goście: adres osoby z kontem → członek; obcy adres → gość.
    fireEvent.change(screen.getByLabelText('Adresy e-mail gości'), { target: { value: 'anna@gmail.com, ola@x.pl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(screen.getByRole('button', { name: 'Usuń z zaproszonych: anna@gmail.com' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Usuń z zaproszonych: Ola Nowak' })).toBeTruthy();
    expect(screen.getByText('Wpuszczaj gości bez pytania')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Zaplanuj spotkanie' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [name, body] = callFn.mock.calls.find((c) => c[0] === 'meeting-create');
    expect(name).toBe('meeting-create');
    expect(body).toMatchObject({ title: 'Rada starszych', kind: 'video', duration_min: 60, guests_auto_admit: false });
    expect(body.members.sort()).toEqual(['ola@x.pl', 'piotr@x.pl']);
    expect(body.guests).toEqual([{ email: 'anna@gmail.com' }]);
    expect(Date.parse(body.starts_at)).toBeGreaterThan(Date.now());
    expect(onClose).toHaveBeenCalled();
  });

  it('niedodany adres i błędy serwera — komunikat w oknie, bez zamykania', async () => {
    h.fn = async () => { const e = new Error('x'); e.context = { error: 'Nie znaleziono kont: nikt@x.pl' }; throw e; };
    const onClose = vi.fn();
    render(withCalls(<MeetingModal isOpen onClose={onClose} currentUserEmail="jan@x.pl" />));
    fireEvent.change(screen.getByLabelText('Nazwa'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Adresy e-mail gości'), { target: { value: 'g@y.pl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zaplanuj spotkanie' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Kliknij „Dodaj”/);
    expect(callFn).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Adresy e-mail gości'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zaplanuj spotkanie' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Nie znaleziono kont: nikt@x.pl');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('edycja: uczestnicy i goście z bieżącego spotkania, zapis przez meeting-update', async () => {
    h.fn = async (name, body) => ({ meeting: meeting({ title: body.title }) });
    const m = meeting({ can_manage: true, guests: [{ id: 'g1', name: 'Anna', email: 'anna@gmail.com', response: 'pending' }] });
    render(withCalls(<MeetingModal isOpen onClose={() => {}} currentUserEmail="jan@x.pl" meeting={m} />));
    expect(screen.getByLabelText('Nazwa').value).toBe('Rada starszych');
    expect(screen.getByRole('button', { name: 'Usuń z zaproszonych: Ola Nowak' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Usuń z zaproszonych: anna@gmail.com' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Usuń z zaproszonych: anna@gmail.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
    await waitFor(() => expect(callFn).toHaveBeenCalledWith('meeting-update', expect.objectContaining({ meeting_id: 'm1', members: ['ola@x.pl'], guests: [] })));
  });
});

describe('MeetingPanel — karta spotkania w rozmowie', () => {
  const conv = { id: 'c1', type: 'meeting', name: 'Rada starszych', participants: [] };

  it('zaproszony członek: termin, odpowiedź, „Rozpocznij spotkanie”, lista uczestników', async () => {
    h.fn = async (name, body) => (name === 'meeting-respond' ? { meeting: meeting({ my_response: body.response }) } : { meeting: meeting() });
    const calls = fakeCalls();
    render(withCalls(<MeetingPanel conversation={conv} currentUserEmail="ola@x.pl" />, calls));
    expect(await screen.findByText(/Prowadzi: Jan Kowalski/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Wezmę udział' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Wezmę udział' }).getAttribute('aria-checked')).toBe('true'));
    expect(callFn).toHaveBeenCalledWith('meeting-respond', { meeting_id: 'm1', response: 'accepted' });
    fireEvent.click(screen.getByRole('button', { name: /Rozpocznij spotkanie/ }));
    expect(calls.startCall).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'video');
    fireEvent.click(screen.getByRole('button', { name: /Uczestnicy: 3/ }));
    const list = screen.getByRole('list', { name: 'Uczestnicy spotkania' });
    expect(list.textContent).toMatch(/Jan Kowalski · organizator/);
    expect(list.textContent).toMatch(/Anna · gość/);
    expect(screen.queryByRole('button', { name: /Odwołaj/ })).toBeNull();
  });

  it('spotkanie trwa: „Dołącz” do bieżącego połączenia', async () => {
    h.fn = async () => ({ meeting: meeting({ call_live: true }) });
    const live = { id: 'k1', conversation_id: 'c1', kind: 'video' };
    const calls = fakeCalls({ activeCallFor: () => live });
    render(withCalls(<MeetingPanel conversation={conv} currentUserEmail="ola@x.pl" />, calls));
    fireEvent.click(await screen.findByRole('button', { name: /^Dołącz$/ }));
    expect(calls.joinCall).toHaveBeenCalledWith(live, expect.objectContaining({ id: 'c1' }), 'video');
    expect(screen.getByText('Spotkanie trwa')).toBeTruthy();
  });

  it('organizator odwołuje spotkanie (z potwierdzeniem)', async () => {
    h.fn = async (name) => (name === 'meeting-cancel'
      ? { meeting: meeting({ status: 'cancelled', can_manage: true }) }
      : { meeting: meeting({ can_manage: true, my_response: 'accepted' }) });
    render(withCalls(<MeetingPanel conversation={conv} currentUserEmail="jan@x.pl" />));
    expect(screen.queryByRole('radiogroup', { name: 'Twoja odpowiedź' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Odwołaj/ }));
    expect(await screen.findByText('Spotkanie odwołane')).toBeTruthy();
    expect(callFn).toHaveBeenCalledWith('meeting-cancel', { meeting_id: 'm1' });
    expect(screen.queryByRole('button', { name: /Rozpocznij spotkanie/ })).toBeNull();
  });
});
