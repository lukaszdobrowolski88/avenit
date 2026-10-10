// Goście w rozmowach (link „zaproś gościa”) — czysta logika weba, testowana.
//  • kto widzi „Zaproś gościa (link)” (serwer i tak sprawdza — src/calls/guests.js),
//  • adres linku, opcje ważności, opis ważności,
//  • kolejka poczekalni (prośby gości w bieżącej rozmowie),
//  • komunikaty strony gościa dla kodów błędów API.
import { tr, appLocale } from '../../../i18n';

export const GUEST_PATH_PREFIX = '/rozmowa/';
export const EXPIRY_OPTIONS = [
  { value: '1h', label: '1 godzina' },
  { value: '24h', label: '24 godziny' },
  { value: '7d', label: '7 dni' },
];
export const DEFAULT_EXPIRY = '24h';
export const GUEST_POLL_MS = 2500;

// Przycisk „Zaproś gościa”: rozmowa 1:1 — każda strona; grupa/kanał — administrator rozmowy
// albo admin aplikacji.
export function canInviteGuests(conversation, { isAppAdmin = false } = {}) {
  if (!conversation?.id) return false;
  if (conversation.type === 'direct') return true;
  return (conversation.myRole ?? conversation.my_role) === 'admin' || !!isAppAdmin;
}

export function guestLinkUrl(link, origin = (typeof window !== 'undefined' ? window.location.origin : '')) {
  const token = typeof link === 'string' ? link : link?.token;
  if (!token) return '';
  return `${String(origin || '').replace(/\/$/, '')}${GUEST_PATH_PREFIX}${token}`;
}

// „wygasa dziś o 18:30” / „wygasa 12 paź, 18:30”.
export function expiryText(expiresAt, now = Date.now()) {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const time = d.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return tr('wygasa dziś o {time}', { time });
  const date = d.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
  return tr('wygasa {date}, {time}', { date, time });
}

export function usesText(link) {
  if (!link) return '';
  if (link.max_uses) return tr('dołączyło {n} z {m}', { n: link.uses || 0, m: link.max_uses });
  return link.uses ? tr('dołączyło {n}', { n: link.uses }) : '';
}

// Prośby gości do pokazania w poczekalni (oczekujące w tej rozmowie, najstarsze pierwsze).
export function lobbyQueue(requests, conversationId) {
  if (!conversationId) return [];
  return Object.values(requests || {})
    .filter((r) => r && r.status === 'pending' && String(r.conversation_id) === String(conversationId))
    .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0));
}

// Zmiana wiersza poczekalni (realtime / odczyt) → nowa mapa id → wiersz (tylko oczekujące).
export function applyGuestRequest(map, row) {
  if (!row?.id) return map;
  const next = { ...(map || {}) };
  if (row.status === 'pending') next[row.id] = row;
  else delete next[row.id];
  return next;
}

// Kod błędu API strony gościa → stan strony.
export function guestErrorState(err) {
  const code = err?.code || err?.context?.code || '';
  if (code === 'LINK_NOT_FOUND' || err?.status === 404) return 'not_found';
  if (code === 'LINK_FULL') return 'full';
  if (code === 'LINK_EXPIRED') return 'expired';
  if (code === 'LINK_UNAVAILABLE') return 'unavailable';
  if (code === 'calls_disabled' || err?.status === 503) return 'unavailable';
  if (code === 'LOBBY_FULL' || err?.status === 429) return 'busy';
  return 'error';
}

export function guestStateMessage(state) {
  switch (state) {
    case 'not_found': return { title: tr('Nie znaleziono rozmowy'), body: tr('Ten link nie działa. Sprawdź, czy został skopiowany w całości, albo poproś o nowy.') };
    case 'expired': return { title: tr('Link wygasł'), body: tr('Ten link do rozmowy wygasł albo został wyłączony. Poproś osobę zapraszającą o nowy.') };
    case 'full': return { title: tr('Brak wolnych miejsc'), body: tr('Z tego linku dołączyła już maksymalna liczba osób. Poproś o nowy link.') };
    case 'unavailable': return { title: tr('Rozmowa niedostępna'), body: tr('Ta rozmowa nie jest teraz dostępna dla gości.') };
    case 'busy': return { title: tr('Spróbuj za chwilę'), body: tr('Zbyt wiele prób albo osób w poczekalni. Odczekaj chwilę i spróbuj ponownie.') };
    case 'denied': return { title: tr('Nie wpuszczono Cię do rozmowy'), body: tr('Osoba prowadząca rozmowę odrzuciła prośbę o dołączenie.') };
    case 'left': return { title: tr('Opuściłeś(-aś) rozmowę'), body: tr('Dziękujemy za udział. Możesz zamknąć tę kartę.') };
    case 'ended': return { title: tr('Rozmowa zakończona'), body: tr('Rozmowa się zakończyła. Możesz zamknąć tę kartę.') };
    default: return { title: tr('Coś poszło nie tak'), body: tr('Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.') };
  }
}
