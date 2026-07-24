import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
