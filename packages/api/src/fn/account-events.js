// Admin: ostatnie zdarzenia kont (audyt rejestracji/zatwierdzeń) z account_events (migracja 028).
// Admin-gated; odporny na brak tabeli (zwraca pustą listę przed migracją).
export const name = 'account-events';
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
  try {
    const { rows } = await req.db.query(
      `SELECT email, action, actor, detail, created_at
         FROM account_events ORDER BY created_at DESC LIMIT 40`
    );
    return reply.send({ events: rows });
  } catch {
    return reply.send({ events: [] });
  }
}
