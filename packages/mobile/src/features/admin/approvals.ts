import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Kolejka nowych kont (Ustawienia → Użytkownicy na webie, migracja 027):
//   app_users.status='pending' + pending_kind='admin'  → czeka na zatwierdzenie,
//   pending_kind='email'                                → czeka na potwierdzenie e-maila.
// approve-user / reject-user sprawdzają uprawnienie w handlerze (admin albo
// action:settings:manage_users) — przycisk pokazujemy tym samym osobom.

export interface PendingAccount {
  id: string;
  email: string;
  name: string;
  createdAt: string | null;
  kind: 'admin' | 'email';
}

export const usePendingAccounts = (enabled: boolean) =>
  useQuery({
    queryKey: ['pending-accounts'],
    enabled,
    queryFn: async (): Promise<PendingAccount[]> => {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, email, full_name, name, created_at, status, pending_kind')
        .eq('status', 'pending');
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((u) => ({
          id: String(u.id),
          email: String(u.email ?? ''),
          name: String(u.full_name || u.name || u.email || ''),
          createdAt: u.created_at ?? null,
          kind: (u.pending_kind === 'email' ? 'email' : 'admin') as PendingAccount['kind'],
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
  });

const callFn = async (name: string, userId: string) => {
  const { error } = await supabase.functions.invoke(name, { body: { userId } });
  if (error) throw new Error(error.message || 'Operacja nie powiodła się.');
};

export const useDecideAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, approve }: { userId: string; approve: boolean }) =>
      callFn(approve ? 'approve-user' : 'reject-user', userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-accounts'] }),
  });
};
