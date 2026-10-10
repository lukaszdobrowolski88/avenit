// POST /api/fn/meeting-ics { meeting_id } → { filename, content } — plik kalendarza dla uczestnika.
import { runMeetingFn, meetingIcs } from '../meetings/service.js';

export const name = 'meeting-ics';
export const capability = 'module:komunikator';

export default (req, reply) => runMeetingFn(req, reply, meetingIcs);
