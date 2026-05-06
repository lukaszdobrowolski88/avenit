import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react-native';
import { Baby, Music, Sparkles, Users, Video } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export type MinistryKey = 'worship' | 'media' | 'atmosfera' | 'kids' | 'mlodziezowka';

export interface MinistryMeta {
  key: MinistryKey;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
  tint: string;
  bg: string;
  gradFrom: string;
  gradTo: string;
  eventsTable: string;
  teamType: string | null;
}

export const MINISTRY_META: Record<MinistryKey, MinistryMeta> = {
  worship: {
    key: 'worship',
    label: 'Zespół Uwielbienia',
    shortLabel: 'Worship',
    Icon: Music,
    tint: '#9d174d',
    bg: '#fce7f3',
    gradFrom: '#ec4899',
    gradTo: '#f97316',
    eventsTable: 'worship_events',
    teamType: 'worship',
  },
  media: {
    key: 'media',
    label: 'MediaTeam',
    shortLabel: 'Media',
    Icon: Video,
    tint: '#9a3412',
    bg: '#ffedd5',
    gradFrom: '#f97316',
    gradTo: '#facc15',
    eventsTable: 'media_events',
    teamType: 'media',
  },
  atmosfera: {
    key: 'atmosfera',
    label: 'Atmosfera Team',
    shortLabel: 'Atmosfera',
    Icon: Sparkles,
    tint: '#0f766e',
    bg: '#ccfbf1',
    gradFrom: '#14b8a6',
    gradTo: '#06b6d4',
    eventsTable: 'atmosfera_events',
    teamType: 'atmosfera',
  },
  kids: {
    key: 'kids',
    label: 'Dzieci',
    shortLabel: 'Kids',
    Icon: Baby,
    tint: '#854d0e',
    bg: '#fef3c7',
    gradFrom: '#eab308',
    gradTo: '#f59e0b',
    eventsTable: 'kids_events',
    teamType: 'kids',
  },
  mlodziezowka: {
    key: 'mlodziezowka',
    label: 'Młodzieżówka',
    shortLabel: 'Młodzież',
    Icon: Users,
    tint: '#9f1239',
    bg: '#ffe4e6',
    gradFrom: '#f43f5e',
    gradTo: '#ec4899',
    eventsTable: 'mlodziezowka_events',
    teamType: null,
  },
};

export const ALL_MINISTRIES: MinistryMeta[] = [
  MINISTRY_META.worship,
  MINISTRY_META.media,
  MINISTRY_META.atmosfera,
  MINISTRY_META.kids,
  MINISTRY_META.mlodziezowka,
];

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

// =====================================================================
// Wall posts (bez campus filter — tablice są globalne per ministry)
// =====================================================================

export interface WallAttachment {
  url: string;
  name: string;
  type: string;
  size?: number;
}

export interface WallComment {
  id: string;
  author_email: string;
  author_name?: string | null;
  content: string;
  created_at: string;
}

export interface WallPost {
  id: string;
  ministry: string;
  title: string;
  content: string;
  author_email: string;
  author_name: string | null;
  pinned: boolean;
  likes: string[];
  attachments: WallAttachment[];
  comments: WallComment[];
  reply_to: { id: string; author_name?: string | null; content: string } | null;
  created_at: string;
  updated_at: string;
}

export const useWallPosts = (ministry: MinistryKey) =>
  useQuery({
    queryKey: ['teams', 'wall', ministry],
    queryFn: async (): Promise<WallPost[]> => {
      const { data, error } = await supabase
        .from('wall_posts')
        .select('*')
        .eq('ministry', ministry)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        ministry: r.ministry,
        title: r.title ?? '',
        content: r.content ?? '',
        author_email: r.author_email,
        author_name: r.author_name ?? null,
        pinned: !!r.pinned,
        likes: Array.isArray(r.likes) ? r.likes : [],
        attachments: Array.isArray(r.attachments) ? r.attachments : [],
        comments: Array.isArray(r.comments) ? r.comments : [],
        reply_to: r.reply_to ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    },
  });

export const useCreateWallPost = (ministry: MinistryKey) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      content: string;
      authorEmail: string;
      authorName: string | null;
    }) => {
      const { error } = await (supabase.from('wall_posts') as any).insert({
        ministry,
        title: input.title || '',
        content: input.content,
        author_email: input.authorEmail,
        author_name: input.authorName,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', 'wall', ministry] }),
  });
};

export const useDeleteWallPost = (ministry: MinistryKey) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wall_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', 'wall', ministry] }),
  });
};

