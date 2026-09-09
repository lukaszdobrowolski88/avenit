// Admin: zablokuj / odblokuj użytkownika. Synchronizuje is_active + status; przy blokadzie
// rewokuje sesje (natychmiastowe wylogowanie). Guardy: nie zablokuj siebie ani ostatniego admina.
import { getCaller, isAdmin, loadTarget, isLastActiveAdmin, revokeSessions } from '../lib/user-admin.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'set-user-status';
export const isPublic = false;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });

  const userId = String(req.body?.userId || '');
  const active = req.body?.active === true; // docelowy stan: true = aktywny, false = zablokowany
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });

  const target = await loadTarget(req.db, userId);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });

  if (!active) {
    // Blokada — zabezpieczenia.
    if (userId === req.user.id) return reply.code(400).send({ error: 'Nie możesz zablokować własnego konta.' });
    if (target.is_super_admin && !caller.is_super_admin) {
      return reply.code(403).send({ error: 'Tylko super-administrator może zablokować super-administratora.' });
    }
    if (await isLastActiveAdmin(req.db, userId)) {
      return reply.code(400).send({ error: 'To ostatni aktywny administrator — nie można zablokować.' });
    }
  }

  // Aktywacja zeruje też blokadę anty-brute-force (locked_until / licznik nieudanych logowań).
  await req.db.query(
    `UPDATE app_users SET is_active = $1, status = $2, pending_kind = NULL,
            failed_login_count = CASE WHEN $1 THEN 0 ELSE failed_login_count END,
            locked_until = CASE WHEN $1 THEN NULL ELSE locked_until END
       WHERE id = $3`,
    [active, active ? 'active' : 'blocked', userId]
  );
  if (!active) await revokeSessions(req.db, userId);

  await logAccountEvent(req.db, { email: target.email, action: active ? 'unblocked' : 'blocked', actor: caller.email });
  return reply.send({ success: true, active });
}
