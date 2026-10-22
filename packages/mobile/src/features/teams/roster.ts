import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { ACCOUNTS_FN, ACCOUNTS_TEAM, accountsById, type TeamAccount } from '@avenit/shared/src/lib/teamAccounts.js';
import {
  PEOPLE_FN,
  grantOutcome,
  shouldGrantAccess,
  type MinistryPeopleMeta,
  type MinistryPerson,
} from '@avenit/shared/src/lib/ministryPeople.js';

// Skład zespołu (Członkowie / Nauczyciele) i służby (team_roles + team_member_roles) —
// kontrakt jak na webie: WorshipModule/MediaTeamModule/AtmosferaTeamModule/KidsModule/Tłumaczenia
// (członkowie) i components/RolesTab.jsx (służby).

const asList = (d: unknown) => ((d ?? []) as any[]);

export interface RosterPerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null; // dawne pole tekstowe (Nauczyciele: „Nauczyciel”)
  active: boolean;
  isLeader: boolean;
  roleIds: string[];
  hasStatus: boolean; // kolumna status (Aktywny/Nieaktywny) zamiast is_active
  hasIsActive: boolean;
}
export interface RosterRole {
  id: string;
  name: string;
  key: string;
  description: string | null;
  order: number;
  memberIds: string[];
}
export interface Roster {
  people: RosterPerson[];
  roles: RosterRole[];
}

export const rosterKey = (team: string, table: string) => ['team', team, 'roster', table] as const;

export const useRoster = (team: string, table: string | undefined) =>
  useQuery({
    queryKey: rosterKey(team, table ?? ''),
    enabled: !!table,
    queryFn: async (): Promise<Roster> => {
      const [peopleRes, rolesRes, linksRes] = await Promise.all([
        supabase.from(table!).select('*').order('full_name', { ascending: true }),
        supabase.from('team_roles').select('id, name, field_key, description, display_order').eq('team_type', team).eq('is_active', true).order('display_order', { ascending: true }),
        supabase.from('team_member_roles').select('member_id, role_id').eq('member_table', table!),
      ]);
      if (peopleRes.error) throw peopleRes.error;
      const links = asList(linksRes.data);
      const roleIdsOf = new Map<string, string[]>();
      for (const l of links) roleIdsOf.set(String(l.member_id), [...(roleIdsOf.get(String(l.member_id)) ?? []), String(l.role_id)]);
      return {
        people: asList(peopleRes.data).map((r) => ({
          id: String(r.id),
          name: String(r.full_name || r.email || '—').trim(),
          email: r.email ?? null,
          phone: r.phone ?? null,
          role: r.role || null,
          active: 'status' in r ? r.status !== 'Nieaktywny' : r.is_active !== false,
          isLeader: !!r.is_leader,
          roleIds: roleIdsOf.get(String(r.id)) ?? [],
          hasStatus: 'status' in r,
          hasIsActive: 'is_active' in r,
        })),
        roles: asList(rolesRes.data).map((r, i) => ({
          id: String(r.id),
          name: String(r.name),
          key: String(r.field_key ?? ''),
          description: r.description ?? null,
          order: Number(r.display_order ?? i + 1),
          memberIds: links.filter((l) => String(l.role_id) === String(r.id)).map((l) => String(l.member_id)),
        })),
      };
    },
  });

// Konta w aplikacji osób ze składu (tylko Tłumaczenia — konto jest potrzebne do tłumaczenia na
// żywo): id osoby → 'active' | 'inactive' | 'none'. Obiekt, nie Map (cache zapytań jest trwały).
// Błąd / starszy serwer — pusto (bez oznaczeń).
export const useRosterAccounts = (team: string) =>
  useQuery({
    queryKey: ['team', team, 'accounts'],
    enabled: team === ACCOUNTS_TEAM,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, TeamAccount>> => {
      const { data, error } = await supabase.functions.invoke(ACCOUNTS_FN, { body: {}, silent: true } as never);
      if (error) return {};
      return Object.fromEntries(accountsById(data));
    },
  });

// Osoby do wyboru przy „Dodaj” (fn ministry-people): konta w aplikacji + Członkowie bez konta
// (tylko z dostępem do Członków), z oznaczeniem „już w zespole” — jak web (MemberPickerField).
// Zawsze świeże przy otwarciu formularza; błąd / starszy serwer → null (zostaje wpisanie ręczne).
export const useMinistryPeople = (team: string, table: string, enabled: boolean) =>
  useQuery({
    queryKey: ['team', team, 'people-picker', table],
    enabled,
    staleTime: 0,
    gcTime: 60_000,
    queryFn: async (): Promise<MinistryPeopleMeta | null> => {
      const { data, error } = await supabase.functions.invoke(PEOPLE_FN, { body: { ministry_key: team, table }, silent: true } as never);
      if (error || !data || !Array.isArray((data as MinistryPeopleMeta).people)) return null;
      return data as MinistryPeopleMeta;
    },
  });

const invalidate = (qc: ReturnType<typeof useQueryClient>, team: string) => {
  qc.invalidateQueries({ queryKey: ['team', team] });
  qc.invalidateQueries({ queryKey: ['team', 'people'] });
};

// ─── Osoby ─────────────────────────────────────────────────────────────────────

export interface PersonInput {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  active: boolean;
  roleIds: string[];
}

// Domyślne pole `role` przy dodawaniu — jak formularze weba.
const DEFAULT_ROLE: Record<string, string> = { atmosfera_members: 'Atmosfera', kids_teachers: 'Nauczyciel' };
// Tabele z kolumną status (Aktywny/Nieaktywny) zamiast is_active — dla nowej osoby.
const STATUS_TABLES = new Set(['worship_team', 'media_team', 'custom_tlumaczenia_members']);

