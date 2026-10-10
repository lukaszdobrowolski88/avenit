// POST /api/fn/call-guest-leave { request_id, secret } → { ok, status }
// PUBLICZNE: gość rezygnuje z poczekalni albo opuszcza rozmowę („Opuść”).
import { runGuestFn, guestLeave } from '../calls/guests.js';

export const name = 'call-guest-leave';
export const isPublic = true;
export const rateLimit = { max: 30, timeWindow: '1 minute' };

export default (req, reply) => runGuestFn(req, reply, guestLeave);
