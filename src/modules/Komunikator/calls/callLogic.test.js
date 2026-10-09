import { describe, it, expect } from 'vitest';
import {
  callReducer, initialCallState, shouldRing, isCallsDisabledError, callMessageView,
  formatCallDuration, formatClock, arrangeTiles, paginate, pageSizeFor, gridColumns, readCallsDisabled, writeCallsDisabled,
} from './callLogic';

const t = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k]));
const ringRow = { id: 'k1', conversation_id: 'c1', kind: 'audio', status: 'ringing', started_by_email: 'ola@x.pl', started_at: new Date().toISOString() };

describe('maszyna stanów połączenia', () => {
  it('przychodzące: dzwoni → odebrane → łączenie → trwa → koniec', () => {
    let s = callReducer(initialCallState, { type: 'RING', call: ringRow, conversation: { id: 'c1', type: 'direct' }, caller: { name: 'Ola' } });
    expect(s.phase).toBe('incoming');
    s = callReducer(s, { type: 'ACCEPT', kind: 'video' });
    expect(s).toMatchObject({ phase: 'joining', kind: 'video', outgoing: false });
    expect(s.call.id).toBe('k1');
    s = callReducer(s, { type: 'JOINED', call: { ...ringRow, status: 'active' } });
    expect(s.phase).toBe('active');
    s = callReducer(s, { type: 'MINIMIZE' });
    expect(s.minimized).toBe(true);
    s = callReducer(s, { type: 'CALL_UPDATED', call: { id: 'k1', status: 'ended' } });
    expect(s).toEqual(initialCallState);
  });

  it('wychodzące: czekam na odbiór, potem trwa; zajęty — drugi dzwonek ignorowany', () => {
    let s = callReducer(initialCallState, { type: 'START', conversation: { id: 'c1' }, kind: 'audio' });
    expect(s).toMatchObject({ phase: 'joining', outgoing: true });
    s = callReducer(s, { type: 'JOINED', call: { ...ringRow, started_by_email: 'ja@x.pl' } });
    expect(s.phase).toBe('outgoing');
    expect(callReducer(s, { type: 'RING', call: { id: 'k2' } })).toBe(s);
    s = callReducer(s, { type: 'REMOTE_JOINED' });
    expect(s.phase).toBe('active');
  });

  it('dołączenie do trwającej rozmowy (call-start zwrócił active) od razu „active”', () => {
    let s = callReducer(initialCallState, { type: 'START', conversation: { id: 'c1' }, kind: 'audio' });
    s = callReducer(s, { type: 'JOINED', call: { ...ringRow, status: 'active' } });
    expect(s.phase).toBe('active');
  });

  it('odrzucenie i koniec dzwonienia', () => {
    const s = callReducer(initialCallState, { type: 'RING', call: ringRow, conversation: {}, caller: {} });
    expect(callReducer(s, { type: 'DECLINE' })).toEqual(initialCallState);
    expect(callReducer(s, { type: 'RING_STOP', callId: 'inne' })).toBe(s);
    expect(callReducer(s, { type: 'RING_STOP', callId: 'k1' })).toEqual(initialCallState);
  });
});

describe('dzwonek', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  it('dzwoni tylko u innych, w oknie 45 s, bez odrzuconych i gdy nie rozmawiam', () => {
    const row = { ...ringRow, started_at: '2026-10-09T11:59:50Z' };
    expect(shouldRing(row, { me: 'ja@x.pl', now })).toBe(true);
    expect(shouldRing(row, { me: 'OLA@x.pl', now })).toBe(false);
    expect(shouldRing(row, { me: 'ja@x.pl', now, busy: true })).toBe(false);
    expect(shouldRing(row, { me: 'ja@x.pl', now, dismissed: new Set(['k1']) })).toBe(false);
    expect(shouldRing({ ...row, status: 'ended' }, { me: 'ja@x.pl', now })).toBe(false);
    const old = { ...row, started_at: '2026-10-09T11:58:00Z' };
    expect(shouldRing(old, { me: 'ja@x.pl', now })).toBe(false);
    expect(shouldRing(old, { me: 'ja@x.pl', now, fresh: true })).toBe(true);
  });
});

