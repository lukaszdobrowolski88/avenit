// Edge Function do wysyłania emaili przez SMTP
// Używa biblioteki denomailer dla Deno
// WAŻNE: Używaj portu 465 (SSL) zamiast 587 (STARTTLS) - STARTTLS ma problemy w Deno Deploy

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendMailPayload {
  account_id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_html: string;
  body_text?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    content_type: string;
  }>;
  reply_to_message_id?: string;
}


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

// Wyślij email przez SMTP
// WAŻNE: Port 465 używa bezpośredniego SSL/TLS, port 587 używa STARTTLS (problematyczny w Deno)
async function sendViaSMTP(
  smtpHost: string,
  smtpPort: number,
  username: string,
  password: string,
  from: string,
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  html: string,
  text: string
): Promise<void> {
  // Port 465 = SSL/TLS od początku (tls: true)
  // Port 587 = STARTTLS (upgrade połączenia) - MA PROBLEMY W DENO DEPLOY!
  // Zawsze wymuszaj port 465 dla bezpieczeństwa
  const useTls = smtpPort === 465;

  if (smtpPort === 587) {
    console.warn("Port 587 (STARTTLS) może nie działać w Deno Deploy. Zalecany port 465 (SSL).");
  }

  console.log(`Łączenie z SMTP: ${smtpHost}:${smtpPort}, TLS: ${useTls}`);

  const client = new SMTPClient({
    connection: {
      hostname: smtpHost,
      port: smtpPort,
      tls: useTls,
      auth: {
        username,
        password,
      },
    },
  });

  try {
    await client.send({
      from,
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      content: text,
      html,
    });
    console.log(`Email wysłany do: ${to.join(", ")}`);
  } finally {
    await client.close();
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

    // Domyślne SMTP dla wysyłki z kont wewnętrznych do zewnętrznych odbiorców
    const DEFAULT_SMTP_HOST = Deno.env.get("DEFAULT_SMTP_HOST");
    const DEFAULT_SMTP_PORT = parseInt(Deno.env.get("DEFAULT_SMTP_PORT") || "465");
    const DEFAULT_SMTP_USER = Deno.env.get("DEFAULT_SMTP_USER");
    const DEFAULT_SMTP_PASS = Deno.env.get("DEFAULT_SMTP_PASS");
    const DEFAULT_SMTP_FROM = Deno.env.get("DEFAULT_SMTP_FROM") || DEFAULT_SMTP_USER;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload: SendMailPayload = await req.json();

    if (!payload.account_id || !payload.to || payload.to.length === 0) {
      return new Response(
        JSON.stringify({ error: "Brakuje wymaganych pól: account_id, to" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pobierz konto email
    const { data: account, error: accountError } = await supabase
      .from("mail_accounts")
      .select("*")
      .eq("id", payload.account_id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: "Nie znaleziono konta email" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentMessageId: string | null = null;
    const bodyText = payload.body_text || payload.body_html?.replace(/<[^>]*>/g, "") || "";

    // Dla poczty wewnętrznej
    if (account.account_type === "internal") {
      // Znajdź folder "Sent"
      const { data: sentFolder } = await supabase
        .from("mail_folders")
        .select("id")
        .eq("account_id", payload.account_id)
        .eq("type", "sent")
        .single();

      if (!sentFolder) {
        return new Response(
          JSON.stringify({ error: "Nie znaleziono folderu Wysłane" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Zapisz wiadomość w folderze "Sent"
      const { data: sentMessage, error: sendError } = await supabase
        .from("mail_messages")
        .insert({
          account_id: payload.account_id,
          folder_id: sentFolder.id,
          from_email: account.user_email,
          from_name: account.user_email.split("@")[0],
          to_emails: payload.to,
          cc_emails: payload.cc || [],
          bcc_emails: payload.bcc || [],
          subject: payload.subject || "(brak tematu)",
          body_html: payload.body_html,
          body_text: bodyText,
          snippet: bodyText.substring(0, 200),
          is_read: true,
          sent_at: new Date().toISOString(),
          received_at: new Date().toISOString()
        })
        .select()
        .single();

      if (sendError) throw sendError;
      sentMessageId = sentMessage.id;

      // Dostarcz do wewnętrznych odbiorców
      const internalRecipients: string[] = [];
      const externalRecipients: string[] = [];

      for (const recipientEmail of payload.to) {
        const { data: recipientAccount } = await supabase
          .from("mail_accounts")
          .select("id")
          .eq("user_email", recipientEmail)
          .eq("account_type", "internal")
          .maybeSingle();

        if (recipientAccount) {
          internalRecipients.push(recipientEmail);

          // Znajdź folder Inbox odbiorcy
          const { data: inboxFolder } = await supabase
            .from("mail_folders")
            .select("id")
            .eq("account_id", recipientAccount.id)
            .eq("type", "inbox")
            .single();

          if (inboxFolder) {
            await supabase.from("mail_messages").insert({
              account_id: recipientAccount.id,
              folder_id: inboxFolder.id,
              from_email: account.user_email,
              from_name: account.user_email.split("@")[0],
              to_emails: payload.to,
              cc_emails: payload.cc || [],
              bcc_emails: payload.bcc || [],
              subject: payload.subject || "(brak tematu)",
              body_html: payload.body_html,
              body_text: bodyText,
              snippet: bodyText.substring(0, 200),
              is_read: false,
              sent_at: new Date().toISOString(),
              received_at: new Date().toISOString()
            });

            // Aktualizuj licznik
            const { count } = await supabase
              .from("mail_messages")
              .select("*", { count: "exact", head: true })
              .eq("folder_id", inboxFolder.id)
              .eq("is_read", false);

            await supabase
              .from("mail_folders")
              .update({ unread_count: count || 0 })
              .eq("id", inboxFolder.id);
          }
        } else {
          externalRecipients.push(recipientEmail);
        }
      }

      // Wyślij do zewnętrznych odbiorców przez domyślne SMTP
      if (externalRecipients.length > 0 && DEFAULT_SMTP_HOST && DEFAULT_SMTP_USER && DEFAULT_SMTP_PASS) {
        try {
          await sendViaSMTP(
            DEFAULT_SMTP_HOST,
            DEFAULT_SMTP_PORT,
            DEFAULT_SMTP_USER,
            DEFAULT_SMTP_PASS,
            DEFAULT_SMTP_FROM || DEFAULT_SMTP_USER,
            externalRecipients,
            payload.cc || [],
            payload.bcc || [],
            payload.subject || "(brak tematu)",
            payload.body_html,
            bodyText
          );
          console.log(`Wysłano przez SMTP do: ${externalRecipients.join(", ")}`);
        } catch (smtpError) {
          console.error("SMTP error:", smtpError);
          // Nie przerywaj - wiadomość została zapisana lokalnie
        }
      } else if (externalRecipients.length > 0) {
        console.warn("Brak konfiguracji SMTP - wiadomości do zewnętrznych odbiorców nie zostaną wysłane:", externalRecipients);
      }

    } else {
      // Dla kont zewnętrznych - użyj SMTP skonfigurowanego dla tego konta
      if (!account.smtp_host || !account.encrypted_password || !MAIL_ENCRYPTION_SECRET) {
        return new Response(
          JSON.stringify({ error: "Brak konfiguracji SMTP dla tego konta" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Odszyfruj hasło
      const password = await decryptPassword(account.encrypted_password, MAIL_ENCRYPTION_SECRET);

      // Wyślij przez SMTP
      await sendViaSMTP(
        account.smtp_host,
        account.smtp_port || 465,
        account.external_email,
        password,
        account.external_email,
        payload.to,
        payload.cc || [],
        payload.bcc || [],
        payload.subject || "(brak tematu)",
        payload.body_html,
        bodyText
      );

      // Zapisz wysłaną wiadomość
      const { data: sentFolder } = await supabase
        .from("mail_folders")
        .select("id")
        .eq("account_id", payload.account_id)
        .eq("type", "sent")
        .single();

      if (sentFolder) {
        const { data: msg } = await supabase
          .from("mail_messages")
          .insert({
            account_id: payload.account_id,
            folder_id: sentFolder.id,
            from_email: account.external_email,
            from_name: account.external_email?.split("@")[0],
            to_emails: payload.to,
            cc_emails: payload.cc || [],
            bcc_emails: payload.bcc || [],
            subject: payload.subject || "(brak tematu)",
            body_html: payload.body_html,
            body_text: bodyText,
            snippet: bodyText.substring(0, 200),
            is_read: true,
            sent_at: new Date().toISOString(),
            received_at: new Date().toISOString()
          })
          .select()
          .single();

        sentMessageId = msg?.id || null;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Wiadomość wysłana",
        message_id: sentMessageId
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const err = error as Error;
    console.error("Send mail error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
