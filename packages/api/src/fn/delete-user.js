// Admin: usuń użytkownika — bezpiecznie. Rewokacja sesji + sprzątanie referencji + guardy
// (nie usuń siebie, superadmina bez uprawnień, ani ostatniego administratora) + audyt.
import { getCaller, isAdmin, loadTarget, isLastActiveAdmin, revokeSessions } from '../lib/user-admin.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'delete-user';
export const isPublic = false;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });

  const userId = String(req.body?.userId || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
  if (userId === req.user.id) return reply.code(400).send({ error: 'Nie możesz usunąć własnego konta.' });

  const target = await loadTarget(req.db, userId);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });
  if (target.is_super_admin && !caller.is_super_admin) {
    return reply.code(403).send({ error: 'Tylko super-administrator może usunąć super-administratora.' });
  }
  if (await isLastActiveAdmin(req.db, userId)) {
    return reply.code(400).send({ error: 'To ostatni aktywny administrator — nie można usunąć.' });
  }

  // Sprzątanie: sesje, nadpisania uprawnień, tokeny resetu. (ministry_memberships kaskaduje FK,
  // linki *_team.user_id mają ON DELETE SET NULL.)
  await revokeSessions(req.db, userId);
  await req.db.query('DELETE FROM permission_grants WHERE user_id = $1', [userId]).catch(() => {});
  await req.db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]).catch(() => {});
  await req.db.query('DELETE FROM app_users WHERE id = $1', [userId]);

  await logAccountEvent(req.db, { email: target.email, action: 'deleted', actor: caller.email });
  req.log.info({ actor: caller.email, target: target.email }, 'admin deleted user');
  return reply.send({ success: true });
}
