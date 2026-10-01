// Zbiórki (Dawanie, member-facing) — aktywne kampanie z postępem. „Zebrano" liczymy
// z zakończonych darowizn do funduszu kampanii (donations.fund_id = campaign.fund_id),
// opcjonalnie w oknie dat kampanii. Tabele giving_* nie są wystawione przez /api/db
// (niezarejestrowane), więc czytamy je serwerowo tu — bez ujawniania pojedynczych wpłat.
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'giving-campaigns';
export const method = 'POST';

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const empty = { campaigns: [] };
  if (!req.user?.email) return reply.send(empty);

  try {
    let campaigns = [];
    try {
      const { rows } = await req.db.query(
        `SELECT id, name, description, goal_amount::float8 AS goal_amount, fund_id,
                to_char(start_date,'YYYY-MM-DD') AS start_date,
                to_char(end_date,'YYYY-MM-DD')   AS end_date, image_url
           FROM giving_campaigns
          WHERE is_active = true
          ORDER BY created_at DESC NULLS LAST`
      );
      campaigns = rows;
    } catch {
      return reply.send(empty); // brak tabeli (przed migracją) → pusto
    }
    if (!campaigns.length) return reply.send(empty);

    // Nazwy funduszy.
    const fundIds = [...new Set(campaigns.map((c) => c.fund_id).filter(Boolean))];
    const fundName = new Map();
    if (fundIds.length) {
      try {
        const { rows } = await req.db.query('SELECT id, name FROM giving_funds WHERE id = ANY($1)', [fundIds]);
        for (const r of rows) fundName.set(String(r.id), r.name);
      } catch { /* bez nazw */ }
    }

    // Zebrano per fundusz (sumy zakończonych wpłat). Pojedyncze wpłaty NIE wychodzą.
    const raisedByFund = new Map();
    if (fundIds.length) {
      try {
        const { rows } = await req.db.query(
          `SELECT fund_id, COALESCE(SUM(amount),0)::float8 AS raised
             FROM donations
            WHERE fund_id = ANY($1) AND COALESCE(status,'completed') = 'completed'
            GROUP BY fund_id`,
          [fundIds]
        );
        for (const r of rows) raisedByFund.set(String(r.fund_id), r.raised);
      } catch { /* brak donations → 0 */ }
    }

    const out = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      goal_amount: c.goal_amount ?? 0,
      raised: c.fund_id ? (raisedByFund.get(String(c.fund_id)) ?? 0) : 0,
      fund_id: c.fund_id ?? null,
      fund_name: c.fund_id ? (fundName.get(String(c.fund_id)) ?? null) : null,
      start_date: c.start_date ?? null,
      end_date: c.end_date ?? null,
      image_url: c.image_url ?? null,
    }));

    return reply.send({ campaigns: out });
  } catch (e) {
    req.log?.error?.(e, 'giving-campaigns failed');
    return reply.send(empty);
  }
}
