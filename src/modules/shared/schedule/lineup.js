// Czysta logika obsady grafiku (bez Reacta i bazy) — testy w lineup.test.js.
// Skład (lineup) = { roleKey: ['Imię Nazwisko', …] } — tylko kolumny-role, bez notatek i nieobecności.

export const csvNames = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
export const dayKey = (v) => String(v || '').slice(0, 10);
const monthOf = (date) => dayKey(date).slice(0, 7);

export function lineupOf(team, roleKeys) {
  const out = {};
  for (const key of roleKeys) {
    const names = csvNames(team?.[key]);
    if (names.length) out[key] = names;
  }
  return out;
}

export const isEmptyLineup = (lineup) => !Object.values(lineup || {}).some((names) => names?.length);

// Historia służby: [{ eventId, date, title, lineup }] rosnąco po dacie (tylko wydarzenia ze składem).
export function teamHistory(events, teamType, roleKeys) {
  return (events || [])
    .filter((ev) => ev?.date)
    .map((ev) => ({ eventId: ev.id, date: dayKey(ev.date), title: ev.title || '', lineup: lineupOf(ev.assignments?.[teamType], roleKeys) }))
    .filter((h) => !isEmptyLineup(h.lineup))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Skład z poprzedniego wydarzenia (przed datą docelową): najpierw najbliższe o tym samym tytule
// (np. „Nabożeństwo niedzielne” → poprzednia niedziela), potem po prostu najbliższe wcześniejsze.
export function previousLineup(history, target) {
  const date = dayKey(target?.date);
  const earlier = (history || []).filter((h) => h.date < date && h.eventId !== target?.id);
  if (!earlier.length) return null;
  const title = String(target?.title || '').trim().toLowerCase();
  const sameTitle = title ? earlier.filter((h) => h.title.trim().toLowerCase() === title) : [];
  return (sameTitle.length ? sameTitle : earlier)[(sameTitle.length ? sameTitle : earlier).length - 1];
}

// Wstawienie składu (z poprzedniego wydarzenia albo szablonu) TYLKO do pustych ról.
// blocked: Map(imię → powód) — nieobecni w dniu docelowym nie są wstawiani (lądują w skipped);
// allowedFor(roleKey) → Set imion albo null (rola bez przypisanych osób = każdy z zespołu);
// teamNames — Set osób w zespole (ktoś mógł odejść od czasu zapisania szablonu).
export function fillEmptyRoles(current, source, { blocked = new Map(), allowedFor = () => null, teamNames = null } = {}) {
  const changes = {};
  const skipped = [];
  for (const [roleKey, names] of Object.entries(source || {})) {
    if ((current?.[roleKey] || []).length) continue;
    const allowed = allowedFor(roleKey);
    const keep = [];
    for (const name of names || []) {
      if (teamNames && !teamNames.has(name)) { skipped.push({ name, roleKey, reason: 'gone' }); continue; }
      if (blocked.has(name)) { skipped.push({ name, roleKey, reason: 'absent' }); continue; }
      if (allowed && !allowed.has(name)) { skipped.push({ name, roleKey, reason: 'role' }); continue; }
      if (!keep.includes(name)) keep.push(name);
    }
    if (keep.length) changes[roleKey] = keep;
  }
  return { changes, skipped };
}

// Statystyki służby na podstawie historii: ile razy w danym miesiącu (liczba wydarzeń, nie ról),
// kiedy ostatnio przed datą, ile razy w danej roli.
export function serviceStats(history) {
  const month = new Map(); // `${name}|YYYY-MM` → liczba wydarzeń
  const dates = new Map(); // name → [daty rosnąco]
  const role = new Map(); // `${name}|${roleKey}` → liczba
  for (const h of history || []) {
    const people = new Set();
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
      dates.get(n).push(h.date);
    }
  }
  return {
    monthCount: (name, monthKey) => month.get(`${name}|${monthKey}`) || 0,
    lastBefore: (name, date) => {
      const list = dates.get(name) || [];
      let last = '';
      for (const d of list) if (d < date) last = d;
      return last;
    },
    roleCount: (name, roleKey) => role.get(`${name}|${roleKey}`) || 0,
  };
}

