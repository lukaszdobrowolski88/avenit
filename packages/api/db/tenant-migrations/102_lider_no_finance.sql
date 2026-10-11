-- 102: Lider bez pełnych Finansów (audyt uprawnień 2026-10-11).
-- Preset lidera („bez finansów”) dawał module:* + res:*:read/create/update, a zakaz zapisu
-- obejmował tylko 4 stare tabele — lider czytał i zmieniał budżet, wpływy (z nazwiskami
-- ofiarodawców) i wydatki (z wynagrodzeniami) całego kościoła.
-- Teraz: pełne Finanse — rada/skarbnik/admin; lider służby widzi budżet i wydatki SWOJEJ
-- służby przez zakładkę Finanse (tab:<moduł>:finances, serwer zawęża po team_type).
--
-- module:finance dla lidera wymuszamy na „nie” także wtedy, gdy ktoś ustawił „tak” w macierzy
-- (decyzja właściciela). Zakazy zapisu dokładamy tylko tam, gdzie admin nie ustawił własnej.

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'lider', NULL::uuid, 'module:finance', false
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'lider')
ON CONFLICT (role, capability) WHERE user_id IS NULL DO UPDATE SET allowed = false, updated_at = now();

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'lider', NULL::uuid, 'res:' || t.res || ':' || o.op, false
FROM (VALUES
    ('finance_transactions'), ('finance_balances'), ('expenses'), ('expense_categories'),
    ('finance_tags'), ('finance_recurring'), ('finance_vendors'), ('finance_report_schedules'),
    ('finance_areas'), ('finance_projects'), ('budget_audit'), ('budget_versions'),
    ('budget_items'), ('income_transactions'), ('expense_transactions')
) AS t(res)
CROSS JOIN (VALUES ('create'), ('update'), ('delete')) AS o(op)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'lider')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'lider' AND pg.user_id IS NULL AND pg.capability = 'res:' || t.res || ':' || o.op
  );
