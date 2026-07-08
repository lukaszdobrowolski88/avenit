// Port edge function push-campaign-dispatch: worker kampanii push (cron co minutę).
// Oryginał: supabase/functions/push-campaign-dispatch/index.ts.
// Dla każdej "scheduled" kampanii, której scheduled_at <= NOW():
//   1. zaznacza status='sending',
//   2. materializuje listę odbiorców z segmentów,
//   3. fan-out do send-push (bezpośredni import zamiast HTTP jak w Supabase),
//   4. tworzy wpisy w `notifications` (inbox),
//   5. ustawia status='sent' + agreguje stats.
// Może być wołany też ręcznie z UI: { campaign_id, force: true }.
import { sendPushCore } from './send-push.js';
import { emitChange } from '../realtime/hub.js';

export const name = 'push-campaign-dispatch';

const MAX_CAMPAIGNS_PER_TICK = 5;
const FANOUT_BATCH = 50; // ile pushy fan-outujemy równolegle

// Rdzeń logiki dla workera cron (per tenant) i handlera HTTP.
export async function runForTenant(pool, ctx, body = null) {
  const log = ctx?.log || console;
  const targetIds = [];

  if (body?.campaign_id) {
    // Wymuszone wywołanie z UI ("Wyślij teraz").
    targetIds.push(body.campaign_id);
  } else {
    // Pickup zaplanowanych.
    const { rows: due } = await pool.query(
      `SELECT id FROM push_campaigns
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
      const result = await processCampaign(pool, id, ctx);
      results.push({ id, ...result });
    } catch (err) {
      log.error(`Campaign ${id} failed: ${err.message}`);
      await pool.query(
        `UPDATE push_campaigns SET status = 'failed', completed_at = NOW() WHERE id = $1`,
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
    req.log.error({ err }, 'dispatch error');
    return reply.code(500).send({ error: err.message });
  }
}

async function processCampaign(pool, campaignId, ctx) {
  // 1. Zablokuj kampanię (status -> sending, jeśli jeszcze nie).
  const { rows: campaignRows } = await pool.query(
    `SELECT * FROM push_campaigns WHERE id = $1`,
    [campaignId]
  );
  const campaign = campaignRows[0];
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sent' || campaign.status === 'cancelled') {
    return { skipped: true, reason: campaign.status };
  }

  // Relacje (w Supabase: select z zagnieżdżeniem).
  campaign.segments = await safeRows(pool, `SELECT * FROM push_campaign_segments WHERE campaign_id = $1`, [campaignId]);
  campaign.actions = await safeRows(pool, `SELECT * FROM push_campaign_actions WHERE campaign_id = $1`, [campaignId]);
  campaign.ab_variants = await safeRows(pool, `SELECT * FROM push_campaign_ab_variants WHERE campaign_id = $1`, [campaignId]);

  if (campaign.status !== 'sending') {
    await pool.query(
      `UPDATE push_campaigns SET status = 'sending', started_at = NOW() WHERE id = $1`,
      [campaignId]
    );
  }

  // 2. Materializuj odbiorców (jeśli jeszcze nie istnieją).
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM push_campaign_recipients WHERE campaign_id = $1`,
    [campaignId]
  );
  if (!countRows[0].count) {
    await materializeRecipients(pool, campaign);
  }

  // 3. Fan-out do send-push.
  const { rows: pending } = await pool.query(
    `SELECT id, user_email, variant FROM push_campaign_recipients
      WHERE campaign_id = $1 AND status IN ('pending', 'queued')`,
    [campaignId]
  );

  const actionsForPayload = (campaign.actions || [])
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((a) => ({
      label: a.label,
      action_type: a.action_type,
      action_value: a.action_value,
    }));

  const variantMap = new Map();
  (campaign.ab_variants || []).forEach((v) => {
    variantMap.set(v.variant, { title: v.title, body: v.body });
  });

  let sentTotal = 0;
  let failedTotal = 0;

  for (let i = 0; i < pending.length; i += FANOUT_BATCH) {
    const batch = pending.slice(i, i + FANOUT_BATCH);

    const tasks = batch.map(async (r) => {
      const variantOverride = r.variant ? variantMap.get(r.variant) : null;
      const title = variantOverride?.title || campaign.title;
      const body = variantOverride?.body || campaign.body;

      try {
        // Bezpośrednie wywołanie in-process (w Supabase: fetch do /functions/v1/send-push).
        const { status, body: json } = await sendPushCore(pool, {
          user_email: r.user_email,
          title,
          body,
          link: campaign.link,
          tag: campaign.tag,
          icon: campaign.icon,
          big_image: campaign.big_image,
          category_id: campaign.category_id,
          data: { ...(campaign.data || {}), campaign_id: campaign.id, recipient_id: r.id, variant: r.variant },
          actions: actionsForPayload,
          campaign_id: campaign.id,
          recipient_id: r.id,
          variant: r.variant,
        });

        if (status !== 200 || (json.sent === 0 && json.failed > 0)) {
          await pool.query(
            `UPDATE push_campaign_recipients SET status = 'failed', error = $2 WHERE id = $1`,
            [r.id, json.error || 'send failed']
          );
          failedTotal++;
        } else if (json.sent > 0) {
          await pool.query(
            `UPDATE push_campaign_recipients
                SET status = 'sent', channels = $2, expo_tickets = $3
              WHERE id = $1`,
            [
              r.id,
              JSON.stringify({ mobile: json.channels?.mobile?.sent || 0, web: json.channels?.web?.sent || 0 }),
              JSON.stringify(json.channels?.mobile?.tickets || []),
            ]
          );
          sentTotal++;
        } else {
          // sent === 0, failed === 0 — brak zarejestrowanych urządzeń.
          await pool.query(
            `UPDATE push_campaign_recipients SET status = 'suppressed', error = 'no devices' WHERE id = $1`,
            [r.id]
          );
        }
      } catch (err) {
        await pool.query(
          `UPDATE push_campaign_recipients SET status = 'failed', error = $2 WHERE id = $1`,
          [r.id, err.message]
        );
        failedTotal++;
      }
    });

    await Promise.all(tasks);
  }

  // 4. Wpisy do inboxu (notifications) — tylko dla skutecznie wysłanych.
  await createInboxEntries(pool, campaign, ctx);

  // 5. Final stats + status.
  await pool.query(`SELECT update_push_campaign_stats($1)`, [campaignId]);
  await pool.query(
    `UPDATE push_campaigns SET status = 'sent', completed_at = NOW() WHERE id = $1`,
    [campaignId]
  );

  return { sent: sentTotal, failed: failedTotal };
}

// --------------------------------------------
// Materializacja odbiorców z segmentów
// --------------------------------------------

async function materializeRecipients(pool, campaign) {
  const segments = campaign.segments || [];
  const includeEmails = new Map();
  const excludeEmails = new Set();

  // Pobierz dane źródłowe.
  const [allUsers, , homeGroupMembers, ministries] = await Promise.all([
    safeRows(pool, `SELECT email, full_name, campus_id, role FROM app_users`),
    safeRows(pool, `SELECT id, name FROM home_groups`),
    safeRows(pool, `SELECT group_id, email, full_name FROM home_group_members`),
    fetchMinistries(pool),
  ]);

  const collectInto = (target, segment) => {
    const add = (email, full_name) => {
      if (!email) return;
      if (target instanceof Map) target.set(email, { full_name });
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
          .forEach((m) => add(m.email, m.full_name));
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

  segments.forEach((s) => {
    if (s.exclude) collectInto(excludeEmails, s);
    else collectInto(includeEmails, s);
  });

  // Opt-outy z push_user_preferences.
  const optOuts = await safeRows(
    pool,
    `SELECT user_email FROM push_user_preferences WHERE enabled = false`
  );
  optOuts.forEach((p) => excludeEmails.add(p.user_email));

  // Frequency cap (kampania wysłała mniej niż N pushy w 24h temu temu samemu).
  if (campaign.frequency_cap_per_day) {
    const recentSends = await safeRows(
      pool,
      `SELECT user_email, status FROM push_campaign_recipients
        WHERE campaign_id <> $1
          AND created_at >= NOW() - INTERVAL '24 hours'
          AND status IN ('sent', 'delivered', 'opened', 'action_clicked')`,
      [campaign.id]
    );

    const counts = new Map();
    recentSends.forEach((r) => {
      counts.set(r.user_email, (counts.get(r.user_email) || 0) + 1);
    });
    counts.forEach((cnt, email) => {
      if (cnt >= campaign.frequency_cap_per_day) excludeEmails.add(email);
    });
  }

  // Quiet hours — gdy NOW jest w "ciszy", re-schedule kampanię na koniec quiet hours.
  if (isInQuietHours(campaign.quiet_hours_start, campaign.quiet_hours_end)) {
    const nextRun = nextQuietEnd(campaign.quiet_hours_end);
    await pool.query(
      `UPDATE push_campaigns SET status = 'scheduled', scheduled_at = $2 WHERE id = $1`,
      [campaign.id, nextRun.toISOString()]
    );
    throw new Error(`Quiet hours active — rescheduled to ${nextRun.toISOString()}`);
  }

  const finalEmails = Array.from(includeEmails.entries())
    .filter(([email]) => !excludeEmails.has(email));

  if (finalEmails.length === 0) return;

  // A/B podział.
  const variants = campaign.ab_variants || [];
  const useAB = campaign.ab_test_enabled && variants.length >= 2;

  const rows = finalEmails.map(([email, info]) => ({
    campaign_id: campaign.id,
    user_email: email,
    full_name: info.full_name || null,
    variant: useAB ? pickVariant(variants) : null,
    status: 'pending',
  }));

  // Insert w paczkach po 500 (jak w Supabase; ON CONFLICT DO NOTHING = ignoreDuplicates).
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values = [];
    const params = [];
    chunk.forEach((r, idx) => {
      const o = idx * 5;
      values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5})`);
      params.push(r.campaign_id, r.user_email, r.full_name, r.variant, r.status);
    });
    await pool.query(
      `INSERT INTO push_campaign_recipients (campaign_id, user_email, full_name, variant, status)
       VALUES ${values.join(', ')}
       ON CONFLICT (campaign_id, user_email) DO NOTHING`,
      params
    );
  }

  // Snapshot recipient_count od razu.
  await pool.query(
    `UPDATE push_campaigns SET recipient_count = $2 WHERE id = $1`,
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
  // Wrap przez północ (np. 22:00 → 06:00).
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

// --------------------------------------------
// Inbox entries (notifications)
// --------------------------------------------

async function createInboxEntries(pool, campaign, ctx) {
  const recipients = await safeRows(
    pool,
    `SELECT user_email FROM push_campaign_recipients
      WHERE campaign_id = $1 AND status IN ('sent', 'delivered', 'opened', 'action_clicked')`,
    [campaign.id]
  );

  if (!recipients.length) return;

  // Best effort — jeśli notifications nie ma kolumny push_campaign_id albo jakichś pól, łykamy.
  try {
    const inserted = [];
    for (let i = 0; i < recipients.length; i += 500) {
      const chunk = recipients.slice(i, i + 500);
      const values = [];
      const params = [];
      chunk.forEach((r, idx) => {
        const o = idx * 5;
        values.push(`($${o + 1}, 'system', $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, false, NOW())`);
        params.push(r.user_email, campaign.title, campaign.body, campaign.link, campaign.id);
      });
      const res = await pool.query(
        `INSERT INTO notifications (user_email, type, title, body, link, push_campaign_id, is_read, created_at)
         VALUES ${values.join(', ')}
         RETURNING *`,
        params
      );
      inserted.push(...res.rows);
    }
    // Realtime dla appki mobilnej (subskrybuje tabelę notifications).
    if (inserted.length && ctx?.tenantSlug) {
      emitChange(ctx.tenantSlug, 'notifications', 'insert', inserted);
    }
  } catch (err) {
    console.warn('Inbox insert failed (non-fatal):', err.message);
  }
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
