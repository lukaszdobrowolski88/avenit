// POST /api/fn/interp-member-listen { event_id, channel_id } → { url, token, channel }
// Słuchanie z aplikacji (zalogowany, widzi wydarzenie) — token słuchacza jak z publicznego linku.
// Dostęp liczy src/interpretation/service.js (bez wpisu w FN_CAPABILITY).
import { runInterpFn, memberListen } from '../interpretation/service.js';

export const name = 'interp-member-listen';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

export default (req, reply) => runInterpFn(req, reply, memberListen);
