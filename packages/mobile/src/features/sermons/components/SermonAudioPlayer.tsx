import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { acquireAudio } from '../../../lib/audioMode';

// Odtwarzacz audio dla kazań — ten sam mechanizm expo-audio co w messenger/AudioPlayer,
// ale w większym, „podcastowym" układzie (pasek postępu + czas).

interface Props {
  uri: string;
  dark?: boolean;
}

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// `dark` — wewnątrz ciemnej karty (słód): przezroczyste tło, opisy jasne.
export const SermonAudioPlayer = ({ uri, dark }: Props) => {
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  // Tryb „głos” (słychać mimo wyciszenia) tylko na czas grania — src/lib/audioMode.ts.
  const holdRef = useRef<null | (() => Promise<void>)>(null);
  const releaseMode = () => {
    const r = holdRef.current;
    holdRef.current = null;
    r?.().catch(() => undefined);
  };
  const holdMode = async () => {
    if (!holdRef.current) holdRef.current = await acquireAudio('playback');
  };
  useEffect(() => () => releaseMode(), []);

  // createAudioPlayer nie zwalnia się sam — zwolnij przy odmontowaniu / zmianie.
  useEffect(() => {
    return () => {
      sound?.remove();
    };
  }, [sound]);

  const onStatus = (p: AudioPlayer) => (st: AudioStatus) => {
    if (!st.isLoaded) return;
    setPosition(Math.round((st.currentTime ?? 0) * 1000));
    if (st.duration) setDuration((d) => d || Math.round(st.duration * 1000));
    if (st.didJustFinish) {
      setIsPlaying(false);
      setPosition(0);
      p.pause();
      p.seekTo(0).catch(() => undefined);
      releaseMode();
    } else {
      setIsPlaying(st.playing);
    }
  };

  const toggle = async () => {
    if (loading) return;
    if (sound) {
      if (sound.playing) {
        sound.pause();
        setIsPlaying(false);
        releaseMode();
      } else {
        await holdMode().catch(() => undefined);
        sound.play();
        setIsPlaying(true);
      }
      return;
    }
    setLoading(true);
    try {
      await holdMode();
      const p = createAudioPlayer({ uri }, { updateInterval: 250 });
      p.addListener('playbackStatusUpdate', onStatus(p));
      p.play();
      setSound(p);
      setIsPlaying(true);
    } catch {
      releaseMode();
      Alert.alert('Nie udało się odtworzyć', 'Nie udało się odtworzyć nagrania. Sprawdź połączenie i spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: dark ? 0 : 12,
        borderRadius: 18,
        backgroundColor: dark ? 'transparent' : '#FFFFFF',
      }}
    >
      <Pressable
        onPress={toggle}
        hitSlop={6}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#FFBE0B',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {loading ? (
          <ActivityIndicator color="#2A2312" />
        ) : isPlaying ? (
          <Pause size={20} color="#2A2312" fill="#2A2312" />
        ) : (
          <Play size={20} color="#2A2312" fill="#2A2312" style={{ marginLeft: 2 }} />
        )}
      </Pressable>

      <View style={{ flex: 1 }}>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: dark ? 'rgba(246,244,238,0.18)' : '#ECE8DE',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${progress * 100}%`,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#FFBE0B',
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text
            style={{
              fontSize: 11,
              color: dark ? '#F6F4EE' : '#2A2312',
              fontFamily: 'Manrope_600SemiBold',
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatTime(position)}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: dark ? '#CFC8B6' : '#6B6557',
              fontFamily: 'Manrope_600SemiBold',
              fontVariant: ['tabular-nums'],
            }}
          >
            {duration > 0 ? formatTime(duration) : '--:--'}
          </Text>
        </View>
      </View>
    </View>
  );
};
