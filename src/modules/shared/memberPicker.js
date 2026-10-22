// Logika „Dodaj członka z listy osób” (bez Reacta) — testowana w memberPicker.test.js.
// Reguły wspólne z serwerem i aplikacją: @avenit/shared/src/lib/ministryPeople.js.
import { PEOPLE_FN, grantOutcome, shouldGrantAccess } from '@avenit/shared/src/lib/ministryPeople.js';

export { filterPeople, prefillFromPerson, ACCESS_NOTE, ACCESS_GRANTED } from '@avenit/shared/src/lib/ministryPeople.js';

const EMPTY_META = { people: [], link_user: false, grants_access: false, can_grant_access: false, phones_visible: false, members_included: false };

// Lista osób do wyboru (fn ministry-people). Błąd / brak uprawnień → pusta lista (zostaje wpisanie ręczne).
export async function loadMinistryPeople(client, { ministryKey, table }) {
  const { data, error } = await client.functions.invoke(PEOPLE_FN, { body: { ministry_key: ministryKey, table } });
  if (error || !data || !Array.isArray(data.people)) return { ...EMPTY_META, failed: true };
  return { ...EMPTY_META, ...data };
}

// Kolumny łączące nowy wiersz składu z kontem wybranej osoby (gdy tabela ma user_id).
export function rosterLinkFields(person, meta) {
  return person?.user_id && meta?.link_user ? { user_id: person.user_id } : {};
}

// Po dodaniu do składu: dostęp do modułu (przynależność 'member') dla osoby z kontem.
// Zapis przez /api/db — ten sam strażnik co w Ustawieniach (enforceMembershipWrite); serwer
// sam dopisze brakujący wiersz składu, ale ten już istnieje (dopasowanie po koncie/e-mailu).
// → 'none' (nie dotyczy) | 'granted' | 'already' | 'denied'
export async function afterRosterInsert(client, { ministryKey, table, person, meta }) {
  if (!shouldGrantAccess(person, { ministryKey, table })) return 'none';
  if (meta && meta.can_grant_access === false) return 'denied';
  const { error } = await client.from('ministry_memberships').insert({ user_id: person.user_id, ministry_key: ministryKey, role: 'member' });
  return grantOutcome(error);
}
