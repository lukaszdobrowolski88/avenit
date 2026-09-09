// Wspólne bramki i strażnicy dla adminowych operacji na kontach (fn/*).
// Rola z ŻYWEJ bazy (is_super_admin lub app_roles.is_admin) — nie ufamy JWT.

export async function getCaller(db, userId) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.is_super_admin, COALESCE(r.is_admin, false) AS role_admin
       FROM app_users u LEFT JOIN app_roles r ON u.role = r.key WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

export const isAdmin = (caller) => !!(caller && (caller.is_super_admin || caller.role_admin));

export async function loadTarget(db, id) {
  const { rows } = await db.query(
    'SELECT id, email, full_name, is_super_admin, is_active, role FROM app_users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

// Czy target jest jedynym AKTYWNYM administratorem (superadmin lub rola is_admin)?
// Zapobiega pozostawieniu organizacji bez admina przy usunięciu/blokadzie/zmianie roli.
export async function isLastActiveAdmin(db, targetId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM app_users u LEFT JOIN app_roles r ON u.role = r.key
       WHERE u.is_active = true AND (u.is_super_admin = true OR r.is_admin = true) AND u.id <> $1`,
    [targetId]
  );
  return rows[0].n === 0;
}

// Rewokacja wszystkich aktywnych sesji użytkownika (natychmiastowe wylogowanie).
export async function revokeSessions(db, userId) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  ).catch(() => { /* tabela/kolumna może się różnić — nie blokuj operacji */ });
}
