import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { BookOpen, Headphones, PlaySquare, Quote, User } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useTeachings, type ProgramTeaching } from '../../../src/features/teachings/api';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';

const MediaButton = ({
  Icon,
  label,
  url,
  tint,
  bg,
}: {
  Icon: typeof PlaySquare;
  label: string;
  url: string | null;
  tint: string;
  bg: string;
}) => {
  if (!url) return null;
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      className="flex-row items-center gap-1.5 active:opacity-80"
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Icon size={13} color={tint} />
      <Text className="text-[12px]" style={{ color: tint, fontFamily: 'Inter_700Bold' }}>
        {label}
      </Text>
    </Pressable>
  );
};

const TeachingCard = ({ teaching }: { teaching: ProgramTeaching }) => {
  return (
    <View
      className="mb-3"
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
        <Text
          className="text-[11px] uppercase mb-1"
          style={{ color: '#78716c', letterSpacing: 0.4, fontFamily: 'Inter_600SemiBold' }}
        >
          {formatDate(teaching.date, 'EEEE, d MMM yyyy')}
        </Text>
        {teaching.series ? (
          <View
            className="self-start px-2 py-0.5 mb-2"
            style={{ borderRadius: 999, backgroundColor: '#f3e8ff' }}
          >
            <Text
              className="text-[11px]"
              style={{ color: '#7c3aed', fontFamily: 'Inter_700Bold' }}
            >
              {teaching.series.name}
            </Text>
          </View>
        ) : null}
        <Text
          className="text-[18px] mb-2"
          style={{ color: '#0c0a09', letterSpacing: -0.4, fontFamily: 'Inter_700Bold' }}
        >
          {teaching.title || 'Nauczanie'}
        </Text>

        {teaching.scripture ? (
          <View className="flex-row items-start gap-2 mb-2">
            <Quote size={14} color="#a8a29e" style={{ marginTop: 3 }} />
            <Text
              className="flex-1 text-[13px] italic"
              style={{ color: '#57534e', fontFamily: 'Inter_400Regular', lineHeight: 19 }}
            >
              {teaching.scripture}
            </Text>
          </View>
        ) : null}

        {teaching.mainPoint ? (
          <Text
            className="text-[13px] mb-2"
            style={{ color: '#1c1917', fontFamily: 'Inter_400Regular', lineHeight: 20 }}
          >
            {teaching.mainPoint}
          </Text>
        ) : null}

        {teaching.speaker ? (
          <View className="flex-row items-center gap-2 mb-3">
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
              {teaching.speaker.name}
            </Text>
          </View>
        ) : null}

        {(teaching.youtubeUrl || teaching.spotifyUrl || teaching.audioUrl) && (
          <View
            className="flex-row flex-wrap gap-1.5 pt-2"
            style={{ borderTopWidth: 1, borderTopColor: '#f5f5f4' }}
          >
            <MediaButton
              Icon={PlaySquare}
              label="YouTube"
              url={teaching.youtubeUrl}
              tint="#dc2626"
              bg="#fee2e2"
            />
            <MediaButton
              Icon={Headphones}
              label="Spotify"
              url={teaching.spotifyUrl}
              tint="#16a34a"
              bg="#dcfce7"
            />
            <MediaButton
              Icon={Headphones}
              label="Audio"
              url={teaching.audioUrl}
              tint="#0891b2"
              bg="#cffafe"
            />
          </View>
        )}
      </View>
    </View>
  );
};

export default function TeachingsScreen() {
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, isError, error, refetch, isRefetching } = useTeachings({
    selectedCampusId,
    withCampusFilter,
  });

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader title="Nauczania" subtitle="Słowo z nabożeństw" Icon={BookOpen} showBack />

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
              <BookOpen size={28} color="#7c3aed" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
            >
              Brak nauczań
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
            >
              Nauczania pojawią się po nabożeństwach.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            {data!.map((t) => (
              <TeachingCard key={t.programId} teaching={t} />
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}
