// POST /api/fn/interp-take-over { channel_id } → { channel, muted }
// „Przejmij mikrofon”: aktywny tłumacz kanału = ja, poprzedni wyciszony na serwerze (metadane pokoju).
// Dostęp liczy src/interpretation/service.js (bez wpisu w FN_CAPABILITY).
import { runInterpFn, takeOver } from '../interpretation/service.js';

export const name = 'interp-take-over';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

export default (req, reply) => runInterpFn(req, reply, takeOver);
