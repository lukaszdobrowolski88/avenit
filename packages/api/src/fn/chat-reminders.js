// Komunikator: „Przypomnij mi” o wiadomości (migracja 113, src/chatSchedule/service.js).
// POST /api/fn/chat-reminders { action, ... }
//   list   { message_id? }          → { reminders: [...] } (moje aktywne, z podglądem i miejscem)
//   create { message_id, remind_at } → { reminder } (ponownie o tej samej wiadomości — nowy termin)
//   cancel { id }                    → { reminder }
// Worker (co minutę): runForTenant — push + wpis w Powiadomieniach (typ 'reminder', link do wiadomości);
// kto opuścił rozmowę albo wiadomość usunięto — przypomnienie przepada.
import { ApiError } from '../dataapi/querybuilder.js';
import {
  runChatScheduleFn, ctxFromWorker, createReminder, cancelReminder, listReminders, runDueReminders,
} from '../chatSchedule/service.js';

export const name = 'chat-reminders';
export const capability = 'module:komunikator';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

const ACTIONS = { list: listReminders, create: createReminder, cancel: cancelReminder };

export default async function handler(req, reply) {
  return runChatScheduleFn(req, reply, (ctx, user, body) => {
    const fn = ACTIONS[String(body?.action || '')];
    if (!fn) throw new ApiError(400, 'Nieznana operacja.', 'BAD_ACTION');
    return fn(ctx, user, body);
  });
}

export async function runForTenant(pool, ctx = {}, extraDeps = {}) {
  try {
    const stats = await runDueReminders(ctxFromWorker(pool, ctx, extraDeps));
    if (stats.sent || stats.skipped) ctx.log?.(`chat-reminders: wysłano ${stats.sent}, pominięto ${stats.skipped}`);
    return stats;
  } catch (err) {
    if (err?.code === '42P01') return { sent: 0, skipped: 0 }; // tenant bez migracji 113
    throw err;
  }
}
