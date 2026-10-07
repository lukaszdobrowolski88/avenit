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

// ─── Meldowanie dzieci ─────────────────────────────────────────────────────────
// Kontrakt jak web (src/modules/Kids/checkin/hooks/useCheckin.js + utils/kiosk.js):
//   • sesja na DZIŚ (data lokalna) powstaje dopiero przy pierwszym meldowaniu — samo otwarcie
//     ekranu niczego nie tworzy (dawniej przycisk/ekran zostawiał puste „fałszywe” sesje),
//   • sala jest opcjonalna (bez sal dziecko trafia do „Bez sali”),
//   • jeden losowy kod odbioru na rodzinę w sesji (rodzic ma jedną naklejkę); dzieci już
//     zameldowane są pomijane (bez podwójnego meldowania).

// Bez znaków, które łatwo pomylić na naklejce: 0/O/Q/D, 1/I/L/J, 2/Z, 5/S, 6/G, 8/B, U/V.
export const PICKUP_CODE_ALPHABET = 'ACEFHKMNPRTWXY3479';

const randomIndex = (max: number) => {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const limit = Math.floor(256 / max) * max;
    const buf = new Uint8Array(1);
    for (;;) {
      c.getRandomValues(buf);
      if (buf[0] < limit) return buf[0] % max;
    }
  }
  return Math.floor(Math.random() * max);
};

export const normalizePickupCode = (input: string) => String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
// security_code: nowy format to jeden kod („K7HX”), stary — końcówki telefonów „1234|5678”.
export const splitStoredCodes = (stored: string | null | undefined) =>
  String(stored || '')
    .split('|')
    .map(normalizePickupCode)
    .filter(Boolean);
export const pickupCodeMatches = (stored: string | null | undefined, entered: string) => {
  const code = normalizePickupCode(entered);
  return !!code && splitStoredCodes(stored).includes(code);
};
const isRandomCode = (code: string | null | undefined) =>
  typeof code === 'string' && code.length >= 4 && code.length <= 6 && [...code].every((ch) => PICKUP_CODE_ALPHABET.includes(ch));

const generatePickupCode = (length = 4) => {
  let out = '';
  for (let i = 0; i < length; i++) out += PICKUP_CODE_ALPHABET[randomIndex(PICKUP_CODE_ALPHABET.length)];
  return out;
};
export const generateUniquePickupCode = (taken: Set<string>) => {
  for (let i = 0; i < 50; i++) {
    const code = generatePickupCode(4);
    if (!taken.has(code)) return code;
  }
  return generatePickupCode(5);
};

const localYmd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localHm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const addHours = (hm: string, h: number) => {
  const [hh, mm] = String(hm || '09:00').split(':').map(Number);
  return `${String(Math.min(23, (hh || 0) + h)).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}`;
};

// Wydarzenie z dzisiejszego kalendarza, które najlepiej nazywa sesję: trwające albo najbliższe.
const pickSessionEvent = (events: any[], now = new Date()) => {
  const list = (events || []).filter((e) => e && e.title);
  if (!list.length) return null;
  const nowHM = localHm(now);
  const hm = (t: unknown) => String(t || '').slice(0, 5);
  const sorted = [...list].sort((a, b) => hm(a.time).localeCompare(hm(b.time)));
  const ongoing = sorted.find((e) => e.time && e.end_time && hm(e.time) <= nowHM && nowHM <= hm(e.end_time));
  if (ongoing) return ongoing;
  return sorted.find((e) => !e.time || hm(e.time) >= nowHM) ?? sorted[sorted.length - 1];
};

export interface CheckinLocation {
  id: string;
  name: string;
}

