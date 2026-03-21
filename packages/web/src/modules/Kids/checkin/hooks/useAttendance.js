import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';

export function useAttendance(sessionId) {
  const [checkins, setCheckins] = useState([]);
  const [locationStats, setLocationStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all checkins for session
  const fetchCheckins = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { data, error: queryError } = await supabase
        .from('checkins')
        .select(`
          *,
          kids_students (*),
          checkin_locations (*),
          households (*)
        `)
        .eq('session_id', sessionId)
        .order('checked_in_at', { ascending: false });

      if (queryError) throw queryError;
      setCheckins(data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [sessionId]);

  // Calculate location statistics
  const calculateLocationStats = useCallback((checkinsData, locations) => {
    const stats = locations.map(location => {
      const locationCheckins = checkinsData.filter(
        c => c.location_id === location.id && !c.checked_out_at
      );

      return {
        ...location,
        currentCount: locationCheckins.length,
        capacity: location.capacity || null,
        fillPercentage: location.capacity
          ? Math.round((locationCheckins.length / location.capacity) * 100)
          : null,
        children: locationCheckins.map(c => ({
          id: c.id,
          name: c.is_guest ? c.guest_name : c.kids_students?.full_name,
          isGuest: c.is_guest,
          securityCode: c.security_code,
          checkedInAt: c.checked_in_at
        }))
      };
    });

    setLocationStats(stats);
  }, []);

  // Fetch locations and calculate stats
  const fetchLocationsAndStats = useCallback(async (checkinsData) => {
    try {
      const { data: locations, error: locError } = await supabase
        .from('checkin_locations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (locError) throw locError;
      calculateLocationStats(checkinsData, locations || []);
    } catch (err) {
      setError(err.message);
    }
  }, [calculateLocationStats]);

  // Initial fetch
  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      await fetchCheckins();
      setLoading(false);
    };

    init();
  }, [sessionId, fetchCheckins]);

  // Update location stats when checkins change
  useEffect(() => {
    if (checkins.length > 0 || !loading) {
      fetchLocationsAndStats(checkins);
    }
  }, [checkins, loading, fetchLocationsAndStats]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`checkins-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checkins',
          filter: `session_id=eq.${sessionId}`
        },
        async (payload) => {
          console.log('Realtime update:', payload.eventType, payload);

          if (payload.eventType === 'INSERT') {
            // Fetch full record with joins
            const { data: newCheckin } = await supabase
              .from('checkins')
              .select(`
                *,
                kids_students (*),
                checkin_locations (*),
                households (*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (newCheckin) {
              setCheckins(prev => [newCheckin, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            // Fetch updated record with joins
            const { data: updatedCheckin } = await supabase
              .from('checkins')
              .select(`
                *,
                kids_students (*),
                checkin_locations (*),
                households (*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (updatedCheckin) {
              setCheckins(prev =>
                prev.map(c => (c.id === updatedCheckin.id ? updatedCheckin : c))
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setCheckins(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Get only active checkins (not checked out)
  const activeCheckins = checkins.filter(c => !c.checked_out_at);

  // Get checked out checkins
  const checkedOutCheckins = checkins.filter(c => c.checked_out_at);

  // Refresh function
  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchCheckins();
    setLoading(false);
  }, [fetchCheckins]);

  return {
    checkins,
    activeCheckins,
    checkedOutCheckins,
    locationStats,
    loading,
    error,
    refresh
  };
}
