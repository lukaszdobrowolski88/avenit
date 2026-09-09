// Admin: zatwierdź oczekujące konto rejestracji (tryb „za zgodą administratora").
// Aktywuje konto (status=active, is_active=true) i wysyła e-mail powitalny.
// Bramka SERWEROWA i autorytatywna — rola z żywej bazy (is_super_admin lub app_roles.is_admin).
import { config } from '../config.js';

export const name = 'approve-user';
export const isPublic = false;

export default async function handler(req, reply) {
  // 1. Uprawnienia wywołującego (z bazy tenanta, nie z JWT).
  const { rows: me } = await req.db.query(
    `SELECT u.is_super_admin, COALESCE(r.is_admin, false) AS role_admin
       FROM app_users u LEFT JOIN app_roles r ON u.role = r.key
      WHERE u.id = $1`,
    [req.user.id]
  );
  const caller = me[0];
  if (!caller || !(caller.is_super_admin || caller.role_admin)) {
    return reply.code(403).send({ error: 'Brak uprawnień do zatwierdzania kont.' });
  }

  // 2. Aktywacja oczekującego konta.
  const userId = String(req.body?.userId || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
  const { rows } = await req.db.query(
    `UPDATE app_users SET status = 'active', is_active = true, pending_kind = NULL
      WHERE id = $1 AND status = 'pending'
      RETURNING email, full_name`,
    [userId]
  );
  if (!rows[0]) return reply.code(404).send({ error: 'Nie znaleziono oczekującego konta.' });

  // 3. E-mail powitalny (nie blokuje odpowiedzi, jeśli poczta zawiedzie).
  const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
  const { sendWelcomeEmail } = await import('../lib/email.js');
  await sendWelcomeEmail(rows[0].email, { name: rows[0].full_name, loginUrl: base }).catch((err) =>
    req.log.error({ err }, 'welcome email failed')
  );
  req.log.info({ actor: req.user.email, target: rows[0].email }, 'admin approved user');
  return reply.send({ success: true, email: rows[0].email });
}
