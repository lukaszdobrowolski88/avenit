import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCachedUser } from '../lib/supabase';

export type Campus = {
  id: number;
  name: string;
  is_active: boolean;
  sort_order: number | null;
  color?: string | null;
  city?: string | null;
  address?: string | null;
  timezone?: string | null;
};

type CampusContextValue = {
  campuses: Campus[];
  selectedCampusId: number | null;
  userCampusId: number | null;
  canSwitchCampus: boolean;
  setSelectedCampusId: (id: number | null) => void;
  applyCampusFilter: <T>(query: T) => T;
  getCampusIdForInsert: () => number | null;
  loading: boolean;
};

const CampusContext = createContext<CampusContextValue>({
  campuses: [],
  selectedCampusId: null,
  userCampusId: null,
  canSwitchCampus: true,
  setSelectedCampusId: () => {},
  applyCampusFilter: (q) => q,
  getCampusIdForInsert: () => null,
  loading: false,
});

const ADMIN_ROLES = ['superadmin', 'rada_starszych'] as const;
const STORAGE_KEY = 'selected_campus_id';

export function CampusProvider({ children }: { children: React.ReactNode }) {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampusId, setSelectedCampusIdState] = useState<number | null>(null);
  const [userCampusId, setUserCampusId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isAdmin = userRole !== null && (ADMIN_ROLES as readonly string[]).includes(userRole);
  const canSwitchCampus = isAdmin || !userCampusId;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const user = await getCachedUser();
        if (!user) return;

        const campusesResult = await supabase
          .from('campuses')
          .select('*')
          .eq('is_active', true)
          .order('sort_order');

        if (campusesResult.error || !campusesResult.data?.length) {
          // Tabela nie istnieje albo brak kampusów — pomiń całość (silent fail jak na webie).
          return;
        }

        const fetchedCampuses = campusesResult.data as Campus[];
        setCampuses(fetchedCampuses);

        const userResult = await supabase
          .from('app_users')
          .select('campus_id, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        const primaryCampusId = (userResult.data as { campus_id?: number | null } | null)?.campus_id ?? null;
        const role = (userResult.data as { role?: string | null } | null)?.role ?? null;
        setUserCampusId(primaryCampusId);
        setUserRole(role);

        if (primaryCampusId && !((ADMIN_ROLES as readonly string[]).includes(role ?? ''))) {
          // Lider z przypisanym kampusem — locked do swojego.
          setSelectedCampusIdState(primaryCampusId);
        } else {
          // Admin / brak przypisania — odczytaj wybór z AsyncStorage.
          const stored = await AsyncStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (Number.isFinite(parsed) && fetchedCampuses.some((c) => c.id === parsed)) {
              setSelectedCampusIdState(parsed);
            }
          }
        }
      } catch (err) {
        // Silent fail — kampusy są opcjonalne.
        console.warn('[campus] init error:', (err as Error)?.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const setSelectedCampusId = useCallback(
    (id: number | null) => {
      if (!canSwitchCampus) return;
      setSelectedCampusIdState(id);
      if (id !== null) {
        AsyncStorage.setItem(STORAGE_KEY, String(id)).catch(() => undefined);
      } else {
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
      }
    },
    [canSwitchCampus],
  );

  const applyCampusFilter = useCallback(
    <T,>(query: T): T => {
      if (selectedCampusId && query && typeof (query as any).eq === 'function') {
        return (query as any).eq('campus_id', selectedCampusId) as T;
      }
      return query;
    },
    [selectedCampusId],
  );

  const getCampusIdForInsert = useCallback(
    () => selectedCampusId || userCampusId || null,
    [selectedCampusId, userCampusId],
  );

  return (
    <CampusContext.Provider
      value={{
        campuses,
        selectedCampusId,
        userCampusId,
        canSwitchCampus,
        setSelectedCampusId,
        applyCampusFilter,
        getCampusIdForInsert,
        loading,
      }}
    >
      {children}
    </CampusContext.Provider>
  );
}

export function useCampus() {
  return useContext(CampusContext);
}
