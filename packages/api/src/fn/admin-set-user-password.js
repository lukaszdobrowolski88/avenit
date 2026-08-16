// Admin: ustaw nowe hasło wskazanemu użytkownikowi tenanta.
// Wywoływane z Ustawienia → Użytkownicy (supabase.functions.invoke('admin-set-user-password')).
// Bramka jest SERWEROWA i autorytatywna (rola z bazy, nie z JWT) — nie ufamy klientowi.
import { hashPassword } from '../auth/passwords.js';

export const name = 'admin-set-user-password';
export const isPublic = false;

const ADMIN_ROLES = ['superadmin', 'rada_starszych'];

export default async function handler(req, reply) {
  // 1. Tożsamość + uprawnienia wywołującego (z żywej bazy tenanta).
  const { rows: me } = await req.db.query(
    'SELECT is_super_admin, role FROM app_users WHERE id = $1',
    [req.user.id]
  );
  const caller = me[0];
  const isAdmin = caller && (caller.is_super_admin || ADMIN_ROLES.includes(caller.role));
  if (!isAdmin) return reply.code(403).send({ error: 'Brak uprawnień do zmiany haseł.' });

  // 2. Walidacja wejścia.
  const userId = String(req.body?.userId || '');
  const password = String(req.body?.password || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
  if (password.length < 8) return reply.code(400).send({ error: 'Hasło musi mieć min. 8 znaków.' });

  // 3. Ochrona konta super-administratora — hasło super-admina zmieni tylko super-admin.
  const { rows: target } = await req.db.query(
    'SELECT is_super_admin, email FROM app_users WHERE id = $1',
    [userId]
  );
  if (!target.length) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });
  if (target[0].is_super_admin && !caller.is_super_admin) {
    return reply.code(403).send({ error: 'Tylko super-administrator może zmienić hasło super-administratorowi.' });
  }

  // 4. Zapis (bcrypt) + wpis do logu.
  await req.db.query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), userId]);
  req.log.info({ actor: req.user.email, target: target[0].email }, 'admin set user password');
  return reply.send({ success: true, email: target[0].email });
}
