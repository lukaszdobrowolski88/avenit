// Zapisy do tabel WSPÓLNYCH bez modułu w rejestrze (T(null)).
//
// Odczyt tych tabel jest otwarty dla zalogowanych (tak działa UI), ale zapis do audytu
// 2026-10 nie był sprawdzany wcale — każdy zalogowany mógł przez /api/db zmieniać słowniki,
// role i przypisania w zespołach, kampanie RSVP, udostępnienia materiałów czy cudze posty.
// Tu zapis wymaga uprawnienia z modułu, z którego dane faktycznie pochodzą (jak w UI).
// Dotyczy tylko nie-adminów z modelem uprawnień (resolver) — admin i tryb legacy bez zmian.
import { ApiError, buildWhere } from './querybuilder.js';
import { canModuleScoped } from '@avenit/shared/src/permissions/moduleScope.js';
import { accountChangeDenied, exceedsCaller, roleIsAdmin } from '../lib/admin-guard.js';
import { getTableRule } from './registry.js';
import { MINISTRY_MODULES, DENY_PREFIX, isCustomMinistryKey, membershipCapabilities } from '@avenit/shared/src/permissions/ministry.js';

const WRITE_OPS = new Set(['insert', 'upsert', 'update', 'delete']);
const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
const lower = (v) => String(v ?? '').toLowerCase();

// Tabele chronione stałą capability (wszystkie operacje zapisu).
const FIXED_CAP = {
  app_dictionaries: 'action:settings:manage_modules', // słowniki zmienia administrator (Ustawienia)
  rsvp_campaigns: 'module:rsvp',                      // kampanie zakłada obsługa RSVP
};

// Tablice zespołów zapisują w `ministry` nazwę (moduły wbudowane) albo klucz modułu (kreator).
const WALL_MODULE = { 'Nauczanie': 'teaching', 'Grupa Uwielbienia': 'worship' };
const wallModule = (v) => WALL_MODULE[v] || v;

export const SHARED_WRITE_TABLES = new Set([
  ...Object.keys(FIXED_CAP), 'event_materials', 'team_roles', 'team_member_roles', 'schedule_templates', 'materials_shares', 'wall_posts',
]);

// Tabele, w których zespół zapisany jest wprost w kolumnie team_type.
const TEAM_TYPE_TABLES = new Set(['team_roles', 'schedule_templates']);

// Zakres WHERE z filtrów żądania (update/delete). Bez filtrów — odrzucamy masowy zapis.
function whereOf(q, params) {
  if (!q.filters?.length) throw new ApiError(400, 'Zmiana wymaga wskazania konkretnych wierszy');
  return buildWhere(q.filters, params, 't', []);
}

