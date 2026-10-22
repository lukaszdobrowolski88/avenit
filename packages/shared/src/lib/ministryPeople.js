// „Dodaj członka” w służbie z LISTY OSÓB (zgłoszenie MediaTeamu, 2026-10-22): zamiast wpisywać
// imię, e-mail i telefon z ręki, lider wybiera osobę — konto w aplikacji (app_users) albo osobę
// z kartoteki Członków (members, tylko gdy pytający ma do niej dostęp). Wspólne dla serwera
// (fn ministry-people, synchronizacja przynależność → skład), weba (MemberPickerField)
// i aplikacji (PersonSheet). Czyste JS, bez zależności. Teksty po polsku — web tłumaczy je tr().
//
// Dwa źródła przynależności do służby:
//   • skład (roster) — tabela osób zespołu (media_team, worship_team…): lista Członków i grafik,
//   • ministry_memberships — dostęp do modułu (uprawnienia, ministry.js).
// Osoba dodana do składu z listy kont dostaje też dostęp do modułu (rola „członek”), o ile
// dodający może zapisywać przynależności (strażnik serwera enforceMembershipWrite — bez zmian).

export const PEOPLE_FN = 'ministry-people';

// Tabele składu służby. Pierwsza = skład „osób służby” (tu trafia osoba dodana do służby
// w Ustawieniach; dodanie do niej daje dostęp do modułu). Młodzieżówka: liderzy/opiekunowie
// (mlodziezowka_leaders) to służba, uczestnicy (mlodziezowka_members) — nie.
export const ROSTER_TABLES = {
  worship: ['worship_team'],
  media: ['media_team'],
  atmosfera: ['atmosfera_members'],
  kids: ['kids_teachers'],
  tlumaczenia: ['custom_tlumaczenia_members'],
  mlodziezowka: ['mlodziezowka_leaders', 'mlodziezowka_members'],
};
// Służby bez jednej listy składu: grupy domowe (członkostwo per grupa), Nauczanie.
const NO_ROSTER = new Set(['homegroups', 'teaching']);
const KEY_RE = /^[a-z0-9_]{1,64}$/;

export function rosterTablesFor(key) {
  const k = String(key ?? '');
  if (!KEY_RE.test(k) || NO_ROSTER.has(k)) return [];
  return ROSTER_TABLES[k] || [`custom_${k}_members`];
}
// Tabela, której wiersz odpowiada przynależności do służby (null = brak składu).
export const accessTableFor = (key) => rosterTablesFor(key)[0] || null;
// Czy dodanie osoby do tej tabeli ma też dać dostęp do modułu służby.
export const grantsAccess = (key, table) => !!table && accessTableFor(key) === table;

// Domyślne pole `role` nowej osoby — jak formularze weba i aplikacji.
export const DEFAULT_ROSTER_ROLE = { atmosfera_members: 'Atmosfera', kids_teachers: 'Nauczyciel' };

export const ACCESS_NOTE =
  'Osoba jest na liście zespołu, ale nie ma dostępu do modułu — poproś administratora o dodanie jej do służby w Ustawieniach → Użytkownicy (Służby / Zespoły)';
export const ACCESS_GRANTED = 'Osoba dostała też dostęp do modułu służby.';

// Porównywanie bez wielkości liter, polskich znaków i nadmiarowych spacji.
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
const lc = (s) => String(s ?? '').trim().toLowerCase();

// ── Kto już jest w zespole ──────────────────────────────────────────────────
// Wiersz składu pasuje do osoby po koncie (user_id), po e-mailu, a wiersz BEZ e-maila i konta
// (wpisany ręcznie) — po imieniu i nazwisku. rows: [{ user_id?, email?, full_name? }].
export function rosterMatcher(rows = []) {
  const byUser = new Set();
  const byEmail = new Set();
  const byName = new Set();
  for (const r of rows || []) {
    if (!r) continue;
    if (r.user_id != null && r.user_id !== '') byUser.add(String(r.user_id));
    const e = lc(r.email);
    if (e) byEmail.add(e);
    else if ((r.user_id == null || r.user_id === '') && fold(r.full_name)) byName.add(fold(r.full_name));
  }
  return (p) =>
    (p?.user_id != null && byUser.has(String(p.user_id))) ||
    (!!lc(p?.email) && byEmail.has(lc(p.email))) ||
    (!!fold(p?.name) && byName.has(fold(p.name)));
}

