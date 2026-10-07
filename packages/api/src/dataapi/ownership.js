// Własność wierszy w tabelach „osobistych”.
//
// Te tabele są w REGISTRY jako T(null): dostęp do TABELI ma każdy zalogowany (to dane
// samego użytkownika — zadania, nieobecności, układ pulpitu, preferencje, powiadomienia).
// Do 2026-10 serwer nie pilnował jednak WIERSZY — filtr po e-mailu był tylko w kliencie,
// więc każdy zalogowany mógł przez /api/db czytać i zmieniać cudze (np. prywatne zadania).
// Tu definiujemy, czyje są wiersze, a routes/querybuilder/realtime to egzekwują dla
// KAŻDEGO (także admina — to prywatne dane, żaden ekran administracyjny ich nie czyta).
// Kod serwerowy (fn/*, worker) używa bezpośrednio SQL i nie podlega tym ograniczeniom.

import { ApiError } from './querybuilder.js';

// owner     — kolumna właściciela (wstawiana/sprawdzana przy zapisie),
// readers   — kto widzi wiersz (dowolna z kolumn = ja), domyślnie [owner],
// editors   — kto może zmieniać, domyślnie [owner]; usuwa zawsze tylko owner,
// byId      — kolumna trzyma app_users.id zamiast e-maila,
// openInsert— wstawiać można także innym (powiadomienie dla kogoś),
// takeover  — upsert może przejąć cudzy wiersz po kluczu konfliktu (token urządzenia
//             po zmianie konta na tym samym telefonie); odczyt i tak tylko własnych.
export const OWNED_TABLES = {
  user_tasks: { owner: 'user_email', readers: ['user_email', 'assigned_to_email'], editors: ['user_email', 'assigned_to_email'] },
  user_absences: { owner: 'user_email' },
  user_dashboard_layouts: { owner: 'user_email' },
  push_user_preferences: { owner: 'user_email' },
  sms_user_preferences: { owner: 'user_email' },
  push_subscriptions: { owner: 'user_email', takeover: true },
  push_tokens: { owner: 'user_email', takeover: true },
  notifications: { owner: 'user_email', openInsert: true },
  ical_subscriptions: { owner: 'user_email' }, // web zapisuje user_email (migracja 077)
  user_blocks: { owner: 'blocker_email' }, // Komunikator+ (088): moje blokady widzę tylko ja
  totp_auth_logs: { owner: 'user_id', byId: true },
};

// Komentarze do zadań: widoczne dla tych, którzy widzą zadanie; zmienia/usuwa autor.
const TASK_COMMENTS = 'user_task_comments';

export const isOwnedTable = (table) => table in OWNED_TABLES || table === TASK_COMMENTS;

const me = (rule, user) => (rule.byId ? String(user.id ?? '') : String(user.email ?? '').toLowerCase());

// Klauzula „wiersz należy do mnie” po dowolnej z kolumn.
function matchClause(cols, rule, alias, push, user) {
  const p = push(me(rule, user));
  return `(${cols
    .map((c) => (rule.byId ? `${alias}."${c}"::text = $${p}` : `lower(${alias}."${c}") = $${p}`))
    .join(' OR ')})`;
}

// Zakres wierszy dla zapytania. Zwraca obiekt funkcji (alias, push) => SQL albo null,
// gdy tabela nie jest osobista. push(value) dokłada parametr i zwraca jego numer.
export function ownerScope(table, user) {
  if (table === TASK_COMMENTS) {
    const email = String(user.email ?? '').toLowerCase();
    const visibleTask = (alias, push) => {
      const p = push(email);
      return `EXISTS (SELECT 1 FROM user_tasks ut WHERE ut.id = ${alias}.task_id AND (lower(ut.user_email) = $${p} OR lower(ut.assigned_to_email) = $${p}))`;
    };
    const author = (alias, push) => `lower(${alias}."author_email") = $${push(email)}`;
    return { select: visibleTask, update: author, delete: author, upsertGuard: author };
  }
  const rule = OWNED_TABLES[table];
  if (!rule) return null;
  const readers = rule.readers ?? [rule.owner];
  const editors = rule.editors ?? [rule.owner];
  return {
    select: (alias, push) => matchClause(readers, rule, alias, push, user),
    update: (alias, push) => matchClause(editors, rule, alias, push, user),
    delete: (alias, push) => matchClause([rule.owner], rule, alias, push, user),
    // Upsert na cudzym wierszu (konflikt klucza) — bez nadpisania, chyba że takeover.
    upsertGuard: rule.takeover ? null : (alias, push) => matchClause([rule.owner], rule, alias, push, user),
  };
}

