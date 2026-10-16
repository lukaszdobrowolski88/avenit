// Token pushów VoIP (iOS: APNs VoIP przez PushKit, Android: FCM) — zapisywany w TYM SAMYM wierszu
// push_tokens co token Expo (po expo_token). Serwer wysyła wtedy przychodzące połączenia jako push
// VoIP (system pokazuje ekran połączenia także przy zamkniętej apce), a zwykły push „dzwoni”
// tylko urządzeniom bez tokenu VoIP. Rejestrujemy przy każdym uruchomieniu — serwer czyści martwe
// tokeny. voip_token = null wyłącza VoIP dla urządzenia.
import Constants from "expo-constants";
import type { VoIPPushToken } from "expo-callkit-telecom";
import { supabase } from "../../../lib/supabase";
import { callkit } from "./modules";

let expoToken: string | null = null;
let lastSaved: string | null = null;
let subscribed = false;

// Środowisko APNs: build deweloperski (APP_VARIANT=development) → sandbox, reszta → production.
const voipEnv = () => {
  const variant = (Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant;
  return variant === "development" ? "sandbox" : "production";
};

async function save(voip: VoIPPushToken | null) {
  const token = expoToken;
  if (!token) return;
  const key = `${token}|${voip?.token ?? ""}`;
  if (key === lastSaved) return;
  const { error } = await (supabase.from("push_tokens") as any)
    .update({
      voip_token: voip?.token ?? null,
      voip_type: voip?.type ?? null,
      voip_env: voip ? voipEnv() : null,
      voip_updated_at: new Date().toISOString(),
    })
    .eq("expo_token", token);
  if (error) {
    // Serwer bez kolumn voip_* (starsza wersja API) — po cichu, spróbujemy przy następnym starcie.
    const e = error as { code?: string; message?: string };
    if (e.code === "42703" || /voip_/i.test(String(e.message || ""))) return;
    if (__DEV__) console.warn("[voip] zapis tokenu nieudany:", e.message);
    return;
  }
  lastSaved = key;
}

// Wołane po zapisaniu tokenu Expo (lib/push.ts). Bez modułu natywnego — nic.
export function registerVoipPush(expoPushToken: string) {
  const CK = callkit();
  if (!CK) return;
  if (expoToken !== expoPushToken) lastSaved = null;
  expoToken = expoPushToken;
  try {
    CK.registerVoIPPush();
  } catch (e) {
    if (__DEV__) console.warn("[voip] rejestracja nieudana:", (e as Error)?.message);
    return;
  }
  if (!subscribed) {
    subscribed = true;
    // Nowy / odświeżony / unieważniony token — zapisz od razu.
    CK.addVoIPPushTokenUpdatedListener((e) => {
      void save(e.token ? { token: e.token, type: e.type } : null);
    });
  }
  let currentToken: VoIPPushToken | null = null;
  try {
    currentToken = CK.getVoIPPushToken();
  } catch {
    currentToken = null;
  }
  if (currentToken) void save(currentToken);
}
