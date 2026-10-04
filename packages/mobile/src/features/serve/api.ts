import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// „Moje nieobecności” (jedyna funkcja nieobecności w apce) — przez fn my-blockouts
// (volunteer_blockouts; member_id ustala serwer, lider widzi w Służba → Dostępność).
export interface Blockout {
  id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  reason: string | null;
}

export interface MyBlockoutsData {
  memberResolved: boolean;
  blockouts: Blockout[];
}

export const useMyBlockouts = () =>
  useQuery({
    queryKey: ['my-blockouts'],
    queryFn: async (): Promise<MyBlockoutsData> => {
      const { data, error } = await supabase.functions.invoke('my-blockouts', {
        body: { action: 'list' },
      });
      if (error) throw new Error(error.message || 'Nie udało się pobrać niedostępności.');
      return (data as MyBlockoutsData) ?? { memberResolved: false, blockouts: [] };
    },
  });

export const useAddBlockout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { start_date: string; end_date: string; reason?: string | null }) => {
      const { error } = await supabase.functions.invoke('my-blockouts', {
        body: { action: 'add', ...input },
      });
      if (error) throw new Error(error.message || 'Nie udało się zapisać niedostępności.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-blockouts'] }),
  });
};

export const useDeleteBlockout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('my-blockouts', {
        body: { action: 'delete', id },
      });
      if (error) throw new Error(error.message || 'Nie udało się usunąć wpisu.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-blockouts'] }),
  });
};
