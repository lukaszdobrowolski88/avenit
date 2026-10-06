// Port edge function send-mail: wysyłka e-maili z modułu Poczta.
// Konta wewnętrzne: dostarczanie do skrzynek w bazie + zewnętrzni odbiorcy przez wspólny
// lib/email.js → sendEmail (Resend; SMTP hostingu odbijał maile na domeny kościołów).
// Konta zewnętrzne: SMTP konta użytkownika (hasło szyfrowane AES-256-GCM) — to jego własna skrzynka.
// Oryginał: supabase/functions/send-mail/index.ts.
// WAŻNE: port 465 = SSL/TLS od początku (secure: true), port 587 = STARTTLS.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { decryptPassword } from '../lib/mailcrypto.js';
import { sendEmail } from '../lib/email.js';

export const name = 'send-mail';

// Kolumny adresów w mail_messages bywają jsonb (stara definicja w szablonie) albo text[]
// (definicja modułu). node-pg zamienia tablicę JS na literał tablicy PG, którego jsonb nie
// przyjmie — dlatego sprawdzamy typ raz na bazę i podajemy wartość w pasującej postaci.
const listTypeCache = new WeakMap();
export async function emailListParam(db, list) {
  const values = (Array.isArray(list) ? list : []).filter(Boolean).map(String);
  let isJson = listTypeCache.get(db);
  if (isJson === undefined) {
    try {
      const { rows } = await db.query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'mail_messages' AND column_name = 'to_emails'`
      );
      isJson = /json/i.test(rows[0]?.data_type || 'jsonb');
    } catch {
      isJson = true;
    }
    if (db && typeof db === 'object') listTypeCache.set(db, isJson);
  }
  return isJson ? JSON.stringify(values) : values;
}

const normEmail = (e) => String(e || '').trim().toLowerCase();

// Wyślij email przez SMTP konta zewnętrznego (nodemailer; port 465 => secure: true).
async function sendViaSMTP(smtpHost, smtpPort, username, password, from, to, cc, bcc, subject, html, text) {
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
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
}

async function insertMessage(db, { accountId, folderId, fromEmail, fromName, to, cc, bcc, subject, html, text, isRead, at }) {
  const { rows } = await db.query(
    `INSERT INTO mail_messages
       (account_id, folder_id, from_email, from_name, to_emails, cc_emails, bcc_emails,
        subject, body_html, body_text, snippet, is_read, sent_at, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
     RETURNING id`,
    [
      accountId, folderId, fromEmail, fromName,
      await emailListParam(db, to), await emailListParam(db, cc), await emailListParam(db, bcc),
      subject, html, text, text.substring(0, 200), isRead, at,
    ]
  );
  return rows[0]?.id || null;
}

export default async function handler(req, reply) {
  try {
    const payload = req.body || {};
    const to = (Array.isArray(payload.to) ? payload.to : []).filter(Boolean);
    const cc = (Array.isArray(payload.cc) ? payload.cc : []).filter(Boolean);
    const bcc = (Array.isArray(payload.bcc) ? payload.bcc : []).filter(Boolean);

    if (!payload.account_id || to.length === 0) {
      return reply.code(400).send({ error: 'Podaj co najmniej jednego odbiorcę.' });
    }

    // Pobierz konto email.
    const { rows: accountRows } = await req.db.query(
      `SELECT * FROM mail_accounts WHERE id = $1`,
      [payload.account_id]
    );
    const account = accountRows[0];

    if (!account) {
      return reply.code(404).send({ error: 'Nie znaleziono skrzynki pocztowej.' });
    }
    // Wysyłać można tylko ze swojej skrzynki (konto zewnętrzne ma odszyfrowywane hasło!).
    if (!req.user?.email || normEmail(account.user_email) !== normEmail(req.user.email)) {
      return reply.code(403).send({ error: 'Możesz wysyłać tylko ze swojej skrzynki pocztowej.' });
    }

    let sentMessageId = null;
    const subject = payload.subject || '(brak tematu)';
    const bodyHtml = payload.body_html || '';
    const bodyText = payload.body_text || bodyHtml.replace(/<[^>]*>/g, '') || '';
    const nowIso = new Date().toISOString();

    // Dla poczty wewnętrznej.
    if (account.account_type === 'internal') {
      const fromEmail = account.user_email;
      const fromName = String(account.name || fromEmail.split('@')[0]);

      // Znajdź folder "Sent".
      const { rows: sentFolderRows } = await req.db.query(
        `SELECT id FROM mail_folders WHERE account_id = $1 AND type = 'sent'`,
        [payload.account_id]
      );
      const sentFolder = sentFolderRows[0];

      if (!sentFolder) {
        return reply.code(404).send({ error: 'Nie znaleziono folderu Wysłane.' });
      }

      // Podział odbiorców: wewnętrzni (skrzynka w aplikacji) i zewnętrzni (prawdziwy e-mail).
      const internal = new Map(); // email -> account id
      const external = { to: [], cc: [], bcc: [] };
      for (const [kind, list] of [['to', to], ['cc', cc], ['bcc', bcc]]) {
        for (const recipientEmail of list) {
          const { rows: recipientAccountRows } = await req.db.query(
            `SELECT id FROM mail_accounts WHERE lower(user_email) = lower($1) AND account_type = 'internal' LIMIT 1`,
            [recipientEmail]
          );
          if (recipientAccountRows[0]) internal.set(normEmail(recipientEmail), recipientAccountRows[0].id);
          else external[kind].push(recipientEmail);
        }
      }

      // Zewnętrzni odbiorcy — przez wspólną wysyłkę (Resend). Najpierw wysyłka, potem zapis jako wysłane.
      const externalCount = external.to.length + external.cc.length + external.bcc.length;
      if (externalCount > 0) {
        try {
          const visible = [...external.to, ...external.cc];
          if (visible.length > 0) {
            await sendEmail({ to: visible, subject, html: bodyHtml, text: bodyText, fromName, replyTo: fromEmail });
          }
          // Ukryta kopia: osobny mail do każdej osoby, żeby adresy się nie ujawniły.
          for (const hidden of external.bcc) {
            await sendEmail({ to: hidden, subject, html: bodyHtml, text: bodyText, fromName, replyTo: fromEmail });
          }
        } catch (err) {
          req.log.error({ err }, 'send-mail: wysyłka zewnętrzna');
          return reply.code(502).send({ error: 'Nie udało się wysłać wiadomości do odbiorców spoza aplikacji. Spróbuj ponownie za chwilę.' });
        }
      }

      // Zapisz wiadomość w folderze "Sent".
      sentMessageId = await insertMessage(req.db, {
        accountId: payload.account_id, folderId: sentFolder.id, fromEmail, fromName,
        to, cc, bcc, subject, html: bodyHtml, text: bodyText, isRead: true, at: nowIso,
      });

      // Dostarcz do wewnętrznych odbiorców (bez listy ukrytej kopii w ich egzemplarzu).
      for (const recipientAccountId of new Set(internal.values())) {
        const { rows: inboxFolderRows } = await req.db.query(
          `SELECT id FROM mail_folders WHERE account_id = $1 AND type = 'inbox'`,
          [recipientAccountId]
        );
        const inboxFolder = inboxFolderRows[0];
        if (!inboxFolder) continue;

        await insertMessage(req.db, {
          accountId: recipientAccountId, folderId: inboxFolder.id, fromEmail, fromName,
          to, cc, bcc: [], subject, html: bodyHtml, text: bodyText, isRead: false, at: nowIso,
        });

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
      // Dla kont zewnętrznych - użyj SMTP skonfigurowanego dla tego konta.
      if (!account.smtp_host || !account.encrypted_password || !config.MAIL_ENCRYPTION_SECRET) {
        return reply.code(400).send({ error: 'Ta skrzynka nie ma ustawionego serwera wysyłki (SMTP). Uzupełnij go w ustawieniach poczty.' });
      }

      const password = await decryptPassword(account.encrypted_password, config.MAIL_ENCRYPTION_SECRET);

      try {
        await sendViaSMTP(
          account.smtp_host,
          account.smtp_port || 465,
          account.external_email,
          password,
          account.external_email,
          to, cc, bcc,
          subject, bodyHtml, bodyText
        );
      } catch (err) {
        req.log.error({ err }, 'send-mail: SMTP konta');
        return reply.code(502).send({ error: 'Serwer poczty odrzucił wiadomość. Sprawdź ustawienia skrzynki i spróbuj ponownie.' });
      }

      // Zapisz wysłaną wiadomość (dopiero po udanej wysyłce).
      const { rows: sentFolderRows } = await req.db.query(
        `SELECT id FROM mail_folders WHERE account_id = $1 AND type = 'sent'`,
        [payload.account_id]
      );
      const sentFolder = sentFolderRows[0];

      if (sentFolder) {
        sentMessageId = await insertMessage(req.db, {
          accountId: payload.account_id, folderId: sentFolder.id,
          fromEmail: account.external_email, fromName: account.external_email?.split('@')[0] || '',
          to, cc, bcc, subject, html: bodyHtml, text: bodyText, isRead: true, at: nowIso,
        });
      }
    }

    return reply.send({
      success: true,
      message: 'Wiadomość wysłana',
      message_id: sentMessageId,
    });
  } catch (err) {
    req.log.error({ err }, 'Send mail error');
    return reply.code(500).send({ error: 'Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę.' });
  }
}
