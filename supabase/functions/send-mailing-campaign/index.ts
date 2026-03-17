import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resend API
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = Deno.env.get("MAILING_FROM_EMAIL") || "newsletter@schwro.pl";
const FROM_NAME = Deno.env.get("MAILING_FROM_NAME") || "Społeczność Chrześcijańska";
const BASE_URL = Deno.env.get("APP_BASE_URL") || "https://app.schwro.pl";
const CHURCH_NAME = Deno.env.get("CHURCH_NAME") || "Społeczność Chrześcijańska";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Wyślij email przez Resend API
async function sendViaResend(
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: to,
        subject: subject,
        html: htmlContent,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || "Resend error" };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Personalizuj HTML dla konkretnego odbiorcy
function personalizeHtml(
  htmlTemplate: string,
  recipient: { email: string; full_name: string | null },
  campaignId: string
): string {
  const firstName = recipient.full_name?.split(" ")[0] || "";
  const lastName = recipient.full_name?.split(" ").slice(1).join(" ") || "";
  const unsubscribeUrl = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(
    recipient.email
  )}&campaign=${campaignId}`;

  const variables: Record<string, string> = {
    "{{imie}}": firstName,
    "{{nazwisko}}": lastName,
    "{{email}}": recipient.email || "",
    "{{data}}": new Date().toLocaleDateString("pl-PL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    "{{kosciol}}": CHURCH_NAME,
    "{{unsubscribe_url}}": unsubscribeUrl,
  };

  let personalizedHtml = htmlTemplate;
  Object.entries(variables).forEach(([key, value]) => {
    personalizedHtml = personalizedHtml.split(key).join(value);
  });

  return personalizedHtml;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { campaign_id, batch_size = 50, test_email, test_subject, test_html_content } = await req.json();

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "No email provider configured",
          details: "Configure RESEND_API_KEY in Supabase secrets",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Obsługa wysyłki testowej bezpośredniej (bez zapisywania kampanii)
    if (test_email && test_subject && test_html_content) {
      const personalizedHtml = personalizeHtml(
        test_html_content,
        { email: test_email, full_name: "Test User" },
        "test-preview"
      );

      const result = await sendViaResend(test_email, `[TEST] ${test_subject}`, personalizedHtml);

      return new Response(
        JSON.stringify({
          message: result.success ? "Test email sent" : "Test email failed",
          success: result.success,
          error: result.error
        }),
        { status: result.success ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "Missing campaign_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pobierz kampanię
    const { data: campaign, error: campaignError } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campaign not found", details: campaignError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obsługa wysyłki testowej z zapisanej kampanii
    if (test_email) {
      const personalizedHtml = personalizeHtml(
        campaign.html_content,
        { email: test_email, full_name: "Test User" },
        campaign_id
      );

      const result = await sendViaResend(test_email, `[TEST] ${campaign.subject}`, personalizedHtml);

      return new Response(
        JSON.stringify({
          message: result.success ? "Test email sent" : "Test email failed",
          success: result.success,
          error: result.error
        }),
        { status: result.success ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sprawdź status kampanii
    if (campaign.status !== "sending" && campaign.status !== "scheduled") {
      return new Response(
        JSON.stringify({ error: "Campaign is not in sending or scheduled status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pobierz odbiorców ze statusem 'pending' (batch)
    const { data: recipients, error: recipientsError } = await supabase
      .from("email_campaign_recipients")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending")
      .limit(batch_size);

    if (recipientsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch recipients", details: recipientsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!recipients || recipients.length === 0) {
      // Wszystkie emaile wysłane - zaktualizuj status kampanii
      await supabase
        .from("email_campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", campaign_id);

      return new Response(
        JSON.stringify({ message: "All emails sent", campaign_status: "sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aktualizuj status kampanii na 'sending'
    if (campaign.status === "scheduled") {
      await supabase
        .from("email_campaigns")
        .update({ status: "sending" })
        .eq("id", campaign_id);
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
      provider: "Resend",
    };

    // Wysyłaj emaile pojedynczo
    for (const recipient of recipients) {
      const personalizedHtml = personalizeHtml(
        campaign.html_content,
        { email: recipient.email, full_name: recipient.full_name },
        campaign_id
      );

      const result = await sendViaResend(recipient.email, campaign.subject, personalizedHtml);

      if (result.success) {
        // Sukces - zaktualizuj status odbiorcy
        await supabase
          .from("email_campaign_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", recipient.id);

        results.sent++;
      } else {
        // Błąd - zaktualizuj status odbiorcy
        await supabase
          .from("email_campaign_recipients")
          .update({
            status: "failed",
            error_message: result.error || "Unknown error",
          })
          .eq("id", recipient.id);

        results.failed++;
        results.errors.push(`${recipient.email}: ${result.error || "Unknown error"}`);
      }

      // Małe opóźnienie między emailami (Resend rate limit: 10/s)
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // Sprawdź czy są jeszcze odbiorcy do wysłania
    const { count: remainingCount } = await supabase
      .from("email_campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    const isComplete = remainingCount === 0;

    if (isComplete) {
      await supabase
        .from("email_campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", campaign_id);
    }

    return new Response(
      JSON.stringify({
        message: isComplete ? "Campaign sending complete" : "Batch sent, more to go",
        batch_results: results,
        remaining: remainingCount,
        campaign_status: isComplete ? "sent" : "sending",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Server Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
