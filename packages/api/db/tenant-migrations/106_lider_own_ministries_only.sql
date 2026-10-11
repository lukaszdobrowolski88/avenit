-- 106: Lider zmienia TYLKO dane swoich służb (decyzja właściciela 2026-10-11, „tylko swoje służby
-- wszędzie”). Do teraz rola lidera dawała globalną edycję i usuwanie wszystkich wydarzeń, grafiku
-- i programów kościoła (także innych służb) oraz edycję Nauczania. Teraz:
--   • wydarzenia i grafik — w zakresie swoich służb (z przynależności, moduleScope),
--   • program nabożeństwa — lider Uwielbienia (z przynależności) i administrator,
--   • nauczanie — administrator; pozostali liderzy czytają,
--   • akcje programów z roli: tylko zaproszenia do służby i eksporty (publikacja/wysyłka — lider
--     Uwielbienia).
-- Tylko tenanty z modelem lidera z 103 (jawny zakaz module:members). Jawne decyzje admina dla tych
-- capability zostają (ON CONFLICT DO NOTHING) — poza usuwaniem, które dał preset 103.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM permission_grants
    WHERE role = 'lider' AND user_id IS NULL AND capability = 'module:members' AND NOT allowed
  ) THEN
    RETURN;
  END IF;

  -- Usuwanie danych wspólnych z presetu 103 i szerokie akcje programów / dzieci.
  DELETE FROM permission_grants
  WHERE role = 'lider' AND user_id IS NULL AND allowed AND capability IN (
    'res:events:delete', 'res:schedule_assignments:delete', 'res:programs:delete', 'res:program_songs:delete',
    'action:programs:*', 'action:kids:*'
  );

  INSERT INTO permission_grants (role, user_id, capability, allowed)
  SELECT 'lider', NULL::uuid, 'res:' || r || ':' || op, false
  FROM unnest(ARRAY['events', 'schedule_assignments',
                    'programs', 'program_songs', 'program_types', 'program_templates', 'program_song_suggestions',
                    'teachings', 'teaching_series', 'teaching_speakers']) AS r,
       unnest(ARRAY['create', 'update', 'delete']) AS op
  ON CONFLICT (role, capability) WHERE user_id IS NULL DO NOTHING;

  INSERT INTO permission_grants (role, user_id, capability, allowed)
  SELECT 'lider', NULL::uuid, 'action:programs:' || a, true
  FROM unnest(ARRAY['send_assignment', 'export_pdf', 'export_ppt', 'export_propresenter']) AS a
  ON CONFLICT (role, capability) WHERE user_id IS NULL DO NOTHING;
END $$;
