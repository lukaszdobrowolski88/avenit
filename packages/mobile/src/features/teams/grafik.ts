import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantWebBase } from '../../lib/supabase';
import { todayYmd } from '../schedule/assignments';

// Grafik służby nad WYDARZENIAMI — kontrakt 1:1 z webem (src/modules/shared/ScheduleTab.jsx
// + hooks/useScheduleAssignments.js):
//   • obsada: events.assignments[team][field_key] = „Imię Nazwisko, Imię Nazwisko” (CSV),
//     nieobecni: [team].absencja (CSV), notatka: [team].notatki,
//   • każda zmiana obsady synchronizuje schedule_assignments (event_id, team_type, role_key,
//     assigned_name) — przypisanie siebie od razu „accepted”, reszta „pending”,
//   • zaproszenia (mail + push) wysyła fn send-assignment-invites { eventId, teamType }.

// Tabela osób służby — jak TEAM_MEMBER_TABLE na webie.
const MEMBER_TABLE: Record<string, string> = {
  worship: 'worship_team',
  media: 'media_team',
  atmosfera: 'atmosfera_members',
  kids: 'kids_teachers',
  mc: 'custom_mc_members',
};
export const memberTableFor = (team: string) => MEMBER_TABLE[team] ?? `custom_${team}_members`;

export const csvNames = (v: unknown): string[] =>
  String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const asList = (d: unknown) => ((d ?? []) as any[]);
const parse = (v: unknown) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

export type AsgStatus = 'pending' | 'accepted' | 'rejected';

export interface GrafikMember {
  id: string;
  name: string;
  email: string | null;
  roleIds: string[];
  active?: boolean;
}
export interface GrafikRoleDef {
  id: string | null;
  key: string;
  label: string;
}
export interface GrafikAssignment {
  id: string;
  roleKey: string;
  name: string;
  email: string | null;
  status: AsgStatus;
  emailSent: boolean;
}
export interface GrafikEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  title: string;
  campusId: number | null;
  team: Record<string, string>; // events.assignments[team]
  sa: GrafikAssignment[];
}
export interface GrafikData {
  events: GrafikEvent[];
  roles: GrafikRoleDef[];
  members: GrafikMember[];
}

const KEY = (team: string) => ['team', team, 'grafik-v2'] as const;

export const useGrafik = (team: string) =>
  useQuery({
    queryKey: KEY(team),
    queryFn: async (): Promise<GrafikData> => {
      const table = memberTableFor(team);
      // Kwartał wstecz — zakładka „Minione” bez osobnego zapytania.
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const fromYmd = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      const [rulesRes, eventsRes, rolesRes, membersRes, mrRes] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'event_type_teams').maybeSingle(),
        supabase
          .from('events')
          .select('id, title, date, time, event_type, module_key, assignments, team_types, campus_id')
          .gte('date', fromYmd)
          .order('date', { ascending: true })
          .limit(500),
        supabase.from('team_roles').select('id, name, field_key, display_order').eq('team_type', team).eq('is_active', true).order('display_order', { ascending: true }),
        supabase.from(table).select('*').order('full_name', { ascending: true }),
        supabase.from('team_member_roles').select('member_id, role_id').eq('member_table', table),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      const rules = asList(parse((rulesRes as any).data?.value));

      // Czy wydarzenie należy do tej służby — ScheduleTab.jsx includesThisTeam.
      const includes = (ev: any) => {
        const asg = parse(ev.assignments)?.[team];
        if (asg && Object.entries(asg).some(([k, v]) => k !== 'notatki' && k !== 'absencja' && csvNames(v).length)) return true;
        if (ev.team_types != null) return csvNames(ev.team_types).includes(team);
        const rule = rules.find((r) => (r?.module_key || '') === (ev.module_key || '') && r?.event_type === ev.event_type);
        if (rule && Array.isArray(rule.teams) && rule.teams.length) return rule.teams.includes(team);
        return (ev.module_key || '') === team;
      };
      const evRows = asList(eventsRes.data).filter(includes);

      const saByEvent = new Map<string, GrafikAssignment[]>();
      if (evRows.length) {
        const { data: sa } = await supabase
          .from('schedule_assignments')
          .select('id, event_id, role_key, assigned_name, assigned_email, status, email_sent_at')
          .in('event_id', evRows.map((e) => e.id))
          .eq('team_type', team);
        for (const a of asList(sa)) {
          const k = String(a.event_id);
          const list = saByEvent.get(k) ?? [];
          list.push({
            id: String(a.id),
            roleKey: String(a.role_key ?? ''),
            name: String(a.assigned_name ?? ''),
            email: a.assigned_email ?? null,
            status: (a.status ?? 'pending') as AsgStatus,
            emailSent: !!a.email_sent_at,
          });
          saByEvent.set(k, list);
        }
      }

      const roleIdsOf = new Map<string, string[]>();
      for (const x of asList(mrRes.data)) {
        const k = String(x.member_id);
        roleIdsOf.set(k, [...(roleIdsOf.get(k) ?? []), String(x.role_id)]);
      }
      const roles: GrafikRoleDef[] = asList(rolesRes.data).map((r) => ({ id: String(r.id), key: String(r.field_key), label: String(r.name) }));

      return {
        // Bez ról na webie jest jedna kolumna „Osoba”.
        roles: roles.length ? roles : [{ id: null, key: 'osoba', label: 'Osoba' }],
        members: asList(membersRes.data)
          .filter((m) => m.full_name)
          .map((m) => ({
            id: String(m.id),
            name: String(m.full_name).trim(),
            email: m.email ?? null,
            roleIds: roleIdsOf.get(String(m.id)) ?? [],
            // worship_team/media_team: status „Nieaktywny”; reszta: is_active.
            active: 'status' in m ? m.status !== 'Nieaktywny' : m.is_active !== false,
          })),
        events: evRows.map((ev) => ({
          id: String(ev.id),
          date: String(ev.date).slice(0, 10),
          time: ev.time ? String(ev.time).slice(0, 5) : null,
          title: ev.title || 'Wydarzenie',
          campusId: ev.campus_id ?? null,
          team: { ...(parse(ev.assignments)?.[team] ?? {}) },
          sa: saByEvent.get(String(ev.id)) ?? [],
        })),
      };
    },
  });

