// Port edge function sync-mail: synchronizacja poczty przez IMAP (imapflow + mailparser).
// Oryginał: supabase/functions/sync-mail/index.ts.
// UWAGA: używaj portu 993 (SSL).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from '../config.js';
import { decryptPassword } from '../lib/mailcrypto.js';

export const name = 'sync-mail';

// Funkcja do usuwania problematycznych znaków Unicode (null characters, itp.)
// PostgreSQL nie akceptuje \u0000 w tekście.
function sanitizeText(text) {
  if (!text) return null;
  // Usuń null characters i inne problematyczne znaki kontrolne.
  return text
    .replace(/\u0000/g, '') // null character
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // inne znaki kontrolne oprócz \t \n \r
}

// Pobierz wiadomości z IMAP.
async function fetchImapMessages(host, port, user, password, folder = 'INBOX', limit = 50, lastUid) {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
  });

  const messages = [];

  try {
    await client.connect();
    console.log('Połączono z IMAP: ' + host + ':' + port);

    const lock = await client.getMailboxLock(folder);

    try {
      // Pobierz najnowsze wiadomości (od końca).
      const mailbox = client.mailbox;
      const total = mailbox?.exists || 0;

      if (total === 0) {
        return messages;
      }

      const startSeq = Math.max(1, total - limit + 1);
      const range = startSeq + ':*';

      for await (const message of client.fetch(range, {
        uid: true,
        envelope: true,
        source: true,
        flags: true,
      })) {
        // Pomijaj wiadomości już zsynchronizowane.
        if (lastUid && message.uid <= lastUid) continue;

        // Parsuj wiadomość.
        const parsed = await simpleParser(message.source);

        messages.push({
          uid: message.uid,
          messageId: parsed.messageId || message.envelope?.messageId,
          from: parsed.from?.value?.[0] || { address: message.envelope?.from?.[0]?.address, name: message.envelope?.from?.[0]?.name },
          to: parsed.to?.value || message.envelope?.to?.map((t) => ({ address: t.address, name: t.name })) || [],
          cc: parsed.cc?.value || [],
          subject: parsed.subject || message.envelope?.subject || '(brak tematu)',
          date: parsed.date || message.envelope?.date,
          html: parsed.html || null,
          text: parsed.text || null,
          attachments: parsed.attachments?.map((att) => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
          })) || [],
          flags: message.flags,
          isRead: message.flags?.has('\\Seen') || false,
          isStarred: message.flags?.has('\\Flagged') || false,
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log('Pobrano ' + messages.length + ' wiadomości z IMAP');

    return messages;
  } catch (error) {
    console.error('IMAP error:', error);
    try {
      await client.logout();
    } catch {
      // ignoruj
    }
    throw error;
  }
}

// Test połączenia IMAP.
async function testImapConnection(host, port, user, password) {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    console.log('Test IMAP: połączono z ' + host);

    // Pobierz listę folderów.
    const folderList = await client.list();
    const folders = folderList.map((f) => f.path);

    await client.logout();

    return {
      success: true,
      message: 'Połączenie OK. Znaleziono ' + folders.length + ' folderów.',
      folders,
    };
  } catch (error) {
    console.error('IMAP test error:', error);
    try {
      await client.logout();
    } catch {
      // ignoruj
    }
    return {
      success: false,
      message: error.message || 'Nie można połączyć z serwerem IMAP',
    };
  }
}

