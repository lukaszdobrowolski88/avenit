-- 020: Domyślne kolumny dla zaimportowanych tablic zadań, które przyszły PUSTE (0 kolumn).
-- Import ze źródła bez pól strukturalnych (np. media_tasks = same nazwy zadań) tworzył
-- tablicę bez kolumn → pusta zakładka „Kolumny" w elemencie i Kalendarz bez kolumny Data.
-- Dodaj sensowny domyślny zestaw: Status / Osoby / Termin.
-- Idempotentne: tylko tablice source_kind kończące się na „tasks" i mające 0 kolumn.
DO $$
DECLARE b RECORD;
BEGIN
  FOR b IN
    SELECT bd.id FROM boards bd
    WHERE bd.source_kind LIKE '%tasks'
      AND NOT EXISTS (SELECT 1 FROM board_columns c WHERE c.board_id = bd.id)
  LOOP
    INSERT INTO board_columns (board_id, name, type, settings, display_order, width) VALUES
      (b.id, 'Status', 'status',
        '{"labels":[{"id":"todo","title":"Do zrobienia","color":"#579bfc"},{"id":"doing","title":"W toku","color":"#fdab3d"},{"id":"done","title":"Gotowe","color":"#00c875"}]}'::jsonb, 0, 160),
      (b.id, 'Osoby',  'people', '{}'::jsonb, 1, 160),
      (b.id, 'Termin', 'date',   '{}'::jsonb, 2, 160);
  END LOOP;
END $$;
