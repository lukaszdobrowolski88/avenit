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

const ADMIN_ROLES = ['superadmin', 'rada_starszych'];
const STORAGE_KEY = 'selected_campus_id';

export function CampusProvider({ children }) {
  const [campuses, setCampuses] = useState([]);
  const [selectedCampusId, setSelectedCampusIdState] = useState(null);
  const [userCampusId, setUserCampusId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(false);

  const isAdmin = ADMIN_ROLES.includes(userRole);
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

        // Determine initial selectedCampusId
        if (primaryCampusId && !ADMIN_ROLES.includes(role)) {
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
