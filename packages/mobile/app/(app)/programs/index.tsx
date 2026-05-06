import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { Calendar as CalendarIcon, ChevronRight } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { CampusBadge, useCampusBadge } from '../../../src/components/CampusBadge';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  useUpcomingPrograms,
  useProgramTypes,
  type ProgramListItem,
  type ProgramTypeRow,
} from '../../../src/features/programs/api';

const fallbackTitle = (title: string | null, typeName?: string | null): string => {
  if (title && title.trim()) return title;
  if (typeName && typeName.trim()) return typeName;
  return 'Nabożeństwo';
};

const itemsLabel = (count: number) =>
  `${count} ${count === 1 ? 'element' : count > 1 && count < 5 ? 'elementy' : 'elementów'}`;

const ProgramCard = ({ program }: { program: ProgramListItem }) => {
  const { getCampus } = useCampusBadge();
  const accent = program.type?.color || '#ec4899';
  const title = fallbackTitle(program.title, program.type?.name);
  const itemsCount = Array.isArray(program.schedule) ? program.schedule.length : 0;
  const programCampus = getCampus(program.campus_id ?? null);
  return (
    <Link href={{ pathname: '/(app)/programs/[id]', params: { id: String(program.id) } }} asChild>
      <Pressable
        className="mx-4 mb-2.5 active:opacity-80"
        style={{
          borderRadius: 16,
          backgroundColor: '#ffffff',
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 1,
        }}
      >
        <View
          className="flex-row items-center gap-3 p-3.5"
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#eef0f3',
          }}
        >
          <View
            style={{
              width: 4,
              alignSelf: 'stretch',
              borderRadius: 2,
              backgroundColor: accent,
            }}
          />
          <View className="flex-1">
            <Text
              className="text-[11px] uppercase"
              style={{
                color: '#78716c',
                letterSpacing: 0.4,
                fontFamily: 'Inter_600SemiBold',
              }}
            >
              {formatDate(program.date, 'EEEE, d MMM')}
            </Text>
            <Text
              className="text-[15px] mt-0.5"
              style={{
                color: '#0c0a09',
                letterSpacing: -0.3,
                fontFamily: 'Inter_600SemiBold',
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              <Text className="text-[12px]" style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}>
                {itemsLabel(itemsCount)}
              </Text>
              {programCampus ? <CampusBadge campus={programCampus} /> : null}
            </View>
          </View>
          <ChevronRight size={18} color="#a8a29e" strokeWidth={2.2} />
        </View>
      </Pressable>
    </Link>
  );
};

const TypeSection = ({
  type,
  programs,
}: {
  type: ProgramTypeRow | null;
  programs: ProgramListItem[];
}) => {
  if (programs.length === 0) return null;
  const color = type?.color || '#a8a29e';
  const name = type?.name || 'Inne';
  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-2 px-5 mb-2">
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text
          className="text-[12px] uppercase flex-1"
          style={{
            color: '#57534e',
            letterSpacing: 0.6,
            fontFamily: 'Inter_700Bold',
          }}
        >
          {name}
        </Text>
        <Text className="text-[11px]" style={{ color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>
          {programs.length}
        </Text>
      </View>
      {programs.map((p) => (
        <ProgramCard key={p.id} program={p} />
      ))}
    </View>
  );
};

export default function ProgramsScreen() {
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const programsQuery = useUpcomingPrograms({ selectedCampusId, withCampusFilter });
  const typesQuery = useProgramTypes();

  const grouped = useMemo(() => {
    const all = programsQuery.data ?? [];
    const types = typesQuery.data ?? [];
    const byType = new Map<number | null, ProgramListItem[]>();
    for (const p of all) {
      const key = p.type_id ?? null;
      const arr = byType.get(key) ?? [];
      arr.push(p);
      byType.set(key, arr);
    }
    const sections: { type: ProgramTypeRow | null; programs: ProgramListItem[] }[] = [];
    for (const t of types) {
      const list = byType.get(t.id);
      if (list && list.length > 0) sections.push({ type: t, programs: list });
    }
    const unassigned = byType.get(null);
    if (unassigned && unassigned.length > 0) {
      sections.push({ type: null, programs: unassigned });
    }
    return sections;
  }, [programsQuery.data, typesQuery.data]);

  if (programsQuery.isLoading || typesQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#ffffff' }}>
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  if (programsQuery.isError) {
    return (
      <View
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: '#ffffff' }}
      >
        <Text className="text-center" style={{ color: '#e11d48', fontFamily: 'Inter_500Medium' }}>
          {(programsQuery.error as Error)?.message ?? 'Błąd'}
        </Text>
        <Pressable
          onPress={() => programsQuery.refetch()}
          className="active:opacity-80"
          style={{
            marginTop: 16,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: '#ec4899',
          }}
        >
          <Text style={{ color: 'white', fontFamily: 'Inter_600SemiBold' }}>Spróbuj ponownie</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: '#ffffff' }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={programsQuery.isRefetching}
            onRefresh={programsQuery.refetch}
            tintColor="#ec4899"
            progressViewOffset={40}
          />
        }
      >
        <PageHeader title="Programy" subtitle="Nadchodzące nabożeństwa" Icon={CalendarIcon} />
        {grouped.length === 0 ? (
          <View className="items-center px-8 py-16">
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#fef3f2',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <CalendarIcon size={28} color="#ec4899" />
            </View>
            <Text className="text-[16px]" style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
              Brak nadchodzących programów
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
            >
              Pociągnij w dół, aby odświeżyć.
            </Text>
          </View>
        ) : (
          grouped.map(({ type, programs }) => (
            <TypeSection key={type?.id ?? 'unassigned'} type={type} programs={programs} />
          ))
        )}
      </ScrollView>
    </>
  );
}
