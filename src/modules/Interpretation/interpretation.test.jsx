import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Tłumaczenie na żywo (web): czysta logika, karta na stronie wydarzenia (zarządzający / tłumacz /
// członek) i publiczna strona słuchacza (/tlumaczenie/:token) bez połączenia LiveKit.
const h = vi.hoisted(() => ({ fns: {}, rooms: [] }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({}) }),
    functions: {
      invoke: vi.fn(async (name, opts) => {
        const fn = h.fns[name];
        if (typeof fn === 'function') return fn(opts?.body);
        return fn || { data: {}, error: null };
      }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../Komunikator/calls/livekit', () => ({
  loadLivekit: async () => ({
    RoomEvent: {},
    Room: class { constructor() { h.rooms.push(this); } startAudio() { return Promise.resolve(); } on() { return this; } connect() { return Promise.resolve(); } disconnect() { return Promise.resolve(); } },
  }),
  mediaFailure: () => 'Other',
}));

const { supabase } = await import('../../lib/supabase');
const L = await import('./interpretationLogic');
const { default: InterpretationCard } = await import('../Events/InterpretationCard');
const { default: ListenerPage } = await import('./ListenerPage');

const ok = (data) => ({ data, error: null });
const fail = (status, code, message = 'x') => ({ data: null, error: { status, message, context: { code, error: message } } });
const TOKEN = 'A'.repeat(32);

