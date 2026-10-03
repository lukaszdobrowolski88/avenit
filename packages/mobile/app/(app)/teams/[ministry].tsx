import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  MessageSquare,
  Plus,
  Users as UsersIcon,
} from 'lucide-react-native';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { NoModuleAccess } from '../../../src/components/ModuleGate';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  ALL_MINISTRIES,
  MINISTRY_META,
  useCreateMinistryEvent,
  useCreateWallPost,
  useMinistryEvents,
  useMinistryRoster,
  useTeamSchedule,
  useWallPosts,
  type MinistryKey,
  type RosterMember,
  type ScheduleEntry,
} from '../../../src/features/teams/api';
import { WallPostCard } from '../../../src/features/teams/components/WallPostCard';
import { EventRow } from '../../../src/features/teams/components/EventRow';
import { ScheduleRow } from '../../../src/features/teams/components/ScheduleRow';
import { RosterRow } from '../../../src/features/teams/components/RosterRow';
import { NewPostModal } from '../../../src/features/teams/components/NewPostModal';
import { NewEventModal } from '../../../src/features/teams/components/NewEventModal';

type TabKey = 'wall' | 'events' | 'schedule' | 'roster';

const EVENT_TYPES_PER_MINISTRY: Record<MinistryKey, { key: string; label: string }[]> = {
  worship: [
    { key: 'proba', label: 'Próba' },
    { key: 'koncert', label: 'Koncert' },
    { key: 'nabozesnstwo', label: 'Nabożeństwo' },
    { key: 'warsztat', label: 'Warsztat' },
    { key: 'inne', label: 'Inne' },
  ],
  media: [
    { key: 'produkcja', label: 'Produkcja' },
    { key: 'szkolenie', label: 'Szkolenie' },
    { key: 'streaming', label: 'Streaming' },
    { key: 'inne', label: 'Inne' },
  ],
  atmosfera: [
    { key: 'spotkanie', label: 'Spotkanie' },
    { key: 'warsztat', label: 'Warsztat' },
    { key: 'inne', label: 'Inne' },
  ],
  kids: [
    { key: 'spotkanie', label: 'Spotkanie' },
    { key: 'warsztat', label: 'Warsztat' },
    { key: 'wycieczka', label: 'Wycieczka' },
    { key: 'inne', label: 'Inne' },
  ],
  mlodziezowka: [
    { key: 'spotkanie', label: 'Spotkanie' },
    { key: 'wyjazd', label: 'Wyjazd' },
    { key: 'warsztat', label: 'Warsztat' },
    { key: 'inne', label: 'Inne' },
  ],
};

const Tab = ({
  active,
  onPress,
  Icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  Icon: typeof MessageSquare;
  label: string;
}) => (
  <Pressable
    onPress={onPress}
    style={{
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: active ? '#ffffff' : 'transparent',
      shadowColor: active ? '#0f172a' : 'transparent',
      shadowOpacity: active ? 0.06 : 0,
      shadowRadius: active ? 4 : 0,
      shadowOffset: { width: 0, height: 1 },
      elevation: active ? 2 : 0,
    }}
  >
    <Icon size={14} color={active ? '#0c0a09' : '#78716c'} strokeWidth={2.2} />
    <Text
      style={{
        fontSize: 12,
        color: active ? '#0c0a09' : '#78716c',
        fontFamily: 'Inter_600SemiBold',
      }}
    >
      {label}
    </Text>
  </Pressable>
);

const isMinistryKey = (s: string | undefined): s is MinistryKey =>
  ALL_MINISTRIES.some((m) => m.key === s);

