// POST /api/fn/interp-stats { event_id } → { status, total_listeners, original, channels: [{ id, status, listeners, publishing, … }] }
// Licznik słuchaczy per kanał (zarządzający i tłumacze; odpytywane co ~10 s).
// Dostęp liczy src/interpretation/service.js (bez wpisu w FN_CAPABILITY).
import { runInterpFn, stats } from '../interpretation/service.js';

export const name = 'interp-stats';
export const rateLimit = { max: 240, timeWindow: '10 minutes' };

export default (req, reply) => runInterpFn(req, reply, stats);
