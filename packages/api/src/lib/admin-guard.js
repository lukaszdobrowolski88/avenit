// Strażnik eskalacji uprawnień przy operacjach na kontach (audyt 2026-10, runda 3).
//
// isAdmin() z user-admin.js wpuszcza też osoby z samym action:settings:manage_users (bez roli
// administratora). Taka osoba NIE może:
//   • nadać roli administracyjnej (app_roles.is_admin) ani roli z uprawnieniem ustawień, którego
//     sama nie ma (manage_permissions / manage_roles / manage_users — także przez '*'),
//   • edytować, resetować hasła ani w inny sposób przejąć konta administratora albo konta
//     o szerszych uprawnieniach ustawień niż jej własne,
//   • zmieniać konfiguracji SSO (tylko administrator).
// Zachowanie dla administratorów (superadmin / rola is_admin) bez zmian.
import { loadGrants } from '../dataapi/registry.js';
import { can } from '@avenit/shared/src/permissions/resolve.js';

// Pełny administrator: aktywne konto superadmina albo roli is_admin.
export const isFullAdmin = (caller) => !!(caller && caller.is_active && (caller.is_super_admin || caller.role_admin));

// Uprawnienia, przez które konto może samo poszerzyć swoją władzę.
export const SENSITIVE_CAPS = [
  'action:settings:manage_permissions',
  'action:settings:manage_roles',
  'action:settings:manage_users',
];

// Czy rola jest administracyjna (żywa baza, nie cache)?
export async function roleIsAdmin(db, role) {
  if (!role) return false;
  const { rows } = await db.query('SELECT COALESCE(is_admin, false) AS a FROM app_roles WHERE key = $1', [String(role)]);
  return rows[0]?.a === true;
}

// Czy podmiot { role, userId } ma więcej władzy administracyjnej niż wywołujący?
// grants/adminRoles — z loadGrants (przekazywane dla testów; domyślnie wczytywane).
export async function exceedsCaller(db, dbName, subject, caller, loaded) {
  const { grants, adminRoles } = loaded || await loadGrants(db, dbName);
  if (subject.role && adminRoles.has(subject.role)) return true;
  if (grants === null) return false; // legacy — brak szczegółowych uprawnień
  const callerSubject = { role: caller.role, userId: caller.id };
  const subj = { role: subject.role || null, userId: subject.userId || null };
  return SENSITIVE_CAPS.some((cap) => can(grants, subj, cap) && !can(grants, callerSubject, cap));
}

// Kontrola zmiany konta przez NIE-administratora. Zwraca komunikat odmowy albo null.
//   target  — { id, role, is_super_admin, role_admin }
//   newRole — rola po zmianie (albo undefined, gdy rola się nie zmienia)
export async function accountChangeDenied(db, dbName, caller, target, { newRole } = {}, loaded) {
  if (isFullAdmin(caller)) return null;
  const targetAdmin = target.is_super_admin || target.role_admin || await roleIsAdmin(db, target.role);
  if (targetAdmin) return 'Tylko administrator może zmieniać konto administratora.';
  if (target.id !== caller.id && await exceedsCaller(db, dbName, { role: target.role, userId: target.id }, caller, loaded)) {
    return 'Nie możesz zmieniać konta z szerszymi uprawnieniami niż Twoje.';
  }
  if (newRole !== undefined && newRole !== target.role) {
    if (await roleIsAdmin(db, newRole)) return 'Tylko administrator może nadać rolę administratora.';
    if (await exceedsCaller(db, dbName, { role: newRole, userId: null }, caller, loaded)) {
      return 'Nie możesz nadać roli z uprawnieniami, których sam nie masz.';
    }
  }
  return null;
}
