// Admin: utwórz konto użytkownika (aktywne, hash po stronie serwera) — NIEZALEŻNIE od trybu
// rejestracji (to admin, nie samodzielny signup). Zastępuje zepsuty flow oparty na auth.signUp.
// Klient po utworzeniu wysyła e-mail „ustaw hasło" (reset-password). Bramka admina serwerowa.
import crypto from 'node:crypto';
import { hashPassword } from '../auth/passwords.js';

export const name = 'admin-create-user';
export const isPublic = false;

export default async function handler(req, reply) {
  // 1. Uprawnienia wywołującego (z żywej bazy — is_super_admin lub app_roles.is_admin).
  const { rows: me } = await req.db.query(
    `SELECT u.is_super_admin, COALESCE(r.is_admin, false) AS role_admin
       FROM app_users u LEFT JOIN app_roles r ON u.role = r.key
      WHERE u.id = $1`,
    [req.user.id]
  );
  const caller = me[0];
  if (!caller || !(caller.is_super_admin || caller.role_admin)) {
    return reply.code(403).send({ error: 'Brak uprawnień do tworzenia kont.' });
  }

  // 2. Walidacja + brak duplikatu.
  const email = String(req.body?.email || '').trim();
  if (!email || !email.includes('@')) return reply.code(400).send({ error: 'Nieprawidłowy e-mail.' });
  const { rows: exist } = await req.db.query('SELECT id FROM app_users WHERE lower(email) = lower($1)', [email]);
  if (exist[0]) return reply.code(409).send({ error: 'Konto z tym adresem e-mail już istnieje.' });

  const full_name = String(req.body?.full_name || '');
  const role = String(req.body?.role || '') || 'czlonek';
  const isActive = req.body?.is_active !== false;
  const campusId = req.body?.campus_id || null;
  const totpRequired = req.body?.totp_required === true;
  const randomPw = crypto.randomBytes(24).toString('base64url'); // hasło ustawi user z linku e-mail

  // 3. Utworzenie konta (aktywne od razu — to admin zakłada, e-mail zweryfikowany domyślnie).
  const { rows } = await req.db.query(
    `INSERT INTO app_users
       (email, full_name, name, role, is_active, status, email_verified, password_hash, campus_id, totp_required)
     VALUES ($1,$2,$2,$3,$4,$5,true,$6,$7,$8) RETURNING id`,
    [email, full_name, role, isActive, isActive ? 'active' : 'blocked', await hashPassword(randomPw), campusId, totpRequired]
  );
  const { logAccountEvent } = await import('../lib/account-audit.js');
  await logAccountEvent(req.db, { email, action: 'created', actor: req.user.email });
  req.log.info({ actor: req.user.email, target: email }, 'admin created user');
  return reply.send({ success: true, id: rows[0].id });
}
