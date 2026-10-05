import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { supabase, tenantWebBase } from '../../lib/supabase';

// Dzieci — Grupy, Uczniowie, Rodziny. Kontrakt jak na webie:
//   • src/modules/Kids/KidsModule.jsx (kids_groups, kids_students, materiały grupy),
//   • src/modules/Kids/components/HouseholdManager.jsx (households + parent_contacts).
// Rodziny są zasobem modułu Członkowie (res:households:*) — bez niego zakładka jest ukryta.

const asList = (d: unknown) => ((d ?? []) as any[]);
// jsonb tablice bywają zapisane jako {} (stary błąd zapisu pustych tablic) — czytamy ostrożnie.
const asArray = (v: unknown): any[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
};

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

export interface KidsMaterial {
  id: number;
  title: string;
  type: string;
  date: string | null;
  url: string | null;
  fileName: string | null;
}
export interface KidsGroup {
  id: string;
  name: string;
  room: string | null;
  ageRange: string | null;
  teacherIds: string[];
  materials: KidsMaterial[];
  rawMaterials: any[];
}
export interface KidsStudent {
  id: string;
  name: string;
  birthYear: string | null;
  parentInfo: string | null;
  notes: string | null;
  allergies: string | null;
  groupId: string | null;
  householdId: string | null;
}
export interface KidsTeacher {
  id: string;
  name: string;
}
export interface KidsData {
  groups: KidsGroup[];
  students: KidsStudent[];
  teachers: KidsTeacher[];
}

export const MATERIAL_TYPES = ['Lekcja', 'Kolorowanka', 'Gra', 'Film', 'Książka', 'Inne'];

const KIDS_KEY = (campus: number | null) => ['team', 'kids', 'data', campus] as const;

export const useKidsData = (scope: CampusScope, enabled = true) =>
  useQuery({
    queryKey: KIDS_KEY(scope.selectedCampusId),
    enabled,
    queryFn: async (): Promise<KidsData> => {
      const [g, s, t] = await Promise.all([
        scope.withCampusFilter(supabase.from('kids_groups').select('*')).order('created_at', { ascending: true }),
        scope.withCampusFilter(supabase.from('kids_students').select('*')).order('full_name', { ascending: true }),
        supabase.from('kids_teachers').select('id, full_name').order('full_name', { ascending: true }),
      ]);
      if (g.error) throw g.error;
      if (s.error) throw s.error;
      return {
        groups: asList(g.data).map((r) => {
          const raw = asArray(r.materials);
          return {
            id: String(r.id),
            name: String(r.name ?? 'Grupa'),
            room: r.room || null,
            ageRange: r.age_range || null,
            teacherIds: asArray(r.teacher_ids).map(String),
            rawMaterials: raw,
            materials: raw.map((m) => ({
              id: Number(m.id) || 0,
              title: String(m.title ?? 'Materiał'),
              type: String(m.type ?? 'Inne'),
              date: m.date ?? null,
              url: m.attachmentUrl ?? null,
              fileName: m.attachmentName ?? null,
            })),
          };
        }),
        students: asList(s.data).map((r) => ({
          id: String(r.id),
          name: String(r.full_name ?? '—'),
          birthYear: r.birth_year ? String(r.birth_year) : null,
          parentInfo: r.parent_info || null,
          notes: r.notes || null,
          allergies: r.allergies || null,
          groupId: r.group_id != null ? String(r.group_id) : null,
          householdId: r.household_id ?? null,
        })),
        teachers: asList(t.data).map((r) => ({ id: String(r.id), name: String(r.full_name ?? '—') })),
      };
    },
  });

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['team', 'kids'] });
  };
};

// ─── Grupy ─────────────────────────────────────────────────────────────────────

export const useSaveGroup = (campusIdForInsert: number | null) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, name, room, ageRange, teacherIds }: { id: string | null; name: string; room: string | null; ageRange: string | null; teacherIds: string[] }) => {
      // teacher_ids jak na webie: tablica id nauczycieli (liczby).
      const payload = { name, room, age_range: ageRange, teacher_ids: teacherIds.map((x) => (Number.isFinite(Number(x)) ? Number(x) : x)) };
      const res = id
        ? await (supabase.from('kids_groups') as any).update(payload).eq('id', id)
        : await (supabase.from('kids_groups') as any).insert([{ ...payload, materials: [], campus_id: campusIdForInsert }]);
      if (res.error) throw res.error;
    },
    onSettled: invalidate,
  });
};