// Walidacja zapisu: wiersze wstawiane pod moim kontem (kolumna właściciela pusta → wstawiamy
// moją), zmiana nie może przepisać wiersza na kogoś innego. Mutuje q.values.
export function enforceOwnedWrite(q, user) {
  const table = q.table;
  if (!isOwnedTable(table) || !['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  const rows = Array.isArray(q.values) ? q.values : [q.values];

  if (table === TASK_COMMENTS) {
    const email = String(user.email ?? '');
    for (const r of rows) {
      if (!r) continue;
      if (q.op === 'update') {
        if ('author_email' in r && String(r.author_email ?? '').toLowerCase() !== email.toLowerCase()) {
          throw new ApiError(403, 'Nie możesz przepisać komentarza na inną osobę');
        }
        if ('task_id' in r) throw new ApiError(403, 'Nie można przenieść komentarza do innego zadania');
      } else {
        if (r.author_email != null && String(r.author_email).toLowerCase() !== email.toLowerCase()) {
          throw new ApiError(403, 'Komentarz dodajesz pod własnym kontem');
        }
        r.author_email = email;
      }
    }
    return;
  }

  const rule = OWNED_TABLES[table];
  const mine = me(rule, user);
  const same = (v) => (rule.byId ? String(v ?? '') === mine : String(v ?? '').toLowerCase() === mine);
  for (const r of rows) {
    if (!r) continue;
    if (q.op === 'update') {
      if (rule.owner in r && !same(r[rule.owner])) {
        throw new ApiError(403, 'Nie możesz przepisać tego wpisu na inną osobę');
      }
      continue;
    }
    // insert / upsert
    if (r[rule.owner] == null || r[rule.owner] === '') {
      r[rule.owner] = rule.byId ? user.id : user.email;
    } else if (!same(r[rule.owner]) && !(rule.openInsert && q.op === 'insert')) {
      throw new ApiError(403, 'Ten wpis możesz utworzyć tylko dla siebie');
    }
  }
}

// Wstawienie komentarza wymaga, by zadanie było moje albo przypisane do mnie.
export async function assertTaskCommentTarget(q, req) {
  if (q.table !== TASK_COMMENTS || (q.op !== 'insert' && q.op !== 'upsert')) return;
  const rows = (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
  const email = String(req.user.email ?? '').toLowerCase();
  for (const r of rows) {
    const { rows: ok } = await req.db.query(
      `SELECT 1 FROM user_tasks WHERE id::text = $1::text AND (lower(user_email) = $2 OR lower(assigned_to_email) = $2) LIMIT 1`,
      [r.task_id, email]
    );
    if (!ok.length) throw new ApiError(403, 'Komentować można tylko własne albo przypisane zadania');
  }
}

// Realtime: czy zmianę wiersza można wysłać temu klientowi (null = tabela nieosobista).
export function realtimeVisible(table, row, client) {
  if (!isOwnedTable(table)) return null;
  if (!row) return false;
  if (table === TASK_COMMENTS) return String(row.author_email ?? '').toLowerCase() === String(client.email ?? '').toLowerCase();
  const rule = OWNED_TABLES[table];
  const mine = rule.byId ? String(client.userId ?? '') : String(client.email ?? '').toLowerCase();
  return (rule.readers ?? [rule.owner]).some((c) => (rule.byId ? String(row[c] ?? '') === mine : String(row[c] ?? '').toLowerCase() === mine));
}
