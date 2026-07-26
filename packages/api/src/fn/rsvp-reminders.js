// Worker: przypomnienia RSVP dla osób, które nie odpowiedziały.
// Wysyła ponaglenie na `reminder_days_before` dni przed wydarzeniem
// (domyślnie 1 dzień) tymi samymi kanałami co kampania; oznacza reminded_at,
// aby nie ponawiać przy kolejnych przebiegach.
import { rsvpBase, sendInvitation } from './rsvp-send.js';

export const name = 'rsvp-reminders';
export const skipRoute = true; // tylko worker

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
          AND event_date = (CURRENT_DATE + make_interval(days => COALESCE(reminder_days_before, 1)))::date`
    );
    campaigns = rows;
  } catch (err) {
    // Tabela/kolumny mogą nie istnieć w danym tenancie — pomiń bez błędu.
    log(`rsvp-reminders: pomijam (${err.message})`);
    return { reminded: 0 };
  }

  let reminded = 0;
  for (const c of campaigns) {
    try {
      const { rows: pending } = await pool.query(
        `SELECT * FROM rsvp_invitations
          WHERE campaign_id = $1 AND status = 'pending' AND reminded_at IS NULL`,
        [c.id]
      );
      for (const inv of pending) {
        await sendInvitation(pool, base, c, inv, { reminder: true });
        await pool.query(`UPDATE rsvp_invitations SET reminded_at = now() WHERE id = $1`, [inv.id]);
        reminded++;
      }
    } catch (err) {
      log(`rsvp-reminders: kampania ${c.id} błąd: ${err.message}`);
    }
  }

  if (reminded) log(`rsvp-reminders: wysłano ${reminded} przypomnień`);
  return { reminded };
}
