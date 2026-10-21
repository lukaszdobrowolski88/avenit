// Czysta logika trybu dźwięku (bez React Native — test: src/lib/mobileAudioMode.test.js w webie).
// Kształt jak AudioMode z expo-audio (setAudioModeAsync).

export type AudioUse = 'ui' | 'playback' | 'record';

export interface ResolvedAudioMode {
  playsInSilentMode: boolean;
  allowsRecording: boolean;
  interruptionMode: 'mixWithOthers' | 'doNotMix' | 'duckOthers';
  shouldPlayInBackground: boolean;
}

/**
 * Tryb dla zbioru aktywnych użyć: nagrywanie > głos > UI.
 *  • UI (brak blokad): ambient — iPhone z przełącznikiem wyciszenia milczy, muzyka innej apki gra dalej.
 *  • głos (głosówka, kazanie): playback — słychać także przy wyciszniku (świadome „odtwórz”).
 *  • nagrywanie: playAndRecord.
 * expo-audio (iOS) odrzuca playsInSilentMode=false razem z allowsRecording/duckOthers/tłem.
 */
export function resolveAudioMode(uses: readonly AudioUse[]): ResolvedAudioMode {
  if (uses.includes('record')) {
    return { playsInSilentMode: true, allowsRecording: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false };
  }
  if (uses.includes('playback')) {
    return { playsInSilentMode: true, allowsRecording: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false };
  }
  return { playsInSilentMode: false, allowsRecording: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false };
}
