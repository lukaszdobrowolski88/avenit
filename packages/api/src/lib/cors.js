// CORS (audyt 2026-10, runda 4): wcześniej `origin: true` + credentials — dowolna strona w
// przeglądarce zalogowanej osoby mogła czytać odpowiedzi /api/* z jej ciasteczkami. Teraz tylko
// domena platformy i jej subdomeny (kościoły, app., admin.), lokalnie także localhost.
// Klienci natywni (aplikacja mobilna) nie wysyłają Origin — przechodzą jak dotąd.
export function corsOriginAllowed(origin, { appDomain, isProd }) {
  if (!origin) return true;
  let url;
  try { url = new URL(origin); } catch { return false; }
  const host = url.hostname.toLowerCase();
  const domain = String(appDomain || '').toLowerCase();
  if (!isProd && (host === 'localhost' || host === '127.0.0.1')) return true;
  if (isProd && url.protocol !== 'https:') return false;
  return !!domain && (host === domain || host.endsWith(`.${domain}`));
}
