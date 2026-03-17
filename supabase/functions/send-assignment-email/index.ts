import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resend API
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("MAILING_FROM_EMAIL") || "grafik@schwro.pl";
const FROM_NAME = Deno.env.get("MAILING_FROM_NAME") || "Church Manager";

// Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Wyslij email przez Resend API
async function sendViaResend(
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
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

    return { success: true, messageId: data.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Generuj HTML emaila
function generateEmailHtml(params: {
  assignedName: string;
  assignedByName: string;
  roleName: string;
  programTitle: string;
  programDate: string;
  acceptUrl: string;
  rejectUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zaproszenie do służby</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #ec4899 0%, #f97316 100%); border-radius: 16px; margin: 0 auto 16px auto; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 28px;">🎵</span>
              </div>
              <h1 style="margin: 0 0 8px 0; color: #1f2937; font-size: 24px; font-weight: 700;">
                Zaproszenie do służby
              </h1>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                ${params.assignedByName} przypisał/a Cię do służby
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; padding: 20px;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Data</span>
                    <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                      ${params.programDate}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Służba</span>
                    <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                      ${params.roleName}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Program</span>
                    <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                      ${params.programTitle}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Buttons -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <a href="${params.acceptUrl}" style="display: block; padding: 14px 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; text-align: center; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                      ✓ Akceptuję
                    </a>
                  </td>
                </tr>
                <tr>
                  <td>
                    <a href="${params.rejectUrl}" style="display: block; padding: 14px 24px; background: linear-gradient(135deg, #f97316 0%, #ef4444 100%); color: #ffffff; text-decoration: none; text-align: center; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);">
                      ✗ Odrzucam
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 16px 16px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Ten email został wysłany automatycznie z Church Manager.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      to,
      assignedName,
      assignedByName,
      roleName,
      programId,
      acceptUrl,
      rejectUrl
    } = await req.json();

    // Walidacja
    if (!to || !assignedName || !roleName || !programId || !acceptUrl || !rejectUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pobierz dane programu z Supabase (service role key omija RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: program, error: programError } = await supabase
      .from("programs")
      .select("date")
      .eq("id", programId)
      .single();

    if (programError || !program) {
      console.error("Error fetching program:", programError);
      return new Response(
        JSON.stringify({ error: "Program not found", details: programError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Formatuj datę
    const programDate = new Date(program.date).toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    const programTitle = "Nabożeństwo";

    // Sprawdz czy Resend jest skonfigurowany
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service not configured",
          details: "RESEND_API_KEY is not set"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generuj HTML
    const htmlContent = generateEmailHtml({
      assignedName,
      assignedByName: assignedByName || "Administrator",
      roleName,
      programTitle: programTitle || "Nabożeństwo",
      programDate,
      acceptUrl,
      rejectUrl
    });

    // Temat emaila
    const subject = `Zaproszenie do służby: ${roleName} - ${programDate}`;

    // Wyslij email
    const result = await sendViaResend(to, subject, htmlContent);

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
