// POST /api/fn/call-leave { call_id } → { ok, call } — wyjście z rozmowy (1:1 kończy połączenie; grupa — webhook).
// Logika: src/calls/service.js (maszyna stanów i zasady dostępu — także test/calls*.test.js).
import { runCallFn, leaveCall } from '../calls/service.js';

export const name = 'call-leave';
export const capability = 'module:komunikator';

export default (req, reply) => runCallFn(req, reply, leaveCall);
