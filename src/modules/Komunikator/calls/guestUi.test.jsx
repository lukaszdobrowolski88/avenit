import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Goście w rozmowach: logika weba, poczekalnia, okno „Zaproś gościa”, przycisk w nagłówku
// rozmowy i publiczna strona gościa (/rozmowa/:token).
const h = vi.hoisted(() => ({ fns: {} }));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({}) }),
    functions: {
      invoke: vi.fn(async (name, opts) => {
        const fn = h.fns[name];
        if (typeof fn === 'function') return fn(opts?.body);
        return fn || { data: { ok: true }, error: null };
      }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../../../hooks/usePresence', () => ({
  usePresence: () => ({ getStatus: () => 'offline' }),
  statusColors: { online: '', away: '', offline: '' },
  statusLabels: { online: 'Online', away: 'Zaraz wracam', offline: 'Offline' },
}));

const { supabase } = await import('../../../lib/supabase');
const L = await import('./guestLogic');
const { CallsContext } = await import('./callContext');
const { initialCallState } = await import('./callLogic');
const { default: GuestLobby } = await import('./GuestLobby');
const { default: GuestInviteModal } = await import('./GuestInviteModal');
const { default: ConversationHeader } = await import('../components/ConversationHeader');
const { default: GuestCallPage } = await import('./guest/GuestCallPage');

const ok = (data) => ({ data, error: null });
const fail = (status, code, message = 'x') => ({ data: null, error: { status, message, context: { code, error: message } } });

beforeEach(() => {
  h.fns = {};
  supabase.functions.invoke.mockClear();
  try { sessionStorage.clear(); } catch { /* ignore */ }
});

describe('guestLogic', () => {
  it('kto widzi „Zaproś gościa”: 1:1 każdy, grupa — admin rozmowy albo admin aplikacji', () => {
    expect(L.canInviteGuests({ id: 'c', type: 'direct' })).toBe(true);
    expect(L.canInviteGuests({ id: 'c', type: 'group', myRole: 'member' })).toBe(false);
    expect(L.canInviteGuests({ id: 'c', type: 'group', myRole: 'admin' })).toBe(true);
    expect(L.canInviteGuests({ id: 'c', type: 'ministry', myRole: 'member' }, { isAppAdmin: true })).toBe(true);
    expect(L.canInviteGuests(null)).toBe(false);
  });

  it('adres linku, kolejka poczekalni i kody błędów strony gościa', () => {
    expect(L.guestLinkUrl({ token: 'abc' }, 'https://schwro.avenit.pl/')).toBe('https://schwro.avenit.pl/rozmowa/abc');
    let map = {};
    map = L.applyGuestRequest(map, { id: 'r2', conversation_id: 'c1', status: 'pending', created_at: '2026-10-10T10:00:02Z' });
    map = L.applyGuestRequest(map, { id: 'r1', conversation_id: 'c1', status: 'pending', created_at: '2026-10-10T10:00:01Z' });
    map = L.applyGuestRequest(map, { id: 'r3', conversation_id: 'c2', status: 'pending', created_at: '2026-10-10T10:00:00Z' });
    expect(L.lobbyQueue(map, 'c1').map((r) => r.id)).toEqual(['r1', 'r2']);
    map = L.applyGuestRequest(map, { id: 'r1', conversation_id: 'c1', status: 'admitted' });
    expect(L.lobbyQueue(map, 'c1').map((r) => r.id)).toEqual(['r2']);
    expect(L.lobbyQueue(map, null)).toEqual([]);
    expect(L.guestErrorState({ status: 410, code: 'LINK_EXPIRED' })).toBe('expired');
    expect(L.guestErrorState({ status: 410, context: { code: 'LINK_FULL' } })).toBe('full');
    expect(L.guestErrorState({ status: 404 })).toBe('not_found');
    expect(L.guestErrorState({ status: 503, code: 'calls_disabled' })).toBe('unavailable');
    expect(L.guestErrorState({ status: 429 })).toBe('busy');
    expect(L.guestErrorState(new Error('sieć'))).toBe('error');
  });
});

