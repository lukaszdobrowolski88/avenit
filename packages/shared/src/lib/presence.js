// Obecność użytkowników (user_presence: status online|away|offline + last_seen) — jedna reguła
// dla weba i mobilki. Web wysyła sygnał co 30 s, mobilka co 60 s, przy zejściu w tło — 'away'.
// Wcześniej osoba znikała z „Kto jest online” 2–5 min po zminimalizowaniu aplikacji, więc widżet
// pokazywał garstkę ludzi, choć w ostatniej godzinie korzystało wielu.
export const PRESENCE_ONLINE_MS = 2 * 60_000; // świeży sygnał „online”
export const PRESENCE_AWAY_MS = 15 * 60_000; // aplikacja w tle / karta schowana / brak sygnału
export const PRESENCE_RECENT_MS = 60 * 60_000; // „ostatnio aktywni”

// → 'online' | 'away' | 'recent' | 'offline'
export function presenceState(presence, now = Date.now()) {
  if (!presence?.last_seen) return 'offline';
  const seen = new Date(presence.last_seen).getTime();
  if (!Number.isFinite(seen)) return 'offline';
  const age = Math.max(0, now - seen);
  const status = presence.status || 'offline';
  if (status === 'online' && age <= PRESENCE_ONLINE_MS) return 'online';
  if (status !== 'offline' && age <= PRESENCE_AWAY_MS) return 'away';
  if (age <= PRESENCE_RECENT_MS) return 'recent';
  return 'offline';
}

export const PRESENCE_ORDER = { online: 0, away: 1, recent: 2, offline: 3 };

// „przed chwilą” / „12 min temu” — dla ostatnio aktywnych.
export function lastSeenLabel(lastSeen, now = Date.now()) {
  const t = new Date(lastSeen || 0).getTime();
  if (!Number.isFinite(t) || !t) return '';
  const min = Math.floor(Math.max(0, now - t) / 60_000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return `${min} min temu`;
  return `${Math.floor(min / 60)} godz. temu`;
}

// Mapa e-mail (małymi literami) → wpis obecności (e-maile w app_users i user_presence
// potrafią różnić się wielkością liter).
export function presenceByEmail(rows) {
  const map = new Map();
  for (const r of rows || []) if (r?.user_email) map.set(String(r.user_email).toLowerCase(), r);
  return map;
}
