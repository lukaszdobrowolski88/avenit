import type { Router } from 'expo-router';

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
  // Fallback — nie umiemy sparsować, idź do dashboardu.
  router.push('/(app)/dashboard');
};
