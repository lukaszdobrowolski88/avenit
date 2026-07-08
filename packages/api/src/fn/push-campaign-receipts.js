// Port edge function push-campaign-receipts: sprawdzanie ticketów Expo (cron co 5 min).
// Oryginał: supabase/functions/push-campaign-receipts/index.ts.
// Woła https://exp.host/--/api/v2/push/getReceipts i:
//   - oznacza dostarczone jako 'delivered'
//   - oznacza błędy ("MessageRateExceeded", "DeviceNotRegistered" itp.) jako 'failed' + cleanup tokenów
import { config } from '../config.js';

export const name = 'push-campaign-receipts';

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const RECEIPTS_BATCH = 1000; // limit Expo

// Rdzeń logiki dla workera cron (per tenant) i handlera HTTP.
export async function runForTenant(pool, ctx) {
  const log = ctx?.log || console;
  const accessToken = config.EXPO_ACCESS_TOKEN;

  // Bierzemy recipientów wysłanych w ostatnich 30 minutach z niepustym expo_tickets.
  const { rows } = await pool.query(
    `SELECT id, campaign_id, expo_tickets FROM push_campaign_recipients
      WHERE created_at >= NOW() - INTERVAL '30 minutes' AND status = 'sent'`
  );

  if (!rows.length) return { message: 'no tickets to check', processed: 0 };

  // Zbierz wszystkie ticket_id i mapowanie back to recipient.
  const ticketToRecipient = new Map();
  rows.forEach((r) => {
    (r.expo_tickets || []).forEach((t) => {
      if (t.ticket?.id) {
        ticketToRecipient.set(t.ticket.id, {
          recipientId: r.id,
          campaignId: r.campaign_id,
          token: t.token,
        });
      }
    });
  });

  if (ticketToRecipient.size === 0) return { message: 'no ticket ids', processed: 0 };

  const ticketIds = Array.from(ticketToRecipient.keys());
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let delivered = 0;
  let failed = 0;
  const tokensToDelete = new Set();
  const campaignsTouched = new Set();

  for (let i = 0; i < ticketIds.length; i += RECEIPTS_BATCH) {
    const batch = ticketIds.slice(i, i + RECEIPTS_BATCH);
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: batch }),
      });
      const json = await res.json();
      const receipts = json?.data || {};

      for (const [tid, receipt] of Object.entries(receipts)) {
        const ref = ticketToRecipient.get(tid);
        if (!ref) continue;
        campaignsTouched.add(ref.campaignId);

        if (receipt.status === 'ok') {
          await pool.query(
            `UPDATE push_campaign_recipients
                SET status = 'delivered', delivered_at = NOW()
              WHERE id = $1 AND status = 'sent'`,
            [ref.recipientId]
          );
          delivered++;
        } else if (receipt.status === 'error') {
          await pool.query(
            `UPDATE push_campaign_recipients SET status = 'failed', error = $2 WHERE id = $1`,
            [ref.recipientId, receipt.message || receipt.details?.error]
          );
          failed++;
          if (receipt.details?.error === 'DeviceNotRegistered') {
            tokensToDelete.add(ref.token);
          }
        }
      }
    } catch (err) {
      log.error(`receipts batch error: ${err.message}`);
    }
  }

  // Cleanup expired tokens.
  if (tokensToDelete.size > 0) {
    await pool.query(
      `DELETE FROM push_tokens WHERE expo_token = ANY($1::text[])`,
      [Array.from(tokensToDelete)]
    );
  }

  // Refresh aggregates.
  for (const cid of campaignsTouched) {
    await pool.query(`SELECT update_push_campaign_stats($1)`, [cid]);
  }

  return { delivered, failed, tokens_removed: tokensToDelete.size };
}

export default async function handler(req, reply) {
  try {
    const result = await runForTenant(req.db, { tenantSlug: req.tenant.slug, log: req.log });
    return reply.send(result);
  } catch (err) {
    req.log.error({ err }, 'receipts error');
    return reply.code(500).send({ error: err.message });
  }
}