// Sale meldowania (opcjonalne). Błąd odczytu nie blokuje meldowania — wtedy „Bez sali”.
export const useCheckinLocations = (enabled: boolean) =>
  useQuery({
    queryKey: ['kids', 'locations'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CheckinLocation[]> => {
      const { data, error } = await supabase.from('checkin_locations').select('id, name, room_number, sort_order').eq('is_active', true).order('sort_order', { ascending: true });
      if (error) return [];
      return asList(data).map((l) => ({ id: String(l.id), name: [l.name, l.room_number].filter(Boolean).join(' · ') || 'Sala' }));
    },
  });

export interface CheckinResult {
  sessionCreated: boolean;
  // Kody odbioru do przekazania rodzicom (jedna naklejka na rodzinę).
  groups: { code: string; children: string[] }[];
  skipped: string[]; // już zameldowane w tej sesji
}

export const useCheckInChildren = (myEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ children, locationId }: { children: KidsStudent[]; locationId: string | null }): Promise<CheckinResult> => {
      if (!children.length) throw new Error('Zaznacz co najmniej jedno dziecko.');
      const today = localYmd();

      // 1) Sesja na dziś — istniejąca albo nowa (dopiero teraz, przy pierwszym meldowaniu).
      const { data: sessions, error: sErr } = await supabase
        .from('checkin_sessions')
        .select('id')
        .eq('session_date', today)
        .eq('is_active', true)
        .order('start_time', { ascending: true })
        .limit(1);
      if (sErr) throw sErr;
      let sessionId: string | null = asList(sessions)[0]?.id != null ? String(asList(sessions)[0].id) : null;
      let sessionCreated = false;
      if (!sessionId) {
        let event: any = null;
        try {
          const { data: evs } = await supabase.from('events').select('title, time, end_time').eq('date', today);
          event = pickSessionEvent(asList(evs));
        } catch {
          /* kalendarz niedostępny — zostaje nazwa domyślna */
        }
        const start = event?.time ? String(event.time).slice(0, 5) : localHm();
        const end = event?.end_time ? String(event.end_time).slice(0, 5) : addHours(start, 3);
        const [y, m, d] = today.split('-');
        const { data: created, error: cErr } = await (supabase.from('checkin_sessions') as any)
          .insert({
            name: event?.title || `Meldowanie – ${d}.${m}.${y}`,
            session_date: today,
            start_time: start,
            end_time: end,
            is_active: true,
            created_by: myEmail || 'system',
          })
          .select('id')
          .single();
        if (cErr) throw cErr;
        sessionId = String((created as any).id);
        sessionCreated = true;
      }

      // 2) Aktywne meldowania sesji — blokada podwójnego meldowania i unikalne kody.
      const { data: active, error: aErr } = await supabase
        .from('checkins')
        .select('id, student_id, household_id, security_code')
        .eq('session_id', sessionId)
        .is('checked_out_at', null);
      if (aErr) throw aErr;
      const activeRows = asList(active);
      const activeStudents = new Set(activeRows.map((r) => String(r.student_id)));
      const taken = new Set<string>();
      for (const r of activeRows) for (const c of splitStoredCodes(r.security_code)) taken.add(c);

      // 3) Rodzinami: wspólny kod (ponownie ten sam, jeśli rodzina już ma kod w tej sesji).
      const byFamily = new Map<string, KidsStudent[]>();
      for (const ch of children) {
        const k = ch.householdId ? `h:${ch.householdId}` : `s:${ch.id}`;
        byFamily.set(k, [...(byFamily.get(k) ?? []), ch]);
      }
      const groups: CheckinResult['groups'] = [];
      const skipped: string[] = [];
      let done = 0;
      try {
        for (const [, kids] of byFamily) {
          const householdId = kids[0].householdId;
          const fresh = kids.filter((k) => !activeStudents.has(String(k.id)));
          kids.filter((k) => activeStudents.has(String(k.id))).forEach((k) => skipped.push(k.name));
          if (!fresh.length) continue;
          const reuse = householdId
            ? activeRows.find((r) => String(r.household_id) === String(householdId) && isRandomCode(r.security_code))
            : null;
          const code = reuse ? String(reuse.security_code) : generateUniquePickupCode(taken);
          taken.add(code);
          for (const k of fresh) {
            const { error } = await (supabase.from('checkins') as any)
              .insert({
                session_id: sessionId,
                student_id: Number.isFinite(Number(k.id)) ? Number(k.id) : k.id,
                location_id: locationId || null,
                household_id: householdId || null,
                security_code: code,
                checked_in_by: myEmail || 'system',
                is_guest: false,
              })
              .select('id')
              .single();
            if (error) throw error;
            done++;
          }
          groups.push({ code, children: fresh.map((k) => k.name) });
        }
      } catch (e) {
        if (done > 0) throw new Error('Zameldowano tylko część dzieci. Sprawdź listę obecnych i spróbuj ponownie dla pozostałych.');
        throw e;
      }
      return { sessionCreated, groups, skipped };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['kids', 'today'] });
    },
  });
};
