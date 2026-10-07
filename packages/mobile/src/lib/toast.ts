import { AccessibilityInfo } from 'react-native';
import Toast from 'react-native-toast-message';
import { tr } from '../i18n';
import { friendlyError } from './errors';

// Krótka informacja zwrotna (jak toast na webie): „Zapisano”, „Wysłano”, „Usunięto…”.
// Wyświetla ją <ToastHost/> z app/_layout.tsx (styl marki: ciemna pigułka u góry ekranu).
//
//   import { toast } from '../lib/toast';
//   toast.success('Zapisano zmiany');
//   toast.info('Na ten przydział odpowiedziano już wcześniej.');
//   toast.error(e, 'Nie udało się zapisać');   // błąd → ludzki tekst (friendlyError)
//
// UWAGA: toast rysuje się pod natywnym Modalem/arkuszem (iOS). Błąd w otwartym oknie pokazuj
// przez `showError` (Alert jest zawsze na wierzchu); toast — po zamknięciu okna albo na ekranie.

const show = (type: 'success' | 'error' | 'info', text: string, sub?: string) => {
  Toast.show({
    type,
    text1: text,
    text2: sub,
    position: 'top',
    visibilityTime: type === 'error' ? 5000 : 2600,
  });
  // Czytnik ekranu: toast nie dostaje fokusu, więc ogłaszamy treść.
  AccessibilityInfo.announceForAccessibility([text, sub].filter(Boolean).join('. '));
};

export const toast = {
  success: (text: string, sub?: string) => show('success', tr(text), sub ? tr(sub) : undefined),
  info: (text: string, sub?: string) => show('info', tr(text), sub ? tr(sub) : undefined),
  // Błąd jako toast (gdy nie ma otwartego okna): tytuł + ludzki opis błędu.
  error: (err: unknown, title = 'Nie udało się') => {
    if (__DEV__ && err != null && typeof err === 'object') console.warn('[toast.error]', err);
    show('error', tr(title), friendlyError(err));
  },
};
