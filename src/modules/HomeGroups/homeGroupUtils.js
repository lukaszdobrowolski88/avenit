// Czysta logika grup domowych (bez Reacta i bez API) — wspólna dla modułu Grupy domowe,
// Członków i profilu osoby. Testy: homeGroupUtils.test.js.
//
// Członkostwo w grupie żyje w home_group_members (wiele grup na osobę, rola per grupa).
// Wiersz nie ma member_id, więc osobę rozpoznajemy po e-mailu, a gdy wiersz nie ma e-maila
// (dzieci, seniorzy) — po imieniu i nazwisku. members.home_group_id to tylko „pierwsza grupa”
// (zgodność wstecz / widoczność), więc przy wyświetlaniu łączymy oba źródła.

export const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const normEmail = (s) => String(s || '').trim().toLowerCase();

export const fullNameOf = (p) => {
  if (!p) return '';
  if (p.full_name) return String(p.full_name).trim().replace(/\s+/g, ' ');
  return `${p.first_name || ''} ${p.last_name || ''}`.trim().replace(/\s+/g, ' ');
};

// Klucz osoby (do deduplikacji list wyboru): e-mail, a bez e-maila imię i nazwisko.
export const personKey = (p) => {
  const e = normEmail(p?.email);
  return e ? `e:${e}` : `n:${normName(fullNameOf(p))}`;
};

// Czy wiersz home_group_members (lub lidera) należy do tej osoby.
// Wiersz z e-mailem — tylko po e-mailu. Wiersz bez e-maila — po imieniu i nazwisku.
export function rowMatchesPerson(row, person) {
  if (!row || !person) return false;
  const re = normEmail(row.email);
  if (re) return re === normEmail(person.email);
  const rn = normName(row.full_name);
  return !!rn && rn === normName(fullNameOf(person));
}

export const membershipsOf = (person, rows = []) => (rows || []).filter((r) => r.group_id != null && rowMatchesPerson(r, person));

// Grupy osoby: z home_group_members + members.home_group_id (bez duplikatów, w kolejności).
export function memberGroupIds(member, rows = []) {
  const out = [];
  const seen = new Set();
  const add = (id) => { if (id == null || id === '') return; const k = String(id); if (!seen.has(k)) { seen.add(k); out.push(id); } };
  add(member?.home_group_id);
  membershipsOf(member, rows).forEach((r) => add(r.group_id));
  return out;
}

// Grupy osoby z rolą (do listy i profilu): [{ id, name, role }].
export function memberGroupLinks(member, rows = [], groups = []) {
  const byId = new Map((groups || []).map((g) => [String(g.id), g]));
  const roleOf = new Map();
  membershipsOf(member, rows).forEach((r) => {
    const k = String(r.group_id);
    const role = r.role === 'leader' || r.role === 'coordinator' || r.is_leader ? 'leader' : 'member';
    if (roleOf.get(k) !== 'leader') roleOf.set(k, role);
  });
  return memberGroupIds(member, rows)
    .map((id) => ({ id, name: byId.get(String(id))?.name || '', role: roleOf.get(String(id)) || 'member' }))
    .filter((g) => g.name);
}

// Plan synchronizacji członkostw osoby z wyborem w formularzu.
//  rows      — aktualne wiersze home_group_members (wszystkie albo zawężone),
//  person    — { first_name, last_name | full_name, email, phone } po zapisie,
//  prev      — ta sama osoba sprzed edycji (zmiana e-maila / nazwiska) albo null,
//  wantIds   — grupy zaznaczone w formularzu.
// Zwraca { inserts: [group_id], deletes: [row.id], updates: [{ id, patch }] }.
export function planMembershipSync({ rows = [], person, prev = null, wantIds = [] }) {
  const want = new Set((wantIds || []).filter((x) => x != null && x !== '').map(String));
  const mine = (rows || []).filter((r) => r.group_id != null && (rowMatchesPerson(r, person) || (prev && rowMatchesPerson(r, prev))));
  const fullName = fullNameOf(person);
  const email = person?.email ? String(person.email).trim() : null;
  const phone = person?.phone ? String(person.phone).trim() : null;
  const inserts = [];
  const deletes = [];
  const updates = [];
  const have = new Set();
  for (const r of mine) {
    const g = String(r.group_id);
    if (!want.has(g) || have.has(g)) { deletes.push(r.id); continue; }
    have.add(g);
    const patch = {};
    if (fullName && (r.full_name || '') !== fullName) patch.full_name = fullName;
    if (normEmail(r.email) !== normEmail(email)) patch.email = email;
    if (phone && (r.phone || null) !== phone) patch.phone = phone;
    if (Object.keys(patch).length) updates.push({ id: r.id, patch });
  }
  for (const g of want) if (!have.has(g)) inserts.push(g);
  return { inserts, deletes, updates };
}

// Lider grupy: wiersze z rolą lidera w tej grupie (model docelowy), a gdy ich brak —
// wpis z katalogu liderów wskazany przez home_groups.leader_id (dane sprzed zmiany).
export function groupLeaders(group, rows = [], leaders = []) {
  if (!group) return [];
  const out = (rows || []).filter((r) => String(r.group_id) === String(group.id)
    && (r.role === 'leader' || r.role === 'coordinator' || r.is_leader === true));
  if (out.length) return out;
  const l = (leaders || []).find((x) => x.id === group.leader_id);
  return l ? [l] : [];
}

