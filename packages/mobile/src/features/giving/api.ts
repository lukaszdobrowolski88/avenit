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

      // Prywatność: darowizny czyta serwerowy endpoint /api/fn/my-giving, który
      // ustala członka z ZALOGOWANEGO usera (nie z parametru). Bezpośredni odczyt
      // tabeli `donations` odsłaniałby cudze wpłaty (uprawnienia są per-tabela).
      const { data, error } = await supabase.functions.invoke('my-giving');
      if (error || !data) return empty;
      return data as MyGivingData;
    },
  });
