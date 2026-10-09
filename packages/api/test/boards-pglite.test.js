// Zadania na Tablicach na PRAWDZIWYM SQL (PGlite — Postgres w procesie): migracja 094/095, fn
// board-item-patch / board-items-reorder / board-comment, my-board-items, import starych zadań (HTTP
// i worker), automatyzacje, poranny skrót, iCal, przypisanie zadania osobistego.
//
// PGlite nie jest zależnością API — test sam się pomija, gdy go brak. Uruchomienie:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js npm test
// (albo z zainstalowanym @electric-sql/pglite).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const MIG = new URL('../db/tenant-migrations/', import.meta.url);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const B_PROJ = id(1), B_MEDIA = id(2), B_PRIV = id(3), B_OTHER = id(4);
const G1 = id(11), G2 = id(12), G_MEDIA = id(13), G_PRIV = id(14), G_OTHER = id(15);
const C_STATUS = id(21), C_PEOPLE = id(22), C_DUE = id(23), C_M_PEOPLE = id(24), C_M_DUE = id(25), C_O_PEOPLE = id(26), C_TEXT = id(27);
const I_A = id(31), I_B = id(32), I_C = id(33), I_M = id(34), I_P = id(35), I_O = id(36);
const U = { szef: id(41), ola: id(42), media: id(43), gosc: id(44), off: id(45) };
const TENANT = { db_name: `pglite-${process.pid}-${Date.now()}`, slug: 't' };
const settle = () => new Promise((r) => setTimeout(r, 60));
const log = { error() {}, warn() {}, info() {} };

// Pula w stylu pg nad jednym połączeniem PGlite: transakcja (connect) blokuje pozostałe zapytania.
function poolOf(pg) {
  let lock = Promise.resolve();
  const run = async (sql, params) => {
    const r = await pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    pg,
    async query(sql, params) { await lock; return run(sql, params); },
    async connect() {
      let release;
      const prev = lock;
      lock = new Promise((res) => { release = res; });
      await prev;
      return { query: run, release: () => release() };
    },
  };
}

function reply() {
  return { statusCode: 200, body: undefined, code(n) { this.statusCode = n; return this; }, send(b) { this.body = b; return this; } };
}
async function call(handler, user, body) {
  const r = reply();
  const out = await handler({ db, tenant: TENANT, user: { id: U[user], email: `${user}@x.pl` }, body, log }, r);
  return out === r ? { status: r.statusCode, body: r.body } : { status: 200, body: out };
}
const q1 = async (sql, params) => (await db.query(sql, params)).rows;

let db;
let fns;

