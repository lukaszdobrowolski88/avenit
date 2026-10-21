// POST /api/fn/interp-session-get { event_id } → { event, can_manage, my_channels, session, presets?, people? }
// Stan tłumaczenia na żywo wydarzenia (widzący wydarzenie albo tłumacz); konfiguracja i link — tylko zarządzający.
// Dostęp liczy src/interpretation/service.js (bez wpisu w FN_CAPABILITY).
import { runInterpFn, getSession } from '../interpretation/service.js';

export const name = 'interp-session-get';
export const rateLimit = { max: 240, timeWindow: '10 minutes' };

export default (req, reply) => runInterpFn(req, reply, getSession);
