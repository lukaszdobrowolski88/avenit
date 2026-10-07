// Port edge function send-assignment-email: zaproszenie do służby (pojedyncze, STARE — grafik
// wysyła dziś wsadowo przez send-assignment-invites). Oryginał: supabase/functions/send-assignment-email.
// Utwardzone (audyt 2026-10): treść escapowana, linki tylko do strony odpowiedzi tej aplikacji,
// odbiorca musi być przypisany do programu — inaczej funkcja byłaby przekaźnikiem dowolnych maili
// z dowolnymi linkami w imieniu kościoła. Wysyłka przez wspólne lib/email.js (Resend/SendGrid/SMTP).
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';
import { escapeHtml } from './send-assignment-invites.js';

export const name = 'send-assignment-email';

// Generuj HTML emaila.
function generateEmailHtml(raw) {
  const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, escapeHtml(v)]));
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zaproszenie do służby</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #ec4899 0%, #f97316 100%); border-radius: 16px; margin: 0 auto 16px auto; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 28px;">🎵</span>
              </div>
              <h1 style="margin: 0 0 8px 0; color: #1f2937; font-size: 24px; font-weight: 700;">
                Zaproszenie do służby
              </h1>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                ${params.assignedByName} przypisał/a Cię do służby
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; padding: 20px;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Data</span>
                    <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                      ${params.programDate}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Służba</span>
                    <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                      ${params.roleName}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Program</span>
                    <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                      ${params.programTitle}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Buttons -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <a href="${params.acceptUrl}" style="display: block; padding: 14px 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; text-align: center; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                      ✓ Akceptuję
                    </a>
                  </td>
                </tr>
                <tr>
                  <td>
                    <a href="${params.rejectUrl}" style="display: block; padding: 14px 24px; background: linear-gradient(135deg, #f97316 0%, #ef4444 100%); color: #ffffff; text-decoration: none; text-align: center; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);">
                      ✗ Odrzucam
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 16px 16px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Ten email został wysłany automatycznie z Avenit.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export default async function handler(req, reply) {
  try {
    const {
      to,
      assignedName,
      assignedByName,
      roleName,
      programId,
      acceptUrl,
      rejectUrl,
    } = req.body || {};

    // Walidacja.
    if (!to || !assignedName || !roleName || !programId || !acceptUrl || !rejectUrl) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }

    // Pobierz dane programu z bazy tenanta.
    const { rows: programRows } = await req.db.query(
      `SELECT date FROM programs WHERE id = $1`,
      [programId]
    );
    const program = programRows[0];

    if (!program) {
      return reply.code(404).send({ error: 'Program not found', details: 'no rows' });
    }

    // Linki tylko do strony odpowiedzi TEJ aplikacji (host żądania).
    const host = String(req.headers.host || '').toLowerCase();
    const okUrl = (u) => {
      try {
        const url = new URL(String(u));
        return /^https?:$/.test(url.protocol) && url.host.toLowerCase() === host && url.pathname === '/assignment-response';
      } catch { return false; }
    };
    if (!okUrl(acceptUrl) || !okUrl(rejectUrl)) {
      return reply.code(400).send({ error: 'Nieprawidłowe linki odpowiedzi' });
    }
    // Odbiorca musi mieć przypisanie w tym programie.
    const { rows: who } = await req.db.query(
      `SELECT 1 FROM schedule_assignments WHERE program_id = $1 AND lower(assigned_email) = lower($2) LIMIT 1`,
      [programId, String(to)]
    );
    if (!who.length) return reply.code(400).send({ error: 'Ta osoba nie jest przypisana do tego programu' });

    // Formatuj datę.
    const programDate = new Date(program.date).toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const programTitle = 'Nabożeństwo';

    // Czy jakakolwiek wysyłka jest skonfigurowana (Resend / SendGrid / SMTP — jak lib/email.js).
    if (!(config.RESEND_API_KEY || config.SENDGRID_API_KEY || config.DEFAULT_SMTP_HOST)) {
      req.log.warn('email not configured, skipping assignment email');
      return reply.send({
        success: false,
        error: 'Email service not configured',
      });
    }

    // Generuj HTML.
    const htmlContent = generateEmailHtml({
      assignedName,
      assignedByName: assignedByName || 'Administrator',
      roleName,
      programTitle: programTitle || 'Nabożeństwo',
      programDate,
      acceptUrl,
      rejectUrl,
    });

    // Temat emaila.
    const subject = `Zaproszenie do służby: ${roleName} - ${programDate}`;

    // Wyślij email (wspólny helper — ten sam kanał co reszta maili systemowych).
    let result;
    try {
      await sendEmail({ to, subject, html: htmlContent });
      result = { success: true };
    } catch (e) {
      result = { success: false, error: e.message };
    }

    if (result.success) {
      return reply.send({
        success: true,
        message: 'Email sent successfully',
        messageId: result.messageId,
      });
    }
    return reply.code(500).send({
      success: false,
      error: result.error,
    });
  } catch (err) {
    req.log.error({ err }, 'send-assignment-email error');
    return reply.code(500).send({ error: err.message });
  }
}
