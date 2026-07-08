// Port edge function send-mail: wysyłka e-maili z modułu Poczta (SMTP przez nodemailer,
// zamiast denomailer). Konta wewnętrzne: dostarczanie do skrzynek w bazie + SMTP
// dla zewnętrznych odbiorców; konta zewnętrzne: SMTP konta (hasło szyfrowane AES-256-GCM).
// Oryginał: supabase/functions/send-mail/index.ts.
// WAŻNE: port 465 = SSL/TLS od początku (secure: true), port 587 = STARTTLS.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { decryptPassword } from '../lib/mailcrypto.js';

export const name = 'send-mail';

// Wyślij email przez SMTP (nodemailer; port 465 => secure: true).
async function sendViaSMTP(smtpHost, smtpPort, username, password, from, to, cc, bcc, subject, html, text) {
  const secure = smtpPort === 465;

  if (smtpPort === 587) {
    console.warn('Port 587 (STARTTLS). Zalecany port 465 (SSL).');
  }

  console.log(`Łączenie z SMTP: ${smtpHost}:${smtpPort}, TLS: ${secure}`);

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    auth: { user: username, pass: password },
  });

  await transport.sendMail({
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject,
    text,
    html,
  });
  console.log(`Email wysłany do: ${to.join(', ')}`);
}

