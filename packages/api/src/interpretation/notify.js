// Powiadomienia tłumaczy dodanych / zdjętych RĘCZNIE w karcie „Tłumaczenie na żywo”
// (interp-session-upsert). Tłumacze z grafiku (interpretation_interpreters.source = 'schedule')
// mają własną ścieżkę — zaproszenie z grafiku (send-assignment-invites) — i tu ich pomijamy.
//
// Reguła (czysta, testowana — diffInterpreters):
//   • stan PRZED i PO zapisie: pary (kod języka, e-mail konta) — ręczne i wszystkie;
//   • dodany = para ręczna po zapisie, której przed zapisem nie było w ogóle (żadnym źródłem),
//   • zdjęty = para ręczna sprzed zapisu, której po zapisie nie ma żadnym źródłem,
//   • osoba zapisująca nie dostaje powiadomień o sobie; zapis bez zmian = nic (idempotentnie);
//   • dodany, który ma zaproszenie z grafiku tłumaczy tego wydarzenia (oczekujące albo
//     potwierdzone) — bez powiadomienia (grafik powiadamia sam);
//   • tylko aktywne konta i wydarzenia, które się jeszcze nie skończyły.
// Na osobę jedna wiadomość: dodany do języka(ów) → zaproszenie (e-mail + dzwonek + push, link
// do konsoli tłumacza); tylko zdjęty → krótka informacja „Nie tłumaczysz już…”.
// Wysyłka PO zapisie (w tle; w testach deps.inline — czekamy); błędy w logu, nigdy nie psują
// zapisu. Bez znacznika wysyłki: o tym, kogo powiadomić, decyduje różnica stanu jednego zapisu
// (ponowny zapis bez zmian nic nie wysyła).
//
// Linki: web — konsola /tlumaczenie/konsola/<id> (zdjęty: strona wydarzenia /wydarzenie/<id>);
// aplikacja (konsola jest tylko na webie) — data.app_link = /events/<id> (ekran wydarzenia z kartą).
import { accountEmailsForAssignee } from '../lib/assigneeIdentity.js';
import { activeAccounts, namesOf } from '../meetings/service.js';
import { utcToZoned } from '../meetings/logic.js';
import { churchName } from '../calls/guests.js';
import { rsvpBase } from '../fn/rsvp-send.js';
import { escapeHtml, dateLong, dateShort, shortTime } from '../fn/send-assignment-invites.js';
import { moduleLanguages, TEAM_TYPE } from './team.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const key = (lang, email) => `${lang}|${email}`;
export const NOTIFY_TYPE = 'event';
export const consolePath = (eventId) => `/tlumaczenie/konsola/${encodeURIComponent(String(eventId))}`;
export const eventPath = (eventId) => `/wydarzenie/${encodeURIComponent(String(eventId))}`;
export const appEventLink = (eventId) => `/events/${encodeURIComponent(String(eventId))}`;

// ── Stan przypisań ──────────────────────────────────────────────────────────
// → { manual: Set('lang|email'), all: Set('lang|email') }. Przed migracją 117 (bez kolumny
// source) wszyscy są ręczni.
export const emptySnapshot = () => ({ manual: new Set(), all: new Set() });
export async function snapshotInterpreters(db, sessionId) {
  const out = emptySnapshot();
  if (!sessionId) return out;
  let rows;
  try {
    ({ rows } = await db.query(
      `SELECT c.lang_code, lower(i.user_email) AS e, i.source FROM interpretation_interpreters i
         JOIN interpretation_channels c ON c.id = i.channel_id WHERE c.session_id = $1`, [sessionId]));
  } catch (err) {
    if (err?.code !== '42703') throw err;
    ({ rows } = await db.query(
      `SELECT c.lang_code, lower(i.user_email) AS e, NULL AS source FROM interpretation_interpreters i
         JOIN interpretation_channels c ON c.id = i.channel_id WHERE c.session_id = $1`, [sessionId]));
  }
  for (const r of rows) {
    const k = key(r.lang_code, r.e);
    out.all.add(k);
    if ((r.source || 'manual') !== 'schedule') out.manual.add(k);
  }
  return out;
}