describe('błędy i pamięć „wyłączone”', () => {
  it('503 calls_disabled', () => {
    expect(isCallsDisabledError({ status: 503, context: { code: 'calls_disabled' } })).toBe(true);
    expect(isCallsDisabledError({ status: 503, message: 'calls_disabled' })).toBe(true);
    expect(isCallsDisabledError({ status: 503, message: 'Service unavailable' })).toBe(false);
    expect(isCallsDisabledError({ status: 403, code: 'calls_disabled' })).toBe(false);
  });
  it('pamięć wygasa po 6 h', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    writeCallsDisabled(true, storage, 1000);
    expect(readCallsDisabled(storage, 2000)).toBe(true);
    expect(readCallsDisabled(storage, 1000 + 7 * 3600 * 1000)).toBe(false);
    writeCallsDisabled(false, storage);
    expect(readCallsDisabled(storage, 2000)).toBe(false);
  });
});

describe('wiadomość „połączenie”', () => {
  const msg = (meta, sender = 'ola@x.pl') => ({ id: 'm', sender_email: sender, message_type: 'call', metadata: meta });
  it('zakończone z czasem trwania', () => {
    const v = callMessageView(msg({ call_id: 'k', kind: 'video', status: 'ended', duration_sec: 720 }), 'ja@x.pl', t);
    expect(v.title).toBe('Połączenie wideo');
    expect(v.durationText).toBe('12 min');
    expect(v.canCallBack).toBe(false);
  });
  it('nieodebrane: u mnie „Oddzwoń”, u dzwoniącego „Zadzwoń ponownie”', () => {
    const mineNot = callMessageView(msg({ call_id: 'k', kind: 'audio', status: 'missed' }), 'ja@x.pl', t);
    expect(mineNot).toMatchObject({ title: 'Nieodebrane połączenie', tone: 'missed', canCallBack: true, callBackLabel: 'Oddzwoń' });
    const mine = callMessageView(msg({ call_id: 'k', status: 'missed', started_by_email: 'ja@x.pl' }), 'ja@x.pl', t);
    expect(mine).toMatchObject({ title: 'Połączenie bez odpowiedzi', callBackLabel: 'Zadzwoń ponownie' });
  });
  it('grupowa trwa (metadane jako tekst JSON) i nadpisanie „live” przez dostawcę', () => {
    const live = callMessageView(msg(JSON.stringify({ call_id: 'k', status: 'ringing', is_group: true })), 'ja@x.pl', t);
    expect(live).toMatchObject({ live: true, title: 'Rozmowa grupowa trwa', canCallBack: false });
    const ended = callMessageView(msg({ call_id: 'k', status: 'active', is_group: true }), 'ja@x.pl', t, { live: false });
    expect(ended).toMatchObject({ live: false, title: 'Rozmowa grupowa' });
  });
  it('czas trwania i zegar', () => {
    expect(formatCallDuration(42, t)).toBe('42 s');
    expect(formatCallDuration(3900, t)).toBe('1 godz. 5 min');
    expect(formatClock(65000)).toBe('01:05');
    expect(formatClock(3725000)).toBe('1:02:05');
  });
});

describe('układ kafelków', () => {
  it('mówca spoza pierwszej strony trafia na początek; strony', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const out = arrangeTiles(ids, ['p27', 'p3'], 25);
    expect(out[0]).toBe('p27');
    expect(out.indexOf('p3')).toBe(4);
    const pg = paginate(out, 5, 25);
    expect(pg).toMatchObject({ page: 1, pages: 2 });
    expect(pg.items).toHaveLength(5);
  });
  it('rozmiar strony i kolumny', () => {
    expect(pageSizeFor(400)).toBe(9);
    expect(pageSizeFor(1400)).toBe(25);
    expect(gridColumns(1)).toBe(1);
    expect(gridColumns(9)).toBe(3);
    expect(gridColumns(25)).toBe(5);
    expect(gridColumns(5, 400)).toBe(3);
  });
});
