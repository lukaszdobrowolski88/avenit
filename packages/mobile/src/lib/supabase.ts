import { createSupabaseClient, createCachedUserHelper } from '@avenit/shared';
import * as SecureStore from 'expo-secure-store';

// Avenit API (własny backend) — mobile łączy się z api.<domena> i wskazuje
// tenanta nagłówkiem X-Tenant (slug kościoła).
const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const TENANT = process.env.EXPO_PUBLIC_TENANT || '';

// SecureStore adapter dla sesji auth.
// Dostępność w pęku kluczy: AFTER_FIRST_UNLOCK (zamiast domyślnego WHEN_UNLOCKED). Przychodzące
// połączenie (push VoIP) budzi apkę także przy ZABLOKOWANYM telefonie — przy WHEN_UNLOCKED odczyt
// sesji kończy się błędem, apka „nie ma” zalogowanego użytkownika i odebranie z ekranu blokady
// nie może dołączyć do rozmowy. Aktualizacja istniejącego wpisu nie zmienia jego dostępności, więc
// sesja żyje pod NOWĄ nazwą klucza (`<klucz>.v2`, zawsze AFTER_FIRST_UNLOCK); stary wpis to tylko
// zapas do odczytu — przepisujemy go do nowego i kasujemy dopiero po udanym zapisie. Nigdy nie ma
// chwili bez sesji (wcześniejsze wylogowania brały się właśnie z „pustego” odczytu).
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const v2 = (key: string) => `${key}.v2`;
// Licznik zapisów per klucz: przepisanie starego wpisu nie może nadpisać świeższego zapisu
// (np. odświeżonego tokenu) — stary refresh token po rotacji = wylogowanie.
const writes = new Map<string, number>();
const bump = (key: string) => writes.set(key, (writes.get(key) ?? 0) + 1);
const secureStoreAdapter = {
  getItem: async (key: string) => {
    const fresh = await SecureStore.getItemAsync(v2(key), KEYCHAIN).catch(() => null);
    if (fresh != null) return fresh;
    const at = writes.get(key) ?? 0;
    const legacy = await SecureStore.getItemAsync(key);
    // Przepisanie PRZED zwróceniem wartości (sesja nie zdąży się w tym czasie odświeżyć);
    // stary wpis kasujemy dopiero po udanym zapisie nowego.
    if (legacy != null && (writes.get(key) ?? 0) === at) {
      try {
        await SecureStore.setItemAsync(v2(key), legacy, KEYCHAIN);
        SecureStore.deleteItemAsync(key).catch(() => undefined);
      } catch {
        // zostaje stary wpis — odczyt dalej działa po odblokowaniu
      }
    }
    return legacy;
  },
  setItem: async (key: string, value: string) => {
    bump(key);
    await SecureStore.setItemAsync(v2(key), value, KEYCHAIN);
    SecureStore.deleteItemAsync(key).catch(() => undefined);
  },
  removeItem: async (key: string) => {
    bump(key);
    await Promise.all([
      SecureStore.deleteItemAsync(v2(key), KEYCHAIN).catch(() => undefined),
      SecureStore.deleteItemAsync(key).catch(() => undefined),
    ]);
  },
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
