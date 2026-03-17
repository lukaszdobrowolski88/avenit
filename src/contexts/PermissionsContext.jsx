import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const PermissionsContext = createContext({
  permissions: [],
  appSettings: {},
  logoUrl: null,
  loading: true
});

// Cache keys
const CACHE_KEYS = {
  settings: 'app_settings_cache',
  permissions: 'app_permissions_cache',
  logo: 'app_logo_cache'
};

// Domyślne ustawienia
const DEFAULT_SETTINGS = {
  members: true,
  worship: true,
  media: true,
  atmosfera: true,
  kids: true,
  groups: true,
  prayer: true,
  komunikator: true
};

export function PermissionsProvider({ children }) {
  // Inicjalizuj ze cache jeśli dostępny
  const [permissions, setPermissions] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEYS.permissions);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  const [appSettings, setAppSettings] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEYS.settings);
      return cached ? JSON.parse(cached) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem(CACHE_KEYS.logo) || null);

  // Nie blokuj renderowania - mamy cache lub domyślne wartości
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Pobierz dane w tle (nie blokuj UI)
    Promise.all([
      supabase.from('app_settings').select('key, value'),
      supabase.from('app_permissions').select('role, resource, can_read')
    ]).then(([settingsResult, permsResult]) => {
      // Przetwórz ustawienia
      if (settingsResult.data) {
        const settings = settingsResult.data;
        const logo = settings.find(s => s.key === 'org_logo_url')?.value;
        if (logo) {
          setLogoUrl(logo);
          localStorage.setItem(CACHE_KEYS.logo, logo);
        }

        const newSettings = { ...DEFAULT_SETTINGS };
        settings.forEach(s => {
          if (s.key === 'module_members_enabled') newSettings.members = s.value === 'true';
          if (s.key === 'module_worship_enabled') newSettings.worship = s.value === 'true';
          if (s.key === 'module_media_enabled') newSettings.media = s.value === 'true';
          if (s.key === 'module_atmosfera_enabled') newSettings.atmosfera = s.value === 'true';
          if (s.key === 'module_kids_enabled') newSettings.kids = s.value === 'true';
          if (s.key === 'module_groups_enabled') newSettings.groups = s.value === 'true';
          if (s.key === 'module_prayer_enabled') newSettings.prayer = s.value === 'true';
          if (s.key === 'module_komunikator_enabled') newSettings.komunikator = s.value === 'true';
        });
        setAppSettings(newSettings);
        localStorage.setItem(CACHE_KEYS.settings, JSON.stringify(newSettings));
      }

      // Przetwórz uprawnienia
      if (permsResult.data) {
        setPermissions(permsResult.data);
        localStorage.setItem(CACHE_KEYS.permissions, JSON.stringify(permsResult.data));
      }
    }).catch(err => {
      console.error('Error fetching permissions:', err);
    });
  }, []);

  return (
    <PermissionsContext.Provider value={{ permissions, appSettings, logoUrl, loading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
