// POST /api/fn/call-link-list { conversation_id } → { links, can_manage, can_create, reason, message }
// Aktywne linki gości rozmowy (okno „Zaproś gościa”). Logika: src/calls/guests.js.
import { runCallFn } from '../calls/service.js';
import { listGuestLinks } from '../calls/guests.js';

export const name = 'call-link-list';
export const capability = 'module:komunikator';

export default (req, reply) => runCallFn(req, reply, listGuestLinks);
