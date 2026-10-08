-- 092: Ślad po przeniesieniu starych zadań na Tablice (fn board-import-legacy).
-- board_items.source_id       — id wiersza w starej tabeli (media_tasks, tasks, custom_<key>_tasks…),
--                               do dopasowania przy uzupełnianiu (backfill) i śledzenia pochodzenia.
-- board_item_updates.source_id — id starego komentarza (*_task_comments) — ponowne uzupełnianie
--                               niczego nie dubluje.
-- boards.legacy_backfill_at   — kiedy tablica została uzupełniona o osoby i komentarze ze starej
--                               tabeli (klient woła backfill tylko, gdy pusto).
-- Idempotentne. Tabele źródłowe nietknięte.
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE board_item_updates ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS legacy_backfill_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_board_items_source ON board_items(board_id, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_board_item_updates_source ON board_item_updates(board_id, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boards_source_kind ON boards(source_kind) WHERE source_kind IS NOT NULL;
