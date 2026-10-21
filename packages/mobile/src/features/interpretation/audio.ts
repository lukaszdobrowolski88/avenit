// Dźwięk słuchacza tłumaczenia (bez CallKit): sesja audio „odtwarzanie” zamiast „rozmowa”.
//
// iOS: rozmowy (engine.ts) mają sesję audio CallKitu — LiveKit działa tam bez automatycznej
// konfiguracji (registerGlobals({ autoConfigureAudioSession: false }) w modules.ts). Słuchając
// tłumaczenia sami ustawiamy kategorię playback / spokenAudio (głos w mediach, dźwięk także przy
// wyciszniku i przy zablokowanym ekranie — UIBackgroundModes: audio) i włączamy sesję
// (startAudioSession), a po zakończeniu ją wyłączamy i wracamy do kategorii domyślnej
// (soloAmbient). Gdy w tym czasie zaczęła się rozmowa i CallKit przejął sesję — NIE wyłączamy
// (zgasilibyśmy dźwięk rozmowy); bilans wyrównujemy przy następnym słuchaniu.
// Android: typ audio „media” (strumień muzyki, tryb normal, fokus audio) na czas słuchania, potem
// z powrotem „communication” — atrybuty wyjścia WebRTC są wspólne z rozmowami.
// Ekran: expo-keep-awake (moduł z pakietu expo), ładowany leniwie — brak modułu = bez błędu.
import { NativeModules, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { callkit, loadLiveKit } from '../calls/native/modules';

type LiveKitRN = typeof import('@livekit/react-native');
type LiveKitClient = typeof import('livekit-client');

// Czy ten build umie słuchać w aplikacji (WebRTC + moduł LiveKit). Inaczej — strona w przeglądarce.
export function nativeListeningAvailable(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  const nm = NativeModules as Record<string, unknown>;
  return !!nm.WebRTCModule && !!nm.LivekitReactNativeModule;
}

export function loadListenerLiveKit(): { rn: LiveKitRN; client: LiveKitClient } {
  return loadLiveKit();
}

// CallKit / Telecom trzyma teraz sesję audio (trwa rozmowa).
export function callOwnsAudio(): boolean {
  try {
    const s = callkit()?.getAudioSession?.() as { isActive?: boolean } | undefined;
    return !!s?.isActive;
  } catch {
    return false;
  }
}

let held = false; // nasza aktywacja sesji (LiveKit liczy aktywacje — trzeba je bilansować)

export async function beginListeningAudio(): Promise<void> {
  const { rn } = loadLiveKit();
  const AS = rn.AudioSession;
  if (Platform.OS === 'ios') {
    // Zaległa aktywacja (poprzednie słuchanie przerwała rozmowa) — najpierw wyrównaj licznik.
    if (held && !callOwnsAudio()) {
      await AS.stopAudioSession().catch(() => undefined);
      held = false;
    }
    await AS.setAppleAudioConfiguration({
      audioCategory: 'playback',
      audioCategoryOptions: ['mixWithOthers'],
      audioMode: 'spokenAudio',
    }).catch((e: unknown) => {
      if (__DEV__) console.warn('[interp] setAppleAudioConfiguration:', (e as Error)?.message);
    });
    if (!held) {
      await AS.startAudioSession();
      held = true;
    }
    return;
  }
  await AS.configureAudio({ android: { audioTypeOptions: rn.AndroidAudioTypePresets.media } }).catch(() => undefined);
  await AS.startAudioSession();
  held = true;
}

// takenByCall — przerwała nas rozmowa: na iOS nie ruszamy sesji, jeśli CallKit już ją przejął.
export async function endListeningAudio({ takenByCall = false }: { takenByCall?: boolean } = {}): Promise<void> {
  let rn: LiveKitRN;
  try {
    rn = loadLiveKit().rn;
  } catch {
    return;
  }
  const AS = rn.AudioSession;
  if (Platform.OS === 'ios') {
    if (!held) return;
    if (takenByCall && callOwnsAudio()) return; // zostaje „held” — wyrównamy przy następnym słuchaniu
    await AS.stopAudioSession().catch(() => undefined);
    held = false;
    // Rozmowa sama ustawia swoją kategorię (CallKit); tu tylko wracamy do domyślnej apki.
    if (!callOwnsAudio()) {
      await AS.setAppleAudioConfiguration({ audioCategory: 'soloAmbient', audioCategoryOptions: [], audioMode: 'default' }).catch(() => undefined);
    }
    return;
  }
  if (held) await AS.stopAudioSession().catch(() => undefined);
  held = false;
  await AS.configureAudio({ android: { audioTypeOptions: rn.AndroidAudioTypePresets.communication } }).catch(() => undefined);
}

// ── Ekran nie gaśnie ───────────────────────────────────────────────────────
const KEEP_AWAKE_TAG = 'avenit-interpretation';
type KeepAwake = typeof import('expo-keep-awake');
let ka: KeepAwake | null | undefined;
function keepAwakeModule(): KeepAwake | null {
  if (ka !== undefined) return ka;
  ka = null;
  try {
    if (!requireOptionalNativeModule('ExpoKeepAwake')) return ka;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ka = require('expo-keep-awake') as KeepAwake;
  } catch {
    ka = null;
  }
  return ka;
}

let awake = false;
export function setKeepAwake(on: boolean) {
  if (on === awake) return;
  const m = keepAwakeModule();
  if (!m) return;
  awake = on;
  if (on) m.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
  else m.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
}
