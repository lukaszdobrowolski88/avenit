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
import { Briefcase, Home, Map as MapIcon } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B, FeatureCard, InfoBlock, ListCard, ListRow, SectionLabel } from '../../../src/components/ui/brand';
import { useCampusBadge } from '../../../src/components/CampusBadge';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  formatMeetingDay,
  formatMeetingTime,
  useHomeGroups,
  type HomeGroup,
} from '../../../src/features/home-groups/api';

const DAY_SHORT: Record<string, string> = {
  Poniedziałek: 'PN', Wtorek: 'WT', Środa: 'ŚR', Czwartek: 'CZ', Piątek: 'PT', Sobota: 'SO', Niedziela: 'ND',
};
const TODAY = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'][new Date().getDay()];

// Wiersz grupy: na początku dzień i godzina spotkania (dzisiejsze — w słodzie z kurkumą).
const GroupRow = ({ group }: { group: HomeGroup }) => {
  const router = useRouter();
  const { getCampus } = useCampusBadge();
  const day = formatMeetingDay(group.meeting_day);
  const time = formatMeetingTime(group.meeting_time);
  const campus = getCampus(group.campus_id ?? null);
  const isToday = !!day && day === TODAY;
  const people = `${group.members_count} ${group.members_count === 1 ? 'osoba' : 'osób'}`;
  return (
    <ListRow
      leading={<InfoBlock top={DAY_SHORT[day] ?? (day ? day.slice(0, 2).toUpperCase() : '—')} bottom={time || null} dark={isToday} />}
      title={group.name}
      subtitle={[group.location, people].filter(Boolean).join(' · ')}
      meta={
        group.leader || campus || isToday ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {isToday ? (
              <Text style={{ fontSize: 11, color: B.gold, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' }}>
                Dziś
              </Text>
            ) : null}
            {group.leader ? (
              <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>
                Lider: {group.leader.full_name}
              </Text>
            ) : null}
            {campus ? (
              <Text style={{ fontSize: 11, color: B.gold, fontFamily: 'Manrope_600SemiBold' }}>{campus.name}</Text>
            ) : null}
          </View>
        ) : null
      }
      onPress={() => router.push({ pathname: '/(app)/home-groups/[id]', params: { id: group.id } })}
    />
  );
};

export default function HomeGroupsListScreen() {
  const router = useRouter();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, isError, error, refetch, isRefetching } = useHomeGroups({
    selectedCampusId,
    withCampusFilter,
  });

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader
          title="Grupy domowe"
          subtitle="Lista grup zboru"
          Icon={Home}
          showBack
          right={
            <Pressable
              onPress={() => router.push('/(app)/home-groups/map')}
              hitSlop={8}
              className="active:opacity-70"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: '#FFBE0B',
              }}
            >
              <MapIcon size={15} color="#2A2312" />
              <Text style={{ fontSize: 13, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Mapa</Text>
            </Pressable>
          }
        />

        {/* Panel służby jak moduł Grup domowych na webie: wydarzenia, zadania, liderzy,
            członkowie, finanse, sprzęt, pliki — każda zakładka za swoim uprawnieniem. */}
        <FeatureCard
          Icon={Briefcase}
          title="Panel służby grup"
          subtitle="Wydarzenia, zadania, liderzy i materiały"
          onPress={() => router.push({ pathname: '/(app)/teams/[ministry]', params: { ministry: 'homegroups' } })}
          style={{ marginHorizontal: 16, marginBottom: 4 }}
        />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
            }}
          >
            <Text
              style={{ textAlign: 'center', color: '#e11d48', fontFamily: 'Manrope_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />}
          >
            {(data ?? []).length > 0 ? (
              <>
                <SectionLabel count={(data ?? []).length}>Wszystkie grupy</SectionLabel>
                <ListCard>
                  {(data ?? []).map((g: HomeGroup) => (
                    <GroupRow key={g.id} group={g} />
                  ))}
                </ListCard>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#ECE8DE',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Home size={28} color="#2A2312" />
                </View>
                <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>Brak grup domowych</Text>
                <Text
                  style={{ fontSize: 13, color: '#6B6557', marginTop: 4, textAlign: 'center', fontFamily: 'Manrope_400Regular' }}
                >
                  Grupy są zarządzane przez liderów w aplikacji webowej.
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}
