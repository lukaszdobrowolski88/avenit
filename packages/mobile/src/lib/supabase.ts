import { createSupabaseClient, createCachedUserHelper } from '@schtomy/shared';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// SecureStore adapter dla Supabase Auth
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  storage: secureStoreAdapter,
  detectSessionInUrl: false, // Nie wykrywaj sesji z URL w React Native
});

const userHelper = createCachedUserHelper(supabase);
export const getCachedUser = userHelper.getCachedUser;
export const clearUserCache = userHelper.clearUserCache;
