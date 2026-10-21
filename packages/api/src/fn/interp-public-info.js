// POST /api/fn/interp-public-info { token } → { church_name, event, status, channels: [{ id, lang_code, label, live }] }
// PUBLICZNE (strona słuchacza /tlumaczenie/<token>, tenant z Host). Bez tokenu, pokoi, tłumaczy i id wydarzenia.
// Limit per IP duży: cała sala słucha zza jednego NAT-u Wi-Fi kościoła (strona odpytuje co ~10 s).
import { runPublicInterpFn, publicInfo } from '../interpretation/service.js';

export const name = 'interp-public-info';
export const isPublic = true;
export const rateLimit = { max: 3000, timeWindow: '1 minute' };

export default (req, reply) => runPublicInterpFn(req, reply, publicInfo);
