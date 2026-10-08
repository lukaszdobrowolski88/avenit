// Wsadowa wysyłka zaproszeń do służby dla jednego wydarzenia (albo programu).
// Wejście: { eventId | programId, teamType, teamLabel?, baseUrl }
// - grupuje NIEwysłane, oczekujące przypisania per OSOBA (assigned_email),
// - jednej osobie wysyła JEDEN łączony e-mail + JEDEN push (wszystkie jej służby),
// - nadaje wspólny token na jej przypisania (akceptacja/odrzucenie obejmuje wszystkie),
// - stempluje email_sent_at DOPIERO po realnej wysyłce maila (nie przy błędzie/braku
//   konfiguracji) — dzięki temu nieudaną wysyłkę można ponowić,
// - push idzie niezależnie od maila (best-effort) — na adres z grafiku ORAZ na konta aplikacji
//   powiązane z tą samą kartoteką członka (ktoś mógł się zalogować innym adresem).
// Wysyłka przez wspólny helper lib/email.js (Resend → SendGrid → SMTP).
import crypto from 'node:crypto';
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';
import { sendPushCore } from './send-push.js';

export const name = 'send-assignment-invites';

const ROLE_NAMES = {
  lider: 'Lider Uwielbienia', piano: 'Piano', wokale: 'Wokal',
  gitara_akustyczna: 'Gitara Akustyczna', gitara_elektryczna: 'Gitara Elektryczna',
  bas: 'Gitara Basowa', cajon: 'Cajon/Perkusja', naglospienie: 'Nagłośnienie',
  projekcja: 'Projekcja', transmisja: 'Transmisja', foto: 'Fotograf', video: 'Wideo',
};
const roleName = (key, fallbackLabel) => fallbackLabel || ROLE_NAMES[key] || key;
const MEMBER_TABLE = {
  worship: 'worship_team', media: 'media_team', atmosfera: 'atmosfera_members',
  kids: 'kids_teachers', mc: 'custom_mc_members',
};
const KEY_RE = /^[a-z0-9_]+$/;
// Nazwy osób, ról i tytuły wydarzeń wpisują użytkownicy — w HTML maila zawsze escapowane.
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Barwy marki (księga znaku Avenit): papier, słód, kurkuma, musztarda. Bez gradientów i emoji.
const C = {
  paper: '#F6F4EE', paperDark: '#ECE8DE', hero: '#FFF1C2', malt: '#2A2312', text: '#4A463E',
  muted: '#6B6557', mustard: '#8A6606', turmeric: '#FFBE0B', line: '#ECE8DE',
};
const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function emailHtml({ assignedByName, roles, programDate, programTitle, acceptUrl, rejectUrl, contextLabel = 'Program', teamLabel = '', timeLabel = '', place = '' }) {
  assignedByName = escapeHtml(assignedByName);
  programDate = escapeHtml(programDate);
  programTitle = escapeHtml(programTitle);
  contextLabel = escapeHtml(contextLabel);
  acceptUrl = escapeHtml(acceptUrl);
  rejectUrl = escapeHtml(rejectUrl);
  teamLabel = escapeHtml(teamLabel);
  timeLabel = escapeHtml(timeLabel);
  place = escapeHtml(place);
  roles = (roles || []).map(escapeHtml);
  const multi = roles.length > 1;
  const when = timeLabel ? `${programDate}, godz. ${timeLabel}` : programDate;
  const preheader = `${roles.join(', ')} — ${programDate}. Potwierdzisz?`;

  const label = () => `font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.mustard};`;
  const detail = (title, value) => (value ? `
          <tr>
            <td style="padding:14px 0 0;border-top:1px solid ${C.line};width:112px;vertical-align:top;${label()}">${title}</td>
            <td style="padding:12px 0 14px;border-top:1px solid ${C.line};font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:${C.malt};">${value}</td>
          </tr>` : '');
  const button = (href, text, bg, width) => `
              <td align="center" width="${width}" bgcolor="${bg}" style="width:${width};border-radius:999px;background:${bg};">
                <a href="${href}" target="_blank" style="display:block;padding:15px 12px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:800;color:${C.malt};text-decoration:none;border-radius:999px;">${text}</a>
              </td>`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>Zaproszenie do służby</title>
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
        ${teamLabel ? `<div style="${label()}padding-bottom:10px;">${teamLabel}</div>` : ''}
        <h1 class="h1" style="margin:0 0 12px;font-family:${FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.5px;color:${C.malt};">Zaproszenie <span style="font-weight:300;">do służby</span><span style="color:${C.turmeric};">.</span></h1>
        <p style="margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:23px;color:${C.text};"><strong style="color:${C.malt};font-weight:700;">${assignedByName}</strong> zaprasza Cię do służby${multi ? ' w kilku rolach' : ''}. Daj znać, czy możesz.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.hero};border-radius:18px;">
          <tr><td style="padding:18px 20px;">
            <div style="${label()}">${multi ? 'Twoje role' : 'Twoja rola'}</div>
            <div style="padding-top:4px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:800;color:${C.malt};">${roles.join('<br>')}</div>
          </td></tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
          ${detail('Kiedy', when)}
          ${detail(contextLabel, programTitle)}
          ${detail('Miejsce', place)}
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
          <tr>${button(acceptUrl, 'Potwierdzam', C.turmeric, '58%')}
              <td style="width:10px;font-size:0;line-height:0;">&nbsp;</td>${button(rejectUrl, 'Nie mogę', C.paperDark, '40%')}
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};text-align:center;">${multi ? 'Odpowiedź dotyczy wszystkich ról powyżej i od razu trafi do grafiku.' : 'Odpowiedź od razu trafi do grafiku.'}</p>
      </td></tr>
      <tr><td style="padding:20px 6px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};text-align:center;">Wiadomość wysłana automatycznie z aplikacji Avenit.</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// Wersja tekstowa (klienci bez HTML, podgląd powiadomień, filtry antyspamowe).
