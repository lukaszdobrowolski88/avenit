import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react-native';
import { Baby, Music, Sparkles, Users, Video } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export type MinistryKey = 'worship' | 'media' | 'atmosfera' | 'kids' | 'mlodziezowka';

// Wygląd i klucze 5 wbudowanych zespołów. Dane zakładek: features/teams/config.ts + data.ts.
export interface MinistryMeta {
  key: MinistryKey;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
  tint: string;
  bg: string;
  gradFrom: string;
  gradTo: string;
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
// `ministry` = wartość wall_posts.ministry jak na webie — dla Uwielbienia
// 'Grupa Uwielbienia' (TEAM_CONFIG.wallMinistry), nie klucz modułu.
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

export const useWallPosts = (ministry: string) =>
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

export const useCreateWallPost = (ministry: string) => {
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

export const useDeleteWallPost = (ministry: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wall_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', 'wall', ministry] }),
  });
};

export const useTogglePostLike = (ministry: string) => {
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

export const useTogglePostPin = (ministry: string) => {
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

export const useAddPostComment = (ministry: string) => {
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
