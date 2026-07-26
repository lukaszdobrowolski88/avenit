// Worker: cykliczne kampanie RSVP (seria). Dla każdego szablonu (is_series)
// z nadeszłym series_next_date tworzy nowe wystąpienie kampanii, generuje
// zaproszenia dla zapisanej publiczności, wysyła i przesuwa termin.
import { rsvpBase, sendInvitation } from './rsvp-send.js';

export const name = 'rsvp-series';
export const skipRoute = true;

function token() {
  return 'r' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
const memberName = (m) => `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Członek';

export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  const base = rsvpBase(ctx.tenantSlug);

  let templates;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rsvp_campaigns
        WHERE is_series = true AND series_next_date IS NOT NULL AND series_next_date <= CURRENT_DATE`
    );
    templates = rows;
  } catch (err) {
    log(`rsvp-series: pomijam (${err.message})`);
    return { created: 0 };
  }

  let created = 0;
  for (const t of templates) {
    try {
      const ids = Array.isArray(t.audience_member_ids) ? t.audience_member_ids : [];
      if (!ids.length) {
        await pool.query(`UPDATE rsvp_campaigns SET series_next_date = series_next_date + (recur_interval_days || 7) WHERE id = $1`, [t.id]);
        continue;
      }
      const { rows: members } = await pool.query(
        `SELECT id, first_name, last_name, email, phone FROM members WHERE id = ANY($1::int[])`, [ids]
      );

      // Nowe wystąpienie kampanii.
      const { rows: occRows } = await pool.query(
        `INSERT INTO rsvp_campaigns
           (title, description, event_type, event_date, event_time, location, channels, message,
            status, sent_at, created_by, campus_id, reminder_enabled, reminder_days_before, series_parent_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sent',now(),$9,$10,$11,$12,$13)
         RETURNING *`,
        [t.title, t.description, t.event_type, t.series_next_date, t.event_time, t.location,
         JSON.stringify(t.channels || ['push']), t.message, t.created_by, t.campus_id,
         t.reminder_enabled, t.reminder_days_before, t.id]
      );
      const occ = occRows[0];

      for (const m of members) {
        const { rows: invRows } = await pool.query(
          `INSERT INTO rsvp_invitations (campaign_id, member_id, name, email, phone, token, status, campus_id)
           VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING *`,
          [occ.id, m.id, memberName(m), m.email || null, m.phone || null, token(), t.campus_id]
        );
        await sendInvitation(pool, base, occ, invRows[0], { reminder: false });
      }

      await pool.query(
        `UPDATE rsvp_campaigns SET series_next_date = series_next_date + (recur_interval_days || 7) WHERE id = $1`,
        [t.id]
      );
      created++;
    } catch (err) {
      log(`rsvp-series: szablon ${t.id} błąd: ${err.message}`);
    }
  }

  if (created) log(`rsvp-series: utworzono ${created} wystąpień`);
  return { created };
}
