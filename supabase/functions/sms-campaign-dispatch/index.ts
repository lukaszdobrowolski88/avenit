// Edge Function: sms-campaign-dispatch
// Worker odpalany przez pg_cron co minutę. Dla każdej "scheduled" kampanii,
// której scheduled_at <= NOW():
//   1. zaznacza status='sending',
//   2. materializuje listę odbiorców z segmentów (resolve email -> phone),
//   3. fan-out do edge function send-sms batchami,
//   4. ustawia status='sent' + agreguje stats.
//
// Może być wołany też ręcznie z UI: { campaign_id, force: true }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  countParts,
  detectEncoding,
  getSmsConfig,
  jsonResponse,
  normalizePhone,
  safeJson,
} from "../_shared/sms.ts";

const MAX_CAMPAIGNS_PER_TICK = 5;
const FANOUT_BATCH = 30; // SMSAPI rate limit ~100 req/s

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const config = await getSmsConfig(supabase);

    const body = await safeJson(req);
    const targetIds: string[] = [];

    if (body?.campaign_id) {
      targetIds.push(body.campaign_id);
    } else {
      const { data: due } = await supabase
        .from("sms_campaigns")
        .select("id")
        .in("status", ["scheduled", "sending"])
        .lte("scheduled_at", new Date().toISOString())
        .limit(MAX_CAMPAIGNS_PER_TICK);
      due?.forEach((c: any) => targetIds.push(c.id));
    }

    if (targetIds.length === 0) {
      return jsonResponse({ message: "No campaigns due", processed: 0 });
    }

    const results = [];
    for (const id of targetIds) {
      try {
        const result = await processCampaign(supabase, id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, config.defaultSender);
        results.push({ id, ...result });
      } catch (err) {
        const e = err as Error;
        console.error(`Campaign ${id} failed:`, e);
        await supabase.from("sms_campaigns")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", id);
        results.push({ id, error: e.message });
      }
    }

    return jsonResponse({ processed: results.length, results });
  } catch (err) {
    const e = err as Error;
    console.error("sms dispatch error:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});

async function processCampaign(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  configDefaultSender: string,
) {
  const { data: campaign } = await supabase
    .from("sms_campaigns")
    .select(`*, segments:sms_campaign_segments(*), ab_variants:sms_campaign_ab_variants(*)`)
    .eq("id", campaignId)
    .single();

  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "sent" || campaign.status === "cancelled") {
    return { skipped: true, reason: campaign.status };
  }

  if (campaign.status !== "sending") {
    await supabase.from("sms_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  // Quiet hours — przesuń kampanię na koniec ciszy.
  if (isInQuietHours(campaign.quiet_hours_start, campaign.quiet_hours_end)) {
    const nextRun = nextQuietEnd(campaign.quiet_hours_end);
    await supabase.from("sms_campaigns")
      .update({ status: "scheduled", scheduled_at: nextRun.toISOString() })
      .eq("id", campaign.id);
    throw new Error(`Quiet hours active — rescheduled to ${nextRun.toISOString()}`);
  }

  const { count: existingCount } = await supabase
    .from("sms_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (!existingCount || existingCount === 0) {
    await materializeRecipients(supabase, campaign);
  }

  const { data: pending } = await supabase
    .from("sms_campaign_recipients")
    .select("id, user_email, phone, variant")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"]);

  const variantMap = new Map<string, { body: string }>();
  (campaign.ab_variants || []).forEach((v: any) => {
    variantMap.set(v.variant, { body: v.body });
  });

  const sender = campaign.sender || configDefaultSender;

  let sentTotal = 0;
  let failedTotal = 0;

  for (let i = 0; i < (pending?.length || 0); i += FANOUT_BATCH) {
    const batch = pending!.slice(i, i + FANOUT_BATCH);

    const tasks = batch.map(async (r: any) => {
      const variantOverride = r.variant ? variantMap.get(r.variant) : null;
      const message = variantOverride?.body || campaign.body;

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            phone: r.phone,
            message,
            sender,
            campaign_id: campaign.id,
            recipient_id: r.id,
            variant: r.variant,
          }),
        });

        const json = await res.json();

        if (!res.ok || json.sent !== 1) {
          await supabase.from("sms_campaign_recipients")
            .update({ status: "failed", error: json.error || "send failed" })
            .eq("id", r.id);
          failedTotal++;
        } else {
          await supabase.from("sms_campaign_recipients")
            .update({
              status: "sent",
              smsapi_id: json.smsapi_id || null,
              points: json.points ?? null,
            })
            .eq("id", r.id);
          sentTotal++;
        }
      } catch (err) {
        const e = err as Error;
        await supabase.from("sms_campaign_recipients")
          .update({ status: "failed", error: e.message })
          .eq("id", r.id);
        failedTotal++;
      }
    });

    await Promise.all(tasks);
  }

  // Final stats + status. (Status DELIVERED zostanie ustawiony przez sms-campaign-receipts.)
  await supabase.rpc("update_sms_campaign_stats", { p_campaign_id: campaignId });

  // Zapisz encoding/parts info (estimate na podstawie ostatecznej treści — głównie body bez wariantów).
  const enc = detectEncoding(campaign.body);
  const parts = countParts(campaign.body, enc);

  await supabase.from("sms_campaigns")
    .update({
      status: "sent",
      completed_at: new Date().toISOString(),
      encoding: enc,
      parts_per_message: parts,
    })
    .eq("id", campaignId);

  return { sent: sentTotal, failed: failedTotal };
}

