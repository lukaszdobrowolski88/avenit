// POST /api/fn/ministry-people { ministry_key, table? } → lista osób do „Dodaj członka” w służbie.
//
// Zgłoszenie MediaTeamu (2026-10-22): dodając do zespołu kogoś, kto już ma konto, lider musiał
// przepisywać imię, e-mail i telefon. Teraz wybiera z listy:
//   • konta w aplikacji (aktywne app_users: imię, e-mail, awatar; telefon tylko dla obsługi —
//     ta sama reguła co redakcja app_users, accountFields.js),
//   • osoby z kartoteki Członków BEZ konta — tylko gdy pytający ma module:members (wtedy też telefon).
// Każda osoba z oznaczeniem in_team (już na liście tej służby) i has_access (ma przynależność).
//
// Dostęp: kto może DODAWAĆ do tabeli składu (canAccess insert) — ten sam krąg, który widzi
// „Dodaj członka”. Flagi dla formularza:
//   link_user        — tabela składu ma kolumnę user_id (wiersz łączymy z kontem),
//   grants_access    — dodanie do tej tabeli daje dostęp do modułu (przynależność 'member'),
//   can_grant_access — pytający może zapisać taką przynależność: dokładnie ta sama ścieżka co
//                      /api/db (bramka tabeli + enforceMembershipWrite, runda 5) — nic nie poszerzamy.
// Brak wpisu w FN_CAPABILITY => requireUser.
import { canAccess, loadGrants } from '../dataapi/registry.js';
import { enforceMembershipWrite } from '../dataapi/sharedWrites.js';
import { seesAccountDetails } from '../dataapi/accountFields.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { buildPeople, grantsAccess, rosterTablesFor } from '@avenit/shared/src/lib/ministryPeople.js';
import { tableColumns } from '../lib/ministryRoster.js';

export const name = 'ministry-people';
export const method = 'POST';

// Czy pytający może nadać przynależność 'member' do tej służby (bez konkretnej osoby — konto
// docelowe sprawdza i tak zapis /api/db).
export async function canGrantMembership(req, user, ministryKey) {
  const mm = await canAccess({ pool: req.db, dbName: req.tenant.db_name, table: 'ministry_memberships', op: 'insert', user });
  if (!mm.ok) return false;
  const { grants, adminRoles } = await loadGrants(req.db, req.tenant.db_name);
  const isAdmin = !!user.is_super_admin || adminRoles.has(user.role);
  const resolver = !isAdmin && grants !== null ? makeResolver(grants, { role: user.role, userId: user.id, isAdmin: false }) : null;
  try {
    await enforceMembershipWrite(
      { table: 'ministry_memberships', op: 'insert', values: { ministry_key: ministryKey, role: 'member' } },
      req, { isAdmin, user, resolver }
    );
    return true;
  } catch {
    return false;
  }
}

async function activeAccounts(db) {
  const base = 'SELECT id, email, full_name, name, phone, avatar_url, member_id FROM app_users';
  try {
    const { rows } = await db.query(`${base} WHERE is_active IS NOT FALSE AND (status IS NULL OR status = 'active')`);
    return rows;
  } catch {
    const { rows } = await db.query(`${base} WHERE is_active IS NOT FALSE`);
    return rows;
  }
}

async function churchMembers(db) {
  try {
    const { rows } = await db.query('SELECT id, first_name, last_name, email, phone FROM members');
    return rows;
  } catch {
    return [];
  }
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });
  const ministryKey = String(req.body?.ministry_key || '').trim();
  const tables = rosterTablesFor(ministryKey);
  const table = req.body?.table ? String(req.body.table) : tables[0];
  if (!tables.length || !tables.includes(table)) {
    return reply.code(400).send({ error: 'Ta służba nie ma listy składu' });
  }

  const { rows: me } = await req.db.query('SELECT id, email, role, is_super_admin FROM app_users WHERE id = $1', [req.user.id]);
  if (!me[0]) return reply.code(403).send({ error: 'Brak konta' });
  const user = { ...req.user, ...me[0], id: req.user.id };
  const access = await canAccess({ pool: req.db, dbName: req.tenant.db_name, table, op: 'insert', user });
  if (!access.ok) return reply.code(403).send({ error: 'Brak uprawnień do dodawania osób w tej służbie' });

  const resolver = access.resolver; // admin: resolver z isAdmin (can → true); tryb legacy: null
  // Telefon konta: obsługa (admin / Członkowie / kampanie). Kartoteka Członków: tylko z module:members.
  const accountPhones = seesAccountDetails(resolver);
  const seesMembers = !resolver || resolver.can('module:members');

  try {
    const cols = await tableColumns(req.db, table);
    if (!cols) return reply.send({ people: [], link_user: false, grants_access: false, can_grant_access: false, phones_visible: accountPhones, members_included: false });
    const linkUser = cols.has('user_id');
    const rosterSel = ['full_name', cols.has('email') ? 'email' : 'NULL::text AS email', linkUser ? 'user_id::text AS user_id' : 'NULL::text AS user_id'];
    const [{ rows: rosterRows }, accounts, members, { rows: mm }] = await Promise.all([
      req.db.query(`SELECT ${rosterSel.join(', ')} FROM "${table}"`),
      activeAccounts(req.db),
      seesMembers ? churchMembers(req.db) : Promise.resolve([]),
      req.db.query('SELECT user_id::text AS user_id FROM ministry_memberships WHERE ministry_key = $1', [ministryKey])
        .catch(() => ({ rows: [] })),
    ]);
    const withAccess = grantsAccess(ministryKey, table);
    const people = buildPeople({
      accounts, members, rosterRows,
      accessUserIds: new Set(mm.map((r) => String(r.user_id))),
      accountPhones, memberPhones: seesMembers, meId: req.user.id,
    });
    return reply.send({
      people,
      link_user: linkUser,
      grants_access: withAccess,
      can_grant_access: withAccess ? await canGrantMembership(req, user, ministryKey) : false,
      phones_visible: accountPhones,
      members_included: seesMembers,
    });
  } catch (err) {
    req.log?.error?.({ err }, 'ministry-people failed');
    return reply.code(500).send({ error: 'Nie udało się wczytać listy osób' });
  }
}
