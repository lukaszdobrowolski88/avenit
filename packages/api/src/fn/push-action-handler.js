// Port edge function push-action-handler: akcje "inline" z pusha (bez otwierania appki).
// Oryginał: supabase/functions/push-action-handler/index.ts.
// Aktualizuje push_campaign_recipients + loguje odpowiedź w push_inline_responses.
//
// Body:
//   campaign_id, recipient_id, action_id?, action_type?, action_value?
//   (user_email z body jest ignorowany — e-mail bierzemy z wiersza odbiorcy kampanii,
//   więc nie da się zapisać odpowiedzi „w czyimś imieniu”.)
//
// Publiczne (wołane z service workera / mobile bez sesji): para campaign_id + recipient_id
// (losowe UUID z treści pusha) działa jak token; limit wywołań per IP (audyt 2026-10, runda 3).

export const name = 'push-action-handler';
export const isPublic = true; // wołane z mobile/web service workera bez sesji
export const rateLimit = { max: 120, timeWindow: '1 minute' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

export default async function handler(req, reply) {
  try {
    if (!req.db) return reply.code(404).send({ error: 'Nieznany tenant' });
    const { campaign_id, recipient_id, action_id, action_type, action_value } = req.body || {};
    if (!campaign_id || !recipient_id) {
      return reply.code(400).send({ error: 'Brak wymaganych pól' });
    }
    if (!isUuid(campaign_id) || !isUuid(recipient_id) || (action_id != null && action_id !== '' && !isUuid(action_id))) {
      return reply.code(404).send({ error: 'Nie znaleziono odbiorcy' });
    }

    // 1. Zaznacz akcję w recipients (tylko istniejąca para kampania + odbiorca).
    const { rows } = await req.db.query(
      `UPDATE push_campaign_recipients
          SET status = 'action_clicked', action_clicked_at = NOW(), action_id = $3
        WHERE id = $1 AND campaign_id = $2
        RETURNING user_email`,
      [recipient_id, campaign_id, action_id || null]
    );
    const recipient = rows[0];
    if (!recipient) return reply.code(404).send({ error: 'Nie znaleziono odbiorcy' });

    // 2. Wykonaj inline akcję.
    if (action_type === 'inline_rsvp') {
      // Akcja RSVP jest zapisywana do tabeli push_inline_responses (uniwersalny log).
      // Mapowanie do konkretnych tabel (event_attendance itd.) zostawiamy aplikacji.
      await req.db.query(
        `INSERT INTO push_inline_responses (campaign_id, recipient_id, user_email, response_type, response_value, created_at)
         VALUES ($1, $2, $3, 'rsvp', $4, NOW())
         ON CONFLICT (recipient_id) DO UPDATE
           SET campaign_id = EXCLUDED.campaign_id,
               user_email = EXCLUDED.user_email,
               response_type = EXCLUDED.response_type,
               response_value = EXCLUDED.response_value,
               created_at = EXCLUDED.created_at`,
        [campaign_id, recipient_id, recipient.user_email, String(action_value ?? '').slice(0, 200)]
      );
    }

    // 3. Agreguj stats kampanii.
    await req.db.query(`SELECT update_push_campaign_stats($1)`, [campaign_id]);

    return reply.send({ ok: true });
  } catch (err) {
    req.log.error({ err }, 'push-action-handler');
    return reply.code(500).send({ error: 'Błąd zapisu akcji' });
  }
}
