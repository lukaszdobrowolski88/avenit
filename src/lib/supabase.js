// Klient danych aplikacji — Avenit API (własny backend), interfejs zgodny
// z supabase-js, więc moduły używają go bez zmian.
// Web działa na subdomenie tenanta (schwro.avenit.pl) — API jest same-origin,
// tenant rozpoznawany po Host. W dev: VITE_API_URL + VITE_TENANT.
import { createApiClient } from '@avenit/shared';

const apiUrl = import.meta.env.VITE_API_URL || '';
const tenant = import.meta.env.VITE_TENANT || null;

export const supabase = createApiClient({
  apiUrl,
  tenant,
  storage: typeof localStorage !== 'undefined' ? localStorage : null,
  realtime: false, // web: realtime wyłączony (jak dotąd) — channel() to no-op
});

// Cache dla użytkownika - unikamy wielokrotnych wywołań getUser()
let cachedUser = null;
let userFetchPromise = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 sekund

export async function getCachedUser() {
  const now = Date.now();

  // Jeśli mamy świeży cache, zwróć go od razu
  if (cachedUser && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedUser;
  }

  // Jeśli już pobieramy, dołącz do istniejącego promise
  if (userFetchPromise) {
    return userFetchPromise;
  }

  // Pobierz użytkownika z timeout
  userFetchPromise = Promise.race([
    supabase.auth.getUser().then(({ data }) => data?.user || null),
    new Promise(resolve => setTimeout(() => resolve(cachedUser), 3000)) // 3s timeout
  ]).then(user => {
    cachedUser = user;
    lastFetchTime = Date.now();
    userFetchPromise = null;
    return user;
  }).catch(() => {
    userFetchPromise = null;
    return cachedUser;
  });

  return userFetchPromise;
}

// Wyczyść cache (np. po wylogowaniu)
export function clearUserCache() {
  cachedUser = null;
  lastFetchTime = 0;
  userFetchPromise = null;
}