// ── Różnica (czyste) ────────────────────────────────────────────────────────
// → [{ email, kind: 'added'|'removed', langs: [kod] }] (kolejność: e-mail).
// skipAdded — e-maile, których dodania nie ogłaszamy (zaproszenie z grafiku).
export function diffInterpreters(before, after, { actor = '', skipAdded = new Set() } = {}) {
  const b = before || emptySnapshot();
  const a = after || emptySnapshot();
  const me = lower(actor);
  const per = new Map();
  const at = (e) => {
    if (!per.has(e)) per.set(e, { added: [], removed: [] });
    return per.get(e);
  };
  for (const k of a.manual) {
    if (b.all.has(k)) continue;
    const [lang, e] = k.split('|');
    if (e === me || skipAdded.has(e)) continue;
    at(e).added.push(lang);
  }
  for (const k of b.manual) {
    if (a.all.has(k)) continue;
    const [lang, e] = k.split('|');
    if (e === me) continue;
    at(e).removed.push(lang);
  }
  const out = [];
  for (const [email, x] of [...per.entries()].sort(([p], [q]) => p.localeCompare(q))) {
    if (x.added.length) out.push({ email, kind: 'added', langs: x.added.sort() });
    else if (x.removed.length) out.push({ email, kind: 'removed', langs: x.removed.sort() });
  }
  return out;
}

