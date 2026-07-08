// Port edge function sms-campaign-dispatch: worker kampanii SMS (cron co minutę).
// Oryginał: supabase/functions/sms-campaign-dispatch/index.ts.
// Dla każdej "scheduled" kampanii, której scheduled_at <= NOW():
//   1. zaznacza status='sending',
//   2. materializuje listę odbiorców z segmentów (resolve email -> phone),
//   3. fan-out do send-sms batchami (bezpośredni import zamiast HTTP jak w Supabase),
//   4. ustawia status='sent' + agreguje stats.
// Może być wołany też ręcznie z UI: { campaign_id, force: true }.
import { countParts, detectEncoding, getSmsConfig, normalizePhone } from '../lib/sms.js';
import { sendSmsCore } from './send-sms.js';

export const name = 'sms-campaign-dispatch';

const MAX_CAMPAIGNS_PER_TICK = 5;
const FANOUT_BATCH = 30; // SMSAPI rate limit ~100 req/s

// Rdzeń logiki dla workera cron (per tenant) i handlera HTTP.
export async function runForTenant(pool, ctx, body = null) {
  const log = ctx?.log || console;
  const config = await getSmsConfig(pool);

  const targetIds = [];

  if (body?.campaign_id) {
    targetIds.push(body.campaign_id);
  } else {
    const { rows: due } = await pool.query(
      `SELECT id FROM sms_campaigns
        WHERE status IN ('scheduled', 'sending') AND scheduled_at <= NOW()
        LIMIT $1`,
      [MAX_CAMPAIGNS_PER_TICK]
    );
    due.forEach((c) => targetIds.push(c.id));
  }

  if (targetIds.length === 0) {
    return { message: 'No campaigns due', processed: 0 };
  }

  const results = [];
  for (const id of targetIds) {
    try {
      const result = await processCampaign(pool, id, config.defaultSender);
      results.push({ id, ...result });
    } catch (err) {
      log.error(`Campaign ${id} failed: ${err.message}`);
      await pool.query(
        `UPDATE sms_campaigns SET status = 'failed', completed_at = NOW() WHERE id = $1`,
        [id]
      );
      results.push({ id, error: err.message });
    }
  }

  return { processed: results.length, results };
}

export default async function handler(req, reply) {
  try {
    const result = await runForTenant(req.db, { tenantSlug: req.tenant.slug, log: req.log }, req.body);
    return reply.send(result);
  } catch (err) {
    req.log.error({ err }, 'sms dispatch error');
    return reply.code(500).send({ error: err.message });
  }
}

