// Edge Function do testowania połączenia SMTP
// Pobiera konfigurację z bazy danych i testuje połączenie

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Funkcja deszyfrowania hasła
async function decryptPassword(encryptedPassword: string, secret: string): Promise<string> {
  try {
    const combined = Uint8Array.from(atob(encryptedPassword), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );

    const salt = encoder.encode("church-manager-mail-v1");
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Nie można odszyfrować hasła");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MAIL_ENCRYPTION_SECRET = Deno.env.get("MAIL_ENCRYPTION_SECRET");

    if (!MAIL_ENCRYPTION_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Brak klucza szyfrowania MAIL_ENCRYPTION_SECRET" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { config_id } = await req.json();

    if (!config_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Brak config_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pobierz konfigurację SMTP z bazy
    const { data: config, error: configError } = await supabase
      .from("app_smtp_config")
      .select("*")
      .eq("id", config_id)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "Nie znaleziono konfiguracji SMTP" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.smtp_pass_encrypted) {
      return new Response(
        JSON.stringify({ success: false, error: "Brak hasła w konfiguracji" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Odszyfruj hasło
    const password = await decryptPassword(config.smtp_pass_encrypted, MAIL_ENCRYPTION_SECRET);

    // Testuj połączenie SMTP
    const useTls = config.smtp_port === 465 || config.smtp_secure === true;

    const client = new SMTPClient({
      connection: {
        hostname: config.smtp_host,
        port: config.smtp_port,
        tls: useTls,
        auth: {
          username: config.smtp_user,
          password,
        },
      },
    });

    try {
      // Wyślij testowego maila do siebie
      await client.send({
        from: config.smtp_from,
        to: [config.smtp_user],
        subject: "Test połączenia SMTP - Church Manager",
        content: "To jest wiadomość testowa z Church Manager.\n\nJeśli otrzymałeś ten email, konfiguracja SMTP działa poprawnie!",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #ec4899;">Test połączenia SMTP</h2>
            <p>To jest wiadomość testowa z <strong>Church Manager</strong>.</p>
            <p style="color: #22c55e;">✓ Jeśli otrzymałeś ten email, konfiguracja SMTP działa poprawnie!</p>
            <hr style="margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
              Serwer: ${config.smtp_host}:${config.smtp_port}<br>
              Użytkownik: ${config.smtp_user}<br>
              Data testu: ${new Date().toLocaleString('pl-PL')}
            </p>
          </div>
        `,
      });

      await client.close();

      // Zaktualizuj status testu w bazie
      await supabase
        .from("app_smtp_config")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: "success",
          last_test_error: null
        })
        .eq("id", config_id);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Email testowy wysłany na ${config.smtp_user}`
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (smtpError: unknown) {
      const err = smtpError as Error;
      console.error("SMTP test error:", err);

      // Zaktualizuj status błędu w bazie
      await supabase
        .from("app_smtp_config")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: "failed",
          last_test_error: err.message
        })
        .eq("id", config_id);

      try {
        await client.close();
      } catch (_) {
        // Ignoruj błędy zamykania
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `Błąd SMTP: ${err.message}`
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    const err = error as Error;
    console.error("Test SMTP error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