export const useTogglePostLike = (ministry: MinistryKey) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      userEmail,
      currentLikes,
    }: {
      postId: string;
      userEmail: string;
      currentLikes: string[];
    }) => {
      const has = currentLikes.includes(userEmail);
      const next = has
        ? currentLikes.filter((e) => e !== userEmail)
        : [...currentLikes, userEmail];
      const { error } = await (supabase.from('wall_posts') as any)
        .update({ likes: next })
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', 'wall', ministry] }),
  });
};

export const useTogglePostPin = (ministry: MinistryKey) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, pinned }: { postId: string; pinned: boolean }) => {
      const { error } = await (supabase.from('wall_posts') as any)
        .update({ pinned })
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', 'wall', ministry] }),
  });
};

export const useAddPostComment = (ministry: MinistryKey) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      content,
      authorEmail,
      authorName,
      currentComments,
    }: {
      postId: string;
      content: string;
      authorEmail: string;
      authorName: string | null;
      currentComments: WallComment[];
    }) => {
      const newComment: WallComment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author_email: authorEmail,
        author_name: authorName,
        content,
        created_at: new Date().toISOString(),
      };
      const next = [...currentComments, newComment];
      const { error } = await (supabase.from('wall_posts') as any)
        .update({ comments: next })
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', 'wall', ministry] }),
  });
};

// =====================================================================
// Events (z campus filter — {ministry}_events są kampus-świadome)
// =====================================================================

export interface MinistryEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  max_participants: number | null;
  created_by: string;
  created_at: string;
  campus_id?: number | null;
}

export const useMinistryEvents = (
  ministry: MinistryKey,
  { selectedCampusId, withCampusFilter }: CampusScope,
) => {
  const meta = MINISTRY_META[ministry];
  return useQuery({
    queryKey: ['teams', 'events', ministry, selectedCampusId],
    queryFn: async (): Promise<MinistryEvent[]> => {
      const base = supabase.from(meta.eventsTable).select('*');
      const { data, error } = await withCampusFilter(base)
        .gte('start_date', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
        .order('start_date', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MinistryEvent[];
    },
  });
};

export const useCreateMinistryEvent = (
  ministry: MinistryKey,
  { campusIdForInsert }: { campusIdForInsert: number | null },
) => {
  const qc = useQueryClient();
  const meta = MINISTRY_META[ministry];
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string | null;
      eventType: string;
      startDate: string;
      endDate: string | null;
      location: string | null;
      authorEmail: string;
    }) => {
      const { error } = await (supabase.from(meta.eventsTable) as any).insert({
        title: input.title,
        description: input.description,
        event_type: input.eventType,
        start_date: input.startDate,
        end_date: input.endDate,
        location: input.location,
        created_by: input.authorEmail,
        campus_id: campusIdForInsert,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', 'events', ministry] }),
  });
};

export const useDeleteMinistryEvent = (ministry: MinistryKey) => {
  const qc = useQueryClient();
  const meta = MINISTRY_META[ministry];
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(meta.eventsTable).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', 'events', ministry] }),
  });
};

// =====================================================================
// Schedule
// =====================================================================

export interface ScheduleEntry {
  id: string;
  programId: number;
  programDate: string;
  programTitle: string | null;
  typeName: string | null;
  typeColor: string | null;
  assignedEmail: string;
  assignedName: string;
  roleKey: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export const useTeamSchedule = (ministry: MinistryKey) => {
  const meta = MINISTRY_META[ministry];
  return useQuery({
    queryKey: ['teams', 'schedule', ministry],
    queryFn: async (): Promise<ScheduleEntry[]> => {
      if (!meta.teamType) return [];
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select(
          'id, assigned_email, assigned_name, role_key, status, programs!inner(id, date, title, program_types(name, color))',
        )
        .eq('team_type', meta.teamType)
        .gte('programs.date', today)
        .order('programs(date)', { ascending: true })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as any[]).flatMap((r) => {
        const p = r.programs;
        if (!p) return [];
        const t = p.program_types;
        return [
          {
            id: r.id,
            programId: p.id,
            programDate: p.date,
            programTitle: p.title ?? null,
            typeName: t?.name ?? null,
            typeColor: t?.color ?? null,
            assignedEmail: r.assigned_email,
            assignedName: r.assigned_name ?? r.assigned_email,
            roleKey: r.role_key,
            status: r.status,
          } satisfies ScheduleEntry,
        ];
      });
    },
    enabled: !!meta.teamType,
  });
};
