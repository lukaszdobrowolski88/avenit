import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface UpcomingMinistryItem {
  programId: number;
  date: string;
  title: string | null;
  typeName: string | null;
  typeColor: string | null;
  myRole: string | null;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface UnreadConversation {
  id: string;
  name: string | null;
  type: 'direct' | 'group' | 'ministry';
  ministry_key: string | null;
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
}

export interface UpcomingProgramItem {
  id: number;
  date: string;
  title: string | null;
  typeName: string | null;
  typeColor: string | null;
}

export interface DashboardStats {
  upcomingMinistry: UpcomingMinistryItem[];
  ministrySuggestions: UpcomingMinistryItem[];
  ministryHistory: UpcomingMinistryItem[];
  upcomingPrograms: UpcomingProgramItem[];
  unreadConversations: UnreadConversation[];
  totalUnreadMessages: number;
  prayerCount: number;
  membersCount: number;
  songsCount: number;
  programsThisMonth: number;
  birthdaysThisWeek: BirthdayItem[];
  recentPrayers: RecentPrayer[];
  myPrayers: RecentPrayer[];
  myTasks: TaskItem[];
  onlineUsersCount: number;
  offlineUsersCount: number;
  onlineUsers: OnlineUser[];
  pendingInvitations: PendingInvitation[];
  myAbsences: AbsenceItem[];
}

export interface OnlineUser {
  email: string;
  status: 'online' | 'away';
  lastSeen: string;
  memberId: number | string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface BirthdayItem {
  id: number | string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string;
  daysUntil: number;
}

export interface RecentPrayer {
  id: string;
  content: string;
  category: string;
  prayer_count: number;
  is_anonymous: boolean;
  user_name: string | null;
  user_email: string;
  created_at: string;
}

export interface TaskAttachment {
  url: string;
  name: string;
  type: string;
  size?: number;
}

export interface TaskItem {
  id: string;
  user_email: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  is_private: boolean;
  assigned_to_email: string | null;
  assigned_to_name: string | null;
  attachments: TaskAttachment[];
}

export interface PendingInvitation {
  id: string;
  programId: number;
  date: string;
  programTitle: string | null;
  typeName: string | null;
  typeColor: string | null;
  teamType: string;
  roleKey: string;
  assignedByName: string | null;
}

export interface AbsenceItem {
  id: string;
  absence_date: string;
  program_id: number | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
}

const today = () => new Date().toISOString().slice(0, 10);

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

export const useDashboard = (
  userEmail: string | null,
  scope: CampusScope,
) =>
  useQuery({
    queryKey: ['dashboard', scope.selectedCampusId, userEmail],
    queryFn: async (): Promise<DashboardStats> => {
      if (!userEmail) {
        return {
          upcomingMinistry: [],
          ministrySuggestions: [],
          ministryHistory: [],
          upcomingPrograms: [],
          unreadConversations: [],
          totalUnreadMessages: 0,
          prayerCount: 0,
          membersCount: 0,
          songsCount: 0,
          programsThisMonth: 0,
          birthdaysThisWeek: [],
          recentPrayers: [],
          myPrayers: [],
          myTasks: [],
          onlineUsersCount: 0,
          offlineUsersCount: 0,
          onlineUsers: [],
          pendingInvitations: [],
          myAbsences: [],
        };
      }

      const myAssignments = supabase
        .from('schedule_assignments')
        .select(
          'id, program_id, role_key, team_type, status, programs!inner(id, date, title, type_id, program_types(id, name, color))',
        )
        .eq('assigned_email', userEmail)
        .gte('programs.date', today())
        .order('programs(date)', { ascending: true })
        .limit(5);

      const upcomingBase = supabase
        .from('programs')
        .select('id, date, title, type:program_types(id, name, color)');
      const upcoming = scope
        .withCampusFilter(upcomingBase)
        .gte('date', today())
        .order('date', { ascending: true })
        .limit(3);

      const myConversations = supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_email', userEmail);

      const prayers = supabase
        .from('prayer_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      const monthStart = new Date();
      monthStart.setDate(1);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const membersCountBase = supabase
        .from('members')
        .select('id', { count: 'exact', head: true });
      const membersCountP = scope.withCampusFilter(membersCountBase);

      const songsCountP = supabase.from('songs').select('id', { count: 'exact', head: true });

      const programsThisMonthBase = supabase
        .from('programs')
        .select('id', { count: 'exact', head: true });
      const programsThisMonthP = scope
        .withCampusFilter(programsThisMonthBase)
        .gte('date', monthStart.toISOString().slice(0, 10))
        .lt('date', monthEnd.toISOString().slice(0, 10));

      const onlineListP = supabase
        .from('user_presence')
        .select('user_email, status, last_seen')
        .in('status', ['online', 'away'])
        .gte('last_seen', fiveMinutesAgo)
        .neq('user_email', userEmail)
        .order('last_seen', { ascending: false })
        .limit(12);

      const birthdaysBase = supabase
        .from('members')
        .select('id, first_name, last_name, birth_date')
        .not('birth_date', 'is', null);
      const birthdaysP = scope.withCampusFilter(birthdaysBase);

      const recentPrayersP = supabase
        .from('prayer_requests_with_counts')
        .select(
          'id, content, category, prayer_count, is_anonymous, user_name, user_email, created_at',
        )
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(3);

      const myTasksP = supabase
        .from('user_tasks')
        .select(
          'id, user_email, title, description, status, due_date, is_private, assigned_to_email, assigned_to_name, attachments',
        )
        .or(`user_email.eq.${userEmail},assigned_to_email.eq.${userEmail}`)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20);

      const myPrayersP = supabase
        .from('prayer_requests_with_counts')
        .select(
          'id, content, category, prayer_count, is_anonymous, user_name, user_email, created_at',
        )
        .eq('user_email', userEmail)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5);

      const myHistoryP = supabase
        .from('schedule_assignments')
        .select(
          'id, role_key, team_type, status, programs!inner(id, date, title, type_id, program_types(id, name, color))',
        )
        .eq('assigned_email', userEmail)
        .eq('status', 'accepted')
        .lt('programs.date', today())
        .order('programs(date)', { ascending: false })
        .limit(5);

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const offlineCountP = supabase
        .from('user_presence')
        .select('user_email', { count: 'exact', head: true })
        .gte('last_seen', oneDayAgo)
        .eq('status', 'offline');

      const pendingInvitesP = supabase
        .from('schedule_assignments')
        .select(
          'id, team_type, role_key, assigned_by_name, created_at, programs(id, date, title, program_types(name, color))',
        )
        .eq('assigned_email', userEmail)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const absencesP = supabase
        .from('user_absences')
        .select('id, absence_date, program_id, note, status')
        .eq('user_email', userEmail)
        .gte('absence_date', sevenDaysAgo.toISOString().slice(0, 10))
        .order('absence_date', { ascending: true })
        .limit(10);

      const [
        { data: assignments, error: assignErr },
        { data: programs, error: progErr },
        { data: parts },
        { count: prayerCount },
        { count: membersCount },
        { count: songsCount },
        { count: programsThisMonth },
        { data: onlineRows },
        { data: birthdayRows },
        { data: recentPrayerRows, error: rpErr },
        { data: taskRows, error: tasksErr },
        { data: inviteRows, error: invitesErr },
        { data: absenceRows, error: absencesErr },
        { data: myPrayerRows, error: mpErr },
        { data: historyRows, error: historyErr },
        { count: offlineUsersCount },
      ] = await Promise.all([
        myAssignments,
        upcoming,
        myConversations,
        prayers,
        membersCountP,
        songsCountP,
        programsThisMonthP,
        onlineListP,
        birthdaysP,
        recentPrayersP,
        myTasksP,
        pendingInvitesP,
        absencesP,
        myPrayersP,
        myHistoryP,
        offlineCountP,
      ]);
      if (mpErr) console.warn('[dashboard] my prayers:', mpErr.message);
      if (historyErr) console.warn('[dashboard] history:', historyErr.message);
      if (rpErr) console.warn('[dashboard] recent prayers:', rpErr.message);
      if (tasksErr) console.warn('[dashboard] tasks:', tasksErr.message);
      if (invitesErr) console.warn('[dashboard] invites:', invitesErr.message);
      if (absencesErr) console.warn('[dashboard] absences:', absencesErr.message);

      const pendingInvitations: PendingInvitation[] = ((inviteRows ?? []) as any[]).flatMap(
        (a) => {
          const p = a.programs;
          if (!p) return [];
          const t = p.program_types;
          return [
            {
              id: a.id,
              programId: p.id,
              date: p.date,
              programTitle: p.title,
              typeName: t?.name ?? null,
              typeColor: t?.color ?? null,
              teamType: a.team_type,
              roleKey: a.role_key,
              assignedByName: a.assigned_by_name,
            } satisfies PendingInvitation,
          ];
        },
      );

      const myAbsences = (absenceRows ?? []) as unknown as AbsenceItem[];

      const onlineEmails = ((onlineRows ?? []) as any[]).map((r) => r.user_email);
      let onlineUsers: OnlineUser[] = [];
      if (onlineEmails.length > 0) {
        const memberLookupBase = supabase
          .from('members')
          .select('id, first_name, last_name, email');
        const { data: memberRows } = await scope
          .withCampusFilter(memberLookupBase)
          .in('email', onlineEmails);
        const memberByEmail = new Map<string, any>(
          ((memberRows ?? []) as any[]).map((m) => [m.email, m]),
        );
        onlineUsers = ((onlineRows ?? []) as any[]).map((r) => {
          const m = memberByEmail.get(r.user_email);
          return {
            email: r.user_email,
            status: r.status,
            lastSeen: r.last_seen,
            memberId: m?.id ?? null,
            firstName: m?.first_name ?? null,
            lastName: m?.last_name ?? null,
          } satisfies OnlineUser;
        });
      }
      const onlineUsersCount = ((onlineRows ?? []) as any[]).filter(
        (r) => r.status === 'online',
      ).length;

      const now = new Date();
      const todayMD = now.getMonth() * 100 + now.getDate();
      const birthdaysThisWeek: BirthdayItem[] = [];
      for (const m of (birthdayRows ?? []) as any[]) {
        if (!m.birth_date) continue;
        const bd = new Date(m.birth_date);
        const md = bd.getMonth() * 100 + bd.getDate();
        let days = md - todayMD;
        if (days < 0) days += 365;
        if (days <= 7) {
          birthdaysThisWeek.push({
            id: m.id,
            first_name: m.first_name,
            last_name: m.last_name,
            birth_date: m.birth_date,
            daysUntil: days,
          });
        }
      }
      birthdaysThisWeek.sort((a, b) => a.daysUntil - b.daysUntil);

      if (assignErr) console.warn('[dashboard] assignments:', assignErr.message);
      if (progErr) console.warn('[dashboard] programs:', progErr.message);

      const upcomingMinistry: UpcomingMinistryItem[] = (assignments ?? []).flatMap((a: any) => {
        const p = a.programs;
        if (!p) return [];
        const t = p.program_types;
        const role = [a.team_type, a.role_key].filter(Boolean).join(' · ');
        return [
          {
            programId: p.id,
            date: p.date,
            title: p.title,
            typeName: t?.name ?? null,
            typeColor: t?.color ?? null,
            myRole: role || null,
            status: a.status,
          } satisfies UpcomingMinistryItem,
        ];
      });

      const upcomingPrograms: UpcomingProgramItem[] = (programs ?? []).map((p: any) => ({
        id: p.id,
        date: p.date,
        title: p.title,
        typeName: p.type?.name ?? null,
        typeColor: p.type?.color ?? null,
      }));

      const ministrySuggestions: UpcomingMinistryItem[] = ((inviteRows ?? []) as any[]).flatMap(
        (a) => {
          const p = a.programs;
          if (!p) return [];
          const t = p.program_types;
          const role = [a.team_type, a.role_key].filter(Boolean).join(' · ');
          return [
            {
              programId: p.id,
              date: p.date,
              title: p.title,
              typeName: t?.name ?? null,
              typeColor: t?.color ?? null,
              myRole: role || null,
              status: 'pending' as const,
            } satisfies UpcomingMinistryItem,
          ];
        },
      );

      const ministryHistory: UpcomingMinistryItem[] = ((historyRows ?? []) as any[]).flatMap(
        (a) => {
          const p = a.programs;
          if (!p) return [];
          const t = p.program_types;
          const role = [a.team_type, a.role_key].filter(Boolean).join(' · ');
          return [
            {
              programId: p.id,
              date: p.date,
              title: p.title,
              typeName: t?.name ?? null,
              typeColor: t?.color ?? null,
              myRole: role || null,
              status: a.status,
            } satisfies UpcomingMinistryItem,
          ];
        },
      );

      const convIds = (parts ?? []).map((p: any) => p.conversation_id);
      const lastReadByConv = new Map<string, string | null>(
        (parts ?? []).map((p: any) => [p.conversation_id, p.last_read_at]),
      );
      let unreadConversations: UnreadConversation[] = [];
      let totalUnreadMessages = 0;
      if (convIds.length > 0) {
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, name, type, ministry_key')
          .in('id', convIds);
        const { data: messages } = await supabase
          .from('messages')
          .select('conversation_id, content, created_at, sender_email')
          .in('conversation_id', convIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200);

        const grouped = new Map<string, { count: number; last: any }>();
        for (const m of messages ?? []) {
          const lastRead = lastReadByConv.get((m as any).conversation_id);
          const isUnread =
            (m as any).sender_email !== userEmail &&
            (!lastRead || new Date((m as any).created_at) > new Date(lastRead));
          if (!grouped.has((m as any).conversation_id)) {
            grouped.set((m as any).conversation_id, { count: 0, last: m });
          }
          if (isUnread) {
            const g = grouped.get((m as any).conversation_id)!;
            g.count++;
            totalUnreadMessages++;
          }
        }

        unreadConversations = (convs ?? [])
          .map((c: any) => {
            const g = grouped.get(c.id);
            if (!g || g.count === 0) return null;
            return {
              id: c.id,
              name: c.name,
              type: c.type,
              ministry_key: c.ministry_key,
              unread_count: g.count,
              last_message: g.last?.content ?? null,
              last_message_at: g.last?.created_at ?? null,
            } satisfies UnreadConversation;
          })
          .filter(Boolean) as UnreadConversation[];
      }

      return {
        upcomingMinistry,
        ministrySuggestions,
        ministryHistory,
        upcomingPrograms,
        unreadConversations,
        totalUnreadMessages,
        prayerCount: prayerCount ?? 0,
        membersCount: membersCount ?? 0,
        songsCount: songsCount ?? 0,
        programsThisMonth: programsThisMonth ?? 0,
        birthdaysThisWeek,
        recentPrayers: (recentPrayerRows ?? []) as unknown as RecentPrayer[],
        myPrayers: (myPrayerRows ?? []) as unknown as RecentPrayer[],
        myTasks: ((taskRows ?? []) as any[]).map((r) => ({
          id: r.id,
          user_email: r.user_email,
          title: r.title,
          description: r.description ?? null,
          status: r.status,
          due_date: r.due_date ?? null,
          is_private: !!r.is_private,
          assigned_to_email: r.assigned_to_email ?? null,
          assigned_to_name: r.assigned_to_name ?? null,
          attachments: Array.isArray(r.attachments) ? r.attachments : [],
        })) as TaskItem[],
        onlineUsersCount,
        offlineUsersCount: offlineUsersCount ?? 0,
        onlineUsers,
        pendingInvitations,
        myAbsences,
      };
    },
    enabled: !!userEmail,
  });
