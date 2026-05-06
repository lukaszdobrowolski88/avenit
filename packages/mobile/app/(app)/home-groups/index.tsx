import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { Calendar, ChevronRight, Home, MapPin, Users } from 'lucide-react-native';
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
          backgroundColor: '#ffffff',
          shadowColor: '#0f172a',
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
            borderColor: '#eef0f3',
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
                color: '#0c0a09',
                letterSpacing: -0.3,
                fontFamily: 'Inter_700Bold',
              }}
            >
              {group.name}
            </Text>
            {group.leader ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  color: '#78716c',
                  marginTop: 2,
                  fontFamily: 'Inter_500Medium',
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
                  <Calendar size={11} color="#a8a29e" />
                  <Text
                    style={{ fontSize: 11, color: '#78716c', fontFamily: 'Inter_500Medium' }}
                  >
                    {day}
                    {day && time ? ' · ' : ''}
                    {time}
                  </Text>
                </View>
              ) : null}
              {group.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MapPin size={11} color="#a8a29e" />
                  <Text
                    style={{ fontSize: 11, color: '#78716c', fontFamily: 'Inter_500Medium' }}
                  >
                    {group.location}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Users size={11} color="#a8a29e" />
                <Text
                  style={{ fontSize: 11, color: '#78716c', fontFamily: 'Inter_500Medium' }}
                >
                  {group.members_count} {group.members_count === 1 ? 'osoba' : 'osób'}
                </Text>
              </View>
              {campus ? <CampusBadge campus={campus} /> : null}
            </View>
          </View>
          <ChevronRight size={16} color="#a8a29e" />
        </View>
      </Pressable>
    </Link>
  );
};

export default function HomeGroupsListScreen() {
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, isError, error, refetch, isRefetching } = useHomeGroups({
    selectedCampusId,
    withCampusFilter,
  });

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <PageHeader title="Grupy domowe" subtitle="Lista grup zboru" Icon={Home} showBack />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#ec4899" />
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
              style={{ textAlign: 'center', color: '#e11d48', fontFamily: 'Inter_500Medium' }}
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
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
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
                  style={{ fontSize: 16, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
                >
                  Brak grup domowych
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: '#78716c',
                    marginTop: 4,
                    textAlign: 'center',
                    fontFamily: 'Inter_400Regular',
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
