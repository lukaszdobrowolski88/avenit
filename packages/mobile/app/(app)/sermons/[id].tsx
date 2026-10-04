import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { SermonAudioPlayer } from '../../../src/features/sermons/components/SermonAudioPlayer';
import { B, Monogram } from '../../../src/components/ui/brand';
import { SermonVideo } from '../../../src/features/sermons/components/SermonVideo';
import { useSermon } from '../../../src/features/sermons/api';

export default function SermonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: sermon, isLoading, isError, error } = useSermon(id ?? '');

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
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Kazanie" showBack />
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-center"
            style={{ color: '#e11d48', fontFamily: 'Manrope_500Medium' }}
          >
            {(error as Error)?.message ?? 'Błąd'}
          </Text>
        </View>
      </View>
    );
  }

  if (!sermon) {
    return (
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Kazanie" showBack />
        <View className="flex-1 items-center justify-center px-6">
          <Text style={{ color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
            Kazanie nie istnieje.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Kazanie" subtitle={sermon.series ?? undefined} showBack />

        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}>
          {/* Karta jak plakat marki: kurkumowa data, tytuł pogrubiony + werset cienkim krojem,
              mówca i odtwarzanie na ciemnym tle (słód). */}
          <View style={{ borderRadius: 28, backgroundColor: B.ink, padding: 22, marginBottom: 16 }}>
            {sermon.sermon_date ? (
              <Text style={{ fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.kurkuma, fontFamily: 'Manrope_700Bold' }}>
                {formatDate(sermon.sermon_date, 'EEEE, d MMM yyyy')}
              </Text>
            ) : null}
            <Text style={{ fontSize: 28, lineHeight: 33, marginTop: 10, color: B.onDark, letterSpacing: -1, fontFamily: 'Manrope_700Bold' }}>
              {sermon.title || 'Kazanie'}
            </Text>
            {sermon.scripture_ref ? (
              <Text style={{ fontSize: 24, lineHeight: 30, color: B.onDark, letterSpacing: -0.8, fontFamily: 'Manrope_300Light' }}>
                {sermon.scripture_ref}
                <Text style={{ color: B.kurkuma, fontFamily: 'Manrope_700Bold' }}>.</Text>
              </Text>
            ) : null}
            {sermon.speaker ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}>
                <Monogram name={sermon.speaker} size={32} onDark />
                <Text style={{ fontSize: 14, color: B.onDark, fontFamily: 'Manrope_600SemiBold' }}>{sermon.speaker}</Text>
              </View>
            ) : null}
            {sermon.audio_url ? (
              <View style={{ marginTop: 20 }}>
                <SermonAudioPlayer uri={sermon.audio_url} dark />
              </View>
            ) : null}
          </View>

          {sermon.video_url ? <SermonVideo url={sermon.video_url} /> : null}

          {sermon.description ? (
            <Text style={{ fontSize: 15, lineHeight: 24, marginBottom: 16, paddingHorizontal: 4, color: B.ink2, fontFamily: 'Manrope_400Regular' }}>
              {sermon.description}
            </Text>
          ) : null}

          {sermon.notes ? (
            <View style={{ borderRadius: 22, backgroundColor: B.card, padding: 18 }}>
              <Text style={{ fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, marginBottom: 8, fontFamily: 'Manrope_700Bold' }}>
                Notatki
              </Text>
              <Text
                className="text-[14px]"
                style={{ color: '#3A3427', fontFamily: 'Manrope_400Regular', lineHeight: 22 }}
              >
                {sermon.notes}
              </Text>
            </View>
          ) : null}

          {!sermon.audio_url && !sermon.video_url ? (
            <Text
              className="text-[13px] text-center mt-2"
              style={{ color: '#857F70', fontFamily: 'Manrope_400Regular' }}
            >
              Brak dostępnego nagrania dla tego kazania.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
