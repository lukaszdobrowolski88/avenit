// Globalne logowanie z app.<domena>: użytkownik podaje e-mail+hasło, backend
// znajduje tenanta (kościół), do którego należy konto, i wystawia jednorazowy
// bilet SSO → przekierowanie na subdomenę kościoła, gdzie bilet jest wymieniany
// na sesję. Jeden e-mail może istnieć w wielu kościołach (wtedy wybór).
//
// UWAGA skalowalność: iterujemy po aktywnych tenantach i sprawdzamy konto w
// każdej bazie. Dla dziesiątek kościołów jest to w porządku; przy setkach warto
// dodać globalny indeks e-mail→tenant w bazie platform.
import crypto from 'node:crypto';
import { z } from 'zod';
import { platformPool, getTenantPool } from '../db.js';
import { verifyPassword } from './passwords.js';
import { verifyTOTP, consumeBackupCode } from './totp.js';
import { config } from '../config.js';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
  tenant: z.string().optional(), // wybrany kościół (gdy konto w wielu)
});

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export default async function appLoginRoutes(app) {
  app.post(
    '/api/app-login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'Nieprawidłowe dane' });
      const { email, password, totpCode, tenant: chosen } = body.data;

      const { rows: tenants } = await platformPool.query(
        `SELECT slug, subdomain, db_name, name, status, trial_ends_at
           FROM tenants WHERE status IN ('trial', 'active')`
      );

      // Znajdź wszystkie kościoły, w których (e-mail + hasło) pasują.
      const matches = [];
      for (const t of tenants) {
        if (chosen && chosen !== t.subdomain && chosen !== t.slug) continue;
        let user;
        try {
          const pool = getTenantPool(t.db_name);
          const { rows } = await pool.query(
            `SELECT id, email, full_name, role, is_active, password_hash,
                    totp_enabled, totp_secret, totp_backup_codes, auth_user_id
               FROM app_users WHERE lower(email) = lower($1)`,
            [email]
          );
          user = rows[0];
        } catch (err) {
          req.log.warn({ err, tenant: t.slug }, 'app-login: błąd zapytania do bazy tenanta');
          continue;
        }
        if (!user || !user.is_active) continue;
        if (!(await verifyPassword(password, user.password_hash))) continue;
        matches.push({ tenant: t, user });
      }

      // Jednolity komunikat — nie zdradzamy istnienia konta.
      if (matches.length === 0) {
        return reply.code(401).send({ error: 'Błędny e-mail lub hasło' });
      }

      // Konto w wielu kościołach i brak wyboru → poproś o wybór.
      if (matches.length > 1 && !chosen) {
        return reply.send({
          multiple: true,
          tenants: matches.map((m) => ({ slug: m.tenant.subdomain, name: m.tenant.name })),
        });
      }

      const match = matches[0];

      // 2FA (jeśli włączone dla tego konta).
      if (match.user.totp_enabled) {
        if (!totpCode) {
          return reply.send({ requires2fa: true, tenant: match.tenant.subdomain });
        }
        let ok = match.user.totp_secret && verifyTOTP(match.user.totp_secret, totpCode);
        if (!ok) {
          const backup = consumeBackupCode(match.user.totp_backup_codes, totpCode);
          if (backup.ok) {
            ok = true;
            await getTenantPool(match.tenant.db_name).query(
              `UPDATE app_users SET totp_backup_codes = $1 WHERE id = $2`,
              [JSON.stringify(backup.updated), match.user.id]
            );
          }
        }
        if (!ok) return reply.code(401).send({ error: 'Nieprawidłowy kod weryfikacyjny' });
      }

      // Wystaw jednorazowy bilet w bazie tenanta (ważny 60 s).
      const raw = crypto.randomBytes(32).toString('base64url');
      await getTenantPool(match.tenant.db_name).query(
        `INSERT INTO login_tickets (user_id, code_hash, expires_at)
         VALUES ($1, $2, now() + interval '60 seconds')`,
        [match.user.id, sha256(raw)]
      );

      const sub = match.tenant.subdomain;
      return reply.send({
        tenant: sub,
        churchName: match.tenant.name,
        redirect: `https://${sub}.${config.APP_DOMAIN}/login?ticket=${raw}`,
      });
    }
  );
}
