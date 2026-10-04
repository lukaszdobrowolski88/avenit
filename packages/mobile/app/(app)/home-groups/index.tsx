import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Briefcase, Calendar, ChevronRight, Home, Map as MapIcon, MapPin, Users } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { CampusBadge, useCampusBadge } from '../../../src/components/CampusBadge';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  formatMeetingDay,
  formatMeetingTime,
  useHomeGroups,
  type HomeGroup,
} from '../../../src/features/home-groups/api';

const Card = ({ group }: { group: HomeGroup }) => {
  const { getCampus } = useCampusBadge();
  const day = formatMeetingDay(group.meeting_day);
  const time = formatMeetingTime(group.meeting_time);
  const campus = getCampus(group.campus_id ?? null);
  return (
    <Link href={{ pathname: '/(app)/home-groups/[id]', params: { id: group.id } }} asChild>
      <Pressable
        className="active:opacity-80"
        style={{
          marginBottom: 10,
          borderRadius: 16,
          backgroundColor: '#F6F4EE',
          shadowColor: '#2A2312',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 1,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#E6E1D5',
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#dbeafe',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Home size={20} color="#1d4ed8" strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 15,
                color: '#2A2312',
                letterSpacing: -0.3,
                fontFamily: 'Manrope_700Bold',
              }}
            >
              {group.name}
            </Text>
            {group.leader ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  color: '#7A7466',
                  marginTop: 2,
                  fontFamily: 'Manrope_500Medium',
                }}
              >
                Lider: {group.leader.full_name}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginTop: 4,
                flexWrap: 'wrap',
              }}
            >
              {day || time ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Calendar size={11} color="#A8A59E" />
                  <Text
                    style={{ fontSize: 11, color: '#7A7466', fontFamily: 'Manrope_500Medium' }}
                  >
                    {day}
                    {day && time ? ' · ' : ''}
                    {time}
                  </Text>
                </View>
              ) : null}
              {group.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MapPin size={11} color="#A8A59E" />
                  <Text
                    style={{ fontSize: 11, color: '#7A7466', fontFamily: 'Manrope_500Medium' }}
                  >
                    {group.location}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Users size={11} color="#A8A59E" />
                <Text
                  style={{ fontSize: 11, color: '#7A7466', fontFamily: 'Manrope_500Medium' }}
                >
                  {group.members_count} {group.members_count === 1 ? 'osoba' : 'osób'}
                </Text>
              </View>
              {campus ? <CampusBadge campus={campus} /> : null}
            </View>
          </View>
          <ChevronRight size={16} color="#A8A59E" />
        </View>
      </Pressable>
    </Link>
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
                backgroundColor: '#dbeafe',
              }}
            >
              <MapIcon size={15} color="#1d4ed8" />
              <Text style={{ fontSize: 13, color: '#1d4ed8', fontFamily: 'Manrope_700Bold' }}>Mapa</Text>
            </Pressable>
          }
        />

        {/* Panel służby jak moduł Grup domowych na webie: wydarzenia, zadania, liderzy,
            członkowie, finanse, sprzęt, pliki — każda zakładka za swoim uprawnieniem. */}
        <Pressable
          onPress={() => router.push({ pathname: '/(app)/teams/[ministry]', params: { ministry: 'homegroups' } })}
          className="active:opacity-70"
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: 18,
            backgroundColor: '#f0fdf4',
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: '#dcfce7',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Briefcase size={18} color="#15803d" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>Panel służby grup</Text>
            <Text style={{ fontSize: 12, color: '#4A463E', marginTop: 1, fontFamily: 'Manrope_400Regular' }}>
              Wydarzenia, zadania, liderzy i materiały
            </Text>
          </View>
          <ChevronRight size={18} color="#86a598" />
        </Pressable>

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
          <FlatList
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}
            data={data ?? []}
            keyExtractor={(g) => g.id}
            renderItem={({ item }) => <Card group={item} />}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#dbeafe',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Home size={28} color="#1d4ed8" />
                </View>
                <Text
                  style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Brak grup domowych
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: '#7A7466',
                    marginTop: 4,
                    textAlign: 'center',
                    fontFamily: 'Manrope_400Regular',
                  }}
                >
                  Grupy są zarządzane przez liderów w aplikacji webowej.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}
