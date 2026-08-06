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

      // Prywatność: zaproszenia czyta serwerowy endpoint /api/fn/my-invitations,
      // który ustala członka z ZALOGOWANEGO usera (nie z parametru) i zwraca tylko
      // nadchodzące, posortowane. Bezpośredni odczyt rsvp_* odsłaniałby cudze
      // zaproszenia (uprawnienia są per-tabela).
      const { data, error } = await supabase.functions.invoke('my-invitations');
      if (error || !data) return empty;
      return data as MyInvitationsData;
    },
  });
