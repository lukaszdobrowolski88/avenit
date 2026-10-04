import { useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarPlus, ChevronLeft } from 'lucide-react-native';
import { useSongDetail } from '../../../src/features/songs/api';
import { TransposeControl } from '../../../src/features/songs/components/TransposeControl';
import { LyricsView } from '../../../src/features/songs/components/LyricsView';
import { AddSongToProgramModal } from '../../../src/features/songs/components/AddSongToProgramModal';
import { useAuthSession } from '../../../src/lib/auth';
import { goBack } from '../../../src/lib/navigation';

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const { data: song, isLoading, isError, error } = useSongDetail(id ?? '');
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [addToProgramVisible, setAddToProgramVisible] = useState(false);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F6F4EE',
        }}
      >
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }
  if (isError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F6F4EE',
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            textAlign: 'center',
            color: '#e11d48',
            fontFamily: 'Manrope_500Medium',
          }}
        >
          {(error as Error)?.message ?? 'Błąd'}
        </Text>
      </View>
    );
  }
  if (!song) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F6F4EE',
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
          Pieśń nie istnieje.
        </Text>
      </View>
    );
  }

  const fromKey = song.key ?? 'C';
  const currentKey = targetKey ?? fromKey;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: insets.top + 6,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => goBack(router)}
            hitSlop={10}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color="#2A2312" strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                color: '#6B6557',
                fontFamily: 'Manrope_500Medium',
                letterSpacing: -0.1,
              }}
            >
              Pieśń
              {song.tempo ? `  ·  ${song.tempo} BPM` : ''}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 27,
                color: '#2A2312',
                marginTop: 2,
                letterSpacing: -0.9,
                fontFamily: 'Manrope_700Bold',
              }}
            >
              {song.title}
            </Text>
          </View>
          <Pressable
            onPress={() => setAddToProgramVisible(true)}
            hitSlop={10}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#2A2312',
              shadowColor: '#2A2312',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <CalendarPlus size={16} color="#ffffff" strokeWidth={2.4} />
            <Text
              style={{
                fontSize: 12,
                color: '#ffffff',
                fontFamily: 'Manrope_700Bold',
                letterSpacing: -0.1,
              }}
            >
              Do programu
            </Text>
          </Pressable>
        </View>

        <TransposeControl value={currentKey} onChange={setTargetKey} originalKey={fromKey} />

        {song.lyrics ? (
          <LyricsView lyrics={song.lyrics} fromKey={fromKey} toKey={currentKey} />
        ) : (
          <Text
            style={{
              paddingHorizontal: 16,
              paddingVertical: 32,
              textAlign: 'center',
              color: '#6B6557',
              fontFamily: 'Manrope_500Medium',
            }}
          >
            Brak tekstu.
          </Text>
        )}
      </ScrollView>

      <AddSongToProgramModal
        visible={addToProgramVisible}
        onClose={() => setAddToProgramVisible(false)}
        song={song}
        myEmail={user?.email ?? null}
      />
    </>
  );
}
