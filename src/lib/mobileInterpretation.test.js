// Tłumaczenie na żywo w mobilce: kody błędów → stany ekranu, wybór języka, odpytywanie,
// blokada wygaszania ekranu i rozpoznawanie linków /tlumaczenie/… (czysta logika, bez RN).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  retryDelay, interpErrorState, fatalFromError, infoFromSession, defaultChannel, pollDecision, pollInterval,
  shouldKeepAwake, shouldRunPlaybackService, playbackNotification, screenHint, phaseView, cardSummary, cardDataFromSession, cardTeamSections, interpretationTargetFromPath, interpretationTargetFromUrl, isPublicToken,
  INFO_POLL_MS, INFO_POLL_LISTENING_MS, PERSON_NOTE, warningNote,
  appDomainFromApiUrl, tenantFromHost, appLinkFromUrl, appRouteForLink, browserOnlyUrl, tenantWebUrl,
} from '../../packages/mobile/src/features/interpretation/logic';
import { createHybridTimers, HYBRID_ID_BASE } from '../../packages/mobile/src/features/interpretation/bgTimers';
import { redirectSystemPath } from '../../packages/mobile/app/+native-intent';
import mobileConfig from '../../packages/mobile/app.config';
import { appleAppSiteAssociation, assetLinks, IOS_BUNDLE_IDS, APPLE_TEAM_ID, ANDROID_PACKAGE } from '../../packages/api/src/public/app-links.js';

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
  it('Android z usługą słuchania: ekran może zgasnąć, usługa od „Słuchaj” do końca', () => {
    expect(shouldKeepAwake('android', 'listening', true)).toBe(false);
    expect(shouldKeepAwake('android', 'waiting', true)).toBe(false);
    expect(shouldKeepAwake('android', 'listening', false)).toBe(true);
    // iOS bez zmian — usługa to tylko Android.
    expect(shouldKeepAwake('ios', 'waiting', true)).toBe(true);
    for (const p of ['waiting', 'connecting', 'listening', 'reconnecting']) {
      expect(shouldRunPlaybackService('android', p, true)).toBe(true);
    }
    expect(shouldRunPlaybackService('android', 'idle', true)).toBe(false);
    expect(shouldRunPlaybackService('android', 'listening', false)).toBe(false); // stary build 1.1.0
    expect(shouldRunPlaybackService('ios', 'listening', true)).toBe(false);
  });
  it('powiadomienie usługi', () => {
    const ch = { id: 'a', lang_code: 'en', label: 'English', live: true };
    expect(playbackNotification('listening', { channel: ch, eventTitle: 'Nabożeństwo' })).toEqual({
      title: 'Słuchasz tłumaczenia — English',
      text: 'Nabożeństwo',
    });
    expect(playbackNotification('listening', { channel: ch })).toEqual({ title: 'Słuchasz tłumaczenia — English', text: '' });
    expect(playbackNotification('listening', { channel: { ...ch, live: false } }).text).toBe('Tłumacz ma przerwę');
    expect(playbackNotification('waiting', { channel: ch })).toEqual({ title: 'Tłumaczenie na żywo — English', text: 'Czekamy na tłumacza…' });
    expect(playbackNotification('reconnecting', { channel: ch, online: false }).text).toBe('Brak internetu');
    expect(playbackNotification('connecting').title).toBe('Tłumaczenie na żywo');
  });
  it('podpowiedź o ekranie', () => {
    expect(screenHint('android', false)).toMatch(/nie wyłączaj ekranu/);
    expect(screenHint('android', true)).toMatch(/Możesz wyłączyć ekran/);
    expect(screenHint('ios', false)).toMatch(/zablokować ekran/);
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
    expect(interpretationTargetFromPath('/tlumaczenie/konsola/42')).toEqual({ kind: 'console', eventId: '42' });
    expect(interpretationTargetFromPath('/tlumaczenie/konsola/a%20b/')).toEqual({ kind: 'console', eventId: 'a b' });
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
  it('avenit:// → publiczne ekrany /listen; inne linki bez zmian', () => {
    expect(redirectSystemPath({ path: `avenit://tlumaczenie/${TOKEN}`, initial: true })).toBe(`/listen/${TOKEN}`);
    expect(redirectSystemPath({ path: `avenit://tlumaczenie/${TOKEN}?tenant=SchWro`, initial: true })).toBe(`/listen/${TOKEN}?tenant=schwro`);
    expect(redirectSystemPath({ path: 'avenit://tlumaczenie/sluchaj/42', initial: false })).toBe('/listen/event/42');
    expect(redirectSystemPath({ path: '/tlumaczenie/sluchaj/42', initial: false })).toBe('/listen/event/42');
    expect(redirectSystemPath({ path: 'schtomy://tlumaczenie/sluchaj/42', initial: false })).toBe('/listen/event/42');
    expect(redirectSystemPath({ path: 'avenit://program/12', initial: true })).toBe('avenit://program/12');
    // Konsola tłumacza — w aplikacji (bramka /listen/console: logowanie / kościół z linku).
    expect(redirectSystemPath({ path: 'avenit://tlumaczenie/konsola/42', initial: true })).toBe('/listen/console/42');
    expect(redirectSystemPath({ path: 'avenit://tlumaczenie/konsola/42?tenant=SchWro', initial: true })).toBe('/listen/console/42?tenant=schwro');
    expect(redirectSystemPath({ path: 'avenit://tlumaczenie/oryginal/42', initial: true })).toBe('/listen/web?path=%2Ftlumaczenie%2Foryginal%2F42');
    expect(redirectSystemPath({ path: 'avenit://tlumaczenie/krotki', initial: true })).toBe('avenit://tlumaczenie/krotki');
  });
});

