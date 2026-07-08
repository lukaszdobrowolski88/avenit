// Port edge function ical: publiczny feed iCalendar per token użytkownika.
// Oryginał: supabase/functions/ical/index.ts. GET, publiczny (token w URL).
// Tenant rozpoznawany po subdomenie; dane z bazy tenanta (req.db).
export const name = 'ical';
export const method = 'GET';
export const isPublic = true;
// Token w ścieżce: /api/fn/ical/<token> (alias bez tokenu dla ?token=).
export const routePath = '/api/fn/ical/:token';
export const routePathAlias = '/api/fn/ical';

function fmtUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function fmtLocal(dateStr, timeStr) {
  const d = timeStr ? new Date(`${dateStr}T${timeStr}:00`) : new Date(`${dateStr}T00:00:00`);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function esc(t) {
  if (!t) return '';
  return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
const uid = (id, type) => `${type}-${id}@avenit.app`;

function vevent(e) {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${e.dtstamp}`, `DTSTART:${e.dtstart}`];
  if (e.dtend) lines.push(`DTEND:${e.dtend}`);
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.filter(Boolean).join(',')}`);
  if (e.status) lines.push(`STATUS:${e.status}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}
function vtodo(e) {
  const lines = ['BEGIN:VTODO', `UID:${e.uid}`, `DTSTAMP:${e.dtstamp}`];
  if (e.due) lines.push(`DUE:${e.due}`);
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.status) lines.push(`STATUS:${e.status}`);
  lines.push('END:VTODO');
  return lines.join('\r\n');
}

export default async function handler(req, reply) {
  // Token z końca ścieżki: /api/fn/ical/<token>. Fastify nie ma wildcard tu,
  // więc token przyjmujemy z query (?token=) lub z ostatniego segmentu.
  const token = req.params?.token || req.query?.token || String(req.url).split('?')[0].split('/').pop();
  if (!token || token.length < 32) return reply.code(400).send('Invalid token');

  const { rows: subRows } = await req.db.query(
    `SELECT * FROM ical_subscriptions WHERE token = $1`, [token]
  );
  const subscription = subRows[0];
  if (!subscription) return reply.code(404).send('Subscription not found');

  await req.db.query(
    `UPDATE ical_subscriptions SET last_accessed_at = now(), access_count = COALESCE(access_count,0)+1 WHERE id = $1`,
    [subscription.id]
  ).catch(() => {});

  const prefs = subscription.export_preferences || {};
  const events = [];
  const now = new Date();
  const dtstamp = fmtUtc(now);
  const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
  const to = new Date(now); to.setFullYear(to.getFullYear() + 1);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  if (prefs.programs) {
    const { rows } = await req.db.query(`SELECT * FROM programs WHERE date >= $1 AND date <= $2`, [fromStr, toStr]);
    for (const p of rows) {
      events.push(vevent({
        uid: uid(p.id, 'program'), summary: p.title || 'Nabożeństwo', description: p.notes || '',
        location: p.location || 'Kościół', dtstart: fmtLocal(p.date, '10:00'), dtend: fmtLocal(p.date, '12:00'),
        dtstamp, categories: ['Nabożeństwo'], status: 'CONFIRMED',
      }));
    }
  }
  if (prefs.events) {
    const { rows } = await req.db.query(
      `SELECT * FROM events WHERE COALESCE(start_date, created_at) >= $1 AND COALESCE(start_date, created_at) <= $2`,
      [from.toISOString(), to.toISOString()]
    ).catch(() => ({ rows: [] }));
    for (const ev of rows) {
      const dateStr = (ev.start_date || ev.date || '').toString().split('T')[0];
      events.push(vevent({
        uid: uid(ev.id, 'event'), summary: ev.title, description: ev.description || '', location: ev.location || '',
        dtstart: fmtLocal(dateStr, '10:00'), dtend: fmtLocal(dateStr, '11:00'), dtstamp,
        categories: [ev.event_type || 'Wydarzenie'], status: 'CONFIRMED',
      }));
    }
  }
  if (prefs.tasks) {
    const { rows } = await req.db.query(
      `SELECT * FROM tasks WHERE due_date IS NOT NULL AND due_date >= $1 AND due_date <= $2`,
      [fromStr, toStr]
    ).catch(() => ({ rows: [] }));
    for (const t of rows) {
      events.push(vtodo({
        uid: uid(t.id, 'task'), summary: t.title, description: t.description || '',
        due: fmtUtc(new Date(t.due_date)), dtstamp, status: t.status,
      }));
    }
  }

  const ministry = [
    ['mlodziezowka', 'mlodziezowka_events', 'Młodzieżówka'],
    ['worship', 'worship_events', 'Uwielbienie'],
    ['media', 'media_events', 'Media'],
    ['atmosfera', 'atmosfera_events', 'Atmosfera'],
    ['kids', 'kids_events', 'Dzieci'],
    ['homegroups', 'homegroups_events', 'Grupy Domowe'],
  ];
  for (const [key, table, category] of ministry) {
    if (!prefs[key]) continue;
    const { rows } = await req.db.query(
      `SELECT * FROM ${table} WHERE start_date >= $1 AND start_date <= $2`,
      [from.toISOString(), to.toISOString()]
    ).catch(() => ({ rows: [] }));
    for (const ev of rows) {
      const start = new Date(ev.start_date);
      const dateStr = start.toISOString().split('T')[0];
      const timeStr = ev.event_time || start.toISOString().split('T')[1].substring(0, 5);
      events.push(vevent({
        uid: uid(ev.id, key), summary: ev.title, description: ev.description || '', location: ev.location || '',
        dtstart: fmtLocal(dateStr, timeStr), dtstamp, categories: [category, ev.event_type || ''].filter(Boolean),
        status: 'CONFIRMED',
      }));
    }
  }

  const ical = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Avenit//Calendar//PL', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:Avenit', 'X-WR-TIMEZONE:Europe/Warsaw',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Warsaw',
    'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'END:STANDARD',
    'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'END:DAYLIGHT', 'END:VTIMEZONE',
    ...events, 'END:VCALENDAR',
  ].join('\r\n');

  return reply
    .header('Content-Type', 'text/calendar; charset=utf-8')
    .header('Content-Disposition', 'attachment; filename="avenit.ics"')
    .header('Cache-Control', 'no-cache, no-store, must-revalidate')
    .send(ical);
}
