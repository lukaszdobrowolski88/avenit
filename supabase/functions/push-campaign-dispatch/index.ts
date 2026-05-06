// Edge Function: push-campaign-dispatch
// Worker odpalany przez pg_cron co minutę. Dla każdej "scheduled" kampanii,
// której scheduled_at <= NOW():
//   1. zaznacza status='sending' (lock SKIP LOCKED),
//   2. materializuje listę odbiorców z segmentów,
//   3. fan-out do edge function send-push batchami,
//   4. tworzy wpisy w `notifications` (inbox),
//   5. ustawia status='sent' + agreguje stats.
//
// Może być wołany też ręcznie z UI: { campaign_id, force: true }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_CAMPAIGNS_PER_TICK = 5;
const FANOUT_BATCH = 50; // ile pushy fan-outujemy równolegle

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await safeJson(req);
    const targetIds: string[] = [];

    if (body?.campaign_id) {
      // Wymuszone wywołanie z UI ("Wyślij teraz").
      targetIds.push(body.campaign_id);
    } else {
      // Pickup zaplanowanych.
      const { data: due } = await supabase
        .from("push_campaigns")
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
        const result = await processCampaign(supabase, id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        results.push({ id, ...result });
      } catch (err) {
        const e = err as Error;
        console.error(`Campaign ${id} failed:`, e);
        await supabase.from("push_campaigns")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", id);
        results.push({ id, error: e.message });
      }
    }

    return jsonResponse({ processed: results.length, results });
  } catch (err) {
    const e = err as Error;
    console.error("dispatch error:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});

async function processCampaign(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  // 1. Zablokuj kampanię (status -> sending, jeśli jeszcze nie).
  const { data: campaign } = await supabase
    .from("push_campaigns")
    .select(`*, segments:push_campaign_segments(*), actions:push_campaign_actions(*), ab_variants:push_campaign_ab_variants(*)`)
    .eq("id", campaignId)
    .single();

  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "sent" || campaign.status === "cancelled") {
    return { skipped: true, reason: campaign.status };
  }

  if (campaign.status !== "sending") {
    await supabase.from("push_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  // 2. Materializuj odbiorców (jeśli jeszcze nie istnieją).
  const { count: existingCount } = await supabase
    .from("push_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (!existingCount || existingCount === 0) {
    await materializeRecipients(supabase, campaign);
  }

  // 3. Fan-out do send-push.
  const { data: pending } = await supabase
    .from("push_campaign_recipients")
    .select("id, user_email, variant")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"]);

  const actionsForPayload = (campaign.actions || [])
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((a: any) => ({
      label: a.label,
      action_type: a.action_type,
      action_value: a.action_value,
    }));

  const variantMap = new Map<string, { title: string; body: string }>();
  (campaign.ab_variants || []).forEach((v: any) => {
    variantMap.set(v.variant, { title: v.title, body: v.body });
  });

  let sentTotal = 0;
  let failedTotal = 0;

  for (let i = 0; i < (pending?.length || 0); i += FANOUT_BATCH) {
    const batch = pending!.slice(i, i + FANOUT_BATCH);

    const tasks = batch.map(async (r: any) => {
      const variantOverride = r.variant ? variantMap.get(r.variant) : null;
      const title = variantOverride?.title || campaign.title;
      const body = variantOverride?.body || campaign.body;

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
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
          }),
        });

        const json = await res.json();

        if (!res.ok || (json.sent === 0 && json.failed > 0)) {
          await supabase.from("push_campaign_recipients")
            .update({ status: "failed", error: json.error || "send failed" })
            .eq("id", r.id);
          failedTotal++;
        } else if (json.sent > 0) {
          await supabase.from("push_campaign_recipients")
            .update({
              status: "sent",
              channels: { mobile: json.channels?.mobile?.sent || 0, web: json.channels?.web?.sent || 0 },
              expo_tickets: json.channels?.mobile?.tickets || [],
            })
            .eq("id", r.id);
          sentTotal++;
        } else {
          // sent === 0, failed === 0 — brak zarejestrowanych urządzeń.
          await supabase.from("push_campaign_recipients")
            .update({ status: "suppressed", error: "no devices" })
            .eq("id", r.id);
        }
      } catch (err) {
        const e = err as Error;
        await supabase.from("push_campaign_recipients")
          .update({ status: "failed", error: e.message })
          .eq("id", r.id);
        failedTotal++;
      }
    });

    await Promise.all(tasks);
  }

  // 4. Wpisy do inboxu (notifications) — tylko dla skutecznie wysłanych.
  await createInboxEntries(supabase, campaign);

  // 5. Final stats + status.
  await supabase.rpc("update_push_campaign_stats", { p_campaign_id: campaignId });
  await supabase.from("push_campaigns")
    .update({ status: "sent", completed_at: new Date().toISOString() })
    .eq("id", campaignId);

  return { sent: sentTotal, failed: failedTotal };
}

// --------------------------------------------
// Materializacja odbiorców z segmentów
// --------------------------------------------

