import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { PhoneCall, Video } from "lucide-react-native";
import { B } from "../../../components/ui/brand";
import { FONT as F } from "../../../lib/fonts";
import { supabase } from "../../../lib/supabase";
import { formatClock } from "../logic";
import { resetCallEngine, showCallScreen, type CurrentCall } from "./engine";
import { useCallClock, useCurrentCall } from "./hooks";

export const callScreenHref = (callId: string | null | undefined) =>
  ({ pathname: "/(app)/call/[callId]", params: { callId: callId || "biezaca" } }) as never;

// Pasek „Wróć do rozmowy” nad całą apką, gdy rozmowa trwa, a ekran rozmowy jest zamknięty
// (jak w komunikatorach). Treść apki zaczyna się pod nim (górny odstęp ekranów = 0).
function ReturnBar({ call, top, onPress }: { call: CurrentCall; top: number; onPress: () => void }) {
  const ms = useCallClock(call.connectedAt);
  const status =
    call.phase === "active" ? formatClock(ms) : call.phase === "ringing" ? "Dzwonię…" : "Łączenie…";
  const Icon = call.kind === "video" || call.camOn ? Video : PhoneCall;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Wróć do rozmowy: ${call.title}. ${status}`}
      className="active:opacity-80"
      style={{ backgroundColor: B.kurkuma, paddingTop: top + 4, paddingBottom: 6, paddingHorizontal: 16 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Icon size={15} color={B.ink} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: B.ink, fontFamily: F.bold }}>
          Wróć do rozmowy · {call.title}
        </Text>
        <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.semibold, fontVariant: ["tabular-nums"] }}>{status}</Text>
      </View>
    </Pressable>
  );
}

// Host rozmów w (app)/_layout: otwiera ekran rozmowy, gdy silnik o to prosi (start, odebranie
// z ekranu blokady), pokazuje pasek powrotu i kończy rozmowy po wylogowaniu.
export function CallEngineHost({ children }: { children: ReactNode }) {
  const call = useCurrentCall();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const onCallScreen = pathname.startsWith("/call");
  const lastRequest = useRef("");

  const key = call?.key ?? 0;
  const request = call?.screenRequest ?? 0;
  const callId = call?.callId ?? null;
  useEffect(() => {
    if (!key) return;
    const tag = `${key}:${request}`;
    if (tag === lastRequest.current) return;
    lastRequest.current = tag;
    if (!onCallScreen) router.push(callScreenHref(callId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, request]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void resetCallEngine();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const showBar = !!call && !onCallScreen;
  return (
    <View style={{ flex: 1 }}>
      {showBar && call ? <ReturnBar call={call} top={insets.top} onPress={showCallScreen} /> : null}
      <SafeAreaInsetsContext.Provider value={showBar ? { ...insets, top: 0 } : insets}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
