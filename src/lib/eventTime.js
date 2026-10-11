// Czy wydarzenie już się skończyło — wspólne dla „nadchodzących” na Pulpicie, w profilu itd.
// Wcześniej listy filtrowały tylko po dacie (date >= dziś), więc dzisiejsze nabożeństwo o 11:00
// wisiało jako „Najbliższe / wkrótce” do północy.
//
// Koniec wydarzenia:
//  • jest end_time → (end_date || date) + end_time,
//  • jest tylko time → start + DEFAULT_DURATION_MIN (albo koniec end_date, gdy trwa kilka dni),
//  • brak godzin (całodniowe) → koniec dnia (end_date || date).

export const DEFAULT_DURATION_MIN = 120;

// Data lokalna YYYY-MM-DD (toISOString daje datę UTC — po północy lokalnie „wczoraj”).
export const localYmd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
};
const parseTime = (s) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '').trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/** Moment zakończenia wydarzenia (Date) albo null, gdy brak daty. */
export function eventEnd(ev) {
  const day = parseDay(ev?.date);
  if (!day) return null;
  const endDay = parseDay(ev?.end_date) || day;
  const endTime = parseTime(ev?.end_time);
  if (endTime) return new Date(endDay[0], endDay[1], endDay[2], endTime[0], endTime[1]);
  const start = parseTime(ev?.time);
  const multiDay = ev?.end_date && String(ev.end_date).slice(0, 10) !== String(ev.date).slice(0, 10);
  if (start && !multiDay) {
    return new Date(day[0], day[1], day[2], start[0], start[1] + DEFAULT_DURATION_MIN);
  }
  return new Date(endDay[0], endDay[1], endDay[2], 23, 59, 59);
}

/** Czy wydarzenie już się zakończyło (trwające nadal się liczy jako nadchodzące). */
export function isEventOver(ev, now = new Date()) {
  const end = eventEnd(ev);
  return !!end && end.getTime() < now.getTime();
}
