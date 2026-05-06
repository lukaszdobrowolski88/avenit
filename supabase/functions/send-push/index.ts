// Edge Function: send-push
// Wysyła powiadomienie push do jednego użytkownika (mobile via Expo + web via VAPID).
// Wywoływana bezpośrednio z UI ("Test send", "Wyślij teraz" — pojedyncze)
// oraz z workera push-campaign-dispatch (broadcast batchami).
//
// Body:
//   user_email     string   wymagane
//   title          string   wymagane
//   body           string   wymagane
//   link?          string   domyślny deep link
//   tag?           string   collapse key
//   icon?          string
//   big_image?     string
//   category_id?   string   klucz kategorii Expo (cm_open_link / cm_rsvp_yes_no / ...)
//   data?          object   dodatkowy payload
//   actions?       array    przyciski akcji (web only — mobile używa categoryId)
//   campaign_id?   string   id kampanii (do trackingu)
//   recipient_id?  string   id rekordu push_campaign_recipients
//   variant?       string   A/B variant
//
// Response:
//   { sent: number, failed: number, channels: { mobile: { sent, failed, tickets[] }, web: { sent, failed } } }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

interface PushAction {
  label: string;
  action_type: "deep_link" | "inline_rsvp" | "open_form" | "external_url";
  action_value?: string;
}

interface SendPushBody {
  user_email: string;
  title: string;
  body: string;
  link?: string;
  tag?: string;
  icon?: string;
  big_image?: string;
  category_id?: string;
  data?: Record<string, unknown>;
  actions?: PushAction[];
  campaign_id?: string;
  recipient_id?: string;
  variant?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") || "mailto:admin@example.com";
    const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN");

    const payload: SendPushBody = await req.json();

    if (!payload.user_email || !payload.title || !payload.body) {
      return jsonResponse({ error: "Brakuje wymaganych pól: user_email, title, body" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Wspólne dane przekazywane do mobile + web.
    const sharedData = {
      ...(payload.data || {}),
      link: payload.link,
      campaign_id: payload.campaign_id,
      recipient_id: payload.recipient_id,
      variant: payload.variant,
      actions: payload.actions || [],
    };

    // === MOBILE (Expo) ===
    const mobileResult = await sendExpo(supabase, payload, sharedData, EXPO_ACCESS_TOKEN);

    // === WEB (VAPID) ===
    const webResult = VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
      ? await sendWeb(supabase, payload, sharedData, { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL })
      : { sent: 0, failed: 0, results: [] };

    const totalSent = mobileResult.sent + webResult.sent;
    const totalFailed = mobileResult.failed + webResult.failed;

    return jsonResponse({
      message: `Wysłano ${totalSent} powiadomień, ${totalFailed} niepowodzeń`,
      sent: totalSent,
      failed: totalFailed,
      channels: {
        mobile: mobileResult,
        web: webResult,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("send-push error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});

// =============================================================
// MOBILE — Expo Push API
// =============================================================

async function sendExpo(
  supabase: ReturnType<typeof createClient>,
  payload: SendPushBody,
  sharedData: Record<string, unknown>,
  accessToken: string | undefined,
) {
  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("id, expo_token, platform")
    .eq("user_email", payload.user_email);

  if (error || !tokens || tokens.length === 0) {
    return { sent: 0, failed: 0, results: [], tickets: [] };
  }

  // Expo wymaga tokenów w formacie ExponentPushToken[xxx] albo ExpoPushToken[xxx].
  const valid = tokens.filter((t: any) => /^Expo(nent)?PushToken\[/.test(t.expo_token));
  if (valid.length === 0) {
    return { sent: 0, failed: 0, results: [], tickets: [] };
  }

  const messages = valid.map((t: any) => ({
    to: t.expo_token,
    title: payload.title,
    body: payload.body,
    sound: "default" as const,
    priority: "high" as const,
    channelId: "default",
    categoryId: payload.category_id,
    data: sharedData,
    badge: undefined as number | undefined,
  }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let sent = 0;
  let failed = 0;
  const allTickets: Array<{ token: string; ticket: ExpoTicket }> = [];
  const invalidTokens: string[] = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const batchTokens = valid.slice(i, i + EXPO_BATCH_SIZE);

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });

      const json = await res.json();
      const tickets: ExpoTicket[] = Array.isArray(json?.data) ? json.data : [];

      tickets.forEach((ticket, idx) => {
        const token = batchTokens[idx]?.expo_token;
        allTickets.push({ token, ticket });
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
          if (ticket.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(token);
          }
        }
      });
    } catch (err) {
      console.error("Expo batch error:", err);
      failed += batch.length;
    }
  }

  // Czyszczenie martwych tokenów.
  if (invalidTokens.length > 0) {
    await supabase.from("push_tokens").delete().in("expo_token", invalidTokens);
  }

  return {
    sent,
    failed,
    tickets: allTickets,
    results: allTickets.map(({ token, ticket }) => ({
      token,
      success: ticket.status === "ok",
      ticket_id: ticket.id,
      error: ticket.message,
    })),
  };
}

// =============================================================
// WEB — VAPID / web-push
// =============================================================

async function sendWeb(
  supabase: ReturnType<typeof createClient>,
  payload: SendPushBody,
  sharedData: Record<string, unknown>,
  vapid: { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_EMAIL: string },
) {
  webpush.setVapidDetails(vapid.VAPID_EMAIL, vapid.VAPID_PUBLIC_KEY, vapid.VAPID_PRIVATE_KEY);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_email", payload.user_email);

  if (error || !subs || subs.length === 0) {
    return { sent: 0, failed: 0, results: [] };
  }

  // Web Notification API: max 2 actions, każdy musi mieć { action, title, icon? }.
  const webActions = (payload.actions || []).slice(0, 2).map((a, idx) => ({
    action: `${a.action_type}:${a.action_value ?? idx}`,
    title: a.label,
  }));

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192x192.png",
    badge: "/icon-192x192.png",
    image: payload.big_image,
    tag: payload.tag || "default",
    actions: webActions,
    data: sharedData,
  });

  let sent = 0;
  let failed = 0;
  const results: Array<{ endpoint: string; success: boolean; error?: string }> = [];

  await Promise.all(
    subs.map(async (sub: any) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, notificationPayload);
        sent++;
        results.push({ endpoint: sub.endpoint, success: true });
      } catch (err: unknown) {
        failed++;
        const e = err as { statusCode?: number; message?: string };
        results.push({ endpoint: sub.endpoint, success: false, error: e.message });
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }),
  );

  return { sent, failed, results };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