// Czy wydarzenie już się skończyło (dzień końca przed dzisiejszym, Europe/Warsaw).
export function eventPast(ev, now = Date.now()) {
  const last = String(ev?.end_date || ev?.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return false;
  return last < utcToZoned(now).date;
}

// ── Treści ──────────────────────────────────────────────────────────────────
const C = {
  paper: '#F6F4EE', paperDark: '#ECE8DE', hero: '#FFF1C2', malt: '#2A2312', text: '#4A463E',
  muted: '#6B6557', mustard: '#8A6606', turmeric: '#FFBE0B', line: '#ECE8DE',
};
const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function whenLabel(ev) {
  if (!ev?.date) return '';
  const from = shortTime(ev.time);
  const to = shortTime(ev.end_time);
  const day = dateLong(ev.date);
  return from ? `${day}, godz. ${from}${to ? `–${to}` : ''}` : day;
}

export function emailSubject({ kind, roles, title, date }) {
  return kind === 'added'
    ? `Tłumaczenie na żywo: ${roles.join(', ')} — ${title}, ${date}`
    : `Nie tłumaczysz już: ${title}, ${date}`;
}

// args: { kind, byName, roles: [nazwa Służby], title, when, place, church, consoleUrl, eventUrl }
export function emailHtml(args) {
  const added = args.kind === 'added';
  const roles = (args.roles || []).map(escapeHtml);
  const by = `<strong style="color:${C.malt};font-weight:700;">${escapeHtml(args.byName)}</strong>`;
  const heading = added
    ? 'Tłumaczysz <span style="font-weight:300;">na żywo</span>'
    : 'Zmiana <span style="font-weight:300;">w tłumaczeniu</span>';
  const intro = added
    ? `${by} dodał(a) Cię jako tłumacza na żywo${roles.length > 1 ? ' w kilku językach' : ''}.`
    : `${by} zdjął(ęła) Cię z tłumaczenia na żywo. Nie musisz tłumaczyć tego wydarzenia.`;
  const note = added
    ? 'Konsola tłumacza działa w przeglądarce (komputer albo telefon). Wejdź kilka minut przed początkiem i sprawdź mikrofon.'
    : 'Jeśli to pomyłka, daj znać liderowi służby Tłumaczenia.';
  const label = `font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.mustard};`;
  const detail = (t, v) => (v ? `
          <tr>
            <td style="padding:14px 0 0;border-top:1px solid ${C.line};width:112px;vertical-align:top;${label}">${t}</td>
            <td style="padding:12px 0 14px;border-top:1px solid ${C.line};font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:${C.malt};">${escapeHtml(v)}</td>
          </tr>` : '');
  const button = (href, text, bg) => `
          <tr><td align="center" bgcolor="${bg}" style="border-radius:999px;background:${bg};">
            <a href="${escapeHtml(href)}" target="_blank" style="display:block;padding:15px 12px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:800;color:${C.malt};text-decoration:none;border-radius:999px;">${text}</a>
          </td></tr>`;
  const actions = added
    ? `${button(args.consoleUrl, 'Otwórz konsolę tłumacza', C.turmeric)}
          <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>${button(args.eventUrl, 'Szczegóły wydarzenia', C.paperDark)}`
    : button(args.eventUrl, 'Szczegóły wydarzenia', C.paperDark);
  const preheader = added
    ? `${roles.join(', ')} — ${escapeHtml(args.when)}`
    : `${escapeHtml(args.title)} — ${escapeHtml(args.when)}`;
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${added ? 'Tłumaczenie na żywo' : 'Zmiana w tłumaczeniu'}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;600;700;800&display=swap" rel="stylesheet">
<style>
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media (max-width: 480px) { .card { padding: 28px 22px !important; } .h1 { font-size: 26px !important; line-height: 32px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
  <tr><td align="center" style="padding:32px 16px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 6px 16px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:800;color:${C.malt};">avenit<span style="color:${C.turmeric};">.</span></td></tr>
      <tr><td class="card" style="background:#FFFFFF;border-radius:24px;padding:36px 32px 32px;">
        <div style="${label}padding-bottom:10px;">${escapeHtml(args.church)} · Tłumaczenia</div>
        <h1 class="h1" style="margin:0 0 12px;font-family:${FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.5px;color:${C.malt};">${heading}<span style="color:${C.turmeric};">.</span></h1>
        <p style="margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:23px;color:${C.text};">${intro}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.hero};border-radius:18px;">
          <tr><td style="padding:18px 20px;">
            <div style="${label}">${added ? (roles.length > 1 ? 'Twoje języki' : 'Twój język') : (roles.length > 1 ? 'Języki' : 'Język')}</div>
            <div style="padding-top:4px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:800;color:${C.malt};">${roles.join('<br>')}</div>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
          ${detail('Wydarzenie', args.title)}
          ${detail('Kiedy', args.when)}
          ${detail('Miejsce', args.place)}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
          ${actions}
        </table>
        <p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};text-align:center;">${note}</p>
      </td></tr>
      <tr><td style="padding:20px 6px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};text-align:center;">Wiadomość wysłana automatycznie z aplikacji Avenit.</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function emailText(args) {
  const added = args.kind === 'added';
  return [
    `${added ? 'Tłumaczenie na żywo' : 'Zmiana w tłumaczeniu'} — ${args.church}`,
    '',
    added
      ? `${args.byName} dodał(a) Cię jako tłumacza na żywo.`
      : `${args.byName} zdjął(ęła) Cię z tłumaczenia na żywo. Nie musisz tłumaczyć tego wydarzenia.`,
    '',
    `${(args.roles || []).length > 1 ? 'Języki' : 'Język'}: ${(args.roles || []).join(', ')}`,
    `Wydarzenie: ${args.title}`,
    ...(args.when ? [`Kiedy: ${args.when}`] : []),
    ...(args.place ? [`Miejsce: ${args.place}`] : []),
    '',
    ...(added ? [`Konsola tłumacza: ${args.consoleUrl}`] : []),
    `Szczegóły wydarzenia: ${args.eventUrl}`,
    '',
    added
      ? 'Konsola tłumacza działa w przeglądarce. Wejdź kilka minut przed początkiem i sprawdź mikrofon.'
      : 'Jeśli to pomyłka, daj znać liderowi służby Tłumaczenia.',
  ].join('\n');
}

// Wpis dzwonka + push.
export function notificationEntry({ email, kind, roles, ev, short }) {
  const title = ev.title || 'Wydarzenie';
  const when = `${short}${shortTime(ev.time) ? `, ${shortTime(ev.time)}` : ''}`;
  return kind === 'added'
    ? {
      user_email: email, type: NOTIFY_TYPE,
      title: `Tłumaczysz na żywo: ${roles.join(', ')}`,
      body: `${title} · ${when}. Konsola tłumacza otworzy się w przeglądarce.`,
      link: consolePath(ev.id),
      data: { kind: 'interpretation', event_id: String(ev.id), app_link: appEventLink(ev.id) },
    }
    : {
      user_email: email, type: NOTIFY_TYPE,
      title: `Nie tłumaczysz już: ${roles.join(', ')}`,
      body: `${title} · ${when}`,
      link: eventPath(ev.id),
      data: { kind: 'interpretation', event_id: String(ev.id), app_link: appEventLink(ev.id) },
    };
}

// ── Dane pomocnicze ─────────────────────────────────────────────────────────
// Konta osób z zaproszeniem z grafiku tłumaczy tego wydarzenia (oczekujące / potwierdzone).
export async function scheduleInvitees(db, eventId) {
  const out = new Set();
  let rows = [];
  try {
    ({ rows } = await db.query(
      `SELECT assigned_name, assigned_email FROM schedule_assignments
        WHERE event_id::text = $1 AND team_type = $2 AND status IN ('pending', 'accepted')`, [String(eventId), TEAM_TYPE]));
  } catch { return out; } // tenant bez grafiku na wydarzeniach
  for (const r of rows) {
    for (const e of await accountEmailsForAssignee(db, { email: r.assigned_email, name: r.assigned_name, teamType: TEAM_TYPE })) out.add(lower(e));
  }
  return out;
}

async function placeOf(db, eventId) {
  try {
    const { rows } = await db.query(`SELECT to_jsonb(e)->>'location' AS l FROM events e WHERE e.id::text = $1`, [String(eventId)]);
    return String(rows[0]?.l || '').trim();
  } catch { return ''; }
}

// Czy kontekst ma czym wysyłać (produkcja: interpDeps; testy bez atrap — nic nie robimy).
export const canNotify = (ctx) => typeof ctx?.deps?.sendEmail === 'function' || typeof ctx?.deps?.deliver === 'function';

// ── Wysyłka ─────────────────────────────────────────────────────────────────
// → { emailed, notified, changes } (do testów i logu).
export async function notifyInterpreterChanges(ctx, { ev, before, after, actorEmail, now = Date.now() }) {
  const res = { emailed: 0, notified: 0, changes: [] };
  if (!canNotify(ctx) || !ev) return res;
  const { db } = ctx;
  if (ev.is_archived || eventPast(ev, now)) return res;
  const pre = diffInterpreters(before, after, { actor: actorEmail });
  if (!pre.length) return res;
  const skipAdded = pre.some((c) => c.kind === 'added') ? await scheduleInvitees(db, ev.id) : new Set();
  let changes = diffInterpreters(before, after, { actor: actorEmail, skipAdded });
  const active = await activeAccounts(db, changes.map((c) => c.email));
  changes = changes.filter((c) => active.has(c.email));
  res.changes = changes;
  if (!changes.length) return res;

  const langs = await moduleLanguages(db).catch(() => ({ languages: [] }));
  const roleOf = new Map((langs.languages || []).map((l) => [l.lang_code, l.role_name]));
  const roleName = (code) => roleOf.get(code) || `Tłumacz ${String(code).toUpperCase()}`;
  const byName = (await namesOf(db, [actorEmail])).get(lower(actorEmail)) || actorEmail || 'Lider służby';
  const church = await churchName(db, ctx.tenant?.name);
  const base = rsvpBase(ctx.tenant?.subdomain || ctx.tenantSlug);
  const place = await placeOf(db, ev.id);
  const title = ev.title || 'Wydarzenie';
  const when = whenLabel(ev);
  const date = ev.date ? dateShort(ev.date) : '';

  if (typeof ctx.deps.sendEmail === 'function') {
    for (const c of changes) {
      const args = {
        kind: c.kind, byName, roles: c.langs.map(roleName), title, when, place, church,
        consoleUrl: `${base}${consolePath(ev.id)}`, eventUrl: `${base}${eventPath(ev.id)}`,
      };
      try {
        await ctx.deps.sendEmail({
          to: c.email,
          subject: emailSubject({ kind: c.kind, roles: args.roles, title, date: date || when }),
          html: emailHtml(args),
          text: emailText(args),
          fromName: church,
          ...(actorEmail ? { replyTo: actorEmail } : {}),
        });
        res.emailed += 1;
      } catch (err) {
        ctx.log?.warn?.({ err }, `interpretation: e-mail do tłumacza (${c.kind})`);
      }
    }
  }
  if (typeof ctx.deps.deliver === 'function') {
    try {
      const r = await ctx.deps.deliver({
        db,
        tenant: { slug: ctx.tenantSlug },
        log: ctx.log,
        entries: changes.map((c) => notificationEntry({ email: c.email, kind: c.kind, roles: c.langs.map(roleName), ev, short: date })),
        deps: { sendPush: ctx.deps.sendPush, emit: ctx.deps.emit },
        dedupeMinutes: 0, // o powtórkach decyduje różnica stanu zapisu
      });
      res.notified = r?.entries?.length ?? changes.length;
    } catch (err) {
      ctx.log?.warn?.({ err }, 'interpretation: powiadomienia tłumaczy');
    }
  }
  return res;
}
