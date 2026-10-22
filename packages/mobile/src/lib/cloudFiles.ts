import { Alert, Linking } from 'react-native';
import {
  cloudOpenUrl,
  cloudProviderLabel,
  cloudOpenLabel,
  isCloudAttachment,
  isCloudProvider,
} from '@avenit/shared/src/lib/cloudFiles.js';

// Pliki z Dysku Google / OneDrive / SharePoint (Faza 3 integracji) — w apce TYLKO wyświetlanie:
// odnośnik otwierany w przeglądarce systemowej albo (link uniwersalny) w aplikacji Dysk / OneDrive.
// Adres przechodzi przez białą listę hostów (wspólny moduł z serwerem i webem) — inaczej nie otwieramy.
// Wybór plików z chmury w apce — w kolejnej fazie (web: „Z Dysku Google lub OneDrive”).

export { isCloudAttachment, cloudProviderLabel, cloudOpenLabel };

/** Wiersz materials_files albo załącznik wiadomości z odnośnikiem do chmury. */
export const isCloudItem = (x: unknown): boolean => {
  if (!x || typeof x !== 'object') return false;
  const o = x as { external_provider?: unknown };
  return isCloudAttachment(x) || isCloudProvider(o.external_provider);
};

/** Dostawca odnośnika (google_drive / onedrive / sharepoint) albo null. */
export const cloudProviderOf = (x: unknown): string | null => {
  if (!x || typeof x !== 'object') return null;
  const o = x as { provider?: unknown; external_provider?: unknown };
  const p = isCloudProvider(o.external_provider) ? o.external_provider : isCloudProvider(o.provider) ? o.provider : null;
  return (p as string | null) ?? null;
};

/** Otwiera plik u dostawcy (tylko adres z białej listy). */
export async function openCloudItem(x: unknown): Promise<void> {
  const url = cloudOpenUrl(x);
  if (!url) {
    Alert.alert('Nie udało się otworzyć pliku', 'Nieprawidłowy adres pliku w chmurze.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Nie udało się otworzyć pliku', 'Spróbuj otworzyć go na webie.');
  }
}
