// Port edge function send-form-email: powiadomienia e-mail z modułu Formularze (SendGrid).
// Oryginał: supabase/functions/send-form-email/index.ts.
import { config } from '../config.js';

export const name = 'send-form-email';

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
        // Oryginał: FROM_NAME = env MAILING_FROM_NAME || "Formularze".
        from: { email: config.MAILING_FROM_EMAIL, name: config.MAILING_FROM_NAME || 'Formularze' },
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

export default async function handler(req, reply) {
  try {
    const { to, subject, html, type, formId, responseId } = req.body || {};

    // Walidacja.
    if (!to || !subject || !html) {
      return reply.code(400).send({ error: 'Missing required fields: to, subject, html' });
    }

    // Sprawdź czy SendGrid jest skonfigurowany.
    if (!config.SENDGRID_API_KEY) {
      req.log.warn('SENDGRID_API_KEY not configured, skipping email');
      return reply.send({
        success: false,
        error: 'Email service not configured',
        details: 'SENDGRID_API_KEY is not set',
      });
    }

    // Wyślij email.
    const result = await sendViaSendGrid(to, subject, html);

    // Opcjonalnie: zapisz log w bazie danych.
    if (formId && responseId) {
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
