// Okno łączenia plików z chmury (Faza 3 integracji) — bez zależności, ładowane przez main.jsx
// przed aplikacją. Callback OAuth wraca na /profile?files=…&files_result=…; wynik trafia do karty,
// która otworzyła okno (BroadcastChannel + zdarzenie storage; window.opener bywa zerwany przez
// Cross-Origin-Opener-Policy stron logowania Google / Microsoft).
export const CLOUD_CHANNEL = 'avenit-cloud-files';

// Strona powrotu w oknie łączenia (main.jsx, przed załadowaniem aplikacji): wynik → karta, która
// otworzyła okno, i próba zamknięcia okna. true = to było okno łączenia.
export function relayCloudConnectResult(loc = window.location) {
  let p;
  try { p = new URLSearchParams(loc.search); } catch { return false; }
  const provider = p.get('files');
  const result = p.get('files_result');
  if (!provider || !result) return false;
  const msg = { type: CLOUD_CHANNEL, provider, result, reason: p.get('files_reason') || null, at: Date.now() };
  try { const ch = new BroadcastChannel(CLOUD_CHANNEL); ch.postMessage(msg); ch.close(); } catch { /* */ }
  try { localStorage.setItem(CLOUD_CHANNEL, JSON.stringify(msg)); localStorage.removeItem(CLOUD_CHANNEL); } catch { /* */ }
  try { window.opener?.postMessage(msg, loc.origin); } catch { /* */ }
  return true;
}

