import type { ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { useAuthSession } from '../../../../src/lib/auth';
import { usePermissions } from '../../../../src/lib/permissions';
import { useDashboard, type UpcomingMinistryItem } from '../../../../src/features/dashboard/api';
import {
  useAttendanceRecent,
  useBirthdays,
  useGivingSummary,
  useRsvpSummary,
  useUpcomingEvents,
  type UpcomingEvent,
} from '../../../../src/features/dashboard/extras';
import { Greeting } from '../../../../src/features/dashboard/components/Greeting';
import { NextUpCard } from '../../../../src/features/dashboard/components/NextUpCard';
import { ForYouStrip } from '../../../../src/features/dashboard/components/ForYouStrip';
import { QuickAccess } from '../../../../src/features/dashboard/components/QuickAccess';
import { UpcomingEventsWidget } from '../../../../src/features/dashboard/components/UpcomingEventsWidget';
import { BirthdaysWidget } from '../../../../src/features/dashboard/components/BirthdaysWidget';
import { LeaderOverviewWidget } from '../../../../src/features/dashboard/components/LeaderOverviewWidget';
import { MinistryWidget } from '../../../../src/features/dashboard/components/MinistryWidget';
import { MessagesWidget } from '../../../../src/features/dashboard/components/MessagesWidget';
import { MyPrayersWidget } from '../../../../src/features/dashboard/components/MyPrayersWidget';
import { TasksWidget } from '../../../../src/features/dashboard/components/TasksWidget';
import { OnlineUsersWidget } from '../../../../src/features/dashboard/components/OnlineUsersWidget';
import { PendingInvitationsWidget } from '../../../../src/features/dashboard/components/PendingInvitationsWidget';
import { PendingAccountsCard } from '../../../../src/features/dashboard/components/PendingAccountsCard';
import { AbsencesWidget } from '../../../../src/features/dashboard/components/AbsencesWidget';
import { useCampusQuery } from '../../../../src/hooks/useCampusQuery';
import { D } from '../../../../src/features/dashboard/theme';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { friendlyError } from '../../../../src/lib/errors';
import { CloudOff } from 'lucide-react-native';
import { DEFAULT_LAYOUT, useDashboardLayout, type DashboardLayout, type SectionId } from '../../../../src/features/dashboard/layout';

// Tło strony pulpitu — białe karty odcinają się od niego bez ramek i cieni.
const PAGE_BG = D.page;

const isOver = (ev: UpcomingEvent) => {
  if (!ev.time) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (ev.date !== today) return false;
  const [h, m] = ev.time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0) + 180 < now.getHours() * 60 + now.getMinutes();
};

export default function DashboardScreen() {
  const { user } = useAuthSession();
  const perms = usePermissions();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, isError, error, refetch, isRefetching } = useDashboard(user?.email ?? null, {
    selectedCampusId,
    withCampusFilter,
  });

  // Widżety jak na webie, ale tylko przy uprawnieniu do danego modułu.
  const events = useUpcomingEvents(perms.ready && perms.moduleVisible('calendar'));
  const birthdays = useBirthdays(perms.ready && perms.moduleVisible('members'));
  const giving = useGivingSummary(perms.ready && perms.moduleVisible('giving'));
  const attendance = useAttendanceRecent(perms.ready && perms.moduleVisible('attendance'));
  const rsvp = useRsvpSummary(perms.ready && perms.moduleVisible('rsvp'));
  // Układ pulpitu użytkownika (Konto → Pulpit); do wczytania — domyślny.
  const layout: DashboardLayout = useDashboardLayout(user?.email ?? null).data ?? DEFAULT_LAYOUT;

  const refreshAll = () => {
    refetch();
    perms.refetch();
    events.refetch();
    birthdays.refetch();
    giving.refetch();
    attendance.refetch();
    rsvp.refetch();
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE_BG }}>
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }

  const ministry: UpcomingMinistryItem[] = data?.upcomingMinistry ?? [];
  const acceptedMinistry = ministry.filter((m) => m.status === 'accepted').length;
  const todoTasks = (data?.myTasks ?? []).filter((t: { status: string }) => t.status !== 'done' && t.status !== 'Zrobione').length;

  // Najbliższe wydarzenie idzie do karty-bohatera; lista pokazuje kolejne. Dzisiejsze
  // wydarzenia, które zaczęły się ponad 3 godziny temu, już minęły.
  const upcoming = (events.data ?? []).filter((ev: UpcomingEvent) => !isOver(ev));
  const nextEvent = upcoming[0] ?? null;
  const nextRole = nextEvent
    ? ministry.find((m) => m.eventId === nextEvent.id && m.status !== 'rejected')?.myRole ?? null
    : null;

  // Sekcje pulpitu — kolejność i widoczność z układu użytkownika; uprawnienia jak dotąd
  // (sekcja bez dostępu albo bez danych sama się nie pokazuje).
  const sections: Record<SectionId, ReactNode> = {
    invitations: <PendingInvitationsWidget invitations={data?.pendingInvitations ?? []} />,
    pendingAccounts: <PendingAccountsCard />,
    nextUp: nextEvent ? <NextUpCard event={nextEvent} myRole={nextRole} /> : null,
    forYou: <ForYouStrip config={layout.forYou} />,
    modules: <QuickAccess config={layout.modules} />,
    events: (
      <UpcomingEventsWidget
        events={upcoming.slice(1)}
        showEmpty={events.isSuccess && upcoming.length === 0 && perms.moduleVisible('calendar')}
      />
    ),
    ministry: (
      <MinistryWidget ministry={ministry} suggestions={data?.ministrySuggestions ?? []} history={data?.ministryHistory ?? []} />
    ),
    tasks: <TasksWidget items={data?.myTasks ?? []} />,
    messages: perms.moduleVisible('komunikator') ? (
      <MessagesWidget conversations={data?.unreadConversations ?? []} totalUnread={data?.totalUnreadMessages ?? 0} />
    ) : null,
    prayers: perms.moduleVisible('prayer') ? <MyPrayersWidget items={data?.myPrayers ?? []} /> : null,
    birthdays: <BirthdaysWidget items={birthdays.data ?? []} />,
    overview: <LeaderOverviewWidget giving={giving.data} attendance={attendance.data ?? []} rsvp={rsvp.data ?? []} />,
    absences: <AbsencesWidget />,
    online: <OnlineUsersWidget users={data?.onlineUsers ?? []} offlineCount={data?.offlineUsersCount ?? 0} />,
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={{ flex: 1, backgroundColor: PAGE_BG }}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refreshAll}
            tintColor="#2A2312"
            progressViewOffset={40}
          />
        }
      >
        <Greeting
          email={user?.email ?? null}
          tasksCount={todoTasks}
          ministryCount={acceptedMinistry}
          pendingInvitations={(data?.pendingInvitations ?? []).length}
          unreadMessages={data?.totalUnreadMessages ?? 0}
        />

        {isError ? (
          <View style={{ marginHorizontal: 16, marginBottom: 28, borderRadius: D.radius, backgroundColor: D.card }}>
            <EmptyState
              compact
              Icon={CloudOff}
              title="Nie udało się wczytać części pulpitu"
              hint={friendlyError(error)}
              actionLabel="Spróbuj ponownie"
              onAction={() => refetch()}
            />
          </View>
        ) : null}

        {layout.sections.filter((sec) => sec.visible).map((sec) => (
          <View key={sec.id}>{sections[sec.id]}</View>
        ))}
      </ScrollView>
    </>
  );
}
