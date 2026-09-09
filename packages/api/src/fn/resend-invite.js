// Admin: ponów zaproszenie — nowy token 7-dniowy + e-mail „ustaw hasło".
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getCaller, isAdmin, loadTarget } from '../lib/user-admin.js';

export const name = 'resend-invite';
export const isPublic = false;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });
  const userId = String(req.body?.userId || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
  const target = await loadTarget(req.db, userId);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });

  const raw = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  await req.db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
    [userId, tokenHash]
  );
  await req.db.query('UPDATE app_users SET invited_at = now() WHERE id = $1', [userId]);

  const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
  const { sendInviteEmail } = await import('../lib/email.js');
  await sendInviteEmail(target.email, { name: target.full_name, link: `${base}/reset-password?token=${raw}` }).catch((err) =>
    req.log.error({ err }, 'resend invite failed')
  );
  return reply.send({ success: true });
}
