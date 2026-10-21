// POST /api/fn/interp-interpreter-join { channel_id } → { url, token, identity, channel, partners, original, session_status }
// Konsola tłumacza: token LiveKit kanału (tylko mikrofon) + odsłuch „Oryginału”. Przypisany tłumacz albo zarządzający.
// Dostęp liczy src/interpretation/service.js (bez wpisu w FN_CAPABILITY).
import { runInterpFn, interpreterJoin } from '../interpretation/service.js';

export const name = 'interp-interpreter-join';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

export default (req, reply) => runInterpFn(req, reply, interpreterJoin);
