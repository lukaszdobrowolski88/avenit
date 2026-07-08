// Szyfrowanie/deszyfrowanie poświadczeń pocztowych (SMTP/IMAP) — AES-256-GCM.
// Port WebCrypto z edge functions: encrypt-credentials / send-mail / sync-mail / test-smtp.
// UWAGA: sól PBKDF2 "church-manager-mail-v1" MUSI pozostać bez zmian — istniejące
// zaszyfrowane hasła w produkcji muszą się dalej odszyfrowywać.

const PBKDF2_SALT = 'church-manager-mail-v1';
const PBKDF2_ITERATIONS = 100000;

// Wyprowadzenie klucza AES-256-GCM z sekretu (PBKDF2 + SHA-256) — identycznie jak w Deno.
async function deriveKey(secret) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const salt = encoder.encode(PBKDF2_SALT);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Szyfruje tekst jawny -> base64(IV(12B) + ciphertext).
export async function encryptPassword(plaintext, secret) {
  const key = await deriveKey(secret);
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Losowy IV (12 bajtów dla GCM).
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);

  return Buffer.from(combined).toString('base64');
}

// Deszyfruje base64(IV + ciphertext) -> tekst jawny.
export async function decryptPassword(encryptedPassword, secret) {
  try {
    const combined = Uint8Array.from(Buffer.from(encryptedPassword, 'base64'));
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    const key = await deriveKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedData);

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Nie można odszyfrować hasła');
  }
}
