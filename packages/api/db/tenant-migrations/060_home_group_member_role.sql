-- Rola członka w grupie domowej (per grupa). Jedna osoba może mieć wiele wierszy
-- (różne grupy) z różnymi rolami: member | leader | coordinator. Backfill ze starego is_leader.
ALTER TABLE home_group_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'member';
UPDATE home_group_members SET role = 'leader' WHERE is_leader = true AND (role IS NULL OR role = 'member');
