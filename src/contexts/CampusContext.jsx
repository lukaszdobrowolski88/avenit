import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, getCachedUser } from '../lib/supabase';

const CampusContext = createContext({
  campuses: [],
  selectedCampusId: null,
  userCampusId: null,
  canSwitchCampus: true,
  setSelectedCampusId: () => {},
  applyCampusFilter: (query) => query,
  getCampusIdForInsert: () => null,
  loading: false
});

const STORAGE_KEY = 'selected_campus_id';

export function CampusProvider({ children }) {
  const [campuses, setCampuses] = useState([]);
  const [selectedCampusId, setSelectedCampusIdState] = useState(null);
  const [userCampusId, setUserCampusId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  // „Widzi wszystkie kampusy" = rola admina (app_roles.is_admin — jedyne źródło prawdy)
  // LUB osoba bez przypisanego kampusu. Wcześniej rada_starszych była zaszyta jako
  // zawsze-wszystkie, co blokowało radę per-kampus. Teraz: przypisz komuś kampus → widzi
  // swój; zostaw pusty → widzi wszystkie. Działa dla każdej roli, w tym rady.
  const [adminRoles, setAdminRoles] = useState(['superadmin']);
  const [loading, setLoading] = useState(false);

  const isAdmin = adminRoles.includes(userRole);
  const canSwitchCampus = isAdmin || !userCampusId;

  // Fetch campuses + user's primary campus
  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await getCachedUser();
        if (!user) return;

        // Fetch campuses - may fail if table doesn't exist
        const campusesResult = await supabase
          .from('campuses')
          .select('*')
          .eq('is_active', true)
          .order('sort_order');

        if (campusesResult.error || !campusesResult.data?.length) {
          // Table doesn't exist or no campuses - skip everything
          return;
        }

        const fetchedCampuses = campusesResult.data;
        setCampuses(fetchedCampuses);

        // Fetch user data including campus and role
        const userResult = await supabase
          .from('app_users')
          .select('campus_id, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        const primaryCampusId = userResult.data?.campus_id || null;
        const role = userResult.data?.role || null;
        setUserCampusId(primaryCampusId);
        setUserRole(role);

        // Role admina = app_roles.is_admin (źródło prawdy). Fallback: superadmin.
        const rolesResult = await supabase.from('app_roles').select('key, is_admin');
        const admins = (rolesResult.data || []).filter((r) => r.is_admin).map((r) => r.key);
        const adminList = admins.length ? admins : ['superadmin'];
        setAdminRoles(adminList);

        // Osoba z przypisanym kampusem (i nie-admin) startuje zablokowana na swoim kampusie;
        // brak kampusu lub admin → może przełączać / widzi wszystkie.
        if (primaryCampusId && !adminList.includes(role)) {
          setSelectedCampusIdState(primaryCampusId);
        } else {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (fetchedCampuses.some(c => c.id === parsed)) {
              setSelectedCampusIdState(parsed);
            }
          }
        }
      } catch (err) {
        // Silently fail - campus feature is optional
        console.warn('Campus init error:', err);
      }
    };

    fetchData();
  }, []);

  // Setter that respects campus lock
  const setSelectedCampusId = useCallback((id) => {
    if (!canSwitchCampus) return;
    setSelectedCampusIdState(id);
    if (id !== null) {
      localStorage.setItem(STORAGE_KEY, String(id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [canSwitchCampus]);

  // Apply campus filter to a Supabase query
  const applyCampusFilter = useCallback((query) => {
    if (selectedCampusId) {
      return query.eq('campus_id', selectedCampusId);
    }
    return query;
  }, [selectedCampusId]);

  // Get campus_id for inserts
  const getCampusIdForInsert = useCallback(() => {
    return selectedCampusId || userCampusId || null;
  }, [selectedCampusId, userCampusId]);

  return (
    <CampusContext.Provider value={{
      campuses,
      selectedCampusId,
      userCampusId,
      canSwitchCampus,
      setSelectedCampusId,
      applyCampusFilter,
      getCampusIdForInsert,
      loading
    }}>
      {children}
    </CampusContext.Provider>
  );
}

export function useCampus() {
  return useContext(CampusContext);
}
