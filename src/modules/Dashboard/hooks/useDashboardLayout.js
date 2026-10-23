import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  DEFAULT_LAYOUT, LOCAL_STORAGE_KEY, DASHBOARD_DEFAULT_LAYOUT_KEY,
  validateLayout, parseTenantDefault, resolveLayout,
} from '../utils/layoutDefaults';

// Układ pulpitu użytkownika: własny (user_dashboard_layouts.layout) → domyślny kościoła
// (app_settings.dashboard_default_layout) → DEFAULT_LAYOUT z kodu.
export function useDashboardLayout(userEmail) {
  // Inicjalizuj z cache od razu
  const [layout, setLayout] = useState(() => {
    if (!userEmail) return DEFAULT_LAYOUT;
    try {
      const cached = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${userEmail}`);
      return cached ? validateLayout(JSON.parse(cached)) : DEFAULT_LAYOUT;
    } catch { return DEFAULT_LAYOUT; }
  });
  const [loading, setLoading] = useState(false); // Nie blokuj - mamy domyślny layout
  const [saving, setSaving] = useState(false);
  // Domyślny układ kościoła ({layout, mobile_layout} | null) — do resetu i „ustaw dla wszystkich”.
  const [tenantDefault, setTenantDefault] = useState(null);

  // Pobierz układ z bazy w tle (bez blokowania UI)
  useEffect(() => {
    if (!userEmail) return;
    let alive = true;

    Promise.all([
      supabase.from('user_dashboard_layouts').select('layout').eq('user_email', userEmail).maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', DASHBOARD_DEFAULT_LAYOUT_KEY).maybeSingle(),
    ])
      .then(([own, td]) => {
        if (!alive) return;
        if (own.error) {
          console.error('Error fetching dashboard layout:', own.error);
          return;
        }
        const parsed = td.error ? null : parseTenantDefault(td.data?.value);
        setTenantDefault(parsed);
        const resolved = resolveLayout(own.data?.layout, parsed);
        setLayout(resolved);
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_${userEmail}`, JSON.stringify(resolved));
      })
      .catch(err => console.error('Error in fetchLayout:', err));
    return () => { alive = false; };
  }, [userEmail]);

  // Zapisz układ do bazy danych
  const saveLayout = useCallback(async (newLayout) => {
    if (!userEmail) return;

    const validatedLayout = validateLayout(newLayout);
    setLayout(validatedLayout);
    setSaving(true);

    // Zapisz do localStorage natychmiast
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_${userEmail}`, JSON.stringify(validatedLayout));

    try {
      // Upsert do bazy danych
      const { error } = await supabase
        .from('user_dashboard_layouts')
        .upsert(
          {
            user_email: userEmail,
            layout: validatedLayout,
          },
          {
            onConflict: 'user_email',
          }
        );

      if (error) {
        console.error('Error saving dashboard layout:', error);
      }
    } catch (error) {
      console.error('Error in saveLayout:', error);
    } finally {
      setSaving(false);
    }
  }, [userEmail]);

  // Aktualizuj kolejność widgetów (po drag-and-drop)
  const updateOrder = useCallback((reorderedWidgetIds) => {
    const newLayout = layout.map(item => ({
      ...item,
      order: reorderedWidgetIds.indexOf(item.widgetId),
    })).sort((a, b) => a.order - b.order);

    saveLayout(newLayout);
  }, [layout, saveLayout]);

  // Zmień rozmiar widgetu
  const updateSize = useCallback((widgetId, newSize) => {
    const newLayout = layout.map(item =>
      item.widgetId === widgetId ? { ...item, size: newSize } : item
    );
    saveLayout(newLayout);
  }, [layout, saveLayout]);

  // Przełącz widoczność widgetu
  const toggleVisibility = useCallback((widgetId) => {
    const newLayout = layout.map(item =>
      item.widgetId === widgetId ? { ...item, visible: !item.visible } : item
    );
    saveLayout(newLayout);
  }, [layout, saveLayout]);

  // Resetuj do domyślnego układu (kościoła, a gdy go brak — z kodu)
  const resetLayout = useCallback(() => {
    saveLayout(resolveLayout(null, tenantDefault));
  }, [saveLayout, tenantDefault]);

  // Bieżący układ jako domyślny dla wszystkich bez własnego (zapis do app_settings —
  // serwer wpuszcza tylko z prawem zarządzania ustawieniami). Układ mobilny zostaje bez zmian.
  const saveAsTenantDefault = useCallback(async () => {
    const value = { layout: validateLayout(layout), mobile_layout: tenantDefault?.mobile_layout ?? null };
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: DASHBOARD_DEFAULT_LAYOUT_KEY, value: JSON.stringify(value) }, { onConflict: 'key' });
    if (error) throw error;
    setTenantDefault(value);
    return value;
  }, [layout, tenantDefault]);

  return {
    layout,
    loading,
    saving,
    saveLayout,
    updateOrder,
    updateSize,
    toggleVisibility,
    resetLayout,
    tenantDefault,
    saveAsTenantDefault,
  };
}
