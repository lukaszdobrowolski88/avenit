import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Kalendarz = JEDNA tabela `events` (jak web po unifikacji): module_key wskazuje kalendarz
// modułu (NULL/'general' = ogólny), event_type typ, program_id podpięty plan. Programy i stare
// tabele zespołów (module_events, *_events) nie są już źródłem — dawały duplikaty i rozjazd z webem.

// Klucz kalendarza wydarzenia: module_key albo 'general'.
export type EventSource = string;

export interface AgendaEvent {
  id: string; // `event-<id>` (klucz listy)
  eventId: number;
  source: EventSource;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  moduleKey: string | null;
  eventType: string | null;
  programId: number | null;
  campusId: number | null;
  isMine: boolean;
  // Moja rola na tym wydarzeniu (grafik), gdy służę.
  myRole: string | null;
}

// `date` przychodzi z API jako pełny znacznik czasu (2026-10-11T00:00:00.000Z) — bierzemy
// samą datę i składamy z `time`. Doklejanie godziny do znacznika dawało północ („cały dzień”).
const ymdOf = (v: unknown): string | null => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const hmOf = (v: unknown): string | null => {
  const m = String(v ?? '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};
export const localDate = (ymd: string, hm?: string | null): Date => {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = (hm ?? '00:00').split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0);
};
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

const isSoftError = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === '403' || code === '42501' || code === '42P01';
};

export const EVENT_COLUMNS =
  'id, title, description, date, time, end_time, end_date, location, module_key, event_type, program_id, campus_id';

export const toAgendaEvent = (row: any): AgendaEvent | null => {
  const ymd = ymdOf(row.date);
  if (!ymd) return null;
  const time = hmOf(row.time);
  const end = hmOf(row.end_time);
  const endYmd = ymdOf(row.end_date) ?? ymd;
  return {
    id: `event-${row.id}`,
    eventId: Number(row.id),
    source: row.module_key || 'general',
    title: (row.title && String(row.title).trim()) || 'Wydarzenie',
    startsAt: localDate(ymd, time),
    endsAt: end ? localDate(endYmd, end) : endYmd !== ymd ? localDate(endYmd, null) : null,
    allDay: !time,
    location: row.location ?? null,
    description: row.description ?? null,
    moduleKey: row.module_key ?? null,
    eventType: row.event_type ?? null,
    programId: row.program_id ?? null,
    campusId: row.campus_id ?? null,
    isMine: false,
    myRole: null,
  };
};

const csv = (v: unknown): string[] =>
  String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

// Etykiety ról służb: `${team_type}|${field_key}` → nazwa (team_roles, jak web).
const fetchRoleLabels = async (): Promise<Map<string, string>> => {
  const { data } = await supabase.from('team_roles').select('team_type, field_key, name');
  return new Map(((data ?? []) as any[]).map((r) => [`${r.team_type}|${r.field_key}`, String(r.name)]));
};

// Moje służby na wydarzeniu: grafik trzyma imiona w events.assignments
// ({team:{field_key:"Imię, Imię"}}), a schedule_assignments — przydziały po e-mailu (status).
// Tak samo liczy „mnie” zakładka Grafik służby. Odrzucone się nie liczą.
const myRolesByEvent = async (
  rows: any[],
  me: { email: string | null; name: string | null },
): Promise<Map<number, string>> => {
  const out = new Map<number, string>();
  if (!me.email && !me.name) return out;
  const [labels, sa] = await Promise.all([
    fetchRoleLabels(),
    me.email
      ? supabase.from('schedule_assignments').select('event_id, team_type, role_key, role_label, assigned_name, status').eq('assigned_email', me.email)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const myNames = new Set<string>(me.name ? [me.name] : []);
  for (const a of ((sa as any).data ?? []) as any[]) {
    if (a.event_id == null) continue;
    if (a.assigned_name) myNames.add(String(a.assigned_name));
    if (a.status === 'rejected') continue;
    out.set(Number(a.event_id), a.role_label || labels.get(`${a.team_type}|${a.role_key}`) || a.role_key || 'Służba');
  }
  for (const row of rows) {
    if (out.has(Number(row.id)) || !row.assignments || typeof row.assignments !== 'object') continue;
    for (const [team, roles] of Object.entries(row.assignments as Record<string, Record<string, string>>)) {
      for (const [key, names] of Object.entries(roles ?? {})) {
        if (key === 'notatki' || key === 'absencja') continue;
        if (csv(names).some((n) => myNames.has(n))) {
          out.set(Number(row.id), labels.get(`${team}|${key}`) ?? key);
          break;
        }
      }
      if (out.has(Number(row.id))) break;
    }
  }
  return out;
};

export const useAgenda = (
  params: {
    fromDays?: number;
    toDays?: number;
    userEmail?: string | null;
    userName?: string | null;
  } & CampusScope,
) => {
  const { fromDays = -60, toDays = 120, userEmail = null, userName = null, selectedCampusId, withCampusFilter } = params;
  return useQuery({
    queryKey: ['agenda', selectedCampusId, fromDays, toDays, userEmail, userName],
    queryFn: async (): Promise<AgendaEvent[]> => {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() + fromDays);
      const to = new Date(now);
      to.setDate(to.getDate() + toDays);
      const base = supabase.from('events').select(`${EVENT_COLUMNS}, assignments, is_archived`);
      const { data, error } = await withCampusFilter(base)
        .gte('date', ymdLocal(from))
        .lte('date', ymdLocal(to))
        .order('date', { ascending: true });
      if (error) {
        if (isSoftError(error)) return [];
        throw error;
      }
      const rows = ((data ?? []) as any[]).filter((r) => !r.is_archived);
      const mine = await myRolesByEvent(rows, { email: userEmail, name: userName }).catch(() => new Map<number, string>());
      const all = rows.flatMap((row) => {
        const ev = toAgendaEvent(row);
        if (!ev) return [];
        const role = mine.get(ev.eventId);
        if (role) {
          ev.isMine = true;
          ev.myRole = role;
        }
        return [ev];
      });
      all.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      return all;
    },
  });
};

// ── Zapisy na wydarzenia (RSVP / obecność) ─────────────────────────────────
// event_registrations = T(null): każdy zalogowany czyta/pisze (jak prayer_interactions).
// event_id = events.id (web: EventRSVP).

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
