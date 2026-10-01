import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';

export type EventSource =
  | 'program'
  | 'event'
  | 'worship'
  | 'media'
  | 'atmosfera'
  | 'kids'
  | 'homegroups';

export interface AgendaEvent {
  id: string;
  source: EventSource;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  description: string | null;
  programId?: number;
  campusId?: number | null;
  isMine: boolean;
}

const MINISTRY_TABLES: { table: string; source: EventSource }[] = [
  { table: 'worship_events', source: 'worship' },
  { table: 'media_events', source: 'media' },
  { table: 'atmosfera_events', source: 'atmosfera' },
  { table: 'kids_events', source: 'kids' },
  { table: 'homegroups_events', source: 'homegroups' },
];

const safeDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = String(s).match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h, mi, se] = m;
  const out = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    h ? Number(h) : 0,
    mi ? Number(mi) : 0,
    se ? Number(se) : 0,
  );
  return Number.isNaN(out.getTime()) ? null : out;
};

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

const fetchPrograms = async (
  fromIso: string,
  toIso: string,
  scope: CampusScope,
): Promise<AgendaEvent[]> => {
  const base = supabase.from('programs').select('id, date, title, campus_id');
  const { data, error } = await scope
    .withCampusFilter(base)
    .gte('date', fromIso.slice(0, 10))
    .lte('date', toIso.slice(0, 10))
    .order('date', { ascending: true });
  if (error) {
    // Brak uprawnień / brak tabeli → pokaż CZĘŚĆ kalendarza (jak moduły służb), nie błąd
    // całości. Prawdziwe awarie (5xx) nadal propagują do widoku błędu z „Spróbuj ponownie".
    const code = (error as { code?: string }).code;
    if (code === '403' || code === '42501' || code === '42P01') return [];
    throw error;
  }
  return (data ?? []).flatMap((row: any) => {
    // Guard na złą/pustą datę — inaczej format(Invalid Date) rzuca "Invalid time value"
    // i wywala CAŁĄ agendę (kalendarz pokazuje błąd zamiast wydarzeń).
    const start = safeDate(row.date);
    if (!start) return [];
    const fallbackTitle = `Nabożeństwo · ${format(start, 'EEEE', { locale: pl })}`;
    return [
      {
        id: `program-${row.id}`,
        source: 'program' as const,
        title: (row.title && String(row.title).trim()) || fallbackTitle,
        startsAt: start,
        endsAt: null,
        location: null,
        description: null,
        programId: row.id,
        campusId: row.campus_id ?? null,
        isMine: false,
      } satisfies AgendaEvent,
    ];
  });
};

const fetchGenericEvents = async (
  fromIso: string,
  toIso: string,
  scope: CampusScope,
): Promise<AgendaEvent[]> => {
  const base = supabase
    .from('events')
    .select('id, title, description, date, time, end_time, campus_id');
  const { data, error } = await scope
    .withCampusFilter(base)
    .gte('date', fromIso.slice(0, 10))
    .lte('date', toIso.slice(0, 10))
    .order('date', { ascending: true });
  if (error) {
    // Brak uprawnień / brak tabeli → pokaż CZĘŚĆ kalendarza (jak moduły służb), nie błąd
    // całości. Prawdziwe awarie (5xx) nadal propagują do widoku błędu z „Spróbuj ponownie".
    const code = (error as { code?: string }).code;
    if (code === '403' || code === '42501' || code === '42P01') return [];
    throw error;
  }
  return (data ?? []).flatMap((row: any) => {
    const time = row.time && /^\d{1,2}:\d{2}/.test(row.time) ? row.time : '00:00';
    const endTime = row.end_time && /^\d{1,2}:\d{2}/.test(row.end_time) ? row.end_time : null;
    const startsAt = safeDate(`${row.date}T${time}:00`);
    if (!startsAt) return []; // pomiń wydarzenie ze złą datą (nie wywracaj agendy)
    return [
      {
        id: `event-${row.id}`,
        source: 'event' as const,
        title: row.title,
        startsAt,
        endsAt: endTime ? safeDate(`${row.date}T${endTime}:00`) : null,
        location: null,
        description: row.description ?? null,
        campusId: row.campus_id ?? null,
        isMine: false,
      } satisfies AgendaEvent,
    ];
  });
};

const fetchMinistry = async (
  source: EventSource,
  fromIso: string,
  toIso: string,
  scope: CampusScope,
): Promise<AgendaEvent[]> => {
  // Wydarzenia modułów służb zunifikowane w module_events (team_type == source dla tych 5).
  const base = supabase
    .from('module_events')
    .select('id, title, description, start_date, end_date, location, campus_id')
    .eq('team_type', source);
  const { data, error } = await scope
    .withCampusFilter(base)
    .gte('start_date', fromIso)
    .lte('start_date', toIso)
    .order('start_date', { ascending: true });
  if (error) {
    console.warn(`[agenda] module_events(${source}) skipped:`, error.message);
    return [];
  }
  return (data ?? []).flatMap((row: any) => {
    const start = safeDate(row.start_date);
    if (!start) return [];
    return [
      {
        id: `${source}-${row.id}`,
        source,
        title: row.title,
        startsAt: start,
        endsAt: safeDate(row.end_date),
        location: row.location ?? null,
        description: row.description ?? null,
        campusId: row.campus_id ?? null,
        isMine: false,
      } satisfies AgendaEvent,
    ];
  });
};

