// Edge Function: sms-campaign-receipts
// Co 5 min sprawdza statusy doręczenia w SMSAPI dla wysłanych SMS-ów i:
//   - oznacza dostarczone jako 'delivered'
//   - oznacza błędy (FAILED/REJECTED/EXPIRED/UNDELIVERED) jako 'failed'
// Po przetworzeniu odświeża agregaty kampanii.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  fetchSmsStatuses,
  getSmsConfig,
  jsonResponse,
  mapSmsapiStatus,
} from "../_shared/sms.ts";

const STATUS_BATCH = 100; // SMSAPI: rozsądny limit per request
const LOOKBACK_HOURS = 24;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const config = await getSmsConfig(supabase);

    if (!config.token) {
      return jsonResponse({ error: "SMSAPI token not configured (set in app settings)" }, 500);
    }

    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();
    const { data: rows } = await supabase
      .from("sms_campaign_recipients")
      .select("id, campaign_id, smsapi_id")
      .eq("status", "sent")
      .not("smsapi_id", "is", null)
      .gte("created_at", since);

    if (!rows?.length) {
      return jsonResponse({ message: "no recipients to check", processed: 0 });
    }

    const idToRecipient = new Map<string, { recipientId: string; campaignId: string }>();
    rows.forEach((r: any) => {
      if (r.smsapi_id) {
        idToRecipient.set(String(r.smsapi_id), { recipientId: r.id, campaignId: r.campaign_id });
      }
    });

    const allIds = Array.from(idToRecipient.keys());
    let delivered = 0;
    let failed = 0;
    const campaignsTouched = new Set<string>();

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

          if (mapped === "delivered") {
            await supabase
              .from("sms_campaign_recipients")
              .update({ status: "delivered", delivered_at: new Date().toISOString() })
              .eq("id", ref.recipientId)
              .eq("status", "sent");
            delivered++;
          } else if (mapped === "failed") {
            await supabase
              .from("sms_campaign_recipients")
              .update({ status: "failed", error: s.error || s.status })
              .eq("id", ref.recipientId);
            failed++;
          }
        }
      } catch (err) {
        console.error("sms receipts batch error:", err);
      }
    }

    for (const cid of campaignsTouched) {
      await supabase.rpc("update_sms_campaign_stats", { p_campaign_id: cid });
    }

    return jsonResponse({ delivered, failed, checked: allIds.length });
  } catch (err) {
    const e = err as Error;
    console.error("sms receipts error:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});
