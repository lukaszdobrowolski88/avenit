import type { Router } from 'expo-router';
import { parseTaskLink } from '@avenit/shared/src/lib/taskLinks.js';
import { goToTab } from './navigation';
import { MODULE_REGISTRY, type ModuleEntry } from '../features/modules/registry';
import { openModule, openOnWeb } from '../features/modules/useModules';

// Ekran zadania (element tablicy) — wspólny cel linków z powiadomień, pulpitu i list zadań.
export const openTask = (router: Router, itemId: string | number, boardId?: string | number | null) => {
  const params: { id: string; boardId?: string } = { id: String(itemId) };
  if (boardId != null && String(boardId)) params.boardId = String(boardId);
  router.push({ pathname: '/(app)/tasks/[id]', params } as never);
};

// Zadanie wskazane w linku weba: <ścieżka modułu>?item=…, /wydarzenia?item=…,
// /projekty?board=…&item=… (shared/lib/taskLinks.js). Każdy link z ?item= to zadanie —
// także moduł z kreatora o własnej ścieżce, której parseTaskLink nie zna.
export const taskFromLink = (link: string | null | undefined): { itemId: string; boardId: string | null } | null => {
  if (!link || !/[?&]item=/.test(link)) return null;
  const parsed = parseTaskLink(link);
  if (parsed?.itemId) return { itemId: String(parsed.itemId), boardId: parsed.boardId ? String(parsed.boardId) : null };
  const m = /[?&]item=([^&#]+)/.exec(link);
  if (!m) return null;
  let itemId = m[1];
  try {
    itemId = decodeURIComponent(itemId);
  } catch {
    /* zostaje surowe */
  }
  const b = /[?&]board=([^&#]+)/.exec(link);
  let boardId = b ? b[1] : null;
  try {
    if (boardId) boardId = decodeURIComponent(boardId);
  } catch {
    /* zostaje surowe */
  }
  return itemId ? { itemId, boardId } : null;
};

// Dane powiadomienia (push albo wiersz `notifications`) → zadanie. Powiadomienia o zadaniach
// ('task') i wzmianki w komentarzach zadań ('mention' bez conversation_id) niosą item_id/board_id.
// Wzmianka z czatu (conversation_id) to NIE zadanie.
export const taskFromNotificationData = (
  data: Record<string, unknown> | null | undefined,
  link?: string | null,
): { itemId: string; boardId: string | null } | null => {
  if (data?.conversation_id) return null;
  const itemId = data?.item_id;
  if (itemId != null && String(itemId)) {
    const boardId = data?.board_id != null && String(data.board_id) ? String(data.board_id) : null;
    return { itemId: String(itemId), boardId };
  }
  return taskFromLink(link ?? (typeof data?.link === 'string' ? data.link : null));
};

// Mapowanie URL/data.link na route w aplikacji.
// Akceptuje:
//   - "avenit://program/123"
//   - "avenit://message/<conversationId>"
//   - "/program/123"  (bez schematu)
//   - "/(app)/programs/123"  (już route-mode)
export const navigateFromDeepLink = (router: Router, link: string | null | undefined) => {
  if (!link) return;
  let path = link;
  // Strip schemat avenit:// (i toleruj dawne linki schtomy:// oraz church://, jeśli ktoś by je miał).
  path = path.replace(/^avenit:\/\//, '/').replace(/^schtomy:\/\//, '/').replace(/^church:\/\//, '/');
  // Zadanie (link z ?item=) — ekran zadania, a nie sama strona modułu (zapytanie ginęło).
  const task = taskFromLink(path);
  if (task) {
    openTask(router, task.itemId, task.boardId);
    return;
  }
  const programMatch = path.match(/^\/?(?:\(app\)\/)?programs?\/(\d+)/);
  if (programMatch) {
    router.push({
      pathname: '/(app)/programs/[id]',
      params: { id: programMatch[1] },
    });
    return;
  }
  // Wydarzenie: web /wydarzenie/<id>, aplikacja /events/<id>.
  const eventMatch = path.match(/^\/?(?:\(app\)\/)?(?:events?|wydarzenie)\/(\d+)/);
  if (eventMatch) {
    router.push({
      pathname: '/(app)/events/[id]',
      params: { id: eventMatch[1] },
    });
    return;
  }
  const messageMatch = path.match(/^\/?(?:\(app\)\/)?(?:messenger|messages?)\/([^/?#]+)/);
  if (messageMatch) {
    router.push({
      pathname: '/(app)/messenger/[conversationId]',
      params: { conversationId: messageMatch[1] },
    });
    return;
  }
  // Web format: /komunikator?conversation=<uuid>
  const komunikatorMatch = path.match(/^\/?komunikator\?.*conversation=([^&]+)/);
  if (komunikatorMatch) {
    router.push({
      pathname: '/(app)/messenger/[conversationId]',
      params: { conversationId: komunikatorMatch[1] },
    });
    return;
  }
  const songMatch = path.match(/^\/?(?:\(app\)\/)?songs?\/(\d+)/);
  if (songMatch) {
    router.push({
      pathname: '/(app)/songs/[id]',
      params: { id: songMatch[1] },
    });
    return;
  }
  // RSVP — powiadomienia o zaproszeniach prowadzą do ekranu „Moje zaproszenia".
  // Akceptuje /rsvp, /(app)/rsvp, avenit://rsvp (po stripie schematu), /rsvp?token=...
  const rsvpMatch = path.match(/^\/?(?:\(app\)\/)?rsvp\b/);
  if (rsvpMatch) {
    router.push('/(app)/rsvp');
    return;
  }
  // Ścieżka weba (link z powiadomienia/maila): moduł → ekran w apce, a gdy apka go nie ma —
  // ta sama strona w przeglądarce (zalogowana). Jak zakładka „Moduły”.
  const clean = `/${path.replace(/^\/+/, '')}`;
  const bare = clean.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (bare === '/' || /^\/(\(app\)\/)?(\(tabs\)\/)?dashboard$/.test(bare)) {
    goToTab(router, 'dashboard');
    return;
  }
  const alias = WEB_ALIASES[bare];
  if (alias) {
    alias(router);
    return;
  }
  const custom = bare.match(/^\/module\/([^/]+)/);
  if (custom) {
    router.push({ pathname: '/(app)/custom/[key]', params: { key: decodeURIComponent(custom[1]) } });
    return;
  }
  // Zakładka z linku (?tab=…) — panel zespołu/służby ją otwiera (np. powiadomienie o grafiku).
  const tab = queryParam(clean, 'tab');
  // Grupy domowe: /home-groups to lista grup; zakładki panelu służby (grafik, zadania…)
  // żyją w panelu zespołu „homegroups”.
  if (bare === '/home-groups' || bare.startsWith('/home-groups/')) {
    if (tab) router.push({ pathname: '/(app)/teams/[ministry]', params: { ministry: 'homegroups', tab } } as never);
    else router.push('/(app)/home-groups' as never);
    return;
  }
  const entry = moduleForWebPath(bare);
  if (entry) {
    const team = entry.route?.match(/^\/\(app\)\/teams\/([^/?#]+)$/)?.[1];
    if (team && tab) router.push({ pathname: '/(app)/teams/[ministry]', params: { ministry: team, tab } } as never);
    else if (entry.route) openModule(entry, router);
    else void openOnWeb(clean);
    return;
  }
  // Ekran apki podany wprost (np. „/(app)/members”) — expo-router; nieznany pokaże „Nie znaleziono”.
  if (bare.startsWith('/(app)/')) {
    router.push(bare as never);
    return;
  }
  // Nie umiemy rozpoznać — Start (zakładka, bez dokładania jej na stos).
  goToTab(router, 'dashboard');
};

// Ścieżki weba bez osobnego modułu w menu → miejsce w apce.
const WEB_ALIASES: Record<string, (router: Router) => void> = {
  '/profile': (r) => goToTab(r, 'account'),
  '/care': (r) => r.push('/(app)/members' as never),
  '/sermons': (r) => r.push('/(app)/sermons' as never),
  '/wydarzenia': (r) => goToTab(r, 'calendar'),
  '/calendar': (r) => goToTab(r, 'calendar'),
  '/komunikator': (r) => goToTab(r, 'messenger'),
};

// Wartość parametru zapytania z linku (bez URL — działa też dla „/media?tab=x#…”).
const queryParam = (link: string, name: string): string | null => {
  const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(link);
  if (!m || !m[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
};

// Moduł, którego ścieżka weba jest najdłuższym prefiksem (z granicą segmentu).
const moduleForWebPath = (bare: string): ModuleEntry | null => {
  let best: { entry: ModuleEntry; len: number } | null = null;
  for (const entry of Object.values(MODULE_REGISTRY)) {
    const base = entry.webPath.split('?')[0].replace(/\/+$/, '');
    if (!base || base === '/') continue;
    const hit = bare === base || bare.startsWith(`${base}/`);
    if (hit && (!best || base.length > best.len)) best = { entry, len: base.length };
  }
  return best?.entry ?? null;
};
