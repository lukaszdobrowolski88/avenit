import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Zapis „tylko własnej” intencji: serwer zawęża wiersze do autora — pusty wynik = nie moja
// (albo już usunięta). Mówimy to wprost zamiast cichego „sukcesu”.
const ensureRows = (data: unknown, message: string) => {
  if (Array.isArray(data) && data.length === 0) throw new Error(message);
};

export type PrayerCategory = 'zdrowie' | 'rodzina' | 'finanse' | 'duchowe' | 'inne';
export type PrayerStatus = 'active' | 'answered' | 'archived';
export type PrayerVisibility = 'public' | 'leaders_only';

export interface PrayerRequest {
  id: string;
  // user_email NIE jest wystawiany (prywatność, migracja 062/063). Listę czytamy z fn
  // `prayer-wall`, która liczy flagi serwerowo i zwraca je per wiersz — bez e-maili.
  user_name: string | null;
  requester_name: string | null;
  content: string;
  category: PrayerCategory;
  visibility: PrayerVisibility;
  is_anonymous: boolean;
  is_active: boolean;
  status: PrayerStatus;
  answered_testimony: string | null;
  created_at: string;
  updated_at: string;
  prayer_count: number;
  // Flagi liczone serwerowo przez fn prayer-wall:
  i_am_praying: boolean; // czy JA kliknąłem „modlę się"
  is_author: boolean; // czy JA jestem autorem (akcje edytuj/usuń/wysłuchana)
  avatar_url: string | null; // avatar autora (tylko nie-anonimowi)
}

// Lista modlitw przez fn `prayer-wall` (ta sama, której używa web). Zwraca prośby BEZ
// e-maili, z flagami i_am_praying / is_author / prayer_count policzonymi serwerowo oraz
// filtrem leaders_only po stronie serwera. Pobieramy całość (bez archived, poza moimi);
// filtrowanie po statusie/kategorii/„moje"/szukaniu robimy po stronie klienta.
export const usePrayerRequests = () =>
  useQuery({
    queryKey: ['prayers', 'wall'],
    queryFn: async (): Promise<PrayerRequest[]> => {
      const { data, error } = await supabase.functions.invoke('prayer-wall');
      if (error) throw error;
      return (((data as any)?.requests ?? []) as PrayerRequest[]);
    },
  });

export const useTogglePrayer = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      currentlyPraying,
    }: {
      requestId: string;
      currentlyPraying: boolean;
    }) => {
      if (!userEmail) throw new Error('Twoja sesja wygasła. Zaloguj się ponownie.');
      if (currentlyPraying) {
        const { error } = await (supabase.from('prayer_interactions') as any)
          .delete()
          .eq('request_id', requestId)
          .eq('user_email', userEmail)
          .select('request_id');
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('prayer_interactions') as any)
          .insert({ request_id: requestId, user_email: userEmail })
          .select('request_id');
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export interface CreatePrayerInput {
  content: string;
  category: PrayerCategory;
  requester_name?: string | null;
  is_anonymous?: boolean;
  visibility?: PrayerVisibility;
}

export const useCreatePrayer = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePrayerInput) => {
      if (!userEmail) throw new Error('Twoja sesja wygasła. Zaloguj się ponownie.');
      const { error } = await (supabase.from('prayer_requests') as any)
        .insert({
          user_email: userEmail,
          content: input.content,
          category: input.category,
          requester_name: input.requester_name ?? null,
          is_anonymous: input.is_anonymous ?? false,
          visibility: input.visibility ?? 'public',
          status: 'active',
          is_active: true,
        })
        .select('id');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export interface EditPrayerInput {
  id: string;
  content: string;
  category: PrayerCategory;
  requester_name?: string | null;
  is_anonymous?: boolean;
  visibility?: PrayerVisibility;
}

// Edycja WŁASNEJ modlitwy. Zapis wprost do prayer_requests; serwer (allowOwnPrayerWrite)
// przepuszcza update tylko dla autora i tylko na dozwolonych kolumnach — mimo że rola
// „czlonek" nie ma ogólnego res:prayer_requests:update.
export const useEditPrayer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditPrayerInput) => {
      const { data, error } = await (supabase.from('prayer_requests') as any)
        .update({
          content: input.content,
          category: input.category,
          requester_name: input.requester_name ?? null,
          is_anonymous: input.is_anonymous ?? false,
          visibility: input.visibility ?? 'public',
        })
        .eq('id', input.id)
        .select('id');
      if (error) throw error;
      ensureRows(data, 'Możesz edytować tylko własne intencje.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

// Oznaczenie modlitwy jako „wysłuchana" (+ świadectwo) lub cofnięcie do „aktywna".
export const useMarkAnswered = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      answered = true,
      testimony,
    }: {
      id: string;
      answered?: boolean;
      testimony?: string | null;
    }) => {
      const { data, error } = await (supabase.from('prayer_requests') as any)
        .update({
          status: answered ? 'answered' : 'active',
          answered_testimony: answered ? (testimony?.trim() || null) : null,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      ensureRows(data, 'Możesz zmieniać tylko własne intencje.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

// Usunięcie WŁASNEJ modlitwy (serwer wymusza właścicielstwo).
export const useDeletePrayer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase.from('prayer_requests') as any).delete().eq('id', id).select('id');
      if (error) throw error;
      ensureRows(data, 'Możesz usunąć tylko własną intencję.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const CATEGORY_META: Record<
  PrayerCategory,
  { label: string; tint: string; bg: string }
> = {
  // Jeden neutralny styl dla wszystkich kategorii (marka) — rozróżnia je nazwa, bez emoji.
  zdrowie: { label: 'Zdrowie', tint: '#2A2312', bg: '#ECE8DE' },
  rodzina: { label: 'Rodzina', tint: '#2A2312', bg: '#ECE8DE' },
  finanse: { label: 'Finanse', tint: '#2A2312', bg: '#ECE8DE' },
  duchowe: { label: 'Duchowe', tint: '#2A2312', bg: '#ECE8DE' },
  inne: { label: 'Inne', tint: '#2A2312', bg: '#ECE8DE' },
};
