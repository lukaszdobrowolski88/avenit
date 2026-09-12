-- 046: forms.created_by było uuid (anomalia, bez FK) — kod (jak cała apka) wstawia e-mail →
-- „invalid input syntax for type uuid". Ujednolicenie z events/module_events/rsvp_* (text).
ALTER TABLE forms ALTER COLUMN created_by TYPE text USING created_by::text;
