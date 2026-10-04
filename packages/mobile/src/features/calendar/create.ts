import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// „Nowe wydarzenie” z głównego kalendarza — kontrakt jak web EventsModule.jsx:90-123.
// Ogólne wydarzenie = module_key NULL; kalendarze modułów z app_settings.event_calendars
// (JSON-owa tablica kluczy), domyślnie lista jak na webie.

const DEFAULT_CALENDARS = ['worship', 'media', 'atmosfera', 'kids', 'homegroups', 'mlodziezowka'];

export const useEventCalendarKeys = () =>
  useQuery({
    queryKey: ['event-calendars'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'event_calendars').maybeSingle();
      try {
        const raw = (data as any)?.value;
        const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(list)) return list.map(String);
      } catch {
        /* domyślna lista */
      }
      return DEFAULT_CALENDARS;
    },
  });

export interface NewCalendarEvent {
  title: string;
  moduleKey: string | null;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string | null;
  description?: string | null;
}

export const useCreateCalendarEvent = (userEmail: string | null, campusIdForInsert: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: NewCalendarEvent) => {
      const { error } = await (supabase.from('events') as any).insert([
        {
          title: e.title,
          module_key: e.moduleKey,
          date: e.date,
          time: e.time,
          end_time: e.endTime,
          location: e.location,
          description: e.description ?? null,
          created_by: userEmail,
          campus_id: campusIdForInsert,
        },
      ]);
      if (error) throw new Error(error.message || 'Nie udało się dodać wydarzenia.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
};

const invalidateEvents = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['agenda'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['team'] });
  qc.invalidateQueries({ queryKey: ['event-detail'] });
};

// Edycja podstawowych pól (jak karta „Termin i miejsce” na webie). Opis sformatowany
// (details_html) zostaje na webie — z telefonu zmieniamy tylko zwykły opis.
export const useUpdateCalendarEvent = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: NewCalendarEvent) => {
      const patch: Record<string, unknown> = {
        title: e.title,
        module_key: e.moduleKey,
        date: e.date,
        time: e.time,
        end_time: e.endTime,
        location: e.location,
      };
      if (e.description !== undefined) patch.description = e.description;
      const { error } = await (supabase.from('events') as any).update(patch).eq('id', id);
      if (error) throw new Error(error.message || 'Nie udało się zapisać zmian.');
    },
    onSuccess: () => invalidateEvents(qc),
  });
};

export const useDeleteCalendarEvent = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw new Error(error.message || 'Nie udało się usunąć wydarzenia.');
    },
    onSuccess: () => invalidateEvents(qc),
  });
};