describe('Universal Links / App Links (kod QR otwiera aplikację)', () => {
  const D = 'avenit.pl';
  it('domena z adresu API i kościół z hosta', () => {
    expect(appDomainFromApiUrl('https://api.avenit.pl')).toBe('avenit.pl');
    expect(appDomainFromApiUrl('https://api.avenit.pl/')).toBe('avenit.pl');
    expect(appDomainFromApiUrl(undefined)).toBe('avenit.pl');
    expect(tenantFromHost('schwro.avenit.pl', D)).toBe('schwro');
    expect(tenantFromHost('SchWro.Avenit.pl:443', D)).toBe('schwro');
    for (const h of ['avenit.pl', 'api.avenit.pl', 'app.avenit.pl', 'admin.avenit.pl', 'www.avenit.pl', 'rtc.avenit.pl', 'a.b.avenit.pl', 'schwro.evil.pl', 'avenit.pl.evil.pl', '']) {
      expect(tenantFromHost(h, D)).toBeNull();
    }
  });
  it('https z hosta kościoła → trasa z kościołem z linku', () => {
    const r = (url) => redirectSystemPath({ path: url, initial: true });
    expect(r(`https://schwro.avenit.pl/tlumaczenie/${TOKEN}`)).toBe(`/listen/${TOKEN}?tenant=schwro`);
    expect(r(`https://schwro.avenit.pl/tlumaczenie/${TOKEN}?utm_source=qr`)).toBe(`/listen/${TOKEN}?tenant=schwro`);
    expect(r(`https://Inny-Kosciol.avenit.pl/tlumaczenie/${TOKEN}`)).toBe(`/listen/${TOKEN}?tenant=inny-kosciol`);
    expect(r('https://schwro.avenit.pl/tlumaczenie/sluchaj/42')).toBe('/listen/event/42?tenant=schwro');
    expect(r('https://schwro.avenit.pl/tlumaczenie/konsola/42')).toBe('/listen/web?path=%2Ftlumaczenie%2Fkonsola%2F42&tenant=schwro');
    expect(r('https://schwro.avenit.pl/tlumaczenie/oryginal/42')).toBe('/listen/web?path=%2Ftlumaczenie%2Foryginal%2F42&tenant=schwro');
    // Bez kościoła w hoście (domena główna) — kościół z sesji.
    expect(r(`https://avenit.pl/tlumaczenie/${TOKEN}`)).toBe(`/listen/${TOKEN}`);
    // Obce hosty i inne ścieżki — bez zmian.
    expect(r(`https://evil.pl/tlumaczenie/${TOKEN}`)).toBe(`https://evil.pl/tlumaczenie/${TOKEN}`);
    expect(r(`https://avenit.pl.evil.pl/tlumaczenie/${TOKEN}`)).toBe(`https://avenit.pl.evil.pl/tlumaczenie/${TOKEN}`);
    expect(r('https://schwro.avenit.pl/wydarzenie/42')).toBe('https://schwro.avenit.pl/wydarzenie/42');
    expect(r('https://schwro.avenit.pl/tlumaczenie/krotki')).toBe('https://schwro.avenit.pl/tlumaczenie/krotki');
  });
  it('appLinkFromUrl / appRouteForLink', () => {
    expect(appLinkFromUrl(`https://schwro.avenit.pl/tlumaczenie/${TOKEN}`, D)).toEqual({ target: { kind: 'token', token: TOKEN }, tenant: 'schwro' });
    expect(appLinkFromUrl(`avenit://tlumaczenie/${TOKEN}?tenant=../x`, D)).toEqual({ target: { kind: 'token', token: TOKEN }, tenant: null });
    expect(appLinkFromUrl('', D)).toBeNull();
    expect(appLinkFromUrl(null, D)).toBeNull();
    expect(appRouteForLink({ target: { kind: 'event', eventId: 'a b' }, tenant: null })).toBe('/listen/event/a%20b');
  });
  it('adresy „tylko przeglądarka” nie wracają do aplikacji', () => {
    const base = 'https://schwro.avenit.pl';
    expect(browserOnlyUrl(base, { kind: 'token', token: TOKEN })).toBe(`${base}/tlumaczenie/${TOKEN}/`);
    expect(browserOnlyUrl(`${base}/`, { kind: 'event', eventId: '42' })).toBe(`${base}/login?next=%2Ftlumaczenie%2Fsluchaj%2F42`);
    expect(browserOnlyUrl('', { kind: 'event', eventId: '42' })).toBe('/login?next=%2Ftlumaczenie%2Fsluchaj%2F42');
    expect(browserOnlyUrl(base, { kind: 'web', path: '/tlumaczenie/konsola/42' })).toBe(`${base}/tlumaczenie/konsola/42`);
    expect(browserOnlyUrl(base, { kind: 'console', eventId: '42' })).toBe(`${base}/tlumaczenie/konsola/42`);
    expect(appRouteForLink({ target: { kind: 'console', eventId: '7' }, tenant: 'schwro' })).toBe('/listen/console/7?tenant=schwro');
    expect(tenantWebUrl('inny', D, base)).toBe('https://inny.avenit.pl');
    expect(tenantWebUrl(null, D, base)).toBe(base);
  });

  // Ten sam zakres w trzech miejscach: AASA (API), intent-filter (app.config.ts) i aplikacja.
  // Dopasowanie jak w systemach: Android PatternMatcher (SIMPLE_GLOB: „.” dowolny znak, „*” powtórzenie
  // poprzedniego), pathPrefix; Apple components („*” dowolny ciąg, „?” jeden znak, pierwszy pasujący wygrywa).
  const globRe = (p) => new RegExp(`^${p.split('').map((c) => (c === '.' || c === '*' ? c : c.replace(/[\\^$+?()[\]{}|/]/g, '\\$&'))).join('')}$`);
  const androidOpens = (host, path) => {
    const f = mobileConfig.android.intentFilters?.[0];
    if (!f?.autoVerify) return false;
    return f.data.some((d) => {
      const hostOk = d.host.startsWith('*.') ? host.endsWith(d.host.slice(1)) : host === d.host;
      if (d.scheme !== 'https' || !hostOk) return false;
      if (d.pathPrefix) return path.startsWith(d.pathPrefix);
      if (d.pathPattern) return globRe(d.pathPattern).test(path);
      return false;
    });
  };
  const aasaRe = (p) => new RegExp(`^${p.split('').map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.\\^$+()[\]{}|/]/g, '\\$&'))).join('')}$`);
  const iosOpens = (path) => {
    for (const c of appleAppSiteAssociation().applinks.details[0].components) {
      if (aasaRe(c['/']).test(path)) return !c.exclude;
    }
    return false;
  };
  const cases = [
    [`/tlumaczenie/${TOKEN}`, true],
    ['/tlumaczenie/sluchaj/42', true],
    ['/tlumaczenie/konsola/42', false],
    ['/tlumaczenie/oryginal/42', false],
    [`/tlumaczenie/${TOKEN}/`, false],
    ['/login', false],
    ['/wydarzenie/42', false],
    ['/tlumaczenie/krotki', false],
  ];
  it.each(cases)('%s → aplikacja: %s (iOS i Android zgodnie)', (path, app) => {
    expect(iosOpens(path)).toBe(app);
    expect(androidOpens('schwro.avenit.pl', path)).toBe(app);
    expect(androidOpens('avenit.pl', path)).toBe(app);
    expect(androidOpens('evil.pl', path)).toBe(false);
    // Aplikacja rozpoznaje każdy link, który system jej odda.
    if (app) expect(redirectSystemPath({ path: `https://schwro.avenit.pl${path}`, initial: true })).toMatch(/^\/listen\//);
  });
  it('wpisy aplikacji zgodne z plikami weryfikacyjnymi', () => {
    expect(mobileConfig.ios.associatedDomains).toEqual(['applinks:*.avenit.pl', 'applinks:avenit.pl']);
    expect(IOS_BUNDLE_IDS).toContain(mobileConfig.ios.bundleIdentifier);
    expect(appleAppSiteAssociation().applinks.details[0].appIDs).toContain(`${APPLE_TEAM_ID}.${mobileConfig.ios.bundleIdentifier}`);
    expect(mobileConfig.android.package).toBe(ANDROID_PACKAGE);
    expect(assetLinks()[0].target.package_name).toBe(mobileConfig.android.package);
    expect(mobileConfig.version).toBe('1.2.0');
  });
});

// Timery hybrydowe: RN na Androidzie wstrzymuje setTimeout w tle — tick() z usługi odpala zaległe.
describe('timery w tle (bgTimers)', () => {
  const makeHost = () => {
    let now = 1000;
    let seq = 0;
    const native = new Map(); // zwykłe timery RN (w tle stoją — odpalamy ręcznie)
    return {
      host: {
        setTimeout: (fn, ms) => { const id = ++seq; native.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: (id) => { native.delete(id); },
        now: () => now,
      },
      advance: (ms) => { now += ms; },
      // Ekran włączony: RN odpala swoje zaległe timery.
      runNative: () => { for (const [id, t] of [...native]) if (t.at <= now) { native.delete(id); t.fn(); } },
      nativeCount: () => native.size,
    };
  };

  it('timeout odpala tick (ekran zgaszony) — raz, a timer RN zostaje wyczyszczony', () => {
    const h = makeHost();
    const T = createHybridTimers(h.host);
    const calls = [];
    const id = T.setTimeout((x) => calls.push(x), 5000, 'a');
    expect(id).toBeGreaterThan(HYBRID_ID_BASE);
    h.advance(4000);
    T.tick();
    expect(calls).toEqual([]);
    h.advance(1000);
    T.tick();
    expect(calls).toEqual(['a']);
    expect(h.nativeCount()).toBe(0);
    h.runNative();
    T.tick();
    expect(calls).toEqual(['a']);
    expect(T.size()).toBe(0);
  });

  it('na wierzchu działa zwykły timer RN; tick już go nie powtórzy', () => {
    const h = makeHost();
    const T = createHybridTimers(h.host);
    let n = 0;
    T.setTimeout(() => n++, 100);
    h.advance(100);
    h.runNative();
    T.tick();
    expect(n).toBe(1);
  });

  it('interval po długiej przerwie odpala raz i liczy od nowa (bez nadrabiania)', () => {
    const h = makeHost();
    const T = createHybridTimers(h.host);
    let n = 0;
    const id = T.setInterval(() => n++, 5000);
    h.advance(60_000);
    T.tick();
    expect(n).toBe(1);
    h.advance(4999);
    T.tick();
    expect(n).toBe(1);
    h.advance(1);
    T.tick();
    expect(n).toBe(2);
    T.clearInterval(id);
    h.advance(10_000);
    T.tick();
    h.runNative();
    expect(n).toBe(2);
    expect(T.size()).toBe(0);
  });

  it('clear w trakcie i obce identyfikatory', () => {
    const h = makeHost();
    const T = createHybridTimers(h.host);
    const order = [];
    const b = T.setTimeout(() => order.push('b'), 20);
    T.setTimeout(() => { order.push('a'); T.clearTimeout(b); }, 10);
    h.advance(30);
    T.tick();
    expect(order).toEqual(['a']);
    // Timer RN sprzed podmiany — clear trafia do RN.
    const foreign = h.host.setTimeout(() => order.push('x'), 1);
    T.clearTimeout(foreign);
    h.advance(5);
    h.runNative();
    expect(order).toEqual(['a']);
  });

  it('błąd jednego callbacku nie blokuje pozostałych', () => {
    const h = makeHost();
    const T = createHybridTimers(h.host);
    let ok = false;
    T.setTimeout(() => { throw new Error('boom'); }, 1);
    T.setTimeout(() => { ok = true; }, 2);
    h.advance(5);
    expect(() => T.tick()).toThrow('boom');
    expect(ok).toBe(true);
  });
});

// Moduł lokalny usługi słuchania (autolinking Expo z packages/mobile/modules).
describe('moduł interpretation-playback (Android)', () => {
  // Ścieżki od katalogu repo (vitest startuje w korzeniu; środowisko jsdom nie ma file:// w import.meta.url).
  const dir = join(process.cwd(), 'packages/mobile/modules/interpretation-playback');
  const read = (p) => readFileSync(join(dir, p), 'utf8');

  it('konfiguracja modułu wskazuje istniejącą klasę Kotlin', () => {
    const cfg = JSON.parse(read('expo-module.config.json'));
    expect(cfg.platforms).toEqual(['android']);
    const [cls] = cfg.android.modules;
    const pkg = cls.split('.').slice(0, -1).join('.');
    const name = cls.split('.').pop();
    const kt = read(`android/src/main/java/${pkg.replace(/\./g, '/')}/${name}.kt`);
    expect(kt).toContain(`package ${pkg}`);
    expect(kt).toContain(`class ${name} : Module()`);
    expect(kt).toContain('Name("AvenitInterpretationPlayback")');
    expect(read('index.ts')).toContain("'AvenitInterpretationPlayback'");
    expect(read('android/build.gradle')).toContain(`namespace "${pkg}"`);
  });

  it('manifest: usługa mediaPlayback + uprawnienia', () => {
    const m = read('android/src/main/AndroidManifest.xml');
    for (const perm of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'WAKE_LOCK', 'POST_NOTIFICATIONS']) {
      expect(m).toContain(`android.permission.${perm}"`);
    }
    expect(m).toMatch(/<service[^>]*InterpretationPlaybackService"[^>]*android:foregroundServiceType="mediaPlayback"/s);
    expect(m).toMatch(/android:exported="false"/);
  });

  it('runtime OTA wspólny z 1.1.0 (moduł opcjonalny w JS)', () => {
    expect(mobileConfig.runtimeVersion).toBe('1.1.0');
    expect(read('index.ts')).toContain('requireOptionalNativeModule');
  });
});
