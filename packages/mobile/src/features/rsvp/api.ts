import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Moduł „Zapisy (RSVP)" — ekran zaproszeń członka (member-facing) — czyta tabele `rsvp_invitations`
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

/**
 * Zapis odpowiedzi RSVP przez endpoint /api/fn/rsvp-respond.
 * Body: { token, answer: 'yes'|'no'|'maybe', guests }. Idzie przez shim
 * (functions.invoke), który dołącza X-Tenant (z SecureStore) i token — surowy fetch
 * dodawał X-Tenant tylko z pustego EXPO_PUBLIC_TENANT, więc w buildzie uniwersalnym
 * backend nie rozwiązywał tenanta. Endpoint jest publiczny i identyfikuje po tokenie,
 * ale tenant (którą bazę pytać) musi znać z nagłówka.
 */
export const respondToInvitation = async (params: {
  token: string;
  answer: RsvpAnswer;
  guests?: number;
}): Promise<void> => {
  const { error } = await supabase.functions.invoke('rsvp-respond', {
    body: {
      token: params.token,
      answer: params.answer,
      guests: Math.max(0, params.guests ?? 0),
    },
  });
  // Obiekt błędu (status/kod) — ekran zamienia go na ludzki komunikat (friendlyError).
  if (error) throw error;
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
      // Błąd pokazujemy — pusty wynik wyglądał jak „brak zaproszeń”.
      if (error) throw error;
      return (data as MyInvitationsData) ?? empty;
    },
  });
