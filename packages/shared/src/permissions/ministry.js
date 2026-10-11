// Wyprowadzanie uprawnień z PRZYNALEŻNOŚCI DO SŁUŻB (ministry_memberships).
// Model: osoba należy do służby jako 'leader' albo 'member'. Z tego wyprowadzamy granty
// per-osoba, które dokładamy w resolverze OBOK grantów roli i nadpisań użytkownika.
//
// Zasady:
//  • ADDYTYWNE — przynależność TYLKO nadaje dostęp (allowed:true), nigdy nie odbiera.
//    Dzięki temu włączenie modelu nikomu nie zabiera uprawnień (zasada „najpierw luźniej”).
//  • „służba” = moduł (app_modules.key / team_type). Leader = pełny zakres modułu
//    (z usuwaniem i akcjami), member = współpraca (odczyt/tworzenie/edycja, bez usuwania).
//  • Zasoby modułu (media_events, media_tasks…) znaczą też „wycinek wspólnej tabeli tej
//    służby” — wydarzenia (events.module_key), grafik i tablice zadań modułu (moduleScope.js).
//  • Kampus NIE jest tu uwzględniany — to osobny wymiar egzekwowany po stronie serwera
//    w późniejszym, ostrożnym etapie (twarda izolacja kampusów). W Fazie 1 przynależność
//    oznacza dostęp do danej służby.
import { MODULES } from './catalog.js';

const MODULE_BY_KEY = {};
for (const m of MODULES) MODULE_BY_KEY[m.key] = m;

// Zasoby modułu własnego (kreator) — spójne z CUSTOM_MODULE_RESOURCES w catalog.js
// i CUSTOM_TABLE_SUFFIXES w registry.js (enforcement res:custom_<key>_<suffix>:<op>).
export const CUSTOM_MINISTRY_SUFFIXES = ['members', 'tasks', 'task_comments', 'wall', 'events', 'records'];
export const LEADER_SCHEDULE_ACTION = 'action:programs:send_assignment';
// Capability z tym prefiksem w membershipCapabilities = zakaz (allowed:false) w ministryGrants.
export const DENY_PREFIX = '!';

// Capability wynikające z jednej przynależności (klucz służby + rola).
export function membershipCapabilities(ministryKey, role) {
  if (!ministryKey) return [];
  const isLeader = role === 'leader';
  const caps = [`module:${ministryKey}`, `tab:${ministryKey}:*`];
  // Finanse służby (budżet, wydatki) widzi tylko LIDER służby — członek dostaje jawny zakaz tej
  // jednej zakładki (wyjątek od zasady „tylko nadaje”; serwer zawęża finanse po tej zakładce).
  if (!isLeader) caps.push(DENY_PREFIX + `tab:${ministryKey}:finances`);
  const mod = MODULE_BY_KEY[ministryKey];
  const resources = mod ? mod.resources : CUSTOM_MINISTRY_SUFFIXES.map((s) => `custom_${ministryKey}_${s}`);
  const ops = isLeader ? ['read', 'create', 'update', 'delete'] : ['read', 'create', 'update'];
  for (const r of resources) for (const op of ops) caps.push(`res:${r}:${op}`);
  // Akcje modułu (wyślij/eksport/…) tylko dla lidera służby.
  if (isLeader && mod) for (const a of mod.actions || []) caps.push(`action:${ministryKey}:${a.key}`);
  // Lider układa grafik swojej służby (wydarzenia i tablice — moduleScope.js) i wysyła z niego
  // zaproszenia: fn send-assignment-invites wymaga action:programs:send_assignment.
  if (isLeader) caps.push(LEADER_SCHEDULE_ACTION);
  // Program nabożeństwa (wspólny, bez służby) edytuje lider Uwielbienia — decyzja 2026-10-11.
  if (isLeader && PROGRAM_EDITOR_MINISTRIES.includes(ministryKey)) caps.push(...PROGRAM_EDITOR_CAPS);
  return caps;
}

// Służby, których LIDER edytuje programy nabożeństw, i prawa, które to daje (bez usuwania programu).
export const PROGRAM_EDITOR_MINISTRIES = ['worship'];
export const PROGRAM_EDITOR_CAPS = [
  'module:programs',
  'res:programs:read', 'res:programs:create', 'res:programs:update',
  'res:program_songs:read', 'res:program_songs:create', 'res:program_songs:update', 'res:program_songs:delete',
  'res:program_types:read',
  'res:program_templates:read', 'res:program_templates:create', 'res:program_templates:update',
  'res:program_song_suggestions:read', 'res:program_song_suggestions:create',
  'res:program_song_suggestions:update', 'res:program_song_suggestions:delete',
  'action:programs:publish', 'action:programs:send_email',
];

// Z listy przynależności osoby → płaskie granty { capability, allowed:true } (bez duplikatów)
// do dołożenia w resolverze. memberships: [{ ministry_key, role }].
export function ministryGrants(memberships = []) {
  const seen = new Set();
  const grants = [];
  // Jedna rola na służbę — najwyższa (lider wygrywa), żeby zakaz Finansów członka nie
  // odebrał ich osobie, która w tej samej służbie jest też liderem.
  const best = new Map();
  for (const m of memberships || []) {
    if (!m || !m.ministry_key) continue;
    if (best.get(m.ministry_key) !== 'leader') best.set(m.ministry_key, m.role === 'leader' ? 'leader' : 'member');
  }
  for (const [ministryKey, role] of best) {
    for (const raw of membershipCapabilities(ministryKey, role)) {
      const allowed = !raw.startsWith(DENY_PREFIX);
      const cap = allowed ? raw : raw.slice(DENY_PREFIX.length);
      if (seen.has(cap)) continue;
      seen.add(cap);
      grants.push({ capability: cap, allowed });
    }
  }
  return grants;
}
