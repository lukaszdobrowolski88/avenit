import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Calendar, Heart, Gift, BookOpen, CheckSquare, Users, Bell } from 'lucide-react-native';
import { useAuthSession } from '../../../src/lib/auth';
import { useDashboard, type UpcomingMinistryItem } from '../../../src/features/dashboard/api';
import { MinistryWidget } from '../../../src/features/dashboard/components/MinistryWidget';
import { MessagesWidget } from '../../../src/features/dashboard/components/MessagesWidget';
import { MyPrayersWidget } from '../../../src/features/dashboard/components/MyPrayersWidget';
import { TasksWidget } from '../../../src/features/dashboard/components/TasksWidget';
import { OnlineUsersWidget } from '../../../src/features/dashboard/components/OnlineUsersWidget';
import { PendingInvitationsWidget } from '../../../src/features/dashboard/components/PendingInvitationsWidget';
import { AbsencesWidget } from '../../../src/features/dashboard/components/AbsencesWidget';
import { GradientAvatar } from '../../../src/components/ui/GradientAvatar';
import { HeroCard, ModuleChip, StatTile, SectionHeader } from '../../../src/components/ui/ds';
import { useDS, font, space } from '../../../src/theme/ds';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';

const safeDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function DashboardScreen() {
  const router = useRouter();
  const { dark, c } = useDS();
  const { user } = useAuthSession();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, refetch, isRefetching } = useDashboard(user?.email ?? null, {
    selectedCampusId,
    withCampusFilter,
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ground }}>
        <ActivityIndicator color={c.amber} />
      </View>
    );
  }

  const email = user?.email ?? '';
  const fullName = (user?.full_name as string | undefined) ?? '';
  const firstName = capitalize((fullName || email.split('@')[0] || 'Witaj').split(/[ .]/)[0]);
  const initial = (firstName || 'A').charAt(0).toUpperCase();
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Dzień dobry' : hour < 18 ? 'Miłego dnia' : 'Dobry wieczór';
  const todayLabel = capitalize(format(now, 'EEEE, d MMMM', { locale: pl }));

  const acceptedMinistry = (data?.upcomingMinistry ?? []).filter(
    (m: UpcomingMinistryItem) => m.status === 'accepted',
  ).length;
  const totalTasks = (data?.myTasks ?? []).length;
  const totalPrayers = (data?.myPrayers ?? []).length;

  const nextProgram = (data?.upcomingPrograms ?? [])[0] ?? null;
  const nextDate = safeDate(nextProgram?.date);

  return (
    <>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.ground }}
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.amber} progressViewOffset={40} />
        }
      >
        {/* — nagłówek — */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.screen, paddingTop: 14, paddingBottom: 14 }}>
          <GradientAvatar initial={initial} size={46} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.inkSoft }}>{todayLabel}</Text>
            <Text style={{ fontFamily: font.display, fontSize: 21, letterSpacing: -0.4, color: c.ink }}>
              {greet}, {firstName}
            </Text>
          </View>
          <View
            style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <Bell size={21} color={c.ink} strokeWidth={1.9} />
            {(data?.totalUnreadMessages ?? 0) > 0 || (data?.pendingInvitations ?? []).length > 0 ? (
              <View style={{ position: 'absolute', top: 11, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: c.amber, borderWidth: 2, borderColor: c.card }} />
            ) : null}
          </View>
        </View>

        {/* — hero: najbliższy program — */}
        {nextProgram ? (
          <HeroCard
            tag={nextDate ? capitalize(format(nextDate, 'EEEE, d MMMM', { locale: pl })) : 'Najbliżej'}
            title={(nextProgram.title && nextProgram.title.trim()) || nextProgram.typeName || 'Nabożeństwo'}
            actionLabel="Zobacz plan"
            onAction={() => router.push('/(app)/programs')}
          />
        ) : (
          <HeroCard tag="Ten tydzień" title="Zaplanuj swój tydzień" actionLabel="Kalendarz" onAction={() => router.push('/(app)/calendar')} />
        )}

        {/* — szybki dostęp — */}
        <SectionHeader title="Szybki dostęp" />
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: space.screen }}>
          <ModuleChip Icon={Calendar} tint="sky" label="Kalendarz" onPress={() => router.push('/(app)/calendar')} />
          <ModuleChip Icon={Heart} tint="rose" label="Modlitwa" onPress={() => router.push('/(app)/prayers')} />
          <ModuleChip Icon={Gift} tint="green" label="Wsparcie" onPress={() => router.push('/(app)/giving')} />
          <ModuleChip Icon={BookOpen} tint="violet" label="Nauczania" onPress={() => router.push('/(app)/teachings')} />
        </View>

        {/* — twój tydzień — */}
        <SectionHeader title="Twój tydzień" />
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: space.screen }}>
          <StatTile Icon={CheckSquare} tint="amber" value={totalTasks} label="Zadania" />
          <StatTile Icon={Users} tint="sky" value={acceptedMinistry} label="Służba" />
          <StatTile Icon={Heart} tint="rose" value={totalPrayers} label="Modlitwy" />
        </View>

        <View style={{ height: 8 }} />

        {/* — istniejące widgety (spójna nowa powłoka) — */}
        <PendingInvitationsWidget invitations={data?.pendingInvitations ?? []} />
        <TasksWidget items={data?.myTasks ?? []} />
        <MinistryWidget
          ministry={data?.upcomingMinistry ?? []}
          suggestions={data?.ministrySuggestions ?? []}
          history={data?.ministryHistory ?? []}
          programs={data?.upcomingPrograms ?? []}
        />
        <MyPrayersWidget items={data?.myPrayers ?? []} />
        <AbsencesWidget items={data?.myAbsences ?? []} upcomingPrograms={data?.upcomingPrograms ?? []} />
        <OnlineUsersWidget users={data?.onlineUsers ?? []} offlineCount={data?.offlineUsersCount ?? 0} />
        <MessagesWidget conversations={data?.unreadConversations ?? []} totalUnread={data?.totalUnreadMessages ?? 0} />
      </ScrollView>
    </>
  );
}
