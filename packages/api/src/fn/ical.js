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

// Kolumny DATE przychodzą z pg jako Date (północ czasu serwera) — zamiana na YYYY-MM-DD.
function ymd(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}
const nextDay = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  return ymd(new Date(y, m - 1, dd + 1)).replace(/-/g, '');
};
const addHour = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
};

// Preferencje modułów służb (UserSettings) → module_key wydarzeń.
const MODULE_PREFS = ['worship', 'media', 'atmosfera', 'kids', 'homegroups'];
const MODULE_LABEL = { worship: 'Uwielbienie', media: 'Media', atmosfera: 'Atmosfera', kids: 'Dzieci', homegroups: 'Grupy Domowe' };

function vevent(e) {
  // Całodniowe (bez godziny): DTSTART;VALUE=DATE, DTEND = dzień po ostatnim.
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${e.dtstamp}`, e.allDay ? `DTSTART;VALUE=DATE:${e.dtstart}` : `DTSTART:${e.dtstart}`];
  if (e.dtend) lines.push(e.allDay ? `DTEND;VALUE=DATE:${e.dtend}` : `DTEND:${e.dtend}`);
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
  if (e.due) lines.push(/^\d{8}$/.test(e.due) ? `DUE;VALUE=DATE:${e.due}` : `DUE:${e.due}`);
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
  if (!subscription || subscription.is_active === false) return reply.code(404).send('Subscription not found');

  await req.db.query(
    `UPDATE ical_subscriptions SET last_accessed_at = now(), access_count = COALESCE(access_count,0)+1 WHERE id = $1`,
    [subscription.id]
  ).catch(() => {});

  const prefs = subscription.export_preferences || {};
  // Właściciel kanału — po e-mailu (UserSettings zapisuje user_email), awaryjnie po user_id.
  let ownerEmail = String(subscription.user_email || '').toLowerCase();
  if (!ownerEmail && subscription.user_id) {
    const { rows } = await req.db.query(`SELECT email FROM app_users WHERE id = $1`, [subscription.user_id]).catch(() => ({ rows: [] }));
    ownerEmail = String(rows[0]?.email || '').toLowerCase();
  }
  const events = [];
  const now = new Date();
  const dtstamp = fmtUtc(now);
  const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
  const to = new Date(now); to.setFullYear(to.getFullYear() + 1);
  const fromStr = ymd(from);
  const toStr = ymd(to);

  if (prefs.programs) {
    const { rows } = await req.db.query(`SELECT * FROM programs WHERE date >= $1 AND date <= $2`, [fromStr, toStr]);
    for (const p of rows) {
      const d = ymd(p.date);
      events.push(vevent({
        uid: uid(p.id, 'program'), summary: p.title || 'Nabożeństwo', description: p.notes || '',
        location: p.location || 'Kościół', dtstart: fmtLocal(d, '10:00'), dtend: fmtLocal(d, '12:00'),
        dtstamp, categories: ['Nabożeństwo'], status: 'CONFIRMED',
      }));
    }
  }

  // Wydarzenia: jedna tabela `events` (date/time/end_time; dawne tabele modułów usunięte
  // migracją 077). Moduł służby wg preferencji (worship, media…), reszta wg „events”.
  // Tylko wydarzenia bez ograniczonej widoczności (albo moje) — kanał ICS nie zna kontekstu
  // segmentów, a link może trafić do innej osoby.
  const wantModule = MODULE_PREFS.some((k) => prefs[k]);
  if (prefs.events || wantModule) {
    const { rows } = await req.db.query(
      `SELECT id, title, description, location, date, time, end_time, end_date, event_type, module_key
         FROM events
        WHERE date >= $1 AND date <= $2
          AND COALESCE(is_archived, false) = false
          AND (visibility_segments IS NULL
               OR jsonb_typeof(visibility_segments) <> 'array'
               OR jsonb_array_length(visibility_segments) = 0
               OR visibility_segments @> '[{"type":"everyone"}]'::jsonb
               OR ($3 <> '' AND lower(created_by) = $3))`,
      [fromStr, toStr, ownerEmail]
    ).catch((err) => { req.log?.warn?.({ err }, 'ical: events'); return { rows: [] }; });
    for (const ev of rows) {
      const mk = ev.module_key || '';
      if (!(MODULE_PREFS.includes(mk) ? prefs[mk] : prefs.events)) continue;
      const d = ymd(ev.date);
      const t = ev.time ? String(ev.time).slice(0, 5) : null;
      const label = MODULE_LABEL[mk];
      events.push(vevent({
        uid: uid(ev.id, 'event'), summary: ev.title || 'Wydarzenie', description: ev.description || '', location: ev.location || '',
        ...(t
          ? { dtstart: fmtLocal(d, t), dtend: ev.end_time ? fmtLocal(ev.end_date ? ymd(ev.end_date) : d, String(ev.end_time).slice(0, 5)) : fmtLocal(d, addHour(t)) }
          : { allDay: true, dtstart: d.replace(/-/g, ''), dtend: nextDay(ev.end_date ? ymd(ev.end_date) : d) }),
        dtstamp, categories: [label || 'Wydarzenie', ev.event_type || ''].filter(Boolean), status: 'CONFIRMED',
      }));
    }
  }

  // Zadania — tylko moje (przypisane do mnie albo utworzone przeze mnie), nie całej organizacji.
  if (prefs.tasks && ownerEmail) {
    const { rows } = await req.db.query(
      `SELECT * FROM tasks WHERE due_date IS NOT NULL AND due_date >= $1 AND due_date <= $2
          AND (lower(assigned_to) = $3 OR lower(created_by) = $3)`,
      [fromStr, toStr, ownerEmail]
    ).catch(() => ({ rows: [] }));
    for (const t of rows) {
      events.push(vtodo({
        uid: uid(t.id, 'task'), summary: t.title, description: t.description || '',
        due: ymd(t.due_date).replace(/-/g, ''), dtstamp, status: t.status,
      }));
    }
  }

  // Młodzieżówka ma jeszcze własną tabelę wydarzeń (start_date).
  if (prefs.mlodziezowka) {
    const { rows } = await req.db.query(
      `SELECT * FROM mlodziezowka_events WHERE start_date >= $1 AND start_date <= $2`,
      [from.toISOString(), to.toISOString()]
    ).catch(() => ({ rows: [] }));
    for (const ev of rows) {
      const start = new Date(ev.start_date);
      events.push(vevent({
        uid: uid(ev.id, 'mlodziezowka'), summary: ev.title, description: ev.description || '', location: ev.location || '',
        dtstart: fmtUtc(start), dtstamp, categories: ['Młodzieżówka', ev.event_type || ''].filter(Boolean),
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
