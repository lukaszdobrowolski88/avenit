// POST /api/fn/call-guest-admit { request_id } → { ok, request }
// Wpuszczenie gościa z poczekalni — każdy uczestnik rozmowy (konto). Logika: src/calls/guests.js.
import { runCallFn } from '../calls/service.js';
import { admitGuest } from '../calls/guests.js';

export const name = 'call-guest-admit';
export const capability = 'module:komunikator';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

export default (req, reply) => runCallFn(req, reply, admitGuest);
