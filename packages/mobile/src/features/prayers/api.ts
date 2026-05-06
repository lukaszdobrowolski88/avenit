import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export type PrayerCategory = 'zdrowie' | 'rodzina' | 'finanse' | 'duchowe' | 'inne';
export type PrayerStatus = 'active' | 'answered' | 'archived';
export type PrayerVisibility = 'public' | 'leaders_only';

export interface PrayerRequest {
  id: string;
  user_email: string;
  user_name: string | null;
  requester_name: string | null;
  content: string;
  category: PrayerCategory;
  visibility: PrayerVisibility;
  is_anonymous: boolean;
  is_active: boolean;
  status: PrayerStatus;
  answered_testimony: string | null;
  created_at: string;
  updated_at: string;
  prayer_count: number;
  praying_users: string[] | null;
}

export const usePrayerRequests = (filter: PrayerStatus | 'all' = 'active') =>
  useQuery({
    queryKey: ['prayers', filter],
    queryFn: async (): Promise<PrayerRequest[]> => {
      let q = supabase
        .from('prayer_requests_with_counts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PrayerRequest[];
    },
  });

export const useTogglePrayer = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      currentlyPraying,
    }: {
      requestId: string;
      currentlyPraying: boolean;
    }) => {
      if (!userEmail) throw new Error('Brak zalogowanego użytkownika');
      if (currentlyPraying) {
        const { error } = await supabase
          .from('prayer_interactions')
          .delete()
          .eq('request_id', requestId)
          .eq('user_email', userEmail);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('prayer_interactions') as any).insert({
          request_id: requestId,
          user_email: userEmail,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export interface CreatePrayerInput {
  content: string;
  category: PrayerCategory;
  requester_name?: string | null;
  is_anonymous?: boolean;
  visibility?: PrayerVisibility;
}

export const useCreatePrayer = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePrayerInput) => {
      if (!userEmail) throw new Error('Brak zalogowanego użytkownika');
      const { error } = await (supabase.from('prayer_requests') as any).insert({
        user_email: userEmail,
        content: input.content,
        category: input.category,
        requester_name: input.requester_name ?? null,
        is_anonymous: input.is_anonymous ?? false,
        visibility: input.visibility ?? 'public',
        status: 'active',
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useMarkAnswered = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, testimony }: { id: string; testimony: string }) => {
      const { error } = await (supabase.from('prayer_requests') as any)
        .update({ status: 'answered', answered_testimony: testimony })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayers'] });
    },
  });
};

export const CATEGORY_META: Record<
  PrayerCategory,
  { label: string; tint: string; bg: string; emoji: string }
> = {
  zdrowie: { label: 'Zdrowie', tint: '#059669', bg: '#d1fae5', emoji: '💚' },
  rodzina: { label: 'Rodzina', tint: '#ec4899', bg: '#fce7f3', emoji: '👪' },
  finanse: { label: 'Finanse', tint: '#d97706', bg: '#fef3c7', emoji: '💰' },
  duchowe: { label: 'Duchowe', tint: '#7c3aed', bg: '#ede9fe', emoji: '🙏' },
  inne: { label: 'Inne', tint: '#475569', bg: '#e2e8f0', emoji: '✨' },
};
