import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export type NotificationType = 'message' | 'mention' | 'task' | 'event' | 'system';

export interface NotificationRow {
  id: string;
  user_email: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export const useNotifications = (userEmail: string | null) =>
  useQuery({
    queryKey: ['notifications', userEmail],
    queryFn: async (): Promise<NotificationRow[]> => {
      if (!userEmail) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!userEmail,
  });

export const useUnreadNotificationsCount = (userEmail: string | null) =>
  useQuery({
    queryKey: ['notifications', 'unread', userEmail],
    queryFn: async (): Promise<number> => {
      if (!userEmail) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_email', userEmail)
        .eq('read', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userEmail,
  });

export const useMarkAllRead = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userEmail) return;
      const { error } = await (supabase.from('notifications') as any)
        .update({ read: true })
        .eq('user_email', userEmail)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('notifications') as any)
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const TYPE_META: Record<
  NotificationType,
  { tint: string; bg: string; label: string }
> = {
  message: { tint: '#2563eb', bg: '#dbeafe', label: 'Wiadomość' },
  mention: { tint: '#a855f7', bg: '#f3e8ff', label: 'Wzmianka' },
  task: { tint: '#d97706', bg: '#fef3c7', label: 'Zadanie' },
  event: { tint: '#ec4899', bg: '#fce7f3', label: 'Wydarzenie' },
  system: { tint: '#64748b', bg: '#e2e8f0', label: 'System' },
};