beforeEach(() => {
  h.fns = {};
  h.rooms = [];
  supabase.functions.invoke.mockClear();
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe('interpretationLogic', () => {
  it('ścieżki: publiczna strona tylko z tokenem, konsola i nadawanie — osobno', () => {
    expect(L.isPublicListenerPath(`/tlumaczenie/${TOKEN}`)).toBe(true);
    expect(L.isPublicListenerPath('/tlumaczenie/konsola/12')).toBe(false);
    expect(L.isPublicListenerPath('/tlumaczenie/sluchaj/12')).toBe(false);
    expect(L.isPublicListenerPath('/tlumaczenie/krotki')).toBe(false);
    expect(L.consolePath(12)).toBe('/tlumaczenie/konsola/12');
    expect(L.originalPath('a b')).toBe('/tlumaczenie/oryginal/a%20b');
  });

  it('„Otwórz w aplikacji”: Android — intent z pakietem i Google Play, iOS — baner Safari, reszta — nic', () => {
    const host = 'schwro.avenit.pl';
    const android = L.appOpenOffer({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', host, pathname: `/tlumaczenie/${TOKEN}/` });
    expect(android.platform).toBe('android');
    expect(android.href).toBe(`intent://${host}/tlumaczenie/${TOKEN}#Intent;scheme=https;package=pl.avenit.app;S.browser_fallback_url=${encodeURIComponent('https://play.google.com/store/apps/details?id=pl.avenit.app')};end`);
    const ios = L.appOpenOffer({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', host, pathname: `/tlumaczenie/${TOKEN}` });
    expect(ios).toEqual({ platform: 'ios', meta: `app-id=6820247671, app-argument=https://${host}/tlumaczenie/${TOKEN}` });
    expect(L.appOpenOffer({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5, host, pathname: `/tlumaczenie/${TOKEN}` }).platform).toBe('ios');
    expect(L.appOpenOffer({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', host, pathname: `/tlumaczenie/${TOKEN}` })).toBeNull();
    expect(L.appOpenOffer({ userAgent: 'Android', host, pathname: '/tlumaczenie/konsola/12' })).toBeNull();
    expect(L.appOpenOffer({ userAgent: 'Android', host: '', pathname: `/tlumaczenie/${TOKEN}` })).toBeNull();
  });

  it('kody błędów → stany, ponawianie, język z przeglądarki, domyślny kanał', () => {
    expect(L.interpErrorState({ code: 'CHANNEL_NOT_LIVE' })).toBe('not_live');
    expect(L.interpErrorState({ context: { code: 'INTERP_ENDED' } })).toBe('ended');
    expect(L.interpErrorState({ status: 404 })).toBe('not_found');
    expect(L.interpErrorState({ code: 'calls_disabled', status: 503 })).toBe('disabled');
    expect(L.interpErrorState({ status: 429 })).toBe('busy');
    expect(L.interpErrorState(new Error('sieć'))).toBe('error');
    expect([0, 1, 2, 3, 4, 9].map(L.retryDelay)).toEqual([1500, 3000, 6000, 12000, 15000, 15000]);
    expect(L.browserUiLang(['uk-UA', 'en'])).toBe('uk');
    expect(L.browserUiLang(['de-DE'])).toBe('en');
    expect(L.browserUiLang(['pl'])).toBe('pl');
    const ch = [{ id: 'a', lang_code: 'en' }, { id: 'b', lang_code: 'uk' }];
    expect(L.defaultChannel(ch, { languages: ['uk-UA'] })).toBe('b');
    expect(L.defaultChannel(ch, { remembered: 'a', languages: ['uk'] })).toBe('a');
    expect(L.defaultChannel(ch, { remembered: 'zniknął', languages: ['pl'] })).toBe(null);
    expect(L.defaultChannel([ch[0]], { languages: ['pl'] })).toBe('a');
  });

  it('metadane pokoju i stan konsoli', () => {
    expect(L.parseRoomMeta('{"active":"Ola@x.pl"}')).toEqual({ active: 'ola@x.pl' });
    expect(L.parseRoomMeta('zepsute')).toEqual({ active: null });
    expect(L.consoleState({ me: 'ola@x.pl', active: 'ola@x.pl' })).toBe('on_air');
    expect(L.consoleState({ me: 'ola@x.pl', active: 'ola@x.pl', micMuted: true })).toBe('muted');
    expect(L.consoleState({ me: 'ola@x.pl', active: 'ewa@x.pl' })).toBe('locked');
    expect(L.consoleState({ me: 'ola@x.pl', active: null })).toBe('free');
  });

  it('edycja kanałów → ładunek serwera', () => {
    let ch = L.addChannel([], { lang_code: 'EN', label: 'English' });
    ch = L.addChannel(ch, { lang_code: 'en', label: 'dubel' });
    expect(ch).toHaveLength(1);
    ch = [{ id: 'x', lang_code: 'en', label: 'English', interpreters: [] }];
    ch = L.addInterpreter(ch, 'x', { email: 'ola@x.pl', name: 'Ola' });
    ch = L.addInterpreter(ch, 'x', { email: 'ola@x.pl', name: 'Ola' });
    expect(L.channelsPayload(ch)).toEqual([{ id: 'x', lang_code: 'en', label: 'English', interpreters: ['ola@x.pl'] }]);
    expect(L.channelsPayload(L.removeInterpreter(ch, 'x', 'ola@x.pl'))[0].interpreters).toEqual([]);
    expect(L.totalListeners({ channels: [{ listeners: 3 }, { listeners: null }, { listeners: 2 }] })).toBe(5);
  });

  it('moduł Tłumaczenia: nazwy, języki do dodania, wybór tłumacza jak w Grafiku', () => {
    expect(L.staffLabel({ role_name: 'Tłumacz EN', label: 'English', lang_code: 'en' })).toBe('Tłumacz EN');
    expect(L.staffLabel({ label: 'English', lang_code: 'en' })).toBe('English');
    expect(L.staffLabel({ lang_code: 'en' })).toBe('EN');
    const module = { languages: [{ lang_code: 'en', role_name: 'Tłumacz EN', label: 'English' }, { lang_code: 'uk', role_name: 'Tłumacz UK', label: 'Українська' }] };
    expect(L.languagesToAdd(module, [{ lang_code: 'en' }]).map((l) => l.role_name)).toEqual(['Tłumacz UK']);
    expect(L.languagesToAdd(null, [])).toEqual([]);
    const team = [
      { id: '1', name: 'Ola', email: 'ola@x.pl', eligible: ['en', 'uk'] },
      { id: '2', name: 'Ewa', email: 'ewa@x.pl', eligible: ['uk'], absent: { from: '2026-10-25', to: '2026-10-27' } },
      { id: '3', name: 'Adam', email: null, eligible: ['en', 'uk'] },
      { id: '4', name: 'Basia', email: 'basia@x.pl', eligible: ['uk'] },
    ];
    expect(L.interpreterOptions(team, { lang_code: 'en', interpreters: [] }).map((m) => [m.name, m.blocked])).toEqual([['Ola', null], ['Adam', 'no_account']]);
    expect(L.interpreterOptions(team, { lang_code: 'uk', interpreters: [{ email: 'ola@x.pl' }] }).map((m) => [m.name, m.blocked]))
      .toEqual([['Basia', null], ['Adam', 'no_account'], ['Ewa', 'absent']]);
    expect(L.absenceText({ from: '2026-10-25', to: '2026-10-27' })).toBe('nieobecność 25.10–27.10');
    expect(L.absenceText({ from: '2026-10-25', to: '2026-10-25' })).toBe('nieobecność 25.10');
    expect(L.absenceText({ manual: true })).toBe('nieobecność');
    expect(L.absenceText(null)).toBe('');
    expect(L.interpreterWarningText('no_role', { role_name: 'Tłumacz EN' })).toBe('bez Służby Tłumacz EN');
    expect(L.interpreterWarningText('not_in_team')).toBe('spoza zespołu Tłumaczeń');
    expect(L.interpreterWarningText(null)).toBe('');
    expect(L.MODULE_ROLES_PATH).toBe('/tlumaczenia?tab=roles');
  });

  it('grafik Tłumaczeń: tłumacze z grafiku poza ładunkiem, oczekujący przypięci do kanałów', () => {
    const ch = [{ id: 'x', lang_code: 'en', label: 'English', interpreters: [{ email: 'ola@x.pl', source: 'schedule' }, { email: 'ewa@x.pl', source: 'manual' }] }];
    expect(L.channelsPayload(ch)[0].interpreters).toEqual(['ewa@x.pl']);
    expect(L.hasScheduleInterpreters(ch[0])).toBe(true);
    expect(L.hasScheduleInterpreters({ interpreters: [{ email: 'a', source: 'manual' }] })).toBe(false);
    const { byLang, orphans } = L.scheduleByChannel({
      pending: [{ lang_code: 'en', label: 'English', role_name: 'Tłumacz EN', name: 'Jan', state: 'draft' }, { lang_code: 'de', label: 'Deutsch', name: 'Hans' }],
      no_account: [{ lang_code: 'en', label: 'English', name: 'Gość', state: 'no_account' }],
    }, ch);
    expect(byLang.get('en').map((p) => [p.name, p.kind, p.state, p.label])).toEqual([['Jan', 'pending', 'draft', 'Tłumacz EN'], ['Gość', 'no_account', 'no_account', 'English']]);
    expect(orphans.map((p) => p.name)).toEqual(['Hans']);
    expect(L.scheduleByChannel(undefined, ch).orphans).toEqual([]);
  });
});

const session = (over = {}) => ({
  id: 's1', status: 'idle', original_enabled: false, original_status: 'idle',
  channels: [{ id: 'c1', lang_code: 'en', label: 'English', role_name: 'Tłumacz EN', in_module: true, status: 'idle', mine: false, interpreters: [{ email: 'ola@x.pl', name: 'Ola' }] }],
  ...over,
});
const renderCard = () => render(<MemoryRouter><InterpretationCard ev={{ id: 7, title: 'Nabożeństwo', date: '2026-10-25', time: '10:00' }} /></MemoryRouter>);

describe('karta „Tłumaczenie na żywo”', () => {
  it('bez sesji i bez uprawnienia — karty nie ma', async () => {
    h.fns['interp-session-get'] = ok({ can_manage: false, my_channels: [], session: null });
    const { container } = renderCard();
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('zarządzający: włączenie, języki tylko z modułu, link i QR', async () => {
    const module = { available: true, path: '/tlumaczenia', unmapped: [], languages: [
      { lang_code: 'en', role_name: 'Tłumacz EN', label: 'English', whole_team: false },
      { lang_code: 'uk', role_name: 'Tłumacz UK', label: 'Українська', whole_team: true },
    ] };
    const team = [{ id: '1', name: 'Ola', email: 'ola@x.pl', eligible: ['en', 'uk'] }, { id: '2', name: 'Ewa', email: 'ewa@x.pl', eligible: ['uk'] }];
    h.fns['interp-session-get'] = ok({ can_manage: true, my_channels: [], session: null, module, team });
    const upserts = [];
    h.fns['interp-session-upsert'] = (body) => {
      upserts.push(body);
      return ok({ can_manage: true, my_channels: [], module, team,
        session: session({ public_url: `https://k.avenit.pl/tlumaczenie/${TOKEN}`, public_token: TOKEN }) });
    };
    h.fns['interp-stats'] = ok({ status: 'idle', channels: [{ id: 'c1', listeners: 4, status: 'idle' }], original: {} });
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /Włącz tłumaczenie na żywo/ }));
    expect(await screen.findByDisplayValue(`https://k.avenit.pl/tlumaczenie/${TOKEN}`)).toBeTruthy();
    expect(upserts[0]).toEqual({ event_id: '7', enable: true });
    expect(screen.getByRole('img', { name: /Kod QR/ }).innerHTML).toContain('<svg');
    expect(await screen.findByText(/4 słuchaczy/)).toBeTruthy();
    // Personel widzi Służbę, słuchacz — nazwę języka; bez wolnej listy języków i „Inny język”.
    expect(screen.getByText('Tłumacz EN')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Inny język/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Zarządzaj językami w module Tłumaczenia/ }).getAttribute('href')).toBe('/tlumaczenia?tab=roles');
    // Wybór tłumacza EN: tylko osoby uprawnione z zespołu (Ewa nie ma Służby EN).
    fireEvent.click(screen.getByRole('button', { name: /Dodaj tłumacza/ }));
    expect(screen.queryByRole('list', { name: /Wybierz tłumacza/ })).toBeNull(); // Ola już jest, Ewa bez Służby EN
    expect(screen.getByText(/Nikogo do wyboru/)).toBeTruthy();
    expect(screen.getByText(/Członkowie zespołu Tłumaczeń ze Służbą Tłumacz EN/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Anuluj/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tłumacz UK/ }));
    await waitFor(() => expect(upserts).toHaveLength(2));
    expect(upserts[1].channels.map((c) => c.lang_code)).toEqual(['en', 'uk']);
    expect(upserts[1].channels[0]).toEqual({ id: 'c1', lang_code: 'en', label: 'English', interpreters: ['ola@x.pl'] });
  });

  it('zarządzający: moduł bez języków — pusty stan z linkiem; kanał i osoba spoza modułu — ostrzeżenie', async () => {
    h.fns['interp-session-get'] = ok({ can_manage: true, my_channels: [], module: { available: true, languages: [], unmapped: ['Koordynator'] }, team: [],
      session: session({ public_url: `https://k.avenit.pl/tlumaczenie/${TOKEN}`, channels: [{ id: 'c1', lang_code: 'fr', label: 'Français', role_name: null, in_module: false, status: 'idle',
        interpreters: [{ email: 'obcy@x.pl', name: 'Obcy', source: 'manual', warning: 'not_in_team', absent: { manual: true } }] }] }) });
    h.fns['interp-stats'] = ok({ channels: [] });
    renderCard();
    expect(await screen.findByText(/Moduł Tłumaczenia nie ma jeszcze języków/)).toBeTruthy();
    expect(screen.getByText(/Spoza modułu Tłumaczenia/)).toBeTruthy();
    expect(screen.getByText(/spoza zespołu Tłumaczeń/)).toBeTruthy();
    expect(screen.getByText(/Służby bez kodu języka/).textContent).toContain('Koordynator');
    expect(screen.getByRole('button', { name: /Usuń tłumacza: Obcy/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Usuń kanał/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Dodaj tłumacza/ })).toBeNull();
  });

  it('tłumacz: wejście do konsoli; członek: tylko „Słuchaj”, bez linku', async () => {
    h.fns['interp-session-get'] = ok({ can_manage: false, my_channels: ['c1'], session: session({ channels: [{ ...session().channels[0], mine: true }] }) });
    h.fns['interp-stats'] = ok({ channels: [] });
    const a = renderCard();
    expect(await screen.findByText(/Twoje kanały: Tłumacz EN/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Otwórz konsolę tłumacza/ }).getAttribute('href')).toBe('/tlumaczenie/konsola/7');
    a.unmount();
    h.fns['interp-session-get'] = ok({ can_manage: false, my_channels: [], session: { ...session(), channels: [{ id: 'c1', lang_code: 'en', label: 'English', status: 'live' }] } });
    renderCard();
    expect(await screen.findByRole('link', { name: /Słuchaj tłumaczenia/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /konsolę/ })).toBeNull();
    expect(document.body.textContent).not.toContain('/tlumaczenie/A');
  });
});

describe('strona słuchacza', () => {
  const page = () => render(
    <MemoryRouter initialEntries={[`/tlumaczenie/${TOKEN}`]}>
      <Routes><Route path="/tlumaczenie/:token" element={<ListenerPage />} /></Routes>
    </MemoryRouter>,
  );

  it('języki i „Słuchaj”; kanał jeszcze nie nadaje → czekamy na tłumacza', async () => {
    h.fns['interp-public-info'] = ok({ church_name: 'Kościół Testowy', event: { title: 'Nabożeństwo', date: '2026-10-25', time: '10:00' }, status: 'idle',
      channels: [{ id: 'c1', lang_code: 'en', label: 'English', live: false }, { id: 'c2', lang_code: 'uk', label: 'Українська', live: true }] });
    h.fns['interp-listen'] = fail(409, 'CHANNEL_NOT_LIVE');
    page();
    expect(await screen.findByText('Nabożeństwo')).toBeTruthy();
    expect(screen.getByText('Kościół Testowy')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/English/));
    fireEvent.click(screen.getByRole('button', { name: /Słuchaj/ }));
    expect(await screen.findByText(/Czekamy na tłumacza/)).toBeTruthy();
    const call = supabase.functions.invoke.mock.calls.find(([n]) => n === 'interp-listen');
    expect(call[1].body).toEqual({ token: TOKEN, channel_id: 'c1' });
  });

  it('nieznany link i zakończone tłumaczenie', async () => {
    h.fns['interp-public-info'] = fail(404, 'INTERP_NOT_FOUND');
    const a = page();
    expect(await screen.findByText(/Nie znaleziono tłumaczenia/)).toBeTruthy();
    a.unmount();
    h.fns['interp-public-info'] = ok({ church_name: '', event: { title: 'X' }, status: 'ended', channels: [] });
    page();
    expect(await screen.findByText(/Tłumaczenie zakończone/)).toBeTruthy();
  });
});