describe('Poczekalnia gości (osoby w rozmowie)', () => {
  it('pokazuje najstarszą prośbę z licznikiem; Wpuść / Odrzuć wołają akcje', () => {
    const onAdmit = vi.fn();
    const onDeny = vi.fn();
    const queue = [{ id: 'r1', guest_name: 'Anna' }, { id: 'r2', guest_name: 'Piotr' }, { id: 'r3', guest_name: 'Ewa' }];
    render(<GuestLobby queue={queue} onAdmit={onAdmit} onDeny={onDeny} />);
    expect(screen.getByText('Gość chce dołączyć')).toBeTruthy();
    expect(screen.getByText('Anna')).toBeTruthy();
    expect(screen.getByText('i jeszcze 2 w poczekalni')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Wpuść: Anna' }));
    expect(onAdmit).toHaveBeenCalledWith('r1');
    fireEvent.click(screen.getByRole('button', { name: 'Odrzuć: Anna' }));
    expect(onDeny).toHaveBeenCalledWith('r1');
  });

  it('pusta kolejka — nic', () => {
    const { container } = render(<GuestLobby queue={[]} onAdmit={() => {}} onDeny={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('Okno „Zaproś gościa”', () => {
  const conv = { id: 'c1', type: 'group', name: 'Zespół' };

  it('tworzy link z opcjami i pokazuje go na liście; wyłączenie po potwierdzeniu', async () => {
    h.fns['call-link-list'] = ok({ links: [], can_manage: true, can_create: true });
    const created = { id: 'l1', token: 'tok123', expires_at: new Date(Date.now() + 3600e3).toISOString(), uses: 0, max_uses: 5, auto_admit: true };
    h.fns['call-link-create'] = (body) => ok({ link: { ...created, body } });
    render(<GuestInviteModal conversation={conv} onClose={() => {}} />);
    await screen.findByText('Utwórz link');
    expect(screen.getByText('Brak aktywnych linków.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '1 godzina' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Wpuszczaj bez pytania/ }));
    fireEvent.change(screen.getByPlaceholderText('bez limitu'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz link' }));
    await waitFor(() => expect(screen.getByDisplayValue(/\/rozmowa\/tok123$/)).toBeTruthy());
    const call = supabase.functions.invoke.mock.calls.find(([n]) => n === 'call-link-create');
    expect(call[1].body).toEqual({ conversation_id: 'c1', expires_in: '1h', auto_admit: true, show_title: false, max_uses: 5 });
    expect(screen.getByText(/dołączyło 0 z 5/)).toBeTruthy();
  });

  it('rozmowa z osobą niepełnoletnią — wyjaśnienie zamiast formularza', async () => {
    h.fns['call-link-list'] = ok({ links: [], can_manage: true, can_create: false, reason: 'GUESTS_MINORS', message: 'Ze względu na ochronę dzieci i młodzieży nie można zapraszać gości.' });
    render(<GuestInviteModal conversation={conv} onClose={() => {}} />);
    await screen.findByText(/ochronę dzieci/);
    expect(screen.queryByText('Utwórz link')).toBeNull();
  });
});

describe('Nagłówek rozmowy — „Zaproś gościa (link)”', () => {
  const calls = (over = {}) => ({
    me: 'ja@x.pl', state: initialCallState, callsEnabled: true, activeCalls: {}, activeCallFor: () => null,
    isCallLive: () => false, startCall: vi.fn(), joinCall: vi.fn(), openGuestInvite: vi.fn(), ...over,
  });
  const wrap = (ui, value) => <CallsContext.Provider value={value}>{ui}</CallsContext.Provider>;

  it('1:1 — przycisk otwiera okno; zwykły członek grupy go nie ma; admin grupy ma', () => {
    const c = calls();
    const direct = { id: 'c1', type: 'direct', displayName: 'Ola', posting_policy: 'everyone', participants: [] };
    const { unmount } = render(wrap(<ConversationHeader conversation={direct} />, c));
    fireEvent.click(screen.getAllByRole('button', { name: 'Zaproś gościa (link)' })[0]);
    expect(c.openGuestInvite).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    unmount();
    const member = { id: 'c2', type: 'group', name: 'Zespół', myRole: 'member', participants: [] };
    const r2 = render(wrap(<ConversationHeader conversation={member} />, calls()));
    expect(screen.queryByRole('button', { name: 'Zaproś gościa (link)' })).toBeNull();
    r2.unmount();
    render(wrap(<ConversationHeader conversation={{ ...member, myRole: 'admin' }} />, calls()));
    expect(screen.getByRole('button', { name: 'Zaproś gościa (link)' })).toBeTruthy();
  });

  it('połączenia wyłączone — bez przycisku', () => {
    const direct = { id: 'c1', type: 'direct', displayName: 'Ola', participants: [] };
    render(wrap(<ConversationHeader conversation={direct} />, calls({ callsEnabled: false })));
    expect(screen.queryByRole('button', { name: 'Zaproś gościa (link)' })).toBeNull();
  });
});

describe('Strona gościa /rozmowa/:token', () => {
  const page = () => render(
    <MemoryRouter initialEntries={['/rozmowa/TOKEN123']}>
      <Routes><Route path="/rozmowa/:token" element={<GuestCallPage />} /></Routes>
    </MemoryRouter>,
  );

  it('formularz: nazwa kościoła, „Rozmowa w …”, wymagane imię, prośba → poczekalnia', async () => {
    h.fns['call-guest-info'] = ok({ church_name: 'SChWro', title: null, call_live: true, kind: 'video', auto_admit: false });
    h.fns['call-guest-request'] = (body) => ok({ request_id: 'r1', secret: 's'.repeat(43), status: 'pending', name: body.name });
    h.fns['call-guest-status'] = ok({ status: 'pending', waiting: 'admission' });
    page();
    expect(await screen.findByRole('heading', { name: 'Rozmowa w SChWro' })).toBeTruthy();
    expect(screen.getByText('SChWro')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Poproś o dołączenie' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(supabase.functions.invoke.mock.calls.some(([n]) => n === 'call-guest-request')).toBe(false);
    fireEvent.change(screen.getByLabelText('Twoje imię'), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Poproś o dołączenie' }));
    expect(await screen.findByText('Czekasz na wpuszczenie…')).toBeTruthy();
    const req = supabase.functions.invoke.mock.calls.find(([n]) => n === 'call-guest-request');
    expect(req[1].body).toEqual({ token: 'TOKEN123', name: 'Anna' });
    await waitFor(() => expect(supabase.functions.invoke.mock.calls.some(([n, o]) => n === 'call-guest-status' && o.body.request_id === 'r1')).toBe(true));
    expect(JSON.parse(sessionStorage.getItem('avenit.guest.TOKEN123')).request_id).toBe('r1');
    expect(screen.getByRole('button', { name: 'Zrezygnuj' })).toBeTruthy();
  });

  it('wpuszczony, ale nikogo jeszcze nie ma — „Czekasz na rozpoczęcie rozmowy…”', async () => {
    sessionStorage.setItem('avenit.guest.TOKEN123', JSON.stringify({ request_id: 'r1', secret: 's'.repeat(43), name: 'Anna' }));
    h.fns['call-guest-info'] = ok({ church_name: 'SChWro', title: 'Zespół uwielbienia', call_live: false, auto_admit: true });
    h.fns['call-guest-status'] = ok({ status: 'admitted', waiting: 'host' });
    page();
    expect(await screen.findByText('Czekasz na rozpoczęcie rozmowy…')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Zespół uwielbienia' })).toBeTruthy();
  });

  it('odrzucono — komunikat i czyszczenie zapisanej prośby', async () => {
    sessionStorage.setItem('avenit.guest.TOKEN123', JSON.stringify({ request_id: 'r1', secret: 's'.repeat(43), name: 'Anna' }));
    h.fns['call-guest-info'] = ok({ church_name: 'SChWro', title: null, call_live: true });
    h.fns['call-guest-status'] = ok({ status: 'denied' });
    page();
    expect(await screen.findByText('Nie wpuszczono Cię do rozmowy')).toBeTruthy();
    expect(sessionStorage.getItem('avenit.guest.TOKEN123')).toBeNull();
  });

  it('link wygasł / nie istnieje — stan końcowy bez formularza', async () => {
    h.fns['call-guest-info'] = fail(410, 'LINK_EXPIRED');
    const { unmount } = page();
    expect(await screen.findByText('Link wygasł')).toBeTruthy();
    expect(screen.queryByLabelText('Twoje imię')).toBeNull();
    unmount();
    h.fns['call-guest-info'] = fail(404, 'LINK_NOT_FOUND');
    page();
    expect(await screen.findByText('Nie znaleziono rozmowy')).toBeTruthy();
  });

  it('„wpuszczaj bez pytania” — przycisk „Dołącz do rozmowy”', async () => {
    h.fns['call-guest-info'] = ok({ church_name: 'SChWro', title: null, call_live: true, auto_admit: true });
    page();
    expect(await screen.findByRole('button', { name: 'Dołącz do rozmowy' })).toBeTruthy();
  });
});
