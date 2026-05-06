import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface FormRow {
  id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'published' | 'closed';
  closes_at: string | null;
  response_count: number;
  created_at: string;
  published_at: string | null;
}

export const useForms = () =>
  useQuery({
    queryKey: ['forms'],
    queryFn: async (): Promise<FormRow[]> => {
      const { data, error } = await supabase
        .from('forms')
        .select(
          'id, title, description, status, closes_at, response_count, created_at, published_at',
        )
        .neq('is_template', true)
        .in('status', ['published', 'closed'])
        .order('published_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FormRow[];
    },
  });
