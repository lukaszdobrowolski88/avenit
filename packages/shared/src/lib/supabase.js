import { createClient } from '@supabase/supabase-js';

export const CACHE_DURATION = 30000; // 30 sekund

/**
 * Factory do tworzenia klienta Supabase z platform-specific storage
 * Web: { storage: localStorage }
 * Mobile: { storage: SecureStore adapter }
 */
export function createSupabaseClient(url, key, options = {}) {
  return createClient(url, key, {
    auth: {
      storage: options.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: options.detectSessionInUrl ?? true,
      ...options.auth,
    },
    ...options.clientOptions,
  });
}

/**
 * Tworzy helper getCachedUser() z cache'owaniem
 * Platform-agnostic - nie zależy od localStorage/SecureStore
 */
export function createCachedUserHelper(supabaseClient) {
  let cachedUser = null;
  let userFetchPromise = null;
  let lastFetchTime = 0;

  async function getCachedUser() {
    const now = Date.now();

    if (cachedUser && (now - lastFetchTime) < CACHE_DURATION) {
      return cachedUser;
    }

    if (userFetchPromise) {
      return userFetchPromise;
    }

    userFetchPromise = Promise.race([
      supabaseClient.auth.getUser().then(({ data }) => data?.user || null),
      new Promise(resolve => setTimeout(() => resolve(cachedUser), 3000))
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

  function clearUserCache() {
    cachedUser = null;
    lastFetchTime = 0;
    userFetchPromise = null;
  }

  return { getCachedUser, clearUserCache };
}
