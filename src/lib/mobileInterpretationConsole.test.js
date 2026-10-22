// Konsola tłumacza w mobilce: stan mikrofonu, przycisk główny, przejęcie, błędy, poziom wejścia,
// słuchawki, powiadomienie usługi w tle i podpowiedzi (czysta logika, bez RN).
import { describe, expect, it } from 'vitest';
import {
  airBadge, canTakeOver, consoleChannels, consoleErrorFrom, consoleErrorMessage, consoleKeepAwake, consoleNotification,
  consoleScreenHint, consoleServiceSupported, defaultConsoleChannel, headphonesConnected, holderName, isConnected,
  levelFromRms, listenersText, meterTone, micShouldBeOpen, micState, nearestVolumeStep, originalStatusText, parseRoomMeta,
  primaryAction, rejoinDecision, sessionStatusLabel, shouldRunConsoleService, showHeadphonesBanner, staffLabel, stateMessage,
  STATS_POLL_MS, VOLUME_STEPS,
} from '../../packages/mobile/src/features/interpretation/consoleLogic';
import { cardDataFromSession } from '../../packages/mobile/src/features/interpretation/logic';

const err = (status, code) => ({ message: 'x', status, code, context: code ? { error: 'x', code } : null });
const ch = (id, extra = {}) => ({ id, lang_code: id, label: id.toUpperCase(), status: 'idle', ...extra });

describe('kanały konsoli', () => {
  const view = {
    my_channels: ['en'],
    can_manage: false,
    session: { status: 'live', channels: [ch('en', { role_name: 'Tłumacz EN', mine: true }), ch('uk')] },
  };
  it('tłumacz widzi swoje, zarządzający wszystkie, zakończone — nic', () => {
    expect(consoleChannels(view).map((c) => c.id)).toEqual(['en']);
    expect(consoleChannels({ ...view, my_channels: [], session: { ...view.session, channels: [ch('en'), ch('uk')] } })).toEqual([]);
    expect(consoleChannels({ ...view, can_manage: true }).map((c) => c.id)).toEqual(['en', 'uk']);
    expect(consoleChannels({ ...view, session: { ...view.session, status: 'ended' } })).toEqual([]);
    expect(consoleChannels(null)).toEqual([]);
  });
  it('domyślny kanał: zapamiętany → mój → pierwszy', () => {
    const list = [ch('uk'), ch('en')];
    expect(defaultConsoleChannel(list, { remembered: 'uk', myChannels: ['en'] })).toBe('uk');
    expect(defaultConsoleChannel(list, { remembered: 'de', myChannels: ['en'] })).toBe('en');
    expect(defaultConsoleChannel(list)).toBe('uk');
    expect(defaultConsoleChannel([])).toBeNull();
  });
  it('nazwa dla personelu', () => {
    expect(staffLabel({ role_name: 'Tłumacz EN', label: 'English' })).toBe('Tłumacz EN');
    expect(staffLabel({ label: 'English' })).toBe('English');
    expect(staffLabel({ lang_code: 'de' })).toBe('DE');
  });
});

