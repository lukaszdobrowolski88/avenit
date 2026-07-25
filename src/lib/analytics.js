// Tracker analityki first-party aplikacji kościoła (subdomena tenanta).
// Zdarzenia idą na własny /api/track (same-origin przez Caddy; w dev VITE_API_URL
// + X-Tenant jak w supabase.js). UUID odwiedzającego trzymamy w localStorage —
// tożsamość użytkownika i tak weryfikuje SERWER po cookie avenit_at, klient
// niczego nie deklaruje. Tracker nigdy nie może zepsuć aplikacji: wszystko
// w try/catch, błędy sieci ignorowane.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const apiUrl = import.meta.env.VITE_API_URL || '';
const tenant = import.meta.env.VITE_TENANT || null;
const TRACK_URL = `${apiUrl}/api/track`;

const dnt = typeof navigator !== 'undefined' && navigator.doNotTrack === '1';

function visitorId() {
  try {
    let id = localStorage.getItem('avenit_vid');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('avenit_vid', id);
    }
    return id;
  } catch {
    return null; // tryb prywatny bez localStorage → serwer użyje dziennego hasha
  }
}

let queue = [];
let flushTimer = null;

function buildPayload(events) {
  return JSON.stringify({
    v: 1,
    site: 'app',
    vid: visitorId(),
    scr: `${window.screen.width}x${window.screen.height}`,
    lang: (navigator.language || '').slice(0, 16),
    events,
  });
}

function send(body, useBeacon) {
  try {
    // sendBeacon tylko w prod (same-origin): dołącza cookies, omija service worker.
    // W dev (inny origin) potrzebny nagłówek X-Tenant → fetch.
    if (useBeacon && !apiUrl && navigator.sendBeacon) {
      if (navigator.sendBeacon(TRACK_URL, new Blob([body], { type: 'application/json' }))) return;
    }
    const headers = { 'content-type': 'application/json' };
    if (tenant) headers['X-Tenant'] = tenant;
    fetch(TRACK_URL, { method: 'POST', headers, body, keepalive: true, credentials: 'include' })
      .catch(() => {});
  } catch { /* analityka nigdy nie blokuje UX-u */ }
}

export function flush(useBeacon = false) {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!queue.length) return;
  send(buildPayload(queue.splice(0, 20)), useBeacon);
}

export function track(name, extra = {}) {
  if (dnt) return;
  try {
    queue.push({ n: name, path: window.location.pathname, ...extra });
    if (queue.length >= 20) flush();
    else if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 10_000);
  } catch { /* jw. */ }
}

// Po zalogowaniu: event 'identify' (raz na załadowanie strony) — serwer wiąże
// odwiedzającego z userem/kościołem; props.name to tylko podpowiedź wyświetlana
// w panelu (przyjmowana wyłącznie dla zweryfikowanych sesji).
let identified = false;
export function identify(user) {
  if (dnt || !user || identified) return;
  identified = true;
  const name = user.user_metadata?.full_name || user.user_metadata?.name || null;
  track('identify', name ? { props: { name } } : {});
  flush();
}

export function trackLogin() {
  track('login');
  flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}

// Odsłony przy zmianie trasy + otwarcia modułów (pierwszy segment ścieżki).
let lastModule = null;
export function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    track('pageview', { title: (document.title || '').slice(0, 256) });
    const seg = location.pathname.split('/')[1] || 'dashboard';
    if (seg !== lastModule) {
      lastModule = seg;
      track('module_open', { props: { module: seg } });
    }
  }, [location.pathname]);
  return null;
}
