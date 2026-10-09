// POST /api/fn/call-cancel { call_id } → { ok, call } — dzwoniący rezygnuje przed odebraniem (status cancelled).
// Logika: src/calls/service.js (maszyna stanów i zasady dostępu — także test/calls*.test.js).
import { runCallFn, cancelCall } from '../calls/service.js';

export const name = 'call-cancel';
export const capability = 'module:komunikator';

export default (req, reply) => runCallFn(req, reply, cancelCall);
