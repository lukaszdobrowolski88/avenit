// Przelewy24 — wspólne helpery (suma kontrolna SHA-384, adres API, podpis powiadomienia,
// adresy zwrotne). Używane przez przelewy24-create-payment, giving-create-payment i webhook.
import crypto from 'node:crypto';
import { config } from '../config.js';

export const P24_API_URL =
  config.P24_SANDBOX === 'true' ? 'https://sandbox.przelewy24.pl' : 'https://secure.przelewy24.pl';

// P24 liczy SHA-384 z JSON-a { ...pola, crc } — kolejność pól jak w oryginale.
export function p24Checksum(data) {
  const stringToHash = JSON.stringify({ ...data, crc: config.P24_CRC });
  return crypto.createHash('sha384').update(stringToHash, 'utf8').digest('hex');
}

export function p24AuthHeader() {
  const posId = config.P24_POS_ID || config.P24_MERCHANT_ID;
  return 'Basic ' + Buffer.from(`${posId}:${config.P24_API_KEY}`).toString('base64');
}

// Bramka skonfigurowana? Bez CRC podpisy byłyby liczone z `undefined` (do podrobienia).
export const p24Configured = () => !!(config.P24_MERCHANT_ID && config.P24_CRC && config.P24_API_KEY);

const int = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : NaN;
};

// Podpis powiadomienia (urlStatus) wg dokumentacji P24 REST:
// sha384(JSON {merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement, crc}).
export function p24NotificationSign(b) {
  return p24Checksum({
    merchantId: int(b.merchantId),
    posId: int(b.posId),
    sessionId: String(b.sessionId ?? ''),
    amount: int(b.amount),
    originAmount: int(b.originAmount),
    currency: String(b.currency ?? ''),
    orderId: int(b.orderId),
    methodId: int(b.methodId),
    statement: String(b.statement ?? ''),
  });
}

// Czy powiadomienie naprawdę przyszło z P24 (podpis z naszym CRC)? Porównanie w stałym czasie.
export function verifyP24NotificationSign(b) {
  if (!config.P24_CRC || !b || typeof b.sign !== 'string' || !/^[0-9a-f]{96}$/i.test(b.sign)) return false;
  const expected = Buffer.from(p24NotificationSign(b), 'hex');
  const got = Buffer.from(b.sign.toLowerCase(), 'hex');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// Domena tenanta (https://<subdomena>.<APP_DOMAIN>) — na nią kierujemy urlStatus, bo publiczne
// funkcje wymagają tenanta z hosta (api.<domena> to nie tenant → webhook dostawał 404).
export function tenantOrigin(tenant) {
  const proto = (config.PUBLIC_API_URL || '').startsWith('https') ? 'https' : 'http';
  return `${proto}://${tenant?.subdomain || tenant?.slug}.${config.APP_DOMAIN}`;
}

export const p24StatusUrl = (tenant) => `${tenantOrigin(tenant)}/api/fn/przelewy24-webhook`;

// Adres powrotu po płatności: tylko http(s) na hoście tenanta (bez otwartego przekierowania
// przez bramkę na obcą stronę). Względna ścieżka → doklejona do domeny tenanta.
export function safeReturnUrl(raw, tenant, fallbackPath) {
  const origin = tenantOrigin(tenant);
  const fallback = `${origin}${fallbackPath}`;
  if (!raw || typeof raw !== 'string' || raw.length > 1000) return fallback;
  try {
    const u = new URL(raw, origin);
    const allowed = new URL(origin);
    if (!['http:', 'https:'].includes(u.protocol) || u.host !== allowed.host) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

// Kwota w groszach z wejścia w złotych (np. 12.5) — skończona, od 1 zł do MAX.
export const MAX_PAYMENT_GROSZE = 10_000_000; // 100 000 zł
export function groszeFromPln(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const g = Math.round(n * 100);
  return g >= 100 && g <= MAX_PAYMENT_GROSZE ? g : null;
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Unikalny sessionId (P24: max 100 znaków) — zawsze generowany przez serwer.
export const newSessionId = (prefix) =>
  `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`.slice(0, 100);
