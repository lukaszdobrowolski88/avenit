import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { useDashboard, type UpcomingMinistryItem } from '../../../src/features/dashboard/api';
import {
  useAttendanceRecent,
  useBirthdays,
  useGivingSummary,
  useRsvpSummary,
  useUpcomingEvents,
} from '../../../src/features/dashboard/extras';
import { Greeting } from '../../../src/features/dashboard/components/Greeting';
import { ForYouStrip } from '../../../src/features/dashboard/components/ForYouStrip';
import { QuickAccess } from '../../../src/features/dashboard/components/QuickAccess';
import { UpcomingEventsWidget } from '../../../src/features/dashboard/components/UpcomingEventsWidget';
import { BirthdaysWidget } from '../../../src/features/dashboard/components/BirthdaysWidget';
import { LeaderOverviewWidget } from '../../../src/features/dashboard/components/LeaderOverviewWidget';
import { MinistryWidget } from '../../../src/features/dashboard/components/MinistryWidget';
import { MessagesWidget } from '../../../src/features/dashboard/components/MessagesWidget';
import { MyPrayersWidget } from '../../../src/features/dashboard/components/MyPrayersWidget';
import { TasksWidget } from '../../../src/features/dashboard/components/TasksWidget';
import { OnlineUsersWidget } from '../../../src/features/dashboard/components/OnlineUsersWidget';
import { PendingInvitationsWidget } from '../../../src/features/dashboard/components/PendingInvitationsWidget';
import { PendingAccountsCard } from '../../../src/features/dashboard/components/PendingAccountsCard';
import { AbsencesWidget } from '../../../src/features/dashboard/components/AbsencesWidget';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';

// Tło strony pulpitu — białe karty odcinają się od niego bez ramek i cieni.
const PAGE_BG = '#f6f5f3';

export default function DashboardScreen() {
  const { user } = useAuthSession();
  const perms = usePermissions();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, refetch, isRefetching } = useDashboard(user?.email ?? null, {
    selectedCampusId,
    withCampusFilter,
  });

  // Widżety jak na webie, ale tylko przy uprawnieniu do danego modułu.
  const events = useUpcomingEvents(perms.ready && perms.moduleVisible('calendar'));
  const birthdays = useBirthdays(perms.ready && perms.moduleVisible('members'));
  const giving = useGivingSummary(perms.ready && perms.moduleVisible('giving'));
  const attendance = useAttendanceRecent(perms.ready && perms.moduleVisible('attendance'));
  const rsvp = useRsvpSummary(perms.ready && perms.moduleVisible('rsvp'));

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
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  const acceptedMinistry = (data?.upcomingMinistry ?? []).filter(
    (m: UpcomingMinistryItem) => m.status === 'accepted',
  ).length;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={{ flex: 1, backgroundColor: PAGE_BG }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refreshAll}
            tintColor="#ec4899"
            progressViewOffset={40}
          />
        }
      >
        <Greeting
          email={user?.email ?? null}
          tasksCount={(data?.myTasks ?? []).length}
          ministryCount={acceptedMinistry}
          prayersCount={(data?.myPrayers ?? []).length}
          pendingInvitations={(data?.pendingInvitations ?? []).length}
          unreadMessages={data?.totalUnreadMessages ?? 0}
        />

        <PendingInvitationsWidget invitations={data?.pendingInvitations ?? []} />

        <PendingAccountsCard />

        <ForYouStrip />

        <QuickAccess />

        <UpcomingEventsWidget events={events.data ?? []} />

        <MinistryWidget
          ministry={data?.upcomingMinistry ?? []}
          suggestions={data?.ministrySuggestions ?? []}
          history={data?.ministryHistory ?? []}
        />

        <TasksWidget items={data?.myTasks ?? []} />

        {perms.moduleVisible('komunikator') ? (
          <MessagesWidget
            conversations={data?.unreadConversations ?? []}
            totalUnread={data?.totalUnreadMessages ?? 0}
          />
        ) : null}

        {perms.moduleVisible('prayer') ? <MyPrayersWidget items={data?.myPrayers ?? []} /> : null}

        <BirthdaysWidget items={birthdays.data ?? []} />

        <LeaderOverviewWidget
          giving={giving.data}
          attendance={attendance.data ?? []}
          rsvp={rsvp.data ?? []}
        />

        <AbsencesWidget items={data?.myAbsences ?? []} upcomingPrograms={data?.upcomingPrograms ?? []} />

        <OnlineUsersWidget users={data?.onlineUsers ?? []} offlineCount={data?.offlineUsersCount ?? 0} />
      </ScrollView>
    </>
  );
}
