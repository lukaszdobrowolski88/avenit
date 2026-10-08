// Worker: przypomnienia z grafiku służb (codziennie 18:00, worker.js).
// Konfiguracja w app_settings['schedule_reminders'] (JSON):
//   { enabled: true, days_before: 2, nudge_enabled: true, nudge_after_days: 3 }
// (a) PRZYPOMNIENIE — osoby, które potwierdziły służbę (status 'accepted'), dostają na
//     days_before dni przed wydarzeniem jeden mail + jeden push ze WSZYSTKIMI swoimi rolami na
//     tym wydarzeniu (ze wszystkich zespołów). Stempel reminder_sent_at.
// (b) PONAGLENIE — osoby bez odpowiedzi (status 'pending') nudge_after_days dni po zaproszeniu
//     dostają ponownie zaproszenie z TYM SAMYM tokenem (linki Potwierdzam / Nie mogę działają
//     dalej) + push. Stempel nudge_sent_at — każde ponaglenie najwyżej raz.
// Push zawsze na konta powiązane z osobą z grafiku (lib/assigneeIdentity.js).
// Brak tabel/kolumn w tenancie (migracja 090 jeszcze nie weszła) → log i zera, bez wyjątku.
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';
import { sendPushCore } from './send-push.js';
import { rsvpBase } from './rsvp-send.js';
import { accountEmailsForAssignee } from '../lib/assigneeIdentity.js';
import { emailHtml, emailText, roleName, shortTime, dateLong, dateShort } from './send-assignment-invites.js';

export const name = 'schedule-reminders';
export const skipRoute = true; // tylko worker

export const REMINDER_DEFAULTS = Object.freeze({ enabled: true, days_before: 2, nudge_enabled: true, nudge_after_days: 3 });

const boolOr = (v, def) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : def);
const intIn = (v, min, max, def) => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

// Ustawienia z app_settings (tekst JSON albo obiekt) → pełny, bezpieczny config.
// Brak/niepoprawne wartości → domyślne; dni przycięte do sensownych zakresów.
export function reminderConfig(raw) {
  let c = raw;
  if (typeof c === 'string') {
    try { c = JSON.parse(c); } catch { c = null; }
  }
  if (!c || typeof c !== 'object' || Array.isArray(c)) c = {};
  const d = REMINDER_DEFAULTS;
  return {
    enabled: boolOr(c.enabled, d.enabled),
    days_before: intIn(c.days_before, 1, 7, d.days_before),
    nudge_enabled: boolOr(c.nudge_enabled, d.nudge_enabled),
    nudge_after_days: intIn(c.nudge_after_days, 1, 14, d.nudge_after_days),
  };
}

const lower = (v) => String(v ?? '').trim().toLowerCase();
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

// Wspólny szkielet grupy (wydarzenie + osoba) z wierszy schedule_assignments ⋈ events.
function newGroup(r) {
  return {
    eventId: r.event_id,
    email: String(r.assigned_email).trim(),
    name: r.assigned_name || '',
    ids: [],
    roles: [],
    teamTypes: [],
    event: {
      title: String(r.event_title || '').trim() || 'Wydarzenie',
      date: r.event_date,
      time: shortTime(r.event_time),
      location: String(r.event_location || '').trim(),
      campusId: r.campus_id ?? null,
    },
    daysLeft: r.days_left == null ? null : Number(r.days_left),
  };
}
function addRow(g, r) {
  g.ids.push(r.id);
  const role = roleName(r.role_key, r.role_label);
  if (role && !g.roles.includes(role)) g.roles.push(role);
  if (r.team_type && !g.teamTypes.includes(r.team_type)) g.teamTypes.push(r.team_type);
}

// (a) Jedna wiadomość na (wydarzenie, osoba) — role ze wszystkich zespołów razem.
export function groupReminders(rows) {
  const out = new Map();
  for (const r of rows || []) {
    if (r?.event_id == null || !lower(r.assigned_email)) continue;
    const key = `${r.event_id}\u0000${lower(r.assigned_email)}`;
    if (!out.has(key)) out.set(key, newGroup(r));
    addRow(out.get(key), r);
  }
  return [...out.values()];
}