// --------------------------------------------
// Materializacja odbiorców z segmentów
// --------------------------------------------

async function materializeRecipients(supabase: ReturnType<typeof createClient>, campaign: any) {
  const segments = campaign.segments || [];
  type IncludeInfo = { full_name?: string; phone?: string };
  const includeEmails = new Map<string, IncludeInfo>();
  const includePhonesOnly = new Map<string, IncludeInfo>(); // numery z custom_phone bez emaila
  const excludeEmails = new Set<string>();
  const excludePhones = new Set<string>();

  const [usersR, hgR, hgmR, ministriesR] = await Promise.all([
    supabase.from("app_users").select("email, full_name, campus_id, role, phone"),
    supabase.from("home_groups").select("id, name"),
    supabase.from("home_group_members").select("group_id, email, full_name, phone"),
    fetchMinistries(supabase),
  ]);

  const allUsers = (usersR.data || []) as Array<{
    email: string;
    full_name?: string;
    campus_id?: string;
    role?: string;
    phone?: string;
  }>;
  const homeGroupMembers = (hgmR.data || []) as Array<{
    group_id: string;
    email?: string;
    full_name?: string;
    phone?: string;
  }>;
  const ministries = ministriesR;

  const phoneByEmail = new Map<string, string>();
  allUsers.forEach((u) => { if (u.email && u.phone) phoneByEmail.set(u.email, u.phone); });
  homeGroupMembers.forEach((m) => {
    if (m.email && m.phone && !phoneByEmail.has(m.email)) phoneByEmail.set(m.email, m.phone);
  });

  const collectEmail = (target: Map<string, IncludeInfo> | Set<string>, segment: any) => {
    const add = (email: string, full_name?: string) => {
      if (!email) return;
      const phone = phoneByEmail.get(email);
      if (target instanceof Map) target.set(email, { full_name, phone });
      else target.add(email);
    };
    switch (segment.segment_type) {
      case "all":
        allUsers.forEach((u) => add(u.email, u.full_name));
        break;
      case "campus":
        allUsers.filter((u) => String(u.campus_id) === String(segment.segment_id))
          .forEach((u) => add(u.email, u.full_name));
        break;
      case "ministry": {
        const m = ministries.find((x) => x.key === segment.segment_id);
        m?.members?.forEach((u: any) => add(u.email, u.full_name));
        break;
      }
      case "home_group": {
        homeGroupMembers
          .filter((m: any) => String(m.group_id) === String(segment.segment_id))
          .forEach((m: any) => add(m.email || "", m.full_name));
        break;
      }
      case "role":
        allUsers.filter((u) => u.role === segment.segment_id)
          .forEach((u) => add(u.email, u.full_name));
        break;
      case "custom_email":
        (segment.emails || []).forEach((e: string) => add(e));
        break;
      default:
        break;
    }
  };

  // custom_phone — numery niezwiązane z app_users.
  const collectPhones = (target: Map<string, IncludeInfo> | Set<string>, segment: any) => {
    if (segment.segment_type !== "custom_phone") return;
    (segment.phones || []).forEach((raw: string) => {
      const norm = normalizePhone(raw);
      if (!norm) return;
      if (target instanceof Map) target.set(norm, { phone: norm });
      else target.add(norm);
    });
  };

  segments.forEach((s: any) => {
    if (s.segment_type === "custom_phone") {
      if (s.exclude) collectPhones(excludePhones, s);
      else collectPhones(includePhonesOnly, s);
    } else {
      if (s.exclude) collectEmail(excludeEmails, s);
      else collectEmail(includeEmails, s);
    }
  });

  // Opt-outy z sms_user_preferences (enabled=false).
  const { data: optOuts } = await supabase
    .from("sms_user_preferences")
    .select("user_email, marketing_consent")
    .or("enabled.eq.false,marketing_consent.eq.false");
  optOuts?.forEach((p: any) => {
    if (p.user_email) excludeEmails.add(p.user_email);
  });

  // Frequency cap.
  if (campaign.frequency_cap_per_day) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recentSends } = await supabase
      .from("sms_campaign_recipients")
      .select("phone, status")
      .neq("campaign_id", campaign.id)
      .gte("created_at", since)
      .in("status", ["sent", "delivered", "replied"]);

    const counts = new Map<string, number>();
    (recentSends || []).forEach((r: any) => {
      if (r.phone) counts.set(r.phone, (counts.get(r.phone) || 0) + 1);
    });
    counts.forEach((cnt, phone) => {
      if (cnt >= campaign.frequency_cap_per_day) excludePhones.add(phone);
    });
  }

  // A/B podział.
  const variants = (campaign.ab_variants || []) as Array<{ variant: string; share_percent: number }>;
  const useAB = campaign.ab_test_enabled && variants.length >= 2;

  const rows: any[] = [];
  const seenPhones = new Set<string>();

  // Email-based recipients (resolve phone from app_users).
  for (const [email, info] of includeEmails.entries()) {
    if (excludeEmails.has(email)) continue;
    const normalized = normalizePhone(info.phone || "");
    if (!normalized) {
      rows.push({
        campaign_id: campaign.id,
        user_email: email,
        full_name: info.full_name || null,
        phone: null,
        variant: null,
        status: "suppressed",
        error: "no_phone",
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
      status: "pending",
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
      status: "pending",
    });
  }

  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += 500) {
    await supabase
      .from("sms_campaign_recipients")
      .upsert(rows.slice(i, i + 500), { onConflict: "campaign_id,phone", ignoreDuplicates: true });
  }

  await supabase.from("sms_campaigns")
    .update({ recipient_count: rows.length })
    .eq("id", campaign.id);
}

