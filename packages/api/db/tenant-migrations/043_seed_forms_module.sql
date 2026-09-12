-- 043: Doseeduj systemowy moduł „Formularze" do app_modules (był w kodzie, ale nie w menu).
-- Sidebar buduje listę z app_modules; brak wiersza 'forms' => modułu nie było w menu,
-- mimo że route /forms + FormsModule + publiczne /form/:id istnieją. Idempotentnie.
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, is_enabled, component_name)
SELECT 'forms', 'Formularze', 'FileText', '/forms', 'module:forms',
       COALESCE((SELECT MAX(display_order) FROM app_modules), 0) + 1,
       true, true, 'FormsModule'
WHERE NOT EXISTS (SELECT 1 FROM app_modules WHERE key = 'forms');
