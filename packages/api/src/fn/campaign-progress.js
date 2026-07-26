// Postęp kampanii (termometr zbiórki) — publiczny, do osadzenia w iframe.
// Zwraca tylko zagregowane sumy: nazwa, cel, zebrano, procent, waluta.
// NIE ujawnia darczyńców ani pojedynczych darowizn.
// Dane żyją w bazie TENANTA (req.db). Wymaga rozpoznanego tenanta (app.requireTenant).

export const name = 'campaign-progress';
export const isPublic = true;

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) {
    return reply.code(404).send({ error: 'Nieznany tenant' });
  }

  const { campaign_id } = req.body || {};
  if (!campaign_id) {
    return reply.code(400).send({ error: 'Wymagane: campaign_id' });
  }

  // 1. Kampania (cel + nazwa). Brak => 404.
  let campaign;
  try {
    const { rows } = await req.db.query(
      `SELECT id, name, goal_amount FROM giving_campaigns WHERE id = $1`,
      [campaign_id]
    );
    campaign = rows[0];
  } catch (err) {
    req.log.error({ err }, 'campaign-progress: błąd odczytu kampanii');
    return reply.code(500).send({ error: 'Błąd odczytu kampanii' });
  }
  if (!campaign) {
    return reply.code(404).send({ error: 'Kampania nie znaleziona' });
  }

  // 2. Zebrano = SUMA zaksięgowanych darowizn (bez ujawniania darczyńców).
  let raised = 0;
  try {
    const { rows } = await req.db.query(
      `SELECT COALESCE(SUM(amount), 0) AS raised
         FROM donations
        WHERE campaign_id = $1 AND status = 'completed'`,
      [campaign_id]
    );
    raised = Number(rows[0]?.raised) || 0;
  } catch (err) {
    req.log.error({ err }, 'campaign-progress: błąd sumowania darowizn');
    return reply.code(500).send({ error: 'Błąd odczytu darowizn' });
  }

  const goal = Number(campaign.goal_amount) || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return reply.send({
    name: campaign.name || '',
    goal,
    raised,
    pct,
    currency: 'PLN',
  });
}
