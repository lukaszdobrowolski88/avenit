import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PlaySquare, Quote, User } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { SermonAudioPlayer } from '../../../src/features/sermons/components/SermonAudioPlayer';
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
          backgroundColor: '#ffffff',
        }}
      >
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader title="Kazanie" showBack />
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-center"
            style={{ color: '#e11d48', fontFamily: 'Inter_500Medium' }}
          >
            {(error as Error)?.message ?? 'Błąd'}
          </Text>
        </View>
      </View>
    );
  }

  if (!sermon) {
    return (
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader title="Kazanie" showBack />
        <View className="flex-1 items-center justify-center px-6">
          <Text style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}>
            Kazanie nie istnieje.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader title="Kazanie" subtitle={sermon.series ?? undefined} showBack />

        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}>
          {sermon.sermon_date ? (
            <Text
              className="text-[11px] uppercase mb-1"
              style={{ color: '#78716c', letterSpacing: 0.4, fontFamily: 'Inter_600SemiBold' }}
            >
              {formatDate(sermon.sermon_date, 'EEEE, d MMM yyyy')}
            </Text>
          ) : null}

          <Text
            className="text-[24px] mb-2"
            style={{ color: '#0c0a09', letterSpacing: -0.6, fontFamily: 'Inter_700Bold' }}
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
                style={{ color: '#57534e', fontFamily: 'Inter_500Medium' }}
              >
                {sermon.speaker}
              </Text>
            </View>
          ) : null}

          {sermon.scripture_ref ? (
            <View
              className="flex-row items-start gap-2 mb-4 p-3"
              style={{ borderRadius: 14, backgroundColor: '#f5f5f4' }}
            >
              <Quote size={16} color="#a8a29e" style={{ marginTop: 2 }} />
              <Text
                className="flex-1 text-[14px] italic"
                style={{ color: '#44403c', fontFamily: 'Inter_500Medium', lineHeight: 20 }}
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

          {sermon.video_url ? (
            <Pressable
              onPress={() => Linking.openURL(sermon.video_url!)}
              className="flex-row items-center justify-center gap-2 mb-4 active:opacity-80"
              style={{
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: '#fee2e2',
              }}
            >
              <PlaySquare size={18} color="#dc2626" />
              <Text className="text-[14px]" style={{ color: '#dc2626', fontFamily: 'Inter_700Bold' }}>
                Obejrzyj wideo
              </Text>
            </Pressable>
          ) : null}

          {sermon.description ? (
            <Text
              className="text-[14px] mb-4"
              style={{ color: '#1c1917', fontFamily: 'Inter_400Regular', lineHeight: 22 }}
            >
              {sermon.description}
            </Text>
          ) : null}

          {sermon.notes ? (
            <View
              className="p-4"
              style={{ borderRadius: 16, borderWidth: 1, borderColor: '#eef0f3' }}
            >
              <Text
                className="text-[11px] uppercase mb-2"
                style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}
              >
                Notatki
              </Text>
              <Text
                className="text-[14px]"
                style={{ color: '#44403c', fontFamily: 'Inter_400Regular', lineHeight: 22 }}
              >
                {sermon.notes}
              </Text>
            </View>
          ) : null}

          {!sermon.audio_url && !sermon.video_url ? (
            <Text
              className="text-[13px] text-center mt-2"
              style={{ color: '#a8a29e', fontFamily: 'Inter_400Regular' }}
            >
              Brak dostępnego nagrania dla tego kazania.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
