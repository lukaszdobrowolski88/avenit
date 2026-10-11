// Sekrety w app_settings (np. sso_google_client_secret_enc) — tabela jest czytana przez /api/db
// przez każdego zalogowanego (wygląd, moduły, tryb rejestracji), ale sekrety integracji czyta
// i zapisuje wyłącznie serwer (lib/sso.js, fn sso-save-config). Do audytu 2026-10 (runda 4)
// zaszyfrowany sekret SSO wychodził do każdego członka.

const SECRET_KEY_RE = /(_secret|_secret_enc|_password|_password_enc|_token|_api_key)$/;

export const isSecretSetting = (key) => SECRET_KEY_RE.test(String(key ?? ''));

// Zakres SELECT (q.__ownerScope) — wiersze bez sekretów, dla każdego (także admina).
export function settingsSecretScope() {
  return {
    select: (alias) => `${alias}."key" !~ '(_secret|_secret_enc|_password|_password_enc|_token|_api_key)$'`,
  };
}
