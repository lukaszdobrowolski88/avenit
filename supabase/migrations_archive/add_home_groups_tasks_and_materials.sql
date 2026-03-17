-- Dodaj kolumnę materials do home_groups (jako JSONB)
ALTER TABLE home_groups
ADD COLUMN IF NOT EXISTS materials JSONB DEFAULT '[]'::jsonb;

-- Tabela zadań dla grup domowych
CREATE TABLE IF NOT EXISTS home_group_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Do zrobienia',
  due_date DATE,
  assigned_to UUID REFERENCES home_group_leaders(id) ON DELETE SET NULL,
  attachment TEXT,
  group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela komentarzy do zadań grup domowych
CREATE TABLE IF NOT EXISTS home_group_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES home_group_tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy dla lepszej wydajności
CREATE INDEX IF NOT EXISTS idx_home_group_tasks_group ON home_group_tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_home_group_tasks_assigned ON home_group_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_home_group_task_comments_task ON home_group_task_comments(task_id);

-- RLS (Row Level Security)
ALTER TABLE home_group_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_group_task_comments ENABLE ROW LEVEL SECURITY;

-- Polityki RLS - pozwól na wszystko dla zalogowanych użytkowników
CREATE POLICY "Allow all for authenticated users" ON home_group_tasks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON home_group_task_comments
  FOR ALL USING (auth.role() = 'authenticated');

-- Trigger do automatycznej aktualizacji updated_at dla zadań
CREATE TRIGGER update_home_group_tasks_updated_at
  BEFORE UPDATE ON home_group_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
