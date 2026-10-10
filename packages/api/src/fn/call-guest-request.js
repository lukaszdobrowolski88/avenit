// POST /api/fn/call-guest-request { token, name } → { request_id, secret, status: 'pending'|'admitted', name }
// PUBLICZNE: gość prosi o wejście (poczekalnia; „wpuszczaj bez pytania” — od razu admitted).
// Sekret wraca tylko tu (w bazie sha256). Limit per IP + najwyżej 20 oczekujących na link.
import { runGuestFn, guestRequest } from '../calls/guests.js';

export const name = 'call-guest-request';
export const isPublic = true;
export const rateLimit = { max: 10, timeWindow: '10 minutes' };

export default (req, reply) => runGuestFn(req, reply, guestRequest);