// (b) Jedno ponaglenie na (wydarzenie, osoba, token) — token z zaproszenia obejmuje dokładnie
// te przypisania, które odpowiedź z linku zmieni (zaproszenia z różnych zespołów mają różne tokeny).
export function groupNudges(rows) {
  const out = new Map();
  for (const r of rows || []) {
    if (r?.event_id == null || !lower(r.assigned_email) || !r.token) continue;
    const key = `${r.event_id}\u0000${lower(r.assigned_email)}\u0000${r.token}`;
    if (!out.has(key)) out.set(key, { ...newGroup(r), token: String(r.token), by: '' });
    const g = out.get(key);
    if (!g.by && r.assigned_by_name) g.by = String(r.assigned_by_name).trim();
    addRow(g, r);
  }
  return [...out.values()];
}

// Nazwa(y) zespołu(ów) z app_modules (klucz = team_type); bez etykiety — nic.
export function teamLabelOf(teamTypes, labels) {
  return uniq((teamTypes || []).map((t) => labels?.get?.(t) || '')).join(' · ');
}

// Treść pusha (czysta funkcja — testowalna). kind: 'reminder' | 'nudge'.
export function pushPayload(kind, g, teamLabel = '') {
  const when = `${dateShort(g.event.date)}${g.event.time ? `, ${g.event.time}` : ''}`;
  const roles = g.roles.join(', ');
  const link = `/wydarzenie/${g.eventId}`;
  if (kind === 'nudge') {
    // Jedna rola → przyciski „Akceptuję / Odrzucam” prosto z powiadomienia (jak przy zaproszeniu).
    const single = g.ids.length === 1 ? g.ids[0] : null;
    return {
      title: `${teamLabel ? `${teamLabel}: ` : ''}czekamy na odpowiedź`,
      body: `${roles} · ${dateShort(g.event.date)} · ${g.event.title}. Potwierdzisz?`,
      link,
      category_id: single ? 'assignment_invite' : undefined,
      data: { type: 'assignment', assignmentId: single, event_id: g.eventId, program_id: null },
    };
  }
  return {
    title: `${teamLabel ? `${teamLabel}: ` : ''}przypomnienie o służbie`,
    body: `${roles} · ${when} · ${g.event.title}`,
    link,
    data: { type: 'schedule_reminder', event_id: g.eventId },
  };
}

// Wspólne kolumny wydarzenia. Kolumny opcjonalne przez to_jsonb (różnią się między tenantami);
// data jako tekst 'YYYY-MM-DD' (bez przesunięcia strefy w pg → Date).
const TODAY = `(now() AT TIME ZONE 'Europe/Warsaw')::date`;
const EVENT_COLS = `e.title AS event_title, e.date::text AS event_date,
       to_jsonb(e)->>'time' AS event_time, to_jsonb(e)->>'location' AS event_location,
       to_jsonb(e)->>'campus_id' AS campus_id, (e.date - ${TODAY})::int AS days_left`;
const NOT_ARCHIVED = `COALESCE((to_jsonb(e)->>'is_archived')::boolean, false) = false`;
const MAX_ROWS = 2000;

async function safeRows(pool, sql, params, log, what) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    log(`schedule-reminders: ${what} pominięte (${err.message})`);
    return null;
  }
}

