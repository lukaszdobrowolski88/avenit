// Admin: zresetuj 2FA użytkownika (utrata urządzenia). Czyści sekret/kody, wyłącza TOTP.
// Jeśli totp_required=true, user skonfiguruje 2FA od nowa przy kolejnym logowaniu.
import { getCaller, isAdmin, loadTarget } from '../lib/user-admin.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'admin-reset-2fa';
export const isPublic = false;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id, req.tenant.db_name);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });

  const userId = String(req.body?.userId || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });

  const target = await loadTarget(req.db, userId);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });
  if (target.is_super_admin && !caller.is_super_admin) {
    return reply.code(403).send({ error: 'Tylko super-administrator może zresetować 2FA super-administratorowi.' });
  }

  await req.db.query(
    `UPDATE app_users SET totp_enabled = false, totp_secret = NULL,
            totp_backup_codes = NULL, totp_verified_at = NULL WHERE id = $1`,
    [userId]
  );
  await logAccountEvent(req.db, { email: target.email, action: 'reset_2fa', actor: caller.email });
  const { notifyAccountChange } = await import('../lib/account-notify.js');
  await notifyAccountChange(req.db, {
    email: target.email, name: target.full_name,
    subject: 'Zresetowano 2FA — Avenit',
    intro: 'Dwuetapowa weryfikacja (2FA) na Twoim koncie została zresetowana. Skonfigurujesz ją ponownie przy kolejnym logowaniu.',
  });
  req.log.info({ actor: caller.email, target: target.email }, 'admin reset 2fa');
  return reply.send({ success: true });
}
