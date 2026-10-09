import { useCallback, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
// Ten sam resolver co web i API — jedno źródło prawdy dla precedencji grantów.
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
// Wspólne tabele służb (events, grafik, board_*) — reguła „globalnie albo w zakresie służby”.
import { allowedModules, canModuleScoped } from '@avenit/shared/src/permissions/moduleScope.js';
import { supabase } from './supabase';
import { useAuthSession, isStaffUser } from './auth';

// Tryb awaryjny, gdy /api/fn/my-permissions nie odpowiada (stary backend, brak sieci
// bez cache): role „służbowe" widzą wszystko (jak dotąd w apce), członek — moduły
// z presetu członka (presets.js + migracje 011/070). Lepsze niż pusta apka.
const MEMBER_FALLBACK_MODULES = new Set([
  'calendar', 'programs', 'prayer', 'komunikator', 'boards', 'teaching', 'homegroups', 'sermons',
]);

// Uprawnienia zalogowanego, policzone serwerowo przez /api/fn/my-permissions tym samym
// kodem co /api/db (rola z żywej bazy + nadpisania + służby + moduły tenanta). Mobilka
// pokazuje dokładnie to, co web pokazałby tej samej osobie.

export interface PermissionGrant {
  role: string | null;
  user_id: string | null;
  capability: string;
  allowed: boolean;
}

export interface PermissionModule {
  id?: string;
  key: string;
  label: string;
  icon: string | null;
  path: string | null;
  resource_key: string;
  is_system: boolean;
  display_order: number | null;
  visible: boolean;
}

export interface PermissionTab {
  id?: string;
  module_key: string;
  key: string;
  label: string;
  // Typ zakładki z kreatora: board | custom | announcements | links | wall | events | … | empty.
  component_type?: string;
  display_order: number | null;
  visible: boolean;
}

export interface MyPermissions {
  role: string | null;
  isAdmin: boolean;
  legacy: boolean;
  appUserId: string | null;
  campusId: number | null;
  grants: PermissionGrant[];
  ministries: { ministry_key: string; role: 'leader' | 'member'; campus_id: number | null }[];
  modules: PermissionModule[];
  tabs: PermissionTab[];
}

const fetchMyPermissions = async (): Promise<MyPermissions | null> => {
  const { data, error } = await supabase.functions.invoke('my-permissions');
  if (error || !data) throw new Error(error?.message ?? 'Brak uprawnień');
  return data as MyPermissions;
};

export const usePermissions = () => {
  const { user } = useAuthSession();
  const email = user?.email ?? null;
  const query = useQuery({
    queryKey: ['my-permissions', email],
    queryFn: fetchMyPermissions,
    enabled: !!email,
    // Uprawnienia zmieniają się rzadko; cache (persystowany) chroni przed migotaniem UI.
    staleTime: 60_000,
    retry: 1,
    // Po błędzie (brak sieci, stary backend) ponawiaj co 30 s — inaczej apka zostaje
    // w trybie awaryjnym aż do restartu. Gdy dane są, bez odpytywania.
    refetchInterval: (q) => (q.state.status === 'error' ? 30_000 : false),
  });
  // Powrót apki na pierwszy plan → odśwież uprawnienia (admin mógł je zmienić na webie).
  const { refetch } = query;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // Hook żyje w wielu komponentach naraz — cancelRefetch:false łączy wywołania w jedno.
      if (state === 'active' && email) refetch({ cancelRefetch: false });
    });
    return () => sub.remove();
  }, [email, refetch]);
  const data = query.data ?? null;
  // Endpoint nie odpowiedział, a nie ma nic w cache → zasady awaryjne (patrz wyżej).
  const fallback = !data && query.isError;
  const fallbackStaff = fallback && isStaffUser(user);

  const resolver = useMemo(() => {
    if (!data) return null;
    return makeResolver(data.grants, {
      role: data.role,
      userId: data.appUserId,
      isAdmin: data.isAdmin,
    });
  }, [data]);

  // Odwrotnie niż web (który do załadowania przepuszcza wszystko): do czasu pierwszego
  // wczytania DENY — inaczej członek widziałby na moment moduły, których nie ma.
  const can = useCallback(
    (cap: string): boolean => {
      if (fallback) {
        if (fallbackStaff) return true;
        const [kind, key] = cap.split(':');
        return kind === 'module' && MEMBER_FALLBACK_MODULES.has(key ?? '');
      }
      if (!data) return false;
      if (data.isAdmin || data.legacy) return true;
      return resolver ? resolver.can(cap) : false;
    },
    [data, resolver, fallback, fallbackStaff],
  );

  const moduleByKey = useMemo(() => {
    const m = new Map<string, PermissionModule>();
    for (const mod of data?.modules ?? []) m.set(mod.key, mod);
    return m;
  }, [data]);

  // Widoczność modułu jak w Sidebarze weba: app_modules.is_enabled + platforma + can().
  // Moduł nieobecny w app_modules (np. tenant bez wiersza) → sama capability.
  const moduleVisible = useCallback(
    (key: string): boolean => {
      if (fallback) return can(`module:${key}`);
      if (!data) return false;
      const mod = moduleByKey.get(key);
      if (mod) return mod.visible;
      return can(`module:${key}`);
    },
    [data, moduleByKey, can, fallback],
  );

  // Zakładki modułów zespołów (Członkowie/Finanse/Sprzęt…) — jak hasTabAccess na webie.
  const tabVisible = useCallback(
    (moduleKey: string, tabKey: string): boolean =>
      moduleVisible(moduleKey) && can(`tab:${moduleKey}:${tabKey}`),
    [moduleVisible, can],
  );

  // Pola z kontrolą (np. members.phone) — model OPT-OUT jak resolver: zapis dozwolony,
  // dopóki admin jawnie nie zabronił. Serwer odrzuca cały zapis z zabronionym polem.
  const fieldWritable = useCallback(
    (resource: string, column: string): boolean => {
      if (fallback) return true;
      if (!data) return false;
      if (data.isAdmin || data.legacy) return true;
      return resolver ? resolver.fieldWritable(resource, column) : true;
    },
    [data, resolver, fallback],
  );

  // Wspólne tabele służb (events, schedule_assignments, board_*): prawo globalne ALBO prawo
  // w zakresie służby moduleKey — ta sama reguła co web (canModule) i serwer (moduleScope.js).
  // Np. lider Mediów: canModule('media', 'events', 'create') === true, ('worship', …) === false.
  // op: 'read' | 'create' | 'update' | 'delete'. moduleKey null/'' = tylko prawo globalne.
  // `can` obsługuje już admina, tryb awaryjny i stan „przed wczytaniem” (DENY).
  const canModule = useCallback(
    (moduleKey: string | null | undefined, table: string, op: string): boolean =>
      canModuleScoped(can, moduleKey || null, table, op),
    [can],
  );

  // Klucze służb, w zakresie których wolno wykonać op na wspólnej tabeli (bez prawa globalnego).
  const modulesAllowing = useCallback(
    (table: string, op: string): string[] =>
      allowedModules(can, table, op, (data?.modules ?? []).map((mod: PermissionModule) => mod.key)),
    [can, data],
  );

  // Czy wolno w ogóle (globalnie albo w jakiejkolwiek służbie) — np. przycisk „Nowe wydarzenie”.
  const canModuleAny = useCallback(
    (table: string, op: string): boolean => canModule(null, table, op) || modulesAllowing(table, op).length > 0,
    [canModule, modulesAllowing],
  );

  const leaderOf = useCallback(
    (ministryKey: string): boolean =>
      !!data?.ministries.some(
        (m: MyPermissions['ministries'][number]) =>
          m.ministry_key === ministryKey && m.role === 'leader',
      ),
    [data],
  );

  return {
    ready: !!data || fallback,
    fallback,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isAdmin: !!data?.isAdmin || fallbackStaff,
    role: data?.role ?? null,
    modules: (data?.modules ?? []) as PermissionModule[],
    tabs: (data?.tabs ?? []) as PermissionTab[],
    ministries: (data?.ministries ?? []) as MyPermissions['ministries'],
    can,
    canModule,
    canModuleAny,
    modulesAllowing,
    moduleVisible,
    tabVisible,
    fieldWritable,
    leaderOf,
  };
};
