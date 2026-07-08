// Port edge function push-event-track: logowanie zdarzeń pusha (delivered/opened/
// action_clicked/dismissed). Wywoływana z mobile (NotificationResponseReceived)
// i web service workera.
// Oryginał: supabase/functions/push-event-track/index.ts.
//
// Body:
//   campaign_id, recipient_id, event ('opened' | 'action_clicked' | 'dismissed'), action_id?

export const name = 'push-event-track';
export const isPublic = true; // wołane z service workera / mobile bez sesji

export default async function handler(req, reply) {
  try {
    const { campaign_id, recipient_id, event, action_id } = req.body || {};
    if (!campaign_id || !recipient_id || !event) {
      return reply.code(400).send({ error: 'Brak campaign_id/recipient_id/event' });
    }

    const update = {};

    switch (event) {
      case 'delivered':
        update.status = 'delivered';
        update.delivered_at = true;
        break;
      case 'opened':
        update.status = 'opened';
        update.opened_at = true;
        break;
      case 'action_clicked':
        update.status = 'action_clicked';
        update.action_clicked_at = true;
        if (action_id) update.action_id = action_id;
        break;
      case 'dismissed':
        // Nie zmieniamy statusu — tylko logujemy gdyby było potrzebne.
        break;
      default:
        return reply.code(400).send({ error: 'Nieznany event' });
    }

    if (Object.keys(update).length > 0) {
      // Nie cofamy statusu (opened > delivered > sent).
      const order = { pending: 0, queued: 1, suppressed: 1, sent: 2, delivered: 3, opened: 4, action_clicked: 5, failed: -1 };
      const { rows } = await req.db.query(
        `SELECT status FROM push_campaign_recipients WHERE id = $1 AND campaign_id = $2`,
        [recipient_id, campaign_id]
      );
      const current = rows[0];

      const currentRank = order[current?.status || 'pending'] ?? 0;
      const newRank = order[update.status] ?? 0;
      if (newRank >= currentRank) {
        const sets = [`status = $3`];
        const params = [recipient_id, campaign_id, update.status];
        if (update.delivered_at) sets.push(`delivered_at = NOW()`);
        if (update.opened_at) sets.push(`opened_at = NOW()`);
        if (update.action_clicked_at) sets.push(`action_clicked_at = NOW()`);
        if (update.action_id) {
          params.push(update.action_id);
          sets.push(`action_id = $${params.length}`);
        }
        await req.db.query(
          `UPDATE push_campaign_recipients SET ${sets.join(', ')} WHERE id = $1 AND campaign_id = $2`,
          params
        );
      }
    }

    // Agreguj statystyki (rzadko, np. co 10. event można by debounce'ować).
    await req.db.query(`SELECT update_push_campaign_stats($1)`, [campaign_id]);

    return reply.send({ ok: true });
  } catch (err) {
    req.log.error({ err }, 'push-event-track');
    return reply.code(500).send({ error: err.message });
  }
}
