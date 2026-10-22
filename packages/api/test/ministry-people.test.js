// „Dodaj członka” w służbie z listy osób (zgłoszenie MediaTeamu, 2026-10-22):
//   • fn ministry-people — lista kont (+ Członkowie bez konta tylko z module:members), oznaczenia
//     „już w zespole” / „ma dostęp”, telefony wg redakcji kont, can_grant_access = ta sama ścieżka
//     co zapis /api/db (bramka manage_users + enforceMembershipWrite) — bez poszerzania uprawnień,
//   • przynależność do służby (ministry_memberships) → wiersz w składzie służby (lib/ministryRoster.js).
// Czysta logika zawsze; baza na PRAWDZIWYM SQL (PGlite):
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test test/ministry-people.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import {
  rosterTablesFor, accessTableFor, grantsAccess, rosterMatcher, buildPeople, filterPeople,
  prefillFromPerson, shouldGrantAccess, grantOutcome, fold,
} from '@avenit/shared/src/lib/ministryPeople.js';
import { rosterInsertRow, ensureRosterRow, tableColumns } from '../src/lib/ministryRoster.js';
import { invalidatePermissions } from '../src/dataapi/registry.js';
import { presetGrantRows } from '@avenit/shared/src/permissions/presets.js';
import dataApiRoutes from '../src/dataapi/routes.js';
import ministryPeople from '../src/fn/ministry-people.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

// ── Czysta logika ──────────────────────────────────────────────────────────
test('tabele składu: służby wbudowane, Młodzieżówka (liderzy = służba), moduły z kreatora, bez składu', () => {
  assert.deepEqual(rosterTablesFor('media'), ['media_team']);
  assert.deepEqual(rosterTablesFor('mlodziezowka'), ['mlodziezowka_leaders', 'mlodziezowka_members']);
  assert.deepEqual(rosterTablesFor('faceci'), ['custom_faceci_members']);
  assert.deepEqual(rosterTablesFor('homegroups'), []);
  assert.deepEqual(rosterTablesFor('teaching'), []);
  assert.deepEqual(rosterTablesFor('x; drop'), []);
  assert.equal(accessTableFor('kids'), 'kids_teachers');
  assert.equal(grantsAccess('mlodziezowka', 'mlodziezowka_leaders'), true);
  assert.equal(grantsAccess('mlodziezowka', 'mlodziezowka_members'), false, 'uczestnicy nie dostają modułu');
});

test('kto już jest w zespole: konto, e-mail, ręczny wiersz bez e-maila po imieniu', () => {
  const inTeam = rosterMatcher([
    { user_id: 'u1', email: null, full_name: 'X' },
    { user_id: null, email: 'Ola@X.pl', full_name: 'Ola' },
    { user_id: null, email: '', full_name: 'Łukasz  Nowak' },
    { user_id: null, email: 'inny@x.pl', full_name: 'Piotr' },
  ]);
  assert.equal(inTeam({ user_id: 'u1', name: 'Ktoś' }), true);
  assert.equal(inTeam({ user_id: 'u9', email: 'ola@x.pl', name: 'O' }), true);
  assert.equal(inTeam({ user_id: 'u8', email: 'lukasz@x.pl', name: 'lukasz nowak' }), true, 'ręczny wiersz bez e-maila');
  assert.equal(inTeam({ user_id: 'u7', email: 'piotr2@x.pl', name: 'Piotr' }), false, 'imiennik z innym e-mailem — nie');
  assert.equal(fold('Łódź   Żółć'), 'lodz zolc');
});

