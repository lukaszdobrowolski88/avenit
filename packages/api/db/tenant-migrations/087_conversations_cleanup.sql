-- 087: porządki w Komunikatorze.
-- 1) Puste duplikaty rozmów 1:1 (0 wiadomości, zarchiwizowane przez wszystkich uczestników) —
--    pozostałości dawnego błędu tworzenia rozmowy przy każdym kliknięciu.
-- 2) Rozmowy z wiadomościami nowszymi niż zarchiwizowanie nie dają się dziś odróżnić — od teraz
--    nowa wiadomość sama wyciąga rozmowę z archiwum (push-hooks.js). Idempotentne.
DELETE FROM conversations c
 WHERE c.type = 'direct'
   AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
   AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id AND coalesce(p.archived, false) = false);
