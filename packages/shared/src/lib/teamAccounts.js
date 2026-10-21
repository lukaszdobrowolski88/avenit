// Konta w aplikacji osób ze składu Tłumaczeń (fn tlumaczenia-accounts, api interpretation/team.js
// rosterAccounts) — wspólne dla weba (TlumaczeniaModule → Członkowie) i aplikacji (skład zespołu).
// Konto jest potrzebne do tłumaczenia na żywo (konsola tłumacza, wybór tłumacza w karcie).
// Teksty po polsku — web tłumaczy je przez tr() (klucze w src/i18n/translations.js).

export const ACCOUNTS_FN = 'tlumaczenia-accounts';
export const ACCOUNTS_TEAM = 'tlumaczenia';

export const ACCOUNT_BADGES = {
  none: {
    label: 'Brak konta w aplikacji',
    hint: 'Bez konta nie może tłumaczyć na żywo. Zaproś do aplikacji — konto z tym samym e-mailem połączy się samo.',
  },
  inactive: {
    label: 'Konto nieaktywne',
    hint: 'Konto w aplikacji jest wyłączone albo czeka na zatwierdzenie — bez aktywnego konta nie może tłumaczyć na żywo.',
  },
};

// Odpowiedź fn → Map(id osoby ze składu → 'active' | 'inactive' | 'none').
export function accountsById(resp) {
  const out = new Map();
  if (!resp || resp.available === false) return out;
  for (const m of resp.members || []) {
    if (m && m.id != null && (m.account === 'active' || m.account === 'inactive' || m.account === 'none')) out.set(String(m.id), m.account);
  }
  return out;
}

// Oznaczenie osoby: null (ma aktywne konto, stan nieznany albo osoba nieaktywna w zespole —
// i tak nie tłumaczy) albo { kind, label, hint }.
export function accountBadge(account, { active = true } = {}) {
  if (!active) return null;
  const b = ACCOUNT_BADGES[account];
  return b ? { kind: account, ...b } : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Czy pokazać „Zaproś do aplikacji”: brak konta, osoba ma poprawny e-mail, a oglądający zakłada konta.
export function canInvite(badge, email, allowed) {
  return !!allowed && badge?.kind === 'none' && EMAIL_RE.test(String(email || '').trim());
}