async function fetchMinistries(supabase: ReturnType<typeof createClient>) {
  const defs = [
    { key: "worship_team", table: "worship_team" },
    { key: "media_team", table: "media_team" },
    { key: "atmosfera_team", table: "atmosfera_members" },
    { key: "kids_ministry", table: "kids_teachers" },
  ];
  const results = await Promise.all(defs.map(async (d) => {
    try {
      const { data } = await supabase.from(d.table).select("email, full_name");
      return { key: d.key, members: data || [] };
    } catch {
      return { key: d.key, members: [] };
    }
  }));
  return results;
}

function pickVariant(variants: Array<{ variant: string; share_percent: number }>): string {
  const rand = Math.random() * 100;
  let cum = 0;
  for (const v of variants) {
    cum += v.share_percent || 0;
    if (rand <= cum) return v.variant;
  }
  return variants[0]?.variant || "A";
}

function isInQuietHours(start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const startMins = parseTime(start);
  const endMins = parseTime(end);
  if (startMins === endMins) return false;
  if (startMins < endMins) return mins >= startMins && mins < endMins;
  return mins >= startMins || mins < endMins;
}

function nextQuietEnd(end?: string | null): Date {
  const d = new Date();
  const [h, m] = (end || "08:00").split(":").map(Number);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
