// Połączenia audio/wideo — czyste reguły (bez bazy i LiveKit), testowane w test/calls.test.js.
//
// Stany połączenia (calls.status):
//   ringing ──(odebrane: 1:1 call-join / webhook participant_joined)──▶ active ──(rozłączenie)──▶ ended
//   ringing ──(45 s bez odpowiedzi, 1:1)──▶ missed
//   ringing ──(rozmówca odrzuca, 1:1)──▶ declined
//   ringing ──(dzwoniący rezygnuje)──▶ cancelled
//   Grupa: ringing przez okno 45 s (dzwoni u wszystkich, także po pierwszym odebraniu), potem
//   active, jeśli ktoś jest w pokoju / odebrał, inaczej missed. Koniec — gdy pokój się zamyka.
// Stany końcowe (ended/missed/declined/cancelled) są nieodwracalne — każde przejście w SQL ma
// warunek na bieżący stan, więc powtórzony webhook / wyścig fn z workerem niczego nie dubluje.

export const RING_TIMEOUT_SEC = 45;
export const TOKEN_TTL = '2h';
export const CALL_KINDS = ['audio', 'video'];
export const LIVE_STATUSES = ['ringing', 'active'];
export const FINAL_STATUSES = ['ended', 'missed', 'declined', 'cancelled'];

const lower = (v) => String(v ?? '').trim().toLowerCase();

export const isLive = (status) => LIVE_STATUSES.includes(status);
export const isFinal = (status) => FINAL_STATUSES.includes(status);
export const normalizeKind = (kind) => (CALL_KINDS.includes(kind) ? kind : 'audio');

// Pokój LiveKit: avn_<slug tenanta>_<uuid połączenia>. Slug (a-z, 0-9, „-”) w nazwie pokoju — webhook
// LiveKit przychodzi bez hosta tenanta, więc tenant odczytujemy z nazwy pokoju.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROOM_RE = new RegExp(`^avn_([a-z0-9-]+)_(${UUID})$`);
export function roomNameFor(tenantSlug, callId) {
  return `avn_${String(tenantSlug)}_${String(callId)}`;
}
export function parseRoomName(name) {
  const m = String(name ?? '').match(ROOM_RE);
  return m ? { tenantSlug: m[1], callId: m[2] } : null;
}

// Czas trwania po polsku: „45 s”, „12 min”, „1 h 05 min”.
export function formatDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')} min`;
}

// Treść wiadomości w czacie (zwykły tekst — starsze aplikacje pokażą go jak zwykłą wiadomość).
export function callMessageText({ status, kind, is_group: isGroup, duration_sec: duration }) {
  const video = kind === 'video';
  if (isGroup) {
    if (isLive(status)) return video ? 'Rozmowa grupowa wideo trwa — dołącz' : 'Rozmowa grupowa trwa — dołącz';
    if (status === 'ended') {
      const label = video ? 'Rozmowa grupowa wideo' : 'Rozmowa grupowa';
      return duration != null ? `${label} · ${formatDuration(duration)}` : label;
    }
    return video ? 'Nieodebrana rozmowa grupowa wideo' : 'Nieodebrana rozmowa grupowa';
  }
  if (status === 'ended') {
    const label = video ? 'Połączenie wideo' : 'Połączenie głosowe';
    return duration != null ? `${label} · ${formatDuration(duration)}` : label;
  }
  if (status === 'declined') return 'Połączenie odrzucone';
  if (isLive(status)) return video ? 'Połączenie wideo' : 'Połączenie głosowe';
  return video ? 'Nieodebrane połączenie wideo' : 'Nieodebrane połączenie';
}

export function callMessageMetadata(call) {
  return {
    call_id: call.id,
    kind: call.kind,
    status: call.status,
    is_group: !!call.is_group,
    started_by_email: call.started_by_email,
    duration_sec: call.duration_sec ?? null,
    answered_at: call.answered_at ?? null,
    ended_at: call.ended_at ?? null,
  };
}

// Status końcowy po zamknięciu pokoju LiveKit (room_finished) albo zniknięciu pokoju.
// ringing → 1:1 przed upływem okna dzwonienia: dzwoniący zrezygnował; po oknie / grupa: nieodebrane.
export function finalStatusOnRoomEnd(call, now = Date.now()) {
  if (!call || !isLive(call.status)) return null;
  if (call.status === 'active') return call.answered_at || !call.is_group ? 'ended' : 'missed';
  if (call.answered_at) return 'ended';
  if (!call.is_group && ageSec(call, now) < RING_TIMEOUT_SEC) return 'cancelled';
  return 'missed';
}

export function ageSec(call, now = Date.now()) {
  const t = call?.started_at instanceof Date ? call.started_at.getTime() : Date.parse(call?.started_at);
  return Number.isFinite(t) ? (now - t) / 1000 : Infinity;
}

// Decyzja po upływie okna dzwonienia (45 s), gdy połączenie nadal „ringing”.
//  1:1 → missed; grupa → active, gdy ktoś odebrał albo jest w pokoju (inPeople > 0), inaczej missed.
export function ringTimeoutDecision(call, { inRoom = 0 } = {}) {
  if (!call || call.status !== 'ringing') return null;
  if (!call.is_group) return 'missed';
  return call.answered_at || inRoom > 0 ? 'active' : 'missed';
}

// Tożsamość gościa z linku (guests.js) — „guest:<hex>”; e-maile nie zawierają „:” na początku.
export const GUEST_PREFIX = 'guest:';
export const isGuestIdentity = (identity) => String(identity ?? '').toLowerCase().startsWith(GUEST_PREFIX);

// Co zrobić po wyjściu osoby z pokoju (webhook participant_left / fn call-leave).
//  1:1 trwające → koniec dla obojga; 1:1 dzwoniące i wychodzi dzwoniący → anulowane;
//  grupa → koniec dopiero, gdy w pokoju nikt nie został (remaining = 0).
export function decisionOnLeave(call, email, { remaining = null } = {}) {
  if (!call || !isLive(call.status)) return null;
  const isCaller = lower(email) === lower(call.started_by_email);
  if (!call.is_group) {
    if (call.status === 'active') return 'ended';
    return isCaller ? 'cancelled' : null;
  }
  if (remaining === 0) return call.answered_at ? 'ended' : 'missed';
  return null;
}

// Uprawnienia w pokoju: w kanale „piszą tylko administratorzy” zwykły uczestnik tylko słucha.
export function canPublishIn(conv, role) {
  return !(conv?.posting_policy === 'admins' && role !== 'admin');
}

// Grant tokenu LiveKit — wyłącznie ten jeden pokój. canPublishData domyślnie jak canPublish
// (gość: false — bez kanału danych).
export function videoGrant(room, { canPublish = true, canPublishData } = {}) {
  return {
    room,
    roomJoin: true,
    canPublish: !!canPublish,
    canSubscribe: true,
    canPublishData: canPublishData === undefined ? !!canPublish : !!canPublishData,
    canUpdateOwnMetadata: false,
  };
}
