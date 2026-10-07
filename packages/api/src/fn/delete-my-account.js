// Samodzielne usunięcie konta z aplikacji (wytyczna App Store 5.1.1(v) i Google Play).
// Potwierdzenie hasłem. Usuwa konto w TYM kościele razem z danymi osobistymi:
// tokeny push, sesje, blokady, własne prośby modlitewne i modlitwy, udział w rozmowach;
// w wiadomościach już wysłanych do innych zostaje treść, a podpis zmienia się na „Konto usunięte”.
// Kartoteka członków jest danymi kościoła (administrator danych) — administratorzy dostają e-mail,
// żeby usunęli wpis, jeśli nie jest już potrzebny.
// Strażnik: ostatni aktywny administrator nie usuwa konta (kościół zostałby bez administratora).
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
import { verifyPassword } from '../auth/passwords.js';
import { isLastActiveAdmin, revokeSessions } from '../lib/user-admin.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'delete-my-account';
export const method = 'POST';
export const rateLimit = { max: 5, timeWindow: '15 minutes' };

const lower = (v) => String(v || '').trim().toLowerCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sprzątanie best-effort: tabela lub kolumna może nie istnieć w starszej bazie tenanta.
const tryQuery = (db, sql, params) => db.query(sql, params).catch(() => null);

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const password = String(req.body?.password || '');

  const { rows } = await req.db.query(
    'SELECT id, email, full_name, password_hash, is_super_admin FROM app_users WHERE id = $1', [req.user.id]);
  const me = rows[0];
  if (!me) return reply.code(404).send({ error: 'Konto już nie istnieje.' });

  if (me.password_hash) {
    if (!password || !(await verifyPassword(password, me.password_hash))) {
      return reply.code(403).send({ error: 'Nieprawidłowe hasło.', code: 'BAD_PASSWORD' });
    }
  } else if (lower(req.body?.confirmEmail) !== lower(me.email)) {
    return reply.code(400).send({ error: 'Wpisz swój adres e-mail, aby potwierdzić.', code: 'CONFIRM_EMAIL' });
  }

  if (await isLastActiveAdmin(req.db, me.id)) {
    return reply.code(409).send({
      error: 'Jesteś jedynym administratorem kościoła. Przekaż uprawnienia administratora innej osobie albo napisz na lukasz@avenit.pl.',
      code: 'LAST_ADMIN',
    });
  }

  const email = lower(me.email);
  await revokeSessions(req.db, me.id);
  await tryQuery(req.db, 'DELETE FROM push_tokens WHERE lower(user_email) = $1', [email]);
  await tryQuery(req.db, 'DELETE FROM push_subscriptions WHERE lower(user_email) = $1', [email]);
  await tryQuery(req.db, 'DELETE FROM user_blocks WHERE lower(blocker_email) = $1', [email]);
  await tryQuery(req.db, 'DELETE FROM prayer_interactions WHERE lower(user_email) = $1', [email]);
  await tryQuery(req.db, 'DELETE FROM prayer_requests WHERE lower(user_email) = $1', [email]);
  await tryQuery(req.db, 'DELETE FROM conversation_participants WHERE lower(user_email) = $1', [email]);
  await tryQuery(req.db, `UPDATE messages SET sender_name = 'Konto usunięte' WHERE lower(sender_email) = $1`, [email]);
  await tryQuery(req.db, 'DELETE FROM permission_grants WHERE user_id = $1', [me.id]);
  await tryQuery(req.db, 'DELETE FROM password_reset_tokens WHERE user_id = $1', [me.id]);
  await req.db.query('DELETE FROM app_users WHERE id = $1', [me.id]);

  await logAccountEvent(req.db, { email: me.email, action: 'deleted', actor: me.email, detail: 'usunięte przez użytkownika w aplikacji' });
  req.log.info({ tenant: req.tenant.slug }, 'user deleted own account');

  // Administratorzy: e-mail z prośbą o przejrzenie kartoteki (best-effort).
  try {
    const { rows: admins } = await req.db.query(
      `SELECT u.email FROM app_users u LEFT JOIN app_roles r ON u.role = r.key
        WHERE u.is_active = true AND u.email IS NOT NULL AND (u.is_super_admin = true OR r.is_admin = true)`);
    const { sendEmail } = await import('../lib/email.js');
    const who = esc(me.full_name ? `${me.full_name} (${me.email})` : me.email);
    for (const a of admins) {
      await sendEmail({
        to: a.email,
        subject: 'Użytkownik usunął konto — Avenit',
        html: `<p>${who} usunął(-ęła) swoje konto w aplikacji Avenit. Konto, sesje i dane osobiste z aplikacji zostały usunięte.</p>
<p>Jeśli w kartotece członków są dane tej osoby, które nie są już potrzebne, usuń je w panelu kościoła.</p>`,
      }).catch(() => {});
    }
  } catch { /* powiadomienie best-effort */ }

  return reply.send({ success: true });
}
