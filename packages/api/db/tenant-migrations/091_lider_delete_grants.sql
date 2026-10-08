-- 091: Lider — usuwanie danych SŁUŻBOWYCH.
-- Preset „lider" miał res:*:read|create|update, ale żadnego res:*:delete — lider służby nie mógł
-- usunąć wydarzenia, przydziału w grafiku, zadania ani kolumny na tablicy swojej służby.
-- Dokładamy usuwanie TYLKO dla danych służbowych: wydarzenia i grafik, zadania kalendarza,
-- programy, tablice (board_*) i zasoby modułów służb (Uwielbienie, Media, Atmosfera, Dzieci,
-- Grupy domowe, Młodzieżówka — wg katalogu). BEZ finansów, ustawień, członków/opieki i mailingu.
-- Lista = LIDER_DELETE_RESOURCES w packages/shared/src/permissions/presets.js (test spójności
-- w packages/api/test/module-scope.test.js).
--
-- Addytywnie i idempotentnie (wzór 013/072): wstawiamy allowed=true tylko tam, gdzie admin nie
-- podjął własnej decyzji — brak JAKIEGOKOLWIEK wiersza lider+ta capability — i gdy nie ma
-- jawnego zakazu res:*:delete dla lidera (dokładny grant przebiłby wildcard, a to byłoby
-- obejście świadomej decyzji admina).

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'lider', NULL::uuid, v.cap, true
FROM (VALUES
    ('res:events:delete'),
    ('res:schedule_assignments:delete'),
    ('res:tasks:delete'),
    ('res:programs:delete'),
    ('res:program_songs:delete'),
    ('res:boards:delete'),
    ('res:board_groups:delete'),
    ('res:board_columns:delete'),
    ('res:board_items:delete'),
    ('res:board_item_updates:delete'),
    ('res:board_item_activity:delete'),
    ('res:board_views:delete'),
    ('res:board_automations:delete'),
    ('res:board_automation_runs:delete'),
    ('res:board_dashboards:delete'),
    ('res:songs:delete'),
    ('res:song_attachments:delete'),
    ('res:worship_events:delete'),
    ('res:worship_team:delete'),
    ('res:media_events:delete'),
    ('res:media_team:delete'),
    ('res:equipment:delete'),
    ('res:media_tasks:delete'),
    ('res:media_task_comments:delete'),
    ('res:atmosfera_events:delete'),
    ('res:atmosfera_members:delete'),
    ('res:kids_groups:delete'),
    ('res:kids_students:delete'),
    ('res:kids_teachers:delete'),
    ('res:kids_events:delete'),
    ('res:checkin_locations:delete'),
    ('res:checkin_sessions:delete'),
    ('res:checkins:delete'),
    ('res:kids_parent_notifications:delete'),
    ('res:home_groups:delete'),
    ('res:home_group_leaders:delete'),
    ('res:home_group_members:delete'),
    ('res:homegroups_events:delete'),
    ('res:home_group_tasks:delete'),
    ('res:home_group_task_comments:delete'),
    ('res:mlodziezowka_events:delete'),
    ('res:mlodziezowka_members:delete'),
    ('res:mlodziezowka_tasks:delete'),
    ('res:custom_mc_members:delete'),
    ('res:mlodziezowka_leaders:delete'),
    ('res:mlodziezowka_task_comments:delete')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'lider')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'lider' AND pg.user_id IS NULL AND pg.capability = v.cap
  )
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'lider' AND pg.user_id IS NULL AND pg.capability = 'res:*:delete' AND pg.allowed = false
  );
