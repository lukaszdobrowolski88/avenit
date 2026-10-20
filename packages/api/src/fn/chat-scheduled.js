// Komunikator: zaplanowane wiadomości (migracja 113, src/chatSchedule/service.js).
// POST /api/fn/chat-scheduled { action, ... }
//   list    { conversation_id? }                                  → { scheduled: [...] } (moje: pending/failed)
//   create  { conversation_id, content, attachments?, mentions?, reply_to_id?, send_at } → { scheduled }
//   update  { id, content?, mentions?, send_at? }                 → { scheduled } (nieudaną — ponownie w kolejce)
//   cancel  { id }                                                → { scheduled }
//   send_now{ id }                                                → { scheduled, message }
// Worker (co minutę): runForTenant — należne wiadomości wysyłane jako nadawca (te same strażniki
// co /api/db), nieudane → 'failed' + powiadomienie nadawcy.
import { ApiError } from '../dataapi/querybuilder.js';
import {
  runChatScheduleFn, ctxFromWorker, createScheduled, updateScheduled, cancelScheduled, sendScheduledNow,
  listScheduled, runDueScheduled,
} from '../chatSchedule/service.js';

export const name = 'chat-scheduled';
export const capability = 'module:komunikator';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

const ACTIONS = {
  list: listScheduled,
  create: createScheduled,
  update: updateScheduled,
  cancel: cancelScheduled,
  send_now: sendScheduledNow,
};

export default async function handler(req, reply) {
  return runChatScheduleFn(req, reply, (ctx, user, body) => {
    const fn = ACTIONS[String(body?.action || '')];
    if (!fn) throw new ApiError(400, 'Nieznana operacja.', 'BAD_ACTION');
    return fn(ctx, user, body);
  });
}

export async function runForTenant(pool, ctx = {}, extraDeps = {}) {
  try {
    const stats = await runDueScheduled(ctxFromWorker(pool, ctx, extraDeps));
    if (stats.sent || stats.failed) ctx.log?.(`chat-scheduled: wysłano ${stats.sent}, nieudane ${stats.failed}`);
    return stats;
  } catch (err) {
    if (err?.code === '42P01') return { sent: 0, failed: 0, retry: 0 }; // tenant bez migracji 113
    throw err;
  }
}
