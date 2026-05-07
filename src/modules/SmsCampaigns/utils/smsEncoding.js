// Liczenie znaków, części SMS i estymacja kosztu — wersja browser/JS.
// Mirror logiki z supabase/functions/_shared/sms.ts (kopia, bo Vite vs Deno bez bundlera).

import { PRICE_PER_PART } from '../constants';

const GSM7_BASE =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '\f^{}\\[~]|€';
const GSM7_SET = new Set([...GSM7_BASE, ...GSM7_EXT]);

export function detectEncoding(text) {
  if (!text) return 'gsm7';
  for (const ch of text) {
    if (!GSM7_SET.has(ch)) return 'unicode';
  }
  return 'gsm7';
}

export function countParts(text, encoding) {
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

export function smsAnalysis(text) {
  const encoding = detectEncoding(text);
  const parts = countParts(text, encoding);
  const charCount = [...text].length;
  const charsPerPart = encoding === 'gsm7' ? (parts > 1 ? 153 : 160) : (parts > 1 ? 67 : 70);
  const remainingInPart = parts === 0 ? charsPerPart : charsPerPart * parts - charCount;
  return { encoding, parts, charCount, charsPerPart, remainingInPart };
}

export function estimateCost(text, recipients, pricePerPart = PRICE_PER_PART) {
  const { parts } = smsAnalysis(text);
  return parts * recipients * pricePerPart;
}

export function formatPLN(value) {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value);
}
