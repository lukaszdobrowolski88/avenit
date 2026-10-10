// POST /api/fn/meeting-guest-rsvp { token, response: 'accepted'|'tentative'|'declined' } → { ok, response }
// PUBLICZNE (strona gościa /rozmowa/<token>): odpowiedź gościa na zaproszenie e-mail.
import { runGuestFn } from '../calls/guests.js';
import { guestRsvp } from '../meetings/service.js';

export const name = 'meeting-guest-rsvp';
export const isPublic = true;
export const rateLimit = { max: 30, timeWindow: '10 minutes' };

export default (req, reply) => runGuestFn(req, reply, guestRsvp);
