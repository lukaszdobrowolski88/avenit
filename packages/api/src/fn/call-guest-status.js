// POST /api/fn/call-guest-status { request_id, secret } →
//   { status: 'pending'|'admitted'|'denied'|'left'|'expired'|'ended', waiting?, token?, url?, room?, kind? }
// PUBLICZNE: odpytywane przez stronę gościa co ~3 s. Token LiveKit (15 min, tylko pokój
// bieżącego połączenia, tożsamość guest:<hex>) dopiero po wpuszczeniu i gdy w rozmowie ktoś jest.
import { runGuestFn, guestStatus } from '../calls/guests.js';

export const name = 'call-guest-status';
export const isPublic = true;
export const rateLimit = { max: 120, timeWindow: '1 minute' };

export default (req, reply) => runGuestFn(req, reply, guestStatus);
