// POST /api/fn/tlumaczenia-accounts {} → { available, members: [{ id, account: 'active'|'inactive'|'none' }], can_invite }
// Moduł Tłumaczenia → Członkowie (web) i skład zespołu w aplikacji: kto ze składu NIE ma konta
// w aplikacji (albo ma je wyłączone) — bez konta nie może tłumaczyć na żywo. Reguła tożsamości
// jak przy wyborze tłumacza w karcie (interpretation/team.js rosterAccounts). Bez e-maili kont.
// Dostęp: kto może czytać skład Tłumaczeń (canAccess select na custom_tlumaczenia_members) —
// ten sam krąg, który widzi listę Członków. can_invite: może zakładać konta (jak admin-create-user).
// Brak wpisu w FN_CAPABILITY => requireUser.
import { canAccess } from '../dataapi/registry.js';
import { getCaller, isAdmin } from '../lib/user-admin.js';
import { MEMBER_TABLE, rosterAccounts } from '../interpretation/team.js';

export const name = 'tlumaczenia-accounts';
export const method = 'POST';

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });
  const { rows: me } = await req.db.query('SELECT id, role, is_super_admin FROM app_users WHERE id = $1', [req.user.id]);
  if (!me[0]) return reply.code(403).send({ error: 'Brak konta' });
  const access = await canAccess({ pool: req.db, dbName: req.tenant.db_name, table: MEMBER_TABLE, op: 'select', user: { ...req.user, ...me[0] } });
  if (!access.ok) return reply.code(403).send({ error: 'Brak dostępu do składu Tłumaczeń' });
  try {
    const out = await rosterAccounts(req.db);
    const caller = await getCaller(req.db, req.user.id, req.tenant.db_name).catch(() => null);
    return reply.send({ ...out, can_invite: isAdmin(caller) });
  } catch (err) {
    req.log?.warn?.({ err }, 'tlumaczenia-accounts failed');
    return reply.send({ available: false, members: [], can_invite: false });
  }
}