export default function TeamDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ministry } = useLocalSearchParams<{ ministry: string }>();
  const { user } = useAuthSession();
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const [tab, setTab] = useState<TabKey>('wall');
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);

  // Rules of Hooks: wszystkie hooki MUSZĄ być wołane bezwarunkowo, więc guard nieznanego
  // zespołu jest DOPIERO po nich (niżej). Dla nieznanego parametru używamy placeholdera
  // 'worship' — ekran i tak zwróci „Nieznany zespół", więc pobrane dane są nieużywane.
  const valid = isMinistryKey(ministry);
  const key: MinistryKey = valid ? ministry : 'worship';

  const meta = MINISTRY_META[key];
  const wall = useWallPosts(key);
  const events = useMinistryEvents(key, { selectedCampusId, withCampusFilter });
  const schedule = useTeamSchedule(key);
  const roster = useMinistryRoster(key);
  const createPost = useCreateWallPost(key);
  const createEvent = useCreateMinistryEvent(key, { campusIdForInsert });
  // Uprawnienia jak na webie: moduł zespołu (module:<key>) i zakładka składu
  // (tab:<key>:members — na webie zakładka „Członkowie” z kontaktami).
  const perms = usePermissions();
  const canRoster = perms.tabVisible(key, 'members');
  const teamLabel = perms.modules.find((m) => m.key === key)?.label || meta.label;

  const refetch = () => {
    wall.refetch();
    events.refetch();
    schedule.refetch();
    roster.refetch();
  };
  const isRefetching =
    wall.isRefetching || events.isRefetching || schedule.isRefetching || roster.isRefetching;

  const myEmail = user?.email ?? null;
  const myName =
    (user?.user_metadata as { full_name?: string } | null)?.full_name ?? user?.email ?? null;

  const eventTypes = EVENT_TYPES_PER_MINISTRY[key];

  const sortedSchedule = useMemo(() => {
    const list = (schedule.data ?? []).slice();
    list.sort((a: ScheduleEntry, b: ScheduleEntry) => {
      const am = a.assignedEmail === myEmail ? 0 : 1;
      const bm = b.assignedEmail === myEmail ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.programDate.localeCompare(b.programDate);
    });
    return list;
  }, [schedule.data, myEmail]);

  // Guard nieznanego zespołu — DOPIERO po wszystkich hookach (Rules of Hooks).
  if (!valid) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}>
          Nieznany zespół.
        </Text>
      </View>
    );
  }

  if (!perms.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }
  if (!perms.moduleVisible(key)) return <NoModuleAccess />;

  const renderHeader = () => (
    <>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 0,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <GradientIcon
          Icon={meta.Icon}
          size={48}
          iconSize={22}
          from={meta.gradFrom}
          to={meta.gradTo}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
            Zespół
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 22,
              color: '#0c0a09',
              marginTop: 2,
              letterSpacing: -0.5,
              fontFamily: 'Inter_700Bold',
            }}
          >
            {teamLabel}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          backgroundColor: '#f5f5f4',
          marginHorizontal: 16,
          marginTop: 8,
          padding: 4,
          borderRadius: 14,
        }}
      >
        <Tab
          active={tab === 'wall'}
          onPress={() => setTab('wall')}
          Icon={MessageSquare}
          label="Tablica"
        />
        <Tab
          active={tab === 'events'}
          onPress={() => setTab('events')}
          Icon={CalendarDays}
          label="Wydarzenia"
        />
        {meta.teamType ? (
          <Tab
            active={tab === 'schedule'}
            onPress={() => setTab('schedule')}
            Icon={Calendar}
            label="Grafik"
          />
        ) : null}
        {canRoster ? (
          <Tab
            active={tab === 'roster'}
            onPress={() => setTab('roster')}
            Icon={UsersIcon}
            label="Skład"
          />
        ) : null}
      </View>

      {tab === 'wall' || tab === 'events' ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Pressable
            onPress={() =>
              tab === 'wall' ? setPostModalOpen(true) : setEventModalOpen(true)
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 12,
              borderRadius: 14,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: '#e7e5e4',
            }}
          >
            <Plus size={14} color="#57534e" strokeWidth={2.2} />
            <Text
              style={{ fontSize: 13, color: '#57534e', fontFamily: 'Inter_600SemiBold' }}
            >
              {tab === 'wall' ? 'Nowy post' : 'Nowe wydarzenie'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  const data: any[] =
    tab === 'wall'
      ? wall.data ?? []
      : tab === 'events'
        ? events.data ?? []
        : tab === 'roster'
          ? roster.data ?? []
          : sortedSchedule;

  const isLoading =
    (tab === 'wall' && wall.isLoading) ||
    (tab === 'events' && events.isLoading) ||
    (tab === 'schedule' && schedule.isLoading) ||
    (tab === 'roster' && roster.isLoading);

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color="#ec4899" />
        </View>
      );
    }
    return (
      <View style={{ paddingVertical: 48, alignItems: 'center' }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: meta.bg,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
          }}
        >
          <meta.Icon size={24} color={meta.tint} />
        </View>
        <Text style={{ fontSize: 14, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
          {tab === 'wall'
            ? 'Brak postów'
            : tab === 'events'
              ? 'Brak wydarzeń'
              : tab === 'roster'
                ? 'Brak osób w zespole'
                : 'Brak przypisań do grafiku'}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: '#78716c',
            marginTop: 4,
            textAlign: 'center',
            fontFamily: 'Inter_400Regular',
          }}
        >
          {tab === 'wall'
            ? 'Bądź pierwsza/y i napisz coś do zespołu.'
            : tab === 'events'
              ? 'Dodaj próbę, koncert lub spotkanie.'
              : tab === 'roster'
                ? 'Lider może dodać osoby do tej służby.'
                : 'Po dodaniu przypisań w programach zobaczysz je tu.'}
        </Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    if (tab === 'wall') {
      return (
        <WallPostCard
          post={item}
          ministry={key}
          myEmail={myEmail}
          myName={myName ?? null}
        />
      );
    }
    if (tab === 'events') {
      return (
        <EventRow
          event={item}
          ministry={key}
          myEmail={myEmail}
          tint={meta.tint}
          bg={meta.bg}
        />
      );
    }
    if (tab === 'roster') {
      return <RosterRow member={item as RosterMember} tint={meta.tint} />;
    }
    return <ScheduleRow entry={item} highlightMine myEmail={myEmail} />;
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: insets.top + 6,
            paddingBottom: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#e7e5e4',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color="#1c1917" strokeWidth={2.2} />
          </Pressable>
        </View>

        <FlatList
          ListHeaderComponent={renderHeader()}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 }}
          data={data}
          keyExtractor={(it: any) => String(it.id)}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty()}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
          }
        />
      </View>

      <NewPostModal
        visible={postModalOpen}
        onClose={() => setPostModalOpen(false)}
        onSubmit={async ({ title, content }) => {
          if (!myEmail) {
            Alert.alert('Brak sesji', 'Zaloguj się ponownie.');
            return;
          }
          await createPost.mutateAsync({
            title,
            content,
            authorEmail: myEmail,
            authorName: myName ?? null,
          });
          setPostModalOpen(false);
        }}
        isLoading={createPost.isPending}
      />

      <NewEventModal
        visible={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        onSubmit={async (input) => {
          if (!myEmail) {
            Alert.alert('Brak sesji', 'Zaloguj się ponownie.');
            return;
          }
          await createEvent.mutateAsync({
            ...input,
            authorEmail: myEmail,
          });
          setEventModalOpen(false);
        }}
        isLoading={createEvent.isPending}
        eventTypes={eventTypes}
        defaultType={eventTypes[0].key}
      />
    </>
  );
}
