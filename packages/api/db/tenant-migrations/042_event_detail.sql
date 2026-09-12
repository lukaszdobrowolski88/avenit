-- 042: Strona szczegółów wydarzenia — pola rozszerzone + link kampanii zaproszeń do wydarzenia.
-- Podstrona /wydarzenie/{id}: szczegóły (rich text), link, formularz rejestracji, płatność,
-- wymaga-rejestracji (już jest registration_required), obecność (event_registrations),
-- zaproszenia (rsvp_campaigns/rsvp_invitations powiązane przez event_id).
-- Idempotentna.

ALTER TABLE events ADD COLUMN IF NOT EXISTS link         text;      -- link zewnętrzny wydarzenia
ALTER TABLE events ADD COLUMN IF NOT EXISTS details_html text;      -- szczegóły (rich text / HTML)
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_paid      boolean DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS price        integer;   -- cena w groszach (gdy is_paid)
ALTER TABLE events ADD COLUMN IF NOT EXISTS form_id      integer;   -- podpięty formularz rejestracji (forms.id)

-- Powiązanie kampanii zaproszeń z wydarzeniem (do sekcji „Zaproszenia" na stronie wydarzenia).
-- event_ref_id (uuid) było pod stare tabele; events.id jest integer → dedykowana kolumna.
ALTER TABLE rsvp_campaigns ADD COLUMN IF NOT EXISTS event_id integer;
CREATE INDEX IF NOT EXISTS idx_rsvp_campaigns_event ON rsvp_campaigns (event_id);
