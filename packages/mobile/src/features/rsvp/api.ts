import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Moduł „Moje zaproszenia" (member-facing, RSVP) — czyta tabele `rsvp_invitations`
// oraz `rsvp_campaigns` filtrując po zalogowanym członku. Powiązanie member↔auth jest
// luźne: najpierw app_users.member_id (niezawodne), potem members po e-mailu; dodatkowo
// zaproszenia bywają adresowane bezpośrednio na e-mail (kolumna email), więc łączymy oba.
// Tabele RSVP tworzą migracje web osobno — brak tabeli obsługujemy jako pusty stan, nie błąd.

export type RsvpAnswer = 'yes' | 'no' | 'maybe';
export type RsvpStatus = 'pending' | RsvpAnswer;

export interface RsvpCampaign {
  id: string;
  title: string | null;
  event_type: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
}

export interface Invitation {
  id: string;
  campaign_id: string;
  token: string;
  status: RsvpStatus | string | null;
  guests_count: number | null;
  campaign: RsvpCampaign | null;
}

export interface MyInvitationsData {
  /** Czy udało się powiązać zalogowane konto z rekordem członka. */
  memberResolved: boolean;
  invitations: Invitation[];
}

// Wywołanie funkcji backendu Avenit (/api/fn/*) — wzorzec z src/lib/push.ts (callFn).
const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const TENANT = process.env.EXPO_PUBLIC_TENANT || '';

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

const todayISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * Zapis odpowiedzi RSVP przez publiczny endpoint /api/fn/rsvp-respond.
 * Body: { token, answer: 'yes'|'no'|'maybe', guests }. Dołączamy token sesji i X-Tenant
 * (jak callFn w push.ts), choć endpoint jest publiczny (isPublic) i identyfikuje po tokenie.
 */
export const respondToInvitation = async (params: {
  token: string;
  answer: RsvpAnswer;
  guests?: number;
}): Promise<void> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${API_URL}/api/fn/rsvp-respond`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TENANT ? { 'X-Tenant': TENANT } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      token: params.token,
      answer: params.answer,
      guests: Math.max(0, params.guests ?? 0),
    }),
  });
  if (!res.ok) {
    let msg = 'Nie udało się zapisać odpowiedzi';
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      // ignore — użyjemy komunikatu domyślnego
    }
    throw new Error(msg);
  }
};

export const useMyInvitations = (userEmail: string | null) =>
  useQuery({
    queryKey: ['rsvp', 'mine', userEmail],
    queryFn: async (): Promise<MyInvitationsData> => {
      const empty: MyInvitationsData = { memberResolved: false, invitations: [] };
      if (!userEmail) return empty;

      // 1. Powiązanie członka: najpierw app_users.member_id (niezawodne), potem e-mail.
      let memberId: string | number | null = null;
      try {
        const { data: appUser } = await supabase
          .from('app_users')
          .select('member_id')
          .eq('email', userEmail)
          .maybeSingle();
        memberId = (appUser as { member_id?: string | number | null } | null)?.member_id ?? null;
      } catch {
        // brak kolumny member_id / tabeli — spróbujemy dopasować po e-mailu poniżej.
      }

      if (memberId == null) {
        try {
          const { data: member } = await supabase
            .from('members')
            .select('id')
            .eq('email', userEmail)
            .maybeSingle();
          memberId = (member as { id?: string | number } | null)?.id ?? null;
        } catch {
          // brak tabeli members / błąd — dalej spróbujemy po e-mailu w zaproszeniach.
        }
      }

      const memberResolved = memberId != null;

      // 2. Zaproszenia tej osoby: po member_id (jeśli znane) oraz po e-mailu (zaproszenia
      //    bywają adresowane bezpośrednio). Łączymy i deduplikujemy po id.
      const byId = new Map<string, Invitation>();
      const cols = 'id, campaign_id, token, status, guests_count';
      const collect = (rows: unknown[]) => {
        for (const row of (rows ?? []) as Invitation[]) {
          if (row?.id != null) byId.set(String(row.id), { ...row, campaign: null });
        }
      };

      try {
        if (memberId != null) {
          const { data, error } = await supabase
            .from('rsvp_invitations')
            .select(cols)
            .eq('member_id', memberId)
            .limit(200);
          if (error) throw error;
          collect(data ?? []);
        }
        {
          const { data, error } = await supabase
            .from('rsvp_invitations')
            .select(cols)
            .eq('email', userEmail)
            .limit(200);
          if (error) throw error;
          collect(data ?? []);
        }
      } catch (err) {
        // Brak tabeli zaproszeń — członek mógł zostać rozpoznany, ale bez zaproszeń.
        if (isMissingTable(err)) return { memberResolved, invitations: [] };
        return { memberResolved, invitations: [] };
      }

      const invitations = Array.from(byId.values());
      if (invitations.length === 0) return { memberResolved, invitations: [] };

      // 3. Dane kampanii — jedno zapytanie po campaign_id IN (...), łączymy w kodzie.
      const campaignIds = Array.from(
        new Set(invitations.map((i) => i.campaign_id).filter((x): x is string => Boolean(x))),
      );
      const campaigns = new Map<string, RsvpCampaign>();
      if (campaignIds.length > 0) {
        try {
          const { data: campRows } = await supabase
            .from('rsvp_campaigns')
            .select('id, title, event_type, event_date, event_time, location')
            .in('id', campaignIds);
          for (const c of (campRows ?? []) as RsvpCampaign[]) campaigns.set(String(c.id), c);
        } catch {
          // kampanie opcjonalne — pokażemy zaproszenie bez metadanych.
        }
      }

      const today = todayISO();
      const withCampaign = invitations
        .map((inv) => ({ ...inv, campaign: campaigns.get(String(inv.campaign_id)) ?? null }))
        // Ukryj przeszłe wydarzenia; zaproszenia bez daty zostawiamy jako „nadchodzące".
        .filter((inv) => {
          const d = inv.campaign?.event_date;
          return !d || d >= today;
        })
        // Sortuj po dacie wydarzenia rosnąco; bez daty na końcu.
        .sort((a, b) => {
          const da = a.campaign?.event_date ?? '9999-12-31';
          const db = b.campaign?.event_date ?? '9999-12-31';
          return da < db ? -1 : da > db ? 1 : 0;
        });

      return { memberResolved, invitations: withCampaign };
    },
  });
