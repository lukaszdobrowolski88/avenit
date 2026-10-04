import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Rezerwacje sal — kontrakt jak web src/modules/Rooms/** (resources + resource_bookings).
// Kolizja jak BookingsTab.jsx:110-121: istniejąca.start < nowa.koniec && istniejąca.koniec > nowa.start
// (rezerwacje „styk w styk” dozwolone). Anulowanie = usunięcie.

export interface Resource {
  id: string;
  name: string;
  type: string | null;
  capacity: number | null;
  color: string | null;
  location: string | null;
}

export interface Booking {
  id: string;
  resourceId: string;
  title: string;
  startAt: string;
  endAt: string;
  bookedBy: string | null;
  note: string | null;
}

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(q: T) => T;
}

const asList = (d: unknown) => ((d ?? []) as any[]);

export const useResources = (scope: CampusScope) =>
  useQuery({
    queryKey: ['rooms', 'resources', scope.selectedCampusId],
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await scope.withCampusFilter(supabase.from('resources').select('*')).order('name', { ascending: true });
      if (error) throw error;
      return asList(data)
        .filter((r) => r.is_active !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name ?? 'Sala'),
          type: r.type ?? null,
          capacity: r.capacity ?? null,
          color: r.color ?? null,
          location: r.location ?? null,
        }));
    },
  });

const dayRange = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

export const useBookingsForDay = (ymd: string) =>
  useQuery({
    queryKey: ['rooms', 'bookings', ymd],
    queryFn: async (): Promise<Booking[]> => {
      const { start, end } = dayRange(ymd);
      const { data, error } = await supabase
        .from('resource_bookings')
        .select('*')
        .lt('start_at', end)
        .gt('end_at', start)
        .order('start_at', { ascending: true });
      if (error) throw error;
      return asList(data).map((b) => ({
        id: String(b.id),
        resourceId: String(b.resource_id),
        title: String(b.title ?? 'Rezerwacja'),
        startAt: String(b.start_at),
        endAt: String(b.end_at),
        bookedBy: b.booked_by ?? null,
        note: b.note ?? null,
      }));
    },
  });

export class BookingConflict extends Error {
  conflicts: { title: string; startAt: string; endAt: string }[];
  constructor(conflicts: { title: string; startAt: string; endAt: string }[]) {
    super('Sala jest zajęta w tym czasie.');
    this.conflicts = conflicts;
  }
}

export const useCreateBooking = (userEmail: string | null, campusId: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: { resourceId: string; title: string; startAt: Date; endAt: Date; note: string | null }) => {
      if (b.endAt <= b.startAt) throw new Error('Koniec musi być po początku.');
      const { data: clash, error: cErr } = await supabase
        .from('resource_bookings')
        .select('title, start_at, end_at')
        .eq('resource_id', b.resourceId)
        .lt('start_at', b.endAt.toISOString())
        .gt('end_at', b.startAt.toISOString());
      if (cErr) throw cErr;
      if (asList(clash).length) {
        throw new BookingConflict(asList(clash).map((c) => ({ title: c.title, startAt: c.start_at, endAt: c.end_at })));
      }
      const { error } = await (supabase.from('resource_bookings') as any).insert({
        resource_id: b.resourceId,
        title: b.title,
        start_at: b.startAt.toISOString(),
        end_at: b.endAt.toISOString(),
        booked_by: userEmail,
        note: b.note,
        recurrence_group: null,
        campus_id: campusId,
      });
      if (error) throw new Error(error.message || 'Nie udało się zarezerwować.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms', 'bookings'] }),
  });
};

export const useCancelBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('resource_bookings').delete().eq('id', id);
      if (error) throw new Error(error.message || 'Nie udało się anulować.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms', 'bookings'] }),
  });
};
