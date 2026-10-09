// POST /api/fn/call-config → { enabled, url } — czy połączenia są włączone (web chowa przyciski, gdy nie).
// Logika: src/calls/service.js (maszyna stanów i zasady dostępu — także test/calls*.test.js).
import { runCallFn, callConfig } from '../calls/service.js';

export const name = 'call-config';
export const capability = 'module:komunikator';

export default (req, reply) => runCallFn(req, reply, callConfig);
