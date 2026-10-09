// POST /api/fn/call-start { conversation_id, kind: 'audio'|'video' } → { call, token, url, room, can_publish, joined_existing }.
// Zaczyna połączenie w rozmowie (dzwoni do pozostałych: realtime calls INSERT + push type 'call'),
// a gdy w rozmowie trwa już połączenie — dołącza do niego. 503 calls_disabled bez kluczy LiveKit.
// Logika: src/calls/service.js (maszyna stanów i zasady dostępu — także test/calls*.test.js).
import { runCallFn, startCall } from '../calls/service.js';

export const name = 'call-start';
export const capability = 'module:komunikator';
export const rateLimit = { max: 20, timeWindow: '1 minute' };

export default (req, reply) => runCallFn(req, reply, startCall);
