// POST /api/fn/meeting-respond { meeting_id, response: 'accepted'|'tentative'|'declined' } → { meeting }
import { runMeetingFn, respondMeeting } from '../meetings/service.js';

export const name = 'meeting-respond';
export const capability = 'module:komunikator';
export const rateLimit = { max: 60, timeWindow: '10 minutes' };

export default (req, reply) => runMeetingFn(req, reply, respondMeeting);
