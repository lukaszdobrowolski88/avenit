// Admin: wyślij ponownie link potwierdzający e-mail dla konta oczekującego (tryb otwarty).
import crypto from 'node:crypto';
import { config } from '../config.js';

export const name = 'resend-verification';
export const isPublic = false;

export default async function handler(req, reply) {
  const { rows: me } = await req.db.query(
    `SELECT u.is_super_admin, COALESCE(r.is_admin, false) AS role_admin
       FROM app_users u LEFT JOIN app_roles r ON u.role = r.key WHERE u.id = $1`,
    [req.user.id]
  );
  const caller = me[0];
  if (!caller || !(caller.is_super_admin || caller.role_admin)) {
    return reply.code(403).send({ error: 'Brak uprawnień.' });
  }
  const userId = String(req.body?.userId || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });

  const raw = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const { rows } = await req.db.query(
    `UPDATE app_users SET verify_token_hash = $1, verify_expires = now() + interval '24 hours'
      WHERE id = $2 AND status = 'pending' AND pending_kind = 'email'
      RETURNING email`,
    [tokenHash, userId]
  );
  if (!rows[0]) return reply.code(404).send({ error: 'Konto nie oczekuje na potwierdzenie e-mail.' });

  const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
  const { sendVerifyEmail } = await import('../lib/email.js');
  await sendVerifyEmail(rows[0].email, `${base}/api/auth/verify-email?token=${raw}`).catch((err) =>
    req.log.error({ err }, 'resend verify email failed')
  );
  return reply.send({ success: true });
}
