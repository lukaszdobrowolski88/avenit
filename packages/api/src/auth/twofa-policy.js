// Polityka wymogu 2FA — JEDNO miejsce liczenia flagi n2fa (konto musi skonfigurować 2FA,
// zanim zobaczy dane; egzekwuje plugins/context.js → block2FAPending).
//
// Źródła wymogu (dowolne wystarcza), o ile konto NIE ma jeszcze włączonego 2FA:
//   • app_users.totp_required        — wymóg nałożony na konkretne konto przez administratora,
//   • app_settings require_2fa_all   — 'on' = wszyscy,
//   • app_settings require_2fa_admins — 'on' = administratorzy (is_super_admin lub rola z app_roles.is_admin).
// Ustawienia edytuje Ustawienia → Bezpieczeństwo i logowanie.
export async function needs2faSetup(db, user) {
  if (!user || user.totp_enabled) return false;
  if (user.totp_required) return true;

  const { rows } = await db.query(
    `SELECT key, value FROM app_settings WHERE key IN ('require_2fa_all', 'require_2fa_admins')`
  );
  const m = {};
  for (const r of rows) m[r.key] = r.value;
  if (m.require_2fa_all === 'on') return true;
  if (m.require_2fa_admins !== 'on') return false;

  if (user.is_super_admin === true) return true;
  if (!user.role) return false;
  const { rows: roleRows } = await db.query(`SELECT is_admin FROM app_roles WHERE key = $1`, [user.role]);
  return roleRows[0]?.is_admin === true;
}
