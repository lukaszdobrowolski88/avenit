-- Tabela dla postów na tablicy (Wall) - styl komunikatora
CREATE TABLE IF NOT EXISTS wall_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ministry TEXT NOT NULL,
  title TEXT DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  author_email TEXT NOT NULL,
  author_name TEXT,
  pinned BOOLEAN DEFAULT FALSE,
  likes TEXT[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  comments JSONB DEFAULT '[]',
  reply_to JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dodaj kolumnę reply_to jeśli nie istnieje (dla istniejących tabel)
ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL;

-- Indeks dla szybszego wyszukiwania po ministry
CREATE INDEX IF NOT EXISTS idx_wall_posts_ministry ON wall_posts(ministry);

-- Indeks dla sortowania po dacie
CREATE INDEX IF NOT EXISTS idx_wall_posts_created ON wall_posts(created_at);

-- RLS (Row Level Security)
ALTER TABLE wall_posts ENABLE ROW LEVEL SECURITY;

-- Usuń istniejące polityki (jeśli istnieją)
DROP POLICY IF EXISTS "Anyone can read wall posts" ON wall_posts;
DROP POLICY IF EXISTS "Authenticated users can create wall posts" ON wall_posts;
DROP POLICY IF EXISTS "Authenticated users can update wall posts" ON wall_posts;
DROP POLICY IF EXISTS "Authors can delete own posts" ON wall_posts;

-- Polityka: wszyscy zalogowani użytkownicy mogą czytać posty
CREATE POLICY "Anyone can read wall posts" ON wall_posts
  FOR SELECT USING (true);

-- Polityka: zalogowani użytkownicy mogą tworzyć posty
CREATE POLICY "Authenticated users can create wall posts" ON wall_posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Polityka: wszyscy zalogowani mogą aktualizować (dla likes)
CREATE POLICY "Authenticated users can update wall posts" ON wall_posts
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Polityka: autorzy mogą usuwać swoje posty
CREATE POLICY "Authors can delete own posts" ON wall_posts
  FOR DELETE USING (auth.email() = author_email);
