// Ekran rozmowy audio/wideo (LiveKit). Ładowany leniwie z app/(app)/call/[callId].tsx — tylko
// w buildzie z modułami natywnymi (import @livekit/react-native bez WebRTC wywraca apkę).
// Pokój żyje w silniku (engine.ts), ekran tylko go pokazuje: zamknięcie ekranu nie kończy rozmowy.
import { useEffect, useRef, type ComponentType } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RoomContext,
  VideoTrack,
  isTrackReference,
  useIsMuted,
  useIsSpeaking,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { Check, ChevronDown, Mic, MicOff, PhoneOff, SwitchCamera, UserPlus, Video, VideoOff, Volume2, X } from "lucide-react-native";
import { B } from "../../../components/ui/brand";
import { FONT as F } from "../../../lib/fonts";
import { goBack } from "../../../lib/navigation";
import { formatClock, initials, parseMetadata } from "../logic";
import {
  decideGuest,
  flipCamera,
  getRoom,
  hangUp,
  toggleCamera,
  toggleMic,
  toggleSpeaker,
  type CurrentCall,
} from "./engine";
import { useCallClock, useCurrentCall } from "./hooks";
import { loadLiveKit } from "./modules";

// Globalne WebRTC przed pierwszym użyciem LiveKit (raz).
loadLiveKit();

// Ciemny ekran rozmowy w barwach marki (słód) — bez gradientów.
const BG = "#17140C";
const TILE = B.ink;
const TILE2 = "#3A3424";
const SOFT = "rgba(246,244,238,0.14)";

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

function statusText(call: CurrentCall, ms: number) {
  if (call.held) return "Wstrzymano";
  if (call.reconnecting) return "Ponowne łączenie…";
  if (call.phase === "ringing") return "Dzwonię…";
  if (call.phase !== "active") return "Łączenie…";
  return formatClock(ms);
}

function Avatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: TILE2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={{ color: B.onDark, fontSize: size * 0.36, fontFamily: F.bold }}>{initials(name)}</Text>
      )}
    </View>
  );
}

// Kafelek osoby: obraz z kamery albo awatar, podpis, wyciszenie; mówiący — obwódka w kurkumie.
function Tile({
  trackRef,
  style,
  mirror = false,
  compact = false,
  zOrder,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  style: ViewStyle;
  mirror?: boolean;
  compact?: boolean;
  zOrder?: number;
}) {
  const p = trackRef.participant;
  const speaking = useIsSpeaking(p);
  const camMuted = useIsMuted(trackRef);
  const micMuted = useIsMuted({ participant: p, source: Track.Source.Microphone, publication: p.getTrackPublication(Track.Source.Microphone) });
  const name = p.isLocal ? "Ty" : p.name || p.identity || "Uczestnik";
  const meta = parseMetadata(p.metadata);
  const avatar = (meta.avatar_url || meta.avatarUrl || null) as string | null;
  const showVideo = isTrackReference(trackRef) && !camMuted;
  return (
    <View
      accessible
      accessibilityLabel={`${name}${micMuted ? ", mikrofon wyłączony" : ""}${speaking ? ", mówi" : ""}`}
      style={[
        { backgroundColor: TILE, borderRadius: compact ? 16 : 22, overflow: "hidden", alignItems: "center", justifyContent: "center" },
        { borderWidth: 2, borderColor: speaking && !p.isLocal ? B.kurkuma : "transparent" },
        style,
      ]}
    >
      {showVideo && isTrackReference(trackRef) ? (
        <VideoTrack trackRef={trackRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} objectFit="cover" mirror={mirror} zOrder={zOrder} />
      ) : (
        <Avatar name={p.isLocal ? "Ty" : name} url={avatar} size={compact ? 44 : 84} />
      )}
      {!compact ? (
        <View
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            maxWidth: "85%",
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: "rgba(23,20,12,0.62)",
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
        >
          {micMuted ? <MicOff size={13} color={B.onDark} /> : null}
          <Text numberOfLines={1} style={{ color: B.onDark, fontSize: 12, fontFamily: F.semibold, flexShrink: 1 }}>
            {name}
          </Text>
        </View>
      ) : micMuted ? (
        <View style={{ position: "absolute", right: 6, bottom: 6, backgroundColor: "rgba(23,20,12,0.62)", borderRadius: 999, padding: 4 }}>
          <MicOff size={11} color={B.onDark} />
        </View>
      ) : null}
    </View>
  );
}

