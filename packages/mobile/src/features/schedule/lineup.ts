// Czysta logika obsady grafiku (bez Reacta i bazy) — port 1:1 z weba
// (src/modules/shared/schedule/lineup.js + lineup.test.js). Zmieniając zachowanie, zmień oba.
// Skład (lineup) = { roleKey: ['Imię Nazwisko', …] } — tylko kolumny-role, bez notatek i nieobecności.

export type Lineup = Record<string, string[]>;

export interface HistoryEntry {
  eventId: string;
  date: string; // YYYY-MM-DD
  title: string;
  lineup: Lineup;
}

export type SkipReason = 'gone' | 'absent' | 'role';

export interface ProposalTarget {
  id: string;
  date: string;
  lineup: Lineup;
  blocked?: Map<string, string>;
}

export interface ProposalRole {
  key: string;
  candidates: string[] | null;
}

export interface ProposalPick {
  roleKey: string;
  names: string[];
  info: { name: string; monthCount: number; lastServed: string }[];
}

export interface Proposal {
  eventId: string;
  picks: ProposalPick[];
  missing: string[];
}

export const csvNames = (s: unknown): string[] =>
  String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
export const dayKey = (v: unknown) => String(v || '').slice(0, 10);
const monthOf = (date: string) => dayKey(date).slice(0, 7);

export function lineupOf(team: Record<string, unknown> | null | undefined, roleKeys: string[]): Lineup {
  const out: Lineup = {};
  for (const key of roleKeys) {
    const names = csvNames(team?.[key]);
    if (names.length) out[key] = names;
  }
  return out;
}

export const isEmptyLineup = (lineup: Lineup | null | undefined) => !Object.values(lineup || {}).some((names) => names?.length);

