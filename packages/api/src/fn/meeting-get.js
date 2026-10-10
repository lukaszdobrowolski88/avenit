// POST /api/fn/meeting-get { meeting_id | conversation_id } → { meeting }
// Uczestnik spotkania: termin, organizator, odpowiedzi; e-maile gości tylko dla zarządzających.
import { runMeetingFn, getMeeting } from '../meetings/service.js';

export const name = 'meeting-get';
export const capability = 'module:komunikator';

export default (req, reply) => runMeetingFn(req, reply, getMeeting);
