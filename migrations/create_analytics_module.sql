-- ============================================
-- MODUŁ ANALITYKI (BI / Dashboard liderów)
-- Widok strategiczny: wzrost, dawanie, frekwencja, lejek zaangażowania.
-- UWAGA: moduł TYLKO CZYTA istniejące tabele (members, donations,
-- attendance_sessions/attendance, checkins). Nie tworzy tabel danych.
-- Ta migracja rejestruje jedynie moduł w nawigacji i nadaje uprawnienia.
-- ============================================

-- ============================================
-- Rejestracja modułu w nawigacji
-- ============================================
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, component_name)
VALUES ('analytics', 'Analityka', 'BarChart3', '/analytics', 'module:analytics', 17, true, 'AnalyticsModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key,
  display_order = EXCLUDED.display_order,
  component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne (dashboard BI dla liderów)
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:analytics', true, true),
  ('rada_starszych', 'module:analytics', true, true),
  ('admin', 'module:analytics', true, true),
  ('koordynator', 'module:analytics', true, false),
  ('lider', 'module:analytics', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
