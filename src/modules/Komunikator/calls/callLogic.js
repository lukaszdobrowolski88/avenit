// Połączenia audio/wideo w Komunikatorze — czysta logika (bez Reacta i sieci), testowana.
//  • maszyna stanów połączenia (reducer),
//  • rozpoznawanie błędów API (503 calls_disabled, odmowa DM),
//  • widok wiadomości „połączenie” w wątku,
//  • układ kafelków (strony, mówca na pierwszej stronie).
import { sameEmail } from '../utils/chatLogic';

export const RING_TIMEOUT_MS = 45000;
// Dzwoniący czeka trochę dłużej niż serwer (45 s → „nieodebrane”), potem rozłącza się sam.
export const OUTGOING_TIMEOUT_MS = 55000;
export const LIVE_STATUSES = new Set(['ringing', 'active']);
export const ENDED_STATUSES = new Set(['ended', 'missed', 'declined', 'cancelled']);
// Rozmowa „wisząca” dłużej (np. zgubiony webhook) nie jest już pokazywana jako trwająca.
const STALE_LIVE_MS = 12 * 3600 * 1000;

export const ts = (v) => {
  if (!v) return 0;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : 0;
};

export function parseMetadata(meta) {
  if (!meta) return {};
  if (typeof meta === 'object') return meta;
  try { const v = JSON.parse(meta); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export const isLiveCall = (call, now = Date.now()) =>
  !!call && LIVE_STATUSES.has(call.status) && (!call.started_at || now - ts(call.started_at) < STALE_LIVE_MS);

// ── Maszyna stanów ────────────────────────────────────────────────────────────
// idle → incoming (dzwoni do mnie) → joining → active
// idle → joining (dzwonię) → outgoing (czekam na odbiór) → active
// Każde zakończenie → idle.
export const initialCallState = Object.freeze({
  phase: 'idle',        // 'idle' | 'incoming' | 'joining' | 'outgoing' | 'active'
  call: null,           // wiersz calls bieżącej rozmowy
  conversation: null,   // { id, type, name, avatar }
  kind: null,           // 'audio' | 'video' — z czym wchodzę
  outgoing: false,      // ja dzwonię
  incoming: null,       // { call, conversation, caller: { email, name, avatar } }
  minimized: false,
});

export function callReducer(state, action) {
  switch (action.type) {
    case 'RING':
      if (state.phase !== 'idle') return state;
      return { ...initialCallState, phase: 'incoming', incoming: { call: action.call, conversation: action.conversation, caller: action.caller } };
    case 'RING_STOP':
      if (state.phase !== 'incoming' || (action.callId && state.incoming?.call?.id !== action.callId)) return state;
      return initialCallState;
    case 'ACCEPT':
      if (state.phase !== 'incoming') return state;
      return { ...initialCallState, phase: 'joining', call: state.incoming.call, conversation: state.incoming.conversation, kind: action.kind || state.incoming.call?.kind || 'audio' };
    case 'DECLINE':
      return state.phase === 'incoming' ? initialCallState : state;
    case 'START':
      if (state.phase !== 'idle') return state;
      return { ...initialCallState, phase: 'joining', conversation: action.conversation, kind: action.kind || 'audio', outgoing: true };
    case 'JOIN':
      if (state.phase !== 'idle') return state;
      return { ...initialCallState, phase: 'joining', call: action.call || null, conversation: action.conversation, kind: action.kind || 'audio' };
    case 'JOINED': {
      if (state.phase !== 'joining') return state;
      const call = action.call || state.call;
      const waiting = state.outgoing && call?.status === 'ringing' && !action.remotePresent;
      return { ...state, call, phase: waiting ? 'outgoing' : 'active' };
    }
    case 'CALL_SET':
      return state.phase === 'joining' && action.call ? { ...state, call: action.call } : state;
    case 'CONVERSATION_SET':
      return inCall(state) && action.conversation ? { ...state, conversation: { ...state.conversation, ...action.conversation } } : state;
    case 'REMOTE_JOINED':
      return state.phase === 'outgoing' ? { ...state, phase: 'active' } : state;
    case 'CALL_UPDATED': {
      const c = action.call;
      if (!c || !state.call || state.call.id !== c.id) return state;
      if (ENDED_STATUSES.has(c.status)) return initialCallState;
      const call = { ...state.call, ...c };
      if (state.phase === 'outgoing' && c.status === 'active') return { ...state, call, phase: 'active' };
      return { ...state, call };
    }
    case 'MINIMIZE':
      return state.phase === 'idle' || state.phase === 'incoming' ? state : { ...state, minimized: true };
    case 'RESTORE':
      return { ...state, minimized: false };
    case 'RESET':
      return initialCallState;
    default:
      return state;
  }
}

export const inCall = (state) => state.phase === 'joining' || state.phase === 'outgoing' || state.phase === 'active';

// ── Dzwonek: czy ten wiersz ma u mnie zadzwonić ───────────────────────────────
// fresh — świeże zdarzenie realtime (wtedy nie ufamy zegarowi przeglądarki: dzwoni od teraz).
export function shouldRing(call, { me, now = Date.now(), fresh = false, dismissed = null, busy = false } = {}) {
  if (!call || !call.id || busy) return false;
  if (!LIVE_STATUSES.has(call.status)) return false;
  if (sameEmail(call.started_by_email, me)) return false;
  if (dismissed && dismissed.has(call.id)) return false;
  if (!fresh && now - ts(call.started_at) > RING_TIMEOUT_MS) return false;
  return true;
}

// Ile jeszcze dzwonić (dla wiersza z historii — reszta z 45 s; świeży — pełne 45 s).
export function ringRemainingMs(call, { now = Date.now(), fresh = false } = {}) {
  if (fresh) return RING_TIMEOUT_MS;
  const left = RING_TIMEOUT_MS - (now - ts(call?.started_at));
  return Math.max(5000, Math.min(RING_TIMEOUT_MS, left));
}

// ── Błędy API ─────────────────────────────────────────────────────────────────
// functions.invoke zwraca { error: { message, status, context: payload } }.
export function isCallsDisabledError(err) {
  if (!err) return false;
  const code = err.code || err.context?.code || '';
  const msg = String(err.message || err.context?.error || '');
  return err.status === 503 && (code === 'calls_disabled' || /calls_disabled/i.test(msg) || /calls_disabled/i.test(String(err.context?.error || '')));
}

// ── Pamięć „połączenia wyłączone” (żeby nie pokazywać martwych przycisków po 503) ──
const DISABLED_KEY = 'avenit.calls.disabled';
const DISABLED_TTL_MS = 6 * 3600 * 1000;
export function readCallsDisabled(storage = safeStorage(), now = Date.now()) {
  try {
    const at = Number(storage?.getItem(DISABLED_KEY) || 0);
    return at > 0 && now - at < DISABLED_TTL_MS;
  } catch { return false; }
}
export function writeCallsDisabled(disabled, storage = safeStorage(), now = Date.now()) {
  try {
    if (disabled) storage?.setItem(DISABLED_KEY, String(now));
    else storage?.removeItem(DISABLED_KEY);
  } catch { /* prywatne okno — tylko w pamięci */ }
}
function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// ── Czas trwania ──────────────────────────────────────────────────────────────
export function formatCallDuration(sec, t) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return t('{n} s', { n: s });
  const min = Math.round(s / 60);
  if (min < 60) return t('{n} min', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t('{h} godz. {m} min', { h, m }) : t('{h} godz.', { h });
}

// Zegar rozmowy „mm:ss” / „h:mm:ss”.
export function formatClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ── Wiadomość „połączenie” w wątku ────────────────────────────────────────────
// metadata (serwer): { call_id, kind, status, is_group, started_by_email, duration_sec, … }
// live — czy rozmowa trwa (gdy dostawca połączeń wie lepiej, podaje to sam).
export function callMessageView(message, myEmail, t, { live: liveOverride = null } = {}) {
  const meta = parseMetadata(message?.metadata);
  const kind = meta.kind === 'video' ? 'video' : 'audio';
  const video = kind === 'video';
  const status = String(meta.status || 'ended');
  const caller = meta.started_by_email || meta.started_by || message?.sender_email || null;
  const mine = !!caller && sameEmail(caller, myEmail);
  const live = liveOverride != null ? !!liveOverride : LIVE_STATUSES.has(status);
  const isGroup = !!(meta.is_group ?? meta.group);
  const duration = Number(meta.duration_sec) || 0;
  let title;
  let tone = 'normal'; // 'normal' | 'missed' | 'live'
  if (live) {
    tone = 'live';
    if (isGroup) title = video ? t('Rozmowa grupowa wideo trwa') : t('Rozmowa grupowa trwa');
    else title = video ? t('Trwa połączenie wideo') : t('Trwa połączenie głosowe');
  } else if (isGroup) {
    if (status === 'ended' || LIVE_STATUSES.has(status)) {
      title = video ? t('Rozmowa grupowa wideo') : t('Rozmowa grupowa');
    } else {
      tone = 'missed';
      title = mine ? t('Nikt nie dołączył do rozmowy') : (video ? t('Nieodebrana rozmowa grupowa wideo') : t('Nieodebrana rozmowa grupowa'));
    }
  } else if (status === 'missed' || (status === 'cancelled' && !mine)) {
    tone = 'missed';
    if (mine) title = t('Połączenie bez odpowiedzi');
    else title = video ? t('Nieodebrane połączenie wideo') : t('Nieodebrane połączenie');
  } else if (status === 'declined') {
    tone = 'missed';
    title = mine ? t('Połączenie odrzucone') : t('Odrzucono połączenie');
  } else if (status === 'cancelled') {
    title = t('Połączenie anulowane');
  } else {
    title = video ? t('Połączenie wideo') : t('Połączenie głosowe');
  }
  const ended = !live && (status === 'ended' || LIVE_STATUSES.has(status));
  return {
    callId: meta.call_id || null,
    kind,
    status,
    mine,
    live,
    isGroup,
    tone,
    title,
    durationText: ended && duration > 0 ? formatCallDuration(duration, t) : null,
    canCallBack: !live && (status === 'missed' || status === 'declined' || status === 'cancelled'),
    callBackLabel: mine ? t('Zadzwoń ponownie') : t('Oddzwoń'),
  };
}

// ── Układ kafelków ────────────────────────────────────────────────────────────
export function pageSizeFor(width) {
  if (width < 640) return 9;
  if (width < 1024) return 16;
  return 25;
}

export function gridColumns(count, width = 1280) {
  if (count <= 1) return 1;
  if (width < 640) return count <= 2 ? 1 : count <= 4 ? 2 : 3;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 5;
}

// Kolejność stabilna (wg dołączenia), ale osoba mówiąca spoza pierwszej strony trafia na początek,
// żeby było ją widać (kafelki nie skaczą, dopóki mówca jest już widoczny).
export function arrangeTiles(ids = [], speakingIds = [], pageSize = 25) {
  const list = ids.slice();
  const speaking = speakingIds.filter((id) => list.indexOf(id) >= pageSize);
  for (const id of speaking.reverse()) {
    list.splice(list.indexOf(id), 1);
    list.unshift(id);
  }
  return list;
}

export function paginate(list = [], page = 0, pageSize = 25) {
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { page: p, pages, items: list.slice(p * pageSize, (p + 1) * pageSize) };
}

// Metadane uczestnika z tokenu LiveKit (JSON z adresem zdjęcia).
export function participantAvatar(metadata) {
  const m = parseMetadata(metadata);
  return m.avatar_url || m.avatarUrl || m.avatar || null;
}

// Pole tekstowe ma pierwszeństwo przed skrótami klawiszowymi rozmowy.
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = String(el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
}