// Wynik dodania osoby z listy: dostęp do modułu nadany / już był / brak prawa (osoba tylko na liście).
export type AccessOutcome = 'none' | 'granted' | 'already' | 'denied';

export const useSavePerson = (team: string, table: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      person,
      input,
      picked = null,
      meta = null,
    }: {
      person: RosterPerson | null;
      input: PersonInput;
      picked?: MinistryPerson | null; // osoba wybrana z listy (tylko nowa osoba)
      meta?: MinistryPeopleMeta | null;
    }): Promise<{ id: string | null; access: AccessOutcome }> => {
      const row: Record<string, unknown> = { full_name: input.name, email: input.email, phone: input.phone };
      // Powiązanie wiersza składu z kontem wybranej osoby (gdy tabela ma user_id).
      if (!person && picked?.user_id && meta?.link_user) row.user_id = picked.user_id;
      if (input.role != null || !person) row.role = input.role ?? DEFAULT_ROLE[table] ?? '';
      if (person ? person.hasStatus : STATUS_TABLES.has(table)) row.status = input.active ? 'Aktywny' : 'Nieaktywny';
      else if (person ? person.hasIsActive : true) row.is_active = input.active;

      let id = person?.id ?? null;
      if (person) {
        const { error } = await (supabase.from(table) as any).update(row).eq('id', person.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from(table) as any).insert(row).select('id').single();
        if (error) throw error;
        id = String((data as any).id);
      }

      // Służby osoby: usuń stare powiązania i wstaw wybrane (jak web).
      const before = person?.roleIds ?? [];
      const same = before.length === input.roleIds.length && before.every((r) => input.roleIds.includes(r));
      if (id && !same) {
        const { error: delErr } = await supabase.from('team_member_roles').delete().eq('member_id', id).eq('member_table', table);
        if (delErr) throw delErr;
        if (input.roleIds.length) {
          const { error: insErr } = await (supabase.from('team_member_roles') as any).insert(
            input.roleIds.map((role_id) => ({ member_id: id, member_table: table, role_id: Number(role_id) })),
          );
          if (insErr) throw insErr;
        }
      }

      // Dostęp do modułu (przynależność 'member') dla osoby z kontem — przez /api/db, ten sam
      // strażnik co w Ustawieniach (enforceMembershipWrite). Bez prawa: osoba zostaje tylko na liście.
      let access: AccessOutcome = 'none';
      if (!person && shouldGrantAccess(picked, { ministryKey: team, table })) {
        if (meta && !meta.can_grant_access) access = 'denied';
        else {
          const { error: mErr } = await (supabase.from('ministry_memberships') as any).insert({
            user_id: picked!.user_id,
            ministry_key: team,
            role: 'member',
          });
          access = grantOutcome(mErr);
        }
      }
      return { id, access };
    },
    onSettled: () => invalidate(qc, team),
  });
};

export const useDeletePerson = (team: string, table: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      // Web zostawia osierocone powiązania ze służbami — sprzątamy je.
      await supabase.from('team_member_roles').delete().eq('member_id', id).eq('member_table', table);
    },
    onSettled: () => invalidate(qc, team),
  });
};

// ─── Służby ────────────────────────────────────────────────────────────────────

// Klucz pola w grafiku (assignments[team][field_key]) z nazwy, unikalny w zespole.
export const roleKeyFrom = (name: string, taken: string[]) => {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'rola';
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
};

export const useSaveRole = (team: string, table: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      role,
      name,
      description,
      memberIds,
      takenKeys,
      nextOrder,
    }: {
      role: RosterRole | null;
      name: string;
      description: string | null;
      memberIds: string[];
      takenKeys: string[];
      nextOrder: number;
    }) => {
      let id = role?.id ?? null;
      if (role) {
        const { error } = await (supabase.from('team_roles') as any).update({ name, description, updated_at: new Date().toISOString() }).eq('id', role.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from('team_roles') as any)
          .insert({ name, description, team_type: team, field_key: roleKeyFrom(name, takenKeys), display_order: nextOrder, is_active: true })
          .select('id')
          .single();
        if (error) throw error;
        id = String((data as any).id);
      }
      const before = role?.memberIds ?? [];
      const same = before.length === memberIds.length && before.every((m) => memberIds.includes(m));
      if (id && !same) {
        const { error: delErr } = await supabase.from('team_member_roles').delete().eq('role_id', id).eq('member_table', table);
        if (delErr) throw delErr;
        if (memberIds.length) {
          const { error: insErr } = await (supabase.from('team_member_roles') as any).insert(
            memberIds.map((member_id) => ({ member_id, member_table: table, role_id: Number(id) })),
          );
          if (insErr) throw insErr;
        }
      }
    },
    onSettled: () => invalidate(qc, team),
  });
};

export const useDeleteRole = (team: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => invalidate(qc, team),
  });
};

// Kolejność służb = kolejność kolumn w grafiku.
export const useReorderRoles = (team: string, table: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i++) {
        const { error } = await (supabase.from('team_roles') as any).update({ display_order: i + 1 }).eq('id', ids[i]);
        if (error) throw error;
      }
    },
    onMutate: (ids) =>
      qc.setQueryData<Roster>(rosterKey(team, table), (old: Roster | undefined) =>
        old ? { ...old, roles: ids.map((id, i) => ({ ...old.roles.find((r: RosterRole) => r.id === id)!, order: i + 1 })).filter((r) => r.id) } : old,
      ),
    onSettled: () => invalidate(qc, team),
  });
};
