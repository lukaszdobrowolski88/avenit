// Worker: automatyczne przypomnienia RSVP wg sekwencji kroków.
// Każda kampania (status 'sent', reminder_enabled) ma listę kroków reminder_steps
// [{days, channels?, message?}] — na `days` dni przed wydarzeniem wysyła przypomnienie
// osobom bez odpowiedzi (status 'pending'), kanałami danego kroku (fallback: kanały kampanii).
// reminder_log na zaproszeniu przechowuje offsety już wysłane, więc każdy krok wystrzeli raz.
// Dodatkowo auto_close: po dacie wydarzenia zamyka zapisy (kampania -> 'closed',
// powiązane wydarzenie -> registration_required=false).
import { rsvpBase, sendInvitation } from './rsvp-send.js';

export const name = 'rsvp-reminders';
export const skipRoute = true; // tylko worker

// Zbuduj listę kroków kampanii z fallbackiem na pojedynczy reminder_days_before (kompatybilność wstecz).
function stepsFor(c) {
  if (Array.isArray(c.reminder_steps) && c.reminder_steps.length) {
    return c.reminder_steps
      .map(s => ({ days: Number(s?.days), channels: Array.isArray(s?.channels) ? s.channels : null, message: s?.message || null }))
      .filter(s => Number.isFinite(s.days) && s.days >= 0);
  }
  return [{ days: Number(c.reminder_days_before) || 1, channels: null, message: null }];
}

export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  const base = rsvpBase(ctx.tenantSlug);

  let campaigns;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rsvp_campaigns
        WHERE status = 'sent'
          AND reminder_enabled = true
          AND event_date IS NOT NULL
          AND event_date >= CURRENT_DATE`
    );
    campaigns = rows;
  } catch (err) {
    // Tabela/kolumny mogą nie istnieć w danym tenancie — pomiń bez błędu.
    log(`rsvp-reminders: pomijam (${err.message})`);
    return { reminded: 0, closed: 0 };
  }

  let reminded = 0;
  for (const c of campaigns) {
    try {
      // Ile dni do wydarzenia (offset). Wysyłamy kroki, których days === offset.
      const { rows: offRows } = await pool.query(
        `SELECT (event_date - CURRENT_DATE)::int AS offset FROM rsvp_campaigns WHERE id = $1`, [c.id]
      );
      const offset = offRows[0]?.offset;
      if (offset == null) continue;
      const dueSteps = stepsFor(c).filter(s => s.days === offset);
      if (!dueSteps.length) continue;

      const { rows: pending } = await pool.query(
        `SELECT * FROM rsvp_invitations WHERE campaign_id = $1 AND status = 'pending'`, [c.id]
      );
      for (const step of dueSteps) {
        for (const inv of pending) {
          const logArr = Array.isArray(inv.reminder_log) ? inv.reminder_log.map(Number) : [];
          if (logArr.includes(step.days)) continue; // ten krok już wysłany tej osobie
          const { sent } = await sendInvitation(pool, base, c, inv, {
            reminder: true, channels: step.channels || undefined, message: step.message || undefined,
          });
          if (sent.length) {
            logArr.push(step.days);
            inv.reminder_log = logArr; // aktualizuj lokalnie na wypadek kilku kroków w tym samym przebiegu
            await pool.query(
              `UPDATE rsvp_invitations SET reminder_log = $1, reminded_at = now() WHERE id = $2`,
              [JSON.stringify(logArr), inv.id]
            );
            reminded++;
          }
        }
      }
    } catch (err) {
      log(`rsvp-reminders: kampania ${c.id} błąd: ${err.message}`);
    }
  }

  // Auto-zamknięcie zapisów po dacie wydarzenia.
  let closed = 0;
  try {
    const { rows: toClose } = await pool.query(
      `SELECT id, event_id FROM rsvp_campaigns
        WHERE auto_close = true AND status = 'sent'
          AND event_date IS NOT NULL AND event_date < CURRENT_DATE`
    );
    for (const c of toClose) {
      await pool.query(`UPDATE rsvp_campaigns SET status = 'closed' WHERE id = $1`, [c.id]);
      if (c.event_id != null) {
        try { await pool.query(`UPDATE events SET registration_required = false WHERE id = $1`, [c.event_id]); } catch { /* kolumna/tabela może nie istnieć */ }
      }
      closed++;
    }
  } catch (err) {
    log(`rsvp-reminders: auto-close pominięty (${err.message})`);
  }

  if (reminded || closed) log(`rsvp-reminders: przypomnień ${reminded}, zamkniętych kampanii ${closed}`);
  return { reminded, closed };
}
