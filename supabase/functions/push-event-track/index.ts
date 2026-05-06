// Edge Function: push-event-track
// Endpoint dla logowania zdarzeń: opened / action_clicked / dismissed.
// Wywoływana z mobile (NotificationResponseReceived) i web service workera.
//
// Body:
//   campaign_id   string  wymagane
//   recipient_id  string  wymagane
//   event         'opened' | 'action_clicked' | 'dismissed'
//   action_id?    string  (gdy event=action_clicked)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { campaign_id, recipient_id, event, action_id } = await req.json();
    if (!campaign_id || !recipient_id || !event) {
      return jsonResponse({ error: "Brak campaign_id/recipient_id/event" }, 400);
    }

    const update: Record<string, unknown> = {};
    const now = new Date().toISOString();

    switch (event) {
      case "delivered":
        update.status = "delivered";
        update.delivered_at = now;
        break;
      case "opened":
        update.status = "opened";
        update.opened_at = now;
        break;
      case "action_clicked":
        update.status = "action_clicked";
        update.action_clicked_at = now;
        if (action_id) update.action_id = action_id;
        break;
      case "dismissed":
        // Nie zmieniamy statusu — tylko logujemy gdyby było potrzebne.
        break;
      default:
        return jsonResponse({ error: "Nieznany event" }, 400);
    }

    if (Object.keys(update).length > 0) {
      // Nie cofamy statusu (opened > delivered > sent).
      const order = { pending: 0, queued: 1, suppressed: 1, sent: 2, delivered: 3, opened: 4, action_clicked: 5, failed: -1 };
      const { data: current } = await supabase
        .from("push_campaign_recipients")
        .select("status")
        .eq("id", recipient_id)
        .eq("campaign_id", campaign_id)
        .maybeSingle();

      const currentRank = order[(current?.status || "pending") as keyof typeof order] ?? 0;
      const newRank = order[(update.status as keyof typeof order)] ?? 0;
      if (newRank >= currentRank) {
        await supabase
          .from("push_campaign_recipients")
          .update(update)
          .eq("id", recipient_id)
          .eq("campaign_id", campaign_id);
      }
    }

    // Agreguj statystyki (rzadko, np. co 10. event można by debounce'ować).
    await supabase.rpc("update_push_campaign_stats", { p_campaign_id: campaign_id });

    return jsonResponse({ ok: true });
  } catch (err) {
    const e = err as Error;
    console.error("push-event-track:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
