import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { useAuthSession } from '../../../src/lib/auth';
import { useDashboard } from '../../../src/features/dashboard/api';
import { Greeting } from '../../../src/features/dashboard/components/Greeting';
import { MinistryWidget } from '../../../src/features/dashboard/components/MinistryWidget';
import { MessagesWidget } from '../../../src/features/dashboard/components/MessagesWidget';
import { MyPrayersWidget } from '../../../src/features/dashboard/components/MyPrayersWidget';
import { TasksWidget } from '../../../src/features/dashboard/components/TasksWidget';
import { OnlineUsersWidget } from '../../../src/features/dashboard/components/OnlineUsersWidget';
import { PendingInvitationsWidget } from '../../../src/features/dashboard/components/PendingInvitationsWidget';
import { AbsencesWidget } from '../../../src/features/dashboard/components/AbsencesWidget';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';

export default function DashboardScreen() {
  const { user } = useAuthSession();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { data, isLoading, refetch, isRefetching } = useDashboard(user?.email ?? null, {
    selectedCampusId,
    withCampusFilter,
  });

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: '#fff7ed' }}
      >
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  const acceptedMinistry = (data?.upcomingMinistry ?? []).filter(
    (m) => m.status === 'accepted',
  ).length;
  const totalTasks = (data?.myTasks ?? []).length;
  const totalPrayers = (data?.myPrayers ?? []).length;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: '#ffffff' }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#ec4899"
            progressViewOffset={40}
          />
        }
      >
        <Greeting
          email={user?.email ?? null}
          tasksCount={totalTasks}
          ministryCount={acceptedMinistry}
          prayersCount={totalPrayers}
          pendingInvitations={(data?.pendingInvitations ?? []).length}
        />

        <PendingInvitationsWidget invitations={data?.pendingInvitations ?? []} />

        <TasksWidget items={data?.myTasks ?? []} />

        <MinistryWidget
          ministry={data?.upcomingMinistry ?? []}
          suggestions={data?.ministrySuggestions ?? []}
          history={data?.ministryHistory ?? []}
          programs={data?.upcomingPrograms ?? []}
        />

        <MyPrayersWidget items={data?.myPrayers ?? []} />

        <AbsencesWidget
          items={data?.myAbsences ?? []}
          upcomingPrograms={data?.upcomingPrograms ?? []}
        />

        <OnlineUsersWidget
          users={data?.onlineUsers ?? []}
          offlineCount={data?.offlineUsersCount ?? 0}
        />

        <MessagesWidget
          conversations={data?.unreadConversations ?? []}
          totalUnread={data?.totalUnreadMessages ?? 0}
        />
      </ScrollView>
    </>
  );
}
