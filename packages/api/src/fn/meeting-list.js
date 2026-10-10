// POST /api/fn/meeting-list { from?, to?, include_cancelled? } → { meetings } — moje spotkania.
import { runMeetingFn, listMeetings } from '../meetings/service.js';

export const name = 'meeting-list';
export const capability = 'module:komunikator';

export default (req, reply) => runMeetingFn(req, reply, listMeetings);
