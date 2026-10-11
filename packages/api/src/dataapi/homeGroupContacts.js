// Kontakty w grupach domowych (audyt 2026-10, runda 4; decyzja właściciela „kontakty grup
// domowych — tylko moje grupy”). home_group_members ma e-mail i telefon każdej osoby, a odczyt
// ma każdy z module:homegroups (także członek). E-mail/telefon cudzych grup widzi tylko obsługa
// grup (edycja składu — lider/członek służby Grup domowych, koordynator) albo ktoś z Członkami.
// Pozostali: pełne dane swoich grup i swojego wiersza, w innych grupach tylko imię i rola.

const CONTACT_FIELDS = ['email', 'phone', 'user_id'];
const lower = (v) => String(v ?? '').toLowerCase();

export const seesAllHomeGroupContacts = (resolver) =>
  !resolver || resolver.can('res:home_group_members:update') || resolver.can('module:members');

export async function myHomeGroupIds(db, email) {
  if (!email) return new Set();
  const { rows } = await db.query(
    `SELECT DISTINCT group_id FROM home_group_members WHERE lower(email) = lower($1) AND group_id IS NOT NULL`,
    [email]
  );
  return new Set(rows.map((r) => String(r.group_id)));
}

// Mutuje wiersze: kontakty tylko z moich grup i mój wiersz. groupIds null = żadnych grup.
export function redactHomeGroupMembers(rows, { groupIds = null, email = '' } = {}) {
  const me = lower(email);
  for (const row of rows || []) {
    if (!row) continue;
    const mine = (me && lower(row.email) === me) || (groupIds && row.group_id != null && groupIds.has(String(row.group_id)));
    if (mine) continue;
    for (const f of CONTACT_FIELDS) if (f in row) row[f] = null;
  }
  return rows;
}
