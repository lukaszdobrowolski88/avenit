import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// Polityka rozmów prywatnych (K9): GET /api/fn/chat-policy →
//   { dm, protectMinors, canStartDirect, canStartDirectWith: 'all'|'leaders'|'minors'|null, isLeader, isMinor }
// (POST z { with: [e-maile] } dodaje allowedWith: { email: bool }). Serwer i tak egzekwuje
// (403 DM_NOT_ALLOWED); tu tylko ukrywamy/objaśniamy „Nową rozmowę prywatną”.
// Brak funkcji na serwerze / błąd → domyślnie wszystko dozwolone (jak przed zmianą).
export const DEFAULT_CHAT_POLICY = Object.freeze({ dm: 'all', protectMinors: true, canStartDirect: true, scope: 'all', allowedEmails: null, isLeader: false, isMinor: false });

export function normalizeChatPolicy(p) {
  if (!p || typeof p !== 'object') return { ...DEFAULT_CHAT_POLICY };
  const dm = ['all', 'leaders', 'off'].includes(p.dm) ? p.dm : 'all';
  const withVal = p.canStartDirectWith;
  const allowedEmails = Array.isArray(withVal) ? withVal.filter(Boolean).map(String) : null;
  let canStartDirect;
  if (typeof p.canStartDirect === 'boolean') canStartDirect = p.canStartDirect;
  else if (typeof withVal === 'boolean') canStartDirect = withVal;
  else if (withVal === null) canStartDirect = false;
  else if (allowedEmails) canStartDirect = allowedEmails.length > 0;
  else canStartDirect = dm !== 'off';
  // Z kim: 'all' | 'leaders' (tylko z liderem/administratorem) | 'minors' (osoba niepełnoletnia —
  // tylko z rówieśnikami/rodziną) | null (z nikim).
  let scope = typeof withVal === 'string' && ['all', 'leaders', 'minors'].includes(withVal) ? withVal : null;
  if (!scope) scope = !canStartDirect ? null : allowedEmails ? 'list' : 'all';
  return {
    dm,
    protectMinors: p.protectMinors !== false && p.protect_minors !== false,
    canStartDirect,
    scope,
    allowedEmails,
    isLeader: !!p.isLeader,
    isMinor: !!p.isMinor,
  };
}

// Z kim konkretnie wolno zacząć rozmowę 1:1 → { email(lower): bool }. Pusty obiekt = nie wiadomo.
export async function fetchDirectAllowed(emails = []) {
  const list = [...new Set(emails.map(e => String(e || '').trim().toLowerCase()).filter(e => e.includes('@')))];
  const out = {};
  for (let i = 0; i < list.length; i += 200) {
    try {
      const { data, error } = await supabase.functions.invoke('chat-policy', { body: { with: list.slice(i, i + 200) }, silent: true });
      if (error || !data?.allowedWith) return out;
      for (const [k, v] of Object.entries(data.allowedWith)) out[String(k).toLowerCase()] = !!v;
    } catch {
      return out;
    }
  }
  return out;
}

let cache = null; // { at, value }
let inflight = null;
const TTL = 5 * 60 * 1000;

async function requestPolicy() {
  // Kontrakt: GET. Starszy/niegotowy serwer — próba POST przez functions.invoke, potem domyślne.
  try {
    const res = await supabase._request?.('/api/fn/chat-policy');
    if (res?.ok) return normalizeChatPolicy(await res.json().catch(() => null));
  } catch { /* spróbuj POST */ }
  try {
    const { data, error } = await supabase.functions.invoke('chat-policy', { body: {}, silent: true });
    if (!error && data) return normalizeChatPolicy(data);
  } catch { /* domyślne */ }
  return { ...DEFAULT_CHAT_POLICY };
}

export function fetchChatPolicy({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.value);
  if (!inflight) {
    inflight = requestPolicy()
      .then((value) => { cache = { at: Date.now(), value }; return value; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export default function useChatPolicy(enabled = true) {
  const [policy, setPolicy] = useState(() => cache?.value || DEFAULT_CHAT_POLICY);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchChatPolicy().then((p) => { if (alive) setPolicy(p); });
    return () => { alive = false; };
  }, [enabled]);
  return policy;
}
