import { useQuery } from '@tanstack/react-query';
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
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const start = new Date(row.date + 'T00:00:00');
    const fallbackTitle = `Nabożeństwo · ${format(start, 'EEEE', { locale: pl })}`;
    return {
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
    };
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
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const time = row.time && /^\d{1,2}:\d{2}/.test(row.time) ? row.time : '00:00';
    const endTime = row.end_time && /^\d{1,2}:\d{2}/.test(row.end_time) ? row.end_time : null;
    return {
      id: `event-${row.id}`,
      source: 'event' as const,
      title: row.title,
      startsAt: new Date(`${row.date}T${time}:00`),
      endsAt: endTime ? new Date(`${row.date}T${endTime}:00`) : null,
      location: null,
      description: row.description ?? null,
      campusId: row.campus_id ?? null,
      isMine: false,
    } satisfies AgendaEvent;
  });
};

const fetchMinistry = async (
  table: string,
  source: EventSource,
  fromIso: string,
  toIso: string,
  scope: CampusScope,
): Promise<AgendaEvent[]> => {
  const base = supabase
    .from(table)
    .select('id, title, description, start_date, end_date, location, campus_id');
  const { data, error } = await scope
    .withCampusFilter(base)
    .gte('start_date', fromIso)
    .lte('start_date', toIso)
    .order('start_date', { ascending: true });
  if (error) {
    console.warn(`[agenda] ${table} skipped:`, error.message);
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
        ...MINISTRY_TABLES.map((m) => fetchMinistry(m.table, m.source, fromIso, toIso, scope)),
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
