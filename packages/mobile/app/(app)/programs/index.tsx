import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Calendar as CalendarIcon, ChevronRight, Link2, Plus } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { CampusBadge, useCampusBadge } from '../../../src/components/CampusBadge';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  usePastPrograms,
  useProgramEventLinks,
  useUpcomingPrograms,
  useProgramTypes,
  type LinkedEvent,
  type ProgramListItem,
  type ProgramTypeRow,
} from '../../../src/features/programs/api';
import { ProgramFormModal } from '../../../src/features/programs/components/ProgramFormModal';
import { ProgramTypesSheet } from '../../../src/features/programs/components/ProgramTypesSheet';
import { usePermissions } from '../../../src/lib/permissions';
import { useAuthSession } from '../../../src/lib/auth';
import { toYmd } from '../../../src/components/ui/DateField';
import { friendlyError } from '../../../src/lib/errors';

const fallbackTitle = (title: string | null, typeName?: string | null): string => {
  if (title && title.trim()) return title;
  if (typeName && typeName.trim()) return typeName;
  return 'Nabożeństwo';
};

const itemsLabel = (count: number) =>
  `${count} ${count === 1 ? 'element' : count > 1 && count < 5 ? 'elementy' : 'elementów'}`;

const ProgramCard = ({ program, events }: { program: ProgramListItem; events: LinkedEvent[] }) => {
  const { getCampus } = useCampusBadge();
  const accent = program.type?.color || '#8A6606';
  const title = fallbackTitle(program.title, program.type?.name);
  const itemsCount = Array.isArray(program.schedule) ? program.schedule.length : 0;
  const programCampus = getCampus(program.campus_id ?? null);
  return (
    <Link push href={{ pathname: '/(app)/programs/[id]', params: { id: String(program.id) } }} asChild>
      <Pressable
        className="mx-4 mb-2.5 active:opacity-80"
        style={{
          borderRadius: 16,
          backgroundColor: '#FFFFFF',
        }}
      >
        <View
          className="flex-row items-center gap-3 p-3.5"
          style={{
            borderRadius: 16,
          }}
        >
          <View className="flex-1">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Kolor typu nabożeństwa — kropka zamiast paska-akcentu. */}
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
              <Text
                className="text-[11px] uppercase"
                style={{
                  color: '#8A6606',
                  letterSpacing: 0.4,
                  fontFamily: 'Manrope_600SemiBold',
                }}
              >
                {formatDate(program.date, 'EEEE, d MMM')}
              </Text>
            </View>
            <Text
              className="text-[15px] mt-0.5"
              style={{
                color: '#2A2312',
                letterSpacing: -0.3,
                fontFamily: 'Manrope_600SemiBold',
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              <Text className="text-[12px]" style={{ color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
                {itemsLabel(itemsCount)}
              </Text>
              {programCampus ? <CampusBadge campus={programCampus} /> : null}
            </View>
            {events.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <Link2 size={12} color="#8A6606" />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: '#8A6606', fontFamily: 'Manrope_600SemiBold' }}>
                  {events.map((e) => e.title).join(', ')}
                </Text>
              </View>
            ) : null}
          </View>
          <ChevronRight size={18} color="#6E685A" strokeWidth={2.2} />
        </View>
      </Pressable>
    </Link>
  );
};

const TypeSection = ({
  type,
  programs,
  eventsByProgram,
}: {
  type: ProgramTypeRow | null;
  programs: ProgramListItem[];
  eventsByProgram: Map<number, LinkedEvent[]>;
}) => {
  if (programs.length === 0) return null;
  const color = type?.color || '#6E685A';
  const name = type?.name || 'Bez kategorii';
  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-2 px-5 mb-2">
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text
          className="text-[12px] uppercase flex-1"
          style={{
            color: '#8A6606',
            letterSpacing: 0.6,
            fontFamily: 'Manrope_700Bold',
          }}
        >
          {name}
        </Text>
        <Text className="text-[11px]" style={{ color: '#6E685A', fontFamily: 'Manrope_500Medium' }}>
          {programs.length}
        </Text>
      </View>
      {programs.map((p) => (
        <ProgramCard key={p.id} program={p} events={eventsByProgram.get(p.id) ?? []} />
      ))}
    </View>
  );
};

type Scope = 'upcoming' | 'past';

