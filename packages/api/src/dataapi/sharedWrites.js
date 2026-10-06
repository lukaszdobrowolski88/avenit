// Zapisy do tabel WSPÓLNYCH bez modułu w rejestrze (T(null)).
//
// Odczyt tych tabel jest otwarty dla zalogowanych (tak działa UI), ale zapis do audytu
// 2026-10 nie był sprawdzany wcale — każdy zalogowany mógł przez /api/db zmieniać słowniki,
// role i przypisania w zespołach, kampanie RSVP, udostępnienia materiałów czy cudze posty.
// Tu zapis wymaga uprawnienia z modułu, z którego dane faktycznie pochodzą (jak w UI).
// Dotyczy tylko nie-adminów z modelem uprawnień (resolver) — admin i tryb legacy bez zmian.
import { ApiError, buildWhere } from './querybuilder.js';

const WRITE_OPS = new Set(['insert', 'upsert', 'update', 'delete']);
const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
const lower = (v) => String(v ?? '').toLowerCase();

// Tabele chronione stałą capability (wszystkie operacje zapisu).
const FIXED_CAP = {
  app_dictionaries: 'action:settings:manage_modules', // słowniki zmienia administrator (Ustawienia)
  rsvp_campaigns: 'module:rsvp',                      // kampanie zakłada obsługa RSVP
  event_materials: 'res:events:update',               // materiały wydarzenia — kto edytuje wydarzenie
};

// Tablice zespołów zapisują w `ministry` nazwę (moduły wbudowane) albo klucz modułu (kreator).
const WALL_MODULE = { 'Nauczanie': 'teaching', 'Grupa Uwielbienia': 'worship' };
const wallModule = (v) => WALL_MODULE[v] || v;

export const SHARED_WRITE_TABLES = new Set([
  ...Object.keys(FIXED_CAP), 'team_roles', 'team_member_roles', 'materials_shares', 'wall_posts',
]);

// Zakres WHERE z filtrów żądania (update/delete). Bez filtrów — odrzucamy masowy zapis.
function whereOf(q, params) {
  if (!q.filters?.length) throw new ApiError(400, 'Zmiana wymaga wskazania konkretnych wierszy');
  return buildWhere(q.filters, params, 't', []);
}

// team_type zespołów, których dotyczy zapis do team_roles / team_member_roles.
async function teamTypesOf(q, db) {
  if (q.table === 'team_roles') {
    if (q.op === 'insert' || q.op === 'upsert') return rowsOf(q).map((r) => r.team_type);
    const params = [];
    const { rows } = await db.query(`SELECT DISTINCT t.team_type FROM team_roles t${whereOf(q, params)}`, params);
    return rows.map((r) => r.team_type);
  }
  // team_member_roles: zespół wynika z roli (role_id → team_roles.team_type)
  if (q.op === 'insert' || q.op === 'upsert') {
    const ids = rowsOf(q).map((r) => r.role_id).filter((v) => v != null);
    if (!ids.length) return [null];
    const { rows } = await db.query(`SELECT DISTINCT team_type FROM team_roles WHERE id::text = ANY($1::text[])`, [ids.map(String)]);
    return rows.length ? rows.map((r) => r.team_type) : [null];
  }
  const params = [];
  const where = whereOf(q, params);
  const { rows } = await db.query(
    `SELECT DISTINCT r.team_type FROM team_member_roles t LEFT JOIN team_roles r ON r.id = t.role_id${where}`, params
  );
  return rows.map((r) => r.team_type);
}

// Właściciel folderu/pliku, który udostępniamy.
async function ownsShareTarget(row, db, email) {
  if (row.folder_id != null) {
    const { rows } = await db.query(`SELECT 1 FROM materials_folders WHERE id::text = $1 AND lower(created_by) = $2`, [String(row.folder_id), email]);
    return rows.length > 0;
  }
  if (row.file_id != null) {
    const { rows } = await db.query(`SELECT 1 FROM materials_files WHERE id::text = $1 AND lower(uploaded_by) = $2`, [String(row.file_id), email]);
    return rows.length > 0;
  }
  return false;
}