// Czekanie: dzwonię / łączę / sam w rozmowie grupowej.
function Waiting({ call, text }: { call: CurrentCall; text: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 }}>
      <Avatar name={call.title} size={112} />
      <Text numberOfLines={2} style={{ color: B.onDark, fontSize: 24, fontFamily: F.bold, textAlign: "center" }}>
        {call.title}
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ color: B.onDarkMuted, fontSize: 15, fontFamily: F.medium, textAlign: "center" }}>
        {text}
      </Text>
    </View>
  );
}

function Stage({ call, status, topPad, bottomPad }: { call: CurrentCall; status: string; topPad: number; bottomPad: number }) {
  const { width, height } = useWindowDimensions();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const local = tracks.find((t) => t.participant.isLocal) ?? null;
  const remotes = tracks.filter((t) => !t.participant.isLocal);
  const pip = local && call.camOn ? (
    <Tile
      trackRef={local}
      mirror={call.frontCamera}
      compact
      zOrder={1}
      style={{ position: "absolute", right: 16, top: topPad + 8, width: 104, height: 150, borderRadius: 16 }}
    />
  ) : null;

  // Nikogo poza mną: dzwonię albo czekam na innych (spotkanie, grupa).
  if (!remotes.length) {
    const text = call.phase === "active" ? (call.isGroup ? "Czekasz na pozostałych uczestników…" : status) : status;
    return (
      <View style={{ flex: 1 }}>
        <Waiting call={call} text={text} />
        {pip}
      </View>
    );
  }

  // 1:1 — druga osoba na cały ekran, ja w małym okienku.
  if (remotes.length === 1) {
    return (
      <View style={{ flex: 1 }}>
        <Tile trackRef={remotes[0]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0, borderWidth: 0 }} />
        {pip}
      </View>
    );
  }

  // Grupa — siatka 2 kolumny (do ~6 widocznych), reszta po przewinięciu.
  const gap = 8;
  const tileW = (width - 16 * 2 - gap) / 2;
  const avail = height - topPad - bottomPad;
  const all = local ? [local, ...remotes] : remotes;
  const rows = Math.ceil(all.length / 2);
  const tileH = Math.max(tileW * 1.05, Math.min(tileW * 1.5, (avail - gap * (Math.min(rows, 3) - 1)) / Math.min(rows, 3)));
  return (
    <ScrollView contentContainerStyle={{ paddingTop: topPad, paddingBottom: bottomPad, paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", gap }}>
      {all.map((t) => (
        <Tile
          key={`${t.participant.identity}:${t.source}`}
          trackRef={t}
          mirror={t.participant.isLocal && call.frontCamera}
          style={{ width: tileW, height: tileH }}
        />
      ))}
    </ScrollView>
  );
}

function ControlButton({
  icon: Icon,
  label,
  a11y,
  onPress,
  highlighted = false,
  danger = false,
  disabled = false,
}: {
  icon: IconType;
  label: string;
  a11y?: string;
  onPress: () => void;
  highlighted?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const bg = danger ? B.danger : highlighted ? B.onDark : SOFT;
  const fg = danger ? "#FFFFFF" : highlighted ? B.ink : B.onDark;
  return (
    <View style={{ alignItems: "center", gap: 6, width: 68, opacity: disabled ? 0.4 : 1 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11y || label}
        accessibilityState={{ disabled, selected: highlighted }}
        className="active:opacity-70"
        style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
      >
        <Icon size={24} color={fg} strokeWidth={2} />
      </Pressable>
      <Text numberOfLines={1} style={{ color: B.onDarkMuted, fontSize: 11, fontFamily: F.semibold }}>
        {label}
      </Text>
    </View>
  );
}

// Poczekalnia gości: „Ktoś czeka w poczekalni” z Wpuść / Odrzuć (jak web GuestLobby).
function GuestBanner({ call }: { call: CurrentCall }) {
  const [first, ...rest] = call.guests;
  if (!first) return null;
  const name = first.guest_name || "Gość";
  return (
    <View
      accessibilityRole="alert"
      style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: B.card, borderRadius: 20, padding: 14, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.kurkumaSoft, alignItems: "center", justifyContent: "center" }}>
          <UserPlus size={17} color={B.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>Ktoś czeka w poczekalni</Text>
          <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>
            {name}
          </Text>
          {rest.length ? (
            <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>i jeszcze {rest.length} w poczekalni</Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Pressable
          onPress={() => void decideGuest(first.id, false)}
          accessibilityRole="button"
          accessibilityLabel={`Odrzuć: ${name}`}
          className="active:opacity-70"
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: B.paper2, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <X size={15} color={B.ink} />
          <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.semibold }}>Odrzuć</Text>
        </Pressable>
        <Pressable
          onPress={() => void decideGuest(first.id, true)}
          accessibilityRole="button"
          accessibilityLabel={`Wpuść: ${name}`}
          className="active:opacity-70"
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: B.ink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Check size={15} color={B.onDark} />
          <Text style={{ fontSize: 14, color: B.onDark, fontFamily: F.bold }}>Wpuść</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function CallScreen() {
  const call = useCurrentCall();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ms = useCallClock(call?.connectedAt);

  // Rozmowa się skończyła (albo nic nie trwa — stary link) — zamknij ekran.
  const closed = useRef(false);
  useEffect(() => {
    if (call || closed.current) return;
    closed.current = true;
    goBack(router);
  }, [call, router]);

  if (!call) return <View style={{ flex: 1, backgroundColor: BG }} />;

  const room = getRoom();
  const status = statusText(call, ms);
  const topPad = insets.top + 64;
  const bottomPad = insets.bottom + 128;
  const canMedia = call.canPublish && call.roomReady;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" />
      {room && call.roomReady ? (
        <RoomContext.Provider value={room}>
          <Stage call={call} status={status} topPad={topPad} bottomPad={bottomPad} />
        </RoomContext.Provider>
      ) : (
        <Waiting call={call} text={status} />
      )}

      {/* Górny pasek: zwiń (rozmowa trwa dalej), nazwa, stan. */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 6 }} pointerEvents="box-none">
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10 }} pointerEvents="box-none">
          <Pressable
            onPress={() => goBack(router)}
            accessibilityRole="button"
            accessibilityLabel="Zwiń rozmowę"
            accessibilityHint="Rozmowa trwa dalej. Wrócisz do niej z paska u góry ekranu."
            className="active:opacity-70"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: SOFT, alignItems: "center", justifyContent: "center" }}
          >
            <ChevronDown size={22} color={B.onDark} />
          </Pressable>
          <View style={{ flex: 1 }} pointerEvents="none">
            <Text numberOfLines={1} style={{ color: B.onDark, fontSize: 16, fontFamily: F.bold }}>
              {call.title}
            </Text>
            <Text numberOfLines={1} style={{ color: B.onDarkMuted, fontSize: 13, fontFamily: F.medium, fontVariant: ["tabular-nums"] }}>
              {status}
              {!call.canPublish ? " · tylko słuchasz" : ""}
            </Text>
          </View>
        </View>
        <GuestBanner call={call} />
      </View>

      {/* Sterowanie. */}
      <View
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 16, paddingTop: 12 }}
        pointerEvents="box-none"
      >
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "flex-start", gap: 4, paddingHorizontal: 8 }}>
          <ControlButton
            icon={call.micOn ? Mic : MicOff}
            label="Mikrofon"
            a11y={call.micOn ? "Wycisz mikrofon" : "Włącz mikrofon"}
            highlighted={!call.micOn}
            disabled={!canMedia}
            onPress={() => void toggleMic()}
          />
          <ControlButton
            icon={call.camOn ? Video : VideoOff}
            label="Kamera"
            a11y={call.camOn ? "Wyłącz kamerę" : "Włącz kamerę"}
            highlighted={call.camOn}
            disabled={!canMedia}
            onPress={() => void toggleCamera()}
          />
          {call.camOn ? (
            <ControlButton icon={SwitchCamera} label="Obróć" a11y="Przełącz na drugi aparat" disabled={!canMedia} onPress={() => void flipCamera()} />
          ) : null}
          <ControlButton
            icon={Volume2}
            label="Głośnik"
            a11y={call.speaker ? "Wyłącz głośnik" : "Włącz głośnik"}
            highlighted={call.speaker}
            onPress={toggleSpeaker}
          />
          <ControlButton icon={PhoneOff} label="Rozłącz" a11y="Zakończ rozmowę" danger onPress={() => void hangUp()} />
        </View>
      </View>
    </View>
  );
}
