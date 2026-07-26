import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { Pause, Play } from 'lucide-react-native';

// Odtwarzacz audio dla kazań — ten sam mechanizm expo-av co w messenger/AudioPlayer,
// ale w większym, „podcastowym" układzie (pasek postępu + czas).

interface Props {
  uri: string;
}

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export const SermonAudioPlayer = ({ uri }: Props) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync().catch(() => undefined);
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
      const { sound: s } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 250 },
      );
      s.setOnPlaybackStatusUpdate(onStatus);
      setSound(s);
      setIsPlaying(true);
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
        padding: 12,
        borderRadius: 18,
        backgroundColor: '#faf5ff',
        borderWidth: 1,
        borderColor: '#e9d5ff',
      }}
    >
      <Pressable
        onPress={toggle}
        hitSlop={6}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#7c3aed',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : isPlaying ? (
          <Pause size={20} color="#ffffff" fill="#ffffff" />
        ) : (
          <Play size={20} color="#ffffff" fill="#ffffff" />
        )}
      </Pressable>

      <View style={{ flex: 1 }}>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: '#e9d5ff',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${progress * 100}%`,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#7c3aed',
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text
            style={{
              fontSize: 11,
              color: '#6d28d9',
              fontFamily: 'Inter_600SemiBold',
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatTime(position)}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: '#a78bda',
              fontFamily: 'Inter_600SemiBold',
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
