import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Quote, User } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { SermonAudioPlayer } from '../../../src/features/sermons/components/SermonAudioPlayer';
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
          <Text style={{ color: '#7A7466', fontFamily: 'Manrope_500Medium' }}>
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
          {sermon.sermon_date ? (
            <Text
              className="text-[11px] uppercase mb-1"
              style={{ color: '#7A7466', letterSpacing: 0.4, fontFamily: 'Manrope_600SemiBold' }}
            >
              {formatDate(sermon.sermon_date, 'EEEE, d MMM yyyy')}
            </Text>
          ) : null}

          <Text
            className="text-[24px] mb-2"
            style={{ color: '#2A2312', letterSpacing: -0.6, fontFamily: 'Manrope_700Bold' }}
          >
            {sermon.title || 'Kazanie'}
          </Text>

          {sermon.speaker ? (
            <View className="flex-row items-center gap-2 mb-3">
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#f3e8ff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User size={14} color="#7c3aed" />
              </View>
              <Text
                className="text-[14px]"
                style={{ color: '#4A463E', fontFamily: 'Manrope_500Medium' }}
              >
                {sermon.speaker}
              </Text>
            </View>
          ) : null}

          {sermon.scripture_ref ? (
            <View
              className="flex-row items-start gap-2 mb-4 p-3"
              style={{ borderRadius: 14, backgroundColor: '#ECE8DE' }}
            >
              <Quote size={16} color="#A8A59E" style={{ marginTop: 2 }} />
              <Text
                className="flex-1 text-[14px] italic"
                style={{ color: '#3A3427', fontFamily: 'Manrope_500Medium', lineHeight: 20 }}
              >
                {sermon.scripture_ref}
              </Text>
            </View>
          ) : null}

          {sermon.audio_url ? (
            <View className="mb-3">
              <SermonAudioPlayer uri={sermon.audio_url} />
            </View>
          ) : null}

          {sermon.video_url ? <SermonVideo url={sermon.video_url} /> : null}

          {sermon.description ? (
            <Text
              className="text-[14px] mb-4"
              style={{ color: '#2A2312', fontFamily: 'Manrope_400Regular', lineHeight: 22 }}
            >
              {sermon.description}
            </Text>
          ) : null}

          {sermon.notes ? (
            <View
              className="p-4"
              style={{ borderRadius: 16, borderWidth: 1, borderColor: '#E6E1D5' }}
            >
              <Text
                className="text-[11px] uppercase mb-2"
                style={{ color: '#7A7466', letterSpacing: 0.6, fontFamily: 'Manrope_700Bold' }}
              >
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
              style={{ color: '#A8A59E', fontFamily: 'Manrope_400Regular' }}
            >
              Brak dostępnego nagrania dla tego kazania.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
