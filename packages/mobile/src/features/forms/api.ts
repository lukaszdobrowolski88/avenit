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
      // `*` jak na webie: closes_at / response_count nie istnieją w każdym tenancie
      // (np. schwro) — jawna lista kolumn kończyła się błędem „column … does not exist”.
      const { data, error } = await supabase
        .from('forms')
        .select('*')
        .neq('is_template', true)
        .in('status', ['published', 'closed'])
        .order('published_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description ?? null,
        status: r.status,
        closes_at: r.closes_at ?? null,
        response_count: r.response_count ?? 0,
        created_at: r.created_at,
        published_at: r.published_at ?? null,
      }));
    },
  });
