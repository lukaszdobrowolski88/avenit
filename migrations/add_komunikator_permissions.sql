-- ============================================
-- Dodanie uprawnień i ustawień dla modułu Komunikator
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- 1. Dodaj ustawienie modułu (włączony/wyłączony)
INSERT INTO app_settings (key, value, description)
VALUES ('module_komunikator_enabled', 'true', 'Moduł Komunikator')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- 2. Dodaj domyślne uprawnienia dla ról
-- Superadmin ma wszystko
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('superadmin', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;

-- Rada starszych
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('rada_starszych', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;

-- Koordynator
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('koordynator', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;

-- Lider
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('lider', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;

-- Członek (też ma dostęp - komunikator jest dla wszystkich)
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('czlonek', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;
