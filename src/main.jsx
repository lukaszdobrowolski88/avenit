import React from 'react'
import ReactDOM from 'react-dom/client'
import { preloadI18n } from './i18n'
import './index.css'
import './styles/brand-avenit.css'; // warstwa motywu „Avenit” (tylko przy palecie avenit)

// PWA: reliably apply new deploys.
// The auto-generated registerSW.js only registers the worker. The service worker
// has skipWaiting + clientsClaim, so an updated SW takes control immediately — but
// the already-loaded page keeps serving the stale precached shell until a reload.
// Reload exactly once when an UPDATED SW takes control (guard against the initial
// install on a fresh visit), and poll for updates so long-open SPA tabs refresh too.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.update().catch(() => {})
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)
    })
    .catch(() => {})
}

// Okno łączenia plików z chmury (Faza 3 integracji): po zgodzie callback wraca na
// /profile?files=…&files_result=… — wynik trafia do karty, która otworzyła okno (BroadcastChannel),
// a okno próbuje się zamknąć. Gdy się nie da, ładuje się aplikacja (Mój profil pokaże komunikat).
if (new URLSearchParams(window.location.search).get('files_result')) {
  import('./lib/cloudConnectRelay.js').then(({ relayCloudConnectResult }) => {
    // Przeglądarka zamknie tylko okno otwarte skryptem — zwykłą kartę zostawi (wtedy toast w Mój profil).
    if (relayCloudConnectResult()) { try { window.close() } catch { /* */ } }
  }).catch(() => {})
}

// Słowniki EN/UK ładują się leniwie (polski ich nie potrzebuje). Dla innego języka najpierw
// słownik, potem aplikacja — żeby etykiety liczone przy imporcie modułów były już przetłumaczone.
preloadI18n().then(() => import('./App.jsx')).then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