before(async () => {
  if (skip) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id uuid PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, campus_id int, member_id int, avatar_url text, auth_user_id uuid);
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE app_modules (key text PRIMARY KEY, label text, icon text, path text, resource_key text, display_order int, is_system boolean, component_name text);
    CREATE TABLE app_permissions (role text, resource text, can_read boolean, can_write boolean, PRIMARY KEY (role, resource));
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_email text, type text, title text, body text, link text,
      data jsonb, is_read boolean DEFAULT false, created_at timestamptz DEFAULT now());
    CREATE TABLE events (id serial PRIMARY KEY, title text, date date);
    CREATE TABLE user_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_email text NOT NULL, title text, description text,
      status text DEFAULT 'todo', due_date date, assigned_to_email text, is_private boolean DEFAULT false, created_at timestamptz DEFAULT now());
    CREATE TABLE ical_subscriptions (id serial PRIMARY KEY, token text, user_email text, user_id uuid, is_active boolean DEFAULT true,
      export_preferences jsonb, last_accessed_at timestamptz, access_count int);
    CREATE TABLE push_user_preferences (user_email text PRIMARY KEY, enabled boolean DEFAULT true, category_opt_outs text[] DEFAULT '{}');
    CREATE TABLE media_team (id uuid PRIMARY KEY, email text, full_name text);
    CREATE TABLE media_tasks (id serial PRIMARY KEY, title text, status text, assigned_to text, due_date date, created_by text, created_at timestamptz DEFAULT now());
    CREATE TABLE media_task_comments (id serial PRIMARY KEY, task_id int, content text, author_email text, created_at timestamptz DEFAULT now());
  `);
  for (const f of ['002_boards.sql', '005_boards_permissions.sql', '023_board_items_description.sql', '092_board_legacy_source.sql']) {
    await pg.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));
  }
  // Element bez grupy przed migracją 094 — ma trafić do pierwszej grupy.
  await pg.exec(`
    INSERT INTO boards (id, name) VALUES ('${B_OTHER}', 'Inna');
    INSERT INTO board_groups (id, board_id, name, display_order) VALUES ('${G_OTHER}', '${B_OTHER}', 'G', 0);
    INSERT INTO board_items (id, board_id, group_id, name) VALUES ('${I_O}', '${B_OTHER}', NULL, 'duch');
  `);
  const m094 = fs.readFileSync(new URL('094_board_items_assignees_events.sql', MIG), 'utf8');
  const m095 = fs.readFileSync(new URL('095_task_digest.sql', MIG), 'utf8');
  await pg.exec(m094); await pg.exec(m094); await pg.exec(m095); await pg.exec(m095); // idempotencja

  const P = (e, n) => JSON.stringify([{ email: e, name: n || e }]);
  await pg.exec(`
    INSERT INTO app_roles VALUES ('superadmin', true), ('lider', false), ('czlonek', false), ('gosc', false);
    INSERT INTO permission_grants (role, capability, allowed) VALUES
      ('lider', 'module:*', true), ('lider', 'res:*:*', true),
      ('czlonek', 'module:media', true), ('czlonek', 'res:media_tasks:read', true), ('czlonek', 'res:media_tasks:update', true),
      ('czlonek', 'res:media_task_comments:read', true), ('czlonek', 'res:media_task_comments:create', true);
    INSERT INTO app_modules (key, label, path, resource_key) VALUES ('media', 'Media Team', '/media', 'module:media'),
      ('calendar', 'Kalendarz', '/wydarzenia', 'module:calendar') ON CONFLICT (key) DO NOTHING;
    INSERT INTO app_users (id, email, full_name, role, is_active) VALUES
      ('${U.szef}', 'szef@x.pl', 'Szef Zespołu', 'lider', true), ('${U.ola}', 'Ola@X.pl', 'Ola Nowak', 'lider', true),
      ('${U.media}', 'media@x.pl', 'Marek Media', 'czlonek', true), ('${U.gosc}', 'gosc@x.pl', 'Gość', 'gosc', true),
      ('${U.off}', 'off@x.pl', 'Zablokowany', 'lider', false);
    INSERT INTO events (title, date) VALUES ('Koncert', CURRENT_DATE);

    INSERT INTO boards (id, name, visibility, owner_email, created_by) VALUES ('${B_PROJ}', 'Remont', 'workspace', 'szef@x.pl', 'szef@x.pl');
    INSERT INTO boards (id, name, module_key, visibility) VALUES ('${B_MEDIA}', 'Tablica Media', 'media', 'workspace');
    INSERT INTO boards (id, name, visibility, owner_email) VALUES ('${B_PRIV}', 'Prywatna', 'private', 'szef@x.pl');
    INSERT INTO board_groups (id, board_id, name, display_order) VALUES ('${G1}', '${B_PROJ}', 'Do zrobienia', 0), ('${G2}', '${B_PROJ}', 'Później', 1),
      ('${G_MEDIA}', '${B_MEDIA}', 'Zadania', 0), ('${G_PRIV}', '${B_PRIV}', 'P', 0);
    INSERT INTO board_columns (id, board_id, name, type, settings, display_order) VALUES
      ('${C_STATUS}', '${B_PROJ}', 'Status', 'status', '{"labels":[{"id":"todo","title":"Do zrobienia"},{"id":"done","title":"Zamknięte","done":true}]}', 0),
      ('${C_PEOPLE}', '${B_PROJ}', 'Osoby', 'people', '{}', 1),
      ('${C_DUE}', '${B_PROJ}', 'Termin', 'date', '{"role":"due"}', 2),
      ('${C_TEXT}', '${B_PROJ}', 'Notatka', 'text', '{}', 3),
      ('${C_M_PEOPLE}', '${B_MEDIA}', 'Osoby', 'people', '{}', 0),
      ('${C_M_DUE}', '${B_MEDIA}', 'Termin', 'date', '{}', 1),
      ('${C_O_PEOPLE}', '${B_OTHER}', 'Osoby', 'people', '{}', 0);
    INSERT INTO board_items (id, board_id, group_id, name, cells, display_order) VALUES
      ('${I_A}', '${B_PROJ}', '${G1}', 'Farba', '{"${C_STATUS}":"todo"}', 0),
      ('${I_B}', '${B_PROJ}', '${G1}', 'Pędzle', '{}', 1),
      ('${I_C}', '${B_PROJ}', '${G1}', 'Taśma', '{}', 2),
      ('${I_M}', '${B_MEDIA}', '${G_MEDIA}', 'Plakat', '{"${C_M_PEOPLE}":${P('media@x.pl')}}', 0),
      ('${I_P}', '${B_PRIV}', '${G_PRIV}', 'Sekret', '{}', 0);
  `);
  fns = {
    patch: (await import('../src/fn/board-item-patch.js')).default,
    reorder: (await import('../src/fn/board-items-reorder.js')).default,
    comment: (await import('../src/fn/board-comment.js')).default,
    myItems: await import('../src/fn/my-board-items.js'),
    imp: await import('../src/fn/board-import-legacy.js'),
    auto: await import('../src/fn/board-automations-run.js'),
    digest: await import('../src/fn/task-digest.js'),
    ical: (await import('../src/fn/ical.js')).default,
    hooks: await import('../src/realtime/push-hooks.js'),
    qb: await import('../src/dataapi/querybuilder.js'),
    own: await import('../src/dataapi/ownership.js'),
  };
});

test('migracja 094: duch w pierwszej grupie, kaskada grup, event_id = typ events.id, boards.settings', { skip }, async () => {
  assert.equal((await q1(`SELECT group_id FROM board_items WHERE id = $1`, [I_O]))[0].group_id, G_OTHER);
  const cols = await q1(`SELECT table_name, column_name, data_type FROM information_schema.columns
                          WHERE (table_name = 'board_items' AND column_name IN ('event_id','assignee_emails')) OR (table_name = 'boards' AND column_name = 'settings') ORDER BY 1, 2`);
  assert.deepEqual(cols.map((c) => `${c.table_name}.${c.column_name}:${c.data_type}`),
    ['board_items.assignee_emails:ARRAY', 'board_items.event_id:integer', 'boards.settings:jsonb']);
  const fk = await q1(`SELECT confdeltype FROM pg_constraint WHERE conname = 'board_items_group_id_fkey'`);
  assert.equal(fk[0].confdeltype, 'c');
  assert.deepEqual((await q1(`SELECT assignee_emails FROM board_items WHERE id = $1`, [I_M]))[0].assignee_emails, ['media@x.pl']);
});

test('board-item-patch: scalanie pod blokadą, walidacja, assignee_emails, powiadomienie o przypisaniu', { skip }, async () => {
  // Dwie zmiany różnych kolumn naraz — obie zostają.
  const [r1, r2] = await Promise.all([
    call(fns.patch, 'szef', { item_id: I_A, cells: { [C_TEXT]: 'kupić 2 litry' } }),
    call(fns.patch, 'szef', { item_id: I_A, cells: { [C_DUE]: '2026-10-20' } }),
  ]);
  assert.equal(r1.status, 200); assert.equal(r2.status, 200);
  const row = (await q1(`SELECT cells FROM board_items WHERE id = $1`, [I_A]))[0];
  assert.deepEqual(row.cells, { [C_STATUS]: 'todo', [C_TEXT]: 'kupić 2 litry', [C_DUE]: '2026-10-20' });

  // null usuwa klucz; odpowiedź = pełny wiersz
  const r3 = await call(fns.patch, 'szef', { item_id: I_A, cells: { [C_TEXT]: null }, name: 'Farba biała' });
  assert.equal(r3.body.item.name, 'Farba biała');
  assert.ok(!(C_TEXT in r3.body.item.cells));

  // przypisanie Oli (konto „Ola@X.pl”) i siebie — powiadomienie tylko dla Oli, link do Projektów
  const r4 = await call(fns.patch, 'szef', { item_id: I_A, cells: { [C_PEOPLE]: [{ email: 'ola@x.pl', name: 'Ola' }, { email: 'SZEF@x.pl', name: 'Ja' }] } });
  assert.equal(r4.status, 200);
  assert.deepEqual(r4.body.item.assignee_emails, ['ola@x.pl', 'szef@x.pl']);
  await settle();
  let notes = await q1(`SELECT user_email, type, title, link FROM notifications ORDER BY created_at`);
  assert.deepEqual(notes.map((n) => [n.user_email, n.type, n.link]), [['Ola@X.pl', 'task', `/projekty?board=${B_PROJ}&item=${I_A}`]]);
  assert.equal(notes[0].title, 'Szef Zespołu przypisał(a) Cię do zadania');
  // ponowny zapis tych samych osób — bez drugiego powiadomienia
  await call(fns.patch, 'szef', { item_id: I_A, cells: { [C_PEOPLE]: [{ email: 'ola@x.pl', name: 'Ola' }] } });
  await settle();
  notes = await q1(`SELECT 1 FROM notifications`);
  assert.equal(notes.length, 1);

  // walidacja
  assert.equal((await call(fns.patch, 'szef', { item_id: I_A, cells: { [C_M_DUE]: 'x' } })).status, 400); // kolumna innej tablicy
  assert.equal((await call(fns.patch, 'szef', { item_id: I_A, cells: { [C_PEOPLE]: 'ola@x.pl' } })).status, 400);
  assert.equal((await call(fns.patch, 'szef', { item_id: I_A, group_id: G_MEDIA })).status, 400);
  assert.equal((await call(fns.patch, 'szef', { item_id: I_A, group_id: null })).status, 400);
  assert.equal((await call(fns.patch, 'szef', { item_id: I_A, parent_item_id: I_A })).status, 400);
  assert.equal((await call(fns.patch, 'szef', { item_id: I_A, event_id: 999 })).status, 400);
  assert.equal((await call(fns.patch, 'szef', { item_id: I_A, event_id: 'abc' })).status, 400);
  // podelement i pętla
  assert.equal((await call(fns.patch, 'szef', { item_id: I_C, parent_item_id: I_B })).status, 200);
  assert.equal((await call(fns.patch, 'szef', { item_id: I_B, parent_item_id: I_C })).status, 400);
  assert.equal((await call(fns.patch, 'szef', { item_id: I_C, parent_item_id: null })).status, 200);
  // wydarzenie
  const ev = (await q1(`SELECT id FROM events LIMIT 1`))[0].id;
  assert.equal((await call(fns.patch, 'szef', { item_id: I_A, event_id: ev })).body.item.event_id, ev);
  // przeniesienie do grupy
  assert.equal((await call(fns.patch, 'szef', { item_id: I_B, group_id: G2 })).body.item.group_id, G2);
});

test('board-item-patch: zakres służby, prywatne tablice, brak prawa', { skip }, async () => {
  // członek Mediów („w zakresie służby”): tablica Mediów tak, Projekty — nie (poza zakresem → 404)
  assert.equal((await call(fns.patch, 'media', { item_id: I_M, cells: { [C_M_DUE]: '2026-10-09' } })).status, 200);
  assert.equal((await call(fns.patch, 'media', { item_id: I_A, name: 'x' })).status, 404);
  // cudza prywatna tablica
  assert.equal((await call(fns.patch, 'ola', { item_id: I_P, name: 'x' })).status, 404);
  assert.equal((await call(fns.patch, 'szef', { item_id: I_P, name: 'Sekret 2' })).status, 200);
  // bez uprawnień
  assert.equal((await call(fns.patch, 'gosc', { item_id: I_A, name: 'x' })).status, 403);
});

test('board-items-reorder: jedno zapytanie, grupa tej tablicy, elementy spoza tablicy pominięte', { skip }, async () => {
  const r = await call(fns.reorder, 'szef', { board_id: B_PROJ, group_id: G2, ordered_ids: [I_C, I_A, I_B, I_M] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, updated: 3 });
  const rows = await q1(`SELECT id, group_id, display_order FROM board_items WHERE board_id = $1 ORDER BY display_order`, [B_PROJ]);
  assert.deepEqual(rows.map((x) => [x.id, x.group_id, x.display_order]), [[I_C, G2, 0], [I_A, G2, 1], [I_B, G2, 2]]);
  assert.equal((await q1(`SELECT board_id FROM board_items WHERE id = $1`, [I_M]))[0].board_id, B_MEDIA);
  assert.equal((await call(fns.reorder, 'szef', { board_id: B_PROJ, group_id: G_MEDIA, ordered_ids: [I_A] })).status, 400);
  assert.equal((await call(fns.reorder, 'szef', { board_id: B_PROJ, group_id: G1, ordered_ids: [I_M] })).status, 404);
  assert.equal((await call(fns.reorder, 'media', { board_id: B_PROJ, group_id: G1, ordered_ids: [I_A] })).status, 404);
  assert.equal((await call(fns.reorder, 'gosc', { board_id: B_PROJ, group_id: G1, ordered_ids: [I_A] })).status, 403);
  await call(fns.reorder, 'szef', { board_id: B_PROJ, group_id: G1, ordered_ids: [I_A, I_B, I_C] });
});

test('board-comment: autor z sesji, odpowiedź w wątku, wzmianki tylko dla widzących tablicę', { skip }, async () => {
  await db.query(`DELETE FROM notifications`);
  const r = await call(fns.comment, 'szef', { item_id: I_A, body: 'Hej @Ola, @Gość i ja', mentions: ['OLA@x.pl', 'gosc@x.pl', 'szef@x.pl', 'off@x.pl'] });
  assert.equal(r.status, 200);
  assert.equal(r.body.update.author_email, 'szef@x.pl');
  assert.equal(r.body.update.author_name, 'Szef Zespołu');
  assert.equal(r.body.update.board_id, B_PROJ);
  assert.deepEqual(r.body.update.mentions, ['ola@x.pl', 'gosc@x.pl', 'szef@x.pl', 'off@x.pl']);
  await settle();
  const notes = await q1(`SELECT user_email, type, link, title FROM notifications`);
  assert.deepEqual(notes.map((n) => [n.user_email, n.type, n.link]), [['Ola@X.pl', 'mention', `/projekty?board=${B_PROJ}&item=${I_A}`]]);
  assert.equal(notes[0].title, 'Szef Zespołu wspomniał(a) o Tobie');

  const reply1 = await call(fns.comment, 'ola', { item_id: I_A, body: 'OK', parent_id: r.body.update.id });
  assert.equal(reply1.status, 200);
  assert.equal(reply1.body.update.parent_update_id, r.body.update.id);
  assert.equal((await call(fns.comment, 'ola', { item_id: I_B, body: 'x', parent_id: r.body.update.id })).status, 400);
  // członek Mediów: komentuje zadania Mediów, nie Projektów; prywatna tablica i gość — odmowa
  assert.equal((await call(fns.comment, 'media', { item_id: I_M, body: 'Zrobię' })).status, 200);
  assert.equal((await call(fns.comment, 'media', { item_id: I_A, body: 'x' })).status, 403);
  assert.equal((await call(fns.comment, 'ola', { item_id: I_P, body: 'x' })).status, 403);
  assert.equal((await call(fns.comment, 'gosc', { item_id: I_A, body: 'x' })).status, 403);
  assert.equal((await call(fns.comment, 'szef', { item_id: id(999), body: 'x' })).status, 404);
});

test('my-board-items: assignee_emails, uprawnienia modułu, exclude_board_id, zakres i kolejność dat', { skip }, async () => {
  fns.myItems._resetAssignedCache();
  await db.query(`UPDATE board_items SET cells = cells || $2::jsonb WHERE id = $1`,
    [I_B, JSON.stringify({ [C_PEOPLE]: [{ email: 'media@x.pl' }], [C_DUE]: '2026-10-05', [C_STATUS]: 'done' })]);
  await db.query(`UPDATE board_items SET cells = cells || $2::jsonb WHERE id = $1`, [I_M, JSON.stringify({ [C_M_DUE]: '2026-10-09' })]);
  const ola = await call(fns.myItems.default, 'ola', {});
  assert.deepEqual(ola.body.items.map((i) => [i.id, i.date, i.link]), [[I_A, '2026-10-20', `/projekty?board=${B_PROJ}&item=${I_A}`]]);
  // członek Mediów: element Projektów (bez module:boards) odpada, element Mediów — tak
  const media = await call(fns.myItems.default, 'media', {});
  assert.deepEqual(media.body.items.map((i) => i.id), [I_M]);
  // lider (wszystkie moduły) widzi oba, posortowane po terminie; done z etykiety
  await db.query(`UPDATE board_items SET cells = cells || $2::jsonb WHERE id = $1`, [I_B, JSON.stringify({ [C_PEOPLE]: [{ email: 'ola@x.pl' }] })]);
  const all = await call(fns.myItems.default, 'ola', {});
  assert.deepEqual(all.body.items.map((i) => [i.id, i.done]), [[I_B, true], [I_A, false]]);
  const ranged = await call(fns.myItems.default, 'ola', { from: '2026-10-10', to: '2026-10-31' });
  assert.deepEqual(ranged.body.items.map((i) => i.id), [I_A]);
  const excluded = await call(fns.myItems.default, 'ola', { exclude_board_id: B_PROJ });
  assert.deepEqual(excluded.body.items, []);
  // Data API: .contains('assignee_emails', [email]) działa na kolumnie text[]
  const built = fns.qb.buildQuery({ table: 'board_items', op: 'select', select: 'id', filters: [{ type: 'contains', column: 'assignee_emails', value: ['ola@x.pl'] }] });
  const found = (await db.query(built.sql, built.params)).rows.map((r) => r.id).sort();
  assert.deepEqual(found, [I_A, I_B].sort());
});

test('import starych zadań (HTTP): przejęcie przez prywatną tablicę, idempotencja, brak tabeli, uzupełnienie', { skip }, async () => {
  await db.query(`INSERT INTO media_team (id, email, full_name) VALUES ($1, 'media@x.pl', 'Marek')`, [id(51)]);
  await db.query(`INSERT INTO media_tasks (title, status, assigned_to, due_date) VALUES ('Nagłośnienie', 'Gotowe', $1, '2026-10-01'), ('Slajdy', 'todo', NULL, NULL)`, [id(51)]);
  await db.query(`INSERT INTO media_task_comments (task_id, content, author_email) VALUES (1, 'Mikrofony?', 'szef@x.pl')`);
  // Ktoś założył wcześniej PRYWATNĄ tablicę z tym source_kind — nie może przejąć zadań służby.
  await db.query(`INSERT INTO boards (id, name, source_kind, visibility, owner_email) VALUES ($1, 'Moja', 'media_tasks', 'private', 'gosc@x.pl')`, [id(60)]);

  const first = await call(fns.imp.default, 'szef', { source: 'media_tasks', title: 'Zadania Media Team' });
  assert.equal(first.status, 200);
  assert.equal(first.body.created, true);
  assert.notEqual(first.body.board_id, id(60));
  assert.equal(first.body.imported, 2);
  assert.equal(first.body.people, 1);
  assert.equal(first.body.comments, 1);
  const board = (await q1(`SELECT created_by, owner_email, module_key FROM boards WHERE id = $1`, [first.body.board_id]))[0];
  assert.deepEqual(board, { created_by: fns.imp.IMPORT_MARKER, owner_email: null, module_key: 'media' });
  const second = await call(fns.imp.default, 'szef', { source: 'media_tasks' });
  assert.deepEqual([second.body.created, second.body.board_id], [false, first.body.board_id]);
  // osoba z importu trafia do assignee_emails (trigger)
  const imported = await q1(`SELECT assignee_emails FROM board_items WHERE board_id = $1 AND name = 'Nagłośnienie'`, [first.body.board_id]);
  assert.deepEqual(imported[0].assignee_emails, ['media@x.pl']);

  // brak tabeli źródłowej → pusta tablica (moduł i tak potrzebuje zakładki „Zadania”)
  const none = await call(fns.imp.default, 'szef', { source: 'home_group_tasks', title: 'Zadania grup domowych' });
  assert.equal(none.status, 200);
  assert.deepEqual([none.body.created, none.body.imported], [true, 0]);

  // Uzupełnienie: tablica z dawnego importu w przeglądarce (bez osób, bez znacznika).
  await db.query(`UPDATE boards SET legacy_backfill_at = NULL WHERE id = $1`, [first.body.board_id]);
  await db.query(`UPDATE board_items SET cells = cells - $2 WHERE board_id = $1`, [first.body.board_id,
    (await q1(`SELECT id FROM board_columns WHERE board_id = $1 AND type = 'people'`, [first.body.board_id]))[0].id]);
  const bf = await call(fns.imp.default, 'szef', { source: 'media_tasks', mode: 'backfill' });
  assert.equal(bf.status, 200);
  assert.equal(bf.body.people_filled, 1);
  assert.equal(bf.body.marker, true);
  const again = await call(fns.imp.default, 'szef', { source: 'media_tasks', mode: 'backfill' });
  assert.equal(again.body.already, true);
  assert.equal((await call(fns.imp.default, 'szef', { source: 'mlodziezowka_tasks', mode: 'backfill' })).status, 404);
  assert.equal((await call(fns.imp.default, 'gosc', { source: 'media_tasks' })).status, 403);
});

test('import starych zadań (worker): każde źródło z wierszami raz, potem nic', { skip }, async () => {
  await db.query(`INSERT INTO app_modules (key, label) VALUES ('chor', 'Chór')`);
  await db.pg.exec(`CREATE TABLE custom_chor_tasks (id serial PRIMARY KEY, title text, status text);
                    INSERT INTO custom_chor_tasks (title, status) VALUES ('Próba', 'todo');
                    CREATE TABLE custom_pusty_tasks (id serial PRIMARY KEY, title text);`);
  const logs = [];
  const r1 = await fns.imp.runForTenant(db, { tenantSlug: 't', tenantDbName: TENANT.db_name, log: (m) => logs.push(m) });
  assert.equal(r1.created, 1);
  const chor = await q1(`SELECT name, module_key, created_by FROM boards WHERE source_kind = 'custom_chor_tasks'`);
  assert.deepEqual(chor, [{ name: 'Zadania — Chór', module_key: 'chor', created_by: fns.imp.IMPORT_MARKER }]);
  // Jedna linia kontrolna na tenanta: stare wiersze vs elementy z source_id, stan uzupełnienia.
  const summary = logs.at(-1);
  assert.match(summary, /^board-import-legacy: /);
  assert.match(summary, /custom_chor_tasks: board [0-9a-f-]{36} \(imported 1, new board, backfill done\) legacy 1 \/ items 1 ok/);
  assert.ok(!summary.includes('custom_pusty_tasks'), 'tabela bez modułu nie jest źródłem');
  assert.match(summary, /media_tasks: board [0-9a-f-]{36} \(imported 0, backfill (done|pending)\) legacy \d+ \/ items \d+/);
  const logs2 = [];
  const r2 = await fns.imp.runForTenant(db, { tenantSlug: 't', tenantDbName: TENANT.db_name, log: (m) => logs2.push(m) });
  assert.deepEqual([r2.created, r2.backfilled, r2.failed], [0, 0, 0]);
  assert.equal(logs2.length, 1, 'bez zmian — tylko linia kontrolna');
  assert.match(logs2[0], /custom_chor_tasks: board [0-9a-f-]{36} \(imported 0, backfill done\) legacy 1 \/ items 1 ok/);
});

test('automatyzacje: termin (dni przed/po), powiadom/przypisz/utwórz, cykliczne z terminem', { skip }, async () => {
  await db.query(`DELETE FROM notifications`);
  const { warsawNow, addDaysYmd } = fns.auto;
  const today = warsawNow().ymd;
  await db.query(`UPDATE board_items SET cells = cells || $2::jsonb WHERE id = $1`, [I_C, JSON.stringify({ [C_DUE]: addDaysYmd(today, 2) })]);
  await db.query(`UPDATE board_items SET cells = cells || $2::jsonb WHERE id = $1`, [I_B, JSON.stringify({ [C_DUE]: addDaysYmd(today, -1) })]);
  await db.query(`INSERT INTO board_automations (board_id, name, trigger, actions) VALUES
    ($1, 'Przed terminem', $2::jsonb, $3::jsonb), ($1, 'Po terminie', $4::jsonb, $5::jsonb), ($1, 'Co dzień', $6::jsonb, $7::jsonb)`, [
    B_PROJ,
    JSON.stringify({ type: 'date_arrives', columnId: C_DUE, daysBefore: 2 }),
    JSON.stringify([{ type: 'assign_person', params: { columnId: C_PEOPLE, email: 'Ola@x.pl', name: 'Ola' } },
      { type: 'notify', params: { targetType: 'assignee', title: 'Termin za 2 dni' } },
      { type: 'notify', params: { targetType: 'creator' } }]),
    JSON.stringify({ type: 'date_arrives', columnId: C_DUE, daysBefore: -1 }),
    JSON.stringify([{ type: 'create_item', params: { name: 'Sprawdź zaległe', groupId: G2 } }]),
    JSON.stringify({ type: 'every_period', period: 'daily' }),
    JSON.stringify([{ type: 'create_item', params: { name: 'Codzienne', groupId: G1, cells: { [C_STATUS]: 'todo', [C_M_DUE]: 'obca' }, dueColumnId: C_DUE, dueOffsetDays: 3 } }]),
  ]);
  const ctx = { tenantSlug: 't', tenantDbName: TENANT.db_name, log: () => {} };
  await fns.auto.runForTenant(db, ctx);
  await settle();
  const c = (await q1(`SELECT cells, assignee_emails FROM board_items WHERE id = $1`, [I_C]))[0];
  assert.deepEqual(c.assignee_emails, ['ola@x.pl']);
  const notes = await q1(`SELECT user_email, title, link FROM notifications ORDER BY title`);
  // przypisanie (Automatyzacja) + powiadomienie „Termin za 2 dni”; twórca elementu nieznany — nic
  assert.deepEqual(notes.map((n) => [n.user_email, n.title]), [['Ola@X.pl', 'Automatyzacja przypisał(a) Cię do zadania'], ['Ola@X.pl', 'Termin za 2 dni']]);
  assert.ok(notes.every((n) => n.link === `/projekty?board=${B_PROJ}&item=${I_C}`));
  const created = await q1(`SELECT name, group_id, cells, created_by FROM board_items WHERE board_id = $1 AND created_by = 'automatyzacja' ORDER BY name`, [B_PROJ]);
  assert.deepEqual(created.map((x) => [x.name, x.group_id]), [['Codzienne', G1], ['Sprawdź zaległe', G2]]);
  assert.deepEqual(created[0].cells, { [C_STATUS]: 'todo', [C_DUE]: addDaysYmd(today, 3) }); // kolumna obcej tablicy odrzucona
  // drugi przebieg tego samego dnia — nic nowego
  await fns.auto.runForTenant(db, ctx);
  assert.equal((await q1(`SELECT 1 FROM board_items WHERE created_by = 'automatyzacja'`)).length, 2);
  assert.equal((await q1(`SELECT 1 FROM notifications`)).length, 2);
});

test('poranny skrót: zadania na dziś i zaległe, bez zrobionych, rezygnacja, raz dziennie', { skip }, async () => {
  const today = fns.auto.warsawNow().ymd;
  const { addDaysYmd } = fns.auto;
  await db.query(`UPDATE board_items SET cells = cells || $2::jsonb WHERE id = $1`, [I_A, JSON.stringify({ [C_DUE]: today })]);
  await db.query(`UPDATE board_items SET cells = cells || $2::jsonb WHERE id = $1`, [I_B, JSON.stringify({ [C_DUE]: addDaysYmd(today, -3), [C_STATUS]: 'done' })]);
  await db.query(`INSERT INTO user_tasks (user_email, title, due_date, status, assigned_to_email) VALUES
    ('szef@x.pl', 'Zadzwonić', $1, 'todo', 'ola@x.pl'), ('ola@x.pl', 'Stare', $2, 'todo', NULL), ('ola@x.pl', 'Zrobione', $1, 'done', NULL),
    ('ola@x.pl', 'Bardzo stare', $3, 'todo', NULL)`, [today, addDaysYmd(today, -2), addDaysYmd(today, -40)]);
  await db.query(`INSERT INTO push_user_preferences (user_email, category_opt_outs) VALUES ('szef@x.pl', '{task_digest}')`);
  const mails = []; const pushes = [];
  const deps = { emailReady: true, sendEmail: async (m) => mails.push(m), sendPush: async (_p, m) => { pushes.push(m); return { body: { sent: 1 } }; } };
  const ctx = { tenantSlug: 't', tenantSubdomain: 't', tenantDbName: TENANT.db_name, log: () => {}, deps };

  await db.query(`INSERT INTO app_settings (key, value) VALUES ('task_digest', '{"enabled": false}')`);
  assert.equal((await fns.digest.runForTenant(db, ctx)).users, 0);
  await db.query(`UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'task_digest'`);

  const r = await fns.digest.runForTenant(db, ctx);
  const byTo = Object.fromEntries(mails.map((m) => [m.to.toLowerCase(), m]));
  assert.ok(!byTo['szef@x.pl'], 'rezygnacja z kategorii task_digest');
  const ola = byTo['ola@x.pl'];
  assert.ok(ola, 'Ola dostaje skrót');
  // Ola: I_A (dziś), I_C (zaległe? termin za 2 dni — nie), I_B zrobione — nie; osobiste: Zadzwonić (przypisane), Stare (zaległe); bez zrobionych i starszych niż 14 dni
  assert.equal(ola.subject, 'Masz 3 zadania na dziś');
  assert.ok(ola.html.includes('Farba') && ola.html.includes('Zadzwonić') && ola.html.includes('Stare'));
  assert.ok(!ola.html.includes('Pędzle') && !ola.html.includes('Zrobione') && !ola.html.includes('Bardzo stare'));
  assert.match(ola.text, /https?:\/\/t\./); // adres tenanta (subdomena)
  assert.ok(pushes.some((p) => p.user_email.toLowerCase() === 'ola@x.pl' && p.title === 'Masz 3 zadania na dziś'));
  assert.ok(r.emailed >= 1);
  const marks = await q1(`SELECT user_email, task_count, channels FROM task_digest_sends WHERE user_email = 'ola@x.pl'`);
  assert.deepEqual(marks, [{ user_email: 'ola@x.pl', task_count: 3, channels: ['email', 'push'] }]);
  // drugi przebieg tego dnia — nikt drugi raz
  const before2 = mails.length;
  await fns.digest.runForTenant(db, ctx);
  assert.equal(mails.filter((m) => m.to.toLowerCase() === 'ola@x.pl').length, 1);
  assert.ok(mails.length >= before2);
});

test('poranny skrót: ustawienia zapisane z webu (Data API) — okno zaległych i osobista rezygnacja', { skip }, async () => {
  const shared = await import('@avenit/shared/src/lib/taskDigest.js');
  const mails = [];
  const deps = { emailReady: true, sendEmail: async (m) => mails.push(m), sendPush: async () => ({ body: { sent: 0 } }) };
  const ctx = { tenantSlug: 't', tenantSubdomain: 't', tenantDbName: TENANT.db_name, log: () => {}, deps };
  const web = async (table, values, onConflict, actor) => {
    const q = { table, op: 'upsert', values, onConflict, returning: '*' };
    if (actor) q.__ownerScope = fns.own.ownerScope(table, actor);
    const built = fns.qb.buildQuery(q);
    return (await db.query(built.sql, built.params)).rows;
  };
  await db.query(`DELETE FROM task_digest_sends`);
  // Organizacja (Ustawienia → Organizacja): okno zaległych 1 dzień — „Stare” (2 dni temu) wypada.
  await web('app_settings', { key: 'task_digest', value: shared.serializeDigestConfig({ enabled: true, overdue_days: 1 }) }, 'key');
  await fns.digest.runForTenant(db, ctx);
  const ola = mails.find((m) => m.to.toLowerCase() === 'ola@x.pl');
  assert.ok(ola && ola.html.includes('Farba') && ola.html.includes('Zadzwonić') && !ola.html.includes('Stare'));
  assert.equal(ola.subject, 'Masz 2 zadania na dziś');

  // Osoba (Mój profil): rezygnacja dopisana do istniejących kategorii — skrót nie przychodzi.
  await db.query(`DELETE FROM task_digest_sends`);
  mails.length = 0;
  const actor = { id: U.ola, email: 'Ola@X.pl' };
  await web('push_user_preferences', { user_email: 'Ola@X.pl', category_opt_outs: ['chat'] }, 'user_email', actor);
  const [row] = await web('push_user_preferences', { user_email: 'Ola@X.pl', category_opt_outs: shared.withDigestOptOut(['chat'], true) }, 'user_email', actor);
  assert.deepEqual(row.category_opt_outs, ['chat', 'task_digest']);
  await fns.digest.runForTenant(db, ctx);
  assert.ok(!mails.some((m) => m.to.toLowerCase() === 'ola@x.pl'), 'rezygnacja osobista respektowana');
  // Ponowne włączenie — skrót wraca, inne kategorie zostają.
  const [row2] = await web('push_user_preferences', { user_email: 'Ola@X.pl', category_opt_outs: shared.withDigestOptOut(row.category_opt_outs, false) }, 'user_email', actor);
  assert.deepEqual(row2.category_opt_outs, ['chat']);
  await fns.digest.runForTenant(db, ctx);
  assert.ok(mails.some((m) => m.to.toLowerCase() === 'ola@x.pl'));
  // Organizacja wyłącza — nikt.
  await db.query(`DELETE FROM task_digest_sends`);
  mails.length = 0;
  await web('app_settings', { key: 'task_digest', value: shared.serializeDigestConfig({ enabled: false, overdue_days: 1 }) }, 'key');
  assert.equal((await fns.digest.runForTenant(db, ctx)).users, 0);
  assert.equal(mails.length, 0);
  await db.query(`DELETE FROM app_settings WHERE key = 'task_digest'`);
});

test('iCal: nieaktywne konto — odmowa; zadania osobiste i elementy tablic w kanale', { skip }, async () => {
  const token = 'x'.repeat(40);
  await db.query(`INSERT INTO ical_subscriptions (token, user_email, export_preferences) VALUES ($1, 'off@x.pl', '{"tasks":true}'), ($2, 'ola@x.pl', '{"tasks":true,"my_services":false}')`,
    [token, 'y'.repeat(40)]);
  const icalReq = (t) => ({ db, tenant: TENANT, params: { token: t }, query: {}, url: `/api/fn/ical/${t}`, log });
  const r1 = reply();
  await fns.ical(icalReq(token), { ...r1, header() { return this; } });
  const res = { statusCode: 200, headers: {}, body: '', code(n) { this.statusCode = n; return this; }, header(k, v) { this.headers[k] = v; return this; }, send(b) { this.body = b; return this; } };
  await fns.ical(icalReq(token), res);
  assert.equal(res.statusCode, 403);
  const ok = { ...res, statusCode: 200, headers: {}, body: '' };
  await fns.ical(icalReq('y'.repeat(40)), ok);
  assert.equal(ok.statusCode, 200);
  assert.match(ok.body, /SUMMARY:Farba biała/);
  assert.match(ok.body, /SUMMARY:Zadzwonić/);
  assert.match(ok.body, /UID:user-task-/);
});

test('zadanie osobiste: przypisanie przez Data API → powiadomienie dla przypisanego', { skip }, async () => {
  await db.query(`DELETE FROM notifications`);
  const [t] = await q1(`INSERT INTO user_tasks (user_email, title, due_date) VALUES ('szef@x.pl', 'Kupić kawę', '2026-10-12') RETURNING id`);
  const actor = { id: U.szef, email: 'szef@x.pl' };
  const q = { table: 'user_tasks', op: 'update', values: { assigned_to_email: 'Ola@x.pl' }, filters: [{ type: 'eq', column: 'id', value: t.id }], returning: '*' };
  q.__ownerScope = fns.own.ownerScope('user_tasks', actor);
  const prep = await fns.hooks.prepareUserTaskAssign(db, q);
  const built = fns.qb.buildQuery(q);
  const res = await db.query(built.sql, built.params);
  const out = await fns.hooks.notifyUserTaskAssign({ db, tenant: TENANT, prep, data: res.rows, rowCount: res.rowCount, actor, log });
  assert.equal(out.sent, 1);
  const notes = await q1(`SELECT user_email, type, title, body, link FROM notifications`);
  assert.deepEqual(notes, [{ user_email: 'Ola@X.pl', type: 'task', title: 'Szef Zespołu przypisał(a) Ci zadanie', body: 'Kupić kawę · termin 12.10', link: `/?task=${t.id}` }]);
  // ten sam adresat ponownie — nic
  const prep2 = await fns.hooks.prepareUserTaskAssign(db, { ...q, __ownerScope: q.__ownerScope });
  const res2 = await db.query(built.sql, built.params);
  assert.equal((await fns.hooks.notifyUserTaskAssign({ db, tenant: TENANT, prep: prep2, data: res2.rows, rowCount: res2.rowCount, actor, log })).sent, 0);
});
