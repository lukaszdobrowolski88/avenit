// Projekty (Boards): prywatne tablice po stronie serwera.
//
// Tablica z visibility='private' jest dla właściciela (owner_email) i osób z listy editors.
// Do audytu 2026-10 filtr był tylko w kliencie (useBoards) — przez /api/db i realtime każdy
// z dostępem do modułu Projekty widział prywatne tablice i ich elementy.
// Tu: zakres wierszy dla boards i tabel podrzędnych (board_id) + odbiorcy realtime.
import { ApiError } from './querybuilder.js';

const CHILD_TABLES = new Set([
  'board_items', 'board_groups', 'board_columns', 'board_views', 'board_automations',
  'board_automation_runs', 'board_item_activity', 'board_item_updates',
]);

export const isBoardTable = (table) => table === 'boards' || CHILD_TABLES.has(table);

const lower = (v) => String(v ?? '').toLowerCase();

// Tablica widoczna dla mnie: nie-prywatna, moja (właściciel; awaryjnie twórca) albo jestem edytorem.
function visibleBoard(b, p) {
  return `(coalesce(${b}."visibility", 'workspace') <> 'private'`
    + ` OR lower(coalesce(${b}."owner_email", ${b}."created_by")) = $${p}`
    + ` OR EXISTS (SELECT 1 FROM unnest(coalesce(${b}."editors", '{}'::text[])) e_ WHERE lower(e_) = $${p}))`;
}

export function boardScope(table, user) {
  const email = lower(user.email);
  const rule = table === 'boards'
    ? (a, push) => visibleBoard(a, push(email))
    : (a, push) => {
      const p = push(email);
      return `(${a}."board_id" IS NULL OR EXISTS (SELECT 1 FROM boards b_ WHERE b_."id" = ${a}."board_id" AND ${visibleBoard('b_', p)}))`;
    };
  return { select: rule, update: rule, delete: rule, upsertGuard: rule };
}

// Wstawianie elementów do tablicy, której nie widzę — odmowa.
export async function enforceBoardWrite(q, req) {
  if (!CHILD_TABLES.has(q.table) || !['insert', 'upsert'].includes(q.op) || !q.values) return;
  const rows = Array.isArray(q.values) ? q.values : [q.values];
  const ids = [...new Set(rows.map((r) => r?.board_id).filter((v) => v != null).map(String))];
  if (!ids.length) return;
  const { rows: found } = await req.db.query(
    `SELECT count(*)::int AS n FROM boards b WHERE b.id::text = ANY($1::text[]) AND ${visibleBoard('b', 2)}`,
    [ids, lower(req.user.email)]
  );
  if (found[0].n !== ids.length) throw new ApiError(403, 'Brak dostępu do tej tablicy');
}

// Realtime: zmiana w prywatnej tablicy idzie tylko do właściciela i edytorów. null = bez ograniczeń.
export async function boardAudience(db, table, rows) {
  if (!isBoardTable(table)) return null;
  const boards = [];
  if (table === 'boards') boards.push(...(rows || []).filter(Boolean));
  else {
    const ids = [...new Set((rows || []).map((r) => r?.board_id).filter((v) => v != null).map(String))];
    if (!ids.length) return null;
    const { rows: found } = await db.query(
      'SELECT id, visibility, owner_email, created_by, editors FROM boards WHERE id::text = ANY($1::text[])', [ids]
    );
    boards.push(...found);
  }
  // Gdy w paczce jest choć jedna prywatna tablica — ograniczamy całą paczkę (bezpieczniej
  // spóźnić odświeżenie wspólnej tablicy niż wysłać prywatny wiersz wszystkim).
  if (!boards.some((b) => b.visibility === 'private')) return null;
  const aud = new Set();
  for (const b of boards.filter((x) => x.visibility === 'private')) {
    const owner = lower(b.owner_email || b.created_by);
    if (owner) aud.add(owner);
    for (const e of b.editors || []) aud.add(lower(e));
  }
  return aud;
}
