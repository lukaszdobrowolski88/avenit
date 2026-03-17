import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://TWOJ-PROJEKT.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'TWOJ-KLUCZ';

export const supabase = createClient(supabaseUrl, supabaseKey);

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