export function emailText({ assignedByName, roles, programDate, programTitle, acceptUrl, rejectUrl, contextLabel = 'Program', teamLabel = '', timeLabel = '', place = '' }) {
  return [
    `Zaproszenie do służby${teamLabel ? ` — ${teamLabel}` : ''}`,
    '',
    `${assignedByName} zaprasza Cię do służby. Daj znać, czy możesz.`,
    '',
    `${(roles || []).length > 1 ? 'Role' : 'Rola'}: ${(roles || []).join(', ')}`,
    `Kiedy: ${programDate}${timeLabel ? `, godz. ${timeLabel}` : ''}`,
    `${contextLabel}: ${programTitle}`,
    ...(place ? [`Miejsce: ${place}`] : []),
    '',
    `Potwierdzam: ${acceptUrl}`,
    `Nie mogę: ${rejectUrl}`,
  ].join('\n');
}

// Imię i nazwisko osoby, która klika „Powiadom” (w mailu „X zaprasza Cię…”). Kolumny konta
// różnią się między tenantami — czytamy wiersz jako JSON; brak danych → null (zostaje zapisane
// assigned_by_name).
async function senderName(db, user) {
  if (!user?.id) return null;
  try {
    const { rows } = await db.query('SELECT to_jsonb(u) AS u FROM app_users u WHERE u.id = $1 LIMIT 1', [user.id]);
    const u = rows[0]?.u || {};
    const direct = u.full_name || u.display_name || u.name || [u.first_name, u.last_name].filter(Boolean).join(' ');
    if (direct && String(direct).trim()) return String(direct).trim();
    const email = u.email || user.email;
    const { rows: m } = await db.query(
      `SELECT first_name, last_name FROM members
        WHERE ($1::text IS NOT NULL AND id::text = $1::text) OR ($2::text IS NOT NULL AND lower(email) = lower($2))
        LIMIT 1`,
      [u.member_id != null ? String(u.member_id) : null, email || null]
    );
    const fromMember = [m[0]?.first_name, m[0]?.last_name].filter(Boolean).join(' ').trim();
    return fromMember || null;
  } catch {
    return null;
  }
}

