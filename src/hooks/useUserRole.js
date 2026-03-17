import { useState, useEffect } from 'react';
import { supabase, getCachedUser } from '../lib/supabase';

// Globalny cache - współdzielony między wszystkimi instancjami hooka
// Inicjalizuj z localStorage od razu
const cachedRole = localStorage.getItem('userRole');
let globalUserRole = cachedRole || null;
let globalLoading = !cachedRole; // Jeśli mamy cache, nie ładujemy
let fetchPromise = null;
const listeners = new Set();

// Funkcja do powiadomienia wszystkich listenerów
const notifyListeners = () => {
  listeners.forEach(listener => listener({ userRole: globalUserRole, loading: globalLoading }));
};

// Funkcja do pobrania roli (wywoływana tylko raz)
const fetchRole = async () => {
  // Jeśli już pobieramy, zwróć istniejący promise
  if (fetchPromise) return fetchPromise;

  // Sprawdź cache od razu
  const cachedRole = localStorage.getItem('userRole');
  if (cachedRole) {
    globalUserRole = cachedRole;
    globalLoading = false;
    notifyListeners();
  }

  // Timeout - jeśli pobieranie trwa zbyt długo, użyj domyślnej roli
  const timeoutId = setTimeout(() => {
    if (globalLoading) {
      console.warn('useUserRole timeout - using default role');
      globalUserRole = cachedRole || 'czlonek';
      globalLoading = false;
      notifyListeners();
    }
  }, 5000);

  fetchPromise = (async () => {
    try {
      const user = await getCachedUser();
      if (!user) {
        globalUserRole = null;
        globalLoading = false;
        clearTimeout(timeoutId);
        notifyListeners();
        return;
      }

      const { data: profile, error } = await supabase
        .from('app_users')
        .select('role')
        .eq('email', user.email)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        if (!cachedRole) {
          globalUserRole = 'czlonek';
          localStorage.setItem('userRole', 'czlonek');
        }
      } else {
        const role = profile?.role || 'czlonek';
        globalUserRole = role;
        localStorage.setItem('userRole', role);
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
      if (!globalUserRole) {
        globalUserRole = localStorage.getItem('userRole') || 'czlonek';
      }
    } finally {
      clearTimeout(timeoutId);
      globalLoading = false;
      notifyListeners();
    }
  })();

  return fetchPromise;
};

export function useUserRole() {
  const [state, setState] = useState({
    userRole: globalUserRole,
    loading: globalLoading
  });

  useEffect(() => {
    // Dodaj listener
    const listener = (newState) => setState(newState);
    listeners.add(listener);

    // Jeśli mamy już dane, użyj ich od razu
    if (globalUserRole !== null && !globalLoading) {
      setState({ userRole: globalUserRole, loading: false });
    } else {
      // Rozpocznij pobieranie (lub dołącz do istniejącego)
      fetchRole();
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return state;
}

// Funkcja do resetu cache (np. po wylogowaniu)
export function resetUserRoleCache() {
  globalUserRole = null;
  globalLoading = true;
  fetchPromise = null;
  localStorage.removeItem('userRole');
  notifyListeners();
}
