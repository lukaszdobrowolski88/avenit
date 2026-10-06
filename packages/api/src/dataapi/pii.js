// Dane osobowe w tabelach współdzielonych (zaproszenia RSVP, zapisy na wydarzenia).
//
// Te tabele są w REGISTRY jako T(null): każdy zalogowany musi je czytać, bo liczniki
// („12 osób będzie”, „3 czekają na odpowiedź”) i własny status liczy klient. Do 2026-10
// zwracały jednak wszystkim CAŁE wiersze — e-maile, telefony i prywatne tokeny odpowiedzi
// zaproszonych (token pozwalał odpowiedzieć za kogoś). Teraz:
//   • „obsługa” (staffCap — RSVP: module:rsvp, zapisy: res:events:update; admin zawsze)
//     widzi i zmienia wszystko jak dotąd,
//   • pozostali dostają wszystkie wiersze, ale w CUDZYCH dane osobowe są wymazane (null),
//     piszą tylko własne zapisy; zaproszeń nie zmieniają (odpowiedź idzie przez
//     fn rsvp-respond / my-invitations po stronie serwera).
// Złączeń do tych tabel i subskrypcji realtime bez obsługi nie ma (ominęłyby wymazywanie).

import { ApiError } from './querybuilder.js';

export const PII_TABLES = {
  rsvp_invitations: {
    staffCap: 'module:rsvp',
    redact: ['name', 'email', 'phone', 'token', 'member_id', 'sent_channels', 'reminder_log'],
    // Mój wiersz: zaproszenie na mój profil członka albo na mój e-mail.
    mine: (row, me) =>
      (me.memberId != null && row.member_id != null && String(row.member_id) === String(me.memberId)) ||
      (!!me.email && String(row.email ?? '').toLowerCase() === me.email),
    writes: 'none',
  },
  event_registrations: {
    staffCap: 'res:events:update',
    redact: ['user_email', 'full_name', 'note'],
    mine: (row, me) => !!me.email && String(row.user_email ?? '').toLowerCase() === me.email,
    writes: 'own', // właściciel = user_email
  },
};

export const isPiiTable = (table) => table in PII_TABLES;

// Ograniczenia zapisu dla osoby spoza obsługi. Mutuje q (stempel e-maila, zakres wierszy).
export function enforcePiiWrite(q, me) {
  const rule = PII_TABLES[q.table];
  if (!rule || q.op === 'select') return;
  if (rule.writes === 'none') {
    throw new ApiError(403, 'Zaproszenia zmienia obsługa RSVP — odpowiedz przez link z zaproszenia');
  }
  // writes === 'own' (event_registrations): tylko mój zapis.
  const own = (alias, push) => `lower(${alias}."user_email") = $${push(me.email)}`;
  q.__ownerScope = { update: own, delete: own, upsertGuard: own };
  if (q.op === 'insert' || q.op === 'upsert' || q.op === 'update') {
    const rows = (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
    for (const r of rows) {
      if (q.op === 'update') {
        if ('user_email' in r && String(r.user_email ?? '').toLowerCase() !== me.email) {
          throw new ApiError(403, 'Nie możesz przepisać zapisu na inną osobę');
        }
        continue;
      }
      if (r.user_email == null || r.user_email === '') r.user_email = me.email;
      else if (String(r.user_email).toLowerCase() !== me.email) {
        throw new ApiError(403, 'Zapisać możesz tylko siebie — innych dopisuje organizator');
      }
    }
  }
}

// Wymazanie danych osobowych w cudzych wierszach (odczyt osoby spoza obsługi).
export function redactPii(table, data, me) {
  const rule = PII_TABLES[table];
  if (!rule) return data;
  const clean = (row) => {
    if (!row || typeof row !== 'object' || rule.mine(row, me)) return row;
    const out = { ...row };
    for (const c of rule.redact) if (c in out) out[c] = null;
    return out;
  };
  return Array.isArray(data) ? data.map(clean) : clean(data);
}
