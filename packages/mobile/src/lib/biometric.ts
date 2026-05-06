import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_KEY = 'schtomy.biometric.enabled';

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
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === '1';
  } catch {
    return false;
  }
};

export const setBiometricEnabled = async (enabled: boolean): Promise<void> => {
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_KEY, '1');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY).catch(() => undefined);
  }
};

export const authenticateWithBiometric = async (
  reason: string = 'Odblokuj SCH TOMY',
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
