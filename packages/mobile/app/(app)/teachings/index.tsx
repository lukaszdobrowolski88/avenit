import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BookOpen, ChevronDown, FileText, Headphones, PlaySquare, Quote, Search, User, X } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useTeachings, type ProgramTeaching } from '../../../src/features/teachings/api';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { B, InfoBlock, Monogram } from '../../../src/components/ui/brand';

const SeriesChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-80"
    style={{
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: active ? '#2A2312' : '#ECE8DE',
      borderWidth: 1,
      borderColor: active ? '#2A2312' : '#ECE8DE',
    }}
  >
    <Text className="text-[13px]" style={{ color: active ? '#ffffff' : '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
      {label}
    </Text>
  </Pressable>
);

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
      <Text className="text-[12px]" style={{ color: tint, fontFamily: 'Manrope_700Bold' }}>
        {label}
      </Text>
    </Pressable>
  );
};

// Karta nauczania: blok daty (najnowsze — słód z kurkumą), musztardowy dzień tygodnia,
// tytuł i osoba nauczająca z monogramem.
const TeachingCard = ({ teaching, latest }: { teaching: ProgramTeaching; latest?: boolean }) => {
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <View className="mb-3" style={{ borderRadius: 24, backgroundColor: B.card, padding: 18 }}>
      <View>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 12 }}>
          <InfoBlock top={formatDate(teaching.date, 'd')} bottom={formatDate(teaching.date, 'LLL')} dark={latest} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: B.gold, fontFamily: 'Manrope_700Bold' }}>
              {latest ? 'Ostatnie · ' : ''}
              {formatDate(teaching.date, 'EEEE')}
            </Text>
            <Text style={{ fontSize: 19, lineHeight: 24, marginTop: 3, color: B.ink, letterSpacing: -0.5, fontFamily: 'Manrope_700Bold' }}>
              {teaching.title || 'Nauczanie'}
            </Text>
          </View>
        </View>
        {teaching.series ? (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: B.kurkumaSoft, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: B.goldDeep, fontFamily: 'Manrope_700Bold' }}>{teaching.series.name}</Text>
          </View>
        ) : null}

        {teaching.scripture ? (
          <View className="flex-row items-start gap-2 mb-2">
            <Quote size={14} color={B.gold} style={{ marginTop: 3 }} />
            <Text
              className="flex-1 text-[13px] italic"
              style={{ color: '#4A463E', fontFamily: 'Manrope_400Regular', lineHeight: 19 }}
            >
              {teaching.scripture}
            </Text>
          </View>
        ) : null}

        {teaching.mainPoint ? (
          <Text
            className="text-[13px] mb-2"
            style={{ color: '#2A2312', fontFamily: 'Manrope_400Regular', lineHeight: 20 }}
          >
            {teaching.mainPoint}
          </Text>
        ) : null}

        {teaching.speaker ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 2 }}>
            <Monogram name={teaching.speaker.name} size={30} />
            <Text style={{ fontSize: 14, color: B.ink, fontFamily: 'Manrope_600SemiBold' }}>{teaching.speaker.name}</Text>
          </View>
        ) : null}

        {(teaching.youtubeUrl || teaching.spotifyUrl || teaching.audioUrl) && (
          <View
            className="flex-row flex-wrap gap-1.5 pt-2"
            style={{ borderTopWidth: 1, borderTopColor: '#ECE8DE' }}
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
              tint="#6B4F05"
              bg="#FFF1C2"
            />
            <MediaButton
              Icon={Headphones}
              label="Audio"
              url={teaching.audioUrl}
              tint="#6B4F05"
              bg="#FFF1C2"
            />
          </View>
        )}

        {teaching.notes ? (
          <View className="pt-2 mt-1" style={{ borderTopWidth: 1, borderTopColor: '#ECE8DE' }}>
            <Pressable
              onPress={() => setNotesOpen((v) => !v)}
              className="flex-row items-center gap-1.5 active:opacity-70"
              style={{ paddingVertical: 4 }}
            >
              <FileText size={14} color="#2A2312" />
              <Text className="text-[13px]" style={{ color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                {notesOpen ? 'Ukryj notatki' : 'Pokaż notatki'}
              </Text>
              <ChevronDown
                size={15}
                color="#2A2312"
                style={{ transform: [{ rotate: notesOpen ? '180deg' : '0deg' }] }}
              />
            </Pressable>
            {notesOpen ? (
              <Text
                className="text-[14px] mt-1"
                style={{ color: '#2A2312', fontFamily: 'Manrope_400Regular', lineHeight: 21 }}
              >
                {teaching.notes}
              </Text>
            ) : null}
          </View>
        ) : null}
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

  const [search, setSearch] = useState('');
  const [series, setSeries] = useState<string | null>(null);

  const allSeries = useMemo(() => {
    const set = new Set<string>();
    for (const t of (data ?? []) as ProgramTeaching[]) if (t.series?.name) set.add(t.series.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  }, [data]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((data ?? []) as ProgramTeaching[]).filter((t) => {
      if (series && t.series?.name !== series) return false;
      if (!q) return true;
      const hay = `${t.title ?? ''} ${t.speaker?.name ?? ''} ${t.series?.name ?? ''} ${t.scripture ?? ''} ${t.mainPoint ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, series]);

  const hasFilters = !!search.trim() || series != null;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Nauczania" subtitle="Słowo z nabożeństw" Icon={BookOpen} showBack />

        {!isLoading && !isError && (data ?? []).length > 0 ? (
          <>
            <View className="px-4 pb-2">
              <View
                className="flex-row items-center gap-2 px-3"
                style={{
                  borderRadius: 24,
                  backgroundColor: '#FFFFFF',
                  height: 40,
                }}
              >
                <Search size={16} color="#857F70" />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_400Regular', paddingVertical: 0 }}
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
              <BookOpen size={28} color="#2A2312" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
            >
              Brak nauczań
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
            >
              Nauczania pojawią się po nabożeństwach.
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
                borderRadius: 24,
                backgroundColor: '#FFFFFF',
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
            {list.map((t: ProgramTeaching, i: number) => (
              <TeachingCard key={t.programId} teaching={t} latest={i === 0} />
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}
