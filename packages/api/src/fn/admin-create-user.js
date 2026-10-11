// Admin: utwórz konto użytkownika (aktywne, hash po stronie serwera) — NIEZALEŻNIE od trybu
// rejestracji (to admin, nie samodzielny signup). Zastępuje zepsuty flow oparty na auth.signUp.
// Klient po utworzeniu wysyła e-mail „ustaw hasło" (reset-password). Bramka admina serwerowa.
import crypto from 'node:crypto';
import { hashPassword } from '../auth/passwords.js';
import { config } from '../config.js';
import { getCaller, isAdmin } from '../lib/user-admin.js';
import { accountChangeDenied } from '../lib/admin-guard.js';

export const name = 'admin-create-user';
export const isPublic = false;

export default async function handler(req, reply) {
  // 1. Uprawnienia wywołującego — jak edycja kont (admin-update-user): superadmin, rola is_admin
  // albo action:settings:manage_users (np. rada starszych z „*”, która ma is_admin=false;
  // wcześniej dostawała tu 403, choć interfejs pokazywał jej „Dodaj użytkownika”).
  const caller = await getCaller(req.db, req.user.id, req.tenant.db_name);
  if (!isAdmin(caller)) {
    return reply.code(403).send({ error: 'Brak uprawnień do tworzenia kont.' });
  }

  // 2. Walidacja + brak duplikatu.
  const email = String(req.body?.email || '').trim();
  if (!email || !email.includes('@')) return reply.code(400).send({ error: 'Nieprawidłowy e-mail.' });
  const { rows: exist } = await req.db.query('SELECT id FROM app_users WHERE lower(email) = lower($1)', [email]);
  if (exist[0]) return reply.code(409).send({ error: 'Konto z tym adresem e-mail już istnieje.' });

  const full_name = String(req.body?.full_name || '');
  const role = String(req.body?.role || '') || 'czlonek';
  // Bez eskalacji: osoba bez roli administratora nie nada roli admina ani roli z uprawnieniami
  // ustawień, których sama nie ma (lib/admin-guard.js — ta sama reguła co przy edycji konta).
  const denied = await accountChangeDenied(req.db, req.tenant.db_name, caller,
    { id: null, role: null, is_super_admin: false, role_admin: false }, { newRole: role });
  if (denied) return reply.code(403).send({ error: denied });
  const isActive = req.body?.is_active !== false;
  const campusId = req.body?.campus_id || null;
  const totpRequired = req.body?.totp_required === true;
  const randomPw = crypto.randomBytes(24).toString('base64url'); // hasło ustawi user z linku e-mail

  // 3. Utworzenie konta (aktywne od razu — to admin zakłada, e-mail zweryfikowany domyślnie).
  const { rows } = await req.db.query(
    `INSERT INTO app_users
       (email, full_name, name, role, is_active, status, email_verified, password_hash, campus_id, totp_required, invited_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, CASE WHEN $5 THEN now() ELSE NULL END) RETURNING id`,
    // full_name i name to osobne parametry: kolumny mają różne typy (text / varchar), a jeden
    // parametr w obu dawał „inconsistent types deduced for parameter $2” → 500 przy każdym koncie.
    [email, full_name, full_name, role, isActive, isActive ? 'active' : 'blocked', await hashPassword(randomPw), campusId, totpRequired]
  );

  // Zaproszenie: token 7-dniowy + e-mail „ustaw hasło" (dla aktywnych — mają się logować).
  if (isActive) {
    const raw = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    await req.db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
      [rows[0].id, tokenHash]
    );
    const base = `https://${req.tenant.subdomain}.${config.APP_DOMAIN}`;
    const { sendInviteEmail } = await import('../lib/email.js');
    await sendInviteEmail(email, { name: full_name, link: `${base}/reset-password?token=${raw}` }).catch((err) =>
      req.log.error({ err }, 'invite email failed')
    );
  }

  const { logAccountEvent } = await import('../lib/account-audit.js');
  await logAccountEvent(req.db, { email, action: 'created', actor: req.user.email });
  req.log.info({ actor: req.user.email, target: email }, 'admin created user');
  return reply.send({ success: true, id: rows[0].id });
}
