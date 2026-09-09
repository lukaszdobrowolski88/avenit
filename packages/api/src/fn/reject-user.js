// Admin: odrzuć oczekujące zgłoszenie rejestracji (usuwa konto pending + wpis do audytu).
export const name = 'reject-user';
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
  const { rows } = await req.db.query(
    `DELETE FROM app_users WHERE id = $1 AND status = 'pending' RETURNING email`,
    [userId]
  );
  if (!rows[0]) return reply.code(404).send({ error: 'Nie znaleziono oczekującego konta.' });
  const { logAccountEvent } = await import('../lib/account-audit.js');
  await logAccountEvent(req.db, { email: rows[0].email, action: 'rejected', actor: req.user.email });
  return reply.send({ success: true });
}
