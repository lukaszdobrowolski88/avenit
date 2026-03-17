import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Cache statusów - współdzielony między komponentami
const presenceCache = new Map();
const listeners = new Set();

// Powiadom wszystkich listenerów o zmianach
const notifyListeners = () => {
  listeners.forEach(listener => listener(new Map(presenceCache)));
};

// Hook do zarządzania własnym statusem
export function useMyPresence(userEmail) {
  const heartbeatRef = useRef(null);
  const visibilityRef = useRef(true);

  // Aktualizuj status w bazie
  const updatePresence = useCallback(async (status) => {
    // WAŻNE: Nie rób nic jeśli nie ma userEmail (użytkownik niezalogowany)
    if (!userEmail) return;

    try {
      // Sprawdź czy użytkownik jest zalogowany
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('user_presence')
        .upsert({
          user_email: userEmail,
          status,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_email'
        });

      if (error) throw error;

      // Aktualizuj lokalny cache
      presenceCache.set(userEmail, { status, last_seen: new Date().toISOString() });
      notifyListeners();
    } catch (err) {
      // Ignoruj błędy 401 (niezalogowany użytkownik)
      if (err?.code !== '42501' && err?.message !== 'JWT expired') {
        console.error('Error updating presence:', err);
      }
    }
  }, [userEmail]);

  // Ustaw status online
  const setOnline = useCallback(() => updatePresence('online'), [updatePresence]);

  // Ustaw status away
  const setAway = useCallback(() => updatePresence('away'), [updatePresence]);

  // Ustaw status offline
  const setOffline = useCallback(() => updatePresence('offline'), [updatePresence]);

  // Heartbeat - aktualizuj last_seen co 30 sekund
  useEffect(() => {
    if (!userEmail) return;

    // Ustaw jako online przy starcie
    setOnline();

    // Heartbeat
    heartbeatRef.current = setInterval(() => {
      if (visibilityRef.current) {
        setOnline();
      }
    }, 30000); // Co 30 sekund

    // Obsługa widoczności strony
    const handleVisibilityChange = () => {
      visibilityRef.current = !document.hidden;
      if (document.hidden) {
        setAway();
      } else {
        setOnline();
      }
    };

    // Obsługa zamknięcia strony
    const handleBeforeUnload = async () => {
      // Użyj fetch z keepalive zamiast sendBeacon - pozwala na nagłówki auth
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_email=eq.${encodeURIComponent(userEmail)}`,
            {
              method: 'PATCH',
              keepalive: true,
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({ status: 'offline', last_seen: new Date().toISOString() })
            }
          );
        }
      } catch (e) {
        // Ignoruj błędy przy zamykaniu strony
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setOffline();
    };
  }, [userEmail, setOnline, setAway, setOffline]);

  return { setOnline, setAway, setOffline };
}

// Hook do śledzenia statusu innych użytkowników
export function usePresence(userEmails = []) {
  const [presenceMap, setPresenceMap] = useState(() => new Map(presenceCache));

  // Pobierz statusy z bazy
  const fetchPresence = useCallback(async () => {
    if (!userEmails || userEmails.length === 0) return;

    try {
      // Sprawdź czy użytkownik jest zalogowany
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('user_presence')
        .select('user_email, status, last_seen')
        .in('user_email', userEmails);

      if (error) throw error;

      // Aktualizuj cache
      (data || []).forEach(p => {
        presenceCache.set(p.user_email, { status: p.status, last_seen: p.last_seen });
      });

      // Dodaj offline dla użytkowników bez statusu
      userEmails.forEach(email => {
        if (!presenceCache.has(email)) {
          presenceCache.set(email, { status: 'offline', last_seen: null });
        }
      });

      notifyListeners();
    } catch (err) {
      // Ignoruj błędy autoryzacji
      if (err?.code !== '42501') {
        console.error('Error fetching presence:', err);
      }
    }
  }, [userEmails.join(',')]);

  // Subskrypcja na zmiany
  useEffect(() => {
    if (!userEmails || userEmails.length === 0) return;

    let subscription = null;

    const setupSubscription = async () => {
      // Sprawdź czy użytkownik jest zalogowany
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Pobierz początkowe dane
      fetchPresence();

      // Dodaj listener
      const listener = (newMap) => setPresenceMap(newMap);
      listeners.add(listener);

      // Subskrypcja real-time
      subscription = supabase
        .channel('presence-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'user_presence'
        }, (payload) => {
          const { new: newRecord } = payload;
          if (newRecord && userEmails.includes(newRecord.user_email)) {
            presenceCache.set(newRecord.user_email, {
              status: newRecord.status,
              last_seen: newRecord.last_seen
            });
            notifyListeners();
          }
        })
        .subscribe();
    };

    setupSubscription();

    return () => {
      listeners.forEach(l => listeners.delete(l));
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [userEmails.join(','), fetchPresence]);

  // Pobierz status konkretnego użytkownika
  // Jeśli last_seen jest starsze niż 2 minuty, traktuj jako offline
  const getStatus = useCallback((email) => {
    const presence = presenceMap.get(email);
    if (!presence) return 'offline';

    // Sprawdź czy last_seen nie jest zbyt stary
    if (presence.last_seen) {
      const lastSeenTime = new Date(presence.last_seen).getTime();
      const now = Date.now();
      const timeDiff = now - lastSeenTime;

      // Jeśli ostatnia aktywność była ponad 2 minuty temu, użytkownik jest offline
      // (heartbeat wysyłany jest co 30 sekund, więc 2 minuty = brak 4 heartbeatów)
      if (timeDiff > 120000) {
        return 'offline';
      }

      // Jeśli ostatnia aktywność była ponad 45 sekund temu, ale mniej niż 2 minuty,
      // i status był "online", oznacz jako away
      if (timeDiff > 45000 && presence.status === 'online') {
        return 'away';
      }
    } else {
      // Brak last_seen = offline
      return 'offline';
    }

    return presence.status || 'offline';
  }, [presenceMap]);

  // Pobierz last_seen konkretnego użytkownika
  const getLastSeen = useCallback((email) => {
    return presenceMap.get(email)?.last_seen;
  }, [presenceMap]);

  return { presenceMap, getStatus, getLastSeen, refetch: fetchPresence };
}

// Kolory statusów
export const statusColors = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  offline: 'bg-gray-400'
};

// Etykiety statusów
export const statusLabels = {
  online: 'Online',
  away: 'Zaraz wracam',
  offline: 'Offline'
};