export const splitGrafik = (events: GrafikEvent[]) => {
  const today = todayYmd();
  return {
    upcoming: events.filter((e) => e.date >= today),
    past: events.filter((e) => e.date < today).reverse(),
  };
};

// Zapis jednego pola służby na wydarzeniu — ATOMOWO na serwerze (fn event-assignments-patch,
// ten sam kontrakt co web). Wysyłamy tylko zmienioną ścieżkę [team][field]; serwer nakłada ją
// na aktualny stan w transakcji z blokadą wiersza, więc równoległa edycja innej służby (np. na
// webie) nie znika. Dawniej: odczyt + zapis CAŁEGO events.assignments (ostatni zapis wygrywał).
async function writeTeamField(eventId: string, team: string, field: string, value: string) {
  const { data, error } = await supabase.functions.invoke('event-assignments-patch', {
    body: { event_id: eventId, ops: [{ team, key: field, value }] },
  });
  if (error) {
    const status = (error as any)?.status;
    throw new Error(
      status === 403
        ? 'Nie masz uprawnień do edycji grafiku tego wydarzenia.'
        : status === 404
          ? 'Nie znaleziono wydarzenia — mogło zostać usunięte.'
          : 'Nie udało się zapisać grafiku. Sprawdź połączenie i spróbuj ponownie.',
    );
  }
  return ((data as any)?.assignments ?? null) as Record<string, any> | null;
}

const patchCache = (qc: ReturnType<typeof useQueryClient>, team: string, eventId: string, field: string, value: string) =>
  qc.setQueryData<GrafikData>(KEY(team), (old: GrafikData | undefined) =>
    old
      ? { ...old, events: old.events.map((e: GrafikEvent) => (e.id === eventId ? { ...e, team: { ...e.team, [field]: value } } : e)) }
      : old,
  );

