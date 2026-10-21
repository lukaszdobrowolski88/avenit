// POST /api/fn/interp-listen { token, channel_id } → { url, token, channel }
// PUBLICZNE: token słuchacza (listener:<hex>, ukryty, bez publikowania i kanału danych, 4 h) — tylko
// kanał, który nadaje (409 CHANNEL_NOT_LIVE — strona czeka i łączy sama).
import { runPublicInterpFn, publicListen } from '../interpretation/service.js';

export const name = 'interp-listen';
export const isPublic = true;
export const rateLimit = { max: 1500, timeWindow: '1 minute' };

export default (req, reply) => runPublicInterpFn(req, reply, publicListen);
