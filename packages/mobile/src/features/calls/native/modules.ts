// Bezpieczne ładowanie modułów natywnych rozmów. Apka musi działać także tam, gdzie ich nie ma:
// Expo Go, web, stary build natywny z nowszym JS (OTA) — wtedy rozmowy otwierają się jak dawniej
// w przeglądarce telefonu. Moduły ładujemy leniwie (require w funkcji): sam import
// @livekit/react-native bez natywnego WebRTCModule wywraca apkę już przy starcie.
import { NativeModules, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

type CallKitModule = typeof import("expo-callkit-telecom");
type LiveKitRN = typeof import("@livekit/react-native");
type LiveKitClient = typeof import("livekit-client");

let ck: CallKitModule | null | undefined;

// expo-callkit-telecom (CallKit / Core-Telecom) albo null, gdy w buildzie go nie ma.
export function callkit(): CallKitModule | null {
  if (ck !== undefined) return ck;
  ck = null;
  if (Platform.OS !== "ios" && Platform.OS !== "android") return ck;
  try {
    if (!requireOptionalNativeModule("ExpoCallKitTelecom")) return ck;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ck = require("expo-callkit-telecom") as CallKitModule;
  } catch (e) {
    if (__DEV__) console.warn("[calls] expo-callkit-telecom niedostępny:", (e as Error)?.message);
    ck = null;
  }
  return ck;
}

const hasWebRTC = () => !!(NativeModules as Record<string, unknown>).WebRTCModule;

// Czy ten build umie rozmawiać natywnie (CallKit + WebRTC). Inaczej — zapas w przeglądarce.
export function nativeCallsAvailable(): boolean {
  return !!callkit() && hasWebRTC();
}

let lk: { rn: LiveKitRN; client: LiveKitClient } | null = null;

// LiveKit (React Native + livekit-client). Pierwsze wywołanie rejestruje globalne WebRTC
// (registerGlobals). iOS: sesją audio zarządza CallKit (expo-callkit-telecom ustawia
// RTCAudioSession w tryb ręczny i włącza go razem z CallKit) — dlatego bez automatycznej
// konfiguracji LiveKit i BEZ AudioSession.startAudioSession() (tak każe expo-callkit-telecom).
export function loadLiveKit() {
  if (lk) return lk;
  if (!hasWebRTC()) throw new Error("Rozmowy nie są dostępne w tej wersji aplikacji.");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rn = require("@livekit/react-native") as LiveKitRN;
  rn.registerGlobals({ autoConfigureAudioSession: false });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const client = require("livekit-client") as LiveKitClient;
  lk = { rn, client };
  return lk;
}
