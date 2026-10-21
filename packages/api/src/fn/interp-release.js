// POST /api/fn/interp-release { channel_id, force? } → { channel }
// „Oddaj mikrofon” (force — zarządzający zwalnia dowolnego tłumacza).
// Dostęp liczy src/interpretation/service.js (bez wpisu w FN_CAPABILITY).
import { runInterpFn, release } from '../interpretation/service.js';

export const name = 'interp-release';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

export default (req, reply) => runInterpFn(req, reply, release);