describe('stan mikrofonu (metadane pokoju)', () => {
  it('parseRoomMeta', () => {
    expect(parseRoomMeta('{"active":"Ala@X.pl"}')).toEqual({ active: 'ala@x.pl' });
    expect(parseRoomMeta('{"active":null}')).toEqual({ active: null });
    expect(parseRoomMeta('zepsute')).toEqual({ active: null });
    expect(parseRoomMeta({ active: 'b@x.pl' })).toEqual({ active: 'b@x.pl' });
    expect(parseRoomMeta(undefined)).toEqual({ active: null });
  });
  it('micState', () => {
    expect(micState({ me: 'a@x.pl', active: null })).toBe('free');
    expect(micState({ me: 'a@x.pl', active: 'A@x.pl' })).toBe('on_air');
    expect(micState({ me: 'a@x.pl', active: 'a@x.pl', selfMuted: true })).toBe('muted');
    expect(micState({ me: 'a@x.pl', active: 'b@x.pl' })).toBe('locked');
    expect(micState({ me: null, active: 'b@x.pl' })).toBe('locked');
  });
  it('mikrofon otwarty tylko u aktywnego, na kanale, bez wyciszenia', () => {
    const base = { me: 'a@x.pl', active: 'a@x.pl', selfMuted: false };
    expect(micShouldBeOpen({ ...base, phase: 'on' })).toBe(true);
    expect(micShouldBeOpen({ ...base, phase: 'reconnecting' })).toBe(false);
    expect(micShouldBeOpen({ ...base, phase: 'on', selfMuted: true })).toBe(false);
    expect(micShouldBeOpen({ ...base, phase: 'on', active: 'b@x.pl' })).toBe(false);
    expect(micShouldBeOpen({ ...base, phase: 'on', active: null })).toBe(false);
  });
  it('kto tłumaczy', () => {
    const channel = { interpreters: [{ email: 'b@x.pl', name: 'Basia' }], active_interpreter_email: 'c@x.pl', active_interpreter_name: 'Celina' };
    expect(holderName({ active: 'b@x.pl', me: 'a@x.pl', present: [{ id: 'b@x.pl', name: 'Barbara' }] })).toBe('Barbara');
    expect(holderName({ active: 'b@x.pl', me: 'a@x.pl', channel })).toBe('Basia');
    expect(holderName({ active: 'c@x.pl', me: 'a@x.pl', channel })).toBe('Celina');
    expect(holderName({ active: 'd@x.pl', me: 'a@x.pl', statsName: 'Dorota' })).toBe('Dorota');
    expect(holderName({ active: 'd@x.pl', me: 'a@x.pl' })).toBe('d@x.pl');
    expect(holderName({ active: 'a@x.pl', me: 'a@x.pl' })).toBeNull();
    expect(holderName({ active: null, me: 'a@x.pl' })).toBeNull();
  });
});

describe('przycisk główny i przejęcie', () => {
  it('przed dołączeniem — „Dołącz do kanału”', () => {
    expect(primaryAction({ phase: 'setup', state: 'free', ended: false, busy: false })).toEqual({ kind: 'join', label: 'Dołącz do kanału', disabled: false, loading: false });
    expect(primaryAction({ phase: 'joining', state: 'free', ended: false, busy: false })).toMatchObject({ kind: 'join', disabled: true, loading: true });
    expect(primaryAction({ phase: 'setup', state: 'free', ended: true, busy: false }).disabled).toBe(true);
    expect(primaryAction({ phase: 'setup', state: 'free', ended: false, busy: false, hasChannel: false }).disabled).toBe(true);
  });
  it('na kanale — przejmij / oddaj', () => {
    expect(primaryAction({ phase: 'on', state: 'free', ended: false, busy: false })).toMatchObject({ kind: 'take_over', label: 'Przejmij mikrofon', disabled: false });
    expect(primaryAction({ phase: 'on', state: 'locked', ended: false, busy: false })).toMatchObject({ kind: 'take_over', disabled: false });
    expect(primaryAction({ phase: 'reconnecting', state: 'free', ended: false, busy: false })).toMatchObject({ kind: 'take_over', disabled: true });
    expect(primaryAction({ phase: 'on', state: 'on_air', ended: false, busy: false })).toMatchObject({ kind: 'give_back', label: 'Oddaj mikrofon' });
    expect(primaryAction({ phase: 'on', state: 'muted', ended: false, busy: true })).toMatchObject({ kind: 'give_back', disabled: true, loading: true });
    expect(primaryAction({ phase: 'on', state: 'free', ended: false, busy: true })).toMatchObject({ kind: 'take_over', disabled: true, loading: true });
  });
  it('canTakeOver', () => {
    expect(canTakeOver({ phase: 'on', state: 'locked', ended: false })).toBe(true);
    expect(canTakeOver({ phase: 'on', state: 'on_air', ended: false })).toBe(false);
    expect(canTakeOver({ phase: 'on', state: 'free', ended: true })).toBe(false);
    expect(canTakeOver({ phase: 'setup', state: 'free', ended: false })).toBe(false);
  });
  it('plakietka i opis stanu', () => {
    expect(airBadge('on', 'on_air')).toEqual({ label: 'NA ŻYWO', tone: 'live' });
    expect(airBadge('on', 'muted').tone).toBe('muted');
    expect(airBadge('on', 'locked').label).toBe('Mikrofon wyłączony');
    expect(airBadge('reconnecting', 'on_air').tone).toBe('wait');
    expect(airBadge('setup', 'free')).toBeNull();
    expect(stateMessage('locked', 'Basia')).toContain('teraz tłumaczy Basia');
    expect(stateMessage('free', null)).toContain('Nikt teraz nie tłumaczy');
    expect(isConnected('on')).toBe(true);
    expect(isConnected('joining')).toBe(false);
  });
  it('licznik słuchaczy i stan sesji', () => {
    expect(listenersText(null)).toBe('—');
    expect(listenersText(1)).toBe('1 słuchacz');
    expect(listenersText(0)).toBe('0 słuchaczy');
    expect(listenersText(12)).toBe('12 słuchaczy');
    expect(sessionStatusLabel('live')).toBe('Tłumaczenie trwa');
    expect(sessionStatusLabel('ended')).toBe('Tłumaczenie zakończone');
    expect(sessionStatusLabel('idle')).toBe('Tłumaczenie jeszcze się nie zaczęło');
    expect(STATS_POLL_MS).toBe(10_000);
  });
});

