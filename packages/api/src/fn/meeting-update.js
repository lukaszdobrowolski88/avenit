// POST /api/fn/meeting-update { meeting_id, title?, description?, starts_at?, duration_min?, kind?,
//   guests_auto_admit?, members?: [email], guests?: [{ email, name }] } → { meeting }
// Organizator / administrator: zmiana terminu (goście dostają aktualizację kalendarza), dopisanie
// i usunięcie osób. Logika: src/meetings/service.js.
import { runMeetingFn, updateMeeting } from '../meetings/service.js';

export const name = 'meeting-update';
export const capability = 'module:komunikator';
export const rateLimit = { max: 30, timeWindow: '10 minutes' };

export default (req, reply) => runMeetingFn(req, reply, updateMeeting);