// Ile osób zwykle obsadza rolę (najczęstsza liczba w historii; 1–4).
export function typicalCount(history, roleKey) {
  const freq = new Map();
  for (const h of history || []) {
    const n = (h.lineup[roleKey] || []).length;
    if (n) freq.set(n, (freq.get(n) || 0) + 1);
  }
  let best = 1, bestFreq = 0;
  for (const [n, f] of freq) if (f > bestFreq || (f === bestFreq && n < best)) { best = n; bestFreq = f; }
  return Math.max(1, Math.min(4, best));
}

// Propozycja obsady pustych ról dla listy wydarzeń (rosnąco po dacie).
//   targets: [{ id, date, lineup, blocked: Map }]
//   roles:   [{ key, candidates: string[] | null }] — candidates = osoby przypisane do roli w zespole;
//            null = rola bez przypisań → kandydaci z historii (kto już pełnił tę rolę), bo zgadywanie
//            z całego zespołu posadziłoby wokalistkę za perkusją.
// Kolejność kandydatów: najmniej służb w tym miesiącu → najdawniej służył → częściej w tej roli → alfabet.
// Kolejne propozycje liczą się do obciążenia, więc miesiąc rozkłada się po ludziach.
export function proposeLineups({ targets, roles, history }) {
  const stats = serviceStats(history);
  const extraMonth = new Map(); // dołożone w tej propozycji: `${name}|YYYY-MM` → liczba
  const extraLast = new Map(); // name → ostatnia data z tej propozycji
  const fromHistory = new Map();
  for (const r of roles) {
    if (r.candidates) continue;
    const set = new Set();
    for (const h of history || []) for (const n of h.lineup[r.key] || []) set.add(n);
    fromHistory.set(r.key, [...set]);
  }
  const monthLoad = (name, monthKey) => stats.monthCount(name, monthKey) + (extraMonth.get(`${name}|${monthKey}`) || 0);
  const lastServed = (name, date) => {
    const a = stats.lastBefore(name, date);
    const b = extraLast.get(name) && extraLast.get(name) < date ? extraLast.get(name) : '';
    return a > b ? a : b;
  };

  const out = [];
  for (const t of [...targets].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)))) {
    const date = dayKey(t.date);
    const monthKey = monthOf(date);
    const inEvent = new Set(Object.values(t.lineup || {}).flat());
    const picks = [];
    const missing = [];
    for (const r of roles) {
      if ((t.lineup?.[r.key] || []).length) continue;
      const pool = (r.candidates || fromHistory.get(r.key) || [])
        .filter((n) => !inEvent.has(n) && !t.blocked?.has(n));
      if (!pool.length) { missing.push(r.key); continue; }
      const ranked = pool.slice().sort((a, b) => (
        monthLoad(a, monthKey) - monthLoad(b, monthKey)
        || lastServed(a, date).localeCompare(lastServed(b, date))
        || stats.roleCount(b, r.key) - stats.roleCount(a, r.key)
        || a.localeCompare(b, 'pl')
      ));
      const names = ranked.slice(0, typicalCount(history, r.key));
      const info = names.map((n) => ({ name: n, monthCount: monthLoad(n, monthKey), lastServed: lastServed(n, date) }));
      for (const n of names) inEvent.add(n);
      picks.push({ roleKey: r.key, names, info });
    }
    // Obciążenie liczymy per wydarzenie (osoba w dwóch rolach tego dnia = jedna służba).
    for (const n of new Set(picks.flatMap((p) => p.names))) {
      const k = `${n}|${monthKey}`;
      extraMonth.set(k, (extraMonth.get(k) || 0) + 1);
      if (!extraLast.get(n) || extraLast.get(n) < date) extraLast.set(n, date);
    }
    out.push({ eventId: t.id, picks, missing });
  }
  return out;
}
