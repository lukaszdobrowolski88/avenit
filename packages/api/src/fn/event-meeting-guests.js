// POST /api/fn/event-meeting-guests { event_id, add?: [{ email, name }], remove?: [invite_id] }
//   → { guests, added, members_added }
// Goście wydarzenia online/hybrydowego po e-mailu (osobisty link + plik kalendarza). Zaprasza osoba,
// która może edytować wydarzenie; adres osoby z kontem → uczestnik spotkania po koncie.
import { runMeetingFn } from '../meetings/service.js';
import { eventMeetingGuests } from '../meetings/events.js';

export const name = 'event-meeting-guests';
export const rateLimit = { max: 30, timeWindow: '10 minutes' };

export default (req, reply) => runMeetingFn(req, reply, eventMeetingGuests);
