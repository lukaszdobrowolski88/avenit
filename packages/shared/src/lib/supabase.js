// Fabryka klienta danych — od migracji na własny backend (Avenit API) tworzy
// klienta zgodnego interfejsem z supabase-js, ale gadającego z /api/*.
// Nazwy createSupabaseClient/createCachedUserHelper zostają dla zgodności
// z istniejącymi importami w web i mobile.
import { createApiClient } from './apiClient.js';

export const CACHE_DURATION = 30000; // 30 sekund

/**
 * Tworzy klienta Avenit API.
 * @param {string} apiUrl  Bazowy URL API ('' = same-origin, subdomena tenanta)
 * @param {object} options { tenant, storage, realtime }
 *   - tenant:   slug tenanta (wymagany, gdy apiUrl nie jest subdomeną tenanta — np. mobile)
 *   - storage:  { getItem, setItem, removeItem } (localStorage / SecureStore adapter)
 *   - realtime: true włącza WebSocket (mobile); false = no-op channel (web)
 */
export function createSupabaseClient(apiUrl, options = {}) {
  return createApiClient({
    apiUrl,
    tenant: options.tenant,
    storage: options.storage,
    realtime: options.realtime ?? false,
  });
}

export { createApiClient };

/**
 * Helper getCachedUser() z cache'owaniem — bez zmian względem wersji supabase.
 */
export function createCachedUserHelper(client) {
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
      client.auth.getUser().then(({ data }) => data?.user || null),
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
