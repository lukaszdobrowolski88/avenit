// Edge Function do wysyłania push notifications
// Wywoływana przez trigger w bazie danych lub bezpośrednio

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Web Push - używamy biblioteki dla Deno
import * as webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  user_email: string;
  title: string;
  body: string;
  link?: string;
  tag?: string;
  icon?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Pobierz zmienne środowiskowe
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") || "mailto:admin@example.com";

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error("Brak kluczy VAPID");
    }

    // Konfiguracja web-push
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Parsuj body
    const payload: PushPayload = await req.json();

    if (!payload.user_email || !payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: "Brakuje wymaganych pól: user_email, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Połącz z Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pobierz subskrypcje użytkownika
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_email", payload.user_email);

    if (subError) {
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "Brak subskrypcji push dla tego użytkownika", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Przygotuj payload powiadomienia
    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: payload.tag || "default",
      data: {
        link: payload.link || "/"
      }
    });

    // Wyślij do wszystkich urządzeń użytkownika
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, notificationPayload);
          return { success: true, endpoint: sub.endpoint };
        } catch (err: unknown) {
          // Jeśli subskrypcja wygasła, usuń ją
          const error = err as { statusCode?: number; message?: string };
          if (error.statusCode === 410 || error.statusCode === 404) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          }
          return { success: false, endpoint: sub.endpoint, error: error.message };
        }
      })
    );

    const successful = results.filter(
      (r) => r.status === "fulfilled" && (r.value as { success: boolean }).success
    ).length;
    const failed = results.length - successful;

    return new Response(
      JSON.stringify({
        message: `Wysłano ${successful} powiadomień, ${failed} niepowodzeń`,
        sent: successful,
        failed: failed,
        results: results.map((r) => r.status === "fulfilled" ? r.value : { error: "unknown" })
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const err = error as Error;
    console.error("Błąd wysyłania push:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
