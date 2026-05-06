// Edge Function: push-campaign-receipts
// Co 5 min sprawdza tickety Expo z ostatnich kampanii (push_campaign_recipients.expo_tickets),
// woła https://exp.host/--/api/v2/push/getReceipts i:
//   - oznacza dostarczone jako 'delivered'
//   - oznacza błędy ("MessageRateExceeded", "DeviceNotRegistered" itp.) jako 'failed' + cleanup tokenów
//   - po przetworzeniu czyści listę expo_tickets (raz starczy raz)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const RECEIPTS_BATCH = 1000; // limit Expo

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");

    // Bierzemy recipientów wysłanych w ostatnich 30 minutach z niepustym expo_tickets.
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: rows } = await supabase
      .from("push_campaign_recipients")
      .select("id, campaign_id, expo_tickets")
      .gte("created_at", since)
      .eq("status", "sent");

    if (!rows?.length) return jsonResponse({ message: "no tickets to check", processed: 0 });

    // Zbierz wszystkie ticket_id i mapowanie back to recipient.
    const ticketToRecipient = new Map<string, { recipientId: string; campaignId: string; token: string }>();
    rows.forEach((r: any) => {
      (r.expo_tickets || []).forEach((t: any) => {
        if (t.ticket?.id) {
          ticketToRecipient.set(t.ticket.id, {
            recipientId: r.id,
            campaignId: r.campaign_id,
            token: t.token,
          });
        }
      });
    });

    if (ticketToRecipient.size === 0) return jsonResponse({ message: "no ticket ids", processed: 0 });

    const ticketIds = Array.from(ticketToRecipient.keys());
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    let delivered = 0;
    let failed = 0;
    const tokensToDelete = new Set<string>();
    const campaignsTouched = new Set<string>();

    for (let i = 0; i < ticketIds.length; i += RECEIPTS_BATCH) {
      const batch = ticketIds.slice(i, i + RECEIPTS_BATCH);
      try {
        const res = await fetch(EXPO_RECEIPTS_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({ ids: batch }),
        });
        const json = await res.json();
        const receipts = json?.data || {};

        for (const [tid, receipt] of Object.entries(receipts) as Array<[string, any]>) {
          const ref = ticketToRecipient.get(tid);
          if (!ref) continue;
          campaignsTouched.add(ref.campaignId);

          if (receipt.status === "ok") {
            await supabase
              .from("push_campaign_recipients")
              .update({ status: "delivered", delivered_at: new Date().toISOString() })
              .eq("id", ref.recipientId)
              .eq("status", "sent");
            delivered++;
          } else if (receipt.status === "error") {
            await supabase
              .from("push_campaign_recipients")
              .update({ status: "failed", error: receipt.message || receipt.details?.error })
              .eq("id", ref.recipientId);
            failed++;
            if (receipt.details?.error === "DeviceNotRegistered") {
              tokensToDelete.add(ref.token);
            }
          }
        }
      } catch (err) {
        console.error("receipts batch error:", err);
      }
    }

    // Cleanup expired tokens.
    if (tokensToDelete.size > 0) {
      await supabase.from("push_tokens").delete().in("expo_token", Array.from(tokensToDelete));
    }

    // Refresh aggregates.
    for (const cid of campaignsTouched) {
      await supabase.rpc("update_push_campaign_stats", { p_campaign_id: cid });
    }

    return jsonResponse({ delivered, failed, tokens_removed: tokensToDelete.size });
  } catch (err) {
    const e = err as Error;
    console.error("receipts error:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