describe('błędy konsoli', () => {
  it('kody serwera → rodzaj błędu', () => {
    expect(consoleErrorFrom(err(403, 'NOT_INTERPRETER'))).toBe('forbidden');
    expect(consoleErrorFrom(err(403, 'INTERP_FORBIDDEN'))).toBe('forbidden');
    expect(consoleErrorFrom(err(410, 'INTERP_ENDED'))).toBe('ended');
    expect(consoleErrorFrom(err(503, 'calls_disabled'))).toBe('disabled');
    expect(consoleErrorFrom(err(503, 'LIVEKIT_UNAVAILABLE'))).toBe('network');
    expect(consoleErrorFrom(err(404, 'CHANNEL_NOT_FOUND'))).toBe('not_found');
    expect(consoleErrorFrom(err(410, 'INTERP_UNAVAILABLE'))).toBe('unavailable');
    expect(consoleErrorFrom(new Error('Network request failed'))).toBe('network');
  });
  it('ponawianie tylko przy błędach chwilowych', () => {
    expect(rejoinDecision('network')).toBe('retry');
    for (const k of ['ended', 'forbidden', 'not_found', 'disabled', 'unavailable']) expect(rejoinDecision(k)).toBe('stop');
  });
  it('komunikaty', () => {
    expect(consoleErrorMessage('forbidden')).toBe('Do konsoli tego kanału wchodzi przypisany tłumacz.');
    expect(consoleErrorMessage('disabled')).toContain('Połączenia audio');
    expect(consoleErrorMessage('mic_denied')).toContain('mikrofon');
    expect(consoleErrorMessage('call_active')).toContain('Trwa rozmowa');
    expect(consoleErrorMessage('ended')).toContain('zakończone');
  });
});

describe('mikrofon i odsłuch', () => {
  it('RMS → pasek (dBFS od −60)', () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(null)).toBe(0);
    expect(levelFromRms(NaN)).toBe(0);
    expect(levelFromRms(0.001)).toBeCloseTo(0, 5);
    expect(levelFromRms(1)).toBe(1);
    expect(levelFromRms(2)).toBe(1);
    expect(levelFromRms(0.1)).toBeCloseTo(2 / 3, 5);
  });
  it('kolor paska', () => {
    expect(meterTone(0.5)).toBe('ok');
    expect(meterTone(0.9)).toBe('high');
    expect(meterTone(0.99)).toBe('clip');
  });
  it('kroki głośności', () => {
    expect(VOLUME_STEPS[0]).toBe(0);
    expect(VOLUME_STEPS[VOLUME_STEPS.length - 1]).toBe(1);
    expect(nearestVolumeStep(0.33)).toBe(0.4);
    expect(nearestVolumeStep(-1)).toBe(0);
    expect(nearestVolumeStep(5)).toBe(1);
  });
  it('stan oryginału', () => {
    expect(originalStatusText({ enabled: false, connected: true, on: true, muted: false })).toContain('wyłączony');
    expect(originalStatusText({ enabled: true, connected: false, on: null, muted: false })).toContain('po dołączeniu');
    expect(originalStatusText({ enabled: true, connected: true, on: null, muted: false })).toContain('niedostępny');
    expect(originalStatusText({ enabled: true, connected: true, on: false, muted: false })).toBe('Oryginał jeszcze nie nadaje.');
    expect(originalStatusText({ enabled: true, connected: true, on: true, muted: true })).toContain('wyciszonego');
  });
  it('słuchawki: Android z listy wyjść, iOS — nie wiadomo (baner zawsze)', () => {
    expect(headphonesConnected('android', ['speaker', 'earpiece'])).toBe(false);
    expect(headphonesConnected('android', ['speaker', 'headset'])).toBe(true);
    expect(headphonesConnected('android', ['bluetooth'])).toBe(true);
    expect(headphonesConnected('android', null)).toBeNull();
    expect(headphonesConnected('ios', ['default', 'force_speaker'])).toBeNull();
    expect(showHeadphonesBanner(null)).toBe(true);
    expect(showHeadphonesBanner(false)).toBe(true);
    expect(showHeadphonesBanner(true)).toBe(false);
  });
});

