import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Audio, type AVPlaybackStatus } from "expo-av";
import { Mic, Pause, Play } from "lucide-react-native";
import { resolveAttachmentUrl } from "../signedUrl";
import { showError } from "../../../lib/errors";

interface Props {
  uri: string;
  /** Długość w ms (jeśli znana z metadanych — u nas: zapisana w MessageAttachment.size). */
  durationHintMs?: number;
  /** Wariant kolorystyczny: jasny (na różowym bąbelku, "mine") albo ciemny (na szarym, "theirs"). */
  variant?: "light" | "dark";
}

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const BARS = 22;
// Pseudo-waveform — bez offline analizy nagrania, generujemy stabilny "ładny" kształt z hash z URI.
const fakeWaveform = (uri: string): number[] => {
  let h = 0;
  for (let i = 0; i < uri.length; i++) h = (h << 5) - h + uri.charCodeAt(i);
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const v = Math.abs(h % 28) + 6;
    out.push(v);
  }
  return out;
};

export const AudioPlayer = ({ uri, durationHintMs, variant = "dark" }: Props) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationHintMs ?? 0);
  const [loading, setLoading] = useState(false);
  const wave = useRef(fakeWaveform(uri)).current;

  const colors =
    variant === "light"
      ? {
          fg: "#ffffff",
          fgMuted: "rgba(255,255,255,0.55)",
          tint: "rgba(255,255,255,0.95)",
          bg: "rgba(255,255,255,0.18)",
        }
      : {
          fg: "#2A2312",
          fgMuted: "#A8A59E",
          tint: "#8A6606",
          bg: "#ffffff",
        };

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => undefined);
      }
    };
  }, [sound]);

  const onStatus = (st: AVPlaybackStatus) => {
    if (!st.isLoaded) return;
    setPosition(st.positionMillis ?? 0);
    if (st.durationMillis && !duration) setDuration(st.durationMillis);
    if (st.didJustFinish) {
      setIsPlaying(false);
      setPosition(0);
      sound?.setPositionAsync(0).catch(() => undefined);
    } else {
      setIsPlaying(st.isPlaying);
    }
  };

  const toggle = async () => {
    if (loading) return;
    if (sound) {
      const st = await sound.getStatusAsync();
      if (st.isLoaded && st.isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
      return;
    }
    setLoading(true);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      // K1: głosówka z magazynu czatu — podpisany link w chwili odtworzenia (zawsze świeży).
      const source = await resolveAttachmentUrl(uri);
      const { sound: s } = await Audio.Sound.createAsync(
        { uri: source || uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 150 },
      );
      s.setOnPlaybackStatusUpdate(onStatus);
      setSound(s);
      setIsPlaying(true);
    } catch (e) {
      showError("Nie udało się odtworzyć", e, "Nie udało się odtworzyć wiadomości głosowej. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  };

  const progress = duration > 0 ? position / duration : 0;
  const activeBar = Math.floor(progress * BARS);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: colors.bg,
        minWidth: 220,
      }}
    >
      <Pressable
        onPress={toggle}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Wstrzymaj wiadomość głosową" : "Odtwórz wiadomość głosową"}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isPlaying ? (
          <Pause size={14} color={variant === "light" ? "#8A6606" : "#ffffff"} fill={variant === "light" ? "#8A6606" : "#ffffff"} />
        ) : (
          <Play size={14} color={variant === "light" ? "#8A6606" : "#ffffff"} fill={variant === "light" ? "#8A6606" : "#ffffff"} />
        )}
      </Pressable>

      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 1.5,
          height: 28,
        }}
      >
        {wave.map((h, i) => (
          <View
            key={i}
            style={{
              width: 2,
              height: h,
              borderRadius: 1.5,
              backgroundColor: i < activeBar ? colors.tint : colors.fgMuted,
            }}
          />
        ))}
      </View>

      <Mic size={11} color={colors.fgMuted} />
      <Text
        style={{
          fontSize: 11,
          color: colors.fg,
          fontFamily: "Manrope_600SemiBold",
          fontVariant: ["tabular-nums"],
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {formatTime(duration > 0 ? (isPlaying ? position : duration - position) : 0)}
      </Text>
    </View>
  );
};
