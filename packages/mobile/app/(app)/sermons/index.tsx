import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Headphones, Podcast, PlaySquare, Quote, Search, User, X } from 'lucide-react-native';
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
        backgroundColor: '#F6F4EE',
        shadowColor: '#2A2312',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 2,
      }}
    >
      <View
        className="overflow-hidden p-4"
        style={{ borderRadius: 20, borderWidth: 1, borderColor: '#E6E1D5' }}
      >
        <View className="flex-row items-center justify-between">
          {sermon.sermon_date ? (
            <Text
              className="text-[11px] uppercase"
              style={{ color: '#6B6557', letterSpacing: 0.4, fontFamily: 'Manrope_600SemiBold' }}
            >
              {formatDate(sermon.sermon_date, 'd MMM yyyy')}
            </Text>
          ) : (
            <View />
          )}
          <ChevronRight size={18} color="#857F70" />
        </View>

        {sermon.series ? (
          <View
            className="self-start px-2 py-0.5 mt-1 mb-1"
            style={{ borderRadius: 999, backgroundColor: '#ECE8DE' }}
          >
            <Text className="text-[11px]" style={{ color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
              {sermon.series}
            </Text>
          </View>
        ) : null}

        <Text
          className="text-[18px] mt-1"
          style={{ color: '#2A2312', letterSpacing: -0.4, fontFamily: 'Manrope_700Bold' }}
        >
          {sermon.title || 'Kazanie'}
        </Text>

        {sermon.scripture_ref ? (
          <View className="flex-row items-center gap-1.5 mt-1.5">
            <Quote size={13} color="#857F70" />
            <Text
              className="text-[13px] italic"
              style={{ color: '#4A463E', fontFamily: 'Manrope_400Regular' }}
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
                  backgroundColor: '#ECE8DE',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User size={12} color="#2A2312" />
              </View>
              <Text
                className="text-[13px]"
                style={{ color: '#4A463E', fontFamily: 'Manrope_500Medium' }}
              >
                {sermon.speaker}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <View className="flex-row items-center gap-2">
            {sermon.audio_url ? <Headphones size={16} color="#2A2312" /> : null}
            {sermon.video_url ? <PlaySquare size={16} color="#dc2626" /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const SeriesChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-80"
    style={{
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: active ? '#2A2312' : '#F1EEE6',
      borderWidth: 1,
      borderColor: active ? '#2A2312' : '#ECE8DE',
    }}
  >
    <Text className="text-[13px]" style={{ color: active ? '#ffffff' : '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
      {label}
    </Text>
  </Pressable>
);

export default function SermonsScreen() {
  const router = useRouter();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, isError, error, refetch, isRefetching } = useSermons({
    selectedCampusId,
    withCampusFilter,
  });

  const [search, setSearch] = useState('');
  const [series, setSeries] = useState<string | null>(null);

  const allSeries = useMemo(() => {
    const set = new Set<string>();
    for (const s of (data ?? []) as Sermon[]) if (s.series) set.add(s.series);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  }, [data]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((data ?? []) as Sermon[]).filter((s) => {
      if (series && s.series !== series) return false;
      if (!q) return true;
      const hay = `${s.title ?? ''} ${s.speaker ?? ''} ${s.scripture_ref ?? ''} ${s.series ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, series]);

  const hasFilters = !!search.trim() || series != null;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Kazania" subtitle="Posłuchaj Słowa" Icon={Podcast} showBack />

        {!isLoading && !isError && (data ?? []).length > 0 ? (
          <>
            <View className="px-4 pb-2">
              <View
                className="flex-row items-center gap-2 px-3"
                style={{
                  borderRadius: 999,
                  backgroundColor: '#F1EEE6',
                  borderWidth: 1,
                  borderColor: '#E6E1D5',
                  height: 40,
                }}
              >
                <Search size={16} color="#857F70" />
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: '#2A2312',
                    fontFamily: 'Manrope_400Regular',
                    paddingVertical: 0,
                  }}
                  placeholder="Szukaj: tytuł, mówca, werset…"
                  placeholderTextColor="#857F70"
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
                {search.length > 0 ? (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <X size={15} color="#857F70" />
                  </Pressable>
                ) : null}
              </View>
            </View>
            {allSeries.length > 0 ? (
              <View style={{ maxHeight: 44 }} className="pb-2">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
                >
                  <SeriesChip label="Wszystkie" active={series === null} onPress={() => setSeries(null)} />
                  {allSeries.map((s) => (
                    <SeriesChip key={s} label={s} active={series === s} onPress={() => setSeries(s)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        ) : null}

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Manrope_500Medium' }}
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
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#ECE8DE',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Podcast size={28} color="#2A2312" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
            >
              Brak kazań
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
            >
              Opublikowane kazania pojawią się tutaj.
            </Text>
          </ScrollView>
        ) : list.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#ECE8DE',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Search size={26} color="#2A2312" />
            </View>
            <Text className="text-[16px]" style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
              Brak wyników
            </Text>
            <Text className="text-[13px] text-center mt-1" style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}>
              Zmień wyszukiwanie lub wybraną serię.
            </Text>
            {hasFilters ? (
              <Pressable
                onPress={() => {
                  setSearch('');
                  setSeries(null);
                }}
                style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: '#ECE8DE' }}
              >
                <Text style={{ fontSize: 13, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Wyczyść filtry</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
            {list.map((s: Sermon) => (
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
