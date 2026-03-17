// Edge Function do synchronizacji poczty przez IMAP
// UWAGA: IMAP w Deno Deploy może być niestabilny - używaj portu 993 (SSL)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1.0.162";
import { simpleParser } from "npm:mailparser@3.6.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Funkcja do usuwania problematycznych znaków Unicode (null characters, itp.)
// PostgreSQL nie akceptuje \u0000 w tekście
function sanitizeText(text: string | null | undefined): string | null {
  if (!text) return null;
  // Usuń null characters i inne problematyczne znaki kontrolne
  return text
    .replace(/\u0000/g, '') // null character
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // inne znaki kontrolne oprócz \t \n \r
}

interface SyncMailPayload {
  account_id: string;
  action?: "sync" | "test";
  folder?: string;
  limit?: number;
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

// Pobierz wiadomości z IMAP
async function fetchImapMessages(
  host: string,
  port: number,
  user: string,
  password: string,
  folder: string = "INBOX",
  limit: number = 50,
  lastUid?: number
): Promise<any[]> {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
  });

  const messages: any[] = [];

  try {
    await client.connect();
    console.log("Połączono z IMAP: " + host + ":" + port);

    const lock = await client.getMailboxLock(folder);

    try {
      // Pobierz najnowsze wiadomości (od końca)
      const mailbox = client.mailbox;
      const total = mailbox?.exists || 0;
      
      if (total === 0) {
        return messages;
      }

      const startSeq = Math.max(1, total - limit + 1);
      const range = startSeq + ":*";

      for await (const message of client.fetch(range, {
        uid: true,
        envelope: true,
        source: true,
        flags: true,
      })) {
        // Pomijaj wiadomości już zsynchronizowane
        if (lastUid && message.uid <= lastUid) continue;

        // Parsuj wiadomość
        const parsed = await simpleParser(message.source);

        messages.push({
          uid: message.uid,
          messageId: parsed.messageId || message.envelope?.messageId,
          from: parsed.from?.value?.[0] || { address: message.envelope?.from?.[0]?.address, name: message.envelope?.from?.[0]?.name },
          to: parsed.to?.value || message.envelope?.to?.map((t: any) => ({ address: t.address, name: t.name })) || [],
          cc: parsed.cc?.value || [],
          subject: parsed.subject || message.envelope?.subject || "(brak tematu)",
          date: parsed.date || message.envelope?.date,
          html: parsed.html || null,
          text: parsed.text || null,
          attachments: parsed.attachments?.map((att: any) => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
          })) || [],
          flags: message.flags,
          isRead: message.flags?.has("\\Seen") || false,
          isStarred: message.flags?.has("\\Flagged") || false,
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log("Pobrano " + messages.length + " wiadomości z IMAP");

    return messages;
  } catch (error) {
    console.error("IMAP error:", error);
    try {
      await client.logout();
    } catch (_) {}
    throw error;
  }
}

// Test połączenia IMAP
async function testImapConnection(
  host: string,
  port: number,
  user: string,
  password: string
): Promise<{ success: boolean; message: string; folders?: string[] }> {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    console.log("Test IMAP: połączono z " + host);

    // Pobierz listę folderów - list() zwraca Promise<ListResponse[]>
    const folderList = await client.list();
    const folders: string[] = folderList.map((f: any) => f.path);

    await client.logout();

    return {
      success: true,
      message: "Połączenie OK. Znaleziono " + folders.length + " folderów.",
      folders,
    };
  } catch (error: any) {
    console.error("IMAP test error:", error);
    try {
      await client.logout();
    } catch (_) {}
    return {
      success: false,
      message: error.message || "Nie można połączyć z serwerem IMAP",
    };
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
        JSON.stringify({ error: "Brak klucza szyfrowania" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const payload: SyncMailPayload = await req.json();

    if (!payload.account_id) {
      return new Response(
        JSON.stringify({ error: "Brak account_id" }),
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

    if (account.account_type !== "external") {
      return new Response(
        JSON.stringify({ error: "Synchronizacja IMAP dostępna tylko dla kont zewnętrznych" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!account.imap_host || !account.encrypted_password) {
      return new Response(
        JSON.stringify({ error: "Brak konfiguracji IMAP dla tego konta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Odszyfruj hasło
    const password = await decryptPassword(account.encrypted_password, MAIL_ENCRYPTION_SECRET);

    // Test połączenia
    if (payload.action === "test") {
      const result = await testImapConnection(
        account.imap_host,
        account.imap_port || 993,
        account.external_email,
        password
      );

      return new Response(
        JSON.stringify(result),
        { status: result.success ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Synchronizacja
    const folder = payload.folder || "INBOX";
    const limit = payload.limit || 50;

    // Pobierz folder docelowy (inbox)
    const { data: inboxFolder } = await supabase
      .from("mail_folders")
      .select("id")
      .eq("account_id", payload.account_id)
      .eq("type", "inbox")
      .single();

    if (!inboxFolder) {
      return new Response(
        JSON.stringify({ error: "Nie znaleziono folderu Inbox" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pobierz ostatni UID
    const { data: lastMessage } = await supabase
      .from("mail_messages")
      .select("imap_uid")
      .eq("account_id", payload.account_id)
      .not("imap_uid", "is", null)
      .order("imap_uid", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastUid = lastMessage?.imap_uid || 0;

    // Pobierz wiadomości z IMAP
    const messages = await fetchImapMessages(
      account.imap_host,
      account.imap_port || 993,
      account.external_email,
      password,
      folder,
      limit,
      lastUid
    );

    // Zapisz wiadomości do bazy
    let savedCount = 0;
    for (const msg of messages) {
      // Sprawdź czy wiadomość już istnieje
      const { data: existing } = await supabase
        .from("mail_messages")
        .select("id")
        .eq("account_id", payload.account_id)
        .eq("imap_uid", msg.uid)
        .maybeSingle();

      if (existing) continue;

      // Sanitize text fields to remove null characters
      const sanitizedHtml = sanitizeText(msg.html);
      const sanitizedText = sanitizeText(msg.text);
      const bodyText = sanitizedText || sanitizedHtml?.replace(/<[^>]*>/g, "") || "";
      const sanitizedSubject = sanitizeText(msg.subject) || "(brak tematu)";

      try {
        const { error: insertError } = await supabase
          .from("mail_messages")
          .insert({
            account_id: payload.account_id,
            folder_id: inboxFolder.id,
            imap_uid: msg.uid,
            message_id: sanitizeText(msg.messageId),
            from_email: sanitizeText(msg.from?.address) || "",
            from_name: sanitizeText(msg.from?.name) || "",
            to_emails: msg.to?.map((t: any) => sanitizeText(t.address) || "").filter(Boolean) || [],
            cc_emails: msg.cc?.map((c: any) => sanitizeText(c.address) || "").filter(Boolean) || [],
            subject: sanitizedSubject,
            body_html: sanitizedHtml,
            body_text: bodyText,
            snippet: bodyText.substring(0, 200),
            is_read: msg.isRead,
            is_starred: msg.isStarred,
            received_at: msg.date ? new Date(msg.date).toISOString() : new Date().toISOString(),
          });

        if (!insertError) {
          savedCount++;
        } else {
          console.error("Error saving message:", insertError);
        }
      } catch (saveErr) {
        console.error("Exception saving message:", saveErr);
      }
    }

    // Aktualizuj licznik nieprzeczytanych
    const { count: unreadCount } = await supabase
      .from("mail_messages")
      .select("*", { count: "exact", head: true })
      .eq("folder_id", inboxFolder.id)
      .eq("is_read", false);

    await supabase
      .from("mail_folders")
      .update({ unread_count: unreadCount || 0 })
      .eq("id", inboxFolder.id);

    // Aktualizuj datę ostatniej synchronizacji
    await supabase
      .from("mail_accounts")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", payload.account_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Zsynchronizowano " + savedCount + " nowych wiadomości",
        fetched: messages.length,
        saved: savedCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const err = error as Error;
    console.error("Sync mail error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
