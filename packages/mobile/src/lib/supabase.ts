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
