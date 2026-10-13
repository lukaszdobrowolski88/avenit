-- 109: Komunikator — usuwanie WŁASNYCH danych czatu dla ról bez usuwania z gwiazdką (lider).
-- Od migracji 103 lider nie ma res:*:delete, a granty czatu z 065/084 dostał tylko członek.
-- Skutek: lider nie mógł wycofać głosu w ankiecie (w mobilce w ogóle zagłosować w ankiecie
-- jednokrotnego wyboru), cofnąć „🙏 Modlę się”, zdjąć reakcji, odpiąć wiadomości, wyjść
-- z grupy ani usunąć rozmowy. Zakres „tylko własne / uczestnik rozmowy” pilnuje serwer
-- (dataapi/komunikator.js) — tak samo jak u członka.
-- Dotyczy każdej roli z module:komunikator bez '*' i bez res:*:delete. Decyzje admina zostają
-- (ON CONFLICT … DO NOTHING — istniejący zakaz w macierzy nie jest nadpisywany).

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT r.role, NULL::uuid, 'res:' || c.res || ':delete', true
FROM (
  SELECT DISTINCT role FROM permission_grants
  WHERE user_id IS NULL AND role IS NOT NULL AND capability = 'module:komunikator' AND allowed
) r
CROSS JOIN unnest(ARRAY['conversation_participants', 'conversations', 'message_reactions', 'pinned_messages', 'poll_votes', 'prayer_responses', 'typing_status']) AS c(res)
WHERE NOT EXISTS (
  SELECT 1 FROM permission_grants w
  WHERE w.role = r.role AND w.user_id IS NULL AND w.allowed AND w.capability IN ('*', 'res:*:delete')
)
ON CONFLICT (role, capability) WHERE user_id IS NULL DO NOTHING;
