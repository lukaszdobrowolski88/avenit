// Worker: przetwarzanie planów cyklicznego dawania (giving_recurring).
// Dla każdego należnego planu tworzy oczekującą darowiznę i przesuwa next_run_date.
// Uwaga: automatyczne obciążanie karty (unattended) wymaga umowy Przelewy24
// "płatność cykliczna" / karty on-file. Tu prowadzimy ewidencję należnych wpłat
// (status 'pending') — realny rejestr zobowiązań gotowy do rozliczenia/przypomnień.
export const name = 'giving-recurring';
export const skipRoute = true; // uruchamiane wyłącznie przez workera

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
      `SELECT * FROM giving_recurring
        WHERE is_active = true
          AND next_run_date IS NOT NULL
          AND next_run_date <= $1
          AND (end_date IS NULL OR end_date >= $1)`,
      [today]
    );
    plans = rows;
  } catch (err) {
    // Tabela może nie istnieć w danym tenancie — pomiń bez błędu.
    log(`giving-recurring: pomijam (${err.message})`);
    return { generated: 0 };
  }

  let generated = 0;
  for (const p of plans) {
    try {
      await pool.query(
        `INSERT INTO donations
           (member_id, donor_name, fund_id, amount, currency, method, status,
            is_recurring, recurring_id, donation_date, note, campus_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', true, $7, CURRENT_DATE, $8, $9)`,
        [
          p.member_id || null, p.donor_name || null, p.fund_id || null,
          p.amount, p.currency || 'PLN', p.method || 'transfer', p.id,
          'Darowizna cykliczna (automat)', p.campus_id || null,
        ]
      );
      const nrd = nextRunDate(p.frequency, today, p.day_of_month);
      await pool.query(
        `UPDATE giving_recurring SET next_run_date = $1, updated_at = now() WHERE id = $2`,
        [nrd, p.id]
      );
      generated++;
    } catch (err) {
      log(`giving-recurring: plan ${p.id} błąd: ${err.message}`);
    }
  }

  if (generated) log(`giving-recurring: wygenerowano ${generated} należnych darowizn`);
  return { generated };
}