// ctx.deps (tylko testy): podmiana wysyłki — { sendEmail, sendPush, emailReady }.
export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  const result = { reminded: 0, nudged: 0 };
  const deps = { sendEmail, sendPush: sendPushCore, emailReady: null, ...(ctx.deps || {}) };
  try {
    const { rows: cfgRows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'schedule_reminders'`)
      .catch(() => ({ rows: [] }));
    const cfg = reminderConfig(cfgRows[0]?.value);
    if (!cfg.enabled) return result;

    const base = rsvpBase(ctx.tenantSubdomain || ctx.tenantSlug);
    const emailReady = deps.emailReady ?? !!(config.RESEND_API_KEY || config.SENDGRID_API_KEY || config.DEFAULT_SMTP_HOST);

    // Nazwy zespołów i kampusów — raz na przebieg.
    const labels = new Map(((await safeRows(pool, `SELECT key, label FROM app_modules`, [], () => {}, '')) || [])
      .map((m) => [m.key, String(m.label || '').trim()]));
    let campuses = null;
    const placeOf = async (ev) => {
      if (ev.location || ev.campusId == null) return ev.location;
      if (!campuses) {
        campuses = new Map(((await safeRows(pool, `SELECT id::text AS id, name FROM campuses`, [], () => {}, '')) || [])
          .map((c) => [c.id, c.name || '']));
      }
      return campuses.get(String(ev.campusId)) || '';
    };

    // Konta do pusha — cache per (e-mail, imię, zespół), żeby nie pytać bazy wiele razy.
    const accountCache = new Map();
    const accountsFor = async (g) => {
      const out = new Set();
      for (const teamType of g.teamTypes.length ? g.teamTypes : [null]) {
        const key = `${lower(g.email)}\u0000${lower(g.name)}\u0000${teamType}`;
        if (!accountCache.has(key)) {
          accountCache.set(key, await accountEmailsForAssignee(pool, { email: g.email, name: g.name, teamType }).catch(() => [lower(g.email)]));
        }
        accountCache.get(key).forEach((e) => out.add(e));
      }
      return [...out];
    };
    const push = async (g, payload) => {
      let reached = false;
      try {
        for (const userEmail of await accountsFor(g)) {
          const res = await deps.sendPush(pool, { ...payload, user_email: userEmail });
          if (res?.body?.sent > 0) reached = true;
        }
      } catch (err) {
        log(`schedule-reminders: push nieudany (${err.message})`);
      }
      return reached;
    };
    const mail = async (to, subject, args) => {
      if (!emailReady) return false;
      try {
        await deps.sendEmail({ to, subject, html: emailHtml(args), text: emailText(args) });
        return true;
      } catch (err) {
        log(`schedule-reminders: e-mail nieudany (${err.message})`);
        return false;
      }
    };

    // ── (a) Przypomnienia dla potwierdzonych ──────────────────────────────────────
    // Okno (dziś, dziś + days_before] zamiast jednego dnia: przebieg, który nie doszedł do
    // osoby (awaria maila i pusha, przerwa workera) albo późna akceptacja — dostaną
    // przypomnienie w kolejnym przebiegu, nadal przed wydarzeniem.
    const remRows = await safeRows(pool,
      `SELECT sa.id, sa.event_id, sa.team_type, sa.role_key, sa.role_label, sa.assigned_name, sa.assigned_email,
              ${EVENT_COLS}
         FROM schedule_assignments sa
         JOIN events e ON e.id::text = sa.event_id::text
        WHERE sa.status = 'accepted' AND sa.reminder_sent_at IS NULL
          AND sa.event_id IS NOT NULL
          AND sa.assigned_email IS NOT NULL AND trim(sa.assigned_email) <> ''
          AND e.date > ${TODAY} AND e.date <= ${TODAY} + $1::int
          AND ${NOT_ARCHIVED}
        ORDER BY e.date, sa.event_id
        LIMIT ${MAX_ROWS}`,
      [cfg.days_before], log, 'przypomnienia');

    for (const g of groupReminders(remRows || [])) {
      try {
        const teamLabel = teamLabelOf(g.teamTypes, labels);
        const programDate = dateLong(g.event.date);
        const args = {
          variant: 'reminder', roles: g.roles, programDate, programTitle: g.event.title, contextLabel: 'Wydarzenie',
          teamLabel, timeLabel: g.event.time, place: await placeOf(g.event),
          detailsUrl: `${base}/wydarzenie/${g.eventId}`, daysBefore: g.daysLeft,
        };
        const subject = g.roles.length > 1
          ? `Przypomnienie o służbie (${g.roles.length}) — ${programDate}`
          : `Przypomnienie o służbie: ${g.roles[0]} — ${programDate}`;
        const emailed = await mail(g.email, subject, args);
        // Push best-effort — także gdy mail się nie udał.
        const pushed = await push(g, pushPayload('reminder', g, teamLabel));
        // Stempel, gdy CHOĆ JEDEN kanał dotarł: inaczej kolejny przebieg ponowiłby oba kanały
        // i osoba dostałaby drugiego pusha. Gdy nie dotarł żaden — zostaje na ponowienie.
        if (emailed || pushed) {
          await pool.query(
            `UPDATE schedule_assignments SET reminder_sent_at = now() WHERE id::text = ANY($1::text[]) AND reminder_sent_at IS NULL`,
            [g.ids.map(String)]
          );
          result.reminded++;
        }
      } catch (err) {
        log(`schedule-reminders: przypomnienie (wydarzenie ${g.eventId}) błąd: ${err.message}`);
      }
    }

    // ── (b) Ponaglenia dla osób bez odpowiedzi ───────────────────────────────────
    if (cfg.nudge_enabled) {
      const nudgeRows = await safeRows(pool,
        `SELECT sa.id, sa.event_id, sa.team_type, sa.role_key, sa.role_label, sa.assigned_name, sa.assigned_email,
                sa.assigned_by_name, sa.token::text AS token,
                ${EVENT_COLS}
           FROM schedule_assignments sa
           JOIN events e ON e.id::text = sa.event_id::text
          WHERE sa.status = 'pending' AND sa.nudge_sent_at IS NULL
            AND sa.token IS NOT NULL AND sa.event_id IS NOT NULL
            AND sa.email_sent_at IS NOT NULL
            AND sa.email_sent_at <= now() - ($1::int * interval '1 day')
            AND sa.assigned_email IS NOT NULL AND trim(sa.assigned_email) <> ''
            AND e.date >= ${TODAY} + 1
            AND ${NOT_ARCHIVED}
          ORDER BY e.date, sa.event_id
          LIMIT ${MAX_ROWS}`,
        [cfg.nudge_after_days], log, 'ponaglenia');

      for (const g of groupNudges(nudgeRows || [])) {
        try {
          const teamLabel = teamLabelOf(g.teamTypes, labels);
          const programDate = dateLong(g.event.date);
          const token = encodeURIComponent(g.token);
          const args = {
            variant: 'nudge', assignedByName: g.by || 'Lider służby', roles: g.roles, programDate,
            programTitle: g.event.title, contextLabel: 'Wydarzenie', teamLabel, timeLabel: g.event.time,
            place: await placeOf(g.event),
            acceptUrl: `${base}/assignment-response?token=${token}&action=accept`,
            rejectUrl: `${base}/assignment-response?token=${token}&action=reject`,
          };
          const subject = g.roles.length > 1
            ? `Czekamy na odpowiedź (${g.roles.length}) — ${programDate}`
            : `Czekamy na odpowiedź: ${g.roles[0]} — ${programDate}`;
          const emailed = await mail(g.email, subject, args);
          const pushed = await push(g, pushPayload('nudge', g, teamLabel));
          // Ta sama zasada co przy przypomnieniu: stempel, gdy dotarł mail albo push.
          if (emailed || pushed) {
            await pool.query(
              `UPDATE schedule_assignments SET nudge_sent_at = now() WHERE id::text = ANY($1::text[]) AND nudge_sent_at IS NULL`,
              [g.ids.map(String)]
            );
            result.nudged++;
          }
        } catch (err) {
          log(`schedule-reminders: ponaglenie (wydarzenie ${g.eventId}) błąd: ${err.message}`);
        }
      }
    }
  } catch (err) {
    log(`schedule-reminders: błąd (${err.message})`);
  }
  log(`schedule-reminders: przypomnień ${result.reminded}, ponagleń ${result.nudged}`);
  return result;
}
