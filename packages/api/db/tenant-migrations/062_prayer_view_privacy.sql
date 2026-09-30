-- 062: Prywatność ściany modlitwy — widok NIE wystawia już e-maili.
--
-- `prayer_requests_with_counts` (widok używany przez aplikację mobilną — web czyta
-- bazową `prayer_requests`) zwracał do KAŻDEGO klienta:
--   • `praying_users` = jsonb_agg(user_email) — lista e-maili wszystkich modlących się,
--   • `user_email`    = e-mail autora, także dla wpisów ANONIMOWYCH.
-- Oba to wyciek danych osobowych. Przebudowa widoku bez kolumn e-mail; klient ustala
-- „czy ja się modlę" z WŁASNYCH wierszy prayer_interactions (.eq user_email = ja), więc
-- cudze e-maile nie wychodzą. Dodatkowo dla wpisów anonimowych zerujemy user_name/
-- requester_name po stronie serwera (anonim = naprawdę anonim). `prayer_count` zostaje.
--
-- Idempotentne (DROP VIEW IF EXISTS + CREATE); jawne kolumny (bez pr.*), odporne na
-- historyczne warianty bazowej tabeli.
DROP VIEW IF EXISTS prayer_requests_with_counts;
CREATE VIEW prayer_requests_with_counts AS
SELECT
    pr.id,
    CASE WHEN pr.is_anonymous THEN NULL ELSE pr.user_name END      AS user_name,
    CASE WHEN pr.is_anonymous THEN NULL ELSE pr.requester_name END AS requester_name,
    pr.content,
    pr.category,
    pr.visibility,
    pr.is_anonymous,
    pr.is_active,
    pr.status,
    pr.answered_testimony,
    pr.created_at,
    pr.updated_at,
    COALESCE(pi.prayer_count, 0) AS prayer_count
FROM prayer_requests pr
LEFT JOIN (
    SELECT request_id, COUNT(*) AS prayer_count
    FROM prayer_interactions
    GROUP BY request_id
) pi ON pi.request_id = pr.id;
