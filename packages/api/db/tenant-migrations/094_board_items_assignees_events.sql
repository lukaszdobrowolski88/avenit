-- 094: Zadania na Tablicach — powiązanie z wydarzeniem, „przypisane do mnie” bez skanu JSONB,
-- indeksy komentarzy/dziennika, naprawa elementów bez grupy i kaskada usuwania grup.
--
-- 1) board_items.event_id — zadanie powiązane z wydarzeniem. Typ = typ events.id (na produkcji
--    INTEGER, w szablonie UUID — introspekcja); FK ON DELETE SET NULL, gdy events.id jest unikalne.
-- 2) board_items.assignee_emails text[] — e-maile osób z kolumn „Osoby” (board_columns.type='people';
--    komórka = [{ email, name, avatar_url }]), małymi literami, utrzymywane triggerem (także po
--    usunięciu kolumny „Osoby”). GIN → „przypisane do mnie”: Data API .contains('assignee_emails', [email]),
--    fn my-board-items, poranny skrót zadań — bez przeglądania cells każdego elementu.
-- 3) Indeksy board_item_activity(board_id), board_item_updates(board_id) (dziennik i wątki tablicy).
-- 4) Elementy „duchy”: group_id NULL i nie podelement (zostawały po usunięciu grupy — FK SET NULL,
--    a widoki pokazują tylko elementy grup) → pierwsza grupa tablicy (brak grup → nowa „Elementy”).
--    FK board_items.group_id → ON DELETE CASCADE (UI i tak usuwa elementy razem z grupą).
-- 5) boards.settings jsonb — ustawienia tablicy (np. settings.event_task_templates: szablony zadań
--    dla wydarzeń).
-- Idempotentne; bezpieczne na schemacie innym niż w repo (introspekcja w blokach DO).

-- ── 5) boards.settings ─────────────────────────────────────────────────────
ALTER TABLE boards ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 1) event_id ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  ev_type text;
  col_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO ev_type
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.events') AND a.attname = 'id' AND NOT a.attisdropped;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'board_items' AND column_name = 'event_id') THEN
    EXECUTE format('ALTER TABLE board_items ADD COLUMN event_id %s', coalesce(ev_type, 'integer'));
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod) INTO col_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.board_items'::regclass AND a.attname = 'event_id' AND NOT a.attisdropped;

  -- Klucz obcy tylko, gdy typy się zgadzają i events.id jest unikalne (PK/UNIQUE na samej kolumnie).
  IF ev_type IS NOT NULL AND col_type = ev_type
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid = 'public.board_items'::regclass AND conname = 'board_items_event_id_fkey')
     AND EXISTS (SELECT 1 FROM pg_index i
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                  WHERE i.indrelid = to_regclass('public.events') AND i.indisunique AND i.indnatts = 1
                    AND a.attname = 'id') THEN
    BEGIN
      ALTER TABLE board_items
        ADD CONSTRAINT board_items_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE '094: klucz obcy board_items.event_id pominięty (%)', SQLERRM;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_board_items_event ON board_items(event_id) WHERE event_id IS NOT NULL;

-- ── 2) assignee_emails ──────────────────────────────────────────────────────
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS assignee_emails text[] NOT NULL DEFAULT '{}'::text[];

-- E-maile z kolumn „Osoby” danej tablicy. Kształt kanoniczny [{ email, … }]; gołe e-maile (stare dane)
-- też liczymy. Bez duplikatów, posortowane, małymi literami.
CREATE OR REPLACE FUNCTION board_item_assignees(p_board_id uuid, p_cells jsonb)
RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(DISTINCT x.e ORDER BY x.e), '{}'::text[])
    FROM (
      SELECT lower(btrim(CASE jsonb_typeof(p.v)
                           WHEN 'object' THEN p.v ->> 'email'
                           WHEN 'string' THEN p.v #>> '{}'
                         END)) AS e
        FROM board_columns c
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_cells -> (c.id::text)) = 'array' THEN p_cells -> (c.id::text) ELSE '[]'::jsonb END
        ) AS p(v)
       WHERE c.board_id = p_board_id AND c.type = 'people'
    ) x
   WHERE x.e LIKE '%_@_%'
$$;

CREATE OR REPLACE FUNCTION board_items_sync_assignees()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Zawsze liczone z komórek — wartości wpisanej przez klienta nie ufamy.
  NEW.assignee_emails := board_item_assignees(NEW.board_id, NEW.cells);
  RETURN NEW;
