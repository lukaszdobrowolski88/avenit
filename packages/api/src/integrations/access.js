// Kto może co w integracjach Google Workspace / Microsoft 365 (żywa baza, nie JWT):
//   • łączenie / rozłączanie / ustawienia / podgląd — action:settings:manage_integrations,
//   • zastosowanie synchronizacji (zakładanie, wiązanie, blokowanie kont) i włączenie synchronizacji
//     automatycznej — DODATKOWO action:settings:manage_users,
//   • własna aplikacja OAuth (client id + sekret) — tylko pełny administrator (jak konfiguracja SSO).
// Administrator (superadmin / rola is_admin) może wszystko. Tryb legacy (brak permission_grants) —
// tylko pełny administrator (requireCapability w legacy przepuszcza każdego zalogowanego).
import { loadGrants } from '../dataapi/registry.js';
import { can } from '@avenit/shared/src/permissions/resolve.js';
import { isFullAdmin } from '../lib/admin-guard.js';

export async function integrationCaller(db, userId, dbName) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.is_active, COALESCE(u.is_super_admin, false) AS is_super_admin,
            COALESCE(r.is_admin, false) AS role_admin
       FROM app_users u LEFT JOIN app_roles r ON r.key = u.role WHERE u.id = $1`, [userId]);
  const caller = rows[0] || null;
  if (!caller || !caller.is_active) return { caller, fullAdmin: false, canIntegrations: false, canUsers: false };
  const fullAdmin = isFullAdmin(caller);
  if (fullAdmin) return { caller, fullAdmin, canIntegrations: true, canUsers: true };
  const { grants, adminRoles } = await loadGrants(db, dbName);
  if (adminRoles.has(caller.role)) return { caller, fullAdmin: false, canIntegrations: true, canUsers: true };
  if (grants === null) return { caller, fullAdmin: false, canIntegrations: false, canUsers: false };
  const subj = { role: caller.role, userId: caller.id };
  return {
    caller, fullAdmin: false,
    canIntegrations: can(grants, subj, 'action:settings:manage_integrations'),
    canUsers: can(grants, subj, 'action:settings:manage_users'),
  };
}
