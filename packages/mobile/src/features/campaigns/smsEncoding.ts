// Liczenie znaków, części SMS i estymacja kosztu — port 1:1 z weba
// (src/modules/SmsCampaigns/utils/smsEncoding.js, mirror packages/api/src/lib/sms.js).
// Czysty TS bez React Native — testowany vitestem z korzenia repo (src/lib/mobileSmsEncoding.test.js).

// Domyślna cena za część SMS w PLN (przybliżenie SMSAPI 0.16-0.20 zł) — jak web constants.js.
export const PRICE_PER_PART = 0.16;
// Limit nadawcy alfanumerycznego w SMSAPI.
export const SENDER_MAX = 11;
// Soft limit treści (jak web).
export const SMS_BODY_MAX = 1530;

const GSM7_BASE =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '\f^{}\\[~]|€';
const GSM7_SET = new Set([...GSM7_BASE, ...GSM7_EXT]);

export type SmsEncoding = 'gsm7' | 'unicode';

export interface SmsAnalysis {
  encoding: SmsEncoding;
  parts: number;
  charCount: number;
  charsPerPart: number;
  remainingInPart: number;
}

export function detectEncoding(text: string | null | undefined): SmsEncoding {
  if (!text) return 'gsm7';
  for (const ch of text) {
    if (!GSM7_SET.has(ch)) return 'unicode';
  }
  return 'gsm7';
}

export function countParts(text: string | null | undefined, encoding: SmsEncoding): number {
  if (!text) return 0;
  let len = 0;
  if (encoding === 'gsm7') {
    for (const ch of text) {
      len += GSM7_EXT.includes(ch) ? 2 : 1;
    }
  } else {
    len = [...text].length;
  }
  const single = encoding === 'gsm7' ? 160 : 70;
  const multi = encoding === 'gsm7' ? 153 : 67;
  if (len <= single) return 1;
  return Math.ceil(len / multi);
}

export function smsAnalysis(text: string): SmsAnalysis {
  const encoding = detectEncoding(text);
  const parts = countParts(text, encoding);
  const charCount = [...text].length;
  const charsPerPart = encoding === 'gsm7' ? (parts > 1 ? 153 : 160) : parts > 1 ? 67 : 70;
  const remainingInPart = parts === 0 ? charsPerPart : charsPerPart * parts - charCount;
  return { encoding, parts, charCount, charsPerPart, remainingInPart };
}

export function estimateCost(text: string, recipients: number, pricePerPart = PRICE_PER_PART): number {
  const { parts } = smsAnalysis(text);
  return parts * recipients * pricePerPart;
}

// Kwota w PLN jak Intl pl-PL na webie („1,23 zł”, „12 345,67 zł”) — bez Intl (Hermes różnie
// go wspiera). Polska grupuje tysiące dopiero od 10 000 (minimumGroupingDigits = 2).
export function formatPLN(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const negative = value < 0;
  const [int, frac] = Math.abs(value).toFixed(2).split('.');
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : int;
  return `${negative ? '-' : ''}${grouped},${frac} zł`;
}

// „1 część”, „2 części”, „5 części” — jak web (część / części).
export const partsLabel = (n: number) => `${n} ${n === 1 ? 'część' : 'części'}`;