END $$;

-- Kolumna „Osoby” usunięta albo zmieniła typ → przelicz elementy tej tablicy. Przy usuwaniu całej
-- tablicy (kaskada) wiersz boards już nie istnieje — wtedy nic nie robimy (elementy i tak znikają).
CREATE OR REPLACE FUNCTION board_columns_sync_assignees()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM boards WHERE id = OLD.board_id) THEN
    RETURN NULL;
  END IF;
  UPDATE board_items i
     SET assignee_emails = s.a
    FROM (SELECT id, board_item_assignees(board_id, cells) AS a FROM board_items WHERE board_id = OLD.board_id) s
   WHERE i.id = s.id AND i.assignee_emails IS DISTINCT FROM s.a;
  RETURN NULL;
END $$;

-- Wypełnienie istniejących elementów — bez ruszania updated_at (to nie jest zmiana użytkownika).
DO $$
DECLARE
  has_touch boolean := EXISTS (SELECT 1 FROM pg_trigger
                                WHERE tgrelid = 'public.board_items'::regclass
                                  AND tgname = 'trg_board_items_updated_at' AND NOT tgisinternal);
BEGIN
  IF has_touch THEN
    ALTER TABLE board_items DISABLE TRIGGER trg_board_items_updated_at;
  END IF;
  UPDATE board_items i
     SET assignee_emails = s.a
    FROM (SELECT id, board_item_assignees(board_id, cells) AS a
            FROM board_items
           WHERE cells IS NOT NULL AND cells <> '{}'::jsonb) s
   WHERE i.id = s.id AND i.assignee_emails IS DISTINCT FROM s.a;
  IF has_touch THEN
    ALTER TABLE board_items ENABLE TRIGGER trg_board_items_updated_at;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_board_items_assignees ON board_items;
CREATE TRIGGER trg_board_items_assignees
  BEFORE INSERT OR UPDATE OF cells, board_id, assignee_emails ON board_items
  FOR EACH ROW EXECUTE FUNCTION board_items_sync_assignees();

DROP TRIGGER IF EXISTS trg_board_columns_assignees ON board_columns;
CREATE TRIGGER trg_board_columns_assignees
  AFTER UPDATE OF type OR DELETE ON board_columns
  FOR EACH ROW WHEN (OLD.type = 'people')
  EXECUTE FUNCTION board_columns_sync_assignees();

CREATE INDEX IF NOT EXISTS idx_board_items_assignees ON board_items USING gin (assignee_emails);

-- ── 3) Indeksy dziennika i komentarzy po tablicy ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_board_item_activity_board ON board_item_activity(board_id);
CREATE INDEX IF NOT EXISTS idx_board_item_updates_board ON board_item_updates(board_id);

-- ── 4) Elementy bez grupy + kaskada usuwania grup ───────────────────────────
INSERT INTO board_groups (board_id, name, display_order)
SELECT DISTINCT i.board_id, 'Elementy', 0
  FROM board_items i
 WHERE i.group_id IS NULL AND i.parent_item_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM board_groups g WHERE g.board_id = i.board_id);

UPDATE board_items i
   SET group_id = (SELECT g.id FROM board_groups g
                    WHERE g.board_id = i.board_id
                    ORDER BY g.display_order NULLS LAST, g.created_at NULLS LAST, g.id
                    LIMIT 1)
 WHERE i.group_id IS NULL AND i.parent_item_id IS NULL;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname, con.confdeltype, con.convalidated
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
     WHERE con.conrelid = 'public.board_items'::regclass
       AND con.contype = 'f'
       AND con.confrelid = to_regclass('public.board_groups')
       AND array_length(con.conkey, 1) = 1
       AND a.attname = 'group_id'
  LOOP
    IF c.confdeltype <> 'c' THEN
      EXECUTE format('ALTER TABLE board_items DROP CONSTRAINT %I', c.conname);
      EXECUTE format(
        'ALTER TABLE board_items ADD CONSTRAINT %I FOREIGN KEY (group_id) REFERENCES board_groups(id) ON DELETE CASCADE%s',
        c.conname, CASE WHEN c.convalidated THEN '' ELSE ' NOT VALID' END);
    END IF;
  END LOOP;
END $$;
