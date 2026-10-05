import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Propozycje budżetu zespołu — jak src/modules/shared/FinanceTab.jsx: lider zgłasza
// pozycję (budget_proposals, status pending), skarbnik zatwierdza w module Finanse.
// team_type/category = nazwa finansowa zespołu (np. „Grupa Uwielbienia”).

export type ProposalStatus = 'pending' | 'approved' | 'rejected';

export interface Proposal {
  id: string;
  year: number;
  kind: 'expense' | 'income';
  description: string;
  amount: number;
  note: string | null;
  status: ProposalStatus;
  createdAt: string | null;
}

export const useProposals = (financeName: string) =>
  useQuery({
    queryKey: ['team', 'proposals', financeName],
    queryFn: async (): Promise<Proposal[]> => {
      const { data, error } = await supabase
        .from('budget_proposals')
        .select('*')
        .eq('team_type', financeName)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        year: Number(r.year) || new Date().getFullYear(),
        kind: r.kind === 'income' ? 'income' : 'expense',
        description: String(r.description ?? ''),
        amount: Number(r.amount) || 0,
        note: r.note ?? null,
        status: (r.status ?? 'pending') as ProposalStatus,
        createdAt: r.created_at ?? null,
      }));
    },
  });

export const useSubmitProposal = (financeName: string, myEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: 'expense' | 'income'; year: number; description: string; amount: number; note: string | null }) => {
      const { data, error } = await (supabase.from('budget_proposals') as any)
        .insert([
          {
            year: input.year,
            kind: input.kind,
            team_type: financeName,
            category: financeName,
            description: input.description,
            amount: input.amount,
            note: input.note,
            submitted_by: myEmail,
            status: 'pending',
          },
        ])
        .select();
      if (error) throw error;
      // Mail do zarządzających finansami — best-effort, jak na webie.
      const id = (data as any[])?.[0]?.id;
      if (id) supabase.functions.invoke('budget-proposal-notify', { body: { proposalId: id, event: 'submitted' } }).catch(() => {});
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['team', 'proposals', financeName] }),
  });
};
