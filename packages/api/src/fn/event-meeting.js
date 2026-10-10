// POST /api/fn/event-meeting { event_id, join?: true } → { status, meeting?, joined? }
// Wydarzenie online/hybrydowe (099): stan spotkania (trwa? jestem uczestnikiem?) i „Dołącz” —
// dopisanie do rozmowy spotkania każdego, kto WIDZI wydarzenie (moduł, kampus, segmenty
// widoczności — jak /api/db). Bez osobnego capability: dostęp sprawdza src/meetings/events.js.
import { runMeetingFn } from '../meetings/service.js';
import { eventMeeting } from '../meetings/events.js';

export const name = 'event-meeting';
export const rateLimit = { max: 120, timeWindow: '10 minutes' };

export default (req, reply) => runMeetingFn(req, reply, eventMeeting);
