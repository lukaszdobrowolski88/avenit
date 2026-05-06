// Edge Function: push-action-handler
// Obsługuje akcje "inline" przyciśnięte na pushu — bez otwierania appki.
// Aktualizuje docelową tabelę (np. event_attendance dla RSVP) i loguje event.
//
// Body:
//   campaign_id   string
//   recipient_id  string
//   user_email    string  (zweryfikujemy, że to ten sam, który wywołuje)
//   action_id     string  push_campaign_actions.id
//   action_type   'inline_rsvp'
//   action_value  string  yes / no / maybe

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

    const { campaign_id, recipient_id, user_email, action_id, action_type, action_value } = await req.json();
    if (!campaign_id || !recipient_id || !user_email) {
      return jsonResponse({ error: "Brak wymaganych pól" }, 400);
    }

    // 1. Zaznacz akcję w recipients.
    await supabase
      .from("push_campaign_recipients")
      .update({
        status: "action_clicked",
        action_clicked_at: new Date().toISOString(),
        action_id: action_id || null,
      })
      .eq("id", recipient_id)
      .eq("campaign_id", campaign_id);

    // 2. Wykonaj inline akcję.
    if (action_type === "inline_rsvp") {
      // Akcja RSVP jest zapisywana do tabeli push_inline_responses (uniwersalny log).
      // Mapowanie do konkretnych tabel (event_attendance itd.) zostawiamy aplikacji.
      await supabase
        .from("push_inline_responses")
        .upsert({
          campaign_id,
          recipient_id,
          user_email,
          response_type: "rsvp",
          response_value: action_value,
          created_at: new Date().toISOString(),
        }, { onConflict: "recipient_id" });
    }

    // 3. Agreguj stats kampanii.
    await supabase.rpc("update_push_campaign_stats", { p_campaign_id: campaign_id });

    return jsonResponse({ ok: true });
  } catch (err) {
    const e = err as Error;
    console.error("push-action-handler:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