test('lista osób: konta + Członkowie bez konta, telefon wg uprawnień, własny telefon zawsze', () => {
  const accounts = [
    { id: 'u1', full_name: 'Anna', email: 'anna@x.pl', phone: '+48 1', member_id: 10 },
    { id: 'u2', full_name: '', name: '', email: 'jan@x.pl', phone: '+48 2' },
    { id: 'me', full_name: 'Ja', email: 'ja@x.pl', phone: '+48 3' },
  ];
  const members = [
    { id: 10, first_name: 'Anna', last_name: 'K', email: 'anna@x.pl', phone: '+48 1' }, // konto (member_id)
    { id: 11, first_name: 'Jan', last_name: 'X', email: 'JAN@x.pl', phone: '+48 2' }, // konto (e-mail)
    { id: 12, first_name: 'Ewa', last_name: 'Bez', email: null, phone: '+48 9' },
  ];
  const people = buildPeople({ accounts, members, rosterRows: [{ email: 'anna@x.pl' }], accessUserIds: new Set(['u1']), accountPhones: false, memberPhones: true, meId: 'me' });
  assert.deepEqual(people.map((p) => p.key), ['u:u1', 'm:12', 'u:me', 'u:u2']);
  const by = Object.fromEntries(people.map((p) => [p.key, p]));
  assert.equal(by['u:u2'].name, 'jan', 'nazwa z e-maila');
  assert.equal(by['u:u1'].phone, null, 'telefon konta ukryty');
  assert.equal(by['u:me'].phone, '+48 3', 'własny telefon');
  assert.equal(by['m:12'].phone, '+48 9', 'kartoteka z module:members');
  assert.deepEqual([by['u:u1'].in_team, by['u:u1'].has_access], [true, true]);
  const filtered = filterPeople(people, 'an');
  assert.equal(filtered.at(-1).key, 'u:u1', '„już w zespole” na końcu');
  assert.deepEqual(filterPeople(people, 'ewa bez').map((p) => p.key), ['m:12']);
  assert.equal(filterPeople(people, '', { limit: 2 }).length, 2);
});

test('wypełnienie formularza i decyzja o dostępie', () => {
  const p = { name: 'Anna', email: 'anna@x.pl', phone: null, user_id: 'u1', has_access: false };
  assert.deepEqual(prefillFromPerson(p, { full_name: 'x', phone: '+48 old', role: 'Kamera' }),
    { full_name: 'Anna', email: 'anna@x.pl', phone: '', user_id: 'u1', role: 'Kamera' });
  assert.equal(shouldGrantAccess(p, { ministryKey: 'media', table: 'media_team' }), true);
  assert.equal(shouldGrantAccess({ ...p, has_access: true }, { ministryKey: 'media', table: 'media_team' }), false);
  assert.equal(shouldGrantAccess({ ...p, user_id: null }, { ministryKey: 'media', table: 'media_team' }), false);
  assert.equal(shouldGrantAccess(p, { ministryKey: 'mlodziezowka', table: 'mlodziezowka_members' }), false);
  assert.equal(grantOutcome(null), 'granted');
  assert.equal(grantOutcome({ code: '23505', message: 'duplicate key' }), 'already');
  assert.equal(grantOutcome({ status: 403, message: 'Brak uprawnienia action:settings:manage_users' }), 'denied');
});

test('wiersz składu: wymagane kolumny, domyślna rola, autor; nieznana wymagana kolumna → pomiń', () => {
  const cols = (spec) => new Map(Object.entries(spec).map(([k, v]) => [k, { nullable: v !== 'req', hasDefault: v === 'def', type: 'text' }]));
  const account = { id: 'u1', full_name: 'Anna', email: 'anna@x.pl' };
  assert.deepEqual(rosterInsertRow(cols({ id: 'def', full_name: 'req', email: 1, user_id: 1, role: 1, is_active: 'def' }), 'kids_teachers', { account }),
    { full_name: 'Anna', email: 'anna@x.pl', user_id: 'u1', is_active: true, role: 'Nauczyciel' });
  assert.equal(rosterInsertRow(cols({ id: 'def', full_name: 'req', created_by: 'req' }), 'mlodziezowka_leaders', { account, actorEmail: 'kto@x.pl' }).created_by, 'kto@x.pl');
  assert.equal(rosterInsertRow(cols({ id: 'def', full_name: 'req', group_code: 'req' }), 'x', { account }), null);
});

