-- Dodaj kolumnę imap_uid do mail_messages dla synchronizacji IMAP

ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS imap_uid INTEGER;

-- Indeks dla szybkiego wyszukiwania po imap_uid
CREATE INDEX IF NOT EXISTS idx_mail_messages_imap_uid ON mail_messages(account_id, imap_uid);
