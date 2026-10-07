import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

// Odblokowanie biometrią zapamiętane PER KONTO (e-mail), a nie „na telefon”:
// - do 2026-10 ekran po logowaniu pytał ZAWSZE (nie sprawdzał, czy już włączone), a wylogowanie
//   kasowało wybór — więc pytanie wracało przy każdym logowaniu;
// - teraz: włączone/„Nie teraz” dla danego konta = nie pytamy ponownie (zmiana w Koncie),
//   inne konto na tym samym telefonie jest pytane osobno.
const BIOMETRIC_KEY = 'avenit.biometric.enabled'; // e-mail konta (dawniej '1')
const ASKED_KEY = 'avenit.biometric.asked';       // e-mail konta, które odpowiedziało „Nie teraz”

const currentEmail = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.getSession();
    const email = (data.session as { user?: { email?: string | null } } | null)?.user?.email;
    return email ? email.toLowerCase() : null;
  } catch {
    return null;
  }
};

const readKey = async (key: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  available: boolean;
  types: LocalAuthentication.AuthenticationType[];
}

export const getBiometricCapability = async (): Promise<BiometricCapability> => {
  const [hasHardware, isEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  return { hasHardware, isEnrolled, types, available: hasHardware && isEnrolled };
};

export const isBiometricEnabled = async (): Promise<boolean> => {
  const stored = await readKey(BIOMETRIC_KEY);
  if (!stored) return false;
  if (stored === '1') return true; // zapis sprzed 2026-10 (bez konta) — nadal włączone
  const email = await currentEmail();
  return !!email && stored === email;
};

export const setBiometricEnabled = async (enabled: boolean): Promise<void> => {
  if (enabled) {
    const email = await currentEmail();
    await SecureStore.setItemAsync(BIOMETRIC_KEY, email ?? '1');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY).catch(() => undefined);
  }
};

// Czy to konto już odpowiedziało na pytanie po logowaniu (włączyło albo „Nie teraz”).
export const wasBiometricAsked = async (): Promise<boolean> => {
  if (await isBiometricEnabled()) return true;
  const email = await currentEmail();
  return !!email && (await readKey(ASKED_KEY)) === email;
};

export const markBiometricAsked = async (): Promise<void> => {
  const email = await currentEmail();
  if (email) await SecureStore.setItemAsync(ASKED_KEY, email).catch(() => undefined);
};

export const authenticateWithBiometric = async (
  reason: string = 'Odblokuj Avenit',
): Promise<boolean> => {
  const cap = await getBiometricCapability();
  if (!cap.available) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: 'Wpisz kod urządzenia',
    cancelLabel: 'Anuluj',
    disableDeviceFallback: false,
  });
  return result.success;
};
