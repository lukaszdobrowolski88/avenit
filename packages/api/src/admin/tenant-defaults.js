// Domyślne ustawienia NOWEGO kościoła (tenanta) — seedowane przy prowizjonowaniu.
//
//  • Wygląd = identyfikacja Avenit (jak schwro): paleta 'avenit', Manrope, papier, zaokrąglone.
//    Klucze jak w Ustawienia → Wygląd (src/lib/appearance.js, PermissionsContext, Login.jsx).
//  • Domyślny pulpit (web) = układ widżetów jak u lukasz@schwro.pl (2026-10). Klucz
//    `dashboard_default_layout` = JSON {layout, mobile_layout}; web używa go, gdy użytkownik nie
//    ma własnego układu (src/modules/Dashboard/hooks/useDashboardLayout.js). mobile_layout = null
//    (mobilka ma własny model sekcji; schwro nie ma zapisanego układu mobilnego).
//
// ON CONFLICT DO NOTHING — nigdy nie nadpisuje tego, co już jest (szablon/migracje/admin).
// Celowo BEZ migracji tenantów: istniejące kościoły zostają nietknięte.

export const DASHBOARD_DEFAULT_LAYOUT_KEY = 'dashboard_default_layout';

export const DEFAULT_DASHBOARD_LAYOUT = [
  { widgetId: 'welcome', order: 0, size: 'large', visible: true },
  { widgetId: 'ministry', order: 1, size: 'small', visible: true },
  { widgetId: 'tasks', order: 2, size: 'medium', visible: true },
  { widgetId: 'absences', order: 3, size: 'small', visible: true },
  { widgetId: 'prayers', order: 4, size: 'small', visible: true },
  { widgetId: 'onlineUsers', order: 5, size: 'small', visible: true },
  { widgetId: 'unreadMessages', order: 6, size: 'small', visible: true },
  { widgetId: 'upcomingEvents', order: 7, size: 'small', visible: true },
  { widgetId: 'quickAccess', order: 8, size: 'medium', visible: false },
  { widgetId: 'birthdays', order: 9, size: 'small', visible: false },
  { widgetId: 'rsvpSummary', order: 10, size: 'medium', visible: false },
  { widgetId: 'givingMonth', order: 11, size: 'small', visible: true },
  { widgetId: 'attendance', order: 12, size: 'medium', visible: false },
];

export const DEFAULT_APPEARANCE_SETTINGS = {
  color_preset: 'avenit',
  appearance_theme: 'system',
  appearance_compact: 'true',
  ui_font: 'manrope',
  ui_font_heading: 'body',
  ui_bg: 'paper',
  ui_bg_pattern: 'none',
  ui_radius: 'round',
  ui_sidebar: 'theme',
  login_bg: 'default',
};

export const TENANT_DEFAULT_SETTINGS = {
  ...DEFAULT_APPEARANCE_SETTINGS,
  [DASHBOARD_DEFAULT_LAYOUT_KEY]: JSON.stringify({ layout: DEFAULT_DASHBOARD_LAYOUT, mobile_layout: null }),
};

// Wstawia brakujące klucze do app_settings tenanta. Zwraca liczbę faktycznie dodanych.
export async function seedTenantDefaults(pool) {
  let inserted = 0;
  for (const [key, value] of Object.entries(TENANT_DEFAULT_SETTINGS)) {
    const r = await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
    inserted += r.rowCount || 0;
  }
  return inserted;
}
