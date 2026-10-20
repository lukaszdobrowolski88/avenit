// Redakcja wierszy wyniku /api/db dla czytającego — JEDNO miejsce dla odczytu (SELECT) i dla
// wierszy zwracanych przez zapis (insert / update / upsert / delete z `returning` / `.select()`).
//
// Audyt uprawnień 2026-10, runda 6: redaktory (dane osobowe RSVP/zapisów, głosy w ankietach
// anonimowych, autorzy próśb anonimowych, kontakty grup domowych, telefony i logowania kont,
// zakazy pól field:…:read) działały tylko przy `op === 'select'`. Zapis z RETURNING oddawał
// CAŁY wiersz — np. osoba z prawem edycji pola grupy (bez dostępu do kontaktów) dostawała
// telefon i e-mail cudzej grupy, a zakaz odczytu pola nie działał na odpowiedź zapisu.
// Teraz routes.js woła redactRows dla każdej operacji, więc ścieżki nie mogą się rozjechać.
// Wiersze „moje” (własna prośba, własny zapis, własne konto, moje grupy) zostają pełne —
// formularze, które zapisują i od razu używają zwróconego wiersza, działają jak dotąd.
//
// Złączeń (embed) w RETURNING nie ma (querybuilder zwraca wtedy sam wiersz główny), a aliasów
// kolumn RETURNING nie przyjmuje (quoteIdent → 400), więc redakcja po nazwie klucza wystarcza.
import { fieldColumns } from '@avenit/shared/src/permissions/catalog.js';
import { redactPii } from './pii.js';
import { anonymousPollIds, redactVotes } from './komunikatorPlus.js';
import { redactPrayerRows } from './prayerScope.js';
import { redactAccounts } from './accountFields.js';
import { seesAllHomeGroupContacts, myHomeGroupIds, isHomeGroupContactTable, redactHomeGroupRows } from './homeGroupContacts.js';

// ctx:
//   db            — pula tenanta (głosy w ankietach, moje grupy domowe),
//   op            — operacja zapytania; przy zapisie wiersze są KOPIOWANE (oryginały idą dalej do
//                   realtime, powiadomień i śladu budżetu — tam redakcja per odbiorca),
//   resolver      — resolver nie-admina (null: admin / tryb legacy),
//   fieldResolver — resolver z canAccess (zakazy pól; null/undefined = bez zakazów),
//   piiRestricted — tabela z danymi osobowymi, a czytający nie jest jej obsługą (pii.js),
//   piiMe         — { email, memberId },
//   prayerCtx     — prayerViewer() dla tabel próśb albo null,
//   user          — { id, email } zalogowanego.
export async function redactRows(table, rows, ctx) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const { db, op, resolver = null, fieldResolver = null, piiRestricted = false, piiMe = {}, prayerCtx = null, user = {} } = ctx;
  let data = op === 'select' ? rows : rows.map((r) => (r && typeof r === 'object' ? { ...r } : r));

  if (piiRestricted) data = redactPii(table, data, piiMe);

  // Ankiety anonimowe (K7): e-mail głosującego tylko w jego własnych głosach — także dla admina.
  if (table === 'poll_votes') {
    const anon = await anonymousPollIds(db, data.map((r) => r?.message_id));
    data = redactVotes(data, anon, user.email);
  }

  if (prayerCtx) data = redactPrayerRows(data, prayerCtx);

  // Kontakty grup domowych (członkowie, telefon/e-mail grupy, liderzy) — tylko z moich grup.
  if (isHomeGroupContactTable(table) && !seesAllHomeGroupContacts(resolver)) {
    redactHomeGroupRows(table, data, { groupIds: await myHomeGroupIds(db, user.email), email: user.email });
  }

  if (table === 'app_users' && resolver) redactAccounts(data, resolver, user);

  // Zakazy pól (field:<tabela>:<kolumna>:read): kolumny bez prawa odczytu usuwane.
  if (fieldResolver) {
    const denied = fieldColumns(table).filter((c) => !fieldResolver.fieldReadable(table, c));
    if (denied.length) for (const row of data) if (row && typeof row === 'object') for (const c of denied) if (c in row) delete row[c];
  }
  return data;
}
