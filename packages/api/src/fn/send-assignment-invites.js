// Wsadowa wysyłka zaproszeń do służby dla jednego programu (daty).
// Wejście: { programId, baseUrl }
// - grupuje NIEwysłane, oczekujące przypisania per OSOBA (assigned_email),
// - jednej osobie wysyła JEDEN łączony e-mail + JEDEN push (wszystkie jej służby),
// - nadaje wspólny token na jej przypisania (akceptacja/odrzucenie obejmuje wszystkie),
// - stempluje email_sent_at DOPIERO po realnej wysyłce maila (nie przy błędzie/braku
//   konfiguracji) — dzięki temu nieudaną wysyłkę można ponowić.
// Wysyłka przez wspólny helper lib/email.js (SendGrid → SMTP), zgodnie z resztą maili
// systemowych; NIE zakłada na sztywno SendGrida.
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

function emailHtml({ assignedByName, roles, programDate, programTitle, acceptUrl, rejectUrl }) {
  const rolesHtml = roles.map((r) => `
    <tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937;font-size:15px;font-weight:600;">${r}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,.1);">
<tr><td style="padding:32px 32px 20px;text-align:center;">
<div style="width:64px;height:64px;background:linear-gradient(135deg,#ec4899,#f97316);border-radius:16px;margin:0 auto 16px;line-height:64px;font-size:28px;">🎵</div>
<h1 style="margin:0 0 8px;color:#1f2937;font-size:24px;font-weight:700;">Zaproszenie do służby</h1>
<p style="margin:0;color:#6b7280;font-size:14px;">${assignedByName} zaprasza Cię do służby${roles.length > 1 ? ' (kilka służb)' : ''}</p></td></tr>
<tr><td style="padding:0 32px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;">
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;">Data</span>
<p style="margin:4px 0 0;color:#1f2937;font-size:16px;font-weight:600;">${programDate}</p></td></tr>
<tr><td style="padding:12px 16px 4px;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;">Służby</span></td></tr>
${rolesHtml}
<tr><td style="padding:12px 16px;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;">Program</span>
<p style="margin:4px 0 0;color:#1f2937;font-size:16px;font-weight:600;">${programTitle}</p></td></tr></table></td></tr>
<tr><td style="padding:0 32px 32px;"><table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding-bottom:12px;"><a href="${acceptUrl}" style="display:block;padding:14px 24px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;text-align:center;border-radius:12px;font-weight:700;font-size:16px;">✓ Akceptuję${roles.length > 1 ? ' wszystkie' : ''}</a></td></tr>
<tr><td><a href="${rejectUrl}" style="display:block;padding:14px 24px;background:linear-gradient(135deg,#f97316,#ef4444);color:#fff;text-decoration:none;text-align:center;border-radius:12px;font-weight:700;font-size:16px;">✗ Odrzucam${roles.length > 1 ? ' wszystkie' : ''}</a></td></tr></table></td></tr>
<tr><td style="padding:24px 32px;background:#f9fafb;border-radius:0 0 16px 16px;text-align:center;">
<p style="margin:0;color:#9ca3af;font-size:12px;">Ten email został wysłany automatycznie z Avenit.</p></td></tr>
</table></td></tr></table></body></html>`;
}

export default async function handler(req, reply) {
  try {
    const { programId, baseUrl } = req.body || {};
    if (!programId) return reply.code(400).send({ error: 'Brak programId' });
    const origin = String(baseUrl || `https://${req.headers.host}`).replace(/\/+$/, '');

    const { rows: progRows } = await req.db.query(`SELECT date, title FROM programs WHERE id = $1`, [programId]);
    if (!progRows[0]) return reply.code(404).send({ error: 'Program not found' });
    const programDate = new Date(progRows[0].date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const programTitle = progRows[0].title?.trim() || 'Nabożeństwo';

    const { rows: all } = await req.db.query(
      `SELECT id, role_key, assigned_name, assigned_email, assigned_by_name, status, email_sent_at
         FROM schedule_assignments WHERE program_id = $1`,
      [programId]
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

    // Ten sam mechanizm co reszta maili systemowych: SendGrid lub SMTP.
    const emailReady = !!(config.SENDGRID_API_KEY || config.DEFAULT_SMTP_HOST);
    if (!emailReady) {
      return reply.send({ success: false, emailReady: false, sent: 0, error: 'Brak konfiguracji e-mail na serwerze (SMTP/SendGrid).' });
    }

    let sent = 0;
    let failed = 0;
    for (const person of byPerson.values()) {
      const token = crypto.randomUUID();
      const roleLabels = person.roles.map((r) => roleName(r.role_key));
      const acceptUrl = `${origin}/assignment-response?token=${token}&action=accept`;
      const rejectUrl = `${origin}/assignment-response?token=${token}&action=reject`;
      const html = emailHtml({ assignedByName: person.by || 'Administrator', roles: roleLabels, programDate, programTitle, acceptUrl, rejectUrl });
      const subject = roleLabels.length > 1
        ? `Zaproszenie do służby (${roleLabels.length}) — ${programDate}`
        : `Zaproszenie do służby: ${roleLabels[0]} — ${programDate}`;

      // Najpierw realna wysyłka; stempel dopiero po sukcesie (nieudane można ponowić).
      try {
        await sendEmail({ to: person.email, subject, html });
      } catch (e) {
        failed++;
        req.log?.warn?.({ err: e }, 'invite email failed');
        continue;
      }

      // Wspólny token + stempel wysyłki na wszystkich (niewysłanych) przypisaniach osoby.
      await req.db.query(
        `UPDATE schedule_assignments SET token = $1, email_sent_at = now()
          WHERE program_id = $2 AND lower(assigned_email) = $3 AND status = 'pending' AND email_sent_at IS NULL`,
        [token, programId, person.email.toLowerCase()]
      );
      sent++;

      // Push (łączony, informacyjny — akceptacja przez e-mail/aplikację). Best-effort.
      try {
        await sendPushCore(req.db, {
          user_email: person.email,
          title: 'Nowe zaproszenie do służby',
          body: `${roleLabels.join(', ')} — ${programDate}`,
          link: `/programs/${programId}`,
        });
      } catch (e) { req.log?.warn?.({ err: e }, 'invite push failed'); }
    }

    return reply.send({ success: true, sent, failed, emailReady: true });
  } catch (err) {
    req.log.error({ err }, 'send-assignment-invites error');
    return reply.code(500).send({ error: err.message });
  }
}
