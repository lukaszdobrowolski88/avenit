// Komunikator: terminy zaplanowanych wiadomości i „Przypomnij mi” (web, mobilka, serwer).
//
// Wszystkie gotowe terminy („Dziś 18:00”, „Jutro 9:00”, „W poniedziałek 9:00”) liczymy w czasie
// polskim (Europe/Warsaw), niezależnie od strefy urządzenia i serwera (kontenery są w UTC).
// Zapis zawsze w UTC (ISO). Strefę liczymy regułą UE (czas letni od ostatniej niedzieli marca
// 01:00 UTC do ostatniej niedzieli października 01:00 UTC) — bez Intl, bo Hermes na starszych
// urządzeniach nie zawsze ma pełne strefy czasowe; wynik jest taki sam jak w Intl dla Warszawy.

export const CHAT_TZ = 'Europe/Warsaw';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Najwcześniej / najpóźniej: termin musi być w przyszłości (co najmniej minuta zapasu,
// worker sprawdza co minutę) i najwyżej rok naprzód.
export const MIN_LEAD_MS = MIN;
export const MAX_AHEAD_MS = 366 * DAY;

const lastSundayUtc = (year, month) => {
  // Ostatni dzień miesiąca (month 0–11) minus jego dzień tygodnia = ostatnia niedziela.
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
};

// Przesunięcie Warszawy względem UTC w minutach (60 zimą, 120 latem) dla chwili ms.
export function warsawOffsetMinutes(ms) {
  const year = new Date(ms).getUTCFullYear();
  const start = Date.UTC(year, 2, lastSundayUtc(year, 2), 1, 0);
  const end = Date.UTC(year, 9, lastSundayUtc(year, 9), 1, 0);
  return ms >= start && ms < end ? 120 : 60;
}

const toMs = (v) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v));

// Części daty w czasie polskim: { year, month (1–12), day, hour, minute, weekday (0 = niedziela) }.
export function warsawParts(at) {
  const ms = toMs(at);
  const d = new Date(ms + warsawOffsetMinutes(ms) * MIN);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

// Czas polski (rok, miesiąc 1–12, dzień, godzina, minuta) → Date (UTC). Dzień może wyjść poza
// miesiąc (np. 32) — Date.UTC przenosi go dalej, więc „jutro” to po prostu day + 1.
export function warsawToDate(year, month, day, hour = 0, minute = 0) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let ms = naive - warsawOffsetMinutes(naive - HOUR) * MIN;
  // Druga próba przy granicy zmiany czasu (godzina, w której przesunięcie się zmienia).
  const again = naive - warsawOffsetMinutes(ms) * MIN;
  if (again !== ms) ms = again;
  return new Date(ms);
}

const pad = (n) => String(n).padStart(2, '0');

// Data i godzina w czasie polskim dla pól wyboru: { ymd: 'RRRR-MM-DD', hm: 'GG:MM' }.
export function warsawYmdHm(at) {
  const p = warsawParts(at);
  return { ymd: `${p.year}-${pad(p.month)}-${pad(p.day)}`, hm: `${pad(p.hour)}:${pad(p.minute)}` };
}

// Pola wyboru (czas polski) → Date; null przy niepełnych/niepoprawnych wartościach.
export function fromWarsawYmdHm(ymd, hm) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  const t = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hm || ''));
  if (!d || !t) return null;
  const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  const out = warsawToDate(y, m, day, Number(t[1]), Number(t[2]));
  // 31.02 itp. — Date.UTC przeniósłby datę na kolejny miesiąc; to błąd wyboru.
  return warsawParts(out).day === day ? out : null;
}

// Termin w dozwolonym oknie (przyszłość z zapasem, najwyżej rok naprzód).
export function isValidChatTime(at, now = new Date()) {
  const ms = toMs(at);
  const n = toMs(now);
  return Number.isFinite(ms) && ms >= n + MIN_LEAD_MS && ms <= n + MAX_AHEAD_MS;
}

// Dzień kalendarzowy w czasie polskim przesunięty o `days` → Date o godzinie hour:minute.
function warsawDayAt(now, days, hour, minute = 0) {
  const p = warsawParts(now);
  return warsawToDate(p.year, p.month, p.day + days, hour, minute);
}

// Gotowe terminy zaplanowanej wiadomości: Dziś 18:00 (gdy jeszcze przed), Jutro 8:00, Jutro 18:00.
// → [{ key, at: Date }] (etykiety nadaje interfejs — zależą od języka).
export function schedulePresets(now = new Date()) {
  const n = toMs(now);
  const list = [
    { key: 'today18', at: warsawDayAt(n, 0, 18) },
    { key: 'tomorrow8', at: warsawDayAt(n, 1, 8) },
    { key: 'tomorrow18', at: warsawDayAt(n, 1, 18) },
  ];
  return list.filter((p) => isValidChatTime(p.at, n));
}

// Najbliższy poniedziałek PO dzisiejszym dniu (w poniedziałek — za tydzień), 9:00 czasu polskiego.
export function nextMondayAt(now = new Date(), hour = 9) {
  const p = warsawParts(now);
  const days = ((8 - p.weekday) % 7) || 7;
  return warsawDayAt(toMs(now), days, hour);
}

// Gotowe terminy przypomnienia: Za 1 godzinę, Za 3 godziny, Jutro 9:00, W poniedziałek 9:00
// (pominięty, gdy wypada jutro — byłby tym samym co „Jutro 9:00”).
export function reminderPresets(now = new Date()) {
  const n = toMs(now);
  const tomorrow9 = warsawDayAt(n, 1, 9);
  const monday9 = nextMondayAt(n, 9);
  const list = [
    { key: 'in1h', at: new Date(n + HOUR) },
    { key: 'in3h', at: new Date(n + 3 * HOUR) },
    { key: 'tomorrow9', at: tomorrow9 },
  ];
  if (monday9.getTime() !== tomorrow9.getTime()) list.push({ key: 'monday9', at: monday9 });
  return list;
}

// Opis terminu do list („dziś 18:00”, „jutro 8:00”, „pon. 26.10, 9:00”) — części do złożenia
// w interfejsie: { kind: 'today' | 'tomorrow' | 'date', time: 'G:MM', date: 'DD.MM' | 'DD.MM.RRRR', weekday }.
export function describeChatTime(at, now = new Date()) {
  const p = warsawParts(at);
  const today = warsawParts(now);
  const tomorrow = warsawParts(warsawDayAt(toMs(now), 1, 12));
  const same = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;
  const time = `${p.hour}:${pad(p.minute)}`;
  const kind = same(p, today) ? 'today' : same(p, tomorrow) ? 'tomorrow' : 'date';
  const date = p.year === today.year ? `${pad(p.day)}.${pad(p.month)}` : `${pad(p.day)}.${pad(p.month)}.${p.year}`;
  return { kind, time, date, weekday: p.weekday };
}

// Krótkie nazwy dni tygodnia (0 = niedziela) — PL; interfejs może podać własne.
export const WEEKDAYS_PL = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];

// Gotowy polski opis (serwer, mobilka): „dziś 18:00”, „jutro 8:00”, „pon. 26.10, 9:00”.
export function chatTimeLabelPl(at, now = new Date()) {
  const d = describeChatTime(at, now);
  if (d.kind === 'today') return `dziś ${d.time}`;
  if (d.kind === 'tomorrow') return `jutro ${d.time}`;
  return `${WEEKDAYS_PL[d.weekday]} ${d.date}, ${d.time}`;
}
