import { supabase } from '../../lib/supabase';

// Przypisania do służby (schedule_assignments) z dołączonym programem LUB wydarzeniem.
//
// Dlaczego nie embed: API Avenit nie ma relacji schedule_assignments → programs/events
// (registry.js), a selectparser nie zna `!inner` — zapytania typu
// `programs!inner(...)` kończyły się 400, przez co „Moja służba", zaproszenia i grafik
// były w apce zawsze puste. Pobieramy przypisania prosto, a cele dociągamy po id.
//
// Od migracji 055 grafik żyje na wydarzeniach (event_id); stare przypisania mają program_id.

export interface AssignmentRow {
  id: string;
  teamType: string;
  roleKey: string;
  roleLabel: string | null;
  assignedEmail: string | null;
  assignedName: string | null;
  assignedByName: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string | null;
  // Cel przypisania:
  kind: 'program' | 'event';
  programId: number | null;
  eventId: string | null;
  date: string; // YYYY-MM-DD ('' gdy cel nieznany)
  time: string | null;
  title: string | null;
  typeName: string | null;
  typeColor: string | null;
}

const COLS =
  'id, program_id, event_id, team_type, role_key, role_label, assigned_email, assigned_name, assigned_by_name, status, created_at';

type Filter = (q: any) => any;

export async function fetchAssignments(filter: Filter, limit = 300): Promise<AssignmentRow[]> {
  const { data, error } = await filter(supabase.from('schedule_assignments').select(COLS)).limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const programIds = [...new Set(rows.map((r) => r.program_id).filter((x) => x != null))];
  const eventIds = [...new Set(rows.map((r) => r.event_id).filter((x) => x != null))];

  const [programsRes, eventsRes] = await Promise.all([
    programIds.length
      ? supabase.from('programs').select('id, date, title, type:program_types(id, name, color)').in('id', programIds)
      : Promise.resolve({ data: [] as any[] }),
    eventIds.length
      ? supabase.from('events').select('id, title, date, time, event_type, module_key').in('id', eventIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const programs = new Map<string, any>(((programsRes as any).data ?? []).map((p: any) => [String(p.id), p]));
  const events = new Map<string, any>(((eventsRes as any).data ?? []).map((e: any) => [String(e.id), e]));

  return rows.map((r) => {
    const ev = r.event_id != null ? events.get(String(r.event_id)) : null;
    const pr = r.program_id != null ? programs.get(String(r.program_id)) : null;
    return {
      id: String(r.id),
      teamType: r.team_type ?? '',
      roleKey: r.role_key ?? '',
      roleLabel: r.role_label ?? null,
      assignedEmail: r.assigned_email ?? null,
      assignedName: r.assigned_name ?? null,
      assignedByName: r.assigned_by_name ?? null,
      status: (r.status ?? 'pending') as AssignmentRow['status'],
      createdAt: r.created_at ?? null,
      kind: ev ? 'event' : 'program',
      programId: pr ? Number(pr.id) : r.program_id ?? null,
      eventId: r.event_id != null ? String(r.event_id) : null,
      date: String(ev?.date ?? pr?.date ?? '').slice(0, 10),
      time: ev?.time ? String(ev.time).slice(0, 5) : null,
      title: ev?.title ?? pr?.title ?? null,
      typeName: pr?.type?.name ?? ev?.event_type ?? null,
      typeColor: pr?.type?.color ?? null,
    } satisfies AssignmentRow;
  });
}

export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Etykieta roli: role_label (z grafiku na wydarzeniu) albo klucz roli.
export const roleText = (a: Pick<AssignmentRow, 'teamType' | 'roleKey' | 'roleLabel'>) =>
  [a.teamType, a.roleLabel || a.roleKey].filter(Boolean).join(' · ');
