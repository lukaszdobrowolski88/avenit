// Przynależność do służby (ministry_memberships) → skład zespołu (media_team, worship_team…).
//
// Osoba dodana do służby w Ustawieniach (formularz konta, panel osoby, aplikacja) ma od razu
// trafić na listę Członków i do grafiku tej służby — wcześniej robiła to tylko przeglądarka przy
// zakładaniu NOWEGO konta (GlobalSettings.addUserToTeams), więc dopisanie istniejącej osoby do
// kolejnej służby dawało dostęp do modułu, ale nie wiersz w składzie.
//
// Zapis idzie po udanym insercie przynależności (dataapi/routes.js) — jego autor przeszedł już
// strażnika enforceMembershipWrite, a przynależność członka i tak daje res:<skład>:create, więc
// nikt nie dostaje tu więcej, niż już może. Idempotentnie: istniejący wiersz (po koncie, e-mailu,
// albo ręczny wiersz bez e-maila i konta o tym samym imieniu) jest tylko łączony z kontem.
// Telefonu konta NIE kopiujemy (prywatne pole app_users — redakcja r4/r6). Kolumny tabel składu
// różnią się między tenantami — sprawdzamy information_schema i pomijamy tabelę, której wymaganej
// kolumny nie umiemy wypełnić. Błędy nie wywracają zapisu przynależności.
import { accessTableFor, DEFAULT_ROSTER_ROLE, fold } from '@avenit/shared/src/lib/ministryPeople.js';

const TABLE_RE = /^[a-z][a-z0-9_]*$/;

export async function tableColumns(db, table) {
  if (!TABLE_RE.test(String(table || ''))) return null;
  const { rows } = await db.query(
    `SELECT column_name, is_nullable, column_default, data_type
       FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  if (!rows.length) return null;
  return new Map(rows.map((r) => [r.column_name, {
    nullable: r.is_nullable === 'YES', hasDefault: r.column_default != null, type: r.data_type,
  }]));
}

// Wiersz do wstawienia (albo null, gdy tabela ma wymaganą kolumnę, której nie znamy).
export function rosterInsertRow(cols, table, { account, role = 'member', actorEmail = null }) {
  const name = String(account.full_name || account.name || '').trim()
    || (account.email ? String(account.email).split('@')[0] : '');
  const row = {};
  const set = (c, v) => { if (cols.has(c) && v !== undefined) row[c] = v; };
  set('full_name', name || null);
  set('email', account.email || null);
  if (cols.has('user_id')) row.user_id = account.id;
  if (cols.has('status')) row.status = 'Aktywny';
  if (cols.has('is_active')) row.is_active = true;
  if (cols.has('is_leader')) row.is_leader = role === 'leader';
  if (cols.has('role') && DEFAULT_ROSTER_ROLE[table]) row.role = DEFAULT_ROSTER_ROLE[table];
  if (cols.has('created_by')) row.created_by = actorEmail || account.email || 'system';
  for (const [c, meta] of cols) {
    if (!meta.nullable && !meta.hasDefault && (row[c] == null || row[c] === '')) return null;
  }
  return row;
}

// Zapewnia wiersz składu służby dla konta. Zwraca 'inserted' | 'linked' | 'exists' | 'skipped'.
export async function ensureRosterRow(db, { userId, ministryKey, role = 'member' }, { actorEmail = null } = {}) {
  const table = accessTableFor(ministryKey);
  if (!table || userId == null) return 'skipped';
  const cols = await tableColumns(db, table);
  if (!cols || !cols.has('full_name')) return 'skipped';
  const { rows: acc } = await db.query(
    'SELECT id, email, full_name, name FROM app_users WHERE id::text = $1', [String(userId)]
  );
  const account = acc[0];
  if (!account) return 'skipped';
  const hasUser = cols.has('user_id');
  const hasEmail = cols.has('email');
  const email = String(account.email || '').trim().toLowerCase();

  // Istniejący wiersz tej osoby.
  const sel = ['id', 'full_name', hasEmail ? 'email' : 'NULL::text AS email', hasUser ? 'user_id::text AS user_id' : 'NULL::text AS user_id'];
  const { rows: existing } = await db.query(`SELECT ${sel.join(', ')} FROM "${table}"`);
  const byUser = hasUser ? existing.find((r) => r.user_id != null && r.user_id === String(account.id)) : null;
  if (byUser) return 'exists';
  const byEmail = email ? existing.find((r) => String(r.email || '').trim().toLowerCase() === email) : null;
  const name = fold(account.full_name || account.name);
  const byName = !byEmail && name
    ? existing.filter((r) => !String(r.email || '').trim() && r.user_id == null && fold(r.full_name) === name)
    : [];
  const match = byEmail || (byName.length === 1 ? byName[0] : null);
  if (match) {
    const patch = {};
    if (hasUser && match.user_id == null) patch.user_id = account.id;
    if (hasEmail && !String(match.email || '').trim() && account.email) patch.email = account.email;
    const keys = Object.keys(patch);
    if (!keys.length) return 'exists';
    await db.query(
      `UPDATE "${table}" SET ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')} WHERE id::text = $${keys.length + 1}`,
      [...keys.map((k) => patch[k]), String(match.id)]
    );
    return 'linked';
  }

  const row = rosterInsertRow(cols, table, { account, role, actorEmail });
  if (!row || !row.full_name) return 'skipped';
  const keys = Object.keys(row);
  await db.query(
    `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
    keys.map((k) => row[k])
  );
  return 'inserted';
}

// Hak po zapisie /api/db: nowe przynależności → wiersze składu. Nie rzuca.
export async function syncRosterAfterMembership(db, q, rows, { actorEmail = null, log = null } = {}) {
  if (q?.table !== 'ministry_memberships' || !(q.op === 'insert' || q.op === 'upsert')) return [];
  const out = [];
  for (const r of rows || []) {
    if (!r?.user_id || !r.ministry_key) continue;
    try {
      out.push(await ensureRosterRow(db, { userId: r.user_id, ministryKey: r.ministry_key, role: r.role }, { actorEmail }));
    } catch (err) {
      log?.warn?.({ err, ministry_key: r.ministry_key }, 'roster sync after membership failed');
      out.push('error');
    }
  }
  return out;
}
