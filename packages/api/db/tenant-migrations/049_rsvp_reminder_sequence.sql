-- 049: Zaawansowana automatyzacja przypomnień RSVP.
-- Model "kroków przypomnień": sekwencja [{days, channels, message?}] zamiast jednego terminu.
-- Każdy krok może mieć własne kanały i treść (eskalacja: e-mail → +push → +SMS).
-- auto_close: po dacie wydarzenia automatycznie zamyka zapisy (kampania -> 'closed',
-- powiązane wydarzenie -> registration_required=false).
-- reminder_log na zaproszeniu: lista offsetów (dni przed), dla których już wysłano przypomnienie,
-- żeby każdy krok wystrzelił dokładnie raz na osobę.
ALTER TABLE rsvp_campaigns   ADD COLUMN IF NOT EXISTS reminder_steps jsonb;
ALTER TABLE rsvp_campaigns   ADD COLUMN IF NOT EXISTS auto_close     boolean DEFAULT false;
ALTER TABLE rsvp_invitations ADD COLUMN IF NOT EXISTS reminder_log   jsonb   DEFAULT '[]'::jsonb;

-- Migracja istniejących kampanii z pojedynczym przypomnieniem do modelu kroków (idempotentnie):
-- jeśli reminder_enabled i brak reminder_steps, utwórz jeden krok z dotychczasowego reminder_days_before.
UPDATE rsvp_campaigns
   SET reminder_steps = jsonb_build_array(
         jsonb_build_object(
           'days', COALESCE(reminder_days_before, 1),
           'channels', COALESCE(channels, '["email"]'::jsonb)
         )
       )
 WHERE reminder_enabled = true
   AND (reminder_steps IS NULL OR jsonb_typeof(reminder_steps) <> 'array' OR jsonb_array_length(reminder_steps) = 0);