// ── Baza (PGlite) ──────────────────────────────────────────────────────────
function poolOf(pg) {
  return {
    async query(sql, params) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = { adm: uid(1), mateusz: uid(2), lider: uid(3), jan: uid(4), anna: uid(5), ola: uid(6), blok: uid(7) };
const ROLE = { adm: 'superadmin', mateusz: 'lider', lider: 'lider', jan: 'czlonek', anna: 'czlonek', ola: 'czlonek', blok: 'czlonek' };
const TENANT = { id: 't', slug: 'ministry-people', db_name: `ministry_people_${process.pid}_${Date.now()}` };

let db;
let app;
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
async function call(who, body) {
  const res = await app.inject({ method: 'POST', url: '/api/db', payload: body, headers: { 'x-test-user': who } });
  return { status: res.statusCode, body: res.json() };
}
const ins = (who, values) => call(who, { table: 'ministry_memberships', op: 'insert', values, returning: '*' });
function fakeReply() {
  return { statusCode: 200, body: undefined, code(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; } };
}
async function people(who, body) {
  const reply = fakeReply();
  await ministryPeople({ db, tenant: TENANT, user: { id: U[who], email: `${who}@x.pl`, role: ROLE[who] }, body, log: { error() {}, warn() {} } }, reply);
  return reply;
}

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id uuid PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, status text DEFAULT 'active', campus_id int, member_id int, phone text, avatar_url text, last_login_at timestamptz);
    CREATE TABLE app_roles (key text PRIMARY KEY, label text, is_admin boolean DEFAULT false);
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE app_modules (key text PRIMARY KEY, label text, is_system boolean, is_enabled boolean DEFAULT true);
    CREATE TABLE ministry_memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
      ministry_key text NOT NULL, campus_id int, role text NOT NULL DEFAULT 'member', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE members (id serial PRIMARY KEY, first_name text, last_name text, email text, phone text);
    CREATE TABLE media_team (id serial PRIMARY KEY, full_name text NOT NULL, role text, status text, phone text, email text,
      user_id uuid REFERENCES app_users(id) ON DELETE SET NULL);
    CREATE TABLE worship_team (id serial PRIMARY KEY, full_name text NOT NULL, role text, status text, phone text, email text,
      user_id uuid REFERENCES app_users(id) ON DELETE SET NULL);
    CREATE TABLE mlodziezowka_leaders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, email text, phone text,
      role text DEFAULT 'lider', is_active boolean DEFAULT true, created_by text NOT NULL, user_id uuid);
    CREATE TABLE mlodziezowka_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, email text, phone text, user_id uuid);
    CREATE TABLE custom_faceci_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, email text, phone text, is_active boolean DEFAULT true);
  `);
  for (const g of presetGrantRows().filter((x) => ['lider', 'czlonek'].includes(x.role))) {
    await db.query('INSERT INTO permission_grants (role, capability, allowed) VALUES ($1, $2, $3)', [g.role, g.capability, g.allowed]);
  }
  await pg.exec(`
    INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('lider', false), ('czlonek', false);
    INSERT INTO app_modules (key, label, is_system) VALUES ('media', 'Media', true), ('worship', 'Uwielbienie', true),
      ('mlodziezowka', 'Młodzieżówka', true), ('faceci', 'Faceci', false), ('members', 'Członkowie', true);
    INSERT INTO app_users (id, email, full_name, role, is_super_admin, phone, member_id, is_active, status) VALUES
      ('${U.adm}', 'adm@x.pl', 'Admin', 'superadmin', true, '+48 500', NULL, true, 'active'),
      ('${U.mateusz}', 'mateusz@x.pl', 'Mateusz Waciński', 'lider', false, '+48 501', NULL, true, 'active'),
      ('${U.lider}', 'lider@x.pl', 'Lider Bez Kadr', 'lider', false, '+48 502', NULL, true, 'active'),
      ('${U.jan}', 'jan@x.pl', 'Jan Kowalski', 'czlonek', false, '+48 503', 3, true, 'active'),
      ('${U.anna}', 'anna@x.pl', 'Anna Nowak', 'czlonek', false, '+48 504', NULL, true, 'active'),
      ('${U.ola}', 'ola@x.pl', 'Ola Wiśniewska', 'czlonek', false, '+48 505', NULL, true, 'active'),
      ('${U.blok}', 'blok@x.pl', 'Zablokowany', 'czlonek', false, NULL, NULL, false, 'blocked');
    -- Mateusz: lider MediaTeamu z action:settings:manage_users (jak na żywym tenancie).
    INSERT INTO permission_grants (user_id, capability, allowed) VALUES ('${U.mateusz}', 'action:settings:manage_users', true);
    INSERT INTO ministry_memberships (user_id, ministry_key, role) VALUES
      ('${U.mateusz}', 'media', 'leader'), ('${U.lider}', 'media', 'leader'), ('${U.ola}', 'media', 'member');
    INSERT INTO members (id, first_name, last_name, email, phone) VALUES
      (3, 'Jan', 'Kowalski', 'jan@x.pl', '+48 503'), (8, 'Ewa', 'Bezkonta', 'ewa@x.pl', '+48 600'), (9, 'Anna', 'Nowak', 'ANNA@x.pl', '+48 504');
    -- Skład Mediów: Mateusz (konto), Ola dopisana ręcznie po e-mailu, „Anna Nowak” ręcznie bez e-maila.
    INSERT INTO media_team (full_name, email, status, user_id) VALUES ('Mateusz Waciński', 'mateusz@x.pl', 'Aktywny', '${U.mateusz}'),
      ('Ola W.', 'ola@x.pl', 'Aktywny', NULL), ('Anna Nowak', NULL, 'Aktywny', NULL);
  `);

  app = Fastify();
  app.decorateRequest('user', null);
  app.decorateRequest('db', null);
  app.decorateRequest('tenant', null);
  app.decorate('requireUser', async (req) => {
    const who = String(req.headers['x-test-user'] || 'jan');
    req.user = { id: U[who], email: `${who}@x.pl`, role: ROLE[who] };
    req.db = db;
    req.tenant = TENANT;
  });
  app.decorate('block2FAPending', async () => {});
  await app.register(dataApiRoutes);
});

test('db: kolumny tabel składu z information_schema', { skip: skipDb }, async () => {
  const cols = await tableColumns(db, 'mlodziezowka_leaders');
  assert.equal(cols.get('created_by').nullable, false);
  assert.equal(cols.has('user_id'), true);
  assert.equal(await tableColumns(db, 'nie_ma_takiej'), null);
  assert.equal(await tableColumns(db, 'x"; drop'), null);
});

test('db: lista osób dla lidera Mediów z manage_users (Mateusz) — konta, bez kartoteki i cudzych telefonów', { skip: skipDb }, async () => {
  const r = await people('mateusz', { ministry_key: 'media' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const { people: list } = r.body;
  assert.deepEqual([r.body.link_user, r.body.grants_access, r.body.can_grant_access, r.body.members_included, r.body.phones_visible], [true, true, true, false, false]);
  assert.ok(!list.some((p) => p.source === 'member'), 'bez module:members — bez kartoteki');
  assert.ok(!list.some((p) => p.user_id === U.blok), 'konta zablokowane pominięte');
  const by = Object.fromEntries(list.map((p) => [p.user_id, p]));
  assert.equal(by[U.jan].phone, null, 'telefon konta ukryty (redakcja r4/r6)');
  assert.equal(by[U.mateusz].phone, '+48 501', 'własny telefon');
  assert.equal(by[U.jan].in_team, false);
  assert.equal(by[U.ola].in_team, true, 'po e-mailu');
  assert.equal(by[U.anna].in_team, true, 'ręczny wiersz bez e-maila — po imieniu');
  assert.equal(by[U.mateusz].in_team, true, 'po koncie');
  assert.equal(by[U.ola].has_access, true);
  assert.equal(by[U.jan].has_access, false);
});

test('db: lista osób — administrator widzi kartotekę (bez kont) i telefony; lider bez manage_users nie nada dostępu', { skip: skipDb }, async () => {
  const adm = await people('adm', { ministry_key: 'media' });
  assert.equal(adm.statusCode, 200);
  assert.deepEqual([adm.body.members_included, adm.body.phones_visible, adm.body.can_grant_access], [true, true, true]);
  const members = adm.body.people.filter((p) => p.source === 'member');
  assert.deepEqual(members.map((p) => [p.name, p.phone]), [['Ewa Bezkonta', '+48 600']], 'Jan (member_id) i Anna (e-mail) mają konta');
  assert.equal(adm.body.people.find((p) => p.user_id === U.jan).phone, '+48 503');

  const lider = await people('lider', { ministry_key: 'media' });
  assert.equal(lider.statusCode, 200, 'lider dodaje do składu swojej służby');
  assert.equal(lider.body.can_grant_access, false, 'bez manage_users — nie zapisze przynależności');

  assert.equal((await people('jan', { ministry_key: 'media' })).statusCode, 403, 'bez prawa dodawania do składu');
  assert.equal((await people('mateusz', { ministry_key: 'worship' })).statusCode, 403, 'cudza służba');
  assert.equal((await people('mateusz', { ministry_key: 'media', table: 'worship_team' })).statusCode, 400, 'tabela spoza służby');
  assert.equal((await people('adm', { ministry_key: 'homegroups' })).statusCode, 400, 'bez listy składu');
  const youth = await people('adm', { ministry_key: 'mlodziezowka', table: 'mlodziezowka_members' });
  assert.deepEqual([youth.statusCode, youth.body.grants_access], [200, false]);
  const faceci = await people('adm', { ministry_key: 'faceci' });
  assert.deepEqual([faceci.statusCode, faceci.body.link_user, faceci.body.grants_access], [200, false, true]);
});

test('db: dodanie z listy — wiersz z user_id, potem przynależność; strażnik bez zmian (bez poszerzania)', { skip: skipDb }, async () => {
  // Mateusz dodaje Jana do Mediów: wiersz składu (z kontem) + przynależność 'member'.
  const row = await call('mateusz', { table: 'media_team', op: 'insert', values: { full_name: 'Jan Kowalski', email: 'jan@x.pl', status: 'Aktywny', user_id: U.jan }, returning: '*' });
  assert.equal(row.status, 200, JSON.stringify(row.body));
  const mm = await ins('mateusz', { user_id: U.jan, ministry_key: 'media', role: 'member' });
  assert.equal(mm.status, 200, JSON.stringify(mm.body));
  const rows = await q1(`SELECT full_name, user_id::text AS user_id FROM media_team WHERE lower(email) = 'jan@x.pl'`);
  assert.deepEqual(rows, [{ full_name: 'Jan Kowalski', user_id: U.jan }], 'bez dubla — synchronizacja znalazła wiersz po koncie');

  // Lider bez manage_users: skład tak, przynależność — 403 (decyzja o poszerzeniu osobno).
  assert.equal((await call('lider', { table: 'media_team', op: 'insert', values: { full_name: 'Anna Nowak 2', email: 'anna2@x.pl' } })).status, 200);
  assert.equal((await ins('lider', { user_id: U.anna, ministry_key: 'media', role: 'member' })).status, 403);
  // Mateusz: do cudzej służby — 403 i żadnego wiersza składu.
  assert.equal((await ins('mateusz', { user_id: U.anna, ministry_key: 'worship', role: 'member' })).status, 403);
  assert.deepEqual(await q1('SELECT * FROM worship_team'), []);
});

test('db: przynależność z Ustawień → osoba na liście składu (nowy wiersz, łączenie, idempotencja)', { skip: skipDb }, async () => {
  invalidatePermissions(TENANT.db_name);
  // Nowy wiersz w Uwielbieniu — bez telefonu konta (prywatny), status aktywny, powiązany z kontem.
  const r1 = await ins('adm', { user_id: U.anna, ministry_key: 'worship', role: 'member' });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.deepEqual(await q1('SELECT full_name, email, phone, status, user_id::text AS user_id FROM worship_team'),
    [{ full_name: 'Anna Nowak', email: 'anna@x.pl', phone: null, status: 'Aktywny', user_id: U.anna }]);
  // Ola była w Mediach dopisana ręcznie po e-mailu — przynależność (Media) łączy wiersz z kontem.
  await q1(`DELETE FROM ministry_memberships WHERE user_id = $1 AND ministry_key = 'media'`, [U.ola]);
  assert.equal((await ins('adm', { user_id: U.ola, ministry_key: 'media', role: 'member' })).status, 200);
  assert.deepEqual(await q1(`SELECT full_name, user_id::text AS user_id FROM media_team WHERE email = 'ola@x.pl'`), [{ full_name: 'Ola W.', user_id: U.ola }]);
  // Ręczny wiersz bez e-maila („Anna Nowak” w Mediach) — łączony po imieniu, e-mail uzupełniony.
  assert.equal(await ensureRosterRow(db, { userId: U.anna, ministryKey: 'media' }), 'linked');
  assert.deepEqual(await q1(`SELECT email, user_id::text AS user_id FROM media_team WHERE full_name = 'Anna Nowak'`), [{ email: 'anna@x.pl', user_id: U.anna }]);
  assert.equal(await ensureRosterRow(db, { userId: U.anna, ministryKey: 'media' }), 'exists', 'idempotentnie');
  assert.equal(await ensureRosterRow(db, { userId: U.anna, ministryKey: 'homegroups' }), 'skipped');
  // Młodzieżówka: wymagane created_by = autor zapisu; lider → is_leader nie istnieje, rola domyślna kolumny.
  assert.equal((await ins('adm', { user_id: U.jan, ministry_key: 'mlodziezowka', role: 'leader' })).status, 200);
  assert.deepEqual(await q1('SELECT full_name, created_by, role, user_id::text AS user_id FROM mlodziezowka_leaders'),
    [{ full_name: 'Jan Kowalski', created_by: 'adm@x.pl', role: 'lider', user_id: U.jan }]);
  // Moduł z kreatora bez kolumny user_id: wiersz po e-mailu.
  assert.equal((await ins('adm', { user_id: U.ola, ministry_key: 'faceci', role: 'member' })).status, 200);
  assert.deepEqual(await q1('SELECT full_name, email FROM custom_faceci_members'), [{ full_name: 'Ola Wiśniewska', email: 'ola@x.pl' }]);
  assert.equal(await ensureRosterRow(db, { userId: U.ola, ministryKey: 'faceci' }), 'exists');
});
