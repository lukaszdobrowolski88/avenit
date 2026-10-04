import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Pulpity skarbnika / rady (module:giving, module:finance) — kontrakt jak web:
// Giving/tabs/OverviewTab.jsx + CampaignsTab.jsx, FinanceModule.jsx (decyzje).

const asList = (d: unknown) => ((d ?? []) as any[]);

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(q: T) => T;
}

export interface GivingOverview {
  year: number;
  yearTotal: number;
  monthTotal: number;
  donors: number;
  count: number;
  byFund: { name: string; total: number; pct: number; color: string | null }[];
  months: number[]; // 12 miesięcy bieżącego roku
  recent: { id: string; who: string; amount: number; date: string; fund: string | null }[];
  campaigns: { id: string; name: string; goal: number; raised: number; pct: number }[];
}

export const useGivingOverview = (scope: CampusScope, enabled: boolean) =>
  useQuery({
    queryKey: ['giving-admin', scope.selectedCampusId],
    enabled,
    queryFn: async (): Promise<GivingOverview> => {
      const year = new Date().getFullYear();
      const [donRes, fundsRes, campRes, campDonRes] = await Promise.all([
        scope
          .withCampusFilter(supabase.from('donations').select('id, amount, donation_date, fund_id, member_id, donor_name, donor_email, is_anonymous'))
          .gte('donation_date', `${year}-01-01`)
          .lte('donation_date', `${year}-12-31`)
          .eq('status', 'completed')
          .order('donation_date', { ascending: false }),
        supabase.from('giving_funds').select('id, name, color').order('sort_order', { ascending: true }),
        supabase.from('giving_campaigns').select('id, name, goal_amount, is_active').eq('is_active', true),
        // „Zebrano” w kampaniach jak web CampaignsTab: dowolny status, po campaign_id.
        supabase.from('donations').select('campaign_id, amount').not('campaign_id', 'is', null),
      ]);
      if (donRes.error) throw donRes.error;
      const donations = asList(donRes.data);
      const fundName = new Map<string, { name: string; color: string | null }>(
        asList(fundsRes.data).map((f) => [String(f.id), { name: String(f.name), color: f.color ?? null }]),
      );

      const month = new Date().getMonth();
      let yearTotal = 0;
      let monthTotal = 0;
      const months = Array(12).fill(0) as number[];
      const donors = new Set<string>();
      const fundTotals = new Map<string, number>();
      for (const d of donations) {
        const amt = Number(d.amount) || 0;
        yearTotal += amt;
        const m = d.donation_date ? new Date(d.donation_date).getMonth() : -1;
        if (m >= 0) months[m] += amt;
        if (m === month) monthTotal += amt;
        donors.add(String(d.member_id ?? d.donor_name ?? d.id));
        const fk = d.fund_id ? String(d.fund_id) : '';
        fundTotals.set(fk, (fundTotals.get(fk) ?? 0) + amt);
      }

      // Nazwy darczyńców dla ostatnich wpłat (anonimowe zostają anonimowe).
      const recentRows = donations.slice(0, 6);
      const memberIds = [...new Set(recentRows.map((d) => d.member_id).filter((x) => x != null))];
      const memberName = new Map<string, string>();
      if (memberIds.length) {
        const { data: ms } = await supabase.from('members').select('id, first_name, last_name').in('id', memberIds);
        for (const m of asList(ms)) memberName.set(String(m.id), [m.first_name, m.last_name].filter(Boolean).join(' '));
      }

      const raised = new Map<string, number>();
      for (const d of asList(campDonRes.data)) raised.set(String(d.campaign_id), (raised.get(String(d.campaign_id)) ?? 0) + (Number(d.amount) || 0));

      return {
        year,
        yearTotal,
        monthTotal,
        donors: donors.size,
        count: donations.length,
        byFund: [...fundTotals.entries()]
          .map(([k, total]) => ({
            name: k ? fundName.get(k)?.name ?? 'Fundusz' : 'Bez funduszu',
            color: k ? fundName.get(k)?.color ?? null : null,
            total,
            pct: yearTotal ? Math.round((total / yearTotal) * 100) : 0,
          }))
          .sort((a, b) => b.total - a.total),
        months,
        recent: recentRows.map((d) => ({
          id: String(d.id),
          who: d.is_anonymous
            ? 'Anonimowo'
            : (d.member_id != null ? memberName.get(String(d.member_id)) : null) || d.donor_name || d.donor_email || 'Darczyńca',
          amount: Number(d.amount) || 0,
          date: String(d.donation_date ?? '').slice(0, 10),
          fund: d.fund_id ? fundName.get(String(d.fund_id))?.name ?? null : null,
        })),
        campaigns: asList(campRes.data).map((c) => {
          const goal = Number(c.goal_amount) || 0;
          const r = raised.get(String(c.id)) ?? 0;
          return { id: String(c.id), name: String(c.name), goal, raised: r, pct: goal ? Math.min(100, Math.round((r / goal) * 100)) : 0 };
        }),
      };
    },
  });

