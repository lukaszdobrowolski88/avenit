// Wspólne (web + mobilka) reguły kampanii push/SMS: domyślna nazwa i podpis autora.
//
// Nazwa kampanii jest opcjonalna — wcześniej edytory wymagały osobnego pola „Nazwa kampanii”
// i bez niego kończyły się krótkim toastem, a kampania nie zapisywała się wcale („zniknęła”).
// Teraz: wpisana nazwa → (push) tytuł / (SMS) początek treści → „Kampania DD.MM.YYYY HH:mm”.

const SMS_NAME_MAX = 40;

const pad = (n) => String(n).padStart(2, '0');

// „Kampania 20.10.2026 09:05” — czas lokalny urządzenia.
export function campaignDateName(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return `Kampania ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Początek treści SMS-a w jednej linii (białe znaki zwinięte), max ~40 znaków.
export function smsBodySnippet(body, max = SMS_NAME_MAX) {
  const line = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max).trimEnd()}…`;
}

// Nazwa do zapisu: { kind: 'push' | 'sms', name, title, body }.
export function campaignFallbackName({ kind, name, title, body } = {}, now = new Date()) {
  const own = String(name ?? '').trim();
  if (own) return own;
  const derived = kind === 'sms' ? smsBodySnippet(body) : String(title ?? '').replace(/\s+/g, ' ').trim();
  return derived || campaignDateName(now);
}

// Mapa e-mail (małymi literami) → imię i nazwisko z wierszy app_users (email, full_name, name).
export function buildUserNameMap(rows) {
  const map = {};
  for (const u of rows || []) {
    if (!u || !u.email) continue;
    const label = String(u.full_name || u.name || '').trim();
    if (label) map[String(u.email).trim().toLowerCase()] = label;
  }
  return map;
}

// Podpis osoby po e-mailu (created_by) — bez względu na wielkość liter; brak w mapie → część
// adresu przed „@”. Pusty e-mail → ''.
export function userLabel(email, map) {
  const e = String(email ?? '').trim();
  if (!e) return '';
  const hit = map ? map[e.toLowerCase()] : null;
  return hit || e.split('@')[0];
}
