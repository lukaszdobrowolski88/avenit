// Prośby o modlitwę — widoczność „tylko dla liderów” i anonimowość egzekwowane na serwerze.
//
// Ściana modlitwy w UI czyta przez fn prayer-wall (filtruje leaders_only i ukrywa e-maile), ale
// tabela prayer_requests i widok prayer_requests_with_counts są też w /api/db — do audytu 2026-10
// (runda 4) każdy z module:prayer (także członek) czytał nimi prośby „tylko dla liderów”, a w
// tabeli także imię i e-mail autora prośby anonimowej. Tu:
//  • odczyt: leaders_only tylko dla liderów (tab:prayer:leaders_requests — jak „Prośby dla Liderów”)
//    i autora; anonimowa prośba bez danych autora dla wszystkich poza autorem i administratorem,
//  • zapis: nowa prośba zawsze pod moim kontem, zmiana/usunięcie tylko własnej (administrator —
//    każdej; moderacja zgłoszeń idzie przez fn moderate-content),
//  • realtime: ten sam filtr wierszy (redactPrayerRows).
// Administrator aplikacji widzi wszystko (jak dotąd).

export const PRAYER_TABLES = new Set(['prayer_requests', 'prayer_requests_with_counts']);
export const LEADER_PRAYERS_CAPABILITY = 'tab:prayer:leaders_requests';
const ANON_FIELDS = ['user_name', 'user_email', 'user_id', 'requester_name'];

const lower = (v) => String(v ?? '').toLowerCase();

export const isPrayerTable = (table) => PRAYER_TABLES.has(table);

// Kim jest czytający: admin, lider (widzi leaders_only), mój e-mail.
export function prayerViewer({ isAdmin, resolver, email }) {
  return {
    isAdmin: !!isAdmin,
    leaders: !!isAdmin || !!resolver?.can?.(LEADER_PRAYERS_CAPABILITY),
    me: lower(email),
  };
}

// Klauzula „to moja prośba” — widok nie ma e-maila, więc sprawdzamy go w tabeli.
function ownClause(table, alias, push, me) {
  const p = push(me);
  return table === 'prayer_requests'
    ? `lower(${alias}."user_email") = $${p}`
    : `EXISTS (SELECT 1 FROM prayer_requests pr_own WHERE pr_own.id = ${alias}."id" AND lower(pr_own.user_email) = $${p})`;
}

// Zakres wierszy (q.__ownerScope) albo null (admin — bez ograniczeń).
export function prayerScope(table, viewer) {
  if (!isPrayerTable(table) || viewer.isAdmin) return null;
  const mine = (alias, push) => ownClause(table, alias, push, viewer.me);
  return {
    select: viewer.leaders
      ? null
      : (alias, push) => `(${alias}."visibility" IS DISTINCT FROM 'leaders_only' OR ${mine(alias, push)})`,
    update: mine,
    delete: mine,
    upsertGuard: mine,
  };
}

// Zapis: nowa prośba pod moim kontem, bez przepisywania autorstwa. Mutuje q.values.
export function enforcePrayerWrite(q, viewer, userId) {
  if (q.table !== 'prayer_requests' || viewer.isAdmin || !q.values) return;
  const rows = (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
  if (q.op === 'insert' || q.op === 'upsert') {
    for (const r of rows) {
      r.user_email = viewer.me;
      if (userId != null) r.user_id = userId;
    }
  } else if (q.op === 'update') {
    for (const r of rows) {
      delete r.user_email;
      delete r.user_id;
    }
  }
}

// Wiersze w wersji dla czytającego: bez danych autora cudzej prośby anonimowej, a z dropHidden
// (realtime — bez zakresu SQL) także bez cudzych leaders_only, gdy czytający nie jest liderem.
// W /api/db leaders_only odfiltrowuje już SQL (prayerScope), który zna autora także w widoku.
// Zwraca nową tablicę (wiersze kopiowane tylko przy zmianie).
export function redactPrayerRows(rows, viewer, { dropHidden = false } = {}) {
  if (viewer.isAdmin) return rows;
  const out = [];
  for (const row of rows || []) {
    if (!row) continue;
    const own = !!viewer.me && 'user_email' in row && lower(row.user_email) === viewer.me;
    // Widok nie ma e-maila — jego leaders_only w realtime nie trafiają do nie-liderów wcale.
    if (dropHidden && !viewer.leaders && row.visibility === 'leaders_only' && !own) continue;
    if (row.is_anonymous && !own && ANON_FIELDS.some((f) => f in row && row[f] != null)) {
      const copy = { ...row };
      for (const f of ANON_FIELDS) if (f in copy) copy[f] = null;
      out.push(copy);
    } else {
      out.push(row);
    }
  }
  return out;
}
