// Dostępność zespołu do grafiku — kto z osób służby zgłosił nieobecność (volunteer_blockouts)
// w danym zakresie dat. Lider układający grafik widzi to przy wyborze osób (web ScheduleTab,
// aplikacja AssignSheet). Sama tabela volunteer_blockouts jest w module Służba (module:serve),
// którego lider zespołu zwykle nie ma — dlatego serwerowo i tylko w minimalnym zakresie:
// imię z listy zespołu + daty, BEZ powodu nieobecności.
//
// Body: { team, from, to }   (team = klucz służby: worship/media/atmosfera/kids/…; daty YYYY-MM-DD)
// Dostęp: kto może czytać listę osób tej służby (canAccess select na tabeli zespołu) —
// czyli ten sam krąg, który widzi grafik. Brak wpisu w FN_CAPABILITY => requireUser.
import { canAccess } from '../dataapi/registry.js';

export const name = 'team-availability';
export const method = 'POST';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[a-z0-9_]+$/;
const MEMBER_TABLE = {
  worship: 'worship_team',
  media: 'media_team',
  atmosfera: 'atmosfera_members',
  kids: 'kids_teachers',
  mc: 'custom_mc_members',
};

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });

  const team = String(req.body?.team || '');
  const from = String(req.body?.from || '');
  const to = String(req.body?.to || '');
  if (!KEY_RE.test(team) || !DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return reply.code(400).send({ error: 'Podaj team oraz zakres dat from/to (YYYY-MM-DD)' });
  }
  const table = MEMBER_TABLE[team] || `custom_${team}_members`;

  const { rows: me } = await req.db.query('SELECT id, role, is_super_admin FROM app_users WHERE id = $1', [req.user.id]);
  if (!me[0]) return reply.code(403).send({ error: 'Brak konta' });
  const access = await canAccess({ pool: req.db, dbName: req.tenant.db_name, table, op: 'select', user: { ...req.user, ...me[0] } });
  if (!access.ok) return reply.code(403).send({ error: 'Brak dostępu do tej służby' });

  try {
    // Osoby zespołu → profil członka (po e-mailu, awaryjnie po imieniu i nazwisku) → wpisy.
    const { rows } = await req.db.query(
      `WITH team AS (
         SELECT DISTINCT trim(full_name) AS name, lower(email) AS email
           FROM ${'"' + table + '"'}
          WHERE full_name IS NOT NULL AND trim(full_name) <> ''
       ),
       linked AS (
         SELECT t.name, m.id AS member_id
           FROM team t
           JOIN members m
             ON (t.email IS NOT NULL AND t.email <> '' AND lower(m.email) = t.email)
             OR lower(trim(concat_ws(' ', m.first_name, m.last_name))) = lower(t.name)
       )
       SELECT l.name,
              to_char(b.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(b.end_date,   'YYYY-MM-DD') AS end_date
         FROM linked l
         JOIN volunteer_blockouts b ON b.member_id = l.member_id
        WHERE b.start_date <= $2::date AND b.end_date >= $1::date
        ORDER BY l.name, b.start_date`,
      [from, to]
    );
    return reply.send({ blockouts: rows });
  } catch (e) {
    // Brak tabeli zespołu / kolumn w tenancie — pusta lista zamiast błędu grafiku.
    req.log?.warn?.({ err: e }, 'team-availability failed');
    return reply.send({ blockouts: [] });
  }
}
