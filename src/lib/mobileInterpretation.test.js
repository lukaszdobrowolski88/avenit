// Tłumaczenie na żywo w mobilce: kody błędów → stany ekranu, wybór języka, odpytywanie,
// blokada wygaszania ekranu i rozpoznawanie linków /tlumaczenie/… (czysta logika, bez RN).
import { describe, expect, it } from 'vitest';
import {
  retryDelay, interpErrorState, fatalFromError, infoFromSession, defaultChannel, pollDecision, pollInterval,
  shouldKeepAwake, phaseView, cardSummary, cardDataFromSession, cardTeamSections, interpretationTargetFromPath, interpretationTargetFromUrl, isPublicToken,
  INFO_POLL_MS, INFO_POLL_LISTENING_MS, PERSON_NOTE, warningNote,
} from '../../packages/mobile/src/features/interpretation/logic';
import { redirectSystemPath } from '../../packages/mobile/app/+native-intent';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'; // 32 znaki base64url
const err = (status, code) => ({ message: 'x', status, context: code ? { error: 'x', code } : null });

describe('błędy API → stan', () => {
  it('kody serwera', () => {
    expect(interpErrorState(err(409, 'CHANNEL_NOT_LIVE'))).toBe('not_live');
    expect(interpErrorState(err(410, 'INTERP_ENDED'))).toBe('ended');
    expect(interpErrorState(err(503, 'calls_disabled'))).toBe('disabled');
    expect(interpErrorState(err(404, 'CHANNEL_NOT_FOUND'))).toBe('not_found');
    expect(interpErrorState(err(410, 'INTERP_UNAVAILABLE'))).toBe('unavailable');
    expect(interpErrorState({ status: 404, code: 'INTERP_NOT_FOUND' })).toBe('not_found');
  });
  it('same statusy i sieć', () => {
    expect(interpErrorState(err(403))).toBe('forbidden');
    expect(interpErrorState(err(410))).toBe('ended');
    expect(interpErrorState(err(429))).toBe('busy');
    expect(interpErrorState(new Error('Network request failed'))).toBe('error');
    expect(interpErrorState(null)).toBe('error');
  });
  it('błędy kończące słuchanie (bez ponawiania)', () => {
    expect(fatalFromError('ended')).toBe('ended');
    expect(fatalFromError('forbidden')).toBe('not_found');
    expect(fatalFromError('disabled')).toBe('disabled');
    expect(fatalFromError('not_live')).toBeNull();
    expect(fatalFromError('error')).toBeNull();
    expect(fatalFromError('busy')).toBeNull();
  });
  it('ponawianie: 1,5 s → 3 s → 6 s → 12 s → 15 s', () => {
    expect([0, 1, 2, 3, 4, 9].map(retryDelay)).toEqual([1500, 3000, 6000, 12000, 15000, 15000]);
    expect(retryDelay(-1)).toBe(1500);
  });
});

describe('dane słuchacza z interp-session-get', () => {
  const r = {
    event: { id: 7, title: 'Nabożeństwo', date: '2026-10-25', time: '10:00:00' },
    session: { status: 'live', channels: [{ id: 'a', lang_code: 'en', label: 'English', status: 'live' }, { id: 'b', lang_code: 'uk', label: 'Українська', status: 'idle' }] },
  };
  it('kanały z flagą live', () => {
    const info = infoFromSession(r);
    expect(info.status).toBe('live');
    expect(info.event.title).toBe('Nabożeństwo');
    expect(info.channels).toEqual([
      { id: 'a', lang_code: 'en', label: 'English', live: true },
      { id: 'b', lang_code: 'uk', label: 'Українська', live: false },
    ]);
  });
  it('brak sesji → null; zakończona → bez kanałów', () => {
    expect(infoFromSession({ event: r.event, session: null })).toBeNull();
    expect(infoFromSession({ session: { ...r.session, status: 'ended' } }).channels).toEqual([]);
  });
  it('karta wydarzenia', () => {
    expect(cardSummary(r)).toEqual({ show: true, languages: ['English', 'Українська'], live: ['English'] });
    expect(cardSummary({ session: null }).show).toBe(false);
    expect(cardSummary({ session: { status: 'ended', channels: r.session.channels } }).show).toBe(false);
    expect(cardSummary({ session: { status: 'idle', channels: [] } }).show).toBe(false);
    expect(cardSummary(null).show).toBe(false);
  });
});

