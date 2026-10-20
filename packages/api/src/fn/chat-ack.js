// Komunikator — „Ważne — potwierdź przeczytanie” (migracja 115).
// POST /api/fn/chat-ack { action, message_id? }:
//   action 'ack'     → „Rozumiem” (uczestnik rozmowy, nie nadawca) → { ok, ack }
//   action 'status'  → kto potwierdził / kto nie (nadawca, administrator rozmowy)
//                      → { total, acked_count, acked[], pending[], last_reminded_at, next_remind_at }
//   action 'remind'  → push do niepotwierdzonych, raz na 6 h (nadawca, administrator) → { sent, pending, … }
//                      albo 429 ACK_REMIND_TOO_SOON { next_remind_at }
//   action 'pending' → plakietka listy rozmów: { counts: { [conversation_id]: n } }
// Logika i zasady: src/dataapi/komunikatorAcks.js (testy: test/chat-ack.test.js).
import { ApiError } from '../dataapi/querybuilder.js';
import { ACK_ACTIONS } from '../dataapi/komunikatorAcks.js';

export const name = 'chat-ack';
export const capability = 'module:komunikator';

export default async function handler(req, reply) {
  const body = req.body || {};
  const action = ACK_ACTIONS[String(body.action || 'ack')];
  try {
    if (!action) throw new ApiError(400, 'Nieznana akcja');
    const ctx = { db: req.db, tenantSlug: req.tenant?.slug, log: req.log };
    return reply.send(await action(ctx, req.user, body));
  } catch (err) {
    if (err instanceof ApiError || (err && Number.isInteger(err.status))) {
      return reply.code(err.status).send({
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.next_remind_at ? { next_remind_at: err.next_remind_at } : {}),
      });
    }
    req.log?.error?.({ err }, 'chat-ack: błąd');
    return reply.code(500).send({ error: 'Nie udało się zapisać potwierdzenia. Spróbuj ponownie.' });
  }
}
