// POST /api/fn/call-guest-deny { request_id } → { ok, request }
// Odrzucenie prośby gościa — każdy uczestnik rozmowy (konto). Logika: src/calls/guests.js.
import { runCallFn } from '../calls/service.js';
import { denyGuest } from '../calls/guests.js';

export const name = 'call-guest-deny';
export const capability = 'module:komunikator';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

export default (req, reply) => runCallFn(req, reply, denyGuest);
