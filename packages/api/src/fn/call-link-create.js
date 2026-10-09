// POST /api/fn/call-link-create { conversation_id, expires_in: '1h'|'24h'|'7d', auto_admit, show_title, max_uses }
//   → { link: { id, token, path, expires_at, auto_admit, show_title, max_uses, uses, ... } }
// Link „zaproś gościa” do połączeń rozmowy: 1:1 — każda strona; grupa — administrator rozmowy
// albo admin aplikacji; nigdy w rozmowie z osobą niepełnoletnią. Logika: src/calls/guests.js.
import { runCallFn } from '../calls/service.js';
import { createGuestLink } from '../calls/guests.js';

export const name = 'call-link-create';
export const capability = 'module:komunikator';
export const rateLimit = { max: 20, timeWindow: '10 minutes' };

export default (req, reply) => runCallFn(req, reply, createGuestLink);
