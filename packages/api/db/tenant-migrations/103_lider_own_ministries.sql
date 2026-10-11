-- 103: Lider prowadzi PRZYPISANE służby (decyzja 2026-10-11; na schwro ustawione ręcznie wcześniej).
-- Do teraz preset lidera dawał module:* — każdy lider widział WSZYSTKIE służby oraz Członków, Opiekę
-- duszpasterską, Formularze, Analitykę itd., a z roli mógł usuwać dane każdej służby (także takiej,
-- w której jest tylko członkiem). Teraz:
--   • rola daje moduły wspólne; służby — wyłącznie z ministry_memberships (lider / członek),
--   • wrażliwe moduły jawnie zabronione,
--   • usuwanie danych służb tylko dla lidera TEJ służby (z przynależności), z roli — dane wspólne.
-- Zmieniamy TYLKO tenanty ze starym presetem (lider ma module:*). Decyzje admina (istniejące
-- wiersze dla danych capability) zostają — ON CONFLICT DO NOTHING.
-- Opis roli (także tam, gdzie model ustawiono wcześniej ręcznie — np. schwro), o ile nie zmieniony.
UPDATE app_roles SET description = 'Prowadzi przypisane służby (bez finansów, ustawień i danych osobowych)'
WHERE key = 'lider' AND description = 'Prowadzi służby (bez finansów i ustawień)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM permission_grants
    WHERE role = 'lider' AND user_id IS NULL AND capability = 'module:*' AND allowed
  ) THEN
    RETURN;
  END IF;

  DELETE FROM permission_grants WHERE role = 'lider' AND user_id IS NULL AND capability = 'module:*';

  INSERT INTO permission_grants (role, user_id, capability, allowed)
  SELECT 'lider', NULL::uuid, v.cap, true FROM (VALUES
    ('module:dashboard'),
    ('module:programs'),
    ('module:calendar'),
    ('module:teaching'),
    ('module:sermons'),
    ('module:prayer'),
    ('module:komunikator'),
    ('module:boards'),
    ('module:serve')
  ) AS v(cap)
  ON CONFLICT (role, capability) WHERE user_id IS NULL DO NOTHING;

  INSERT INTO permission_grants (role, user_id, capability, allowed)
  SELECT 'lider', NULL::uuid, v.cap, false FROM (VALUES
    ('module:settings'),
    ('module:mail'),
    ('module:mailing'),
    ('module:sms_campaigns'),
    ('module:push_campaigns'),
    ('module:giving'),
    ('module:automation'),
    ('module:finance'),
    ('module:members'),
    ('module:care'),
    ('module:forms'),
    ('module:analytics'),
    ('module:attendance'),
    ('module:rsvp'),
    ('module:rooms'),
    ('module:ai')
  ) AS v(cap)
  ON CONFLICT (role, capability) WHERE user_id IS NULL DO NOTHING;

  DELETE FROM permission_grants
  WHERE role = 'lider' AND user_id IS NULL AND allowed AND capability IN (
    SELECT v.cap FROM (VALUES
    ('res:songs:delete'),
    ('res:song_attachments:delete'),
    ('res:worship_events:delete'),
    ('res:worship_team:delete'),
    ('res:media_events:delete'),
    ('res:media_team:delete'),
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
  );

END
$$;
