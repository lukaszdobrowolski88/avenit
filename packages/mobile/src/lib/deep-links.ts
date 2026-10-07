import type { Router } from 'expo-router';
import { goToTab } from './navigation';
import { MODULE_REGISTRY, type ModuleEntry } from '../features/modules/registry';
import { openModule, openOnWeb } from '../features/modules/useModules';

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
  const entry = moduleForWebPath(bare);
  if (entry) {
    if (entry.route) openModule(entry, router);
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
