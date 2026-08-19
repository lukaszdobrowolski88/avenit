-- Grafiki zespołowe (MediaTeam/Małe SchWro/Atmosfera) podpinamy pod ten sam silnik
-- powiadomień co Grupa Uwielbienia (schedule_assignments + send-assignment-invites).
-- Ich role są dynamiczne (np. „Prezentacja", „Nagłośnienie") i nie ma ich w statycznej
-- mapie worship. Przechowujemy czytelną etykietę roli, żeby e-mail/push pokazywał nazwę
-- roli, a nie surowy klucz (role_key). Idempotentnie.
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS role_label text;