// Historia służby rosnąco po dacie (tylko wydarzenia ze składem).
// Wejście: wydarzenia z polem `team` = events.assignments[team] (jak GrafikEvent w apce).
export function teamHistory(
  events: { id: string; date: string; title?: string | null; team?: Record<string, unknown> | null }[],
  roleKeys: string[],
): HistoryEntry[] {
  return (events || [])
    .filter((ev) => ev?.date)
    .map((ev) => ({ eventId: ev.id, date: dayKey(ev.date), title: ev.title || '', lineup: lineupOf(ev.team, roleKeys) }))
    .filter((h) => !isEmptyLineup(h.lineup))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Skład z poprzedniego wydarzenia (przed datą docelową): najpierw najbliższe o tym samym tytule
// (np. „Nabożeństwo niedzielne” → poprzednia niedziela), potem po prostu najbliższe wcześniejsze.
export function previousLineup(history: HistoryEntry[], target: { id?: string; date: string; title?: string | null }): HistoryEntry | null {
  const date = dayKey(target?.date);
  const earlier = (history || []).filter((h) => h.date < date && h.eventId !== target?.id);
  if (!earlier.length) return null;
  const title = String(target?.title || '').trim().toLowerCase();
  const sameTitle = title ? earlier.filter((h) => h.title.trim().toLowerCase() === title) : [];
  const pool = sameTitle.length ? sameTitle : earlier;
  return pool[pool.length - 1];
}

// Wstawienie składu (z poprzedniego wydarzenia albo szablonu) TYLKO do pustych ról.
// blocked: Map(imię → powód) — nieobecni w dniu docelowym nie są wstawiani (lądują w skipped);
// allowedFor(roleKey) → Set imion albo null (rola bez przypisanych osób = każdy z zespołu);
// teamNames — Set osób w zespole (ktoś mógł odejść od czasu zapisania szablonu).
export function fillEmptyRoles(
  current: Lineup,
  source: Lineup,
  {
    blocked = new Map<string, string>(),
    allowedFor = () => null,
    teamNames = null,
  }: { blocked?: Map<string, string>; allowedFor?: (roleKey: string) => Set<string> | null; teamNames?: Set<string> | null } = {},
) {
  const changes: Lineup = {};
  const skipped: { name: string; roleKey: string; reason: SkipReason }[] = [];
  for (const [roleKey, names] of Object.entries(source || {})) {
    if ((current?.[roleKey] || []).length) continue;
    const allowed = allowedFor(roleKey);
    const keep: string[] = [];
    for (const name of names || []) {
      if (teamNames && !teamNames.has(name)) {
        skipped.push({ name, roleKey, reason: 'gone' });
        continue;
      }
      if (blocked.has(name)) {
        skipped.push({ name, roleKey, reason: 'absent' });
        continue;
      }
      if (allowed && !allowed.has(name)) {
        skipped.push({ name, roleKey, reason: 'role' });
        continue;
      }
      if (!keep.includes(name)) keep.push(name);
    }
    if (keep.length) changes[roleKey] = keep;
  }
  return { changes, skipped };
}

// Statystyki służby na podstawie historii: ile razy w danym miesiącu (liczba wydarzeń, nie ról),
// kiedy ostatnio przed datą, ile razy w danej roli.
export function serviceStats(history: HistoryEntry[]) {
  const month = new Map<string, number>(); // `${name}|YYYY-MM` → liczba wydarzeń
  const dates = new Map<string, string[]>(); // name → [daty rosnąco]
  const role = new Map<string, number>(); // `${name}|${roleKey}` → liczba
  for (const h of history || []) {
    const people = new Set<string>();
    for (const [roleKey, names] of Object.entries(h.lineup)) {
      for (const n of names) {
        people.add(n);
        role.set(`${n}|${roleKey}`, (role.get(`${n}|${roleKey}`) || 0) + 1);
      }
    }
    for (const n of people) {
      const k = `${n}|${monthOf(h.date)}`;
      month.set(k, (month.get(k) || 0) + 1);
      if (!dates.has(n)) dates.set(n, []);
      dates.get(n)!.push(h.date);
    }
  }
  return {
    monthCount: (name: string, monthKey: string) => month.get(`${name}|${monthKey}`) || 0,
    lastBefore: (name: string, date: string) => {
      const list = dates.get(name) || [];
      let last = '';
      for (const d of list) if (d < date) last = d;
      return last;
    },
    roleCount: (name: string, roleKey: string) => role.get(`${name}|${roleKey}`) || 0,
  };
}

// Ile osób zwykle obsadza rolę (najczęstsza liczba w historii; 1–4).
export function typicalCount(history: HistoryEntry[], roleKey: string) {
  const freq = new Map<number, number>();
  for (const h of history || []) {
    const n = (h.lineup[roleKey] || []).length;
    if (n) freq.set(n, (freq.get(n) || 0) + 1);
  }
  let best = 1;
  let bestFreq = 0;
  for (const [n, f] of freq)
    if (f > bestFreq || (f === bestFreq && n < best)) {
      best = n;
      bestFreq = f;
    }
  return Math.max(1, Math.min(4, best));
}

// Propozycja obsady pustych ról dla listy wydarzeń (rosnąco po dacie).
//   roles: candidates = osoby przypisane do roli w zespole; null = rola bez przypisań → kandydaci
//          z historii (kto już pełnił tę rolę), bo zgadywanie z całego zespołu posadziłoby
//          wokalistkę za perkusją.
// Kolejność kandydatów: najmniej służb w tym miesiącu → najdawniej służył → częściej w tej roli → alfabet.
// Kolejne propozycje liczą się do obciążenia, więc miesiąc rozkłada się po ludziach.
export function proposeLineups({ targets, roles, history }: { targets: ProposalTarget[]; roles: ProposalRole[]; history: HistoryEntry[] }): Proposal[] {
  const stats = serviceStats(history);
  const extraMonth = new Map<string, number>(); // dołożone w tej propozycji: `${name}|YYYY-MM` → liczba
  const extraLast = new Map<string, string>(); // name → ostatnia data z tej propozycji
  const fromHistory = new Map<string, string[]>();
  for (const r of roles) {
    if (r.candidates) continue;
    const set = new Set<string>();
    for (const h of history || []) for (const n of h.lineup[r.key] || []) set.add(n);
    fromHistory.set(r.key, [...set]);
  }
  const monthLoad = (name: string, monthKey: string) => stats.monthCount(name, monthKey) + (extraMonth.get(`${name}|${monthKey}`) || 0);
  const lastServed = (name: string, date: string) => {
    const a = stats.lastBefore(name, date);
    const x = extraLast.get(name);
    const b = x && x < date ? x : '';
    return a > b ? a : b;
  };

  const out: Proposal[] = [];
  for (const t of [...targets].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)))) {
    const date = dayKey(t.date);
    const monthKey = monthOf(date);
    const inEvent = new Set(Object.values(t.lineup || {}).flat());
    const picks: ProposalPick[] = [];
    const missing: string[] = [];
    for (const r of roles) {
      if ((t.lineup?.[r.key] || []).length) continue;
      const pool = (r.candidates || fromHistory.get(r.key) || []).filter((n) => !inEvent.has(n) && !t.blocked?.has(n));
      if (!pool.length) {
        missing.push(r.key);
        continue;
      }
      const ranked = pool
        .slice()
        .sort(
          (a, b) =>
            monthLoad(a, monthKey) - monthLoad(b, monthKey) ||
            lastServed(a, date).localeCompare(lastServed(b, date)) ||
            stats.roleCount(b, r.key) - stats.roleCount(a, r.key) ||
            a.localeCompare(b, 'pl'),
        );
      const names = ranked.slice(0, typicalCount(history, r.key));
      const info = names.map((n) => ({ name: n, monthCount: monthLoad(n, monthKey), lastServed: lastServed(n, date) }));
      for (const n of names) inEvent.add(n);
      picks.push({ roleKey: r.key, names, info });
    }
    // Obciążenie liczymy per wydarzenie (osoba w dwóch rolach tego dnia = jedna służba).
    for (const n of new Set(picks.flatMap((p) => p.names))) {
      const k = `${n}|${monthKey}`;
      extraMonth.set(k, (extraMonth.get(k) || 0) + 1);
      const last = extraLast.get(n);
      if (!last || last < date) extraLast.set(n, date);
    }
    out.push({ eventId: t.id, picks, missing });
  }
  return out;
}
