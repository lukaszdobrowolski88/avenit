// Port edge function encrypt-credentials: szyfrowanie haseł kont pocztowych (AES-256-GCM).
// Oryginał: supabase/functions/encrypt-credentials/index.ts.
import { config } from '../config.js';
import { encryptPassword } from '../lib/mailcrypto.js';

export const name = 'encrypt-credentials';

export default async function handler(req, reply) {
  try {
    if (!config.MAIL_ENCRYPTION_SECRET) {
      throw new Error('Brak klucza szyfrowania MAIL_ENCRYPTION_SECRET');
    }

    const { password } = req.body || {};
    if (!password) {
      return reply.code(400).send({ error: 'Brakuje hasła do zaszyfrowania' });
    }

    const encrypted = await encryptPassword(password, config.MAIL_ENCRYPTION_SECRET);

    return reply.send({ encrypted });
  } catch (err) {
    req.log.error({ err }, 'Encryption error');
    return reply.code(500).send({ error: err.message });
  }
}
