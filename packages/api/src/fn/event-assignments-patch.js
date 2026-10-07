// Grafik: atomowa zmiana pojedynczych pól w events.assignments.
//
// Do audytu 2026-10 klient wysyłał CAŁY obiekt assignments (wszystkie służby) ze stanu
// pobranego przy wejściu na stronę — ostatni zapis wygrywał, więc lider Uwielbienia, który
// miał grafik otwarty dłużej, kasował przypisania wpisane w międzyczasie przez Media.
// Tu zmieniamy tylko wskazane ścieżki [służba, pole] w jednej transakcji z blokadą wiersza.
//
// Body: { event_id, ops: [{ team, key, value }] }
//   value: string/liczba/obiekt — ustawia assignments[team][key]; null — usuwa pole.
//   key pominięty + value obiekt/null — ustawia/usuwa całą sekcję assignments[team].
// Dostęp: jak zwykła edycja wydarzenia (canAccess update na events).
import { canAccess, loadGrants } from '../dataapi/registry.js';
import { emitChange } from '../realtime/hub.js';

export const name = 'event-assignments-patch';
export const method = 'POST';

// Klucze ról bywają wpisane ręcznie (polskie litery, spacje) — dopuszczamy litery/cyfry Unicode.
const KEY_RE = /^[\p{L}\p{N}_\-:. ]{1,80}$/u;
const MAX_OPS = 50;

export function applyOps(assignments, ops) {
  const next = assignments && typeof assignments === 'object' && !Array.isArray(assignments) ? { ...assignments } : {};
  for (const { team, key, value } of ops) {
    if (key == null) {
      if (value == null) delete next[team];
      else next[team] = value;
      continue;
    }
    const section = next[team] && typeof next[team] === 'object' && !Array.isArray(next[team]) ? { ...next[team] } : {};
    if (value == null) delete section[key];
    else section[key] = value;
    next[team] = section;
  }
  return next;
}

export function validateOps(ops) {
  if (!Array.isArray(ops) || !ops.length || ops.length > MAX_OPS) return 'Podaj od 1 do 50 zmian (ops)';
  for (const op of ops) {
    if (!op || !KEY_RE.test(String(op.team || ''))) return 'Nieprawidłowa nazwa służby';
    if (op.key != null && !KEY_RE.test(String(op.key))) return 'Nieprawidłowe pole grafiku';
    if (op.key == null && op.value != null && (typeof op.value !== 'object' || Array.isArray(op.value))) {
      return 'Sekcja służby musi być obiektem';
    }
  }
  return null;
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });

  const eventId = req.body?.event_id;
  const ops = req.body?.ops;
  if (eventId == null || eventId === '') return reply.code(400).send({ error: 'Brak event_id' });
  const invalid = validateOps(ops);
  if (invalid) return reply.code(400).send({ error: invalid });

  const { rows: me } = await req.db.query('SELECT id, role, is_super_admin, campus_id FROM app_users WHERE id = $1', [req.user.id]);
  if (!me[0]) return reply.code(403).send({ error: 'Brak konta' });
  const access = await canAccess({ pool: req.db, dbName: req.tenant.db_name, table: 'events', op: 'update', user: { ...req.user, ...me[0] } });
  if (!access.ok) return reply.code(403).send({ error: 'Brak uprawnień do edycji grafiku tego wydarzenia' });

  // Izolacja kampusów jak w /api/db: osoba z kampusem (bez roli admina) — tylko wydarzenia
  // swojego kampusu albo bez kampusu.
  const { adminRoles } = await loadGrants(req.db, req.tenant.db_name);
  const campusId = !me[0].is_super_admin && !adminRoles.has(me[0].role) ? me[0].campus_id : null;

  const client = await req.db.connect();
  let row;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, campus_id, assignments FROM events WHERE id::text = $1 FOR UPDATE', [String(eventId)]);
    if (!rows[0] || (campusId != null && rows[0].campus_id != null && String(rows[0].campus_id) !== String(campusId))) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Nie znaleziono wydarzenia' });
    }
    const next = applyOps(rows[0].assignments, ops);
    const upd = await client.query('UPDATE events SET assignments = $2::jsonb WHERE id = $1 RETURNING *', [rows[0].id, JSON.stringify(next)]);
    row = upd.rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    req.log?.error?.(err, '[event-assignments-patch]');
    return reply.code(500).send({ error: 'Nie udało się zapisać grafiku' });
  } finally {
    client.release();
  }

  try { emitChange(req.tenant.slug, 'events', 'update', [row]); } catch { /* realtime nieobowiązkowy */ }
  return { assignments: row.assignments || {}, event: row };
}
