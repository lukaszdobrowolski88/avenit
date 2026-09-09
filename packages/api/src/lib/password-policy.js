// Polityka haseł tenanta (app_settings): minimalna długość + opcjonalna złożoność.
// Egzekwowana SERWEROWO w rejestracji, resecie, zmianie hasła i ustawianiu przez admina.
export async function getPasswordPolicy(db) {
  const { rows } = await db.query(
    `SELECT key, value FROM app_settings WHERE key IN ('password_min_length','password_require_complexity')`
  );
  const m = {};
  rows.forEach((r) => { m[r.key] = r.value; });
  const min = Math.min(64, Math.max(6, parseInt(m.password_min_length || '8', 10) || 8));
  return { min, complexity: (m.password_require_complexity || 'off') === 'on' };
}

// Zwraca komunikat błędu lub null, gdy hasło spełnia politykę.
export function checkPassword(pw, policy) {
  const s = String(pw || '');
  if (s.length < policy.min) return `Hasło musi mieć min. ${policy.min} znaków`;
  if (policy.complexity && (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/[0-9]/.test(s))) {
    return 'Hasło musi zawierać małą literę, wielką literę i cyfrę';
  }
  return null;
}

export async function validatePassword(db, pw) {
  return checkPassword(pw, await getPasswordPolicy(db));
}
