// Wysyłka e-maili systemowych: SendGrid (API) z fallbackiem na SMTP (nodemailer).
import nodemailer from 'nodemailer';
import { config } from '../config.js';

export async function sendEmail({ to, subject, html, text, from, fromName, attachments }) {
  const fromEmail = from || config.MAILING_FROM_EMAIL;
  const senderName = fromName || config.MAILING_FROM_NAME;

  if (config.SENDGRID_API_KEY) {
    const body = {
      personalizations: [{ to: (Array.isArray(to) ? to : [to]).map((e) => ({ email: e })) }],
      from: { email: fromEmail, name: senderName },
      subject,
      content: [
        ...(text ? [{ type: 'text/plain', value: text }] : []),
        ...(html ? [{ type: 'text/html', value: html }] : []),
      ],
      ...(attachments?.length
        ? {
            attachments: attachments.map((a) => ({
              content: a.contentBase64,
              filename: a.filename,
              type: a.type || 'application/octet-stream',
              disposition: 'attachment',
            })),
          }
        : {}),
    };
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    }
    return { ok: true, provider: 'sendgrid' };
  }

  if (config.DEFAULT_SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: config.DEFAULT_SMTP_HOST,
      port: config.DEFAULT_SMTP_PORT || 465,
      secure: (config.DEFAULT_SMTP_PORT || 465) === 465,
      auth: config.DEFAULT_SMTP_USER
        ? { user: config.DEFAULT_SMTP_USER, pass: config.DEFAULT_SMTP_PASS }
        : undefined,
    });
    await transport.sendMail({
      from: `"${senderName}" <${fromEmail}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.type,
      })),
    });
    return { ok: true, provider: 'smtp' };
  }

  throw new Error('Brak konfiguracji e-mail (SENDGRID_API_KEY lub DEFAULT_SMTP_*)');
}

export async function sendResetPasswordEmail(to, link) {
  return sendEmail({
    to,
    subject: 'Ustaw nowe hasło — Avenit',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset hasła</h2>
        <p>Otrzymaliśmy prośbę o ustawienie nowego hasła dla Twojego konta w systemie <strong>Avenit</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Ustaw nowe hasło</a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">Link jest ważny przez 1 godzinę. Jeśli to nie Ty — zignoruj tę wiadomość.</p>
      </div>`,
    text: `Ustaw nowe hasło: ${link} (link ważny 1 godzinę)`,
  });
}
