// Port edge function send-form-email: powiadomienia e-mail z modułu Formularze.
// Wysyłka przez wspólne lib/email.js (Resend, fallback SMTP) — wcześniej SendGrid, który na
// serwerze nie jest skonfigurowany, więc maile z formularzy w ogóle nie wychodziły.
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';

export const name = 'send-form-email';

async function sendFormMail(to, subject, html) {
  try {
    await sendEmail({ to, subject, html, fromName: config.MAILING_FROM_NAME || 'Formularze' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default async function handler(req, reply) {
  try {
    const { to, subject, html, type, formId, responseId } = req.body || {};

    // Walidacja.
    if (!to || !subject || !html) {
      return reply.code(400).send({ error: 'Missing required fields: to, subject, html' });
    }

    // Wyślij email.
    const result = await sendFormMail(to, subject, html);

    // Log wysyłki (pomocniczy — jego błąd nie może zamienić wysłanego maila w błąd 500).
    if (formId && responseId) {
      try {
        await req.db.query(
          `INSERT INTO form_email_logs
             (form_id, response_id, email_type, recipient, subject, status, message_id, error_message, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            formId,
            responseId,
            type,
            to,
            subject,
            result.success ? 'sent' : 'failed',
            result.messageId || null,
            result.error || null,
            result.success ? new Date().toISOString() : null,
          ]
        );
      } catch (logErr) {
        req.log?.warn?.({ err: logErr }, 'form_email_logs');
      }
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
    req.log.error({ err }, 'send-form-email error');
    return reply.code(500).send({ error: err.message });
  }
}
