// POST /api/fn/call-decline { call_id } → { ok, call } — odrzucenie (1:1: status declined; grupa: tylko ja).
// Logika: src/calls/service.js (maszyna stanów i zasady dostępu — także test/calls*.test.js).
import { runCallFn, declineCall } from '../calls/service.js';

export const name = 'call-decline';
export const capability = 'module:komunikator';

export default (req, reply) => runCallFn(req, reply, declineCall);
