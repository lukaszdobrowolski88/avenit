import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface TaskComment {
  id: string;
  task_id: string;
  author_email: string;
  author_name: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export const useTaskComments = (taskId: string | null | undefined) =>
  useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async (): Promise<TaskComment[]> => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('user_task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskComment[];
    },
    enabled: !!taskId,
  });

export const useAddTaskComment = (taskId: string | null | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      content: string;
      authorEmail: string;
      authorName: string | null;
    }) => {
      if (!taskId) throw new Error('Brak taskId');
      const { error } = await (supabase.from('user_task_comments') as any).insert({
        task_id: taskId,
        content: input.content.trim(),
        author_email: input.authorEmail,
        author_name: input.authorName,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', taskId] }),
  });
};

export const useDeleteTaskComment = (taskId: string | null | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('user_task_comments')
        .delete()
        .eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', taskId] }),
  });
};

export const useTaskCommentsCount = (taskIds: string[]) =>
  useQuery({
    queryKey: ['task-comments-counts', taskIds.slice().sort().join(',')],
    queryFn: async (): Promise<Record<string, number>> => {
      if (taskIds.length === 0) return {};
      const { data, error } = await supabase
        .from('user_task_comments')
        .select('task_id')
        .in('task_id', taskIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        counts[row.task_id] = (counts[row.task_id] ?? 0) + 1;
      }
      return counts;
    },
    enabled: taskIds.length > 0,
    staleTime: 30 * 1000,
  });