// team_type zespołów, których dotyczy zapis do team_roles / team_member_roles / schedule_templates.
async function teamTypesOf(q, db) {
  if (TEAM_TYPE_TABLES.has(q.table)) {
    if (q.op === 'insert' || q.op === 'upsert') return rowsOf(q).map((r) => r.team_type);
    const params = [];
    const { rows } = await db.query(`SELECT DISTINCT t.team_type FROM ${q.table} t${whereOf(q, params)}`, params);
    // Przeniesienie wiersza do innego zespołu (team_type w zmianie) wymaga też dostępu do zespołu docelowego.
    const moved = q.op === 'update' && rows.length ? rowsOf(q).filter((r) => 'team_type' in r).map((r) => r.team_type) : [];
    return [...rows.map((r) => r.team_type), ...moved];
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

  // Upsert (ON CONFLICT DO UPDATE) nadpisałby ISTNIEJĄCY wiersz po kluczu konfliktu, a poniższe
  // reguły sprawdzają tylko nowe wartości (autor, zespół, wydarzenie) — cudzy wpis dałoby się przejąć.
  // Bez nadpisywania (ignoreDuplicates) to zwykłe dodanie.
  if (q.op === 'upsert' && !q.ignoreDuplicates) {
    throw new ApiError(403, 'Te dane zapisuj przez dodanie albo zmianę — upsert mógłby nadpisać cudzy wpis');
  }

  // Materiały wydarzenia — kto edytuje to wydarzenie: globalnie (res:events:update) albo lider
  // służby, do której wydarzenie należy (events.module_key; moduleScope.js).
  if (q.table === 'event_materials') {
    if (resolver.can('module:calendar') && resolver.can('res:events:update')) return;
    let keys;
    if (q.op === 'insert' || q.op === 'upsert') {
      const ids = [...new Set(rowsOf(q).map((r) => r.event_id).filter((v) => v != null).map(String))];
      if (!ids.length) throw new ApiError(403, 'Brak uprawnień do zmiany tych danych');
      const { rows } = await db.query('SELECT id, module_key FROM events WHERE id::text = ANY($1::text[])', [ids]);
      if (rows.length !== ids.length) throw new ApiError(403, 'Brak uprawnień do zmiany tych danych');
      keys = rows.map((r) => r.module_key);
    } else {
      const params = [];
      const where = whereOf(q, params);
      const { rows } = await db.query(`SELECT DISTINCT e.module_key FROM event_materials t LEFT JOIN events e ON e.id = t.event_id${where}`, params);
      if (!rows.length) return; // nic nie pasuje — zapis bez skutku
      keys = rows.map((r) => r.module_key);
    }
    if (!keys.every((k) => canModuleScoped(resolver.can, k || null, 'events', 'update'))) {
      throw new ApiError(403, 'Brak uprawnień do zmiany tych danych');
    }
    return;
  }

  if (TEAM_TYPE_TABLES.has(q.table) || q.table === 'team_member_roles') {
    const types = await teamTypesOf(q, db);
    if (!types.length && (q.op === 'update' || q.op === 'delete')) return; // nic nie pasuje — zapis bez skutku
    const ok = types.every((t) => t && resolver.can(`module:${t}`));
    if (!ok) throw new ApiError(403, 'Zmiany w służbach zespołu wymagają dostępu do modułu tego zespołu');
    // Szablon składu: autor = osoba zapisująca (gdy klient nie podał).
    if (q.table === 'schedule_templates' && (q.op === 'insert' || q.op === 'upsert')) {
      for (const r of rowsOf(q)) if (!r.created_by) r.created_by = req.user.email;
    }
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


// ── Konta i ustawienia bezpieczeństwa (audyt 2026-10, runda 3) ──────────────────────────────
// Zapis app_users przez /api/db bramkuje samo action:settings:manage_users. Osoba z tym prawem,
// ale BEZ roli administratora, nie może przez /api/db (tak jak w fn admin-update-user):
//   • nadać roli administracyjnej ani roli z uprawnieniem ustawień, którego sama nie ma,
//   • ustawiać is_super_admin,
//   • zmieniać / blokować / usuwać konta administratora ani konta o szerszych uprawnieniach.
// Edycja własnego profilu (kolumny selfUpdateColumns z registry) działa jak dotąd.
// app_settings: klucze sso_* (logowanie zewnętrzne + auto-provisioning) zmienia tylko administrator;
// registration_default_role nie może wskazywać roli administratora ani szerszej niż własna.
// Wywołujący: tylko dla nie-adminów (isAdmin = superadmin / rola is_admin) — admin bez zmian.
const ADMIN_ONLY_SETTING = (key) => String(key ?? '').startsWith('sso_');
const ROLE_SETTINGS = new Set(['registration_default_role']);

async function settingKeysOf(q, db) {
  const keys = rowsOf(q).filter((r) => 'key' in r).map((r) => r.key);
  if (q.op === 'update' || q.op === 'delete') {
    const params = [];
    const { rows } = await db.query(`SELECT t.key FROM app_settings t${whereOf(q, params)}`, params);
    keys.push(...rows.map((r) => r.key));
  }
  return keys;
}

async function enforceSettingsWrite(q, req, caller) {
  const keys = await settingKeysOf(q, req.db);
  if (keys.some(ADMIN_ONLY_SETTING)) throw new ApiError(403, 'Konfigurację SSO zmienia tylko administrator.');
  if (q.op === 'delete' || !keys.some((k) => ROLE_SETTINGS.has(k))) return;
  for (const r of rowsOf(q)) {
    const role = r.value == null ? '' : String(r.value);
    if (!role) continue;
    if (await roleIsAdmin(req.db, role)) throw new ApiError(403, 'Tylko administrator może ustawić rolę administratora jako domyślną.');
    if (await exceedsCaller(req.db, req.tenant.db_name, { role, userId: null }, caller)) {
      throw new ApiError(403, 'Nie możesz ustawić domyślnej roli z uprawnieniami, których sam nie masz.');
    }
  }
}

// Kolumny wiążące konto z TOŻSAMOŚCIĄ osoby (audyt 2026-10, runda 5). member_id łączy konto
// z profilem członka (fn my-giving pokazuje darowizny tego profilu, my-* — jego dane), e-mail jest
// kluczem dopasowania w wielu miejscach (darowizny po members.email, grupy domowe, zaproszenia).
// Osoba z samym manage_users mogła przez /api/db podpiąć SWOJE konto do cudzego profilu
// (accountChangeDenied przepuszcza zmiany własnego konta) i czytać cudze darowizny. Zmiana tych
// kolumn — także we własnym koncie — wymaga dostępu do Członków albo prawa do uprawnień.
export const IDENTITY_COLUMNS = ['member_id', 'email', 'auth_user_id'];
export const identityChangeAllowed = (resolver) =>
  !resolver || resolver.can('module:members') || resolver.can('action:settings:manage_permissions');

export async function enforceAccountWrite(q, req, { isAdmin, user, resolver = null }) {
  if (isAdmin || !WRITE_OPS.has(q.op) || !['app_users', 'app_settings'].includes(q.table)) return;
  const caller = {
    id: req.user.id, email: req.user.email, role: user?.role ?? req.user.role,
    is_active: true, is_super_admin: !!user?.is_super_admin, role_admin: false,
  };
  if (q.table === 'app_settings') return enforceSettingsWrite(q, req, caller);

  const rows = rowsOf(q);
  if (rows.some((r) => 'is_super_admin' in r)) {
    throw new ApiError(403, 'Tylko administrator może zmieniać uprawnienia super-administratora.');
  }
  if (rows.some((r) => IDENTITY_COLUMNS.some((c) => c in r)) && !identityChangeAllowed(resolver)) {
    throw new ApiError(403, 'Powiązanie konta z osobą (e-mail, profil członka) zmienia administrator albo obsługa Członków.');
  }
  const dbName = req.tenant.db_name;
  if (q.op === 'upsert') {
    // ON CONFLICT DO UPDATE nadpisałby istniejące (być może administratora) konto bez sprawdzenia.
    throw new ApiError(403, 'Konta zakładaj albo zmieniaj osobno — upsert mógłby nadpisać konto administratora');
  }
  if (q.op === 'insert') {
    for (const r of rows) {
      const denied = await accountChangeDenied(req.db, dbName, caller, { id: null, role: null }, { newRole: 'role' in r ? r.role : undefined });
      if (denied) throw new ApiError(403, denied);
    }
    return;
  }
  // update / delete: sprawdź każde konto objęte filtrem.
  const params = [];
  const { rows: targets } = await req.db.query(
    `SELECT t.id, t.role, t.is_super_admin FROM app_users t${whereOf(q, params)}`, params
  );
  const selfCols = getTableRule('app_users')?.selfUpdateColumns || [];
  const cols = rows.flatMap((r) => Object.keys(r));
  const onlySelf = targets.every((t) => String(t.id) === String(req.user.id));
  if (q.op === 'update' && onlySelf && cols.every((c) => selfCols.includes(c))) return; // własny profil
  const newRole = q.op === 'update' && rows.some((r) => 'role' in r) ? rows.find((r) => 'role' in r).role : undefined;
  for (const t of targets) {
    const denied = await accountChangeDenied(req.db, dbName, caller, t, { newRole });
    if (denied) throw new ApiError(403, denied);
  }
}


// ── Przynależność do służb i role (audyt 2026-10, runda 5) ─────────────────────────────────
// ministry_memberships zapisuje każdy z action:settings:manage_users, a przynależność NADAJE
// uprawnienia (ministry.js). Do rundy 5 osoba z samym manage_users mogła dopisać sobie wiersz
// { ministry_key: 'members' | 'finance' | 'settings', role: 'leader' } i dostać Członków, darowizny,
// a nawet action:settings:manage_permissions. Teraz:
//   • klucz musi być służbą: moduł zespołu z katalogu (MINISTRY_MODULES) albo istniejący moduł
//     własny z kreatora (app_modules, nie systemowy) — dla każdego, także administratora
//     (granty i tak dostają tylko służby; wiersz z innym kluczem byłby martwy),
//   • rola: 'member' albo 'leader',
//   • nie-administrator nie dotknie przynależności konta administratora ani konta szerszego
//     niż własne (accountChangeDenied) i nie nada przynależności, której uprawnienia
//     przekraczają jego własne (każda capability z membershipCapabilities musi być już jego).
//     Lider służby z manage_users przypisuje więc ludzi do swojej służby, ale nie do cudzych
//     ani sam siebie na lidera. Upsert — zabroniony (nadpisałby cudzy wiersz bez sprawdzenia).
const MEMBERSHIP_ROLES = new Set(['member', 'leader']);

async function ministryKeyAllowed(db, key) {
  if (MINISTRY_MODULES.includes(key)) return true;
  if (!isCustomMinistryKey(key)) return false;
  try {
    const { rows } = await db.query('SELECT is_system FROM app_modules WHERE key = $1 LIMIT 1', [key]);
    return rows.length > 0 && rows[0].is_system !== true;
  } catch {
    return false;
  }
}

export async function enforceMembershipWrite(q, req, { isAdmin, user, resolver }) {
  if (q.table !== 'ministry_memberships' || !WRITE_OPS.has(q.op)) return;
  const db = req.db;
  const rows = rowsOf(q);
  if (q.op !== 'delete') {
    for (const r of rows) {
      if ((q.op !== 'update' || 'ministry_key' in r) && !(await ministryKeyAllowed(db, String(r.ministry_key ?? '')))) {
        throw new ApiError(400, `'${r.ministry_key ?? ''}' nie jest służbą — przypisać można tylko do zespołów i modułów własnych`);
      }
      if ((q.op !== 'update' || 'role' in r) && r.role != null && !MEMBERSHIP_ROLES.has(String(r.role))) {
        throw new ApiError(400, "Rola w służbie: 'member' albo 'leader'");
      }
    }
  }
  if (isAdmin || !resolver) return;
  if (q.op === 'upsert') {
    throw new ApiError(403, 'Przynależność dodawaj albo zmieniaj osobno — upsert mógłby nadpisać cudzy wiersz');
  }

  // Stan przed (update/delete) i po (insert/update) zmianie.
  let before = [];
  if (q.op === 'update' || q.op === 'delete') {
    const params = [];
    ({ rows: before } = await db.query(`SELECT t.user_id, t.ministry_key, t.role FROM ministry_memberships t${whereOf(q, params)}`, params));
  }
  const after = q.op === 'insert'
    ? rows.map((r) => ({ user_id: r.user_id, ministry_key: r.ministry_key, role: r.role ?? 'member' }))
    : q.op === 'update' ? before.map((b) => ({ ...b, ...rows[0] })) : [];

  // Konta, których dotyczy zmiana: bez kont administratora i kont szerszych niż moje.
  const caller = {
    id: req.user.id, email: req.user.email, role: user?.role ?? req.user.role,
    is_active: true, is_super_admin: !!user?.is_super_admin, role_admin: false,
  };
  const ids = [...new Set([...before, ...after].map((r) => r.user_id).filter((v) => v != null).map(String))];
  if (ids.length) {
    const { rows: accounts } = await db.query(
      'SELECT id, role, is_super_admin FROM app_users WHERE id::text = ANY($1::text[])', [ids]
    );
    for (const t of accounts) {
      const denied = await accountChangeDenied(db, req.tenant.db_name, caller, t);
      if (denied) throw new ApiError(403, denied);
    }
  }

  for (const m of after) {
    const missing = membershipCapabilities(String(m.ministry_key ?? ''), m.role)
      .filter((c) => !c.startsWith(DENY_PREFIX))
      .find((c) => !resolver.can(c));
    if (missing) {
      throw new ApiError(403, `Nie możesz przypisać przynależności z uprawnieniami, których sam nie masz (${missing})`);
    }
  }
}

// Role administracyjne (app_roles.is_admin) daje i zmienia wyłącznie administrator. Osoba z samym
// manage_roles mogła ustawić is_admin=true na SWOJEJ roli i od razu stać się administratorem.
export async function enforceRoleWrite(q, req, { isAdmin }) {
  if (isAdmin || q.table !== 'app_roles' || !WRITE_OPS.has(q.op)) return;
  if (q.op !== 'delete' && rowsOf(q).some((r) => 'is_admin' in r && r.is_admin != null && r.is_admin !== false)) {
    throw new ApiError(403, 'Rolę administratora nadaje tylko administrator.');
  }
  if (q.op === 'upsert') throw new ApiError(403, 'Role dodawaj albo zmieniaj osobno — upsert mógłby nadpisać rolę administratora');
  if (q.op === 'update' || q.op === 'delete') {
    const params = [];
    const { rows } = await req.db.query(`SELECT count(*)::int AS n FROM app_roles t${whereOf(q, params)} AND COALESCE(t.is_admin, false)`, params);
    if (rows[0]?.n > 0) throw new ApiError(403, 'Rolę administratora zmienia tylko administrator.');
  }
}