export const useSetRolePeople = (team: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      event: GrafikEvent;
      role: GrafikRoleDef;
      names: string[];
      members: GrafikMember[];
      me: { email: string | null; name: string | null };
    }) => {
      const { event, role, names, members, me } = input;
      const before = csvNames(event.team[role.key]);
      const added = names.filter((n) => !before.includes(n));
      const removed = before.filter((n) => !names.includes(n));
      await writeTeamField(event.id, team, role.key, names.join(', '));

      // Synchronizacja z silnikiem zaproszeń. Gdy się nie uda — cofamy zmianę w siatce, żeby
      // grafik i „Wyślij” mówiły to samo (inaczej zaproszenie poszłoby do zdjętej osoby).
      const failedAdd: string[] = [];
      const failedRemove: string[] = [];
      const byName = new Map(members.map((m) => [m.name, m]));
      const syncAdded = async (name: string) => {
        const email = byName.get(name)?.email ?? null;
        const self = !!(me.email && email && me.email.toLowerCase() === email.toLowerCase());
        const base = {
          team_type: team,
          role_key: role.key,
          role_label: role.label,
          assigned_name: name,
          assigned_email: email,
          assigned_by_email: me.email,
          assigned_by_name: me.name || me.email?.split('@')[0] || 'Lider',
          status: self ? 'accepted' : 'pending',
          responded_at: self ? new Date().toISOString() : null,
        };
        // Ręczny upsert (częściowy unikat po event_id) — jak createAssignment na webie.
        const { data: existing, error: findErr } = await supabase
          .from('schedule_assignments')
          .select('id, status, assigned_email')
          .eq('event_id', event.id)
          .eq('team_type', team)
          .eq('role_key', role.key)
          .eq('assigned_name', name)
          .maybeSingle();
        if (findErr) throw findErr;
        let res;
        if (existing) {
          // Ponowne przypisanie (jak reassignFields na webie): po odrzuceniu albo zmianie e-maila
          // zaproszenie trzeba wysłać od nowa (email_sent_at = null); zaakceptowane / oczekujące
          // pod tym samym adresem zostają bez zmian (bez drugiego maila).
          const ex = existing as any;
          const sameEmail = String(ex.assigned_email || '').toLowerCase() === String(email || '').toLowerCase();
          const keep = !self && sameEmail && (ex.status === 'accepted' || ex.status === 'pending');
          const patch: Record<string, unknown> = keep ? { ...base } : { ...base, email_sent_at: null };
          if (keep) {
            delete patch.status;
            delete patch.responded_at;
          }
          res = await (supabase.from('schedule_assignments') as any).update(patch).eq('id', ex.id);
        } else {
          res = await (supabase.from('schedule_assignments') as any).insert({ event_id: Number(event.id), ...base });
        }
        if (res.error) throw res.error;
      };
      for (const name of added) {
        try {
          await syncAdded(name);
        } catch {
          failedAdd.push(name);
        }
      }
      for (const name of removed) {
        const { error } = await supabase
          .from('schedule_assignments')
          .delete()
          .eq('event_id', event.id)
          .eq('team_type', team)
          .eq('role_key', role.key)
          .eq('assigned_name', name);
        if (error) failedRemove.push(name);
      }
      if (failedAdd.length || failedRemove.length) {
        const corrected = [...names.filter((n) => !failedAdd.includes(n)), ...failedRemove];
        await writeTeamField(event.id, team, role.key, corrected.join(', ')).catch(() => null);
        throw new Error(
          `Nie udało się zmienić przydziału: ${[...failedAdd, ...failedRemove].join(', ')}. Sprawdź, czy masz uprawnienia do edycji grafiku.`,
        );
      }

    },
    onMutate: ({ event, role, names }) => patchCache(qc, team, event.id, role.key, names.join(', ')),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY(team) });
      qc.invalidateQueries({ queryKey: ['event-detail'] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
};

// Notatka (notatki) albo nieobecni (absencja) — samo pole, bez schedule_assignments.
export const useSetTeamNote = (team: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, field, value }: { eventId: string; field: 'notatki' | 'absencja'; value: string }) =>
      writeTeamField(eventId, team, field, value),
    onMutate: ({ eventId, field, value }) => patchCache(qc, team, eventId, field, value),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY(team) });
      qc.invalidateQueries({ queryKey: ['event-detail'] });
    },
  });
};

export interface InviteResult {
  sent: number;
  failed: number;
  emailReady?: boolean;
  error?: string;
}

export const useSendInvites = (team: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string): Promise<InviteResult> => {
      const { data, error } = await supabase.functions.invoke('send-assignment-invites', {
        body: { eventId: Number(eventId), teamType: team, baseUrl: tenantWebBase() || undefined },
      });
      const d = (data ?? {}) as any;
      if (error || d.error) throw new Error(d.error || error?.message || 'Nie udało się wysłać zaproszeń.');
      return { sent: Number(d.sent) || 0, failed: Number(d.failed) || 0, emailReady: d.emailReady, error: d.error };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY(team) }),
  });
};

// Odpowiedź na własne zaproszenie prosto z grafiku — przez serwer (/api/assignment/:id/respond),
// ta sama semantyka co link z maila i web: odrzucenie zdejmuje imię z grafiku w jednej transakcji
// (członek nie ma prawa edytować wydarzenia, więc nie da się tego zrobić z telefonu wprost).
export const useAnswerAssignment = (team: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'accepted' | 'rejected' }) => {
      const res: Response = await (supabase as any)._request(`/api/assignment/${encodeURIComponent(id)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: status === 'accepted' ? 'accept' : 'reject' }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? 'Nie znaleziono tego przydziału — mógł zostać zmieniony przez lidera.'
            : 'Nie udało się zapisać odpowiedzi. Spróbuj ponownie.',
        );
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY(team) });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['event-detail'] });
    },
  });
};

// Zgłoszone nieobecności osób służby (fn team-availability — imię + daty, bez powodu).
export interface TeamBlockout {
  name: string;
  start_date: string;
  end_date: string;
}

export const useTeamAvailability = (team: string, from: string | null, to: string | null) =>
  useQuery({
    queryKey: ['team', team, 'availability', from, to],
    enabled: !!from && !!to,
    staleTime: 60_000,
    queryFn: async (): Promise<TeamBlockout[]> => {
      const { data, error } = await supabase.functions.invoke('team-availability', { body: { team, from, to } });
      if (error) return [];
      return Array.isArray((data as any)?.blockouts) ? ((data as any).blockouts as TeamBlockout[]) : [];
    },
  });

export const unavailableOn = (blockouts: TeamBlockout[], ymd: string) =>
  new Set(blockouts.filter((b) => b.start_date <= ymd && ymd <= b.end_date).map((b) => b.name));