// ─── Finanse: decyzje (propozycje budżetu, wydatki do akceptacji) ────────────

export interface BudgetProposal {
  id: string;
  year: number;
  kind: 'expense' | 'income';
  teamType: string;
  category: string | null;
  description: string;
  amount: number;
  note: string | null;
  submittedBy: string | null;
  createdAt: string | null;
}

export interface PendingExpense {
  id: string;
  amount: number;
  contractor: string | null;
  description: string | null;
  teamType: string | null;
  submittedBy: string | null;
  date: string | null;
}

export const useFinanceDecisions = (enabled: boolean) =>
  useQuery({
    queryKey: ['finance', 'decisions'],
    enabled,
    queryFn: async () => {
      const [propRes, expRes] = await Promise.all([
        supabase.from('budget_proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
        supabase.from('expense_transactions').select('*').eq('status', 'submitted').order('payment_date', { ascending: false }).limit(100),
      ]);
      const proposals: BudgetProposal[] = asList(propRes.data).map((p) => ({
        id: String(p.id),
        year: Number(p.year) || new Date().getFullYear(),
        kind: p.kind === 'income' ? 'income' : 'expense',
        teamType: String(p.team_type ?? ''),
        category: p.category ?? null,
        description: String(p.description ?? ''),
        amount: Number(p.amount) || 0,
        note: p.note ?? null,
        submittedBy: p.submitted_by ?? null,
        createdAt: p.created_at ?? null,
      }));
      const expenses: PendingExpense[] = asList(expRes.data).map((e) => ({
        id: String(e.id),
        amount: Number(e.amount) || 0,
        contractor: e.contractor ?? e.vendor ?? null,
        description: e.detailed_description ?? e.description ?? null,
        teamType: e.team_type ?? null,
        submittedBy: e.submitted_by ?? null,
        date: e.payment_date ?? e.date ?? null,
      }));
      return { proposals, expenses, proposalsError: propRes.error?.message ?? null, expensesError: expRes.error?.message ?? null };
    },
  });

// Zatwierdzenie propozycji jak FinanceModule.jsx:622-635: pozycja budżetu → status →
// wpis w audycie → powiadomienie autora (event 'decided').
export const useDecideProposal = (actorEmail: string | null, campusId: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ p, approve }: { p: BudgetProposal; approve: boolean }) => {
      if (approve) {
        const row = {
          year: p.year,
          kind: p.kind,
          category: p.category || p.teamType,
          team_type: p.teamType,
          description: p.description,
          planned_amount: p.amount,
          period_type: 'year',
          campus_id: campusId,
        };
        const { data: item, error: iErr } = await (supabase.from('budget_items') as any).insert(row).select().single();
        if (iErr) throw new Error(iErr.message || 'Nie udało się dodać pozycji do budżetu.');
        const { error: sErr } = await (supabase.from('budget_proposals') as any).update({ status: 'approved' }).eq('id', p.id);
        if (sErr) throw new Error(sErr.message || 'Nie udało się zmienić statusu.');
        // Audyt jak na webie; jego błąd nie cofa decyzji (builder nie ma .catch — try).
        try {
          await (supabase.from('budget_audit') as any).insert({
            year: p.year,
            item_id: (item as any)?.id ?? null,
            action: 'created',
            category: row.category,
            description: row.description,
            before: null,
            after: row,
            actor: actorEmail,
          });
        } catch {
          /* audyt opcjonalny */
        }
      } else {
        const { error } = await (supabase.from('budget_proposals') as any).update({ status: 'rejected' }).eq('id', p.id);
        if (error) throw new Error(error.message || 'Nie udało się odrzucić.');
      }
      try {
        await supabase.functions.invoke('budget-proposal-notify', { body: { proposalId: p.id, event: 'decided' } });
      } catch {
        /* powiadomienie opcjonalne */
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
};

export const useDecideExpense = (actorEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const patch = approve
        ? { status: 'approved', approved_by: actorEmail, approved_at: new Date().toISOString() }
        : { status: 'rejected' };
      const { error } = await (supabase.from('expense_transactions') as any).update(patch).eq('id', id);
      if (error) throw new Error(error.message || 'Nie udało się zapisać decyzji.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
};
