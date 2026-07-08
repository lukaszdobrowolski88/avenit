// Port edge function send-assignment-email: zaproszenie do służby (SendGrid).
// Oryginał: supabase/functions/send-assignment-email/index.ts.
import { config } from '../config.js';

export const name = 'send-assignment-email';

const FROM_NAME_DEFAULT = 'Avenit';

// Wyślij email przez SendGrid API (payload identyczny jak w oryginale).
async function sendViaSendGrid(to, subject, htmlContent) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: config.MAILING_FROM_EMAIL, name: config.MAILING_FROM_NAME || FROM_NAME_DEFAULT },
        subject: subject,
        content: [{ type: 'text/html', value: htmlContent }],
      }),
    });

    if (response.status !== 202) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data?.errors?.[0]?.message || 'SendGrid error' };
    }

    const messageId = response.headers.get('x-message-id') || undefined;
    return { success: true, messageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Generuj HTML emaila.
function generateEmailHtml(params) {
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

    // Formatuj datę.
    const programDate = new Date(program.date).toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const programTitle = 'Nabożeństwo';

    // Sprawdź czy SendGrid jest skonfigurowany.
    if (!config.SENDGRID_API_KEY) {
      req.log.warn('SENDGRID_API_KEY not configured, skipping email');
      return reply.send({
        success: false,
        error: 'Email service not configured',
        details: 'SENDGRID_API_KEY is not set',
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

    // Wyślij email.
    const result = await sendViaSendGrid(to, subject, htmlContent);

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
