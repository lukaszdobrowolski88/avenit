// Poranny skrót zadań — wspólne reguły ustawień (serwer: fn task-digest; web: Ustawienia i profil).
//   • organizacja: app_settings 'task_digest' = tekst JSON {"enabled": bool, "overdue_days": 0–90}
//     (domyślnie włączony, 14 dni wstecz);
//   • osoba: 'task_digest' w push_user_preferences.category_opt_outs (wtedy ani e-mail, ani push).

export const DIGEST_DEFAULTS = Object.freeze({ enabled: true, overdue_days: 14 });
export const OPT_OUT_CATEGORY = 'task_digest';
export const MAX_OVERDUE_DAYS = 90;

export function clampOverdueDays(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MAX_OVERDUE_DAYS, Math.max(0, Math.round(n))) : DIGEST_DEFAULTS.overdue_days;
}

// app_settings.task_digest (tekst JSON, obiekt albo 'true'/'false') → { enabled, overdue_days }.
export function digestConfig(raw) {
  let c = raw;
  if (typeof c === 'string') {
    const s = c.trim().toLowerCase();
    if (s === 'false' || s === 'off' || s === '0') return { ...DIGEST_DEFAULTS, enabled: false };
    if (s === 'true' || s === 'on' || s === '1') return { ...DIGEST_DEFAULTS };
    try { c = JSON.parse(c); } catch { c = null; }
  }
  if (c === false) return { ...DIGEST_DEFAULTS, enabled: false };
  if (!c || typeof c !== 'object' || Array.isArray(c)) c = {};
  const enabled = c.enabled === false || c.enabled === 'false' ? false : DIGEST_DEFAULTS.enabled;
  const overdue = c.overdue_days === undefined || c.overdue_days === null || c.overdue_days === ''
    ? DIGEST_DEFAULTS.overdue_days
    : clampOverdueDays(c.overdue_days);
  return { enabled, overdue_days: overdue };
}

// Zapis do app_settings (kolumna value = tekst).
export function serializeDigestConfig(cfg) {
  const c = digestConfig(cfg || {});
  return JSON.stringify({ enabled: c.enabled, overdue_days: c.overdue_days });
}

// Lista rezygnacji z kategorii → czy osoba zrezygnowała ze skrótu.
export function isDigestOptedOut(optOuts) {
  return Array.isArray(optOuts) && optOuts.includes(OPT_OUT_CATEGORY);
}

// Nowa lista rezygnacji po przełączeniu (zachowuje inne kategorie, bez duplikatów).
export function withDigestOptOut(optOuts, optedOut) {
  const rest = (Array.isArray(optOuts) ? optOuts : []).filter((c) => c && c !== OPT_OUT_CATEGORY);
  return optedOut ? [...new Set(rest), OPT_OUT_CATEGORY] : [...new Set(rest)];
}
