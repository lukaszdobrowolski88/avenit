import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SendGrid API
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = Deno.env.get("MAILING_FROM_EMAIL") || "formularze@schwro.pl";
const FROM_NAME = Deno.env.get("MAILING_FROM_NAME") || "Formularze";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Wyslij email przez SendGrid API
async function sendViaSendGrid(
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: subject,
        content: [{ type: "text/html", value: htmlContent }],
      }),
    });

    if (response.status !== 202) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: (data as any)?.errors?.[0]?.message || "SendGrid error" };
    }

    const messageId = response.headers.get("x-message-id") || undefined;
    return { success: true, messageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, html, type, formId, responseId } = await req.json();

    // Walidacja
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sprawdz czy SendGrid jest skonfigurowany
    if (!SENDGRID_API_KEY) {
      console.log("SENDGRID_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service not configured",
          details: "SENDGRID_API_KEY is not set"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Wyslij email
    const result = await sendViaSendGrid(to, subject, html);

    // Opcjonalnie: zapisz log w bazie danych
    if (formId && responseId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      await supabase
        .from("form_email_logs")
        .insert({
          form_id: formId,
          response_id: responseId,
          email_type: type,
          recipient: to,
          subject: subject,
          status: result.success ? "sent" : "failed",
          message_id: result.messageId || null,
          error_message: result.error || null,
          sent_at: result.success ? new Date().toISOString() : null
        });
    }

    if (result.success) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Email sent successfully",
          messageId: result.messageId
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Server Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
