-- 011: Ściana (wall_posts) — dołóż kolumny używane przez kod (WallTab), a brakujące
-- w żywym schemacie. Dryf: template ma DWIE różne definicje wall_posts; przez
-- CREATE TABLE IF NOT EXISTS wygrywa „lean" wariant (team_type/author_id/is_pinned),
-- a kod oczekuje bogatszego (ministry/title/author_email/author_name/pinned/likes/
-- attachments/comments). Efekt: Tablica nie działa — SELECT po 'ministry' rzuca
-- 42703 ("column t.ministry does not exist"), a dodanie wpisu pada na brakujących
-- kolumnach. Dokładamy kolumny (nie ruszamy istniejących), idempotentnie.

DO $$
BEGIN
  IF to_regclass('public.wall_posts') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS ministry     TEXT;
  ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS title        TEXT DEFAULT '';
  ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS author_email TEXT;
  ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS author_name  TEXT;
  ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS pinned       BOOLEAN DEFAULT false;
  ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS likes        JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS attachments  JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS comments     JSONB DEFAULT '[]'::jsonb;
END $$;

CREATE INDEX IF NOT EXISTS idx_wall_posts_ministry ON wall_posts(ministry);
