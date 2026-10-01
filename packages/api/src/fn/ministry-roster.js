// Skład służby (Serve, member-facing) — lista osób w danej służbie. Imiona/role/avatary
// widoczne dla każdego zalogowanego (fakt przynależności do służby nie jest prywatny), ale
// KONTAKTY (telefon/e-mail) TYLKO gdy pytający sam należy do tej służby lub jest liderem/adminem
// — wzorzec jak my-home-groups. Dane kontaktowe NIE wychodzą dla cudzych służb.
//
// Body: { ministry_key }.
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'ministry-roster';
export const method = 'POST';

const LEADER_ROLES = ['superadmin', 'rada_starszych', 'koordynator', 'lider'];
const lc = (v) => String(v || '').toLowerCase();

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const empty = { members: [], iBelong: false };
  const ministryKey = String(req.body?.ministry_key || '').trim();
  if (!ministryKey || !req.user?.id) return reply.send(empty);

  try {
    // 1) Przynależności do tej służby (user_id + rola).
    const { rows: mm } = await req.db.query(
      `SELECT user_id, role FROM ministry_memberships WHERE ministry_key = $1`,
      [ministryKey]
    );
    if (!mm.length) return reply.send(empty);

    // 2) Czy pytający należy (lub jest liderem/adminem) → decyduje o ujawnieniu kontaktów.
    const myId = String(req.user.id);
    let iBelong = mm.some((m) => String(m.user_id) === myId);
    if (!iBelong) {
      try {
        const { rows } = await req.db.query(
          'SELECT role, is_super_admin FROM app_users WHERE id = $1',
          [req.user.id]
        );
        const r = rows[0] || {};
        iBelong = !!r.is_super_admin || LEADER_ROLES.includes(String(r.role || ''));
      } catch { /* brak kolumny — traktuj jak nie-członek */ }
    }

    // 3) Dane osób (imię/telefon/e-mail/avatar) z app_users.
    const roleByUser = new Map();
    for (const m of mm) if (m.user_id) roleByUser.set(String(m.user_id), m.role || 'member');
    const ids = [...roleByUser.keys()];

    let users = [];
    try {
      const { rows } = await req.db.query(
        `SELECT id, full_name, name, email, phone, avatar_url FROM app_users WHERE id = ANY($1::uuid[])`,
        [ids]
      );
      users = rows;
    } catch (e) {
      req.log?.error?.(e, 'ministry-roster users failed');
    }

    const members = users
      .map((u) => {
        const uid = String(u.id);
        const role = roleByUser.get(uid) || 'member';
        const isMe = uid === myId;
        const displayName =
          (u.full_name && String(u.full_name).trim()) ||
          (u.name && String(u.name).trim()) ||
          (u.email ? String(u.email).split('@')[0] : 'Osoba');
        // Kontakty: tylko gdy należę (lub jestem sobą) — inaczej null.
        const showContact = iBelong || isMe;
        return {
          user_id: uid,
          name: displayName,
          role,
          is_leader: role === 'leader',
          is_me: isMe,
          avatar_url: u.avatar_url ?? null,
          phone: showContact ? (u.phone ?? null) : null,
          email: showContact ? (u.email ?? null) : null,
        };
      })
      // Liderzy najpierw, potem alfabetycznie.
      .sort((a, b) => {
        if (a.is_leader !== b.is_leader) return a.is_leader ? -1 : 1;
        return a.name.localeCompare(b.name, 'pl');
      });

    return reply.send({ members, iBelong });
  } catch (e) {
    req.log?.error?.(e, 'ministry-roster failed');
    return reply.send(empty);
  }
}
