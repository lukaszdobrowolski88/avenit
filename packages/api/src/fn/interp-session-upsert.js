// POST /api/fn/interp-session-upsert { event_id, enable?, remove?, channels?, original_enabled?, regenerate_token?, end?, reopen? } → jak interp-session-get
// Włączenie, języki, tłumacze, „Oryginał”, nowy link, zakończenie — action:calendar:manage_interpretation albo administrator.
// Dostęp liczy src/interpretation/service.js (bez wpisu w FN_CAPABILITY).
import { runInterpFn, upsertSession } from '../interpretation/service.js';

export const name = 'interp-session-upsert';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

export default (req, reply) => runInterpFn(req, reply, upsertSession);
