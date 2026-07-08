// Wspólne helpery SMS (send-sms, sms-campaign-dispatch, sms-campaign-receipts,
// sms-incoming-webhook). Port: supabase/functions/_shared/sms.ts.
import { config } from '../config.js';

export const SMSAPI_DEFAULT_URL = 'https://api.smsapi.pl';

/**
 * Wczytuje konfigurację SMSAPI z tabeli `integration_settings` (priorytet)
 * w bazie TENANTA, z fallbackiem na zmienne ENV (config.*). Pozwala adminowi
 * zmieniać klucze w UI bez redeploya.
 */
export async function getSmsConfig(pool) {
  let rows = [];
  try {
    const res = await pool.query(
      `SELECT key, value FROM integration_settings
        WHERE key = ANY($1::text[])`,
      [['smsapi_token', 'smsapi_default_sender', 'smsapi_api_url', 'smsapi_webhook_secret']]
    );
    rows = res.rows || [];
  } catch (err) {
    console.warn('getSmsConfig: integration_settings read failed, using ENV only:', err.message);
  }

  const dbMap = new Map(rows.map((r) => [r.key, r.value]));
  const pick = (k, envValue) => {
    const v = dbMap.get(k);
    if (v && String(v).trim()) return String(v).trim();
    return envValue || null;
  };

  return {
    token: pick('smsapi_token', config.SMSAPI_TOKEN),
    defaultSender: pick('smsapi_default_sender', config.SMSAPI_DEFAULT_SENDER) || 'INFO',
    apiUrl: pick('smsapi_api_url', config.SMSAPI_API_URL) || SMSAPI_DEFAULT_URL,
    webhookSecret: pick('smsapi_webhook_secret', config.SMSAPI_WEBHOOK_SECRET),
  };
}

/**
 * Normalizacja numeru telefonu do formatu E.164 polski (48xxxxxxxxx).
 * Zwraca null jeśli numer jest niepoprawny.
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-()+]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.length === 9 && /^\d{9}$/.test(p)) p = '48' + p;
  if (!/^48\d{9}$/.test(p)) return null;
  return p;
}

/**
 * Wykrywa kodowanie SMS: gsm7 (160 chars/część) vs unicode (70 chars/część).
 * Polskie znaki diakrytyczne wymuszają unicode.
 */
const GSM7_BASE =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = '\f^{}\\[~]|€';
const GSM7_SET = new Set([...GSM7_BASE, ...GSM7_EXT]);

export function detectEncoding(text) {
  if (!text) return 'gsm7';
  for (const ch of text) {
    if (!GSM7_SET.has(ch)) return 'unicode';
  }
  return 'gsm7';
}

/**
 * Liczy ilość części SMS-a dla danego tekstu i kodowania.
 *  - GSM-7: 160 chars (1), 153 chars (2+) (jeden part rezerwuje 7 bitów na header concat).
 *  - Unicode: 70 chars (1), 67 chars (2+).
 */
export function countParts(text, encoding) {
  if (!text) return 0;
  // Znaki rozszerzone GSM-7 liczą się podwójnie.
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

/**
 * Wywołuje SMSAPI POST /sms.do dla pojedynczego numeru.
 * Zwraca {ok, smsapi_id, points, error, parts}.
 */
export async function sendSmsViaSmsapi(opts) {
  const apiUrl = opts.apiUrl || SMSAPI_DEFAULT_URL;
  const url = `${apiUrl}/sms.do`;

  const params = new URLSearchParams();
  params.set('to', opts.phone);
  params.set('message', opts.message);
  params.set('from', opts.sender);
  params.set('format', 'json');
  params.set('encoding', 'utf-8');
  if (opts.fast) params.set('fast', '1');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json?.error) {
      return {
        ok: false,
        error: json?.message || json?.error || `HTTP ${res.status}`,
        raw: json,
      };
    }

    const item = Array.isArray(json?.list) ? json.list[0] : null;
    if (!item) return { ok: false, error: 'empty response', raw: json };

    return {
      ok: true,
      smsapi_id: String(item.id),
      points: Number(item.points) || 0,
      parts: Number(item.parts) || undefined,
      raw: json,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Pobiera statusy doręczenia z SMSAPI dla listy ID-ów.
 * Endpoint: GET /sms.do?ids=...&status=1
 */
export async function fetchSmsStatuses(opts) {
  const apiUrl = opts.apiUrl || SMSAPI_DEFAULT_URL;
  const url = `${apiUrl}/sms.do?ids=${opts.ids.join(',')}&status=1&format=json`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: 'application/json',
    },
  });

  const json = await res.json().catch(() => ({}));
  const list = Array.isArray(json?.list) ? json.list : [];

  return list.map((item) => ({
    id: String(item.id),
    status: String(item.status || '').toUpperCase(),
    error: item.error || undefined,
  }));
}

/**
 * Mapowanie statusu SMSAPI na nasz wewnętrzny status recipienta.
 *  DELIVERED -> 'delivered'
 *  FAILED|REJECTED|EXPIRED|UNDELIVERED|UNKNOWN -> 'failed'
 *  reszta (QUEUE, SENT, ACCEPTED) -> null (zostaw 'sent')
 */
export function mapSmsapiStatus(s) {
  const up = (s || '').toUpperCase();
  if (up === 'DELIVERED') return 'delivered';
  if (['FAILED', 'REJECTED', 'EXPIRED', 'UNDELIVERED', 'UNKNOWN'].includes(up)) {
    return 'failed';
  }
  return null;
}
