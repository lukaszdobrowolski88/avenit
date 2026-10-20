// Kontakty w grupach domowych (audyt 2026-10, runda 4; decyzja właściciela „kontakty grup
// domowych — tylko moje grupy”). home_group_members ma e-mail i telefon każdej osoby, a odczyt
// ma każdy z module:homegroups (także członek). E-mail/telefon cudzych grup widzi tylko obsługa
// grup (edycja składu — lider/członek służby Grup domowych, koordynator) albo ktoś z Członkami.
// Pozostali: pełne dane swoich grup i swojego wiersza, w innych grupach tylko imię i rola.
//
// Runda 5: ta sama zasada dla home_groups (telefon i e-mail grupy/gospodarza) oraz
// home_group_leaders (e-mail i telefon liderów) — fn my-home-groups je ukrywała, a /api/db
// oddawało je każdemu członkowi. ADRES spotkań (home_groups.address / location) zostaje jawny:
// pokazuje go mapa grup (fn home-groups-map) i karta grupy, żeby dało się ją znaleźć i dołączyć
// — świadoma decyzja, jak w my-home-groups.

// Kolumny kontaktowe per tabela — jedno źródło dla redakcji, złączeń i strażnika filtrów
// (sensitiveColumns.js).
export const HOME_GROUP_CONTACT_COLUMNS = {
  home_group_members: ['email', 'phone', 'user_id'],
  home_groups: ['phone', 'email'],
  home_group_leaders: ['email', 'phone', 'user_email'],
};
const lower = (v) => String(v ?? '').toLowerCase();

export const isHomeGroupContactTable = (table) => Object.prototype.hasOwnProperty.call(HOME_GROUP_CONTACT_COLUMNS, table);

// Obsługa grup: edycja składu, grup albo liderów (formularz edycji nie może zapisać ukrytych
// pól jako puste) lub dostęp do Członków. resolver null = administrator / tryb legacy.
export const seesAllHomeGroupContacts = (resolver) =>
  !resolver || ['res:home_group_members:update', 'res:home_groups:update', 'res:home_group_leaders:update', 'module:members']
    .some((c) => resolver.can(c));

// Moje grupy: członek (home_group_members.email) albo lider (home_group_leaders.email / user_email)
// — jak fn my-home-groups. Starszy schemat bez tych kolumn liderów — tylko członkostwo.
export async function myHomeGroupIds(db, email) {
  if (!email) return new Set();
  const out = new Set();
  const { rows } = await db.query(
    `SELECT DISTINCT group_id FROM home_group_members WHERE lower(email) = lower($1) AND group_id IS NOT NULL`,
    [email]
  );
  for (const r of rows) out.add(String(r.group_id));
  try {
    const { rows: led } = await db.query(
      `SELECT DISTINCT group_id FROM home_group_leaders
        WHERE (lower(email) = lower($1) OR lower(user_email) = lower($1)) AND group_id IS NOT NULL`,
      [email]
    );
    for (const r of led) out.add(String(r.group_id));
  } catch { /* brak kolumny user_email / tabeli — tylko członkostwo */ }
  return out;
}

// Czy wiersz należy do „moich” grup albo jest moim wierszem. groupIds null = żadnych grup.
function isMine(table, row, groupIds, me) {
  if (table === 'home_groups') return !!(groupIds && row.id != null && groupIds.has(String(row.id)));
  if (me && (lower(row.email) === me || (table === 'home_group_leaders' && lower(row.user_email) === me))) return true;
  return !!(groupIds && row.group_id != null && groupIds.has(String(row.group_id)));
}

// Mutuje wiersze: kontakty tylko z moich grup i mój wiersz.
export function redactHomeGroupRows(table, rows, { groupIds = null, email = '' } = {}) {
  const cols = HOME_GROUP_CONTACT_COLUMNS[table];
  if (!cols) return rows;
  const me = lower(email);
  for (const row of rows || []) {
    if (!row || typeof row !== 'object' || isMine(table, row, groupIds, me)) continue;
    for (const f of cols) if (f in row) row[f] = null;
  }
  return rows;
}

// Członkowie grup (runda 4 — wywołania w testach i realtime).
export function redactHomeGroupMembers(rows, opts = {}) {
  return redactHomeGroupRows('home_group_members', rows, opts);
}
