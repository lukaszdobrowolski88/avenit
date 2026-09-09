-- 025: Przynależność osób do służb (Faza 1 nowego modelu ról).
-- Model docelowy — trzy osie: rola bazowa (app_users.role) + PRZYNALEŻNOŚĆ DO SŁUŻB (ta tabela)
-- + kampus. Jeden wiersz = osoba jest w danej służbie jako lider albo członek, na danym kampusie
-- albo globalnie.
--   • ministry_key = klucz modułu/służby (app_modules.key / team_type, np. 'media', 'worship')
--   • campus_id NULL = WSZYSTKIE kampusy (lider/członek globalny); wartość = tylko ten kampus
--   • role: 'leader' (prowadzi służbę) albo 'member' (współpracuje)
-- Ta tabela będzie ŹRÓDŁEM, z którego wyprowadzamy granty per-osoba (kolejny krok Fazy 1).
-- Krok w pełni ADDYTYWNY: sama tabela nie zmienia żadnego dotychczasowego zachowania.
-- Idempotentne (IF NOT EXISTS), FK-safe.
CREATE TABLE IF NOT EXISTS ministry_memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  ministry_key  TEXT NOT NULL,
  campus_id     INTEGER REFERENCES campuses(id) ON DELETE CASCADE,   -- NULL = wszystkie kampusy
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Jedna przynależność na (osoba, służba, kampus). NULL kampus (globalna) to osobny „slot”
-- dzięki COALESCE(-1), więc nie koliduje z przynależnościami kampusowymi tej samej służby.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ministry_memberships_user_ministry_campus
  ON ministry_memberships (user_id, ministry_key, COALESCE(campus_id, -1));
CREATE INDEX IF NOT EXISTS idx_ministry_memberships_user ON ministry_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_ministry_memberships_ministry ON ministry_memberships (ministry_key);
