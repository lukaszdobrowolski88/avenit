-- 082: Mailing — wysyłka paczkami, liczniki, segmenty odbiorców i wypisy (RODO).
-- Szablon tenanta ma DWIE definicje tabel email_* (stara ogólna + modułu Mailing); obie są
-- `CREATE TABLE IF NOT EXISTS`, więc w bazach została stara. Kod modułu (i nowa wysyłka
-- w fn/send-mailing-campaign.js) potrzebuje kolumn z drugiej definicji. Idempotentne.

-- Autor kampanii/szablonu zapisywany jako e-mail (jak w kampaniach push/SMS); stara
-- definicja miała UUID, więc każdy zapis z e-mailem kończył się błędem typu.
ALTER TABLE email_campaigns ALTER COLUMN created_by TYPE TEXT USING created_by::text;
ALTER TABLE email_templates ALTER COLUMN created_by TYPE TEXT USING created_by::text;

-- Liczniki kampanii (czyta je lista i Statystyki; aktualizuje wysyłka).
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS json_design JSONB,
  ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opened_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounced_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_sched ON email_campaigns(status, scheduled_at);

-- Odbiorcy: rezerwacja paczki przez wysyłkę (worker + „Wyślij teraz” nie dublują maili).
ALTER TABLE email_campaign_recipients
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign_status
  ON email_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_email_lower
  ON email_campaign_recipients(lower(email));

-- Segmenty odbiorców kampanii (które grupy/służby wybrano) — stara tabela miała tylko
-- name/description/filters, a edytor zapisuje i czyta segmenty per kampania.
ALTER TABLE email_recipient_segments
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS segment_type TEXT,
  ADD COLUMN IF NOT EXISTS segment_id UUID,
  ADD COLUMN IF NOT EXISTS segment_name TEXT;
ALTER TABLE email_recipient_segments ALTER COLUMN name DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_recipient_segments_campaign_id ON email_recipient_segments(campaign_id);

-- Wypisy: jeden wiersz na adres (bez względu na wielkość liter) + kampania, z której wypisano.
ALTER TABLE email_unsubscribes
  ADD COLUMN IF NOT EXISTS campaign_id UUID;
DELETE FROM email_unsubscribes a
  USING email_unsubscribes b
 WHERE lower(a.email) = lower(b.email) AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribes_email_lower_uq ON email_unsubscribes(lower(email));

-- Poczta: synchronizacja IMAP (sync-mail) zapisuje i porównuje UID wiadomości z serwera.
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS imap_uid BIGINT;
CREATE INDEX IF NOT EXISTS idx_mail_messages_account_imap_uid ON mail_messages(account_id, imap_uid);
