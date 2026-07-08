// Port edge function sms-incoming-webhook: publiczny endpoint SMSAPI MO
// (Mobile Originated) — SMSAPI woła ten URL, gdy odbiorca odpowie na SMS z kampanii.
// Oryginał: supabase/functions/sms-incoming-webhook/index.ts.
//
// Konfiguracja w panelu SMSAPI → MO callback → URL:
//   https://<tenant>.<APP_DOMAIN>/api/fn/sms-incoming-webhook?secret=<SMSAPI_WEBHOOK_SECRET>
//
// Logika:
//   1. parsuje POST/GET (form-urlencoded lub query) z polami sms_from, sms_text, MsgId
//   2. lookup ostatniego recipienta o tym phone (lookback 7 dni, status sent/delivered)
//   3. mapuje treść: TAK/YES/T/Y/1 → 'yes', NIE/NO/N/0 → 'no', inne → raw 'reply'
//   4. zapisuje do sms_inline_responses + ustawia recipient.status='replied'
//
// Bezpieczeństwo: query param ?secret=... vs integration_settings / SMSAPI_WEBHOOK_SECRET.
import { getSmsConfig, normalizePhone } from '../lib/sms.js';

export const name = 'sms-incoming-webhook';
export const isPublic = true;
export const method = 'ALL'; // SMSAPI wysyła zwykle GET-em z query, ale obsługujemy też POST

const REPLY_LOOKBACK_DAYS = 7;

export default async function handler(req, reply) {
  try {
    const config = await getSmsConfig(req.db);

    if (config.webhookSecret) {
      const got = req.query?.secret;
      if (got !== config.webhookSecret) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
    }

    // SMSAPI wysyła zwykle GET-em z query, ale obsługujemy też POST form-data / JSON.
    let smsFrom = '';
    let smsText = '';
    let msgId = '';
    let smsTo = '';

    if (req.method === 'GET') {
      smsFrom = req.query?.sms_from || '';
      smsText = req.query?.sms_text || '';
      msgId = req.query?.MsgId || req.query?.msg_id || '';
      smsTo = req.query?.sms_to || '';
    } else {
      const body = parseBody(req);
      smsFrom = String(body.sms_from || '');
      smsText = String(body.sms_text || '');
      msgId = String(body.MsgId || body.msg_id || '');
      smsTo = String(body.sms_to || '');
    }

    req.log.info({ smsFrom, smsTo, msgId, len: smsText.length }, 'SMS MO incoming');

    const phone = normalizePhone(smsFrom);
    if (!phone) {
      return reply.code(400).send({ ok: false, error: 'invalid sender phone' });
    }

    if (!smsText.trim()) {
      return reply.code(400).send({ ok: false, error: 'empty message' });
    }

    // Lookup recipienta — ostatni rekord dla tego telefonu w oknie czasu.
    const { rows: recipients } = await req.db.query(
      `SELECT id, campaign_id, user_email, status FROM sms_campaign_recipients
        WHERE phone = $1
          AND status IN ('sent', 'delivered', 'replied')
          AND created_at >= NOW() - ($2 || ' days')::interval
        ORDER BY created_at DESC
        LIMIT 1`,
      [phone, REPLY_LOOKBACK_DAYS]
    );

    const recipient = recipients[0];

    // Klasyfikacja odpowiedzi.
    const normalized = smsText.trim().toUpperCase();
    let responseType = 'reply';
    let responseValue = smsText.trim();

    const yesTokens = ['TAK', 'YES', 'T', 'Y', '1', 'OK', 'POTWIERDZAM'];
    const noTokens = ['NIE', 'NO', 'N', '0', 'ANULUJ'];

    if (yesTokens.some((t) => normalized === t || normalized.startsWith(t + ' '))) {
      responseType = 'rsvp';
      responseValue = 'yes';
    } else if (noTokens.some((t) => normalized === t || normalized.startsWith(t + ' '))) {
      responseType = 'rsvp';
      responseValue = 'no';
    }

    // Insert do log-table.
    await req.db.query(
      `INSERT INTO sms_inline_responses
         (campaign_id, recipient_id, user_email, phone, smsapi_msg_id, response_type, response_value, raw_text, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        recipient?.campaign_id || null,
        recipient?.id || null,
        recipient?.user_email || null,
        phone,
        msgId || null,
        responseType,
        responseValue,
        smsText,
        JSON.stringify({ sms_to: smsTo }),
      ]
    );

    // Mark recipient jako 'replied'.
    if (recipient?.id) {
      await req.db.query(
        `UPDATE sms_campaign_recipients SET status = 'replied', replied_at = NOW() WHERE id = $1`,
        [recipient.id]
      );

      await req.db.query(`SELECT update_sms_campaign_stats($1)`, [recipient.campaign_id]);
    }

    return reply.send({ ok: true, matched: !!recipient, response_type: responseType });
  } catch (err) {
    req.log.error({ err }, 'sms-incoming-webhook error');
    return reply.code(500).send({ error: err.message });
  }
}

// Body może być JSON-em (obiekt), form-urlencoded (Buffer — parser catch-all serwera)
// lub query stringiem.
function parseBody(req) {
  const body = req.body;
  if (!body) return {};
  if (Buffer.isBuffer(body)) {
    return Object.fromEntries(new URLSearchParams(body.toString('utf8')));
  }
  if (typeof body === 'string') {
    return Object.fromEntries(new URLSearchParams(body));
  }
  return body;
}
