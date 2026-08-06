// „Moje darowizny" (member-facing) — zwraca darowizny WYŁĄCZNIE zalogowanego
// użytkownika. Kluczowe dla prywatności: member_id ustala SERWER z req.user,
// nigdy z parametru żądania — dlatego nie da się odpytać cudzych darowizn.
// Zastępuje bezpośredni odczyt tabeli `donations` z aplikacji mobilnej (model
// uprawnień jest per-tabela, więc grant res:donations:read odsłaniałby wszystkie).
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'my-giving';
export const method = 'POST';

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) {
    return reply.code(404).send({ error: 'Nieznany tenant' });
  }
  const year = new Date().getFullYear();
  const empty = {
    memberResolved: false,
    donations: [],
    funds: {},
    yearTotal: 0,
    allTimeTotal: 0,
    currency: 'PLN',
    year,
  };
  const email = req.user?.email;
  if (!email) return reply.send(empty);

  // 1. Powiązanie członka: app_users.member_id (niezawodne) → members.email (fallback).
  let memberId = null;
  try {
    const { rows } = await req.db.query('SELECT member_id FROM app_users WHERE id = $1', [req.user.id]);
    memberId = rows[0]?.member_id ?? null;
  } catch {
    // brak kolumny member_id — spróbuj po e-mailu poniżej
  }
  if (memberId == null) {
    try {
      const { rows } = await req.db.query('SELECT id FROM members WHERE email = $1 LIMIT 1', [email]);
      memberId = rows[0]?.id ?? null;
    } catch {
      return reply.send(empty); // brak tabeli members
    }
  }
  if (memberId == null) return reply.send(empty);

  // 2. Darowizny tego członka. amount->float, date->YYYY-MM-DD (spójne sumy i JSON).
  let donations = [];
  try {
    const { rows } = await req.db.query(
      `SELECT id,
              amount::float8                       AS amount,
              currency,
              to_char(donation_date, 'YYYY-MM-DD') AS donation_date,
              fund_id, method, status, is_recurring, note
         FROM donations
        WHERE member_id = $1
        ORDER BY donation_date DESC
        LIMIT 200`,
      [memberId]
    );
    donations = rows;
  } catch {
    // Członek rozpoznany, ale brak tabeli darowizn / niezgodność typów.
    return reply.send({ ...empty, memberResolved: true });
  }

  // 3. Fundusze (etykiety / kolory) — opcjonalne.
  const funds = {};
  try {
    const fundIds = [...new Set(donations.map((d) => d.fund_id).filter(Boolean))];
    if (fundIds.length > 0) {
      const { rows } = await req.db.query(
        'SELECT id, name, color FROM giving_funds WHERE id = ANY($1)',
        [fundIds]
      );
      for (const f of rows) funds[f.id] = f;
    }
  } catch {
    // fundusze opcjonalne — pomiń
  }

  const completed = donations.filter((d) => (d.status ?? 'completed') === 'completed');
  const yearTotal = completed
    .filter((d) => String(d.donation_date ?? '').startsWith(String(year)))
    .reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const allTimeTotal = completed.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const currency = donations[0]?.currency ?? 'PLN';

  return reply.send({
    memberResolved: true,
    donations,
    funds,
    yearTotal,
    allTimeTotal,
    currency,
    year,
  });
}
