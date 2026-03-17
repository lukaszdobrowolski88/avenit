import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    let bodyData;
    try {
      bodyData = JSON.parse(rawBody);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Received keys:", Object.keys(bodyData));

    const { emailTo, subject, htmlBody, pdfUrl, filename, filePath } = bodyData;

    if (!emailTo || emailTo.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing emailTo field or empty recipients list" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!htmlBody) {
      return new Response(
        JSON.stringify({ error: "Missing htmlBody field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inicjalizuj Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pobierz PDF z Supabase Storage i przekonwertuj na base64
    const attachments: Array<{ content: string; filename: string }> = [];

    if (filePath) {
      try {
        console.log("Downloading PDF from Supabase Storage:", filePath);

        // Pobierz plik z Storage używając service role key (pełne uprawnienia)
        const { data: pdfData, error: downloadError } = await supabase
          .storage
          .from('programs')
          .download(filePath);

        if (downloadError) {
          throw new Error(`Failed to download PDF: ${downloadError.message}`);
        }

        // Konwertuj Blob do ArrayBuffer, potem do base64
        const arrayBuffer = await pdfData.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const pdfBase64 = btoa(binary);

        attachments.push({
          content: pdfBase64,
          filename: filename || "program.pdf",
        });

        console.log(`PDF downloaded successfully (${bytes.length} bytes) and converted to base64`);
      } catch (error: any) {
        console.error("Error downloading PDF from Supabase:", error);
        return new Response(
          JSON.stringify({ error: "Failed to download PDF from Supabase Storage", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (pdfUrl) {
      // Fallback: Jeśli nie ma filePath, spróbuj pobrać z URL
      try {
        console.log("Fetching PDF from URL:", pdfUrl);
        const pdfResponse = await fetch(pdfUrl);

        if (!pdfResponse.ok) {
          throw new Error(`Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
        }

        const pdfArrayBuffer = await pdfResponse.arrayBuffer();
        const bytes = new Uint8Array(pdfArrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const pdfBase64 = btoa(binary);

        attachments.push({
          content: pdfBase64,
          filename: filename || "program.pdf",
        });

        console.log("PDF fetched from URL and converted to base64 successfully");
      } catch (error: any) {
        console.error("Error fetching PDF:", error);
        return new Response(
          JSON.stringify({ error: "Failed to fetch PDF from URL", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Wyślij email przez Resend API
    console.log("Sending email to:", emailTo);
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "App SchWro <program@schwro.pl>",
        to: emailTo,
        subject: subject || "Program nabożeństwa",
        html: htmlBody,
        attachments: attachments,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API Error:", resendData);
      return new Response(
        JSON.stringify({ error: "Resend API Error", details: resendData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", resendData);
    return new Response(JSON.stringify(resendData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Server Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
