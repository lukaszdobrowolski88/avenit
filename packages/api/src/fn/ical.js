// Port edge function ical: publiczny feed iCalendar per token użytkownika.
// Oryginał: supabase/functions/ical/index.ts. GET, publiczny (token w URL).
// Tenant rozpoznawany po subdomenie; dane z bazy tenanta (req.db).
import crypto from 'node:crypto';
import { accountEmailsForAssignee } from '../lib/assigneeIdentity.js';
import { roleName } from './send-assignment-invites.js';
import { listMyBoardItems } from './my-board-items.js';
import { callerAccess } from './board-import-legacy.js';
import { rsvpBase } from './rsvp-send.js';

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
const MODULE_PREFS = ['worship', 'media', 'atmosfera', 'kids', 'homegroups', 'mlodziezowka'];
const MODULE_LABEL = { worship: 'Uwielbienie', media: 'Media', atmosfera: 'Atmosfera', kids: 'Dzieci', homegroups: 'Grupy Domowe', mlodziezowka: 'Młodzieżówka' };

export function vevent(e) {
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
// ── Moje służby (grafik) ────────────────────────────────────────────────
// Przypisania z schedule_assignments na wydarzeniach. Osoba w grafiku to wpis zespołu
// (assigned_email/assigned_name), a kanał należy do KONTA — konto bywa założone na inny adres,
// więc dopasowanie jak przy pushu: ten sam e-mail albo konto powiązane (lib/assigneeIdentity.js).
// Sprawdzenie raz na unikalną osobę (e-mail, imię, zespół), nie na wiersz. Ten sam adres
// z grafiku to ta sama osoba — gdy pasuje w jednym zespole, pasuje we wszystkich (reguły
// powiązań bywają per zespół, np. user_id tylko w worship_team).
export async function ownerServiceRows(db, rows, ownerEmail) {
  const owner = String(ownerEmail || '').trim().toLowerCase();
  if (!owner) return [];
  const cache = new Map();
  const mineEmails = new Set([owner]);
  const emailOf = (r) => String(r.assigned_email || '').trim().toLowerCase();
  const keyOf = (r) => `${emailOf(r)}\u0000${String(r.assigned_name || '').trim().toLowerCase()}\u0000${r.team_type || ''}`;
  for (const r of rows || []) {
    const email = emailOf(r);
    if (mineEmails.has(email)) continue;
    const key = keyOf(r);
    if (cache.has(key)) continue;
    const linked = await accountEmailsForAssignee(db, { email: r.assigned_email, name: r.assigned_name, teamType: r.team_type })
      .catch(() => []);
    const match = linked.includes(owner);
    cache.set(key, match);
    if (match && email) mineEmails.add(email);
  }
  return (rows || []).filter((r) => mineEmails.has(emailOf(r)) || cache.get(keyOf(r)) === true);
}

const SERVICE_STATUS = { accepted: 'potwierdzone', pending: 'czeka na odpowiedź' };

// Wiersze właściciela (już odfiltrowane) → jeden VEVENT na wydarzenie ze wszystkimi rolami.
// UID stały: id wydarzenia + skrót e-maila właściciela (dwa kanały w jednym kalendarzu się nie zleją).
// labels: Map team_type → nazwa zespołu (app_modules); brak — MODULE_LABEL albo klucz.
export function serviceEvents(rows, { ownerEmail = '', dtstamp, labels = new Map() } = {}) {
  const ownerHash = crypto.createHash('sha1').update(String(ownerEmail).trim().toLowerCase()).digest('hex').slice(0, 10);
  const byEvent = new Map();
  for (const r of rows || []) {
    if (r?.event_id == null || r.status === 'rejected') continue;
    const k = String(r.event_id);
    if (!byEvent.has(k)) byEvent.set(k, { first: r, roles: [], teams: [], statuses: [] });
    const g = byEvent.get(k);
    const role = String(roleName(r.role_key, r.role_label) || '').trim();
    if (role && !g.roles.includes(role)) g.roles.push(role);
    const team = labels.get(r.team_type) || MODULE_LABEL[r.team_type] || r.team_type || '';
    if (team && !g.teams.includes(team)) g.teams.push(team);
    g.statuses.push(r.status === 'accepted' ? 'accepted' : 'pending');
  }
  const out = [];
  for (const [eventId, g] of byEvent) {
    const ev = g.first;
    const d = ymd(ev.event_date);
    if (!d) continue;
    const t = ev.event_time ? String(ev.event_time).slice(0, 5) : null;
    const endDate = ev.event_end_date ? ymd(ev.event_end_date) : d;
    const confirmed = g.statuses.every((st) => st === 'accepted');
    const title = String(ev.event_title || '').trim() || 'Wydarzenie';
    out.push({
      uid: uid(`${eventId}-${ownerHash}`, 'service'),
      summary: `Służba: ${g.roles.join(', ') || 'służba'} — ${title}`,
      description: [g.teams.join(', '), SERVICE_STATUS[confirmed ? 'accepted' : 'pending']].filter(Boolean).join(' · '),
      location: ev.event_location || '',
      ...(t
        ? { dtstart: fmtLocal(d, t), dtend: ev.event_end_time ? fmtLocal(endDate, String(ev.event_end_time).slice(0, 5)) : fmtLocal(d, addHour(t)) }
        : { allDay: true, dtstart: d.replace(/-/g, ''), dtend: nextDay(endDate) }),
      dtstamp, categories: ['Służba'], status: confirmed ? 'CONFIRMED' : 'TENTATIVE',
    });
  }
  return out;
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

// Status VTODO z zadania osobistego / starej tabeli tasks (iCal zna tylko kilka wartości).
export const todoStatus = (status) => (/^(done|completed|gotowe|zrobione)$/i.test(String(status || '')) ? 'COMPLETED' : 'NEEDS-ACTION');

// Właściciel kanału: konto po e-mailu (UserSettings zapisuje user_email), awaryjnie po user_id.
// Kanał działa tylko dla istniejącego, AKTYWNEGO konta — link mógł zostać w kalendarzu osoby,
// której konto zablokowano albo usunięto. → { id, email } albo null.
export async function feedOwner(db, subscription) {
  const email = String(subscription?.user_email || '').trim().toLowerCase();
  const { rows } = email
    ? await db.query(`SELECT id, email, COALESCE(is_active, true) AS active FROM app_users WHERE lower(email) = $1 LIMIT 1`, [email])
    : subscription?.user_id
      ? await db.query(`SELECT id, email, COALESCE(is_active, true) AS active FROM app_users WHERE id = $1`, [subscription.user_id])
      : { rows: [] };
  const u = rows[0];
  if (!u || u.active === false || !u.email) return null;
  return { id: u.id, email: String(u.email).toLowerCase() };
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

  const owner = await feedOwner(req.db, subscription).catch(() => null);
  if (!owner) return reply.code(403).send('Subscription owner inactive');
  // Uprawnienia właściciela (te same co w aplikacji): moduły, do których ma dostęp.
  const access = await callerAccess({ db: req.db, tenant: req.tenant, user: { id: owner.id, email: owner.email } }).catch(() => null);
  if (!access) return reply.code(403).send('Subscription owner inactive');
  const can = access.can;

  await req.db.query(
    `UPDATE ical_subscriptions SET last_accessed_at = now(), access_count = COALESCE(access_count,0)+1 WHERE id = $1`,
    [subscription.id]
  ).catch(() => {});

  const prefs = subscription.export_preferences || {};
  const ownerEmail = owner.email;
  const events = [];
  const emittedEvents = new Set(); // wydarzenia już w kanale — spotkanie wydarzenia nie dubluje wpisu
  const now = new Date();
  const dtstamp = fmtUtc(now);
  const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
  const to = new Date(now); to.setFullYear(to.getFullYear() + 1);
  const fromStr = ymd(from);
  const toStr = ymd(to);

  if (prefs.programs && can('module:programs')) {
    const { rows } = await req.db.query(`SELECT * FROM programs WHERE date >= $1 AND date <= $2`, [fromStr, toStr])
      .catch((err) => { req.log?.warn?.({ err }, 'ical: programs'); return { rows: [] }; });
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
  // segmentów, a link może trafić do innej osoby. Kalendarz ogólny — module:calendar; wydarzenia
  // służby — module:calendar albo moduł tej służby.
  const calendarOk = can('module:calendar');
  const wantModule = MODULE_PREFS.some((k) => prefs[k] && (calendarOk || can(`module:${k}`)));
  if ((prefs.events && calendarOk) || wantModule) {
    const { rows } = await req.db.query(
      `SELECT id, title, description, location, date, time, end_time, end_date, event_type, module_key,
              to_jsonb(events)->>'format' AS format
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
      const isModule = MODULE_PREFS.includes(mk);
      if (!(isModule ? prefs[mk] && (calendarOk || can(`module:${mk}`)) : prefs.events && calendarOk)) continue;
      const d = ymd(ev.date);
      const t = ev.time ? String(ev.time).slice(0, 5) : null;
      const label = MODULE_LABEL[mk];
      emittedEvents.add(String(ev.id));
      // Online/hybrydowe (099): link do wydarzenia, gdzie jest „Dołącz”.
      const online = ev.format === 'online' || ev.format === 'hybrid';
      const evUrl = online ? `${rsvpBase(req.tenant?.subdomain || req.tenant?.slug)}/wydarzenie/${encodeURIComponent(ev.id)}` : '';
      events.push(vevent({
        uid: uid(ev.id, 'event'), summary: ev.title || 'Wydarzenie',
        description: [ev.description || '', online ? `Spotkanie online: ${evUrl}` : ''].filter(Boolean).join('\n\n'),
        location: ev.format === 'online' ? evUrl : (ev.location || ''),
        ...(t
          ? { dtstart: fmtLocal(d, t), dtend: ev.end_time ? fmtLocal(ev.end_date ? ymd(ev.end_date) : d, String(ev.end_time).slice(0, 5)) : fmtLocal(d, addHour(t)) }
          : { allDay: true, dtstart: d.replace(/-/g, ''), dtend: nextDay(ev.end_date ? ymd(ev.end_date) : d) }),
        dtstamp, categories: [label || 'Wydarzenie', ev.event_type || ''].filter(Boolean), status: 'CONFIRMED',
      }));
    }
  }

  // Moje służby z grafiku — domyślnie WŁĄCZONE (kanały sprzed tej opcji też je dostają).
  // Własne przypisania osoby — bez dodatkowych uprawnień. Odrzucone pomijamy.
  // Najbliższe daty najpierw, żeby limit wierszy ucinał najdalsze.
  if (prefs.my_services !== false) {
    const { rows } = await req.db.query(
      `SELECT sa.id, sa.event_id, sa.team_type, sa.role_key, sa.role_label, sa.assigned_name, sa.assigned_email, sa.status,
              e.title AS event_title, e.date::text AS event_date,
              to_jsonb(e)->>'time' AS event_time, to_jsonb(e)->>'end_time' AS event_end_time,
              to_jsonb(e)->>'end_date' AS event_end_date, to_jsonb(e)->>'location' AS event_location
         FROM schedule_assignments sa
         JOIN events e ON e.id::text = sa.event_id::text
        WHERE sa.event_id IS NOT NULL AND COALESCE(sa.status, 'pending') <> 'rejected'
          AND e.date >= $1 AND e.date <= $2
          AND COALESCE(e.is_archived, false) = false
        ORDER BY abs(e.date - CURRENT_DATE), sa.event_id
        LIMIT 2000`,
      [fromStr, toStr]
    ).catch((err) => { req.log?.warn?.({ err }, 'ical: my_services'); return { rows: [] }; });
    if (rows.length) {
      const mine = await ownerServiceRows(req.db, rows, ownerEmail);
      if (mine.length) {
        const { rows: mods } = await req.db.query(`SELECT key, label FROM app_modules`).catch(() => ({ rows: [] }));
        const labels = new Map(mods.filter((m) => m.label).map((m) => [m.key, String(m.label).trim()]));
        for (const svc of serviceEvents(mine, { ownerEmail, dtstamp, labels })) events.push(vevent(svc));
      }
    }
  }

  // Moje spotkania online (098) — domyślnie WŁĄCZONE: uczestnik rozmowy spotkania, bez odrzuconych
  // i odwołanych. Link w opisie prowadzi do spotkania w aplikacji.
  if (prefs.my_meetings !== false && ownerEmail) {
    const { rows } = await req.db.query(
      `SELECT m.id, m.conversation_id, m.title, m.description, m.starts_at, m.ends_at, m.event_id
         FROM meetings m
         JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND lower(cp.user_email) = lower($1)
         LEFT JOIN meeting_invites i ON i.meeting_id = m.id AND i.kind = 'member' AND i.email = lower($1)
        WHERE m.status = 'scheduled' AND COALESCE(i.response, 'pending') <> 'declined'
          AND m.starts_at >= $2::date AND m.starts_at <= $3::date
        ORDER BY m.starts_at LIMIT 500`,
      [ownerEmail, fromStr, toStr]
    ).catch((err) => { if (err?.code !== '42P01') req.log?.warn?.({ err }, 'ical: meetings'); return { rows: [] }; });
    const origin = rsvpBase(req.tenant?.subdomain || req.tenant?.slug);
    for (const m of rows) {
      if (m.event_id && emittedEvents.has(String(m.event_id))) continue;
      const url = `${origin}/komunikator?conversation=${encodeURIComponent(m.conversation_id)}`;
      events.push(vevent({
        uid: m.event_id ? uid(m.event_id, 'event') : `meeting-${m.id}@avenit.app`, summary: m.title || 'Spotkanie online',
        description: [m.description, `Dołącz: ${url}`].filter(Boolean).join('\n\n'), location: url,
        dtstart: fmtUtc(new Date(m.starts_at)), dtend: fmtUtc(new Date(m.ends_at)),
        dtstamp, categories: ['Spotkanie online'], status: 'CONFIRMED',
      }));
    }
  }

  // Zadania — tylko moje:
  //  • elementy tablic z terminem przypisane do mnie (Kalendarz + zakładki „Zadania” służb + Projekty),
  //    z tymi samymi prawami co w aplikacji (listMyBoardItems + uprawnienia właściciela);
  //  • zadania osobiste (user_tasks) — moje albo przypisane mi;
  //  • dopóki tablica Kalendarza nie powstała — stara tabela tasks (z module:calendar).
  if (prefs.tasks) {
    const items = await listMyBoardItems({ db: req.db, email: ownerEmail, can, from: fromStr, to: toStr })
      .catch((err) => { req.log?.warn?.({ err }, 'ical: board tasks'); return []; });
    for (const t of items) {
      events.push(vtodo({
        uid: uid(t.id, 'board-item'), summary: t.name, description: t.board_name || '',
        due: String(t.date).replace(/-/g, ''), dtstamp, status: t.done ? 'COMPLETED' : 'NEEDS-ACTION',
      }));
    }

    const { rows: personal } = await req.db.query(
      `SELECT id, title, description, status, to_jsonb(t)->>'due_date' AS due
         FROM user_tasks t
        WHERE due_date IS NOT NULL
          AND (lower(user_email) = $1 OR lower(COALESCE(to_jsonb(t)->>'assigned_to_email', '')) = $1)
        ORDER BY due_date
        LIMIT 2000`,
      [ownerEmail]
    ).catch((err) => { req.log?.warn?.({ err }, 'ical: user_tasks'); return { rows: [] }; });
    for (const t of personal) {
      const d = String(t.due || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < fromStr || d > toStr) continue;
      events.push(vtodo({
        uid: uid(t.id, 'user-task'), summary: t.title || 'Zadanie', description: t.description || '',
        due: d.replace(/-/g, ''), dtstamp, status: todoStatus(t.status),
      }));
    }

    const { rows: calBoard } = await req.db.query(`SELECT 1 FROM boards WHERE source_kind = 'tasks' LIMIT 1`).catch(() => ({ rows: [] }));
    if (!calBoard.length && calendarOk) {
      const { rows } = await req.db.query(
        `SELECT * FROM tasks WHERE due_date IS NOT NULL AND due_date >= $1 AND due_date <= $2
            AND (lower(assigned_to) = $3 OR lower(created_by) = $3)`,
        [fromStr, toStr, ownerEmail]
      ).catch(() => ({ rows: [] }));
      for (const t of rows) {
        events.push(vtodo({
          uid: uid(t.id, 'task'), summary: t.title, description: t.description || '',
          due: ymd(t.due_date).replace(/-/g, ''), dtstamp, status: todoStatus(t.status),
        }));
      }
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