// Synchronizacja jednego konta (rdzeń oryginalnej funkcji).
// Zwraca { status, body } — body identyczne jak oryginał.
async function syncAccount(pool, payload) {
  if (!config.MAIL_ENCRYPTION_SECRET) {
    return { status: 500, body: { error: 'Brak klucza szyfrowania' } };
  }

  if (!payload.account_id) {
    return { status: 400, body: { error: 'Brak account_id' } };
  }

  // Pobierz konto email.
  const { rows: accountRows } = await pool.query(
    `SELECT * FROM mail_accounts WHERE id = $1`,
    [payload.account_id]
  );
  const account = accountRows[0];

  if (!account) {
    return { status: 404, body: { error: 'Nie znaleziono konta email' } };
  }

  if (account.account_type !== 'external') {
    return { status: 400, body: { error: 'Synchronizacja IMAP dostępna tylko dla kont zewnętrznych' } };
  }

  if (!account.imap_host || !account.encrypted_password) {
    return { status: 400, body: { error: 'Brak konfiguracji IMAP dla tego konta' } };
  }

  // Odszyfruj hasło.
  const password = await decryptPassword(account.encrypted_password, config.MAIL_ENCRYPTION_SECRET);

  // Test połączenia.
  if (payload.action === 'test') {
    const result = await testImapConnection(
      account.imap_host,
      account.imap_port || 993,
      account.external_email,
      password
    );
    return { status: result.success ? 200 : 400, body: result };
  }

  // Synchronizacja.
  const folder = payload.folder || 'INBOX';
  const limit = payload.limit || 50;

  // Pobierz folder docelowy (inbox).
  const { rows: inboxFolderRows } = await pool.query(
    `SELECT id FROM mail_folders WHERE account_id = $1 AND type = 'inbox'`,
    [payload.account_id]
  );
  const inboxFolder = inboxFolderRows[0];

  if (!inboxFolder) {
    return { status: 404, body: { error: 'Nie znaleziono folderu Inbox' } };
  }

  // Pobierz ostatni UID.
  const { rows: lastMessageRows } = await pool.query(
    `SELECT imap_uid FROM mail_messages
      WHERE account_id = $1 AND imap_uid IS NOT NULL
      ORDER BY imap_uid DESC
      LIMIT 1`,
    [payload.account_id]
  );
  const lastUid = lastMessageRows[0]?.imap_uid || 0;

  // Pobierz wiadomości z IMAP.
  const messages = await fetchImapMessages(
    account.imap_host,
    account.imap_port || 993,
    account.external_email,
    password,
    folder,
    limit,
    lastUid
  );

  // Zapisz wiadomości do bazy.
  let savedCount = 0;
  for (const msg of messages) {
    // Sprawdź czy wiadomość już istnieje.
    const { rows: existingRows } = await pool.query(
      `SELECT id FROM mail_messages WHERE account_id = $1 AND imap_uid = $2 LIMIT 1`,
      [payload.account_id, msg.uid]
    );
    if (existingRows[0]) continue;

    // Sanitize text fields to remove null characters.
    const sanitizedHtml = sanitizeText(msg.html);
    const sanitizedText = sanitizeText(msg.text);
    const bodyText = sanitizedText || sanitizedHtml?.replace(/<[^>]*>/g, '') || '';
    const sanitizedSubject = sanitizeText(msg.subject) || '(brak tematu)';

    try {
      await pool.query(
        `INSERT INTO mail_messages
           (account_id, folder_id, imap_uid, message_id, from_email, from_name,
            to_emails, cc_emails, subject, body_html, body_text, snippet,
            is_read, is_starred, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          payload.account_id,
          inboxFolder.id,
          msg.uid,
          sanitizeText(msg.messageId),
          sanitizeText(msg.from?.address) || '',
          sanitizeText(msg.from?.name) || '',
          msg.to?.map((t) => sanitizeText(t.address) || '').filter(Boolean) || [],
          msg.cc?.map((c) => sanitizeText(c.address) || '').filter(Boolean) || [],
          sanitizedSubject,
          sanitizedHtml,
          bodyText,
          bodyText.substring(0, 200),
          msg.isRead,
          msg.isStarred,
          msg.date ? new Date(msg.date).toISOString() : new Date().toISOString(),
        ]
      );
      savedCount++;
    } catch (saveErr) {
      console.error('Error saving message:', saveErr);
    }
  }

  // Aktualizuj licznik nieprzeczytanych.
  const { rows: unreadRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM mail_messages WHERE folder_id = $1 AND is_read = false`,
    [inboxFolder.id]
  );
  await pool.query(
    `UPDATE mail_folders SET unread_count = $2 WHERE id = $1`,
    [inboxFolder.id, unreadRows[0].count || 0]
  );

  // Aktualizuj datę ostatniej synchronizacji.
  await pool.query(
    `UPDATE mail_accounts SET last_sync_at = NOW() WHERE id = $1`,
    [payload.account_id]
  );

  return {
    status: 200,
    body: {
      success: true,
      message: 'Zsynchronizowano ' + savedCount + ' nowych wiadomości',
      fetched: messages.length,
      saved: savedCount,
    },
  };
}

// Rdzeń logiki dla workera cron: synchronizuje WSZYSTKIE zewnętrzne konta IMAP tenanta.
export async function runForTenant(pool, ctx) {
  const log = ctx?.log || console;
  let accounts = [];
  try {
    const res = await pool.query(
      `SELECT id FROM mail_accounts
        WHERE account_type = 'external' AND imap_host IS NOT NULL AND encrypted_password IS NOT NULL`
    );
    accounts = res.rows;
  } catch {
    return { synced: 0, results: [] };
  }

  const results = [];
  for (const acc of accounts) {
    try {
      const { body } = await syncAccount(pool, { account_id: acc.id });
      results.push({ account_id: acc.id, ...body });
    } catch (err) {
      log.error(`sync-mail: konto ${acc.id} — ${err.message}`);
      results.push({ account_id: acc.id, error: err.message });
    }
  }
  return { synced: results.length, results };
}

export default async function handler(req, reply) {
  try {
    const { status, body } = await syncAccount(req.db, req.body || {});
    return reply.code(status).send(body);
  } catch (err) {
    req.log.error({ err }, 'Sync mail error');
    return reply.code(500).send({ error: err.message });
  }
}
