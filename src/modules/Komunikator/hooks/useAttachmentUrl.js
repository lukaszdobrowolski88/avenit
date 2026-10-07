import { useEffect, useState } from 'react';
import { peekAttachmentUrl, resolveAttachmentUrl } from '../utils/attachmentUrl';

// Adres do wyświetlenia załącznika (K1): od razu z pamięci, a gdy trzeba — po podpisaniu.
// null = jeszcze czekamy na podpis (pokaż miejsce zastępcze, nie „zepsuty” obrazek).
export default function useAttachmentUrl(url) {
  const [state, setState] = useState(() => ({ url, resolved: peekAttachmentUrl(url) }));
  const current = state.url === url ? state.resolved : peekAttachmentUrl(url);

  useEffect(() => {
    let alive = true;
    const ready = peekAttachmentUrl(url);
    if (ready || !url) {
      setState((s) => (s.url === url && s.resolved === ready ? s : { url, resolved: ready }));
      return undefined;
    }
    setState((s) => (s.url === url ? s : { url, resolved: null }));
    resolveAttachmentUrl(url).then((resolved) => { if (alive) setState({ url, resolved }); });
    return () => { alive = false; };
  }, [url]);

  return current;
}