describe('tłumacze na karcie wydarzenia', () => {
  const channels = [
    { id: 'a', lang_code: 'en', label: 'English', status: 'live' },
    { id: 'b', lang_code: 'uk', label: 'Українська', status: 'idle' },
  ];
  const manager = {
    can_manage: true,
    my_channels: [],
    session: {
      status: 'live', public_token: 'x'.repeat(32), public_url: 'https://x/tlumaczenie/x',
      channels: [
        { ...channels[0], role_name: 'Tłumacz EN', interpreters: [{ email: 'anna@x.pl', name: 'Anna', source: 'manual', warning: 'not_in_team', absent: { manual: true } }, { email: 'jan@x.pl', name: 'Jan', source: 'schedule', warning: null }] },
        { ...channels[1], role_name: 'Tłumacz UK', interpreters: [] },
      ],
    },
    schedule: {
      pending: [{ lang_code: 'uk', label: 'Українська', role_name: 'Tłumacz UK', name: 'Olha', state: 'draft' }],
      no_account: [{ lang_code: 'en', label: 'English', name: 'Piotr' }, { lang_code: 'ru', label: 'Русский', role_name: 'Tłumacz RU', name: 'Igor', state: 'no_account' }],
    },
  };
  it('słuchacz: bez osób i bez sekcji', () => {
    const d = cardDataFromSession({ my_channels: [], session: { status: 'live', channels }, schedule: { pending: [{ lang_code: 'en', label: 'English', name: 'X' }] } });
    expect(d.session.channels[0]).toEqual(channels[0]);
    expect(d.schedule).toBeUndefined();
    expect(cardTeamSections(d)).toBeNull();
  });
  it('zarządzający: imiona i źródło, bez e-maili i linku', () => {
    const d = cardDataFromSession(manager);
    expect(JSON.stringify(d)).not.toMatch(/@|public_/);
    expect(d.session.channels[0].interpreters).toEqual([{ name: 'Anna', source: 'manual', warning: 'not_in_team', absent: true }, { name: 'Jan', source: 'schedule' }]);
    // Nagłówki jak w module (Służba), stany jak w legendzie Grafiku.
    expect(cardTeamSections(d)).toEqual([
      { key: 'a', label: 'Tłumacz EN', people: [{ name: 'Anna', state: 'manual', warning: 'not_in_team', absent: true }, { name: 'Jan', state: 'schedule' }, { name: 'Piotr', state: 'no_account' }] },
      { key: 'b', label: 'Tłumacz UK', people: [{ name: 'Olha', state: 'draft' }] },
      { key: 'lang:ru', label: 'Tłumacz RU', people: [{ name: 'Igor', state: 'no_account' }] },
    ]);
    expect(PERSON_NOTE.pending).toBe('czeka na odpowiedź');
    expect(warningNote('no_role', 'Tłumacz EN')).toBe('bez Służby Tłumacz EN');
  });
  it('starszy serwer: bez source (= ręcznie) i bez schedule', () => {
    const d = cardDataFromSession({ my_channels: ['a'], session: { status: 'idle', channels: [{ ...channels[0], interpreters: [{ email: 'anna@x.pl', name: '' }] }] } });
    expect(d.schedule).toBeUndefined();
    expect(cardTeamSections(d)).toEqual([{ key: 'a', label: 'English', people: [{ name: 'anna@x.pl', state: 'manual' }] }]);
    expect(cardTeamSections(null)).toBeNull();
    expect(cardDataFromSession(null)).toEqual({ my_channels: [], session: null });
  });
});

describe('domyślny język', () => {
  const ch = [{ id: 'a', lang_code: 'en' }, { id: 'b', lang_code: 'uk' }];
  it('zapamiętany > język telefonu > jedyny kanał', () => {
    expect(defaultChannel(ch, { remembered: 'b', languages: ['en-US'] })).toBe('b');
    expect(defaultChannel(ch, { remembered: 'zz', languages: ['uk-UA', 'pl'] })).toBe('b');
    expect(defaultChannel(ch, { languages: ['en_GB'] })).toBe('a');
    expect(defaultChannel(ch, { languages: ['pl-PL'] })).toBeNull();
    expect(defaultChannel([{ id: 'x', lang_code: 'de' }], { languages: ['pl'] })).toBe('x');
    expect(defaultChannel([], {})).toBeNull();
  });
});

