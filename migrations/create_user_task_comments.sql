-- Komentarze do user_tasks (sekcja "Komentarze" w widgecie zadań na dashboardzie).
-- Idempotentna migracja.

-- 1. Dorzuć brakujące kolumny do user_tasks (mobile dashboard zakłada przypisywanie + załączniki).
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS assigned_to_email TEXT;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_tasks_assigned_to ON user_tasks(assigned_to_email);

-- 2. Tabela komentarzy.
CREATE TABLE IF NOT EXISTS user_task_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES user_tasks(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_task_comments_task ON user_task_comments(task_id, created_at);

ALTER TABLE user_task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_task_comments_select" ON user_task_comments;
DROP POLICY IF EXISTS "user_task_comments_insert" ON user_task_comments;
DROP POLICY IF EXISTS "user_task_comments_update" ON user_task_comments;
DROP POLICY IF EXISTS "user_task_comments_delete" ON user_task_comments;

-- Czyta każdy kto ma dostęp do zadania (twórca lub przypisany).
CREATE POLICY "user_task_comments_select" ON user_task_comments
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND task_id IN (
      SELECT id FROM user_tasks
      WHERE user_email = (auth.jwt() ->> 'email')
         OR assigned_to_email = (auth.jwt() ->> 'email')
    )
  );

-- Komentować może każdy kto widzi zadanie (twórca lub przypisany), tylko jako siebie.
CREATE POLICY "user_task_comments_insert" ON user_task_comments
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND author_email = (auth.jwt() ->> 'email')
    AND task_id IN (
      SELECT id FROM user_tasks
      WHERE user_email = (auth.jwt() ->> 'email')
         OR assigned_to_email = (auth.jwt() ->> 'email')
    )
  );

-- Edytuje swój komentarz.
CREATE POLICY "user_task_comments_update" ON user_task_comments
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND author_email = (auth.jwt() ->> 'email')
  );

-- Usuwa swój komentarz LUB twórca zadania.
CREATE POLICY "user_task_comments_delete" ON user_task_comments
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND (
      author_email = (auth.jwt() ->> 'email')
      OR task_id IN (
        SELECT id FROM user_tasks WHERE user_email = (auth.jwt() ->> 'email')
      )
    )
  );

-- Trigger updated_at (konwencja per-tabela, tak jak inne migracje appschtomy).
CREATE OR REPLACE FUNCTION update_user_task_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_task_comments_updated_at ON user_task_comments;
CREATE TRIGGER trigger_update_user_task_comments_updated_at
  BEFORE UPDATE ON user_task_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_user_task_comments_updated_at();
