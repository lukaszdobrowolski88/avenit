// Komunikator — media, pliki, linki i głosówki rozmowy (panel informacji o rozmowie).
// POST /api/fn/chat-media { conversation_id, kind: 'media'|'files'|'links'|'voice', cursor?, limit? }
//   → { kind, items, next } (next = kursor kolejnej paczki albo null). Tylko uczestnik rozmowy.
// Logika: src/dataapi/komunikatorMedia.js (testy: test/chat-media.test.js).
import { ApiError } from '../dataapi/querybuilder.js';
import { conversationMedia } from '../dataapi/komunikatorMedia.js';

export const name = 'chat-media';
export const capability = 'module:komunikator';

export default async function handler(req, reply) {
  try {
    return reply.send(await conversationMedia({ db: req.db }, req.user, req.body || {}));
  } catch (err) {
    if (err instanceof ApiError || (err && Number.isInteger(err.status))) {
      return reply.code(err.status).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    req.log?.error?.({ err }, 'chat-media: błąd');
    return reply.code(500).send({ error: 'Nie udało się wczytać materiałów rozmowy. Spróbuj ponownie.' });
  }
}
