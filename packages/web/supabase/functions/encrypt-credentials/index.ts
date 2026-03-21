// Edge Function do szyfrowania poświadczeń email
// Używa AES-256-GCM dla bezpiecznego szyfrowania haseł

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-256-GCM encryption
async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  // Combine IV + encrypted data and encode as base64
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);

  return btoa(String.fromCharCode(...combined));
}

// Derive key from secret
async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Use a fixed salt (in production, store this separately)
  const salt = encoder.encode("church-manager-mail-v1");

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get encryption secret from environment
    const ENCRYPTION_SECRET = Deno.env.get("MAIL_ENCRYPTION_SECRET");

    if (!ENCRYPTION_SECRET) {
      throw new Error("Brak klucza szyfrowania MAIL_ENCRYPTION_SECRET");
    }

    // Parse request body
    const { password } = await req.json();

    if (!password) {
      return new Response(
        JSON.stringify({ error: "Brakuje hasła do zaszyfrowania" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Derive encryption key from secret
    const key = await deriveKey(ENCRYPTION_SECRET);

    // Encrypt the password
    const encrypted = await encrypt(password, key);

    return new Response(
      JSON.stringify({ encrypted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const err = error as Error;
    console.error("Encryption error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