export const useDeleteGroup = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      // Dzieci zostają, tylko bez grupy (web zostawiał wiszące group_id).
      await (supabase.from('kids_students') as any).update({ group_id: null }).eq('group_id', id);
      const { error } = await supabase.from('kids_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
};

export const useSetStudentGroup = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ studentId, groupId }: { studentId: string; groupId: string | null }) => {
      const { error } = await (supabase.from('kids_students') as any).update({ group_id: groupId ? Number(groupId) : null }).eq('id', studentId);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
};

// Plik materiału — bucket kids-materials (nazwa w korzeniu, jak web).
export const pickKidsMaterialFile = async () => {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  if (a.size && a.size > 25 * 1024 * 1024) throw new Error('Plik jest za duży (maks. 25 MB).');
  return { uri: a.uri, name: a.name || 'plik', type: a.mimeType || 'application/octet-stream' };
};

export const useAddMaterial = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ group, title, type, file }: { group: KidsGroup; title: string; type: string; file: { uri: string; name: string; type: string } | null }) => {
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;
      if (file) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        const path = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
        const { error } = await supabase.storage.from('kids-materials').upload(path, file as never, { upsert: false });
        if (error) throw new Error((error as any)?.message || 'Nie udało się wysłać pliku.');
        const base = tenantWebBase();
        attachmentUrl = base ? `${base}/storage/kids-materials/${path}` : supabase.storage.from('kids-materials').getPublicUrl(path).data.publicUrl;
        attachmentName = file.name;
      }
      const next = [...group.rawMaterials, { id: Date.now(), title, type, date: new Date().toISOString(), attachmentUrl, attachmentName }];
      const { error } = await (supabase.from('kids_groups') as any).update({ materials: next }).eq('id', group.id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
};

export const useDeleteMaterial = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ group, materialId }: { group: KidsGroup; materialId: number }) => {
      const next = group.rawMaterials.filter((m) => Number(m.id) !== materialId);
      const { error } = await (supabase.from('kids_groups') as any).update({ materials: next }).eq('id', group.id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
};

// ─── Uczniowie ─────────────────────────────────────────────────────────────────

export interface StudentInput {
  name: string;
  birthYear: string | null;
  parentInfo: string | null;
  notes: string | null;
  allergies: string | null;
  groupId: string | null;
  householdId: string | null;
}

export const useSaveStudent = (campusIdForInsert: number | null) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: StudentInput }) => {
      const payload = {
        full_name: input.name,
        birth_year: input.birthYear,
        parent_info: input.parentInfo,
        notes: input.notes,
        allergies: input.allergies,
        group_id: input.groupId ? Number(input.groupId) : null,
        household_id: input.householdId || null,
      };
      const res = id
        ? await (supabase.from('kids_students') as any).update(payload).eq('id', id)
        : await (supabase.from('kids_students') as any).insert([{ ...payload, campus_id: campusIdForInsert }]);
      if (res.error) throw res.error;
    },
    onSettled: invalidate,
  });
};

export const useDeleteStudent = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kids_students').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
};

// ─── Rodziny ───────────────────────────────────────────────────────────────────

export interface ParentContact {
  id: string | null; // null = nowy
  memberId: number | null;
  name: string;
  phone: string;
  email: string;
  relationship: string;
  isPrimary: boolean;
  canPickup: boolean;
}
export interface Household {
  id: string;
  name: string;
  phoneFull: string | null;
  lastFour: string | null;
  address: string | null;
  notes: string | null;
  contacts: ParentContact[];
}

export const RELATIONSHIPS = ['Rodzic', 'Mama', 'Tata', 'Opiekun', 'Babcia', 'Dziadek', 'Inne'];

