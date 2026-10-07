// Czysta logika grup domowych — port z weba (src/modules/HomeGroups/homeGroupUtils.js).
//
// Członkostwo w grupie żyje w home_group_members (wiele grup na osobę, rola per grupa).
// Wiersz nie ma member_id, więc osobę rozpoznajemy po e-mailu, a gdy wiersz nie ma e-maila
// (dzieci, seniorzy) — po imieniu i nazwisku. members.home_group_id to tylko „pierwsza grupa”
// (zgodność wstecz), więc przy wyświetlaniu łączymy oba źródła.
// Lider grupy = członek grupy z rolą 'leader' (starsze dane: is_leader / 'coordinator').

export interface GroupMembershipRow {
  id?: string | number;
  group_id: string | number | null;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  role?: string | null;
  is_leader?: boolean | null;
}

export interface PersonLike {
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  home_group_id?: string | number | null;
}

export interface GroupLink {
  id: string;
  name: string;
  role: 'leader' | 'member';
}

export const normName = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
export const normEmail = (s: unknown) => String(s ?? '').trim().toLowerCase();

export const fullNameOf = (p: PersonLike | null | undefined): string => {
  if (!p) return '';
  if (p.full_name) return String(p.full_name).trim().replace(/\s+/g, ' ');
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim().replace(/\s+/g, ' ');
};

// Czy wiersz ma rolę lidera (model docelowy: role='leader'; starsze: is_leader / 'coordinator').
export const isLeaderRow = (r: { role?: string | null; is_leader?: boolean | null } | null | undefined) =>
  !!r && (r.role === 'leader' || r.role === 'coordinator' || r.is_leader === true);

// Wiersz z e-mailem — tylko po e-mailu. Wiersz bez e-maila — po imieniu i nazwisku.
export function rowMatchesPerson(row: GroupMembershipRow | PersonLike | null | undefined, person: PersonLike | null | undefined) {
  if (!row || !person) return false;
  const re = normEmail(row.email);
  if (re) return re === normEmail(person.email);
  const rn = normName((row as GroupMembershipRow).full_name ?? fullNameOf(row as PersonLike));
  return !!rn && rn === normName(fullNameOf(person));
}

export const membershipsOf = (person: PersonLike, rows: GroupMembershipRow[] = []) =>
  (rows || []).filter((r) => r.group_id != null && rowMatchesPerson(r, person));

// Grupy osoby: members.home_group_id + home_group_members (bez duplikatów, w kolejności).
export function memberGroupIds(member: PersonLike, rows: GroupMembershipRow[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: unknown) => {
    if (id == null || id === '') return;
    const k = String(id);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  add(member?.home_group_id);
  membershipsOf(member, rows).forEach((r) => add(r.group_id));
  return out;
}

// Grupy osoby z rolą (do listy i profilu): [{ id, name, role }].
export function memberGroupLinks(
  member: PersonLike,
  rows: GroupMembershipRow[] = [],
  groups: { id: string | number; name: string | null }[] = [],
): GroupLink[] {
  const byId = new Map((groups || []).map((g) => [String(g.id), g]));
  const roleOf = new Map<string, 'leader' | 'member'>();
  membershipsOf(member, rows).forEach((r) => {
    const k = String(r.group_id);
    const role = isLeaderRow(r) ? 'leader' : 'member';
    if (roleOf.get(k) !== 'leader') roleOf.set(k, role);
  });
  return memberGroupIds(member, rows)
    .map((id) => ({ id, name: String(byId.get(id)?.name ?? ''), role: roleOf.get(id) ?? ('member' as const) }))
    .filter((g) => g.name);
}

// Krótki opis grup do wiersza listy: „Grupa Mokotów (lider), Grupa Wola”.
export const groupLinksLabel = (links: GroupLink[]) =>
  links.map((g) => (g.role === 'leader' ? `${g.name} (lider)` : g.name)).join(', ');

// Polska odmiana liczebników: 1 osoba, 2–4 osoby, 5+ osób (12–14 → osób).
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(Number(n) || 0);
  if (a === 1) return one;
  const d = a % 10;
  const h = a % 100;
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return few;
  return many;
}