async function processCampaign(pool, campaignId, configDefaultSender) {
  const { rows: campaignRows } = await pool.query(
    `SELECT * FROM sms_campaigns WHERE id = $1`,
    [campaignId]
  );
  const campaign = campaignRows[0];
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sent' || campaign.status === 'cancelled') {
    return { skipped: true, reason: campaign.status };
  }

  campaign.segments = await safeRows(pool, `SELECT * FROM sms_campaign_segments WHERE campaign_id = $1`, [campaignId]);
  campaign.ab_variants = await safeRows(pool, `SELECT * FROM sms_campaign_ab_variants WHERE campaign_id = $1`, [campaignId]);

  if (campaign.status !== 'sending') {
    await pool.query(
      `UPDATE sms_campaigns SET status = 'sending', started_at = NOW() WHERE id = $1`,
      [campaignId]
    );
  }

  // Quiet hours — przesuń kampanię na koniec ciszy.
  if (isInQuietHours(campaign.quiet_hours_start, campaign.quiet_hours_end)) {
    const nextRun = nextQuietEnd(campaign.quiet_hours_end);
    await pool.query(
      `UPDATE sms_campaigns SET status = 'scheduled', scheduled_at = $2 WHERE id = $1`,
      [campaign.id, nextRun.toISOString()]
    );
    throw new Error(`Quiet hours active — rescheduled to ${nextRun.toISOString()}`);
  }

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM sms_campaign_recipients WHERE campaign_id = $1`,
    [campaignId]
  );
  if (!countRows[0].count) {
    await materializeRecipients(pool, campaign);
  }

  const { rows: pending } = await pool.query(
    `SELECT id, user_email, phone, variant FROM sms_campaign_recipients
      WHERE campaign_id = $1 AND status IN ('pending', 'queued')`,
    [campaignId]
  );

  const variantMap = new Map();
  (campaign.ab_variants || []).forEach((v) => {
    variantMap.set(v.variant, { body: v.body });
  });

  const sender = campaign.sender || configDefaultSender;

  let sentTotal = 0;
  let failedTotal = 0;

  for (let i = 0; i < pending.length; i += FANOUT_BATCH) {
    const batch = pending.slice(i, i + FANOUT_BATCH);

    const tasks = batch.map(async (r) => {
      const variantOverride = r.variant ? variantMap.get(r.variant) : null;
      const message = variantOverride?.body || campaign.body;

      try {
        // Bezpośrednie wywołanie in-process (w Supabase: fetch do /functions/v1/send-sms).
        const { status, body: json } = await sendSmsCore(pool, {
          phone: r.phone,
          message,
          sender,
          campaign_id: campaign.id,
          recipient_id: r.id,
          variant: r.variant,
        });

        if (status !== 200 || json.sent !== 1) {
          await pool.query(
            `UPDATE sms_campaign_recipients SET status = 'failed', error = $2 WHERE id = $1`,
            [r.id, json.error || 'send failed']
          );
          failedTotal++;
        } else {
          await pool.query(
            `UPDATE sms_campaign_recipients
                SET status = 'sent', smsapi_id = $2, points = $3
              WHERE id = $1`,
            [r.id, json.smsapi_id || null, json.points ?? null]
          );
          sentTotal++;
        }
      } catch (err) {
        await pool.query(
          `UPDATE sms_campaign_recipients SET status = 'failed', error = $2 WHERE id = $1`,
          [r.id, err.message]
        );
        failedTotal++;
      }
    });

    await Promise.all(tasks);
  }

  // Final stats + status. (Status DELIVERED zostanie ustawiony przez sms-campaign-receipts.)
  await pool.query(`SELECT update_sms_campaign_stats($1)`, [campaignId]);

  // Zapisz encoding/parts info (estimate na podstawie ostatecznej treści — głównie body bez wariantów).
  const enc = detectEncoding(campaign.body);
  const parts = countParts(campaign.body, enc);

  await pool.query(
    `UPDATE sms_campaigns
        SET status = 'sent', completed_at = NOW(), encoding = $2, parts_per_message = $3
      WHERE id = $1`,
    [campaignId, enc, parts]
  );

  return { sent: sentTotal, failed: failedTotal };
}

// --------------------------------------------
// Materializacja odbiorców z segmentów
// --------------------------------------------

async function materializeRecipients(pool, campaign) {
  const segments = campaign.segments || [];
  const includeEmails = new Map();
  const includePhonesOnly = new Map(); // numery z custom_phone bez emaila
  const excludeEmails = new Set();
  const excludePhones = new Set();

  const [allUsers, , homeGroupMembers, ministries] = await Promise.all([
    safeRows(pool, `SELECT email, full_name, campus_id, role, phone FROM app_users`),
    safeRows(pool, `SELECT id, name FROM home_groups`),
    safeRows(pool, `SELECT group_id, email, full_name, phone FROM home_group_members`),
    fetchMinistries(pool),
  ]);

  const phoneByEmail = new Map();
  allUsers.forEach((u) => { if (u.email && u.phone) phoneByEmail.set(u.email, u.phone); });
  homeGroupMembers.forEach((m) => {
    if (m.email && m.phone && !phoneByEmail.has(m.email)) phoneByEmail.set(m.email, m.phone);
  });

  const collectEmail = (target, segment) => {
    const add = (email, full_name) => {
      if (!email) return;
      const phone = phoneByEmail.get(email);
      if (target instanceof Map) target.set(email, { full_name, phone });
      else target.add(email);
    };
    switch (segment.segment_type) {
      case 'all':
        allUsers.forEach((u) => add(u.email, u.full_name));
        break;
      case 'campus':
        allUsers.filter((u) => String(u.campus_id) === String(segment.segment_id))
          .forEach((u) => add(u.email, u.full_name));
        break;
      case 'ministry': {
        const m = ministries.find((x) => x.key === segment.segment_id);
        m?.members?.forEach((u) => add(u.email, u.full_name));
        break;
      }
      case 'home_group': {
        homeGroupMembers
          .filter((m) => String(m.group_id) === String(segment.segment_id))
          .forEach((m) => add(m.email || '', m.full_name));
        break;
      }
      case 'role':
        allUsers.filter((u) => u.role === segment.segment_id)
          .forEach((u) => add(u.email, u.full_name));
        break;
      case 'custom_email':
        (segment.emails || []).forEach((e) => add(e));
        break;
      default:
        break;
    }
  };

  // custom_phone — numery niezwiązane z app_users.
  const collectPhones = (target, segment) => {
    if (segment.segment_type !== 'custom_phone') return;
    (segment.phones || []).forEach((raw) => {
      const norm = normalizePhone(raw);
      if (!norm) return;
      if (target instanceof Map) target.set(norm, { phone: norm });
      else target.add(norm);
    });
  };

  segments.forEach((s) => {
    if (s.segment_type === 'custom_phone') {
      if (s.exclude) collectPhones(excludePhones, s);
      else collectPhones(includePhonesOnly, s);
    } else {
      if (s.exclude) collectEmail(excludeEmails, s);
      else collectEmail(includeEmails, s);
    }
  });

  // Opt-outy z sms_user_preferences (enabled=false lub marketing_consent=false).
  const optOuts = await safeRows(
    pool,
    `SELECT user_email, marketing_consent FROM sms_user_preferences
      WHERE enabled = false OR marketing_consent = false`
  );
  optOuts.forEach((p) => {
    if (p.user_email) excludeEmails.add(p.user_email);
  });

  // Frequency cap.
  if (campaign.frequency_cap_per_day) {
    const recentSends = await safeRows(
      pool,
      `SELECT phone, status FROM sms_campaign_recipients
        WHERE campaign_id <> $1
          AND created_at >= NOW() - INTERVAL '24 hours'
          AND status IN ('sent', 'delivered', 'replied')`,
      [campaign.id]
    );

    const counts = new Map();
    recentSends.forEach((r) => {
      if (r.phone) counts.set(r.phone, (counts.get(r.phone) || 0) + 1);
    });
    counts.forEach((cnt, phone) => {
      if (cnt >= campaign.frequency_cap_per_day) excludePhones.add(phone);
    });
  }

  // A/B podział.
  const variants = campaign.ab_variants || [];
  const useAB = campaign.ab_test_enabled && variants.length >= 2;

  const rows = [];
  const seenPhones = new Set();

  // Email-based recipients (resolve phone from app_users).
  for (const [email, info] of includeEmails.entries()) {
    if (excludeEmails.has(email)) continue;
    const normalized = normalizePhone(info.phone || '');
    if (!normalized) {
      rows.push({
        campaign_id: campaign.id,
        user_email: email,
        full_name: info.full_name || null,
        phone: null,
        variant: null,
        status: 'suppressed',
        error: 'no_phone',
      });
      continue;
    }
    if (excludePhones.has(normalized) || seenPhones.has(normalized)) continue;
    seenPhones.add(normalized);
    rows.push({
      campaign_id: campaign.id,
      user_email: email,
      full_name: info.full_name || null,
      phone: normalized,
      variant: useAB ? pickVariant(variants) : null,
      status: 'pending',
      error: null,
    });
  }

  // Phone-only recipients (custom_phone segment).
  for (const [phone] of includePhonesOnly.entries()) {
    if (excludePhones.has(phone) || seenPhones.has(phone)) continue;
    seenPhones.add(phone);
    rows.push({
      campaign_id: campaign.id,
      user_email: null,
      full_name: null,
      phone,
      variant: useAB ? pickVariant(variants) : null,
      status: 'pending',
      error: null,
    });
  }

  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values = [];
    const params = [];
    chunk.forEach((r, idx) => {
      const o = idx * 7;
      values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`);
      params.push(r.campaign_id, r.user_email, r.full_name, r.phone, r.variant, r.status, r.error);
    });
    await pool.query(
      `INSERT INTO sms_campaign_recipients (campaign_id, user_email, full_name, phone, variant, status, error)
       VALUES ${values.join(', ')}
       ON CONFLICT (campaign_id, phone) DO NOTHING`,
      params
    );
  }

  await pool.query(
    `UPDATE sms_campaigns SET recipient_count = $2 WHERE id = $1`,
    [campaign.id, rows.length]
  );
}

