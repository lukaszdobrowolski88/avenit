// Moduł lokalny (Android): usługa pierwszoplanowa „Słuchasz tłumaczenia” — dźwięk tłumaczenia na żywo
// gra przy wygaszonym ekranie i z apką w tle. Kod natywny: android/src/main/java/pl/avenit/
// interpretationplayback (autolinking Expo z katalogu packages/mobile/modules).
//
// Moduł jest OPCJONALNY: buildy 1.1.0 (ten sam runtime OTA) go nie mają, iOS też nie —
// wtedy playbackModule() zwraca null, a słuchacz wraca do „nie wyłączaj ekranu” (expo-keep-awake).
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type PlaybackStopReason = 'notification' | 'task_removed';

export interface PlaybackSubscription {
  remove(): void;
}

export interface InterpretationPlaybackModule {
  // true = usługa uruchomiona (albo już działała — wtedy tylko nowy tekst powiadomienia).
  start(title: string, text: string): boolean;
  stop(): void;
  isRunning(): boolean;
  addListener(event: 'onStopRequested', listener: (e: { reason: PlaybackStopReason }) => void): PlaybackSubscription;
  addListener(event: 'onFailed', listener: (e: { reason: string }) => void): PlaybackSubscription;
  addListener(event: 'onTick', listener: (e: { uptime: number }) => void): PlaybackSubscription;
}

let mod: InterpretationPlaybackModule | null | undefined;

export function playbackModule(): InterpretationPlaybackModule | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    mod = requireOptionalNativeModule<InterpretationPlaybackModule>('AvenitInterpretationPlayback');
  } catch {
    mod = null;
  }
  return mod;
}
