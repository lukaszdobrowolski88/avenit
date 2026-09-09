// Admin: edycja konta — spójna i bezpieczna. Synchronizuje status z is_active, zapisuje
// totp_required, pilnuje unikalności e-maila, rewokuje sesje przy blokadzie, loguje audyt.
// Guardy: nie zablokuj/odbierz admina sobie ani ostatniemu administratorowi.
import { getCaller, isAdmin, isLastActiveAdmin, revokeSessions } from '../lib/user-admin.js';
import { logAccountEvent } from '../lib/account-audit.js';

export const name = 'admin-update-user';
export const isPublic = false;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });

  const userId = String(req.body?.userId || '');
  if (!userId) return reply.code(400).send({ error: 'Brak użytkownika.' });

  const { rows } = await req.db.query(
    `SELECT u.id, u.email, u.is_super_admin, u.is_active, u.role, u.full_name, u.status,
            u.campus_id, u.totp_required, COALESCE(r.is_admin, false) AS role_admin
       FROM app_users u LEFT JOIN app_roles r ON u.role = r.key WHERE u.id = $1`,
    [userId]
  );
  const target = rows[0];
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono użytkownika.' });
  if (target.is_super_admin && !caller.is_super_admin) {
    return reply.code(403).send({ error: 'Tylko super-administrator może edytować super-administratora.' });
  }

  // Pola nieprzysłane zostają bez zmian (obsługa częściowych aktualizacji, np. masowa zmiana roli).
  const b = req.body || {};
  const email = String(b.email ?? target.email).trim();
  const fullName = String(b.full_name ?? target.full_name ?? '');
  const role = String(b.role ?? target.role);
  const newActive = b.is_active === undefined ? target.is_active : b.is_active !== false;
  const campusId = b.campus_id === undefined ? target.campus_id : (b.campus_id || null);
  const totpRequired = b.totp_required === undefined ? target.totp_required : b.totp_required === true;

  // Czy po zmianie konto nadal ma uprawnienia administratora?
  const { rows: rr } = await req.db.query('SELECT COALESCE(is_admin, false) AS a FROM app_roles WHERE key = $1', [role]);
  const newIsAdmin = target.is_super_admin || rr[0]?.a === true;
  const wasAdmin = target.is_super_admin || target.role_admin;

  if (userId === req.user.id && !newActive) {
    return reply.code(400).send({ error: 'Nie możesz zablokować własnego konta.' });
  }
  if (userId === req.user.id && wasAdmin && !newIsAdmin) {
    return reply.code(400).send({ error: 'Nie możesz odebrać sobie uprawnień administratora.' });
  }
  if ((!newActive || !newIsAdmin) && wasAdmin && await isLastActiveAdmin(req.db, userId)) {
    return reply.code(400).send({ error: 'To ostatni aktywny administrator — nie można zablokować ani odebrać uprawnień.' });
  }

  if (email.toLowerCase() !== String(target.email).toLowerCase()) {
    const { rows: dup } = await req.db.query('SELECT id FROM app_users WHERE lower(email) = lower($1) AND id <> $2', [email, userId]);
    if (dup[0]) return reply.code(409).send({ error: 'Inny użytkownik ma już ten adres e-mail.' });
  }

  // Edycja profilu NIE psuje kolejki: konto oczekujące zostaje 'pending' (chyba że aktywowane).
  const newStatus = newActive ? 'active' : (target.status === 'pending' ? 'pending' : 'blocked');
  await req.db.query(
    `UPDATE app_users SET email = $1, full_name = $2, name = $2, role = $3,
            is_active = $4, status = $5, totp_required = $6, campus_id = $7 WHERE id = $8`,
    [email, fullName, role, newActive, newStatus, totpRequired, campusId, userId]
  );
  if (!newActive) await revokeSessions(req.db, userId);

  await logAccountEvent(req.db, { email: target.email, action: 'edited', actor: caller.email, detail: role });
  if (role !== target.role) {
    const { notifyAccountChange } = await import('../lib/account-notify.js');
    await notifyAccountChange(req.db, {
      email, name: fullName,
      subject: 'Zmieniono rolę w koncie — Avenit',
      intro: `Administrator zmienił Twoją rolę w systemie na: ${role}.`,
    });
  }
  return reply.send({ success: true });
}
