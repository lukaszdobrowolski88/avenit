-- 086: role uczestników starszych rozmów (sprzed wprowadzenia ról) — były NULL.
-- Serwer (komunikator.js) traktuje NULL jak uczestnika, ale bez administratora nikt nie mógł
-- zmienić ustawień ani składu takich rozmów. Uzupełniamy jak przy nowych rozmowach:
-- rozmowa 1:1 — obie osoby administratorami; grupa/kanał — twórca administratorem, reszta członkami.
-- Kanały służb (ministry) — wszyscy członkami (skład wynika z zespołu). Idempotentne.
UPDATE conversation_participants p
   SET role = CASE
     WHEN c.type = 'direct' THEN 'admin'
     WHEN c.type = 'ministry' THEN 'member'
     WHEN c.created_by IS NOT NULL AND lower(p.user_email) = lower(c.created_by) THEN 'admin'
     ELSE 'member'
   END
  FROM conversations c
 WHERE c.id = p.conversation_id AND p.role IS NULL;
