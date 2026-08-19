-- Widget „Moje zadania" (Pulpit / MyTasksWidget) zapisuje flagę prywatnego zadania
-- (kłódka: is_private). Kolumny brakowało w produkcyjnym schemacie user_tasks →
-- „Błąd zapisu: column is_private of relation user_tasks does not exist".
-- Idempotentnie dodajemy kolumnę (domyślnie zadanie NIE jest prywatne).
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
