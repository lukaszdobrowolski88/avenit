// Admin: ostatnie zdarzenia kont (audyt rejestracji/zatwierdzeń) z account_events (migracja 028).
// Admin-gated (uprawnienie manage_users); odporny na brak tabeli (zwraca pustą listę przed migracją).
import { getCaller, isAdmin } from '../lib/user-admin.js';

export const name = 'account-events';
export const isPublic = false;

export default async function handler(req, reply) {
  const caller = await getCaller(req.db, req.user.id, req.tenant.db_name);
  if (!isAdmin(caller)) return reply.code(403).send({ error: 'Brak uprawnień.' });
  try {
    const { rows } = await req.db.query(
      `SELECT email, action, actor, detail, created_at
         FROM account_events ORDER BY created_at DESC LIMIT 40`
    );
    return reply.send({ events: rows });
  } catch {
    return reply.send({ events: [] });
  }
}
