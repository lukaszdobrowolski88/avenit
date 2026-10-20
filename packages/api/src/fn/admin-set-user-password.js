// Admin: ustaw nowe hasło wskazanemu użytkownikowi tenanta.
// Wywoływane z Ustawienia → Użytkownicy (supabase.functions.invoke('admin-set-user-password')).
// Bramka SERWEROWA i autorytatywna. Audyt uprawnień 2026-10, runda 6: cudze hasło wprost ustawia
// TYLKO pełny administrator (superadmin albo rola app_roles.is_admin, aktywne konto). Osoba z samym
// action:settings:manage_users ustawiała hasło dowolnemu zwykłemu kontu i logowała się jako ono
// (przejęcie konta) — teraz wysyła link do zmiany hasła (fn admin-send-password-reset), a hasło
// ustawia właściciel konta. Po zmianie hasła rewokuje sesje ofiary i powiadamia ją e-mailem.
import { hashPassword } from '../auth/passwords.js';
import { getCaller, loadTarget, revokeSessions } from '../lib/user-admin.js';
import { accountChangeDenied, isFullAdmin } from '../lib/admin-guard.js';
import { validatePassword } from '../lib/password-policy.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'admin-set-user-password';
export const isPublic = false;

export default async function handler(req, reply) {
  // 1. Tożsamość + uprawnienia wywołującego (z żywej bazy tenanta).
  const caller = await getCaller(req.db, req.user.id, req.tenant.db_name);
  if (!isFullAdmin(caller)) {
    return reply.code(403).send({ error: 'Hasło innej osoby ustawia tylko administrator. Wyślij link do zmiany hasła.' });
  }

  // 2. Walidacja wejścia.
  const userId = String(req.body?.userId || '');
  const password = String(req.body?.password || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });
  const pwErr = await validatePassword(req.db, password);
  if (pwErr) return reply.code(400).send({ error: pwErr });

  // 3. Ochrona konta super-administratora — hasło super-admina zmieni tylko super-admin.
  const target = await loadTarget(req.db, userId);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });
  if (target.is_super_admin && !caller.is_super_admin) {
    return reply.code(403).send({ error: 'Tylko super-administrator może zmienić hasło super-administratorowi.' });
  }
  // Druga linia obrony (gdyby bramka wyżej się zmieniła): bez roli administratora nie ruszysz
  // konta administratora ani konta z szerszymi uprawnieniami ustawień.
  const denied = await accountChangeDenied(req.db, req.tenant.db_name, caller, target);
  if (denied) return reply.code(403).send({ error: denied });

  // 4. Zapis (bcrypt) + rewokacja sesji ofiary + log.
  await req.db.query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), userId]);
  await revokeSessions(req.db, userId);
  await logAccountEvent(req.db, { email: target.email, action: 'password_set', actor: caller.email });
  if (userId !== caller.id) {
    const { notifyAccountChange } = await import('../lib/account-notify.js');
    await notifyAccountChange(req.db, {
      email: target.email, name: target.full_name,
      subject: 'Zmieniono hasło do konta — Avenit',
      intro: 'Administrator ustawił nowe hasło do Twojego konta. Zostałeś(-aś) wylogowany(-a) ze wszystkich urządzeń.',
    });
  }
  req.log.info({ actor: caller.email, target: target.email }, 'admin set user password');
  return reply.send({ success: true, email: target.email });
}