export default async function handler(req, reply) {
  try {
    const payload = req.body || {};

    if (!payload.account_id || !payload.to || payload.to.length === 0) {
      return reply.code(400).send({ error: 'Brakuje wymaganych pól: account_id, to' });
    }

    // Pobierz konto email.
    const { rows: accountRows } = await req.db.query(
      `SELECT * FROM mail_accounts WHERE id = $1`,
      [payload.account_id]
    );
    const account = accountRows[0];

    if (!account) {
      return reply.code(404).send({ error: 'Nie znaleziono konta email' });
    }

    let sentMessageId = null;
    const bodyText = payload.body_text || payload.body_html?.replace(/<[^>]*>/g, '') || '';
    const nowIso = new Date().toISOString();

    // Dla poczty wewnętrznej.
    if (account.account_type === 'internal') {
      // Znajdź folder "Sent".
      const { rows: sentFolderRows } = await req.db.query(
        `SELECT id FROM mail_folders WHERE account_id = $1 AND type = 'sent'`,
        [payload.account_id]
      );
      const sentFolder = sentFolderRows[0];

      if (!sentFolder) {
        return reply.code(404).send({ error: 'Nie znaleziono folderu Wysłane' });
      }

      // Zapisz wiadomość w folderze "Sent".
      const { rows: sentMessageRows } = await req.db.query(
        `INSERT INTO mail_messages
           (account_id, folder_id, from_email, from_name, to_emails, cc_emails, bcc_emails,
            subject, body_html, body_text, snippet, is_read, sent_at, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $12)
         RETURNING *`,
        [
          payload.account_id,
          sentFolder.id,
          account.user_email,
          account.user_email.split('@')[0],
          payload.to,
          payload.cc || [],
          payload.bcc || [],
          payload.subject || '(brak tematu)',
          payload.body_html,
          bodyText,
          bodyText.substring(0, 200),
          nowIso,
        ]
      );
      sentMessageId = sentMessageRows[0].id;

      // Dostarcz do wewnętrznych odbiorców.
      const internalRecipients = [];
      const externalRecipients = [];

      for (const recipientEmail of payload.to) {
        const { rows: recipientAccountRows } = await req.db.query(
          `SELECT id FROM mail_accounts WHERE user_email = $1 AND account_type = 'internal' LIMIT 1`,
          [recipientEmail]
        );
        const recipientAccount = recipientAccountRows[0];

        if (recipientAccount) {
          internalRecipients.push(recipientEmail);

          // Znajdź folder Inbox odbiorcy.
          const { rows: inboxFolderRows } = await req.db.query(
            `SELECT id FROM mail_folders WHERE account_id = $1 AND type = 'inbox'`,
            [recipientAccount.id]
          );
          const inboxFolder = inboxFolderRows[0];

          if (inboxFolder) {
            await req.db.query(
              `INSERT INTO mail_messages
                 (account_id, folder_id, from_email, from_name, to_emails, cc_emails, bcc_emails,
                  subject, body_html, body_text, snippet, is_read, sent_at, received_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, $12, $12)`,
              [
                recipientAccount.id,
                inboxFolder.id,
                account.user_email,
                account.user_email.split('@')[0],
                payload.to,
                payload.cc || [],
                payload.bcc || [],
                payload.subject || '(brak tematu)',
                payload.body_html,
                bodyText,
                bodyText.substring(0, 200),
                nowIso,
              ]
            );

            // Aktualizuj licznik.
            const { rows: countRows } = await req.db.query(
              `SELECT COUNT(*)::int AS count FROM mail_messages WHERE folder_id = $1 AND is_read = false`,
              [inboxFolder.id]
            );
            await req.db.query(
              `UPDATE mail_folders SET unread_count = $2 WHERE id = $1`,
              [inboxFolder.id, countRows[0].count || 0]
            );
          }
        } else {
          externalRecipients.push(recipientEmail);
        }
      }

      // Wyślij do zewnętrznych odbiorców przez domyślne SMTP.
      const DEFAULT_SMTP_FROM = process.env.DEFAULT_SMTP_FROM || config.DEFAULT_SMTP_USER;
      if (externalRecipients.length > 0 && config.DEFAULT_SMTP_HOST && config.DEFAULT_SMTP_USER && config.DEFAULT_SMTP_PASS) {
        try {
          await sendViaSMTP(
            config.DEFAULT_SMTP_HOST,
            config.DEFAULT_SMTP_PORT || 465,
            config.DEFAULT_SMTP_USER,
            config.DEFAULT_SMTP_PASS,
            DEFAULT_SMTP_FROM || config.DEFAULT_SMTP_USER,
            externalRecipients,
            payload.cc || [],
            payload.bcc || [],
            payload.subject || '(brak tematu)',
            payload.body_html,
            bodyText
          );
          console.log(`Wysłano przez SMTP do: ${externalRecipients.join(', ')}`);
        } catch (smtpError) {
          req.log.error({ err: smtpError }, 'SMTP error');
          // Nie przerywaj - wiadomość została zapisana lokalnie.
        }
      } else if (externalRecipients.length > 0) {
        req.log.warn(
          { externalRecipients },
          'Brak konfiguracji SMTP - wiadomości do zewnętrznych odbiorców nie zostaną wysłane'
        );
      }
    } else {
      // Dla kont zewnętrznych - użyj SMTP skonfigurowanego dla tego konta.
      if (!account.smtp_host || !account.encrypted_password || !config.MAIL_ENCRYPTION_SECRET) {
        return reply.code(400).send({ error: 'Brak konfiguracji SMTP dla tego konta' });
      }

      // Odszyfruj hasło.
      const password = await decryptPassword(account.encrypted_password, config.MAIL_ENCRYPTION_SECRET);

      // Wyślij przez SMTP.
      await sendViaSMTP(
        account.smtp_host,
        account.smtp_port || 465,
        account.external_email,
        password,
        account.external_email,
        payload.to,
        payload.cc || [],
        payload.bcc || [],
        payload.subject || '(brak tematu)',
        payload.body_html,
        bodyText
      );

      // Zapisz wysłaną wiadomość.
      const { rows: sentFolderRows } = await req.db.query(
        `SELECT id FROM mail_folders WHERE account_id = $1 AND type = 'sent'`,
        [payload.account_id]
      );
      const sentFolder = sentFolderRows[0];

      if (sentFolder) {
        const { rows: msgRows } = await req.db.query(
          `INSERT INTO mail_messages
             (account_id, folder_id, from_email, from_name, to_emails, cc_emails, bcc_emails,
              subject, body_html, body_text, snippet, is_read, sent_at, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $12)
           RETURNING *`,
          [
            payload.account_id,
            sentFolder.id,
            account.external_email,
            account.external_email?.split('@')[0],
            payload.to,
            payload.cc || [],
            payload.bcc || [],
            payload.subject || '(brak tematu)',
            payload.body_html,
            bodyText,
            bodyText.substring(0, 200),
            nowIso,
          ]
        );
        sentMessageId = msgRows[0]?.id || null;
      }
    }

    return reply.send({
      success: true,
      message: 'Wiadomość wysłana',
      message_id: sentMessageId,
    });
  } catch (err) {
    req.log.error({ err }, 'Send mail error');
    return reply.code(500).send({ error: err.message });
  }
}
