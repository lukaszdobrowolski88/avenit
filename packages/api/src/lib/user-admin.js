// Wspólne bramki i strażnicy dla adminowych operacji na kontach (fn/*).
// Autoryzacja z ŻYWEJ bazy (nie z JWT): superadmin/is_admin LUB UPRAWNIENIE action:settings:manage_users
// (spójnie z zapisem app_users przez /api/db). Dzięki temu role o pełnych grantach (np. rada_starszych
// z `*`) też zarządzają kontami, mimo że mają is_admin=false.
import { loadGrants } from '../dataapi/registry.js';
import { can } from '@avenit/shared/src/permissions/resolve.js';

export async function getCaller(db, userId, dbName) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.is_active, u.is_super_admin, u.role, COALESCE(r.is_admin, false) AS role_admin
       FROM app_users u LEFT JOIN app_roles r ON u.role = r.key WHERE u.id = $1`,
    [userId]
  );
  const caller = rows[0] || null;
  if (caller && dbName) {
    try {
      const { grants, adminRoles } = await loadGrants(db, dbName);
      caller.canManage = adminRoles.has(caller.role) || (grants !== null && can(grants, { role: caller.role, userId }, 'action:settings:manage_users'));
    } catch { caller.canManage = false; }
  }
  return caller;
}

// Uprawnienia admina wymagają AKTYWNEGO konta (zablokowany admin traci moc natychmiast, mimo
// ważnego access tokena do ~15 min). Admin = superadmin / rola is_admin / uprawnienie manage_users.
export const isAdmin = (caller) => !!(caller && caller.is_active && (caller.is_super_admin || caller.role_admin || caller.canManage));

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
