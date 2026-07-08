// Przelewy24 — wspólne helpery (suma kontrolna SHA-384, adres API).
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
