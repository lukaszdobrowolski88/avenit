import { Pressable, Text, View } from "react-native";
import { Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react-native";
import { format } from "date-fns";
import { B } from "../../../components/ui/brand";
import { FONT as F } from "../../../lib/fonts";
import { callMessageView } from "../logic";
import { joinCallOnWeb, useCallsEnabled, useLiveCall } from "../api";

// Wiadomość „połączenie” w wątku (jak web CallMessage): ikona, opis, czas trwania,
// „Dołącz” (trwa) albo „Oddzwoń” (nieodebrane). Połączenie otwiera się w przeglądarce telefonu.
export function CallMessageCard({
  message,
  conversationId,
  myEmail,
}: {
  message: { metadata?: unknown; sender_email?: string | null; created_at: string };
  conversationId: string;
  myEmail: string | null;
}) {
  const enabled = useCallsEnabled();
  const live = useLiveCall(conversationId);
  const metaCallId = (() => {
    const m = message.metadata as { call_id?: string } | string | null | undefined;
    if (!m) return null;
    if (typeof m === "string") {
      try { return (JSON.parse(m) as { call_id?: string }).call_id ?? null; } catch { return null; }
    }
    return m.call_id ?? null;
  })();
  const view = callMessageView(message, myEmail, undefined, { live: live && metaCallId ? live.id === metaCallId : null });

  let Icon = view.mine ? PhoneOutgoing : PhoneIncoming;
  if (view.live) Icon = view.kind === "video" ? Video : PhoneCall;
  else if (view.tone === "missed") Icon = PhoneMissed;
  else if (view.kind === "video") Icon = Video;
  else if (view.status === "cancelled") Icon = Phone;

  const meta = [view.durationText, format(new Date(message.created_at), "HH:mm")].filter(Boolean).join(" · ");
  const action = enabled && view.live
    ? { label: "Dołącz", kind: view.kind }
    : enabled && view.canCallBack
      ? { label: view.callBackLabel, kind: view.kind }
      : null;

  return (
    <View style={{ alignItems: "center", marginVertical: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          maxWidth: "92%",
          backgroundColor: B.card,
          borderRadius: 18,
          paddingVertical: 8,
          paddingLeft: 8,
          paddingRight: action ? 8 : 14,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: view.tone === "missed" ? B.dangerBg : B.paper2,
          }}
        >
          <Icon size={17} color={view.tone === "missed" ? B.danger : B.ink} strokeWidth={2} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={2} style={{ fontSize: 14, color: B.ink, fontFamily: F.semibold }}>
            {view.title}
          </Text>
          {meta ? <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium, marginTop: 1 }}>{meta}</Text> : null}
        </View>
        {action ? (
          <Pressable
            onPress={() => void joinCallOnWeb(conversationId, action.kind)}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}. Połączenie otworzy się w przeglądarce`}
            className="active:opacity-70"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: B.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            {action.kind === "video" ? <Video size={14} color={B.onDark} /> : <PhoneCall size={14} color={B.onDark} />}
            <Text style={{ fontSize: 13, color: B.onDark, fontFamily: F.bold }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// Pasek pod nagłówkiem rozmowy, gdy trwa połączenie (jak web ActiveCallBanner).
export function LiveCallBanner({ conversationId, isDirect }: { conversationId: string; isDirect: boolean }) {
  const enabled = useCallsEnabled();
  const live = useLiveCall(conversationId);
  if (!enabled || !live) return null;
  const video = live.kind === "video";
  const label = isDirect ? (video ? "Trwa połączenie wideo" : "Trwa połączenie głosowe") : "Trwa rozmowa";
  return (
    <View
      accessibilityRole="summary"
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: B.kurkumaSoft }}
    >
      {video ? <Video size={17} color={B.ink} /> : <PhoneCall size={17} color={B.ink} />}
      <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }} numberOfLines={1}>{label}</Text>
      <Pressable
        onPress={() => void joinCallOnWeb(conversationId, video ? "video" : "audio")}
        accessibilityRole="button"
        accessibilityLabel="Dołącz do rozmowy. Otworzy się w przeglądarce"
        className="active:opacity-70"
        style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: B.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}
      >
        <PhoneCall size={14} color={B.onDark} />
        <Text style={{ fontSize: 13, color: B.onDark, fontFamily: F.bold }}>Dołącz</Text>
      </Pressable>
    </View>
  );
}
