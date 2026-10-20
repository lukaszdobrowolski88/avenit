// Ustawienia → Użytkownicy: wyślij osobie e-mail z linkiem do ustawienia nowego hasła.
// Audyt uprawnień 2026-10, runda 6: cudze hasło WPROST ustawia już tylko pełny administrator
// (fn admin-set-user-password) — osoba z samym action:settings:manage_users mogła ustawić hasło
// zwykłemu kontu i zalogować się jako ono. Teraz wysyła link: hasło ustawia właściciel konta
// ze swojej skrzynki (ten sam token co „Nie pamiętam hasła” — /reset-password?token=…,
// potwierdzenie POST /api/auth/reset-password/confirm), a dotychczasowe hasło działa do tej chwili.
// Bramka jak przy edycji kont: isAdmin (superadmin / rola is_admin / manage_users) + bez ruszania
// konta administratora lub konta z szerszymi uprawnieniami (lib/admin-guard.js).
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getCaller, isAdmin, loadTarget } from '../lib/user-admin.js';
import { accountChangeDenied } from '../lib/admin-guard.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'admin-send-password-reset';
export const isPublic = false;

// Link wysłany przez obsługę kont — dłużej niż „Nie pamiętam hasła” (1 h): osoba może przeczytać
// pocztę później. Jednorazowy (used_at), jak każdy token resetu.
export const RESET_LINK_HOURS = 24;
// Bez zasypywania skrzynki: kolejny link dla tej samej osoby najwcześniej po minucie.
const THROTTLE_SECONDS = 60;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function orgName(db) {
  try {
    const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'org_name' LIMIT 1`);
    return String(rows[0]?.value || '').trim();
  } catch {
    return '';
  }
}

export function makeHandler({ sendMail } = {}) {
  return async function handler(req, reply) {
    const caller = await getCaller(req.db, req.user.id, req.tenant.db_name);
    if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });

    const userId = String(req.body?.userId || '');
    if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
    const target = await loadTarget(req.db, userId);
    if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });
    if (target.is_super_admin && !caller.is_super_admin) {
      return reply.code(403).send({ error: 'Tylko super-administrator może resetować hasło super-administratora.' });
    }
    const denied = await accountChangeDenied(req.db, req.tenant.db_name, caller, target);
    if (denied) return reply.code(403).send({ error: denied });
    if (!target.is_active) {
      return reply.code(400).send({ error: 'Konto jest zablokowane — najpierw je odblokuj.' });
    }
    if (!target.email || !String(target.email).includes('@')) {
      return reply.code(400).send({ error: 'Konto nie ma adresu e-mail.' });
    }

    const { rows: recent } = await req.db.query(
      `SELECT 1 FROM password_reset_tokens
        WHERE user_id = $1 AND used_at IS NULL AND created_at > now() - make_interval(secs => $2) LIMIT 1`,
      [userId, THROTTLE_SECONDS]
    );
    if (recent[0]) return reply.code(429).send({ error: 'Link został wysłany przed chwilą. Spróbuj ponownie za minutę.' });

    const raw = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(raw);
    await req.db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(hours => $3))`,
      [userId, tokenHash, RESET_LINK_HOURS]
    );
    const link = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}/reset-password?token=${raw}`;
    try {
      const send = sendMail || (await import('../lib/email.js')).sendAdminPasswordResetEmail;
      await send(target.email, { name: target.full_name || '', link, hours: RESET_LINK_HOURS, orgName: await orgName(req.db) });
    } catch (err) {
      // Bez wysłanego maila token jest bezużyteczny — usuwamy go i mówimy o tym wprost.
      await req.db.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]).catch(() => {});
      req.log?.error?.({ err }, 'admin password reset email failed');
      return reply.code(502).send({ error: 'Nie udało się wysłać e-maila. Spróbuj ponownie później.' });
    }

    await logAccountEvent(req.db, { email: target.email, action: 'password_reset_link', actor: caller.email });
    req.log?.info?.({ actor: caller.email, target: target.email }, 'admin sent password reset link');
    return reply.send({ success: true, email: target.email });
  };
}

export default makeHandler();
