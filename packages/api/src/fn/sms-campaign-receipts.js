// Port edge function sms-campaign-receipts: statusy doręczenia SMSAPI (cron co 5 min).
// Oryginał: supabase/functions/sms-campaign-receipts/index.ts.
//   - oznacza dostarczone jako 'delivered'
//   - oznacza błędy (FAILED/REJECTED/EXPIRED/UNDELIVERED) jako 'failed'
// Po przetworzeniu odświeża agregaty kampanii.
import { fetchSmsStatuses, getSmsConfig, mapSmsapiStatus } from '../lib/sms.js';

export const name = 'sms-campaign-receipts';

const STATUS_BATCH = 100; // SMSAPI: rozsądny limit per request
const LOOKBACK_HOURS = 24;

// Rdzeń logiki dla workera cron (per tenant) i handlera HTTP.
export async function runForTenant(pool, ctx) {
  const log = ctx?.log || console;
  const config = await getSmsConfig(pool);

  if (!config.token) {
    return { error: 'SMSAPI token not configured (set in app settings)' };
  }

  const { rows } = await pool.query(
    `SELECT id, campaign_id, smsapi_id FROM sms_campaign_recipients
      WHERE status = 'sent'
        AND smsapi_id IS NOT NULL
        AND created_at >= NOW() - ($1 || ' hours')::interval`,
    [LOOKBACK_HOURS]
  );

  if (!rows.length) {
    return { message: 'no recipients to check', processed: 0 };
  }

  const idToRecipient = new Map();
  rows.forEach((r) => {
    if (r.smsapi_id) {
      idToRecipient.set(String(r.smsapi_id), { recipientId: r.id, campaignId: r.campaign_id });
    }
  });

  const allIds = Array.from(idToRecipient.keys());
  let delivered = 0;
  let failed = 0;
  const campaignsTouched = new Set();

  for (let i = 0; i < allIds.length; i += STATUS_BATCH) {
    const batch = allIds.slice(i, i + STATUS_BATCH);
    try {
      const statuses = await fetchSmsStatuses({
        token: config.token,
        apiUrl: config.apiUrl,
        ids: batch,
      });

      for (const s of statuses) {
        const ref = idToRecipient.get(s.id);
        if (!ref) continue;

        const mapped = mapSmsapiStatus(s.status);
        if (!mapped) continue;

        campaignsTouched.add(ref.campaignId);

        if (mapped === 'delivered') {
          await pool.query(
            `UPDATE sms_campaign_recipients
                SET status = 'delivered', delivered_at = NOW()
              WHERE id = $1 AND status = 'sent'`,
            [ref.recipientId]
          );
          delivered++;
        } else if (mapped === 'failed') {
          await pool.query(
            `UPDATE sms_campaign_recipients SET status = 'failed', error = $2 WHERE id = $1`,
            [ref.recipientId, s.error || s.status]
          );
          failed++;
        }
      }
    } catch (err) {
      log.error(`sms receipts batch error: ${err.message}`);
    }
  }

  for (const cid of campaignsTouched) {
    await pool.query(`SELECT update_sms_campaign_stats($1)`, [cid]);
  }

  return { delivered, failed, checked: allIds.length };
}

export default async function handler(req, reply) {
  try {
    const result = await runForTenant(req.db, { tenantSlug: req.tenant.slug, log: req.log });
    // Brak tokenu SMSAPI — oryginał zwracał 500.
    return reply.code(result.error ? 500 : 200).send(result);
  } catch (err) {
    req.log.error({ err }, 'sms receipts error');
    return reply.code(500).send({ error: err.message });
  }
}
