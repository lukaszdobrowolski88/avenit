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
  loading: true
});

const ADMIN_ROLES = ['superadmin', 'rada_starszych'];
const STORAGE_KEY = 'selected_campus_id';

export function CampusProvider({ children }) {
  const { userRole } = useUserRole();
  const [campuses, setCampuses] = useState([]);
  const [selectedCampusId, setSelectedCampusIdState] = useState(null);
  const [userCampusId, setUserCampusId] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = ADMIN_ROLES.includes(userRole);
  const canSwitchCampus = isAdmin || !userCampusId;

  // Fetch campuses + user's primary campus
  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await getCachedUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Fetch campuses and user campus in parallel
        const [campusesResult, userResult] = await Promise.all([
          supabase
            .from('campuses')
            .select('*')
            .eq('is_active', true)
            .order('sort_order'),
          supabase
            .from('app_users')
            .select('campus_id')
            .eq('auth_user_id', user.id)
            .maybeSingle()
        ]);

        const fetchedCampuses = campusesResult.data || [];
        setCampuses(fetchedCampuses);

        const primaryCampusId = userResult.data?.campus_id || null;
        setUserCampusId(primaryCampusId);

        // Determine initial selectedCampusId
        const isAdminRole = ADMIN_ROLES.includes(userRole);

        if (primaryCampusId && !isAdminRole) {
          // Non-admin with assigned campus → locked
          setSelectedCampusIdState(primaryCampusId);
        } else {
          // Admin or no campus assigned → restore from localStorage
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = parseInt(stored, 10);
            // Verify the stored campus still exists
            if (fetchedCampuses.some(c => c.id === parsed)) {
              setSelectedCampusIdState(parsed);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching campus data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userRole]);

  // Setter that respects campus lock
  const setSelectedCampusId = useCallback((id) => {
    if (!canSwitchCampus) return; // Locked user can't switch
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