const fetchMyAssignedProgramIds = async (email: string | null): Promise<Set<number>> => {
  if (!email) return new Set();
  const { data, error } = await supabase
    .from('schedule_assignments')
    .select('program_id')
    .eq('assigned_email', email);
  if (error) {
    console.warn('[agenda] schedule_assignments skipped:', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: any) => r.program_id));
};

export const useAgenda = (
  params: {
    fromDays?: number;
    toDays?: number;
    userEmail?: string | null;
  } & CampusScope,
) => {
  const {
    fromDays = -7,
    toDays = 90,
    userEmail = null,
    selectedCampusId,
    withCampusFilter,
  } = params;
  return useQuery({
    queryKey: ['agenda', selectedCampusId, fromDays, toDays, userEmail],
    queryFn: async (): Promise<AgendaEvent[]> => {
      const scope: CampusScope = { selectedCampusId, withCampusFilter };
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() + fromDays);
      const to = new Date(now);
      to.setDate(to.getDate() + toDays);

      const fromIso = from.toISOString();
      const toIso = to.toISOString();

      const [programs, events, ...ministries] = await Promise.all([
        fetchPrograms(fromIso, toIso, scope),
        fetchGenericEvents(fromIso, toIso, scope),
        ...MINISTRY_TABLES.map((m) => fetchMinistry(m.source, fromIso, toIso, scope)),
      ]);

      const myProgramIds = await fetchMyAssignedProgramIds(userEmail);

      const all = [...programs, ...events, ...ministries.flat()];
      for (const e of all) {
        if (e.programId && myProgramIds.has(e.programId)) e.isMine = true;
      }
      all.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      return all;
    },
  });
};

// ── Zapisy na wydarzenia (RSVP / obecność) ─────────────────────────────────
// event_registrations = T(null): każdy zalogowany czyta/pisze (jak prayer_interactions).
// JEDNA tabela obsługuje wydarzenia ogólne (events) i modułów (module_events) — event_id
// to surowe id wydarzenia (web robi tak samo: EventRSVP + EventsTab). „Surowe id" z agendy
// wyciągamy z klucza „<source>-<n>".
export const rawEventId = (agendaId: string): number | null => {
  const n = Number(String(agendaId).split('-').pop());
  return Number.isFinite(n) ? n : null;
};

export interface EventRegistration {
  id: number;
  user_email: string;
  full_name: string | null;
  guests_count: number;
  status: string;
}

// Rejestracje danego wydarzenia (bez „not_going"). Błędy braku prawa/tabeli → pusto
// (panel RSVP po prostu zniknie), prawdziwe awarie propagują.
export const useEventRegistrations = (eventId: number | null) =>
  useQuery({
    queryKey: ['event-rsvp', eventId],
    enabled: eventId != null && Number.isFinite(eventId),
    queryFn: async (): Promise<EventRegistration[]> => {
      const { data, error } = await supabase
        .from('event_registrations')
        .select('id, user_email, full_name, guests_count, status')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      if (error) {
        const code = (error as { code?: string }).code;
        if (code === '403' || code === '42501' || code === '42P01') return [];
        throw error;
      }
      return ((data ?? []) as unknown as EventRegistration[]).filter(
        (r) => r.status !== 'not_going',
      );
    },
  });

// Flagi rejestracji wydarzenia ogólnego (events). Ładowane leniwie — brak kolumny na
// danym tenancie degraduje tylko panel RSVP, nie całą agendę (schema-truth).
export interface EventRsvpMeta {
  registration_required: boolean;
  max_participants: number | null;
  is_paid: boolean;
}
export const useEventRsvpMeta = (eventId: number | null, isGenericEvent: boolean) =>
  useQuery({
    queryKey: ['event-rsvp-meta', eventId],
    enabled: isGenericEvent && eventId != null && Number.isFinite(eventId),
    queryFn: async (): Promise<EventRsvpMeta | null> => {
      const { data, error } = await supabase
        .from('events')
        .select('registration_required, max_participants, is_paid')
        .eq('id', eventId)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as any;
      return {
        registration_required: !!row.registration_required,
        max_participants: row.max_participants ?? null,
        is_paid: !!row.is_paid,
      };
    },
  });

export const useSignUpEvent = (eventId: number | null, userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ guests, fullName }: { guests: number; fullName: string }) => {
      if (eventId == null || !userEmail) throw new Error('Brak danych do zapisu');
      const { error } = await (supabase.from('event_registrations') as any).insert([
        {
          event_id: eventId,
          user_email: userEmail,
          full_name: fullName || userEmail.split('@')[0],
          guests_count: Math.max(0, guests),
          status: 'going',
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-rsvp', eventId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useCancelEvent = (eventId: number | null, userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (eventId == null || !userEmail) throw new Error('Brak danych');
      const { error } = await supabase
        .from('event_registrations')
        .delete()
        .eq('event_id', eventId)
        .eq('user_email', userEmail);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-rsvp', eventId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
