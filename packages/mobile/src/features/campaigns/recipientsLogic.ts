// Segmentowanie odbiorców kampanii — port 1:1 z weba (src/modules/shared/recipients.js).
// Czysta logika bez React Native (pobieranie danych: recipients.ts). Ten sam model segmentów
// co web i serwer (push_campaign_segments / sms_campaign_segments).

export type SegmentType = 'all' | 'campus' | 'ministry' | 'home_group' | 'role' | 'custom_email' | 'custom_phone';

export interface Segment {
  type: SegmentType;
  id: string | null;
  name: string | null;
  exclude: boolean;
  emails?: string[] | null;
  phones?: string[] | null;
}

export interface RecipientUser {
  email: string | null;
  full_name: string | null;
  phone: string | null;
  campus_id?: number | string | null;
  role?: string | null;
  avatar_url?: string | null;
}

export interface GroupWithMembers {
  id: string;
  key?: string;
  name: string;
  members: RecipientUser[];
}

export interface Campus {
  id: number | string;
  name: string;
}

export interface RecipientsSource {
  allUsers: RecipientUser[];
  ministries: GroupWithMembers[];
  homeGroups: GroupWithMembers[];
  campuses: Campus[];
  unsubscribed: string[];
}

export const EMPTY_SOURCE: RecipientsSource = { allUsers: [], ministries: [], homeGroups: [], campuses: [], unsubscribed: [] };

// Normalizacja numeru do E.164 PL (48xxxxxxxxx) — jak web/serwer (lib/sms.js).
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-()+]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.length === 9 && /^\d{9}$/.test(p)) p = '48' + p;
  if (!/^48\d{9}$/.test(p)) return null;
  return p;
}

export const MINISTRY_DEFINITIONS = [
  { key: 'worship_team', name: 'Zespół Uwielbienia', table: 'worship_team', emailField: 'email', nameField: 'full_name' },
  { key: 'media_team', name: 'Media Team', table: 'media_team', emailField: 'email', nameField: 'full_name' },
  { key: 'atmosfera_team', name: 'Atmosfera Team', table: 'atmosfera_members', emailField: 'email', nameField: 'full_name' },
  { key: 'kids_ministry', name: 'Dzieci', table: 'kids_teachers', emailField: 'email', nameField: 'full_name' },
  { key: 'tlumaczenia_team', name: 'Tłumaczenia', table: 'custom_tlumaczenia_members', emailField: 'email', nameField: 'full_name' },
] as const;

export const ROLE_OPTIONS = [
  { id: 'superadmin', name: 'Super Admin' },
  { id: 'admin', name: 'Admin' },
  { id: 'rada_starszych', name: 'Rada Starszych' },
  { id: 'koordynator', name: 'Koordynator' },
  { id: 'lider', name: 'Lider' },
  { id: 'czlonek', name: 'Członek' },
] as const;

// Rozwiązuje segmenty do listy unikalnych odbiorców (klucz = e-mail albo telefon),
// odejmuje wykluczenia i opt-outy — dokładnie jak resolveSegments na webie.
export function resolveSegments(source: RecipientsSource, segments: Segment[]): RecipientUser[] {
  const { allUsers, ministries, homeGroups, unsubscribed } = source;
  const includeByKey = new Map<string, RecipientUser>();
  const excludeKeys = new Set<string>();

  const keyOf = (u: RecipientUser) => u.email || `phone:${u.phone}`;
  const enrichWithPhone = (u: RecipientUser): RecipientUser => {
    if (u.phone || !u.email) return u;
    const found = allUsers.find((x) => x.email === u.email);
    return found?.phone ? { ...u, phone: found.phone } : u;
  };

  const collect = (segment: Segment, target: Map<string, RecipientUser> | Set<string>) => {
    const add = (rawUser: RecipientUser) => {
      const u = enrichWithPhone(rawUser);
      const k = keyOf(u);
      if (!k) return;
      if (target instanceof Set) target.add(k);
      else target.set(k, u);
    };
    switch (segment.type) {
      case 'all':
        allUsers.forEach(add);
        break;
      case 'campus':
        allUsers.filter((u) => String(u.campus_id) === String(segment.id)).forEach(add);
        break;
      case 'ministry': {
        const m = ministries.find((x) => x.id === segment.id || x.key === segment.id);
        (m?.members || []).forEach(add);
        break;
      }
      case 'home_group': {
        // Web porównuje ===; id z bazy (segment_id) jest tekstem — porównanie tekstowe.
        const g = homeGroups.find((x) => String(x.id) === String(segment.id));
        (g?.members || []).forEach(add);
        break;
      }
      case 'role':
        allUsers.filter((u) => u.role === segment.id).forEach(add);
        break;
      case 'custom_email': {
        const list = segment.emails || (segment.id ? [segment.id] : []);
        list.forEach((email) => {
          const u = allUsers.find((x) => x.email === email) || { email, full_name: email, phone: null };
          add(u);
        });
        break;
      }
      case 'custom_phone': {
        (segment.phones || []).forEach((raw) => {
          const norm = normalizePhone(raw);
          if (!norm) return;
          const u =
            allUsers.find((x) => x.phone && normalizePhone(x.phone) === norm) || { email: null, phone: norm, full_name: null };
          add(u);
        });
        break;
      }
      default:
        break;
    }
  };

  segments.forEach((s) => {
    if (s.exclude) {
      const tmp = new Set<string>();
      collect(s, tmp);
      tmp.forEach((k) => excludeKeys.add(k));
    } else {
      collect(s, includeByKey);
    }
  });

  const result: RecipientUser[] = [];
  includeByKey.forEach((user, key) => {
    if (excludeKeys.has(key)) return;
    if (user.email && unsubscribed.includes(user.email)) return;
    result.push(user);
  });
  return result;
}

