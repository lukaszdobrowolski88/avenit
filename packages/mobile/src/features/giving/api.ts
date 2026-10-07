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

export const STATUS_LABELS: Record<string, string> = {
  completed: 'Zaksięgowana',
  pending: 'Oczekuje',
  failed: 'Nieudana',
  refunded: 'Zwrócona',
};

// ── Sumy jak web (Giving/lib/givingApi.js) ─────────────────────────────────
// „Suma” = tylko zaksięgowane; oczekujące pokazujemy osobno, nieudane/zwrócone pomijamy.
export const isCompletedDonation = (d: { status?: string | null }) => (d.status ?? 'completed') === 'completed';
export const isPendingDonation = (d: { status?: string | null }) => d.status === 'pending';

export const donationTotals = (rows: { amount: number | string | null; status?: string | null }[]) => {
  const t = { completed: 0, completedCount: 0, pending: 0, pendingCount: 0 };
  for (const d of rows ?? []) {
    const a = Number(d.amount) || 0;
    if (isCompletedDonation(d)) {
      t.completed += a;
      t.completedCount += 1;
    } else if (isPendingDonation(d)) {
      t.pending += a;
      t.pendingCount += 1;
    }
  }
  return t;
};

// Zestawienie PIT: odliczyć można darowiznę pieniężną udokumentowaną dowodem wpłaty na rachunek
// (art. 26 ust. 7 ustawy o PIT) — gotówka idzie osobno, z adnotacją (jak web).
export const isCashDonation = (d: { method?: string | null }) => d.method === 'cash';

// Zebrano w zbiórce — jedna definicja z webem (raisedForCampaign): zaksięgowane darowizny
// przypisane do zbiórki, a bez przypisania — wpłaty na fundusz zbiórki w jej oknie dat.
export interface CampaignLike {
  id: string | number;
  fund_id?: string | number | null;
  start_date?: string | null;
  end_date?: string | null;
}
export interface DonationLike {
  amount: number | string | null;
  status?: string | null;
  campaign_id?: string | number | null;
  fund_id?: string | number | null;
  donation_date?: string | null;
}
export const donationCountsForCampaign = (d: DonationLike, c: CampaignLike) => {
  if (!d || !c || d.status !== 'completed') return false;
  if (d.campaign_id) return String(d.campaign_id) === String(c.id);
  if (!c.fund_id || String(d.fund_id ?? '') !== String(c.fund_id)) return false;
  const day = String(d.donation_date ?? '').slice(0, 10);
  if (c.start_date && day < String(c.start_date).slice(0, 10)) return false;
  if (c.end_date && day > String(c.end_date).slice(0, 10)) return false;
  return true;
};
export const raisedForCampaign = (c: CampaignLike, donations: DonationLike[]) =>
  (donations ?? []).filter((d) => donationCountsForCampaign(d, c)).reduce((s, d) => s + (Number(d.amount) || 0), 0);

export const formatMoney = (amount: number | null | undefined, currency = 'PLN'): string => {
  const n = Number(amount ?? 0);
  const fixed = n.toFixed(2).replace('.', ',');
  const [int, dec] = fixed.split(',');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const suffix = currency === 'PLN' ? 'zł' : currency;
  return `${withSep},${dec} ${suffix}`;
};

export interface GivingCampaign {
  id: string;
  name: string;
  description: string | null;
  goal_amount: number;
  raised: number;
  fund_id: string | null;
  fund_name: string | null;
  start_date: string | null;
  end_date: string | null;
  image_url: string | null;
}

// Zbiórki (aktywne kampanie + postęp) — przez fn giving-campaigns (giving_* nie są
// wystawione przez /api/db; postęp liczony serwerowo bez ujawniania pojedynczych wpłat).
export const useGivingCampaigns = () =>
  useQuery({
    queryKey: ['giving', 'campaigns'],
    queryFn: async (): Promise<GivingCampaign[]> => {
      const { data, error } = await supabase.functions.invoke('giving-campaigns', { body: {} });
      if (error) throw error;
      return (((data as any)?.campaigns ?? []) as GivingCampaign[]);
    },
  });

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
      // Błąd pokazujemy — pusty wynik wyglądał jak „brak darowizn” albo brak powiązania konta.
      if (error) throw error;
      return (data as MyGivingData) ?? empty;
    },
  });
