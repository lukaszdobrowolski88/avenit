import { useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarPlus, ChevronLeft } from 'lucide-react-native';
import { useSongDetail } from '../../../src/features/songs/api';
import { TransposeControl } from '../../../src/features/songs/components/TransposeControl';
import { LyricsView } from '../../../src/features/songs/components/LyricsView';
import { AddSongToProgramModal } from '../../../src/features/songs/components/AddSongToProgramModal';
import { useAuthSession } from '../../../src/lib/auth';

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
          backgroundColor: '#ffffff',
        }}
      >
        <ActivityIndicator color="#ec4899" />
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
          backgroundColor: '#ffffff',
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            textAlign: 'center',
            color: '#e11d48',
            fontFamily: 'Inter_500Medium',
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
          backgroundColor: '#ffffff',
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}>
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
      <ScrollView style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 48,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#e7e5e4',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color="#1c1917" strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                color: '#78716c',
                fontFamily: 'Inter_500Medium',
                letterSpacing: -0.1,
              }}
            >
              Pieśń
              {song.tempo ? `  ·  ${song.tempo} BPM` : ''}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 24,
                color: '#0c0a09',
                marginTop: 2,
                letterSpacing: -0.6,
                fontFamily: 'Inter_700Bold',
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
              backgroundColor: '#ec4899',
              shadowColor: '#ec4899',
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
                fontFamily: 'Inter_700Bold',
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
              color: '#78716c',
              fontFamily: 'Inter_500Medium',
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