export const hasValidPhone = (u: RecipientUser) => !!u.phone && !!normalizePhone(u.phone);

export function searchUsers(source: RecipientsSource, query: string): RecipientUser[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return source.allUsers
    .filter((u) => !source.unsubscribed.includes(u.email ?? ''))
    .filter((u) => u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q))
    .slice(0, 20);
}

export const totalActive = (source: RecipientsSource) =>
  source.allUsers.filter((u) => !source.unsubscribed.includes(u.email ?? '')).length;

// ── Operacje na liście segmentów (jak RecipientSelector na webie) ─────────────────────────

const sameSeg = (s: Segment, type: SegmentType, id: string | null, exclude: boolean) =>
  s.type === type && String(s.id ?? '') === String(id ?? '') && !!s.exclude === exclude;

export const isSelected = (segments: Segment[], type: SegmentType, id: string | null, exclude = false) =>
  segments.some((s) => sameSeg(s, type, id, exclude));

export function toggleSegment(
  segments: Segment[],
  type: SegmentType,
  id: string | null,
  name: string,
  exclude = false,
): Segment[] {
  if (isSelected(segments, type, id, exclude)) return segments.filter((s) => !sameSeg(s, type, id, exclude));
  // „Wszyscy” zastępuje całą listę (jak web); dodanie innej grupy zdejmuje „Wszyscy”.
  // Wykluczenie „Wszystkich” NIE zdejmuje (web zdejmował, przez co „wszyscy oprócz służby X”
  // dawało 0 odbiorców) — serwer liczy taką kombinację poprawnie.
  if (type === 'all' && !exclude) return [{ type, id: null, name, exclude: false }];
  if (exclude) return [...segments, { type, id, name, exclude }];
  return [...segments.filter((s) => !(s.type === 'all' && !s.exclude)), { type, id, name, exclude }];
}

export const customEmailsOf = (segments: Segment[]) =>
  segments.find((s) => s.type === 'custom_email' && !s.exclude)?.emails || [];

export const customPhonesOf = (segments: Segment[]) =>
  segments.find((s) => s.type === 'custom_phone' && !s.exclude)?.phones || [];

export function addCustomEmail(segments: Segment[], email: string): Segment[] {
  const emails = new Set(customEmailsOf(segments));
  emails.add(email);
  const next = segments.filter((s) => !(s.type === 'custom_email' && !s.exclude));
  next.push({ type: 'custom_email', id: 'custom', name: 'Wybrane osoby', emails: Array.from(emails), exclude: false });
  return next;
}

export function removeCustomEmail(segments: Segment[], email: string): Segment[] {
  const existing = segments.find((s) => s.type === 'custom_email' && !s.exclude);
  if (!existing) return segments;
  const emails = (existing.emails || []).filter((e) => e !== email);
  const next = segments.filter((s) => !(s.type === 'custom_email' && !s.exclude));
  if (emails.length) next.push({ ...existing, emails });
  return next;
}

// Wklejone numery → znormalizowane 48xxxxxxxxx. Separatory: przecinek, średnik, nowa linia;
// spacja też, ale numer zapisany ze spacjami („+48 600 700 800”) zostaje jednym numerem
// (web dzielił po każdej spacji i odrzucał taki numer, choć sam go podpowiadał).
export function parsePhones(input: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  input
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const whole = normalizePhone(chunk);
      if (whole) {
        valid.push(whole);
        return;
      }
      chunk
        .split(/\s+/)
        .filter(Boolean)
        .forEach((raw) => {
          const norm = normalizePhone(raw);
          if (norm) valid.push(norm);
          else invalid.push(raw);
        });
    });
  return { valid, invalid };
}

export function setCustomPhones(segments: Segment[], phones: string[]): Segment[] {
  const next = segments.filter((s) => !(s.type === 'custom_phone' && !s.exclude));
  if (phones.length) next.push({ type: 'custom_phone', id: 'custom_phone', name: 'Numery telefonów', phones, exclude: false });
  return next;
}

// Wiersze z bazy (segment_type/segment_id/…) → model edytora (jak CampaignEditor na webie).
export const segmentsFromRows = (rows: any[] | null | undefined): Segment[] =>
  (rows ?? []).map((s) => ({
    type: s.segment_type as SegmentType,
    id: s.segment_id ?? null,
    name: s.segment_name ?? null,
    exclude: !!s.exclude,
    emails: s.emails ?? null,
    phones: s.phones ?? null,
  }));

// Krótki opis segmentu do podsumowania („Wszyscy aktywni”, „Bez: Media Team”, „3 osoby”).
export const segmentLabel = (s: Segment) => {
  let base = s.name || s.type;
  if (s.type === 'custom_email') base = `Wybrane osoby (${s.emails?.length ?? 0})`;
  if (s.type === 'custom_phone') base = `Numery (${s.phones?.length ?? 0})`;
  if (s.type === 'role') base = ROLE_OPTIONS.find((r) => r.id === s.id)?.name ?? base;
  return s.exclude ? `Bez: ${base}` : base;
};
