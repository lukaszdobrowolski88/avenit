// Komunikator+ (K9): polityka rozmów prywatnych dla klienta (web/mobilka).
// GET|POST /api/fn/chat-policy  [?with=<email>|body { with: email | email[] }]
// → {
//     dm: 'all' | 'leaders' | 'off',       // app_settings.chat_dm_policy (domyślnie 'all')
//     protectMinors: boolean,               // app_settings.chat_protect_minors (domyślnie true)
//     canStartDirect: boolean,              // czy w ogóle mogę zaczynać rozmowy 1:1
//     canStartDirectWith: 'all' | 'leaders' | 'minors' | null,  // z kim (null = z nikim)
//     isLeader: boolean, isMinor: boolean,  // mój status wg polityki
//     allowedWith?: { [email]: boolean }    // gdy podano `with` — czy wolno zacząć z tą osobą
//   }
// Egzekucja i tak jest na serwerze (komunikator.js → 403 DM_NOT_ALLOWED / BLOCKED); to tylko
// podpowiedź, żeby klient mógł ukryć albo objaśnić „Nową rozmowę prywatną”.
import { loadChatSettings, dmParties, dmDecision, hasBlocked } from '../dataapi/komunikatorPlus.js';

export const name = 'chat-policy';
export const methods = ['GET', 'POST'];

const lower = (v) => String(v ?? '').trim().toLowerCase();

// Z kim mogę zaczynać (czysta funkcja — testowana).
export function directScope(settings, me) {
  if (settings.dm === 'off') return null;
  if (settings.dm === 'leaders' && !me.isLeader) return 'leaders';
  if (settings.protectMinors && me.isMinor) return 'minors';
  return 'all';
}

export default async function handler(req, reply) {
  const me = lower(req.user?.email);
  if (!me) return reply.code(401).send({ error: 'Brak sesji' });
  const raw = req.body?.with ?? req.query?.with;
  const others = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map(lower).filter((e) => e.includes('@') && e !== me))].slice(0, 200);

  try {
    const settings = await loadChatSettings(req.db, { fresh: true });
    // Mój status liczymy zawsze (klient objaśnia regułę), osoby z `with` — tylko na życzenie.
    const parties = await dmParties(req.db, { dm: 'leaders', protectMinors: true }, [me, ...others]);
    const mine = parties[me] || { isLeader: false, isMinor: false };
    const scope = directScope(settings, mine);
    const out = {
      dm: settings.dm,
      protectMinors: settings.protectMinors,
      canStartDirect: scope !== null,
      canStartDirectWith: scope,
      isLeader: !!mine.isLeader,
      isMinor: settings.protectMinors ? !!mine.isMinor : false,
    };
    if (others.length) {
      out.allowedWith = {};
      for (const o of others) {
        const blocked = await hasBlocked(req.db, o, me);
        out.allowedWith[o] = !blocked && dmDecision(settings, mine, parties[o]).ok;
      }
    }
    return reply.send(out);
  } catch (err) {
    req.log.error({ err }, 'chat-policy error');
    return reply.send({ dm: 'all', protectMinors: true, canStartDirect: true, canStartDirectWith: 'all', isLeader: false, isMinor: false });
  }
}
