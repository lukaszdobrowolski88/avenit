import { useEffect, useState } from 'react';
import { invokeCloud, onCloudConnected } from '../../lib/cloudFiles';
import { providerChoices } from './cloudFilesLogic';

// Czy pokazywać „Z Dysku Google / OneDrive” (kościół nie wyłączył i integracja jest skonfigurowana).
// Stan pobierany raz na kilka minut dla całej karty (wiele pól wiadomości / zakładek naraz).
const TTL = 5 * 60 * 1000;
let cache = null; // { at, promise }

export function loadCloudStatus(force = false) {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.promise;
  const promise = invokeCloud({ action: 'status' }).then((d) => d?.providers || {}).catch(() => ({}));
  cache = { at: Date.now(), promise };
  return promise;
}
export const resetCloudStatusCache = () => { cache = null; };

export const cloudPickVisible = (status) => providerChoices(status).some((c) => c.state !== 'unavailable');

export default function useCloudFiles() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    loadCloudStatus().then((s) => { if (alive) setStatus(s); });
    const off = onCloudConnected(() => loadCloudStatus(true).then((s) => { if (alive) setStatus(s); }));
    return () => { alive = false; off(); };
  }, []);
  return { status, visible: !!status && cloudPickVisible(status) };
}
