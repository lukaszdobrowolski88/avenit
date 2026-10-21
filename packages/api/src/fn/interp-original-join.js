// POST /api/fn/interp-original-join { event_id } → { url, token, identity }
// Nadawanie kanału „Oryginał” (wejście z miksera) — zarządzający albo tłumacz wydarzenia.
// Dostęp liczy src/interpretation/service.js (bez wpisu w FN_CAPABILITY).
import { runInterpFn, originalJoin } from '../interpretation/service.js';

export const name = 'interp-original-join';
export const rateLimit = { max: 30, timeWindow: '1 minute' };

export default (req, reply) => runInterpFn(req, reply, originalJoin);
