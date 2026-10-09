-- 095: Poranny skrót zadań (fn task-digest, worker codziennie 07:00 Europe/Warsaw).
-- Znacznik wysyłki per osoba i dzień — stawiany DOPIERO po doręczeniu (e-mail albo push),
-- więc ponowny przebieg tego dnia (restart workera, nadrabianie po wdrożeniu) nie dubluje skrótu,
-- a nieudany można ponowić. Tabela tylko dla serwera (poza rejestrem Data API).
-- Skrót wyłącza się dla całej organizacji w app_settings: key 'task_digest' = {"enabled": false}
-- (opcjonalnie "overdue_days": ile dni wstecz liczyć zaległe, domyślnie 14), a pojedyncza osoba —
-- wpisem 'task_digest' w push_user_preferences.category_opt_outs.
-- Idempotentne.
CREATE TABLE IF NOT EXISTS task_digest_sends (
  user_email  text        NOT NULL,
  digest_date date        NOT NULL,
  task_count  integer     NOT NULL DEFAULT 0,
  channels    text[]      NOT NULL DEFAULT '{}'::text[],
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_email, digest_date)
);
CREATE INDEX IF NOT EXISTS idx_task_digest_sends_date ON task_digest_sends(digest_date);