// Rzuca ApiError(403), gdy zapis jest niedozwolony. Mutuje q.values (autor/twórca = ja).
export async function enforceSharedWrite(q, req, resolver) {
  if (!resolver || !SHARED_WRITE_TABLES.has(q.table) || !WRITE_OPS.has(q.op)) return;
  const email = lower(req.user?.email);
  const db = req.db;

  if (FIXED_CAP[q.table]) {
    if (!resolver.can(FIXED_CAP[q.table])) throw new ApiError(403, 'Brak uprawnień do zmiany tych danych');
    return;
  }

  if (q.table === 'team_roles' || q.table === 'team_member_roles') {
    const types = await teamTypesOf(q, db);
    if (!types.length && (q.op === 'update' || q.op === 'delete')) return; // nic nie pasuje — zapis bez skutku
    const ok = types.every((t) => t && resolver.can(`module:${t}`));
    if (!ok) throw new ApiError(403, 'Zmiany w służbach zespołu wymagają dostępu do modułu tego zespołu');
    return;
  }

  if (q.table === 'materials_shares') {
    const manage = resolver.can('res:materials_files:update');
    if (q.op === 'insert' || q.op === 'upsert') {
      for (const r of rowsOf(q)) {
        if (!manage && !(await ownsShareTarget(r, db, email))) {
          throw new ApiError(403, 'Udostępniać można tylko własne pliki i foldery');
        }
        if (!r.created_by) r.created_by = req.user.email;
      }
      return;
    }
    if (manage) return;
    const params = [];
    const where = whereOf(q, params);
    params.push(email);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE lower(t.created_by) = $${params.length})::int AS mine FROM materials_shares t${where}`, params
    );
    if (rows[0].n !== rows[0].mine) throw new ApiError(403, 'Zmieniać można tylko własne udostępnienia');
    return;
  }

  if (q.table === 'wall_posts') {
    if (q.op === 'insert' || q.op === 'upsert') {
      for (const r of rowsOf(q)) {
        if (r.author_email && lower(r.author_email) !== email) throw new ApiError(403, 'Wpis dodajesz pod własnym kontem');
        r.author_email = req.user.email;
      }
      return;
    }
    // Polubienia może zmieniać każdy, kto widzi tablicę.
    const cols = Object.keys((rowsOf(q)[0]) || {});
    if (q.op === 'update' && cols.length && cols.every((c) => ['likes', 'updated_at'].includes(c))) return;
    // Pozostałe zmiany i usuwanie: autor albo osoba z dostępem do modułu zespołu (np. przypięcie przez lidera).
    const params = [];
    const where = whereOf(q, params);
    const { rows } = await db.query(`SELECT t.author_email, t.team_type, t.ministry FROM wall_posts t${where}`, params);
    const ok = rows.every((r) => lower(r.author_email) === email || [r.team_type, r.ministry].some((k) => k && resolver.can(`module:${wallModule(k)}`)));
    if (!ok) throw new ApiError(403, 'Zmieniać i usuwać można tylko własne wpisy');
  }
}

// Wydatki: decyzja (zatwierdzenie / odrzucenie / opłacenie) tylko z action:finance:approve.
// Lider ma zapis do expense_transactions (składa wnioski o zwrot), ale do audytu 2026-10 mógł
// też sam zatwierdzić i oznaczyć jako opłacony własny wniosek — blokada była tylko w UI.
const DECISION_STATUSES = new Set(['approved', 'rejected', 'paid']);
export function enforceExpenseApproval(q, resolver) {
  if (!resolver || q.table !== 'expense_transactions' || !['insert', 'upsert', 'update'].includes(q.op)) return;
  if (resolver.can('action:finance:approve')) return;
  for (const r of rowsOf(q)) {
    // Domyślne wartości w bazie to status='approved' i is_paid=true — wydatek dodany przez lidera
    // z zakładki zespołu (bez statusu) wliczał się od razu jako zatwierdzony i opłacony.
    if (q.op !== 'update') {
      if (r.status == null) r.status = 'submitted';
      if (r.is_paid == null) r.is_paid = false;
    }
    const decides = (r.status != null && DECISION_STATUSES.has(String(r.status)))
      || r.is_paid === true || r.paid_date != null || r.approved_by != null || r.approved_at != null;
    if (decides) throw new ApiError(403, 'Zatwierdzanie i opłacanie wydatków wymaga uprawnienia do zatwierdzania finansów');
  }
}


// Mailing: status „wysyłane/zaplanowane/wysłane” ustawia wyłącznie funkcja wysyłki (sprawdza
// action:mailing:send). Przez /api/db dało się ustawić `sending`/`scheduled` i worker wysłał
// mail do wszystkich z pominięciem uprawnienia do wysyłki.
const CAMPAIGN_SEND_STATUSES = new Set(['sending', 'scheduled', 'sent']);
export function enforceCampaignStatus(q, resolver) {
  if (q.table !== 'email_campaigns' || !['insert', 'upsert', 'update'].includes(q.op)) return;
  if (resolver && resolver.can('action:mailing:send')) return;
  if (!resolver) return; // admin / tryb legacy
  for (const r of rowsOf(q)) {
    if (r.status != null && CAMPAIGN_SEND_STATUSES.has(String(r.status))) {
      throw new ApiError(403, 'Wysyłkę i planowanie maili uruchamia osoba z uprawnieniem do wysyłki');
    }
  }
}