async function materializeRecipients(supabase: ReturnType<typeof createClient>, campaign: any) {
  const segments = campaign.segments || [];
  const includeEmails = new Map<string, { full_name?: string }>();
  const excludeEmails = new Set<string>();

  // Pobierz dane źródłowe.
  const [usersR, hgR, hgmR, ministriesR] = await Promise.all([
    supabase.from("app_users").select("email, full_name, campus_id, role"),
    supabase.from("home_groups").select("id, name"),
    supabase.from("home_group_members").select("group_id, email, full_name"),
    fetchMinistries(supabase),
  ]);

  const allUsers = (usersR.data || []) as Array<{ email: string; full_name?: string; campus_id?: string; role?: string }>;
  const homeGroupMembers = hgmR.data || [];
  const ministries = ministriesR;

  const collectInto = (target: Map<string, { full_name?: string }> | Set<string>, segment: any) => {
    const add = (email: string, full_name?: string) => {
      if (!email) return;
      if (target instanceof Map) target.set(email, { full_name });
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
          .forEach((m: any) => add(m.email, m.full_name));
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

  segments.forEach((s: any) => {
    if (s.exclude) collectInto(excludeEmails, s);
    else collectInto(includeEmails, s);
  });

  // Opt-outy z push_user_preferences.
  const { data: optOuts } = await supabase
    .from("push_user_preferences")
    .select("user_email")
    .eq("enabled", false);
  optOuts?.forEach((p: any) => excludeEmails.add(p.user_email));

  // Frequency cap (kampania wysłała mniej niż N pushy w 24h temu temu samemu).
  if (campaign.frequency_cap_per_day) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recentSends } = await supabase
      .from("push_campaign_recipients")
      .select("user_email, status")
      .neq("campaign_id", campaign.id)
      .gte("created_at", since)
      .in("status", ["sent", "delivered", "opened", "action_clicked"]);

    const counts = new Map<string, number>();
    (recentSends || []).forEach((r: any) => {
      counts.set(r.user_email, (counts.get(r.user_email) || 0) + 1);
    });
    counts.forEach((cnt, email) => {
      if (cnt >= campaign.frequency_cap_per_day) excludeEmails.add(email);
    });
  }

  // Quiet hours — gdy NOW jest w "ciszy", suppress (push poczeka na następny tick crona).
  if (isInQuietHours(campaign.quiet_hours_start, campaign.quiet_hours_end)) {
    // Re-schedule kampanię na koniec quiet hours zamiast wysyłać.
    const nextRun = nextQuietEnd(campaign.quiet_hours_end);
    await supabase.from("push_campaigns")
      .update({ status: "scheduled", scheduled_at: nextRun.toISOString() })
      .eq("id", campaign.id);
    throw new Error(`Quiet hours active — rescheduled to ${nextRun.toISOString()}`);
  }

  const finalEmails = Array.from(includeEmails.entries())
    .filter(([email]) => !excludeEmails.has(email));

  if (finalEmails.length === 0) return;

  // A/B podział.
  const variants = (campaign.ab_variants || []) as Array<{ variant: string; share_percent: number }>;
  const useAB = campaign.ab_test_enabled && variants.length >= 2;

  const rows = finalEmails.map(([email, info]) => ({
    campaign_id: campaign.id,
    user_email: email,
    full_name: info.full_name || null,
    variant: useAB ? pickVariant(variants) : null,
    status: "pending",
  }));

  // Insert w paczkach po 500 (limit Supabase).
  for (let i = 0; i < rows.length; i += 500) {
    await supabase
      .from("push_campaign_recipients")
      .upsert(rows.slice(i, i + 500), { onConflict: "campaign_id,user_email", ignoreDuplicates: true });
  }

  // Snapshot recipient_count od razu.
  await supabase.from("push_campaigns")
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
  // Wrap przez północ (np. 22:00 → 06:00).
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

// --------------------------------------------
// Inbox entries (notifications)
// --------------------------------------------

async function createInboxEntries(supabase: ReturnType<typeof createClient>, campaign: any) {
  const { data: recipients } = await supabase
    .from("push_campaign_recipients")
    .select("user_email")
    .eq("campaign_id", campaign.id)
    .in("status", ["sent", "delivered", "opened", "action_clicked"]);

  if (!recipients?.length) return;

  const rows = recipients.map((r: any) => ({
    user_email: r.user_email,
    type: "system",
    title: campaign.title,
    body: campaign.body,
    link: campaign.link,
    push_campaign_id: campaign.id,
    is_read: false,
    created_at: new Date().toISOString(),
  }));

  // Best effort — jeśli notifications nie ma kolumny push_campaign_id albo jakichś pól, łykamy.
  try {
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from("notifications").insert(rows.slice(i, i + 500));
    }
  } catch (err) {
    console.warn("Inbox insert failed (non-fatal):", err);
  }
}

async function safeJson(req: Request): Promise<any> {
  try { return await req.json(); } catch { return null; }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
