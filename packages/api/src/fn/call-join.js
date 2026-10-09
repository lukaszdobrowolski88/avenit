// POST /api/fn/call-join { call_id } → { call, token, url, room, can_publish } — odebranie / dołączenie.
// Logika: src/calls/service.js (maszyna stanów i zasady dostępu — także test/calls*.test.js).
import { runCallFn, joinCall } from '../calls/service.js';

export const name = 'call-join';
export const capability = 'module:komunikator';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

export default (req, reply) => runCallFn(req, reply, joinCall);
