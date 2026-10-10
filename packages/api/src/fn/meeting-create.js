// POST /api/fn/meeting-create { title, description, starts_at, duration_min, kind, guests_auto_admit,
//   members: [email], guests: [{ email, name }] } → { meeting }
// Spotkanie online z zaproszeniami: członkowie po koncie (powiadomienie + push), goście po e-mailu
// (osobisty link + plik kalendarza). Logika: src/meetings/service.js.
import { runMeetingFn, createMeeting } from '../meetings/service.js';

export const name = 'meeting-create';
export const capability = 'module:komunikator';
export const rateLimit = { max: 20, timeWindow: '10 minutes' };

export default (req, reply) => runMeetingFn(req, reply, createMeeting);
