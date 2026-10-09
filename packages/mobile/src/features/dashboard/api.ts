import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { fetchAssignments, roleText, todayYmd, type AssignmentRow } from '../schedule/assignments';
import { fetchMyBoardTasks, type BoardTaskItem } from './board-tasks';

export type { BoardTaskItem } from './board-tasks';

export interface UpcomingMinistryItem {
  // Id przydziału (schedule_assignments) — do odpowiedzi „Akceptuję / Odrzucam”.
  id: string;
  // Cel: program (programId) albo wydarzenie z grafikiem (eventId) — od migracji 055.
  programId: number | null;
  eventId: string | null;
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
  myPrayers: RecentPrayer[];
  myTasks: TaskItem[];
  // Zadania z tablic przypisane do mnie (Projekty, zakładki „Zadania” służb, Kalendarz).
  myBoardTasks: BoardTaskItem[];
  offlineUsersCount: number;
  onlineUsers: OnlineUser[];
  pendingInvitations: PendingInvitation[];
}

export interface OnlineUser {
  email: string;
  status: 'online' | 'away';
  lastSeen: string;
  memberId: number | string | null;
  firstName: string | null;
  lastName: string | null;
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
  programId: number | null;
  eventId: string | null;
  date: string;
  programTitle: string | null;
  typeName: string | null;
  typeColor: string | null;
  teamType: string;
  roleKey: string;
  assignedByName: string | null;
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
          myPrayers: [],
          myTasks: [],
          myBoardTasks: [],
          offlineUsersCount: 0,
          onlineUsers: [],
          pendingInvitations: [],
        };
      }

      // Wszystkie moje przypisania (z programem/wydarzeniem dociągniętym po id) — z nich
      // liczymy nadchodzące, zaproszenia i historię. Błąd nie psuje reszty pulpitu.
      const myAssignmentsP: Promise<AssignmentRow[]> = fetchAssignments((q) =>
        q.eq('assigned_email', userEmail).order('created_at', { ascending: false }),
      ).catch((e) => {
        console.warn('[dashboard] assignments:', e?.message);
        return [];
      });

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

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const onlineListP = supabase
        .from('user_presence')
        .select('user_email, status, last_seen')
        .in('status', ['online', 'away'])
        .gte('last_seen', fiveMinutesAgo)
        .neq('user_email', userEmail)
        .order('last_seen', { ascending: false })
        .limit(12);

      const myTasksP = supabase
        .from('user_tasks')
        .select(
          'id, user_email, title, description, status, due_date, is_private, assigned_to_email, assigned_to_name, attachments',
        )
        .or(`user_email.eq.${userEmail},assigned_to_email.eq.${userEmail}`)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20);

      // Moje modlitwy przez fn prayer-wall (jak Ściana modlitw): widok
      // prayer_requests_with_counts nie ma już user_email (prywatność, migr. 062/063),
      // więc filtr po e-mailu kończył się 42703. Autora oznacza serwer (is_author).
      const myPrayersP = supabase.functions
        .invoke('prayer-wall')
        .then(({ data, error }: { data: any; error: any }) => {
          if (error) return { data: [] as any[], error };
          const rows = ((data?.requests ?? []) as any[])
            .filter((r) => r.is_author && (r.status ?? 'active') === 'active')
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, 5)
            .map((r) => ({ ...r, user_email: userEmail }));
          return { data: rows, error: null };
        });

      // Zadania z tablic — błąd nie psuje reszty pulpitu (widżet pokaże zadania osobiste).
      const myBoardTasksP: Promise<BoardTaskItem[]> = fetchMyBoardTasks(userEmail).catch((e) => {
        console.warn('[dashboard] board tasks:', e?.message);
        return [];
      });

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const offlineCountP = supabase
        .from('user_presence')
        .select('user_email', { count: 'exact', head: true })
        .gte('last_seen', oneDayAgo)
        .eq('status', 'offline');

      const [
        mine,
        { data: programs, error: progErr },
        { data: parts },
        { data: onlineRows },
        { data: taskRows, error: tasksErr },
        { data: myPrayerRows, error: mpErr },
        { count: offlineUsersCount },
        myBoardTasks,
      ] = await Promise.all([
        myAssignmentsP,
        upcoming,
        myConversations,
        onlineListP,
        myTasksP,
        myPrayersP,
        offlineCountP,
        myBoardTasksP,
      ]);
      if (mpErr) console.warn('[dashboard] my prayers:', mpErr.message);
      if (tasksErr) console.warn('[dashboard] tasks:', tasksErr.message);

      const now = todayYmd();
      const known = mine.filter((a) => a.date);
      const byDateAsc = (a: AssignmentRow, b: AssignmentRow) =>
        (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''));
      const toItem = (a: AssignmentRow): UpcomingMinistryItem => ({
        id: a.id,
        programId: a.kind === 'program' ? a.programId : null,
        eventId: a.kind === 'event' ? a.eventId : null,
        date: a.date,
        title: a.title,
        typeName: a.typeName,
        typeColor: a.typeColor,
        myRole: roleText(a) || null,
        status: a.status,
      });

      const pendingInvitations: PendingInvitation[] = known
        .filter((a) => a.status === 'pending' && a.date >= now)
        .sort(byDateAsc)
        .slice(0, 10)
        .map((a) => ({
          id: a.id,
          programId: a.kind === 'program' ? a.programId : null,
          eventId: a.kind === 'event' ? a.eventId : null,
          date: a.date,
          programTitle: a.title,
          typeName: a.typeName,
          typeColor: a.typeColor,
          teamType: a.teamType,
          roleKey: a.roleLabel || a.roleKey,
          assignedByName: a.assignedByName,
        }));


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
        // Fallback nazw dla ról bez dostępu do `members` (zwykły członek dostaje 403):
        // app_users jest resource:null (czyta każdy zalogowany). Bez tego lista online
        // pokazuje członkowi same e-maile zamiast imion.
        const userByEmail = new Map<string, { firstName: string | null; lastName: string | null }>();
        const { data: appUserRows } = await supabase
          .from('app_users')
          .select('email, full_name')
          .in('email', onlineEmails);
        for (const u of (appUserRows ?? []) as any[]) {
          if (!u.email) continue;
          const parts = String(u.full_name ?? '').trim().split(/\s+/).filter(Boolean);
          userByEmail.set(u.email, {
            firstName: parts[0] ?? null,
            lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
          });
        }
        onlineUsers = ((onlineRows ?? []) as any[]).map((r) => {
          const m = memberByEmail.get(r.user_email);
          const u = userByEmail.get(r.user_email);
          return {
            email: r.user_email,
            status: r.status,
            lastSeen: r.last_seen,
            memberId: m?.id ?? null,
            firstName: m?.first_name ?? u?.firstName ?? null,
            lastName: m?.last_name ?? u?.lastName ?? null,
          } satisfies OnlineUser;
        });
      }
      if (progErr) console.warn('[dashboard] programs:', progErr.message);

      const upcomingMinistry: UpcomingMinistryItem[] = known
        .filter((a) => a.date >= now && a.status !== 'rejected')
        .sort(byDateAsc)
        .slice(0, 5)
        .map(toItem);

      const upcomingPrograms: UpcomingProgramItem[] = (programs ?? []).map((p: any) => ({
        id: p.id,
        date: p.date,
        title: p.title,
        typeName: p.type?.name ?? null,
        typeColor: p.type?.color ?? null,
      }));

      const ministrySuggestions: UpcomingMinistryItem[] = known
        .filter((a) => a.status === 'pending' && a.date >= now)
        .sort(byDateAsc)
        .map(toItem);

      const ministryHistory: UpcomingMinistryItem[] = known
        .filter((a) => a.status === 'accepted' && a.date < now)
        .sort((a, b) => byDateAsc(b, a))
        .slice(0, 5)
        .map(toItem);

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
        myBoardTasks,
        offlineUsersCount: offlineUsersCount ?? 0,
        onlineUsers,
        pendingInvitations,
      };
    },
    enabled: !!userEmail,
  });
