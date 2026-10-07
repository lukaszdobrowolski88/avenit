// Decyzja moderatora w sprawie zgłoszenia (panel „Zgłoszenia” w Komunikatorze):
//   remove       — usuwa zgłoszoną treść (wiadomość / prośbę / wpis tablicy),
//   block_author — blokuje konto autora (tylko administrator kont, jak set-user-status),
//   dismiss      — zamyka bez zmian.
// Każda decyzja zamyka zgłoszenie i inne otwarte zgłoszenia tej samej treści.
// Moderator = jak w Komunikatorze (lib/moderation.js isModerator); sprawdzane w handlerze.
import { isModerator } from '../lib/moderation.js';
import { getCaller, isAdmin, isLastActiveAdmin, revokeSessions } from '../lib/user-admin.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'moderate-content';
export const method = 'POST';

const ACTIONS = ['remove', 'block_author', 'dismiss'];
const lower = (v) => String(v || '').trim().toLowerCase();

const REMOVED = '[treść usunięta przez moderatora]';

// Usuwa treść; gdy blokuje to klucz obcy (np. odpowiedzi, głosy), czyści samą treść — efekt dla
// czytających ten sam, a powiązane wiersze zostają spójne.
async function deleteOrBlank(db, table, id, blankSql) {
  try {
    const { rowCount } = await db.query(`DELETE FROM ${table} WHERE id::text = $1`, [id]);
    return rowCount > 0;
  } catch (err) {
    if (err?.code !== '23503') throw err;
    const { rowCount } = await db.query(blankSql, [id, REMOVED]);
    return rowCount > 0;
  }
}

async function removeTarget(db, report) {
  const type = report.content_type || 'message';
  if (type === 'message') {
    if (!report.message_id) return false;
    return deleteOrBlank(db, 'messages', String(report.message_id), 'UPDATE messages SET content = $2 WHERE id::text = $1');
  }
  if (!report.target_id) return false;
  if (type === 'prayer') {
    return deleteOrBlank(db, 'prayer_requests', report.target_id,
      `UPDATE prayer_requests SET content = $2, status = 'archived' WHERE id::text = $1`);
  }
  if (type === 'wall_post') {
    return deleteOrBlank(db, 'wall_posts', report.target_id, 'UPDATE wall_posts SET content = $2, title = NULL WHERE id::text = $1');
  }
  return false;
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const reportId = String(req.body?.reportId || '');
  const action = String(req.body?.action || '');
  const note = String(req.body?.note || '').slice(0, 1000) || null;
  if (!reportId || !ACTIONS.includes(action)) return reply.code(400).send({ error: 'Nieprawidłowe żądanie.' });

  const caller = await getCaller(req.db, req.user.id, req.tenant.db_name);
  if (!caller?.is_active || !(await isModerator(req.db, req.tenant.db_name, caller))) {
    return reply.code(403).send({ error: 'Zgłoszenia rozpatruje moderator.' });
  }

  const { rows } = await req.db.query('SELECT * FROM message_reports WHERE id::text = $1', [reportId]);
  const report = rows[0];
  if (!report) return reply.code(404).send({ error: 'Nie znaleziono zgłoszenia.' });

  let outcome = 'Zamknięte bez zmian';
  if (action === 'remove') {
    const removed = await removeTarget(req.db, report);
    outcome = removed ? 'Treść usunięta' : 'Treść była już usunięta';
  } else if (action === 'block_author') {
    if (!isAdmin(caller)) return reply.code(403).send({ error: 'Konta blokuje administrator.' });
    const author = lower(report.message_sender_email);
    if (!author) return reply.code(400).send({ error: 'Nie znamy autora tej treści.' });
    const { rows: u } = await req.db.query(
      'SELECT id, email, is_super_admin FROM app_users WHERE lower(email) = $1', [author]);
    const target = u[0];
    if (!target) return reply.code(404).send({ error: 'Autor nie ma już konta.' });
    if (target.id === req.user.id) return reply.code(400).send({ error: 'Nie możesz zablokować własnego konta.' });
    if (target.is_super_admin && !caller.is_super_admin) return reply.code(403).send({ error: 'Tylko super-administrator może zablokować super-administratora.' });
    if (await isLastActiveAdmin(req.db, target.id)) return reply.code(400).send({ error: 'To ostatni aktywny administrator — nie można zablokować.' });
    await req.db.query(`UPDATE app_users SET is_active = false, status = 'blocked', pending_kind = NULL WHERE id = $1`, [target.id]);
    await revokeSessions(req.db, target.id);
    await removeTarget(req.db, report).catch(() => false);
    await logAccountEvent(req.db, { email: target.email, action: 'blocked', actor: caller.email, detail: 'moderacja zgłoszenia' });
    outcome = 'Treść usunięta, autor zablokowany';
  }

  const sameTarget = report.content_type && report.content_type !== 'message'
    ? ['content_type = $5 AND target_id = $6', [report.content_type, report.target_id]]
    : ['message_id = $5', [report.message_id]];
  await req.db.query(
    `UPDATE message_reports SET status = 'resolved', resolved_by = $1, resolved_at = now(), resolution_note = $2
      WHERE id = $3 OR (status = 'open' AND $4 AND ${sameTarget[0]})`,
    [caller.email, [outcome, note].filter(Boolean).join(' — '), report.id, action !== 'dismiss', ...sameTarget[1]]);

  return reply.send({ success: true, outcome });
}
