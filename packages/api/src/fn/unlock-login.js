// Admin: zdejmij TYLKO czasową blokadę logowania (anty-brute-force). Nie zmienia is_active/status,
// więc nie odblokowuje celowo zablokowanego konta — czyści jedynie licznik prób i locked_until.
import { getCaller, isAdmin, loadTarget } from '../lib/user-admin.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'unlock-login';
export const isPublic = false;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id, req.tenant.db_name);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });
  const userId = String(req.body?.userId || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
  const target = await loadTarget(req.db, userId);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });

  await req.db.query('UPDATE app_users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [userId]);
  await logAccountEvent(req.db, { email: target.email, action: 'unlocked_login', actor: caller.email });
  return reply.send({ success: true });
}
