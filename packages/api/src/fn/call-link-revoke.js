// POST /api/fn/call-link-revoke { link_id } → { ok, link }
// Wyłącza link gościa: oczekujące prośby wygasają, goście z tego linku wychodzą z pokoju.
// Logika: src/calls/guests.js.
import { runCallFn } from '../calls/service.js';
import { revokeGuestLink } from '../calls/guests.js';

export const name = 'call-link-revoke';
export const capability = 'module:komunikator';
export const rateLimit = { max: 60, timeWindow: '10 minutes' };

export default (req, reply) => runCallFn(req, reply, revokeGuestLink);
