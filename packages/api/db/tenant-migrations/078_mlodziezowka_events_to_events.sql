-- 078: Młodzieżówka do wspólnego kalendarza (2026-10-06).
-- Web (MlodziezowkaModule, CalendarModule) i aplikacja zapisują już wydarzenia Młodzieżówki
-- w `events` z module_key = 'mlodziezowka', jak pozostałe służby. Przenosimy ewentualne
-- stare wiersze z mlodziezowka_events i usuwamy ostatnią tabelę wydarzeń modułu.
-- Rejestr API zwraca dla mlodziezowka_events pustą listę (starsze wersje aplikacji).
DO $$
BEGIN
  IF to_regclass('public.mlodziezowka_events') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO events (title, description, date, time, end_time, end_date, location, event_type,
                      max_participants, registration_required, attachments, created_by,
                      campus_id, module_key, created_at)
  SELECT m.title,
         m.description,
         (m.start_date AT TIME ZONE 'Europe/Warsaw')::date,
         to_char(m.start_date AT TIME ZONE 'Europe/Warsaw', 'HH24:MI'),
         CASE WHEN m.end_date IS NOT NULL THEN to_char(m.end_date AT TIME ZONE 'Europe/Warsaw', 'HH24:MI') END,
         CASE WHEN m.end_date IS NOT NULL THEN (m.end_date AT TIME ZONE 'Europe/Warsaw')::date END,
         m.location,
         m.event_type,
         m.max_participants,
         COALESCE(m.registration_required, false),
         COALESCE(m.attachments, '[]'::jsonb),
         m.created_by,
         m.campus_id,
         'mlodziezowka',
         COALESCE(m.created_at, now())
    FROM mlodziezowka_events m
   WHERE m.start_date IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM events e
        WHERE e.module_key = 'mlodziezowka'
          AND e.title = m.title
          AND e.date = (m.start_date AT TIME ZONE 'Europe/Warsaw')::date
     );

  -- Wiersze bez daty nie mają odpowiednika w kalendarzu — wtedy tabelę zachowujemy.
  IF EXISTS (SELECT 1 FROM mlodziezowka_events WHERE start_date IS NULL) THEN
    ALTER TABLE mlodziezowka_events RENAME TO mlodziezowka_events_legacy_backup;
    RAISE NOTICE 'mlodziezowka_events ma wiersze bez daty — zachowana jako mlodziezowka_events_legacy_backup';
  ELSE
    DROP TABLE mlodziezowka_events;
  END IF;
END $$;
