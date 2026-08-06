// „Moje zaproszenia" (member-facing, RSVP) — zwraca zaproszenia WYŁĄCZNIE
// zalogowanego użytkownika. Jak my-giving: powiązanie członka ustala SERWER
// z req.user (member_id + e-mail sesji), nigdy z parametru — dlatego nie da się
// odpytać cudzych zaproszeń. Zastępuje bezpośredni odczyt rsvp_invitations/
// rsvp_campaigns z mobile (uprawnienia per-tabela odsłoniłyby cudze zaproszenia).
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
// Odpowiadanie na zaproszenie idzie osobno przez publiczny /api/fn/rsvp-respond.
export const name = 'my-invitations';
export const method = 'POST';

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) {
    return reply.code(404).send({ error: 'Nieznany tenant' });
  }
  const empty = { memberResolved: false, invitations: [] };
  const email = req.user?.email;
  if (!email) return reply.send(empty);

  // 1. Powiązanie członka: app_users.member_id (niezawodne) → members.email (fallback).
  let memberId = null;
  try {
    const { rows } = await req.db.query('SELECT member_id FROM app_users WHERE id = $1', [req.user.id]);
    memberId = rows[0]?.member_id ?? null;
  } catch {
    // brak kolumny member_id — spróbuj po e-mailu
  }
  if (memberId == null) {
    try {
      const { rows } = await req.db.query('SELECT id FROM members WHERE email = $1 LIMIT 1', [email]);
      memberId = rows[0]?.id ?? null;
    } catch {
      // brak tabeli members — dalej dopasujemy zaproszenia po e-mailu
    }
  }
  const memberResolved = memberId != null;

  // 2. Zaproszenia: po member_id LUB e-mailu (adresowane bezpośrednio), z danymi
  //    kampanii; tylko nadchodzące (bez daty = nadchodzące), sort rosnąco po dacie.
  let invitations = [];
  try {
    const { rows } = await req.db.query(
      `SELECT i.id, i.campaign_id, i.token, i.status, i.guests_count,
              c.id AS c_id, c.title, c.event_type,
              to_char(c.event_date, 'YYYY-MM-DD') AS event_date,
              c.event_time, c.location
         FROM rsvp_invitations i
         LEFT JOIN rsvp_campaigns c ON c.id = i.campaign_id
        WHERE (i.member_id = $1 OR i.email = $2)
          AND (c.event_date IS NULL OR c.event_date >= CURRENT_DATE)
        ORDER BY c.event_date ASC NULLS LAST
        LIMIT 200`,
      [memberId, email]
    );
    invitations = rows.map((r) => ({
      id: r.id,
      campaign_id: r.campaign_id,
      token: r.token,
      status: r.status,
      guests_count: r.guests_count,
      campaign: r.c_id
        ? {
            id: r.c_id,
            title: r.title,
            event_type: r.event_type,
            event_date: r.event_date,
            event_time: r.event_time,
            location: r.location,
          }
        : null,
    }));
  } catch {
    // Brak tabel RSVP — członek mógł zostać rozpoznany, ale bez zaproszeń.
    return reply.send({ memberResolved, invitations: [] });
  }

  return reply.send({ memberResolved, invitations });
}
