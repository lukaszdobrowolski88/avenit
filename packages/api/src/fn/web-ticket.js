// „Otwórz na webie" z mobilki bez ponownego logowania. Zalogowany (po 2FA —
// block2FAPending w preHandlerze) dostaje jednorazowy bilet ważny 60 s dla SIEBIE,
// w SWOIM tenancie; web wymienia ?ticket= na sesję na dowolnej ścieżce (App.jsx initAuth).
// Ten sam mechanizm co app-login.js (bilet w login_tickets, w bazie tylko hash).
//
// Body: { path?: '/media' } — tylko ścieżka względna w obrębie tenanta (bez hosta),
// żeby endpoint nie dało się użyć jako otwartego przekierowania.
// Brak wpisu w FN_CAPABILITY => requireUser.
import crypto from 'node:crypto';
import { config } from '../config.js';

export const name = 'web-ticket';
export const method = 'POST';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Dozwolone: "/", "/media", "/projekty?board=1", "/module/faceci". Odrzucamy "//host",
// schematy i znaki sterujące.
function safePath(raw) {
  const p = typeof raw === 'string' ? raw.trim() : '';
  if (!p) return '/';
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\')) return '/';
  if (!/^[\w\-./?=&%~+]*$/.test(p)) return '/';
  return p;
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const userId = req.user?.id;
  if (!userId) return reply.code(401).send({ error: 'Brak sesji' });

  const path = safePath(req.body?.path);
  const raw = crypto.randomBytes(32).toString('base64url');
  await req.db.query(
    `INSERT INTO login_tickets (user_id, code_hash, expires_at)
     VALUES ($1, $2, now() + interval '60 seconds')`,
    [userId, sha256(raw)]
  );
  const sep = path.includes('?') ? '&' : '?';
  return reply.send({
    url: `https://${req.tenant.subdomain}.${config.APP_DOMAIN}${path}${sep}ticket=${raw}`,
  });
}
