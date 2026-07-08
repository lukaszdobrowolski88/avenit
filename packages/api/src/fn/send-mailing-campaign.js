// Port edge function send-mailing-campaign: masowa wysyłka kampanii e-mail (SendGrid).
// Oryginał: supabase/functions/send-mailing-campaign/index.ts.
// Tabele w bazie tenanta: email_campaigns, email_campaign_recipients.
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';

export const name = 'send-mailing-campaign';

function personalizeHtml(html, recipient, campaignId, baseUrl) {
  const firstName = recipient.full_name?.split(' ')[0] || '';
  const lastName = recipient.full_name?.split(' ').slice(1).join(' ') || '';
  const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipient.email)}&campaign=${campaignId}`;
  return String(html || '')
    .replaceAll('{{first_name}}', firstName)
    .replaceAll('{{last_name}}', lastName)
    .replaceAll('{{email}}', recipient.email)
    .replaceAll('{{unsubscribe_url}}', unsubscribeUrl);
}

export default async function handler(req, reply) {
  const { campaign_id, batch_size = 50, test_email, test_subject, test_html_content } = req.body || {};
  const baseUrl = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;

  // Wysyłka testowa (bez kampanii).
  if (test_email && test_subject && test_html_content) {
    const html = personalizeHtml(test_html_content, { email: test_email, full_name: 'Test User' }, 'test-preview', baseUrl);
    try {
      await sendEmail({ to: test_email, subject: `[TEST] ${test_subject}`, html });
      return reply.send({ message: 'Test email sent', success: true });
    } catch (err) {
      return reply.code(500).send({ message: 'Test email failed', success: false, error: err.message });
    }
  }

  if (!campaign_id) return reply.code(400).send({ error: 'Brak campaign_id' });

  const { rows: campRows } = await req.db.query(
    `SELECT * FROM email_campaigns WHERE id = $1`, [campaign_id]
  );
  const campaign = campRows[0];
  if (!campaign) return reply.code(404).send({ error: 'Kampania nie znaleziona' });
  if (campaign.status !== 'sending' && campaign.status !== 'scheduled') {
    return reply.code(400).send({ error: `Kampania w statusie '${campaign.status}' nie może być wysłana` });
  }

  const { rows: recipients } = await req.db.query(
    `SELECT * FROM email_campaign_recipients
      WHERE campaign_id = $1 AND status = 'pending' LIMIT $2`,
    [campaign_id, batch_size]
  );

  if (recipients.length === 0) {
    await req.db.query(`UPDATE email_campaigns SET status = 'sent', sent_at = now() WHERE id = $1`, [campaign_id]);
    return reply.send({ message: 'All emails sent', campaign_status: 'sent' });
  }

  await req.db.query(`UPDATE email_campaigns SET status = 'sending' WHERE id = $1`, [campaign_id]);

  let sent = 0, failed = 0;
  for (const recipient of recipients) {
    const html = personalizeHtml(campaign.html_content, recipient, campaign_id, baseUrl);
    try {
      await sendEmail({ to: recipient.email, subject: campaign.subject, html });
      await req.db.query(
        `UPDATE email_campaign_recipients SET status = 'sent', sent_at = now() WHERE id = $1`,
        [recipient.id]
      );
      sent++;
    } catch (err) {
      await req.db.query(
        `UPDATE email_campaign_recipients SET status = 'failed', error_message = $1 WHERE id = $2`,
        [err.message, recipient.id]
      );
      failed++;
    }
  }

  // Jeśli nie ma już pending — oznacz kampanię jako wysłaną.
  const { rows: pend } = await req.db.query(
    `SELECT count(*)::int AS n FROM email_campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`,
    [campaign_id]
  );
  if (pend[0].n === 0) {
    await req.db.query(`UPDATE email_campaigns SET status = 'sent', sent_at = now() WHERE id = $1`, [campaign_id]);
  }

  return reply.send({ sent, failed, remaining: pend[0].n });
}

// Runner dla workera (dokańczanie zaplanowanych kampanii w tłach).
export async function runForTenant(pool, ctx) {
  const { rows } = await pool.query(
    `SELECT id FROM email_campaigns WHERE status IN ('sending', 'scheduled')
       AND (scheduled_at IS NULL OR scheduled_at <= now())`
  );
  for (const c of rows) {
    ctx.log?.(`mailing kampania ${c.id}`);
    // Reużyj logiki wsadowo aż do wyczerpania (proste pętle po 50).
    // Uwaga: worker nie ma req.tenant.subdomain — link unsubscribe używa slug jako fallback.
    let pending = true;
    while (pending) {
      const { rows: recips } = await pool.query(
        `SELECT * FROM email_campaign_recipients WHERE campaign_id = $1 AND status = 'pending' LIMIT 50`,
        [c.id]
      );
      if (recips.length === 0) {
        await pool.query(`UPDATE email_campaigns SET status = 'sent', sent_at = now() WHERE id = $1`, [c.id]);
        pending = false;
        break;
      }
      const { rows: cRows } = await pool.query(`SELECT * FROM email_campaigns WHERE id = $1`, [c.id]);
      const campaign = cRows[0];
      const baseUrl = `https://${ctx.tenantSlug}.${config.APP_DOMAIN}`;
      for (const r of recips) {
        const html = personalizeHtml(campaign.html_content, r, c.id, baseUrl);
        try {
          await sendEmail({ to: r.email, subject: campaign.subject, html });
          await pool.query(`UPDATE email_campaign_recipients SET status = 'sent', sent_at = now() WHERE id = $1`, [r.id]);
        } catch (err) {
          await pool.query(`UPDATE email_campaign_recipients SET status = 'failed', error_message = $1 WHERE id = $2`, [err.message, r.id]);
        }
      }
    }
  }
}
