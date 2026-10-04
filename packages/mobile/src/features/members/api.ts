import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../../lib/supabase';

export type MemberStatus = 'Członek' | 'Sympatyk' | 'Gość';

export interface MemberRow {
  id: number | string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: MemberStatus | null;
  birth_date: string | null;
  ministries: string[] | null;
  household_id: number | string | null;
  home_group_id: string | null;
  membership_date: string | null;
  notes: string | null;
}

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

export const useMembers = ({ selectedCampusId, withCampusFilter }: CampusScope) =>
  useQuery({
    queryKey: ['members', selectedCampusId],
    queryFn: async (): Promise<MemberRow[]> => {
      const base = supabase
        .from('members')
        .select(
          'id, first_name, last_name, email, phone, address, status, birth_date, ministries, household_id, home_group_id, membership_date, notes',
        );
      const { data, error } = await withCampusFilter(base)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
  });

export const useMember = (id: string | number, selectedCampusId: number | null) =>
  useQuery({
    queryKey: ['members', selectedCampusId, id],
    queryFn: async (): Promise<MemberRow | null> => {
      const { data, error } = await supabase
        .from('members')
        .select(
          'id, first_name, last_name, email, phone, address, status, birth_date, ministries, household_id, home_group_id, membership_date, notes',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MemberRow | null;
    },
    enabled: id != null && id !== '',
  });

export interface HouseholdRow {
  id: number | string;
  family_name: string | null;
  address: string | null;
}

export const useHousehold = (id: number | string | null) =>
  useQuery({
    queryKey: ['household', id],
    queryFn: async (): Promise<HouseholdRow | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('households')
        .select('id, family_name, address')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as HouseholdRow | null;
    },
    enabled: id != null,
  });

export const fullName = (m: { first_name: string | null; last_name: string | null }): string => {
  const parts = [m.first_name, m.last_name].filter((s) => s && s.trim());
  return parts.length > 0 ? parts.join(' ') : '(bez imienia)';
};

export const initials = (m: { first_name: string | null; last_name: string | null }): string => {
  const f = (m.first_name || '?').charAt(0).toUpperCase();
  const l = (m.last_name || '').charAt(0).toUpperCase();
  return f + (l || '');
};

export const STATUS_META: Record<MemberStatus, { tint: string; bg: string; label: string }> = {
  Członek: { tint: '#059669', bg: '#d1fae5', label: 'Członek' },
  Sympatyk: { tint: '#2563eb', bg: '#dbeafe', label: 'Sympatyk' },
  Gość: { tint: '#7A7466', bg: '#E3DDD0', label: 'Gość' },
};

export const MINISTRY_LABELS: Record<string, string> = {
  worship: 'Worship',
  media: 'Media',
  atmosfera: 'Atmosfera',
  kids: 'Dzieci',
  groups: 'Grupy domowe',
  mlodziezowka: 'Młodzieżówka',
  scena: 'Scena',
  produkcja: 'Produkcja',
};

export const useMemberFilters = (
  members: MemberRow[] | undefined,
  search: string,
  status: MemberStatus | 'all',
  ministry: string | null,
) =>
  useMemo(() => {
    const list = members ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((m) => {
      const name = fullName(m).toLowerCase();
      const email = (m.email ?? '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || email.includes(q);
      const matchesStatus = status === 'all' || m.status === status;
      const matchesMinistry =
        !ministry || (Array.isArray(m.ministries) && m.ministries.includes(ministry));
      return matchesSearch && matchesStatus && matchesMinistry;
    });
  }, [members, search, status, ministry]);

// ─── Edycja członka (jak web Members.jsx, ale bezpieczniej) ──────────────────
// Web wysyła cały wiersz, więc zapis pada, gdy admin zabronił edycji jakiegoś pola
// (serwer odrzuca payload z zabronioną kolumną). Tu wysyłamy TYLKO zmienione pola
// i pomijamy te, których nie wolno edytować (fieldWritable).

export type MemberPatch = Partial<
  Pick<MemberRow, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'status' | 'birth_date' | 'notes'>
>;

export const useUpdateMember = (fieldWritable: (resource: string, column: string) => boolean) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ before, after }: { before: MemberRow; after: MemberPatch }) => {
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(after)) {
        const next = typeof v === 'string' ? v.trim() || null : v ?? null;
        const prev = (before as any)[k] ?? null;
        if (next !== prev && fieldWritable('members', k)) patch[k] = next;
      }
      // Status inny niż Członek → bez daty i deklaracji członkowskiej (Members.jsx:297-313).
      if ('status' in patch && patch.status !== 'Członek' && before.status === 'Członek') {
        if (fieldWritable('members', 'membership_date')) patch.membership_date = null;
        if (fieldWritable('members', 'membership_declaration_url')) patch.membership_declaration_url = null;
      }
      if (!Object.keys(patch).length) return;
      const { error } = await (supabase.from('members') as any).update(patch).eq('id', before.id);
      if (error) throw new Error(error.message || 'Nie udało się zapisać zmian.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
};

// ─── Notatki duszpasterskie (moduł Opieka, member_notes jak NotesTab.jsx) ────

export interface MemberNote {
  id: string;
  body: string;
  author: string | null;
  createdAt: string;
}

export const useMemberNotes = (memberId: string | number | null, enabled: boolean) =>
  useQuery({
    queryKey: ['members', 'notes', memberId],
    enabled: enabled && memberId != null && memberId !== '',
    queryFn: async (): Promise<MemberNote[]> => {
      const { data, error } = await supabase
        .from('member_notes')
        .select('id, body, author_email, created_at')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((n) => ({
        id: String(n.id),
        body: String(n.body ?? ''),
        author: n.author_email ?? null,
        createdAt: String(n.created_at ?? ''),
      }));
    },
  });

export const useAddMemberNote = (memberId: string | number, authorEmail: string | null, campusId: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await (supabase.from('member_notes') as any).insert({
        member_id: memberId,
        author_email: authorEmail,
        body,
        campus_id: campusId,
      });
      if (error) throw new Error(error.message || 'Nie udało się dodać notatki.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', 'notes', memberId] }),
  });
};