// Czy lider wskazany na grupie (leader_id) jest też członkiem tej grupy z rolą lidera.
export function leaderMissingFromGroup(group, rows = [], leaders = []) {
  if (!group?.leader_id) return null;
  const l = (leaders || []).find((x) => x.id === group.leader_id);
  if (!l) return null;
  const inGroup = (rows || []).some((r) => String(r.group_id) === String(group.id) && rowMatchesPerson(r, l)
    && (r.role === 'leader' || r.role === 'coordinator' || r.is_leader === true));
  return inGroup ? null : l;
}

// Kandydaci do wyboru (lider / nowy członek): baza osób + osoby z grup + katalog liderów,
// bez duplikatów. [{ key, full_name, email, phone, source }]
export function personCandidates({ people = [], rows = [], leaders = [] }) {
  const map = new Map();
  const push = (p, source) => {
    const full_name = fullNameOf(p);
    if (!full_name) return;
    const key = personKey({ ...p, full_name });
    const cur = map.get(key);
    if (cur) {
      if (!cur.phone && p.phone) cur.phone = p.phone;
      return;
    }
    map.set(key, { key, full_name, email: p.email || null, phone: p.phone || null, source });
  };
  (people || []).forEach((p) => push(p, 'base'));
  (rows || []).forEach((p) => push(p, 'group'));
  (leaders || []).forEach((p) => push(p, 'leader'));
  return [...map.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, 'pl'));
}

// Duplikat nazwy grupy (bez wielkości liter i nadmiarowych spacji).
export function findDuplicateGroup(name, groups = [], excludeId = null) {
  const n = normName(name);
  if (!n) return null;
  return (groups || []).find((g) => normName(g.name) === n && String(g.id) !== String(excludeId)) || null;
}

// ── Dzień spotkania ───────────────────────────────────────────────────────────
// W bazie zostaje polska nazwa dnia (wartość, nie etykieta) — wyświetlamy przez tr().
export const WEEKDAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const DAY_PREFIX = [['pon', 0], ['wt', 1], ['śr', 2], ['sr', 2], ['czw', 3], ['pt', 4], ['pią', 4], ['pia', 4], ['sob', 5], ['nie', 6], ['nd', 6]];

// Wolny tekst („piątek”, „Pt.”, „co środę”) → kanoniczna nazwa dnia albo null.
export function normalizeWeekday(text) {
  const s = normName(text).replace(/^co\s+/, '');
  if (!s) return null;
  for (const [p, i] of DAY_PREFIX) if (s.startsWith(p)) return WEEKDAYS[i];
  return null;
}

// ── Geokodowanie (mapa) ─────────────────────────────────────────────────────────
// Prostokąt Polski z marginesem — wynik spoza niego to pomyłka geokodera (np. Kalifornia).
export const POLAND_BBOX = { minLat: 48.9, maxLat: 55.0, minLon: 14.0, maxLon: 24.3 };
export function inPoland(lat, lon) {
  const a = Number(lat); const b = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a >= POLAND_BBOX.minLat && a <= POLAND_BBOX.maxLat && b >= POLAND_BBOX.minLon && b <= POLAND_BBOX.maxLon;
}

export function distanceKm(a, b) {
  const R = 6371; const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Środek (mediana) zbioru punktów — odporny na pojedyncze pomyłki.
export function medianPoint(points = []) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!pts.length) return null;
  const med = (arr) => { const s = [...arr].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  return { lat: med(pts.map((p) => p.lat)), lon: med(pts.map((p) => p.lon)) };
}

// Prostokąt „okolicy kościoła” (środek ± pad stopni) do podpowiedzi geokoderowi.
export function viewboxAround(center, pad = 0.6) {
  if (!center) return null;
  return [center.lon - pad, center.lat + pad, center.lon + pad, center.lat - pad].map((v) => Number(v.toFixed(4))).join(',');
}

// Adres wyszukiwania Nominatim zawężony do Polski (opcjonalnie z preferowaną okolicą).
export function nominatimSearchUrl(query, { viewbox = null, lang = 'pl' } = {}) {
  const p = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'pl', 'accept-language': lang, q: String(query || '').trim() });
  if (viewbox) p.set('viewbox', viewbox);
  return `https://nominatim.openstreetmap.org/search?${p.toString()}`;
}

// Punkty odstające (pomyłki typu „lokalizacja zmienna” → drugi koniec kraju): dalej niż
// maxKm od mediany pozostałych. Przy < 3 punktach nie oceniamy.
export function isOutlier(point, others = [], maxKm = 120) {
  const pts = (others || []).filter((p) => p && p !== point);
  if (pts.length < 2 || !point) return false;
  const c = medianPoint(pts);
  return c ? distanceKm(point, c) > maxKm : false;
}

// Polska odmiana liczebników: 1 grupa, 2–4 grupy, 5+ grup (12–14 → grup).
export function plural(n, one, few, many) {
  const a = Math.abs(Number(n) || 0);
  if (a === 1) return one;
  const d = a % 10; const h = a % 100;
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return few;
  return many;
}
