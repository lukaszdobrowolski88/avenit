// Blokada konta po nieudanych próbach logowania (anty-brute-force, próg 5 / 15 min) — wspólna dla
// logowania na subdomenie (/api/auth/login) i globalnego (/api/app-login; do audytu 2026-10,
// runda 4, globalne logowanie blokady nie sprawdzało ani nie liczyło prób).
export const LOCK_THRESHOLD = 5;

export const isLocked = (user) => !!user?.locked_until && new Date(user.locked_until).getTime() > Date.now();

// Nieudana próba (złe hasło albo zły kod 2FA): licznik +1, przy progu — blokada na 15 minut.
export async function registerFailedLogin(db, user) {
  const count = (user.failed_login_count || 0) + 1;
  if (count >= LOCK_THRESHOLD) {
    await db.query(`UPDATE app_users SET failed_login_count = 0, locked_until = now() + interval '15 minutes' WHERE id = $1`, [user.id]);
  } else {
    await db.query(`UPDATE app_users SET failed_login_count = $1 WHERE id = $2`, [count, user.id]);
  }
}

export async function registerSuccessfulLogin(db, user) {
  await db.query(
    `UPDATE app_users SET last_login_at = now(), failed_login_count = 0, locked_until = NULL WHERE id = $1`,
    [user.id]
  );
}
