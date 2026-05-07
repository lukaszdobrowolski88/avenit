// Edge Function: sms-incoming-webhook
// Publiczny endpoint dla SMSAPI MO (Mobile Originated) callback. SMSAPI woła ten URL
// gdy odbiorca odpowie na SMS z naszej kampanii.
//
// Konfiguracja: w panelu SMSAPI → MO callback → URL:
//   https://<project>.supabase.co/functions/v1/sms-incoming-webhook?secret=<SMSAPI_WEBHOOK_SECRET>
//
// Logika:
//   1. parsuje POST/GET (form-urlencoded lub query) z polami sms_from, sms_text, MsgId
//   2. lookup ostatniego recipienta o tym phone (lookback 7 dni, status sent/delivered)
//   3. mapuje treść: TAK/YES/T/Y/1 → 'yes', NIE/NO/N/0 → 'no', inne → raw 'reply'
//   4. zapisuje do sms_inline_responses + ustawia recipient.status='replied'
//
// Bezpieczeństwo: query param ?secret=... vs ENV SMSAPI_WEBHOOK_SECRET.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  getSmsConfig,
  jsonResponse,
  normalizePhone,
} from "../_shared/sms.ts";

const REPLY_LOOKBACK_DAYS = 7;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const config = await getSmsConfig(supabase);

    const url = new URL(req.url);
    if (config.webhookSecret) {
      const got = url.searchParams.get("secret");
      if (got !== config.webhookSecret) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
    }

    // SMSAPI wysyła zwykle GET-em z query, ale obsługujemy też POST form-data / JSON.
    let smsFrom = "";
    let smsText = "";
    let msgId = "";
    let smsTo = "";

    if (req.method === "GET") {
      smsFrom = url.searchParams.get("sms_from") || "";
      smsText = url.searchParams.get("sms_text") || "";
      msgId = url.searchParams.get("MsgId") || url.searchParams.get("msg_id") || "";
      smsTo = url.searchParams.get("sms_to") || "";
    } else {
      const ctype = req.headers.get("content-type") || "";
      if (ctype.includes("application/json")) {
        const json = await req.json().catch(() => ({}));
        smsFrom = String(json.sms_from || "");
        smsText = String(json.sms_text || "");
        msgId = String(json.MsgId || json.msg_id || "");
        smsTo = String(json.sms_to || "");
      } else {
        const fd = await req.formData().catch(() => null);
        smsFrom = String(fd?.get("sms_from") || "");
        smsText = String(fd?.get("sms_text") || "");
        msgId = String(fd?.get("MsgId") || fd?.get("msg_id") || "");
        smsTo = String(fd?.get("sms_to") || "");
      }
    }

    console.log("SMS MO incoming:", { smsFrom, smsTo, msgId, len: smsText.length });

    const phone = normalizePhone(smsFrom);
    if (!phone) {
      return jsonResponse({ ok: false, error: "invalid sender phone" }, 400);
    }

    if (!smsText.trim()) {
      return jsonResponse({ ok: false, error: "empty message" }, 400);
    }

    // Lookup recipienta — ostatni rekord dla tego telefonu w oknie czasu.
    const since = new Date(Date.now() - REPLY_LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
    const { data: recipients } = await supabase
      .from("sms_campaign_recipients")
      .select("id, campaign_id, user_email, status")
      .eq("phone", phone)
      .in("status", ["sent", "delivered", "replied"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);

    const recipient = recipients?.[0];

    // Klasyfikacja odpowiedzi.
    const normalized = smsText.trim().toUpperCase();
    let responseType: "rsvp" | "reply" = "reply";
    let responseValue = smsText.trim();

    const yesTokens = ["TAK", "YES", "T", "Y", "1", "OK", "POTWIERDZAM"];
    const noTokens = ["NIE", "NO", "N", "0", "ANULUJ"];

    if (yesTokens.some((t) => normalized === t || normalized.startsWith(t + " "))) {
      responseType = "rsvp";
      responseValue = "yes";
    } else if (noTokens.some((t) => normalized === t || normalized.startsWith(t + " "))) {
      responseType = "rsvp";
      responseValue = "no";
    }

    // Insert do log-table.
    await supabase.from("sms_inline_responses").insert({
      campaign_id: recipient?.campaign_id || null,
      recipient_id: recipient?.id || null,
      user_email: recipient?.user_email || null,
      phone,
      smsapi_msg_id: msgId || null,
      response_type: responseType,
      response_value: responseValue,
      raw_text: smsText,
      metadata: { sms_to: smsTo },
    });

    // Mark recipient jako 'replied'.
    if (recipient?.id) {
      await supabase
        .from("sms_campaign_recipients")
        .update({ status: "replied", replied_at: new Date().toISOString() })
        .eq("id", recipient.id);

      await supabase.rpc("update_sms_campaign_stats", { p_campaign_id: recipient.campaign_id });
    }

    return jsonResponse({ ok: true, matched: !!recipient, response_type: responseType });
  } catch (err) {
    const e = err as Error;
    console.error("sms-incoming-webhook error:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});