async function fetchMinistries(pool) {
  const defs = [
    { key: 'worship_team', table: 'worship_team' },
    { key: 'media_team', table: 'media_team' },
    { key: 'atmosfera_team', table: 'atmosfera_members' },
    { key: 'kids_ministry', table: 'kids_teachers' },
  ];
  const results = await Promise.all(defs.map(async (d) => {
    const members = await safeRows(pool, `SELECT email, full_name FROM ${d.table}`);
    return { key: d.key, members };
  }));
  return results;
}

function pickVariant(variants) {
  const rand = Math.random() * 100;
  let cum = 0;
  for (const v of variants) {
    cum += v.share_percent || 0;
    if (rand <= cum) return v.variant;
  }
  return variants[0]?.variant || 'A';
}

function isInQuietHours(start, end) {
  if (!start || !end) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const startMins = parseTime(String(start));
  const endMins = parseTime(String(end));
  if (startMins === endMins) return false;
  if (startMins < endMins) return mins >= startMins && mins < endMins;
  return mins >= startMins || mins < endMins;
}

function nextQuietEnd(end) {
  const d = new Date();
  const [h, m] = String(end || '08:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function parseTime(t) {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Odpowiednik supabase.from(...).select() — błąd (np. brak tabeli) zwraca [].
async function safeRows(pool, sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch {
    return [];
  }
}
