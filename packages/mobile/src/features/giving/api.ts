import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Moduł „Dawanie" (member-facing) — czyta tabelę `donations` filtrując po zalogowanym
// członku. Powiązanie member↔auth jest luźne: dopasowujemy członka po e-mailu
// (members.email == auth email), a następnie darowizny po member_id.
// Tabele donations/giving_funds tworzą migracje web osobno — dlatego brak tabeli
// obsługujemy jako pusty stan, a nie błąd.

export interface GivingFund {
  id: string;
  name: string;
  color: string | null;
}

export type DonationMethod =
  | 'cash'
  | 'transfer'
  | 'card'
  | 'blik'
  | 'online'
  | 'przelewy24'
  | 'paypal'
  | 'other';

export interface Donation {
  id: string;
  amount: number;
  currency: string | null;
  donation_date: string;
  fund_id: string | null;
  method: DonationMethod | string | null;
  status: string | null;
  is_recurring: boolean | null;
  note: string | null;
}

export interface MyGivingData {
  /** Czy udało się powiązać zalogowane konto z rekordem członka. */
  memberResolved: boolean;
  donations: Donation[];
  funds: Record<string, GivingFund>;
  yearTotal: number;
  allTimeTotal: number;
  currency: string;
  year: number;
}

export const METHOD_LABELS: Record<string, string> = {
  cash: 'Gotówka',
  transfer: 'Przelew',
  card: 'Karta',
  blik: 'BLIK',
  online: 'Online',
  przelewy24: 'Przelewy24',
  paypal: 'PayPal',
  other: 'Inne',
};

// PostgREST/Postgres: tabela nie istnieje w schema cache lub w bazie.
const isMissingTable = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('does not exist') ||
    msg.includes('could not find')
  );
};

export const formatMoney = (amount: number | null | undefined, currency = 'PLN'): string => {
  const n = Number(amount ?? 0);
  const fixed = n.toFixed(2).replace('.', ',');
  const [int, dec] = fixed.split(',');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const suffix = currency === 'PLN' ? 'zł' : currency;
  return `${withSep},${dec} ${suffix}`;
};

export const useMyGiving = (userEmail: string | null) =>
  useQuery({
    queryKey: ['giving', 'mine', userEmail],
    queryFn: async (): Promise<MyGivingData> => {
      const year = new Date().getFullYear();
      const empty: MyGivingData = {
        memberResolved: false,
        donations: [],
        funds: {},
        yearTotal: 0,
        allTimeTotal: 0,
        currency: 'PLN',
        year,
      };
      if (!userEmail) return empty;

      // 1. Powiązanie członka po e-mailu.
      let memberId: string | number | null = null;
      try {
        const { data: member, error } = await supabase
          .from('members')
          .select('id')
          .eq('email', userEmail)
          .maybeSingle();
        if (error) throw error;
        memberId = (member as { id?: string | number } | null)?.id ?? null;
      } catch (err) {
        if (isMissingTable(err)) return empty;
        // Inny błąd przy członkach — nie blokuj ekranu, potraktuj jak brak powiązania.
        return empty;
      }

      if (memberId == null) return empty;

      // 2. Darowizny tego członka.
      let donations: Donation[] = [];
      try {
        const { data, error } = await supabase
          .from('donations')
          .select('id, amount, currency, donation_date, fund_id, method, status, is_recurring, note')
          .eq('member_id', memberId)
          .order('donation_date', { ascending: false })
          .limit(200);
        if (error) throw error;
        donations = (data ?? []) as Donation[];
      } catch (err) {
        // Brak tabeli darowizn lub niezgodność typów member_id — członek rozpoznany,
        // ale bez historii.
        if (isMissingTable(err)) return { ...empty, memberResolved: true };
        return { ...empty, memberResolved: true };
      }

      // 3. Fundusze (etykiety / kolory) — opcjonalne.
      const funds: Record<string, GivingFund> = {};
      try {
        const fundIds = Array.from(
          new Set(donations.map((d) => d.fund_id).filter((x): x is string => Boolean(x))),
        );
        if (fundIds.length > 0) {
          const { data: fundRows } = await supabase
            .from('giving_funds')
            .select('id, name, color')
            .in('id', fundIds);
          for (const f of (fundRows ?? []) as GivingFund[]) funds[f.id] = f;
        }
      } catch {
        // fundusze opcjonalne — pomiń.
      }

      const completed = donations.filter((d) => (d.status ?? 'completed') === 'completed');
      const yearTotal = completed
        .filter((d) => (d.donation_date ?? '').startsWith(String(year)))
        .reduce((s, d) => s + Number(d.amount ?? 0), 0);
      const allTimeTotal = completed.reduce((s, d) => s + Number(d.amount ?? 0), 0);
      const currency = donations[0]?.currency ?? 'PLN';

      return {
        memberResolved: true,
        donations,
        funds,
        yearTotal,
        allTimeTotal,
        currency,
        year,
      };
    },
  });
