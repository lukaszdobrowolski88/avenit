// Kolumny wrażliwe per tabela i czytający (audyt uprawnień 2026-10, runda 5).
//
// Redakcja po odczycie (konta, kontakty grup domowych, dane osobowe RSVP/zapisów, autorzy próśb
// anonimowych, głosy w ankietach anonimowych, zakazy pól field:…:read) działa po NAZWIE klucza
// w wierszu wyniku. Do rundy 5 dało się ją obejść:
//  • aliasem kolumny w select (`tel:phone`, `e:email`, `t:token`, `a:user_email`) — wynik miał
//    klucz `tel`, którego żaden redaktor nie znał,
//  • filtrem / sortowaniem po ukrytej kolumnie (np. phone like '+48 60%', user_email = X przy
//    prośbach anonimowych, head+count) — wyrocznia „tak/nie” bez odczytu wartości,
//  • złączeniem (embed) tabeli z kolumnami wrażliwymi (np. app_users:user_id(phone)).
// Tu jedna lista „co jest ukryte przed tym czytającym” — z tych samych stałych, których używają
// redaktory (accountFields.js, homeGroupContacts.js, pii.js, prayerScope.js, komunikatorPlus.js),
// więc lista i redakcja nie mogą się rozjechać. Używają jej: strażnik zapytań (assertSensitiveQuery)
// i ukrywanie kolumn w złączeniach (routes.js → q.__embedHidden).
import { ApiError } from './querybuilder.js';
import { parseSelect } from './selectparser.js';
import { fieldColumns } from '@avenit/shared/src/permissions/catalog.js';
import { PRIVATE_ACCOUNT_FIELDS, seesAccountDetails } from './accountFields.js';
import { HOME_GROUP_CONTACT_COLUMNS, seesAllHomeGroupContacts } from './homeGroupContacts.js';
import { PII_TABLES } from './pii.js';
import { ANON_FIELDS, isPrayerTable } from './prayerScope.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const unescapeLike = (v) => String(v ?? '').replace(/\\(.)/g, '$1');

// viewer: { isAdmin, resolver } — resolver null przy adminie i w trybie legacy (redaktory wtedy
// też niczego nie ukrywają, z wyjątkiem głosów w ankietach anonimowych).
export function sensitiveColumnsFor(table, { isAdmin = false, resolver = null } = {}) {
  const out = new Set();
  // Ankiety anonimowe: e-mail głosującego ukrywany przed każdym, także administratorem (redactVotes).
  if (table === 'poll_votes') out.add('user_email');
  if (isAdmin) return out;
  if (table === 'app_users' && !seesAccountDetails(resolver)) for (const c of PRIVATE_ACCOUNT_FIELDS) out.add(c);
  if (HOME_GROUP_CONTACT_COLUMNS[table] && !seesAllHomeGroupContacts(resolver)) {
    for (const c of HOME_GROUP_CONTACT_COLUMNS[table]) out.add(c);
  }
  const pii = PII_TABLES[table];
  if (pii && resolver && !resolver.can(pii.staffCap)) for (const c of pii.redact) out.add(c);
  if (isPrayerTable(table)) for (const c of ANON_FIELDS) out.add(c);
  if (resolver) for (const c of fieldColumns(table)) if (!resolver.fieldReadable(table, c)) out.add(c);
  return out;
}

// Wartość filtra, która wskazuje WYŁĄCZNIE mój wiersz — wtedy filtr po ukrytej kolumnie niczego
// nie zdradza (np. „moje modlitwy”: user_email = mój e-mail, „moje grupy”: email ilike mój e-mail).
function ownValue(column, value, me) {
  if (value == null || value === '') return false;
  const v = lower(unescapeLike(value));
  if (/(^|_)email$/.test(column)) return !!me.email && v === me.email;
  if (column === 'user_id') return me.userId != null && v === lower(me.userId);
  if (column === 'member_id') return me.memberId != null && v === lower(me.memberId);
  return false;
}

// Nazwa kolumny z wyrażenia or(): "a.eq.1,b.ilike.%x%" → [{ column, op, value }].
function parseOr(value) {
  return String(value ?? '').split(',').map((expr) => {
    const m = expr.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-z]+)\.(.*)$/);
    return m ? { column: m[1], type: m[2], value: m[3] === 'null' ? null : m[3] } : null;
  }).filter(Boolean);
}

const OWN_OPS = new Set(['eq', 'ilike', 'like']);

// Czy pojedynczy warunek na ukrytej kolumnie jest dozwolony: is null/true/false (sam fakt
// wypełnienia) albo dopasowanie dokładnie do własnej wartości (eq/ilike/like, in z samymi moimi).
function filterAllowed(f, me) {
  if (f.type === 'is') return true;
  if (f.type === 'not') return f.operator === 'is';
  if (OWN_OPS.has(f.type)) return ownValue(f.column, f.value, me);
  if (f.type === 'in') return Array.isArray(f.value) && f.value.length > 0 && f.value.every((v) => ownValue(f.column, v, me));
  return false;
}

const DENIED = 'Nie można filtrować ani sortować po danych, których nie widzisz';

// Strażnik zapytania (select, w tym head/count) dla czytającego: bez aliasów kolumn w tabeli,
// w której cokolwiek jest ukrywane (alias omija redakcję i podszywa się pod kolumny, po których
// redaktor rozpoznaje „mój wiersz”), bez filtrów i sortowania po ukrytych kolumnach.
// me: { email, userId, memberId }. Rzuca ApiError(403).
export function assertSensitiveQuery(q, viewer, me = {}) {
  if (q.op !== 'select') return;
  const hidden = sensitiveColumnsFor(q.table, viewer);
  if (!hidden.size) return;
  const own = { email: lower(me.email), userId: me.userId ?? null, memberId: me.memberId ?? null };

  // Aliasy kolumn najwyższego poziomu ("alias:kolumna"; złączenia "alias:tabela(...)" pomijamy —
  // ich wartością jest obiekt JSON, a kolumny złączeń ukrywa q.__embedHidden).
  for (const part of parseSelect(q.select).columns) {
    if (/^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(part)) {
      throw new ApiError(403, `Aliasy kolumn nie są dostępne dla tabeli '${q.table}'`);
    }
  }

  const check = (f) => {
    if (!f) return;
    if (f.type === 'or') {
      for (const c of parseOr(f.value)) if (hidden.has(c.column) && !filterAllowed(c, own)) throw new ApiError(403, DENIED);
      return;
    }
    if (f.type === 'match') {
      for (const [col, val] of Object.entries(f.value || {})) {
        if (hidden.has(col) && !filterAllowed({ type: 'eq', column: col, value: val }, own)) throw new ApiError(403, DENIED);
      }
      return;
    }
    if (f.column !== undefined && hidden.has(f.column) && !filterAllowed(f, own)) throw new ApiError(403, DENIED);
  };
  for (const f of q.filters || []) check(f);
  for (const o of q.order || []) if (o && hidden.has(o.column)) throw new ApiError(403, DENIED);
}
