// Edge Function: send-sms
// Wysyła pojedynczy SMS przez bramkę SMSAPI.pl.
//
// Input (JSON):
//   { phone, message, sender?, campaign_id?, recipient_id?, variant? }
//
// Output:
//   { sent: 0|1, smsapi_id?, points?, parts?, error? }
//
// Konfiguracja: czytana z tabeli `integration_settings` (klucze smsapi_*)
// z fallbackiem na ENV (SMSAPI_TOKEN, SMSAPI_DEFAULT_SENDER, SMSAPI_API_URL).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  getSmsConfig,
  jsonResponse,
  normalizePhone,
  safeJson,
  sendSmsViaSmsapi,
} from "../_shared/sms.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const config = await getSmsConfig(supabase);

    if (!config.token) {
      return jsonResponse({ sent: 0, error: "SMSAPI token not configured (set in app settings)" }, 500);
    }

    const body = await safeJson(req);
    if (!body) return jsonResponse({ sent: 0, error: "invalid JSON body" }, 400);

    const { phone, message, sender } = body;
    if (!message || !String(message).trim()) {
      return jsonResponse({ sent: 0, error: "message is required" }, 400);
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return jsonResponse({ sent: 0, error: "invalid_phone" }, 400);
    }

    const finalSender = (sender && String(sender).trim()) || config.defaultSender;

    const result = await sendSmsViaSmsapi({
      token: config.token,
      apiUrl: config.apiUrl,
      phone: normalized,
      message: String(message),
      sender: finalSender,
    });

    if (!result.ok) {
      return jsonResponse({ sent: 0, error: result.error || "send failed" });
    }

    return jsonResponse({
      sent: 1,
      smsapi_id: result.smsapi_id,
      points: result.points,
      parts: result.parts,
    });
  } catch (err) {
    const e = err as Error;
    console.error("send-sms error:", e);
    return jsonResponse({ sent: 0, error: e.message }, 500);
  }
});
