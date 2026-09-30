// „Moje grupy domowe" (member-facing) — zwraca WSZYSTKIE grupy (sam fakt istnienia
// grupy nie jest prywatny: nazwa/dzień/godzina/lokalizacja pomagają ją znaleźć), ale
// KONTAKTY (adres/telefon/e-mail grupy, e-mail/telefon lidera oraz lista osób) TYLKO dla
// grup, do których należy zalogowany. Wcześniej mobile czytał home_group_members wprost
// (grant res:home_group_members:read dla członka), więc każdy widział e-maile/telefony
// WSZYSTKICH grup — wzorzec jak my-giving/my-invitations (SERWER ustala przynależność).
//
// Powiązanie przynależności: WYŁĄCZNIE po e-mailu zalogowanego. Zweryfikowane na żywej
// bazie (schwro): home_group_members.user_id oraz members.home_group_id są NIEwypełnione
// (0 wierszy), jedynym wiarygodnym linkiem jest e-mail (home_group_members.email oraz
// home_group_leaders.email/user_email). Osoby bez e-maila w rosterze nie zostaną uznane
// za członka — świadomie zachowawczo (lepiej ukryć kontakty niż je ujawnić).
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'my-home-groups';
export const method = 'POST';

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const empty = { groups: [] };
  const email = (req.user?.email || '').toLowerCase();
  if (!email) return reply.send(empty);

  try {
    // 1) group_id moich grup — po e-mailu (członek lub lider).
    const mine = new Set();
    try {
      const m = await req.db.query(
        `SELECT DISTINCT group_id FROM home_group_members
          WHERE lower(email) = $1 AND group_id IS NOT NULL`,
        [email]
      );
      for (const r of m.rows) mine.add(String(r.group_id));
    } catch { /* brak tabeli/kolumny — pomiń */ }
    try {
      const l = await req.db.query(
        `SELECT DISTINCT group_id FROM home_group_leaders
          WHERE (lower(email) = $1 OR lower(user_email) = $1) AND group_id IS NOT NULL`,
        [email]
      );
      for (const r of l.rows) mine.add(String(r.group_id));
    } catch { /* pomiń */ }

    // 2) Wszystkie grupy (meta).
    const { rows: groups } = await req.db.query(
      `SELECT id, name, description, meeting_day, meeting_time, location, address, phone, email, campus_id
         FROM home_groups ORDER BY name ASC`
    );

    // 3) Lider per grupa (primary najpierw).
    const leaderByGroup = new Map();
    try {
      const { rows: leaders } = await req.db.query(
        `SELECT id, group_id, full_name, email, phone, is_primary
           FROM home_group_leaders ORDER BY is_primary DESC NULLS LAST`
      );
      for (const r of leaders) {
        if (r.group_id && !leaderByGroup.has(String(r.group_id))) {
          leaderByGroup.set(String(r.group_id), r);
        }
      }
    } catch { /* pomiń */ }

    // 4) Liczba osób per grupa.
    const countByGroup = new Map();
    try {
      const { rows: counts } = await req.db.query(
        `SELECT group_id, COUNT(*)::int AS n FROM home_group_members
          WHERE group_id IS NOT NULL GROUP BY group_id`
      );
      for (const r of counts) countByGroup.set(String(r.group_id), r.n);
    } catch { /* pomiń */ }

    // 5) Osoby TYLKO moich grup (kontakty nie wychodzą dla cudzych grup).
    const membersByGroup = new Map();
    const mineIds = [...mine];
    if (mineIds.length) {
      try {
        const { rows: mem } = await req.db.query(
          `SELECT id, full_name, email, phone, is_leader, group_id
             FROM home_group_members
            WHERE group_id = ANY($1::uuid[])
            ORDER BY is_leader DESC NULLS LAST, full_name ASC`,
          [mineIds]
        );
        for (const r of mem) {
          const g = String(r.group_id);
          if (!membersByGroup.has(g)) membersByGroup.set(g, []);
          membersByGroup.get(g).push({
            id: r.id,
            full_name: r.full_name,
            email: r.email ?? null,
            phone: r.phone ?? null,
            is_leader: !!r.is_leader,
          });
        }
      } catch { /* pomiń */ }
    }

    const out = groups.map((g) => {
      const gid = String(g.id);
      const isMine = mine.has(gid);
      const ldr = leaderByGroup.get(gid) || null;
      return {
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        meeting_day: g.meeting_day ?? null,
        meeting_time: g.meeting_time ?? null,
        location: g.location ?? null,
        campus_id: g.campus_id ?? null,
        // Kontakty grupy — tylko dla moich grup.
        address: isMine ? (g.address ?? null) : null,
        phone: isMine ? (g.phone ?? null) : null,
        email: isMine ? (g.email ?? null) : null,
        leader: ldr
          ? {
              id: ldr.id,
              full_name: ldr.full_name ?? null,
              email: isMine ? (ldr.email ?? null) : null,
              phone: isMine ? (ldr.phone ?? null) : null,
            }
          : null,
        members_count: countByGroup.get(gid) ?? 0,
        is_mine: isMine,
        members: isMine ? (membersByGroup.get(gid) ?? []) : [],
      };
    });

    return reply.send({ groups: out });
  } catch (e) {
    req.log?.error?.(e, 'my-home-groups failed');
    // Prywatność-first: przy błędzie NIC nie ujawniamy (pusto zamiast leaku).
    return reply.send({ groups: [] });
  }
}
