import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, getCachedUser } from '../lib/supabase';
import { applyColorPreset, applyCustomColors } from '../lib/colorPresets';
import { applyFont, applyBackground, applyScale, applyRadius, applySidebar, injectCustomFont, applyHeadingFont, applyBgPattern, setBgUrl, applySidebarWidth, applyMotion, applyScrollbar, applyOled, injectCustomCss } from '../lib/appearance';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { ministryGrants } from '@avenit/shared/src/permissions/ministry.js';

const PermissionsContext = createContext({
  can: () => true,
  canFieldRead: () => true,
  canFieldWrite: () => true,
  grants: null,
  subject: null,
  appSettings: {},
  logoUrl: null,
  loading: true,
  ready: false,
});

const CACHE_KEYS = {
  settings: 'app_settings_cache',
  grants: 'permission_grants_cache',
  adminRoles: 'admin_roles_cache',
  subject: 'perm_subject_cache',
  logo: 'app_logo_cache',
};

const DEFAULT_SETTINGS = {
  members: true, worship: true, media: true, atmosfera: true,
  kids: true, groups: true, prayer: true, komunikator: true,
};

const readCache = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

export function PermissionsProvider({ children }) {
  const [grants, setGrants] = useState(() => readCache(CACHE_KEYS.grants, null));
  const [adminRoles, setAdminRoles] = useState(() => readCache(CACHE_KEYS.adminRoles, ['superadmin']));
  const [subject, setSubject] = useState(() => readCache(CACHE_KEYS.subject, null));
  const [ready, setReady] = useState(() => readCache(CACHE_KEYS.grants, null) !== null);

  const [appSettings, setAppSettings] = useState(() => readCache(CACHE_KEYS.settings, DEFAULT_SETTINGS));
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem(CACHE_KEYS.logo) || null);
  const [loading] = useState(false); // nie blokuj UI — mamy cache/domyślne

  useEffect(() => {
    (async () => {
      try {
        const authUser = await getCachedUser();
        // Bieżący user (id + rola) — do subject i user-override.
        let me = null;
        if (authUser?.id) {
          const r = await supabase.from('app_users').select('id, role').eq('auth_user_id', authUser.id).limit(1).maybeSingle();
          me = r.data;
        }
        if (!me && authUser?.email) {
          const r = await supabase.from('app_users').select('id, role').ilike('email', authUser.email).order('created_at', { ascending: false }).limit(1).maybeSingle();
          me = r.data;
        }

        const [rolesRes, grantsRes, settingsRes] = await Promise.all([
          supabase.from('app_roles').select('key, is_admin'),
          supabase.from('permission_grants').select('role, user_id, capability, allowed'),
          supabase.from('app_settings').select('key, value'),
        ]);

        const admins = (rolesRes.data || []).filter((r) => r.is_admin).map((r) => r.key);
        const adminSet = admins.length ? admins : ['superadmin'];
        const subj = me ? { role: me.role, userId: me.id, isAdmin: adminSet.includes(me.role) } : null;
        const g = grantsRes.data || [];

        // Granty z PRZYNALEŻNOŚCI DO SŁUŻB bieżącego użytkownika — dokładane ADDYTYWNIE, żeby
        // UI odzwierciedlał to samo co backend. Osobne zapytanie (brak tabeli przed migracją 025
        // → puste, nie psuje reszty). Kampus pomijamy (Faza 4).
        let memGrants = [];
        if (me?.id) {
          const mmRes = await supabase.from('ministry_memberships').select('ministry_key, role').eq('user_id', me.id);
          if (mmRes.data) memGrants = ministryGrants(mmRes.data).map((x) => ({ role: null, user_id: me.id, capability: x.capability, allowed: x.allowed }));
        }
        const gAll = memGrants.length ? [...g, ...memGrants] : g;

        setAdminRoles(adminSet); localStorage.setItem(CACHE_KEYS.adminRoles, JSON.stringify(adminSet));
        setGrants(gAll); localStorage.setItem(CACHE_KEYS.grants, JSON.stringify(gAll));
        if (subj) { setSubject(subj); localStorage.setItem(CACHE_KEYS.subject, JSON.stringify(subj)); }
        setReady(true);

        // Ustawienia + logo + kolory (zachowane).
        if (settingsRes.data) {
          const settings = settingsRes.data;
          const logo = settings.find((s) => s.key === 'org_logo_url')?.value;
          if (logo) { setLogoUrl(logo); localStorage.setItem(CACHE_KEYS.logo, logo); }
          const ns = { ...DEFAULT_SETTINGS };
          settings.forEach((s) => {
            const m = s.key.match(/^module_(\w+)_enabled$/);
            if (m && m[1] in ns) ns[m[1]] = s.value === 'true';
          });
          setAppSettings(ns); localStorage.setItem(CACHE_KEYS.settings, JSON.stringify(ns));
          const cp = settings.find((s) => s.key === 'color_preset')?.value;
          if (cp) {
            if (cp.startsWith('custom_color_preset_')) {
              const cd = settings.find((s) => s.key === cp)?.value;
              if (cd) { try { const p = JSON.parse(cd); applyCustomColors(p.primary, p.secondary); } catch { /* ignore */ } }
            } else applyColorPreset(cp);
          }
          // Wygląd org-wide: czcionka, tło, rozmiar, zaokrąglenie, pasek boczny, font własny.
          const ufu = settings.find((s) => s.key === 'custom_font_url')?.value; if (ufu) injectCustomFont(ufu);
          const uf = settings.find((s) => s.key === 'ui_font')?.value;   if (uf) applyFont(uf);
          const ub = settings.find((s) => s.key === 'ui_bg')?.value;     if (ub) applyBackground(ub);
          const us = settings.find((s) => s.key === 'ui_scale')?.value;  if (us) applyScale(us);
          const ur = settings.find((s) => s.key === 'ui_radius')?.value; if (ur) applyRadius(ur);
          const usb = settings.find((s) => s.key === 'ui_sidebar')?.value; if (usb) applySidebar(usb);
          const uh = settings.find((s) => s.key === 'ui_font_heading')?.value; if (uh) applyHeadingFont(uh);
          const ubu = settings.find((s) => s.key === 'ui_bg_url')?.value; if (ubu) setBgUrl(ubu);
          const upt = settings.find((s) => s.key === 'ui_bg_pattern')?.value; if (upt) applyBgPattern(upt);
          const usw = settings.find((s) => s.key === 'ui_sidebar_w')?.value; if (usw) applySidebarWidth(usw);
          const umo = settings.find((s) => s.key === 'ui_motion')?.value; if (umo) applyMotion(umo);
          const usc = settings.find((s) => s.key === 'ui_scrollbar')?.value; if (usc) applyScrollbar(usc);
          const uol = settings.find((s) => s.key === 'ui_oled')?.value; if (uol) applyOled(uol);
          const ucss = settings.find((s) => s.key === 'custom_css')?.value; if (ucss) injectCustomCss(ucss);
        }
      } catch (err) {
        console.error('Error loading permissions:', err);
      }
    })();
  }, []);

  const resolver = useMemo(() => makeResolver(grants || [], subject || {}), [grants, subject]);

  // Permisywnie do czasu załadowania grantów (backend jest autorytatywny) i dla adminów.
  const can = useCallback((capability) => {
    if (!ready || !subject) return true;
    if (subject.isAdmin) return true;
    return resolver.can(capability);
  }, [ready, subject, resolver]);

  const canFieldRead = useCallback((res, col) => (!ready || !subject || subject.isAdmin) ? true : resolver.fieldReadable(res, col), [ready, subject, resolver]);
  const canFieldWrite = useCallback((res, col) => (!ready || !subject || subject.isAdmin) ? true : resolver.fieldWritable(res, col), [ready, subject, resolver]);

  const value = useMemo(() => ({
    can, canFieldRead, canFieldWrite, grants, subject, appSettings, logoUrl, loading, ready,
  }), [can, canFieldRead, canFieldWrite, grants, subject, appSettings, logoUrl, loading, ready]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
