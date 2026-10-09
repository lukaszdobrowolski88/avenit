// POST /api/fn/call-guest-info { token } → { church_name, title, call_live, kind, auto_admit, expires_at }
// PUBLICZNE (strona gościa /rozmowa/<token>, tenant z Host). Bez danych rozmowy poza nazwą
// (tylko gdy twórca linku pozwolił). 404 LINK_NOT_FOUND, 410 LINK_EXPIRED / LINK_FULL /
// LINK_UNAVAILABLE (niepełnoletni, nieaktywny kościół), 503 calls_disabled.
import { runGuestFn, guestInfo } from '../calls/guests.js';

export const name = 'call-guest-info';
export const isPublic = true;
export const rateLimit = { max: 60, timeWindow: '10 minutes' };

export default (req, reply) => runGuestFn(req, reply, guestInfo);