export default function ProgramsScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const perms = usePermissions();
  const canCreate = perms.can('res:programs:create');
  const [scope, setScope] = useState<Scope>('upcoming');
  const [creating, setCreating] = useState(false);
  const [managingTypes, setManagingTypes] = useState(false);
  const canManageTypes = perms.can('res:program_types:update') || perms.can('res:program_types:create');
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const upcomingQuery = useUpcomingPrograms({ selectedCampusId, withCampusFilter });
  const pastQuery = usePastPrograms({ selectedCampusId, withCampusFilter }, scope === 'past');
  const programsQuery = scope === 'upcoming' ? upcomingQuery : pastQuery;
  const typesQuery = useProgramTypes();
  const links = useProgramEventLinks();
  const eventsByProgram = useMemo(() => {
    const m = new Map<number, LinkedEvent[]>();
    for (const e of (links.data ?? []) as LinkedEvent[]) m.set(e.programId, [...(m.get(e.programId) ?? []), e]);
    return m;
  }, [links.data]);

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

  if (programsQuery.isError) {
    return (
      <View
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: '#F6F4EE' }}
      >
        <Text className="text-center" style={{ color: '#e11d48', fontFamily: 'Manrope_500Medium' }}>
          {friendlyError(programsQuery.error, 'Nie udało się wczytać programów.')}
        </Text>
        <Pressable
          onPress={() => programsQuery.refetch()}
          className="active:opacity-80"
          style={{
            marginTop: 16,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: '#2A2312',
          }}
        >
          <Text style={{ color: 'white', fontFamily: 'Manrope_600SemiBold' }}>Spróbuj ponownie</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: '#F6F4EE' }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={programsQuery.isRefetching}
            onRefresh={programsQuery.refetch}
            tintColor="#2A2312"
            progressViewOffset={40}
          />
        }
      >
        <PageHeader
          title="Programy"
          subtitle="Plany nabożeństw"
          Icon={CalendarIcon}
          showBack
          right={
            canManageTypes ? (
              <Pressable
                onPress={() => setManagingTypes(true)}
                className="active:opacity-70"
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#FFFFFF' }}
              >
                <Text style={{ fontSize: 13, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Kategorie</Text>
              </Pressable>
            ) : undefined
          }
        />
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 14 }}>
          {(
            [
              { key: 'upcoming', label: 'Nadchodzące' },
              { key: 'past', label: 'Minione' },
            ] as { key: Scope; label: string }[]
          ).map((o) => (
            <Pressable
              key={o.key}
              onPress={() => setScope(o.key)}
              className="active:opacity-80"
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: scope === o.key ? '#2A2312' : '#ECE8DE' }}
            >
              <Text style={{ fontSize: 13, color: scope === o.key ? '#ffffff' : '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        {programsQuery.isLoading || typesQuery.isLoading ? (
          <ActivityIndicator color="#2A2312" style={{ marginTop: 40 }} />
        ) : grouped.length === 0 ? (
          <View className="items-center px-8 py-16">
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#FFF8E1',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <CalendarIcon size={28} color="#8A6606" />
            </View>
            <Text className="text-[16px]" style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
              {scope === 'upcoming' ? 'Brak nadchodzących programów' : 'Brak minionych programów'}
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
            >
              {scope === 'upcoming' && canCreate ? 'Przygotuj plan najbliższego nabożeństwa.' : 'Pociągnij w dół, aby odświeżyć.'}
            </Text>
            {scope === 'upcoming' && canCreate ? (
              <Pressable
                onPress={() => setCreating(true)}
                className="active:opacity-80"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 999, backgroundColor: '#FFBE0B' }}
              >
                <Plus size={17} color="#2A2312" strokeWidth={2.4} />
                <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Utwórz program</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          grouped.map(({ type, programs }) => (
            <TypeSection key={type?.id ?? 'unassigned'} type={type} programs={programs} eventsByProgram={eventsByProgram} />
          ))
        )}
      </ScrollView>

      {canCreate && grouped.length > 0 ? (
        <Pressable
          onPress={() => setCreating(true)}
          accessibilityLabel="Nowy program"
          className="active:opacity-80"
          style={{
            position: 'absolute',
            right: 18,
            bottom: 108,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#2A2312',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#2A2312',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Plus size={24} color="#ffffff" strokeWidth={2.4} />
        </Pressable>
      ) : null}
      {canManageTypes ? (
        <ProgramTypesSheet
          visible={managingTypes}
          onClose={() => setManagingTypes(false)}
          canCreate={perms.can('res:program_types:create')}
          canUpdate={perms.can('res:program_types:update')}
          canDelete={perms.can('res:program_types:delete')}
        />
      ) : null}
      {canCreate ? (
        <ProgramFormModal
          visible={creating}
          initial={{ title: null, date: toYmd(new Date()), typeId: null }}
          userEmail={user?.email ?? null}
          campusIdForInsert={campusIdForInsert}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push({ pathname: '/(app)/programs/[id]', params: { id: String(id) } })}
        />
      ) : null}
    </>
  );
}