describe('ekran i usługa w tle (Android)', () => {
  it('moduł z trybem „console” — tylko gdy go deklaruje', () => {
    expect(consoleServiceSupported(null)).toBe(false);
    expect(consoleServiceSupported({})).toBe(false); // moduł 1.2.0 (tylko słuchanie)
    expect(consoleServiceSupported({ apiVersion: 1 })).toBe(false);
    expect(consoleServiceSupported({ apiVersion: 2 })).toBe(true);
    expect(consoleServiceSupported({ modes: ['listen'] })).toBe(false);
    expect(consoleServiceSupported({ modes: ['listen', 'console'] })).toBe(true);
  });
  it('usługa tylko na Androidzie z modułem, od dołączenia', () => {
    expect(shouldRunConsoleService('android', 'joining', true)).toBe(true);
    expect(shouldRunConsoleService('android', 'on', true)).toBe(true);
    expect(shouldRunConsoleService('android', 'setup', true)).toBe(false);
    expect(shouldRunConsoleService('android', 'on', false)).toBe(false);
    expect(shouldRunConsoleService('ios', 'on', true)).toBe(false);
  });
  it('ekran nie gaśnie przez zmianę (poza Androidem z usługą)', () => {
    expect(consoleKeepAwake('ios', 'on')).toBe(true);
    expect(consoleKeepAwake('android', 'reconnecting', false)).toBe(true);
    expect(consoleKeepAwake('android', 'on', true)).toBe(false);
    expect(consoleKeepAwake('ios', 'setup')).toBe(false);
  });
  it('treść powiadomienia', () => {
    const o = { channelLabel: 'Tłumacz EN', eventTitle: 'Nabożeństwo', holder: 'Basia' };
    expect(consoleNotification('on', 'on_air', o)).toEqual({ title: 'Tłumaczysz na żywo — Tłumacz EN', text: 'Nabożeństwo' });
    expect(consoleNotification('on', 'muted', o).title).toBe('Mikrofon wyciszony — Tłumacz EN');
    expect(consoleNotification('on', 'locked', o)).toEqual({ title: 'Konsola tłumacza — Tłumacz EN', text: 'Teraz tłumaczy Basia' });
    expect(consoleNotification('on', 'free', o)).toEqual({ title: 'Konsola tłumacza — Tłumacz EN', text: 'Oczekiwanie — nikt nie tłumaczy' });
    expect(consoleNotification('reconnecting', 'on_air', o).text).toBe('Łączenie ponownie…');
    expect(consoleNotification('joining', 'free', {}).title).toBe('Konsola tłumacza');
  });
  it('podpowiedź o ekranie', () => {
    expect(consoleScreenHint('android', true)).toContain('Możesz wyłączyć ekran');
    expect(consoleScreenHint('android', false)).toContain('Nie wyłączaj ekranu');
    expect(consoleScreenHint('ios', false)).toContain('nie polegaj');
  });
});

describe('karta wydarzenia — zarządzający widzi konsolę', () => {
  it('can_manage trafia do danych karty', () => {
    expect(cardDataFromSession({ can_manage: true, my_channels: [], session: { status: 'idle', channels: [] } }).can_manage).toBe(true);
    expect(cardDataFromSession({ my_channels: ['x'], session: null }).can_manage).toBeUndefined();
  });
});
