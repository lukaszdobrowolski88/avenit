// Komunikator: „kto zareagował” (web i mobilka).
//
// Reakcje (message_reactions) trafiają tylko do uczestników rozmowy (zakres serwera w
// packages/api/src/dataapi/komunikator.js), razem z e-mailem reagującego — tak jak w WhatsAppie
// każdy uczestnik widzi, kto zareagował. Imiona bierzemy z danych, które klient już ma (skład
// rozmowy / mapa członków); e-maila nie pokazujemy — gdy imienia brak, tylko część przed „@”.

const norm = (e) => String(e ?? '').trim().toLowerCase();

// Etykieta osoby bez imienia: część adresu przed „@” (nie cały e-mail).
export const fallbackName = (email) => {
  const s = String(email ?? '').trim();
  const at = s.indexOf('@');
  return (at > 0 ? s.slice(0, at) : s) || '?';
};

/**
 * Osoby, które dały reakcję: [{ email, name, me }] — bez powtórzeń (ten sam e-mail inną wielkością
 * liter), „ja” na początku, reszta w kolejności reakcji.
 * @param {string[]} emails  e-maile w kolejności dodania reakcji
 * @param {{ me?: string|null, nameOf?: (email: string) => string|null|undefined }} opts
 */
export function reactionPeople(emails, { me = null, nameOf } = {}) {
  const seen = new Set();
  const out = [];
  for (const email of emails || []) {
    const key = norm(email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const raw = nameOf ? nameOf(email) : null;
    // nameOf w webie zwraca e-mail, gdy nie zna osoby — wtedy też tylko część przed „@”.
    const name = raw && !String(raw).includes('@') ? String(raw) : fallbackName(email);
    out.push({ email, name, me: !!me && key === norm(me) });
  }
  const mine = out.filter((p) => p.me);
  return mine.length ? [...mine, ...out.filter((p) => !p.me)] : out;
}

/**
 * Podpis pigułki reakcji: „Ty, Olaf Karel i Mateusz Waciński”.
 * Najwyżej `max` imion, potem „i N innych” (gdy zostałaby jedna osoba — pokazujemy jej imię,
 * żeby nie pisać „i 1 innych”).
 * @param {{ name: string, me?: boolean }[]} people  wynik reactionPeople (ja już na początku)
 * @param {{ max?: number, meLabel?: string, and?: string, others?: (n: number) => string }} opts
 */
export function formatReactorNames(people, {
  max = 10,
  meLabel = 'Ty',
  and = 'i',
  others = (n) => `${n} innych`,
} = {}) {
  const names = (people || []).map((p) => (p.me ? meLabel : p.name)).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  const limit = Math.max(1, max);
  if (names.length > limit + 1) {
    return `${names.slice(0, limit).join(', ')} ${and} ${others(names.length - limit)}`;
  }
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

/**
 * Zakładki widoku „Reakcje”: najpierw emoji z największą liczbą osób (przy remisie — kolejność
 * pierwszej reakcji). Wejście: [{ emoji, users: string[] }] (agregaty web/mobilka).
 * Wynik: [{ emoji, people }] oraz łączna liczba osób-reakcji.
 */
export function reactionTabs(groups, opts = {}) {
  const tabs = (groups || [])
    .map((g, i) => ({ emoji: g.emoji, people: reactionPeople(g.users, opts), i }))
    .filter((t) => t.people.length > 0)
    .sort((a, b) => b.people.length - a.people.length || a.i - b.i)
    .map(({ emoji, people }) => ({ emoji, people }));
  return { tabs, total: tabs.reduce((n, t) => n + t.people.length, 0) };
}
