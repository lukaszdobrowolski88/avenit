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

// Capability wynikające z jednej przynależności (klucz służby + rola).
export function membershipCapabilities(ministryKey, role) {
  if (!ministryKey) return [];
  const isLeader = role === 'leader';
  const caps = [`module:${ministryKey}`, `tab:${ministryKey}:*`];
  const mod = MODULE_BY_KEY[ministryKey];
  const resources = mod ? mod.resources : CUSTOM_MINISTRY_SUFFIXES.map((s) => `custom_${ministryKey}_${s}`);
  const ops = isLeader ? ['read', 'create', 'update', 'delete'] : ['read', 'create', 'update'];
  for (const r of resources) for (const op of ops) caps.push(`res:${r}:${op}`);
  // Akcje modułu (wyślij/eksport/…) tylko dla lidera służby.
  if (isLeader && mod) for (const a of mod.actions || []) caps.push(`action:${ministryKey}:${a.key}`);
  // Lider układa grafik swojej służby (wydarzenia i tablice — moduleScope.js) i wysyła z niego
  // zaproszenia: fn send-assignment-invites wymaga action:programs:send_assignment.
  if (isLeader) caps.push(LEADER_SCHEDULE_ACTION);
  return caps;
}

// Z listy przynależności osoby → płaskie granty { capability, allowed:true } (bez duplikatów)
// do dołożenia w resolverze. memberships: [{ ministry_key, role }].
export function ministryGrants(memberships = []) {
  const seen = new Set();
  const grants = [];
  for (const m of memberships || []) {
    if (!m || !m.ministry_key) continue;
    const role = m.role === 'leader' ? 'leader' : 'member';
    for (const cap of membershipCapabilities(m.ministry_key, role)) {
      if (seen.has(cap)) continue;
      seen.add(cap);
      grants.push({ capability: cap, allowed: true });
    }
  }
  return grants;
}