// Adresy kont, na które wysłać push: adres z grafiku + konta aplikacji powiązane (app_users.member_id)
// z kartoteką członka o tym adresie albo z osobą służby (tabela zespołu → member_id). Bez dopasowania
// po imieniu — zaproszenie nie może trafić do imiennika.
async function pushRecipients(db, email, teamType) {
  const out = new Set([String(email).toLowerCase()]);
  const add = (rows) => rows.forEach((r) => { if (r.email) out.add(String(r.email).toLowerCase()); });
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT lower(u.email) AS email
         FROM app_users u JOIN members m ON u.member_id::text = m.id::text
        WHERE u.email IS NOT NULL AND lower(m.email) = lower($1)`,
      [email]
    );
    add(rows);
  } catch { /* tenant bez app_users.member_id */ }
  if (teamType && KEY_RE.test(teamType)) {
    const table = MEMBER_TABLE[teamType] || `custom_${teamType}_members`;
    try {
      const { rows } = await db.query(
        `SELECT DISTINCT lower(u.email) AS email
           FROM "${table}" t JOIN app_users u ON u.member_id::text = t.member_id::text
          WHERE u.email IS NOT NULL AND t.member_id IS NOT NULL AND lower(t.email) = lower($1)`,
        [email]
      );
      add(rows);
    } catch { /* tabela zespołu bez member_id */ }
  }
  return [...out];
}

const shortTime = (t) => (t ? String(t).slice(0, 5) : '');

export default async function handler(req, reply) {
  try {
    const { programId, eventId, teamType, teamLabel: rawTeamLabel, baseUrl } = req.body || {};
    const scopeId = eventId || programId;
    if (!scopeId) return reply.code(400).send({ error: 'Brak programId/eventId' });
    const scopeCol = eventId ? 'event_id' : 'program_id';
    const origin = String(baseUrl || `https://${req.headers.host}`).replace(/\/+$/, '');
    const teamLabel = String(rawTeamLabel || '').trim().slice(0, 80);

    // Źródło daty/tytułu/godziny/miejsca i link push: wydarzenie (events) lub program (programs).
    // Wiersz jako JSON — kolumny (time, location, campus_id) różnią się między tenantami.
    let programDate, shortDate, programTitle, pushLink, contextLabel, timeLabel = '', place = '';
    // Data „YYYY-MM-DD” z JSON-a → południe lokalnie, żeby strefa serwera nie przesunęła dnia.
    const toDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d));
    const dateLong = (d) => toDate(d).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dateShort = (d) => toDate(d).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' });
    if (eventId) {
      const { rows } = await req.db.query(`SELECT to_jsonb(e) AS e FROM events e WHERE id = $1`, [eventId]);
      const ev = rows[0]?.e;
      if (!ev) return reply.code(404).send({ error: 'Event not found' });
      programDate = dateLong(ev.date);
      shortDate = dateShort(ev.date);
      programTitle = ev.title?.trim() || 'Wydarzenie';
      timeLabel = shortTime(ev.time || ev.start_time);
      place = String(ev.location || '').trim();
      if (!place && ev.campus_id) {
        try {
          const { rows: c } = await req.db.query('SELECT name FROM campuses WHERE id::text = $1::text', [String(ev.campus_id)]);
          place = c[0]?.name || '';
        } catch { /* brak kampusów */ }
      }
      pushLink = `/wydarzenie/${eventId}`;
      contextLabel = 'Wydarzenie';
    } else {
      const { rows } = await req.db.query(`SELECT date, title FROM programs WHERE id = $1`, [programId]);
      if (!rows[0]) return reply.code(404).send({ error: 'Program not found' });
      programDate = dateLong(rows[0].date);
      shortDate = dateShort(rows[0].date);
      programTitle = rows[0].title?.trim() || 'Nabożeństwo';
      pushLink = `/programs/${programId}`;
      contextLabel = 'Program';
    }

    // Scope po team_type: programy/wydarzenia są WSPÓLNE dla zespołów, więc bez tego filtra
    // wysyłka z jednego grafiku ruszyłaby przypisania innego zespołu dla tej samej daty.
    const { rows: all } = await req.db.query(
      `SELECT id, role_key, role_label, assigned_name, assigned_email, assigned_by_name, status, email_sent_at
         FROM schedule_assignments WHERE ${scopeCol} = $1${teamType ? ' AND team_type = $2' : ''}`,
      teamType ? [scopeId, teamType] : [scopeId]
    );

    // Grupuj oczekujące, NIEwysłane przypisania (z e-mailem) per osoba. Wysyłamy do każdego,
    // kto ma nowe (niewysłane) służby — także jeśli wcześniej dostał maila o INNYCH
    // służbach tej daty. Wtedy mail dotyczy tylko nowych, jeszcze niewysłanych służb.
    const byPerson = new Map();
    for (const a of all) {
      if (a.status !== 'pending' || a.email_sent_at || !a.assigned_email) continue;
      const key = a.assigned_email.toLowerCase();
      if (!byPerson.has(key)) byPerson.set(key, { email: a.assigned_email, name: a.assigned_name, by: a.assigned_by_name, roles: [] });
      byPerson.get(key).roles.push(a);
    }

    // Etykieta roli w mailu: preferuj zapisaną role_label (grafiki zespołowe mają dynamiczne
    // role, np. „Prezentacja"), a dla worship — mapę ROLE_NAMES / fallback do klucza.
    for (const p of byPerson.values()) {
      p.roleLabels = p.roles.map((r) => r.role_label || roleName(r.role_key));
    }

    // Produkcja wysyła przez Resend (lib/email.js) — sprawdzanie tylko SendGrid/SMTP dawało
    // fałszywe „brak konfiguracji”.
    const emailReady = !!(config.RESEND_API_KEY || config.SENDGRID_API_KEY || config.DEFAULT_SMTP_HOST);
    if (!emailReady) {
      return reply.send({ success: false, emailReady: false, sent: 0, error: 'Brak konfiguracji e-mail na serwerze (SMTP/SendGrid).' });
    }

    // „X zaprasza Cię…” — osoba, która właśnie wysyła (zapisane assigned_by_name bywało częścią e-maila).
    const inviter = byPerson.size ? await senderName(req.db, req.user) : null;

    let sent = 0;
    let failed = 0;
    let pushed = 0;
    for (const person of byPerson.values()) {
      const token = crypto.randomUUID();
      const roleLabels = person.roleLabels;
      const acceptUrl = `${origin}/assignment-response?token=${token}&action=accept`;
      const rejectUrl = `${origin}/assignment-response?token=${token}&action=reject`;
      const mail = {
        assignedByName: inviter || person.by || 'Administrator', roles: roleLabels, programDate, programTitle,
        acceptUrl, rejectUrl, contextLabel, teamLabel, timeLabel, place,
      };
      const subject = roleLabels.length > 1
        ? `Zaproszenie do służby (${roleLabels.length}) — ${programDate}`
        : `Zaproszenie do służby: ${roleLabels[0]} — ${programDate}`;

      // Najpierw realna wysyłka; stempel dopiero po sukcesie (nieudane można ponowić).
      let emailed = false;
      try {
        await sendEmail({ to: person.email, subject, html: emailHtml(mail), text: emailText(mail) });
        emailed = true;
      } catch (e) {
        failed++;
        req.log?.warn?.({ err: e }, 'invite email failed');
      }

      if (emailed) {
        // Wspólny token + stempel wysyłki na wszystkich (niewysłanych) przypisaniach osoby.
        await req.db.query(
          `UPDATE schedule_assignments SET token = $1, email_sent_at = now()
            WHERE ${scopeCol} = $2 AND lower(assigned_email) = $3 AND status = 'pending' AND email_sent_at IS NULL${teamType ? ' AND team_type = $4' : ''}`,
          teamType ? [token, scopeId, person.email.toLowerCase(), teamType] : [token, scopeId, person.email.toLowerCase()]
        );
        sent++;
      }

      // Push (łączony) — niezależnie od maila. Przy jednej roli przyciski „Akceptuję / Odrzucam”
      // prosto z powiadomienia (mobilka: kategoria assignment_invite + data.assignmentId →
      // /api/assignment/:id/respond). Best-effort.
      try {
        const single = person.roles.length === 1 ? person.roles[0] : null;
        const payload = {
          title: teamLabel ? `${teamLabel}: zaproszenie do służby` : 'Zaproszenie do służby',
          body: `${roleLabels.join(', ')} · ${shortDate}${timeLabel ? `, ${timeLabel}` : ''} · ${programTitle}. Potwierdzisz?`,
          link: pushLink,
          category_id: single ? 'assignment_invite' : undefined,
          data: { type: 'assignment', assignmentId: single?.id ?? null, event_id: eventId ?? null, program_id: eventId ? null : programId ?? null },
        };
        let reached = false;
        for (const userEmail of await pushRecipients(req.db, person.email, teamType)) {
          const res = await sendPushCore(req.db, { ...payload, user_email: userEmail });
          if (res?.body?.sent > 0) reached = true;
        }
        if (reached) pushed++;
      } catch (e) { req.log?.warn?.({ err: e }, 'invite push failed'); }
    }

    return reply.send({ success: true, sent, failed, pushed, emailReady: true });
  } catch (err) {
    req.log.error({ err }, 'send-assignment-invites error');
    return reply.code(500).send({ error: err.message });
  }
}