export const useHouseholds = (enabled: boolean) =>
  useQuery({
    queryKey: ['team', 'kids', 'households'],
    enabled,
    queryFn: async (): Promise<Household[]> => {
      // Bez złączeń (embed) — dwa zapytania i składanie po household_id.
      const [h, c] = await Promise.all([
        supabase.from('households').select('*').order('name', { ascending: true }),
        supabase.from('parent_contacts').select('*').not('household_id', 'is', null),
      ]);
      if (h.error) throw h.error;
      const byHousehold = new Map<string, ParentContact[]>();
      for (const r of asList(c.data)) {
        const k = String(r.household_id);
        byHousehold.set(k, [
          ...(byHousehold.get(k) ?? []),
          {
            id: String(r.id),
            memberId: r.member_id ?? null,
            name: String(r.full_name || r.name || ''),
            phone: r.phone ?? '',
            email: r.email ?? '',
            relationship: r.relationship || 'Rodzic',
            isPrimary: !!r.is_primary,
            canPickup: r.can_pickup !== false,
          },
        ]);
      }
      return asList(h.data).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? 'Rodzina'),
        phoneFull: r.phone_full || r.phone || null,
        lastFour: r.phone_last_four || null,
        address: r.address || null,
        notes: r.notes || null,
        contacts: (byHousehold.get(String(r.id)) ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
      }));
    },
  });

const lastFour = (phone: string | null | undefined) => (phone ? phone.replace(/\D/g, '').slice(-4) : '');

export const useSaveHousehold = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      household,
      name,
      phoneFull,
      address,
      notes,
      contacts,
    }: {
      household: Household | null;
      name: string;
      phoneFull: string | null;
      address: string | null;
      notes: string | null;
      contacts: ParentContact[];
    }): Promise<string> => {
      const kept = contacts.filter((c) => c.name.trim());
      const primary = kept.find((c) => c.isPrimary) ?? kept[0];
      // Wyszukiwanie przy check-inie idzie po 4 ostatnich cyfrach telefonu głównego kontaktu.
      const payload = {
        name,
        phone_full: phoneFull,
        phone_last_four: lastFour(primary?.phone || phoneFull),
        address,
        notes,
      };
      let id = household?.id ?? null;
      if (household) {
        const { error } = await (supabase.from('households') as any).update({ ...payload, updated_at: new Date().toISOString() }).eq('id', household.id);
        if (error) throw error;
        // Kontakty usunięte w formularzu.
        const keepIds = new Set(kept.filter((c) => c.id).map((c) => c.id));
        for (const old of household.contacts) {
          if (old.id && !keepIds.has(old.id)) {
            const { error: delErr } = await supabase.from('parent_contacts').delete().eq('id', old.id);
            if (delErr) throw delErr;
          }
        }
      } else {
        const { data, error } = await (supabase.from('households') as any).insert(payload).select('id').single();
        if (error) throw error;
        id = String((data as any).id);
      }
      for (const c of kept) {
        const row = {
          household_id: id,
          member_id: c.memberId,
          full_name: c.name.trim(),
          phone: c.phone.trim() || null,
          email: c.email.trim() || null,
          relationship: c.relationship,
          is_primary: primary ? c === primary : false,
          can_pickup: c.canPickup,
        };
        const res = c.id
          ? await (supabase.from('parent_contacts') as any).update(row).eq('id', c.id)
          : await (supabase.from('parent_contacts') as any).insert(row);
        if (res.error) throw res.error;
      }
      return id!;
    },
    onSettled: invalidate,
  });
};

export const useDeleteHousehold = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      // Dzieci zostają, tracą tylko powiązanie. parent_contacts nie ma klucza obcego
      // (web liczył na CASCADE i zostawiał osieroconych opiekunów) — usuwamy ich jawnie.
      await (supabase.from('kids_students') as any).update({ household_id: null }).eq('household_id', id);
      const { error: cErr } = await supabase.from('parent_contacts').delete().eq('household_id', id);
      if (cErr) throw cErr;
      const { error } = await supabase.from('households').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
};

export const useSetStudentHousehold = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ studentId, householdId }: { studentId: string; householdId: string | null }) => {
      const { error } = await (supabase.from('kids_students') as any).update({ household_id: householdId }).eq('id', studentId);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
};

// Wiek z rocznika (dla etykiet „6 lat”).
export const ageFrom = (birthYear: string | null) => {
  const y = Number(String(birthYear ?? '').slice(0, 4));
  if (!y || y < 1990) return null;
  return new Date().getFullYear() - y;
};
