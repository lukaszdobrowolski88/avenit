// Admin: wyloguj użytkownika ze wszystkich urządzeń (rewokacja wszystkich sesji) + audyt.
import { getCaller, isAdmin, loadTarget, revokeSessions } from '../lib/user-admin.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'force-logout-user';
export const isPublic = false;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });
  const userId = String(req.body?.userId || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
  const target = await loadTarget(req.db, userId);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });

  await revokeSessions(req.db, userId);
  await logAccountEvent(req.db, { email: target.email, action: 'logged_out', actor: caller.email });
  return reply.send({ success: true });
}
