import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Headphones, Podcast, PlaySquare, Quote, User } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useSermons, type Sermon } from '../../../src/features/sermons/api';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';

const SermonCard = ({ sermon, onPress }: { sermon: Sermon; onPress: () => void }) => {
  return (
    <Pressable
      onPress={onPress}
      className="mb-3 active:opacity-90"
      style={{
        borderRadius: 20,
        backgroundColor: '#ffffff',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 2,
      }}
    >
      <View
        className="overflow-hidden p-4"
        style={{ borderRadius: 20, borderWidth: 1, borderColor: '#eef0f3' }}
      >
        <View className="flex-row items-center justify-between">
          {sermon.sermon_date ? (
            <Text
              className="text-[11px] uppercase"
              style={{ color: '#78716c', letterSpacing: 0.4, fontFamily: 'Inter_600SemiBold' }}
            >
              {formatDate(sermon.sermon_date, 'd MMM yyyy')}
            </Text>
          ) : (
            <View />
          )}
          <ChevronRight size={18} color="#a8a29e" />
        </View>

        {sermon.series ? (
          <View
            className="self-start px-2 py-0.5 mt-1 mb-1"
            style={{ borderRadius: 999, backgroundColor: '#f3e8ff' }}
          >
            <Text className="text-[11px]" style={{ color: '#7c3aed', fontFamily: 'Inter_700Bold' }}>
              {sermon.series}
            </Text>
          </View>
        ) : null}

        <Text
          className="text-[18px] mt-1"
          style={{ color: '#0c0a09', letterSpacing: -0.4, fontFamily: 'Inter_700Bold' }}
        >
          {sermon.title || 'Kazanie'}
        </Text>

        {sermon.scripture_ref ? (
          <View className="flex-row items-center gap-1.5 mt-1.5">
            <Quote size={13} color="#a8a29e" />
            <Text
              className="text-[13px] italic"
              style={{ color: '#57534e', fontFamily: 'Inter_400Regular' }}
            >
              {sermon.scripture_ref}
            </Text>
          </View>
        ) : null}

        <View className="flex-row items-center justify-between mt-3">
          {sermon.speaker ? (
            <View className="flex-row items-center gap-2">
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#f3e8ff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User size={12} color="#7c3aed" />
              </View>
              <Text
                className="text-[13px]"
                style={{ color: '#57534e', fontFamily: 'Inter_500Medium' }}
              >
                {sermon.speaker}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <View className="flex-row items-center gap-2">
            {sermon.audio_url ? <Headphones size={16} color="#0891b2" /> : null}
            {sermon.video_url ? <PlaySquare size={16} color="#dc2626" /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

export default function SermonsScreen() {
  const router = useRouter();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, isError, error, refetch, isRefetching } = useSermons({
    selectedCampusId,
    withCampusFilter,
  });

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader title="Kazania" subtitle="Posłuchaj Słowa" Icon={Podcast} showBack />

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Inter_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (data ?? []).length === 0 ? (
          <ScrollView
            contentContainerStyle={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
            }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#f3e8ff',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Podcast size={28} color="#7c3aed" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
            >
              Brak kazań
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
            >
              Opublikowane kazania pojawią się tutaj.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            {data!.map((s: any) => (
              <SermonCard
                key={s.id}
                sermon={s}
                onPress={() =>
                  router.push({ pathname: '/(app)/sermons/[id]', params: { id: s.id } })
                }
              />
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}