// Lista do wyboru: konta + osoby z kartoteki BEZ konta (dopasowanie po member_id albo e-mailu),
// z oznaczeniem „już w zespole” i „ma dostęp do modułu”. Telefon tylko, gdy wolno go pokazać.
//   accounts: [{ id, full_name, name, email, phone, avatar_url, member_id }]
//   members:  [{ id, first_name, last_name, full_name, email, phone }] (puste bez dostępu do Członków)
//   accessUserIds: Set id kont z przynależnością do służby
export function buildPeople({ accounts = [], members = [], rosterRows = [], accessUserIds = new Set(), accountPhones = false, memberPhones = false, meId = null } = {}) {
  const inTeam = rosterMatcher(rosterRows);
  const out = [];
  const linkedMembers = new Set();
  const accountEmails = new Set();
  for (const a of accounts || []) {
    if (!a || a.id == null) continue;
    const email = a.email ? String(a.email).trim() : null;
    if (email) accountEmails.add(lc(email));
    if (a.member_id != null) linkedMembers.add(String(a.member_id));
    const name = String(a.full_name || a.name || (email ? email.split('@')[0] : '') || '').trim() || 'Osoba';
    const own = meId != null && String(a.id) === String(meId);
    const p = {
      key: `u:${a.id}`,
      source: 'account',
      user_id: String(a.id),
      member_id: null, // powiązanie konta z kartoteką zostaje na serwerze (tylko do odsiania duplikatów)
      name,
      email,
      phone: (accountPhones || own) && a.phone ? String(a.phone) : null,
      avatar_url: a.avatar_url || null,
      has_access: accessUserIds.has(String(a.id)),
    };
    p.in_team = inTeam(p);
    out.push(p);
  }
  for (const m of members || []) {
    if (!m || m.id == null) continue;
    const email = m.email ? String(m.email).trim() : null;
    if (linkedMembers.has(String(m.id)) || (email && accountEmails.has(lc(email)))) continue; // ma konto
    const name = String(m.full_name || [m.first_name, m.last_name].filter(Boolean).join(' ') || '').trim();
    if (!name) continue;
    const p = {
      key: `m:${m.id}`,
      source: 'member',
      user_id: null,
      member_id: String(m.id),
      name,
      email,
      phone: memberPhones && m.phone ? String(m.phone) : null,
      avatar_url: null,
      has_access: false,
    };
    p.in_team = inTeam(p);
    out.push(p);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

// Wyszukiwanie: każde słowo zapytania musi wystąpić w imieniu albo e-mailu. Dostępni najpierw,
// „już w zespole” na końcu; limit wyników (lista w polu formularza).
export function filterPeople(people = [], query = '', { limit = 50 } = {}) {
  const words = fold(query).split(' ').filter(Boolean);
  const hit = (p) => {
    if (!words.length) return true;
    const hay = `${fold(p.name)} ${lc(p.email)}`;
    return words.every((w) => hay.includes(w));
  };
  const list = (people || []).filter(hit);
  const free = list.filter((p) => !p.in_team);
  const taken = list.filter((p) => p.in_team);
  return [...free, ...taken].slice(0, limit);
}

// Pola formularza po wyborze osoby. Telefon — tylko gdy serwer go zwrócił (redakcja r4–r6:
// telefon konta widzi obsługa, telefon z kartoteki — dostęp do Członków); inaczej puste pole
// (bez telefonu poprzednio wybranej osoby). user_id — powiązanie wiersza składu z kontem.
export function prefillFromPerson(person, current = {}) {
  if (!person) return { ...current };
  return {
    ...current,
    full_name: person.name || current.full_name || '',
    email: person.email || '',
    phone: person.phone || '',
    user_id: person.user_id || null,
  };
}

// Czy po dodaniu do składu nadać dostęp do modułu (przynależność 'member').
export function shouldGrantAccess(person, { ministryKey, table } = {}) {
  return !!person?.user_id && !person.has_access && grantsAccess(ministryKey, table);
}

// Wynik próby nadania dostępu z błędu zapisu ministry_memberships.
export function grantOutcome(error) {
  if (!error) return 'granted';
  const txt = `${error.code || ''} ${error.status || ''} ${error.message || ''}`;
  if (/23505|duplicate|unique/i.test(txt)) return 'already';
  return 'denied';
}
