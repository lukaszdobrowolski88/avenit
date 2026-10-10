// POST /api/fn/meeting-cancel { meeting_id } → { meeting }
// Odwołanie: linki gości przestają działać, zaproszeni dostają informację; czat spotkania zostaje.
import { runMeetingFn, cancelMeeting } from '../meetings/service.js';

export const name = 'meeting-cancel';
export const capability = 'module:komunikator';
export const rateLimit = { max: 20, timeWindow: '10 minutes' };

export default (req, reply) => runMeetingFn(req, reply, cancelMeeting);
