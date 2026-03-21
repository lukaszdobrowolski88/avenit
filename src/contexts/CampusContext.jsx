import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, getCachedUser } from '../lib/supabase';
import { useUserRole } from '../hooks/useUserRole';

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
  const { userRole } = useUserRole();
  const [campuses, setCampuses] = useState([]);
  const [selectedCampusId, setSelectedCampusIdState] = useState(null);
  const [userCampusId, setUserCampusId] = useState(null);
  const [loading, setLoading] = useState(false);

  const isAdmin = ADMIN_ROLES.includes(userRole);
  const canSwitchCampus = isAdmin || !userCampusId;

  // Fetch campuses + user's primary campus
  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await getCachedUser();
        if (!user) return;

        // Try to fetch campuses - table may not exist yet
        let fetchedCampuses = [];
        let primaryCampusId = null;

        const campusesResult = await supabase
          .from('campuses')
          .select('*')
          .eq('is_active', true)
          .order('sort_order');

        // If campuses table doesn't exist, gracefully skip
        if (campusesResult.error) {
          console.warn('Campuses table not available:', campusesResult.error.message);
          return;
        }

        fetchedCampuses = campusesResult.data || [];

        // Only fetch user campus if we actually have campuses
        if (fetchedCampuses.length > 0) {
          const userResult = await supabase
            .from('app_users')
            .select('campus_id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

          if (!userResult.error) {
            primaryCampusId = userResult.data?.campus_id || null;
          }
        }

        setCampuses(fetchedCampuses);
        setUserCampusId(primaryCampusId);

        // Determine initial selectedCampusId
        const isAdminRole = ADMIN_ROLES.includes(userRole);

        if (primaryCampusId && !isAdminRole) {
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
        // Silently fail - campus is optional
        console.warn('Campus fetch error:', err);
      }
    };

    fetchData();
  }, [userRole]);

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
