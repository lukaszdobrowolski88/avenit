-- 052: Model widoczności wydarzeń (audytorium segmentowe).
-- visibility_segments: lista segmentów [{type, values?}] określająca KTO widzi wydarzenie.
--   Puste/null => BRAK ograniczeń — wydarzenie widoczne jak dotychczas (dla wszystkich z dostępem
--   do kalendarza, w ramach scope kampusu). Ograniczenie jest opt-in per wydarzenie.
--   Typy segmentów: everyone | role | campus | ministry | home_group | tag | member | invited | owner.
--   values: tablica STRINGÓW (role/keys/ids jako tekst); segmenty everyone/invited/owner nie mają values.
-- Egzekwowane serwerowo w querybuilderze (q.__visibilityScope) — fail-closed. Domyślnie null => zero zmian.
ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility_segments jsonb;
