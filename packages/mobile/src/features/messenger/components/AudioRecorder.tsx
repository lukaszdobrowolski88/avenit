import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Audio } from "expo-av";
import { Mic, Pause, Play, Send, Square, X } from "lucide-react-native";

interface Props {
  onSend: (uri: string, mime: string, durationMs: number) => Promise<void> | void;
  onCancel: () => void;
  disabled?: boolean;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

const BARS = 18;

/**
 * Recorder z auto-startem nagrywania przy mount. Trzy stany:
 *  - recording: pasek + waveform z meteringu, pauza, stop
 *  - preview: Play/Pause + Send + Cancel
 *  - sending: spinner
 */
export const AudioRecorder = ({ onSend, onCancel, disabled }: Props) => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(BARS).fill(4));
  const [preview, setPreview] = useState<{
    uri: string;
    mime: string;
    durationMs: number;
  } | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sending, setSending] = useState(false);

  const ringRef = useRef<number[]>(new Array(BARS).fill(4));

  // Auto-start nagrywania.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Brak uprawnień",
            "Aby nagrać wiadomość głosową, daj aplikacji dostęp do mikrofonu.",
          );
          onCancel();
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        rec.setOnRecordingStatusUpdate((status) => {
          if (!status.isRecording) return;
          setSeconds(Math.floor(status.durationMillis / 1000));
          // metering: dB w zakresie ~ -160..0; 0 = clipping. Mapuj do 4..36.
          const m = (status.metering ?? -100) as number;
          const norm = Math.max(0, Math.min(1, (m + 60) / 60));
          const h = Math.round(4 + norm * 32);
          ringRef.current = [...ringRef.current.slice(1), h];
          setBars(ringRef.current.slice());
        });
        rec.setProgressUpdateInterval(80);
        await rec.startAsync();
        if (cancelled) {
          await rec.stopAndUnloadAsync().catch(() => undefined);
          return;
        }
        setRecording(rec);
        setIsRecording(true);
      } catch (e: any) {
        if (__DEV__) console.warn("[recorder] start failed", e);
        Alert.alert("Błąd", e?.message ?? "Nie udało się uruchomić nagrywania.");
        onCancel();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => undefined);
      }
      if (sound) {
        sound.unloadAsync().catch(() => undefined);
      }
    };
  }, [recording, sound]);

  const stopAndPreview = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const status = await recording.getStatusAsync();
      const durationMs = status.durationMillis ?? seconds * 1000;
      // expo-av nie wystawia mime'a — heurystyka na podstawie URI.
      const mime = uri?.endsWith(".m4a")
        ? "audio/mp4"
        : uri?.endsWith(".3gp")
        ? "audio/3gpp"
        : uri?.endsWith(".webm")
        ? "audio/webm"
        : "audio/mp4";
      if (uri) {
        setPreview({ uri, mime, durationMs });
      }
      setIsRecording(false);
      setRecording(null);
    } catch (e: any) {
      Alert.alert("Błąd", e?.message ?? "Nie udało się zakończyć nagrywania.");
    }
  };

  const togglePause = async () => {
    if (!recording) return;
    if (isPaused) {
      await recording.startAsync();
      setIsPaused(false);
    } else {
      await recording.pauseAsync();
      setIsPaused(true);
    }
  };

  const togglePlayback = async () => {
    if (!preview) return;
    if (isPlaying && sound) {
      await sound.stopAsync().catch(() => undefined);
      setIsPlaying(false);
      return;
    }
    if (sound) {
      await sound.unloadAsync().catch(() => undefined);
    }
    const { sound: s } = await Audio.Sound.createAsync({ uri: preview.uri }, { shouldPlay: true });
    s.setOnPlaybackStatusUpdate((st) => {
      if ("didJustFinish" in st && st.didJustFinish) {
        setIsPlaying(false);
      }
    });
    setSound(s);
    setIsPlaying(true);
  };

  const handleSend = async () => {
    if (!preview || sending) return;
    setSending(true);
    try {
      await onSend(preview.uri, preview.mime, preview.durationMs);
    } catch (e: any) {
      Alert.alert("Błąd wysyłki", e?.message ?? "Nie udało się wysłać wiadomości.");
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        // ignore
      }
    }
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch {
        // ignore
      }
    }
    onCancel();
  };

  // ============ UI: nagrywanie ============
  if (isRecording) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "#fdf2f8",
          borderTopWidth: 1,
          borderTopColor: "#fbcfe8",
        }}
      >
        <Pressable
          onPress={handleCancel}
          hitSlop={6}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#fbcfe8",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={16} color="#ef4444" strokeWidth={2.4} />
        </Pressable>

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            height: 40,
          }}
        >
          {bars.map((h, i) => (
            <View
              key={i}
              style={{
                width: 3,
                height: Math.max(4, h),
                borderRadius: 2,
                backgroundColor: "#ec4899",
                opacity: isPaused ? 0.4 : 1,
              }}
            />
          ))}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: "#ffffff",
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#fbcfe8",
            minWidth: 64,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isPaused ? "#eab308" : "#ef4444",
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: "#be185d",
              fontFamily: "Inter_700Bold",
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatTime(seconds)}
          </Text>
        </View>

        <Pressable
          onPress={togglePause}
          hitSlop={6}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#fbcfe8",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPaused ? (
            <Play size={16} color="#57534e" />
          ) : (
            <Pause size={16} color="#57534e" />
          )}
        </Pressable>

        <Pressable
          onPress={stopAndPreview}
          hitSlop={6}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#ec4899",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#ec4899",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Square size={14} color="#ffffff" fill="#ffffff" />
        </Pressable>
      </View>
    );
  }

  // ============ UI: preview ============
  if (preview) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "#fdf2f8",
          borderTopWidth: 1,
          borderTopColor: "#fbcfe8",
        }}
      >
        <Pressable
          onPress={handleCancel}
          disabled={sending}
          hitSlop={6}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#fbcfe8",
            alignItems: "center",
            justifyContent: "center",
            opacity: sending ? 0.5 : 1,
          }}
        >
          <X size={16} color="#ef4444" strokeWidth={2.4} />
        </Pressable>

        <Pressable
          onPress={togglePlayback}
          disabled={sending}
          hitSlop={6}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#fbcfe8",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPlaying ? <Pause size={16} color="#ec4899" /> : <Play size={16} color="#ec4899" />}
        </Pressable>

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: "#ffffff",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#fbcfe8",
          }}
        >
          <Mic size={14} color="#ec4899" />
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: "#1c1917",
              fontFamily: "Inter_500Medium",
            }}
          >
            Wiadomość głosowa
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: "#a8a29e",
              fontFamily: "Inter_500Medium",
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatTime(Math.round(preview.durationMs / 1000))}
          </Text>
        </View>

        <Pressable
          onPress={handleSend}
          disabled={sending || disabled}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#ec4899",
            alignItems: "center",
            justifyContent: "center",
            opacity: sending || disabled ? 0.6 : 1,
          }}
        >
          {sending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Send size={16} color="#ffffff" strokeWidth={2.4} />
          )}
        </Pressable>
      </View>
    );
  }

  return null;
};