describe('odpytywanie i łączenie', () => {
  const info = (live, status = 'live') => ({ church_name: '', event: null, status, channels: [{ id: 'a', lang_code: 'en', label: 'English', live }] });
  it('czekamy, a kanał ruszył → łącz', () => {
    expect(pollDecision('waiting', info(true), 'a')).toBe('connect');
    expect(pollDecision('waiting', info(false), 'a')).toBe('none');
    expect(pollDecision('listening', info(true), 'a')).toBe('none');
    expect(pollDecision('waiting', info(true), null)).toBe('none');
    expect(pollDecision('waiting', info(true, 'ended'), 'a')).toBe('ended');
    expect(pollDecision('waiting', null, 'a')).toBe('none');
  });
  it('odstępy', () => {
    expect(pollInterval('waiting', null)).toBe(INFO_POLL_MS);
    expect(pollInterval('idle', null)).toBe(INFO_POLL_MS);
    expect(pollInterval('listening', null)).toBe(INFO_POLL_LISTENING_MS);
    expect(pollInterval('listening', 'ended')).toBeNull();
  });
  it('ekran nie gaśnie: Android zawsze w trakcie, iOS tylko do czasu, aż gra', () => {
    expect(shouldKeepAwake('android', 'listening')).toBe(true);
    expect(shouldKeepAwake('android', 'idle')).toBe(false);
    expect(shouldKeepAwake('ios', 'listening')).toBe(false);
    expect(shouldKeepAwake('ios', 'waiting')).toBe(true);
    expect(shouldKeepAwake('ios', 'idle')).toBe(false);
  });
  it('opis stanu', () => {
    const ch = { id: 'a', lang_code: 'en', label: 'English', live: true };
    expect(phaseView('listening', { channel: ch }).title).toBe('Słuchasz: English');
    expect(phaseView('listening', { channel: { ...ch, live: false } }).title).toBe('Tłumacz ma przerwę');
    expect(phaseView('waiting').title).toBe('Czekamy na tłumacza…');
    expect(phaseView('reconnecting', { online: false }).title).toBe('Brak internetu');
    expect(phaseView('idle')).toBeNull();
  });
});

describe('linki /tlumaczenie/…', () => {
  it('ścieżki weba', () => {
    expect(isPublicToken(TOKEN)).toBe(true);
    expect(interpretationTargetFromPath(`/tlumaczenie/${TOKEN}`)).toEqual({ kind: 'token', token: TOKEN });
    expect(interpretationTargetFromPath(`tlumaczenie/${TOKEN}/?utm=qr`)).toEqual({ kind: 'token', token: TOKEN });
    expect(interpretationTargetFromPath('/tlumaczenie/sluchaj/42')).toEqual({ kind: 'event', eventId: '42' });
    expect(interpretationTargetFromPath('/tlumaczenie/konsola/42')).toEqual({ kind: 'web', path: '/tlumaczenie/konsola/42' });
    expect(interpretationTargetFromPath('/tlumaczenie/oryginal/42')).toEqual({ kind: 'web', path: '/tlumaczenie/oryginal/42' });
    expect(interpretationTargetFromPath('/tlumaczenie/krotki')).toBeNull();
    expect(interpretationTargetFromPath('/wydarzenie/42')).toBeNull();
    expect(interpretationTargetFromPath(null)).toBeNull();
  });
  it('pełny adres tylko z weba tego kościoła', () => {
    const own = 'https://schwro.avenit.pl';
    expect(interpretationTargetFromUrl(`https://schwro.avenit.pl/tlumaczenie/${TOKEN}`, own)).toEqual({ kind: 'token', token: TOKEN });
    expect(interpretationTargetFromUrl(`https://SCHWRO.avenit.pl/tlumaczenie/sluchaj/9`, own)).toEqual({ kind: 'event', eventId: '9' });
    expect(interpretationTargetFromUrl(`https://inny.avenit.pl/tlumaczenie/${TOKEN}`, own)).toBeNull();
    expect(interpretationTargetFromUrl(`https://schwro.avenit.pl/tlumaczenie/${TOKEN}`, '')).toBeNull();
    expect(interpretationTargetFromUrl('/tlumaczenie/sluchaj/9', own)).toEqual({ kind: 'event', eventId: '9' });
    expect(interpretationTargetFromUrl('tlumaczenie/sluchaj/9', own)).toBeNull();
  });
  it('avenit:// → ekran słuchacza; inne linki bez zmian', () => {
    expect(redirectSystemPath({ path: `avenit://tlumaczenie/${TOKEN}`, initial: true })).toBe(`/interpretation/link/${TOKEN}`);
    expect(redirectSystemPath({ path: 'avenit://tlumaczenie/sluchaj/42', initial: false })).toBe('/interpretation/42');
    expect(redirectSystemPath({ path: '/tlumaczenie/sluchaj/42', initial: false })).toBe('/interpretation/42');
    expect(redirectSystemPath({ path: 'avenit://program/12', initial: true })).toBe('avenit://program/12');
    expect(redirectSystemPath({ path: 'avenit://tlumaczenie/konsola/42', initial: true })).toBe('avenit://tlumaczenie/konsola/42');
  });
});
