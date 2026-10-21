import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { showError } from "../../../lib/errors";
import { acquireAudio } from "../../../lib/audioMode";
import {
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioPlayer,
} from "expo-audio";
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
  // Rejestrator żyje razem z komponentem (useAudioRecorder zwalnia go przy odmontowaniu).
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recState = useAudioRecorderState(recorder, 80);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(BARS).fill(4));
  const [preview, setPreview] = useState<{
    uri: string;
    mime: string;
    durationMs: number;
  } | null>(null);
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sending, setSending] = useState(false);

  const ringRef = useRef<number[]>(new Array(BARS).fill(4));
  const recordingRef = useRef(false);
  const durationRef = useRef(0);
  // Tryb dźwięku (src/lib/audioMode.ts): nagrywanie na czas nagrania, „głos” na czas odsłuchu
  // podglądu; po zwolnieniu apka wraca do trybu UI (dźwięki respektują przełącznik wyciszenia).
  const recordHold = useRef<null | (() => Promise<void>)>(null);
  const playHold = useRef<null | (() => Promise<void>)>(null);
  const release = (ref: typeof recordHold) => {
    const r = ref.current;
    ref.current = null;
    return r ? r().catch(() => undefined) : Promise.resolve();
  };
  useEffect(
    () => () => {
      release(recordHold);
      release(playHold);
    },
    [],
  );

  // Auto-start nagrywania.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Brak uprawnień",
            "Aby nagrać wiadomość głosową, daj aplikacji dostęp do mikrofonu.",
          );
          onCancel();
          return;
        }
        if (!recordHold.current) recordHold.current = await acquireAudio("record");
        if (cancelled) {
          release(recordHold);
          return;
        }
        await recorder.prepareToRecordAsync();
        if (cancelled) {
          release(recordHold);
          return;
        }
        recorder.record();
        recordingRef.current = true;
        setIsRecording(true);
      } catch (e: any) {
        if (__DEV__) console.warn("[recorder] start failed", e);
        release(recordHold);
        showError("Nie udało się nagrywać", e, "Nie udało się uruchomić nagrywania. Spróbuj ponownie.");
        onCancel();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Postęp i „fala” z meteringu (dB ~ -160..0; 0 = clipping) → słupki 4..36.
  useEffect(() => {
    if (!recState.isRecording) return;
    durationRef.current = recState.durationMillis;
    setSeconds(Math.floor(recState.durationMillis / 1000));
    const m = recState.metering ?? -100;
    const norm = Math.max(0, Math.min(1, (m + 60) / 60));
    const h = Math.round(4 + norm * 32);
    ringRef.current = [...ringRef.current.slice(1), h];
    setBars(ringRef.current.slice());
  }, [recState.isRecording, recState.durationMillis, recState.metering]);

  // Sprzątanie: przerwane nagranie i odtwarzacz podglądu.
  useEffect(() => {
    return () => {
      if (recordingRef.current) recorder.stop().catch(() => undefined);
    };
  }, [recorder]);
  useEffect(() => {
    return () => {
      sound?.remove();
    };
  }, [sound]);

  const stopAndPreview = async () => {
    if (!recordingRef.current) return;
    try {
      const durationMs = durationRef.current || seconds * 1000;
      await recorder.stop();
      recordingRef.current = false;
      // Koniec nagrywania — oddaj tryb (inaczej na iOS sesja zostaje w trybie nagrywania:
      // odtwarzanie bywa ciche / „do ucha”, a dźwięki UI grały mimo wyciszenia).
      await release(recordHold);
      const uri = recorder.uri;
      // Rejestrator nie podaje mime'a — heurystyka na podstawie URI.
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
    } catch (e: any) {
      showError("Nie udało się nagrywać", e, "Nie udało się zakończyć nagrywania. Spróbuj ponownie.");
    }
  };

  const togglePause = () => {
    if (!recordingRef.current) return;
    if (isPaused) {
      recorder.record();
      setIsPaused(false);
    } else {
      recorder.pause();
      setIsPaused(true);
    }
  };

  const togglePlayback = async () => {
    if (!preview) return;
    if (isPlaying && sound) {
      sound.pause();
      setIsPlaying(false);
      release(playHold);
      return;
    }
    if (!playHold.current) playHold.current = await acquireAudio("playback").catch(() => null);
    if (sound) {
      await sound.seekTo(0).catch(() => undefined);
      sound.play();
      setIsPlaying(true);
      return;
    }
    const p = createAudioPlayer({ uri: preview.uri });
    p.addListener("playbackStatusUpdate", (st) => {
      if (st.didJustFinish) {
        setIsPlaying(false);
        p.pause();
        p.seekTo(0).catch(() => undefined);
        release(playHold);
      }
    });
    p.play();
    setSound(p);
    setIsPlaying(true);
  };

  const handleSend = async () => {
    if (!preview || sending) return;
    setSending(true);
    try {
      await onSend(preview.uri, preview.mime, preview.durationMs);
    } catch {
      // Błąd wysyłki pokazuje ekran rozmowy (handleSendVoice) — nagranie zostaje do ponowienia.
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (recordingRef.current) {
      recordingRef.current = false;
      await recorder.stop().catch(() => undefined);
    }
    sound?.pause();
    release(recordHold);
    release(playHold);
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
          backgroundColor: "#FFF8E1",
          borderTopWidth: 1,
          borderTopColor: "#F3E3B0",
        }}
      >
        <Pressable
          onPress={handleCancel}
          hitSlop={6}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#F6F4EE",
            borderWidth: 1,
            borderColor: "#F3E3B0",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={16} color="#B42318" strokeWidth={2.4} />
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
                backgroundColor: "#2A2312",
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
            backgroundColor: "#F6F4EE",
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#F3E3B0",
            minWidth: 64,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isPaused ? "#FFBE0B" : "#B42318",
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: "#8A6606",
              fontFamily: "Manrope_700Bold",
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
            backgroundColor: "#F6F4EE",
            borderWidth: 1,
            borderColor: "#F3E3B0",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPaused ? (
            <Play size={16} color="#4A463E" />
          ) : (
            <Pause size={16} color="#4A463E" />
          )}
        </Pressable>

        <Pressable
          onPress={stopAndPreview}
          hitSlop={6}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#2A2312",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#2A2312",
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
          backgroundColor: "#FFF8E1",
          borderTopWidth: 1,
          borderTopColor: "#F3E3B0",
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
            backgroundColor: "#F6F4EE",
            borderWidth: 1,
            borderColor: "#F3E3B0",
            alignItems: "center",
            justifyContent: "center",
            opacity: sending ? 0.5 : 1,
          }}
        >
          <X size={16} color="#B42318" strokeWidth={2.4} />
        </Pressable>

        <Pressable
          onPress={togglePlayback}
          disabled={sending}
          hitSlop={6}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#F6F4EE",
            borderWidth: 1,
            borderColor: "#F3E3B0",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPlaying ? <Pause size={16} color="#8A6606" /> : <Play size={16} color="#8A6606" />}
        </Pressable>

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: "#F6F4EE",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#F3E3B0",
          }}
        >
          <Mic size={14} color="#8A6606" />
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: "#2A2312",
              fontFamily: "Manrope_500Medium",
            }}
          >
            Wiadomość głosowa
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: "#6E685A",
              fontFamily: "Manrope_500Medium",
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
            backgroundColor: "#2A2312",
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
