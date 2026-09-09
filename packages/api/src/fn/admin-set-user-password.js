// Admin: ustaw nowe hasło wskazanemu użytkownikowi tenanta.
// Wywoływane z Ustawienia → Użytkownicy (supabase.functions.invoke('admin-set-user-password')).
// Bramka SERWEROWA i autorytatywna — WSPÓLNY model is_admin (is_super_admin lub app_roles.is_admin
// + aktywne konto), spójny z resztą funkcji kont. Po zmianie hasła rewokuje sesje ofiary.
import { hashPassword } from '../auth/passwords.js';
import { getCaller, isAdmin, loadTarget, revokeSessions } from '../lib/user-admin.js';

export const name = 'admin-set-user-password';
export const isPublic = false;

export default async function handler(req, reply) {
  // 1. Tożsamość + uprawnienia wywołującego (z żywej bazy tenanta).
  const caller = await getCaller(req.db, req.user.id);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień do zmiany haseł.' });

  // 2. Walidacja wejścia.
  const userId = String(req.body?.userId || '');
  const password = String(req.body?.password || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
  if (password.length < 8) return reply.code(400).send({ error: 'Hasło musi mieć min. 8 znaków.' });

  // 3. Ochrona konta super-administratora — hasło super-admina zmieni tylko super-admin.
  const target = await loadTarget(req.db, userId);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });
  if (target.is_super_admin && !caller.is_super_admin) {
    return reply.code(403).send({ error: 'Tylko super-administrator może zmienić hasło super-administratorowi.' });
  }

  // 4. Zapis (bcrypt) + rewokacja sesji ofiary + log.
  await req.db.query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), userId]);
  await revokeSessions(req.db, userId);
  req.log.info({ actor: caller.email, target: target.email }, 'admin set user password');
  return reply.send({ success: true, email: target.email });
}
