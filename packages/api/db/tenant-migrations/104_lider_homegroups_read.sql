-- 104: Lider widzi Grupy domowe jak każdy członek (tylko odczyt) — audyt uprawnień 2026-10-11, runda 4.
-- Migracja 103 zostawiła liderowi tylko moduły wspólne, przez co lider (np. członek grupy domowej)
-- tracił Grupy domowe, które ma rola „członek” (migracja 070). Edycja grup dalej tylko z
-- przynależności do służby Grup domowych (ministry_memberships) — rola lidera dostaje jawny zakaz
-- tworzenia/edycji, bo ma szerokie res:*:create/update.
-- Tylko tenanty z modelem lidera z 103 (jawny zakaz module:members). Decyzje admina zostają
-- (ON CONFLICT DO NOTHING — np. jawnie odebrane Grupy domowe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM permission_grants
    WHERE role = 'lider' AND user_id IS NULL AND capability = 'module:members' AND NOT allowed
  ) THEN
    RETURN;
  END IF;

  INSERT INTO permission_grants (role, user_id, capability, allowed)
  VALUES ('lider', NULL, 'module:homegroups', true)
  ON CONFLICT (role, capability) WHERE user_id IS NULL DO NOTHING;

  INSERT INTO permission_grants (role, user_id, capability, allowed)
  SELECT 'lider', NULL::uuid, 'res:' || r || ':' || op, false
  FROM unnest(ARRAY['home_groups', 'home_group_leaders', 'home_group_members', 'homegroups_events',
                    'home_group_tasks', 'home_group_task_comments']) AS r,
       unnest(ARRAY['create', 'update']) AS op
  ON CONFLICT (role, capability) WHERE user_id IS NULL DO NOTHING;
END $$;
