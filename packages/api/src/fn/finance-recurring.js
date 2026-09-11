// Worker: materializacja finansowych transakcji cyklicznych (finance_recurring).
// Dla każdego należnego planu tworzy wpis w income_transactions lub expense_transactions
// i przesuwa next_run_date. Odporny na brak tabeli (starsze tenanty przed migracją 035).
export const name = 'finance-recurring';
export const skipRoute = true; // wyłącznie worker

function nextRunDate(frequency, from, dayOfMonth) {
  const d = new Date(from);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  if (dayOfMonth && ['monthly', 'quarterly', 'yearly'].includes(frequency)) {
    d.setDate(Math.min(dayOfMonth, 28));
  }
  return d.toISOString().slice(0, 10);
}

export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  const today = new Date().toISOString().slice(0, 10);

  let plans;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM finance_recurring
        WHERE is_active = true
          AND next_run_date IS NOT NULL
          AND next_run_date <= $1
          AND (end_date IS NULL OR end_date >= $1)`,
      [today]
    );
    plans = rows;
  } catch (err) {
    log(`finance-recurring: pomijam (${err.message})`);
    return { generated: 0 };
  }

  let generated = 0;
  for (const p of plans) {
    try {
      if (p.kind === 'income') {
        await pool.query(
          `INSERT INTO income_transactions (date, amount, type, source, notes, team_type, tags)
           VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '[]'::jsonb)`,
          [p.amount, p.category || 'Inne', p.title, `Cykliczne (automat) — ${p.title}`, p.team_type || null]
        );
      } else {
        await pool.query(
          `INSERT INTO expense_transactions
             (payment_date, amount, contractor, category, cost_category, description,
              detailed_description, team_type, status, is_paid, documents, tags)
           VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, 'approved', true, '[]'::jsonb, '[]'::jsonb)`,
          [
            p.amount, p.contractor || 'Cykliczne', p.category || null, p.cost_category || null,
            p.title, `Cykliczne (automat) — ${p.title}`, p.team_type || null,
          ]
        );
      }
      const nrd = nextRunDate(p.frequency, today, p.day_of_month);
      await pool.query(
        `UPDATE finance_recurring SET next_run_date = $1, updated_at = now() WHERE id = $2`,
        [nrd, p.id]
      );
      generated++;
    } catch (err) {
      log(`finance-recurring: plan ${p.id} błąd: ${err.message}`);
    }
  }

  if (generated) log(`finance-recurring: wygenerowano ${generated} transakcji cyklicznych`);
  return { generated };
}
