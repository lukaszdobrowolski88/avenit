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
// Ekran / tło: Android z modułem AvenitInterpretationPlayback (build 1.2.0+) — usługa
// pierwszoplanowa „Słuchasz tłumaczenia” (dźwięk gra przy wygaszonym ekranie) + timery odporne na
// uśpienie JS (bgTimers.ts); bez modułu (1.1.0, ten sam runtime OTA) i na iOS — expo-keep-awake
// (moduł z pakietu expo), ładowany leniwie — brak modułu = bez błędu.
import { NativeModules, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { callOwnsAudioSession, loadLiveKit } from '../calls/native/modules';
import { setExternalAudioOwner } from '../../lib/audioMode';
import { playbackModule, type PlaybackStopReason } from '../../../modules/interpretation-playback';
import { createHybridTimers, type HybridTimers } from './bgTimers';

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
  return callOwnsAudioSession();
}

let held = false; // nasza aktywacja sesji (LiveKit liczy aktywacje — trzeba je bilansować)

export async function beginListeningAudio(): Promise<void> {
  const { rn } = loadLiveKit();
  // Dźwięki UI i odtwarzacze expo-audio nie przestawiają w tym czasie sesji (src/lib/audioMode.ts).
  setExternalAudioOwner(true);
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
  setExternalAudioOwner(false);
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

// ── Usługa słuchania w tle (Android) ──────────────────────────────────────
export function playbackServiceAvailable(): boolean {
  return !!playbackModule();
}

let hybrid: HybridTimers | null = null;

// Timery hybrydowe (bgTimers.ts) napędzane zdarzeniem onTick usługi — raz na proces. Podpinamy je
// też pod CriticalTimers z livekit-client (ping sygnalizacji, ponowne łączenie, limity czasu);
// bez tyknięć zachowują się jak zwykłe timery, więc rozmowy (ten sam livekit-client) nic nie tracą.
function backgroundTimers(): HybridTimers | null {
  if (hybrid) return hybrid;
  const m = playbackModule();
  if (!m) return null;
  const t = createHybridTimers({
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  });
  try {
    m.addListener('onTick', () => {
      try {
        t.tick();
      } catch (e) {
        if (__DEV__) console.warn('[interp] timer:', (e as Error)?.message);
      }
    });
  } catch {
    return null;
  }
  try {
    const CT = loadLiveKit().client.CriticalTimers;
    CT.setTimeout = t.setTimeout as unknown as typeof CT.setTimeout;
    CT.setInterval = t.setInterval as unknown as typeof CT.setInterval;
    CT.clearTimeout = t.clearTimeout as unknown as typeof CT.clearTimeout;
    CT.clearInterval = t.clearInterval as unknown as typeof CT.clearInterval;
  } catch {
    /* bez LiveKit — tylko nasze timery */
  }
  hybrid = t;
  return t;
}

// Timery słuchacza (ponawianie, odpytywanie): hybrydowe, gdy jest usługa — inaczej zwykłe.
export const listenerTimers = {
  setTimeout(fn: () => void, ms: number): unknown {
    const t = backgroundTimers();
    return t ? t.setTimeout(fn, ms) : setTimeout(fn, ms);
  },
  setInterval(fn: () => void, ms: number): unknown {
    const t = backgroundTimers();
    return t ? t.setInterval(fn, ms) : setInterval(fn, ms);
  },
  clear(handle: unknown) {
    if (handle == null) return;
    if (hybrid) hybrid.clearTimeout(handle);
    else clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

// Start (albo nowy tekst powiadomienia, gdy już działa). false = brak modułu / Android nie pozwolił.
export function startPlaybackService(title: string, text: string): boolean {
  const m = playbackModule();
  if (!m) return false;
  backgroundTimers();
  try {
    return m.start(title, text) === true;
  } catch (e) {
    if (__DEV__) console.warn('[interp] usługa:', (e as Error)?.message);
    return false;
  }
}

export function stopPlaybackService() {
  try {
    playbackModule()?.stop();
  } catch {
    /* brak modułu */
  }
}

// „Zatrzymaj” w powiadomieniu / apka usunięta z ostatnich → onStop; usługa nie wstała → onFailed.
export function subscribePlaybackService(handlers: {
  onStop: (reason: PlaybackStopReason) => void;
  onFailed: () => void;
}): () => void {
  const m = playbackModule();
  if (!m) return () => undefined;
  const subs: { remove(): void }[] = [];
  try {
    subs.push(m.addListener('onStopRequested', (e) => handlers.onStop(e?.reason ?? 'notification')));
    subs.push(m.addListener('onFailed', () => handlers.onFailed()));
  } catch {
    /* stary moduł */
  }
  return () => subs.forEach((s) => s.remove());
}
