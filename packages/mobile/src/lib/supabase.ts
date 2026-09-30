import { createSupabaseClient, createCachedUserHelper } from '@avenit/shared';
import * as SecureStore from 'expo-secure-store';

// Avenit API (własny backend) — mobile łączy się z api.<domena> i wskazuje
// tenanta nagłówkiem X-Tenant (slug kościoła).
const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const TENANT = process.env.EXPO_PUBLIC_TENANT || '';

// SecureStore adapter dla sesji auth
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createSupabaseClient(API_URL, {
  tenant: TENANT,
  storage: secureStoreAdapter,
  realtime: true, // mobile używa realtime (messenger, presence)
});

const userHelper = createCachedUserHelper(supabase);
export const getCachedUser = userHelper.getCachedUser;
export const clearUserCache = userHelper.clearUserCache;

/**
 * Bazowy URL webowy tenanta, np. `https://schwro.avenit.pl` — zbudowany z API_URL
 * przez zamianę subdomeny `api.` na slug tenanta. Tenant bierzemy z klienta
 * (`getTenant()`, utrwalony w SecureStore po logowaniu), NIE z `EXPO_PUBLIC_TENANT`,
 * który w buildzie uniwersalnym jest pusty. Używane tam, gdzie potrzebujemy trafić
 * na subdomenę tenanta (pliki storage, strony prawne, powroty z płatności) — bo
 * backend rozwiązuje tenant z subdomeny/nagłówka, a apex `api.` go nie niesie.
 * Zwraca '' gdy nie znamy API_URL.
 */
export function tenantWebBase(): string {
  const api = API_URL.replace(/\/$/, '');
  if (!api) return '';
  const tenant = supabase.getTenant() || TENANT || '';
  return tenant ? api.replace('://api.', `://${tenant}.`) : api.replace('://api.', '://');
}
