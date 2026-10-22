// Pliki z Dysku Google i OneDrive / SharePoint (Faza 3 integracji) — wybór w przeglądarce, BEZ kopiowania.
//
//   • Google Picker (apis.google.com/js/api.js, ładowany dopiero przy pierwszym wyborze): token dostępu
//     osoby z zakresem drive.file + klucz API + numer projektu (appId — bez niego drive.file nie obejmie
//     wybranych plików) z fn cloud-files → picker_session.
//   • OneDrive / SharePoint File Picker v8: okno Microsoftu (<OneDrive osoby>/_layouts/15/FilePicker.aspx,
//     POST z tokenem), komunikacja przez MessageChannel; o kolejne tokeny („authenticate”) prosimy serwer
//     (fn cloud-files → token — tylko zasoby *.sharepoint.com / Graph). Refresh token nigdy nie trafia tu.
//   • Wybrane pliki → fn cloud-files → resolve: metadane pobrane przez serwer od dostawcy (nazwa, typ,
//     rozmiar, adres „Otwórz w …”) — dopiero te odnośniki zapisujemy w Avenit.
// Łączenie konta (pierwsze użycie) — w nowym oknie; wynik wraca kanałem BroadcastChannel z main.jsx
// (okno Google/Microsoft zrywa window.opener przez Cross-Origin-Opener-Policy).
import { supabase } from './supabase';
import { appLocale, tr } from '../i18n';
import { isSharePointHost } from '@avenit/shared/src/lib/cloudFiles.js';

import { CLOUD_CHANNEL } from './cloudConnectRelay';

export { CLOUD_CHANNEL, relayCloudConnectResult } from './cloudConnectRelay';
export const MAX_PICK = 10;

export async function invokeCloud(body) {
  const { data, error } = await supabase.functions.invoke('cloud-files', { body, silent: true });
  if (error) {
    const e = new Error(error.message || tr('Błąd plików z chmury'));
    e.code = error.context?.code || null;
    e.status = error.status || null;
    throw e;
  }
  return data;
}

const scripts = new Map();
export function loadScript(src) {
  if (scripts.has(src)) return scripts.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scripts.delete(src); reject(new Error(tr('Nie udało się wczytać okna wyboru plików.'))); };
    document.head.appendChild(s);
  });
  scripts.set(src, p);
  return p;
}

// Okno otwierane SYNCHRONICZNIE w obsłudze kliknięcia (blokery okien), adres podstawiany później.
export function openBlankWindow(name, { width = 1000, height = 700 } = {}) {
  const left = Math.max(0, Math.round((window.screen?.width || width) / 2 - width / 2));
  const top = Math.max(0, Math.round((window.screen?.height || height) / 2 - height / 2));
  const win = window.open('', name, `width=${width},height=${height},left=${left},top=${top}`);
  if (win) {
    try {
      win.document.title = 'Avenit';
      win.document.body.style.fontFamily = 'system-ui, sans-serif';
      win.document.body.style.color = '#6B6557';
      win.document.body.textContent = '…';
    } catch { /* inne źródło — bez znaczenia */ }
  }
  return win;
}

// Łączenie konta dla plików (zgoda OAuth) — w nowym oknie; bez okna (blokada) — w tej karcie.
export async function startCloudConnect(provider, win = null) {
  const target = win || openBlankWindow('avenit-cloud-connect', { width: 520, height: 700 });
  let data;
  try {
    data = await invokeCloud({ action: 'connect', provider });
  } catch (e) {
    try { target?.close(); } catch { /* */ }
    throw e;
  }
  if (target) { target.location.href = data.url; return { popup: true }; }
  window.location.assign(data.url);
  return { popup: false };
}

// Nasłuch wyniku łączenia z okna (cloudConnectRelay.js publikuje go kilkoma kanałami — każdy wynik
// raz). Zwraca funkcję wyrejestrowania.
export function onCloudConnected(cb) {
  const seen = new Set();
  const handle = (msg) => {
    if (!msg || msg.type !== CLOUD_CHANNEL) return;
    const key = `${msg.provider}|${msg.result}|${msg.at}`;
    if (seen.has(key)) return;
    seen.add(key);
    cb(msg);
  };
  let ch = null;
  try {
    ch = new BroadcastChannel(CLOUD_CHANNEL);
    ch.onmessage = (e) => handle(e?.data);
  } catch { ch = null; }
  const onStorage = (e) => {
    if (e.key !== CLOUD_CHANNEL || !e.newValue) return;
    try { handle(JSON.parse(e.newValue)); } catch { /* */ }
  };
  const onMessage = (e) => { if (e.origin === window.location.origin) handle(e.data); };
  window.addEventListener('storage', onStorage);
  window.addEventListener('message', onMessage);
  return () => {
    try { ch?.close(); } catch { /* */ }
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('message', onMessage);
  };
}

// ── Google Picker ─────────────────────────────────────────────────────────────────────────────
export async function pickFromGoogle(session) {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise((resolve, reject) => {
    if (!window.gapi?.load) { reject(new Error(tr('Nie udało się wczytać Google Picker.'))); return; }
    window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error(tr('Nie udało się wczytać Google Picker.'))), timeout: 15000, ontimeout: () => reject(new Error(tr('Google Picker nie odpowiada.'))) });
  });
  const g = window.google?.picker;
  if (!g) throw new Error(tr('Nie udało się wczytać Google Picker.'));
  const lang = String(appLocale() || 'pl-PL').slice(0, 2);
  return new Promise((resolve) => {
    const mine = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMode(g.DocsViewMode.LIST);
    const drives = new g.DocsView(g.ViewId.DOCS).setEnableDrives(true).setIncludeFolders(true).setSelectFolderEnabled(false);
    const picker = new g.PickerBuilder()
      .addView(mine)
      .addView(drives)
      .enableFeature(g.Feature.MULTISELECT_ENABLED)
      .enableFeature(g.Feature.SUPPORT_DRIVES)
      .setMaxItems(MAX_PICK)
      .setOAuthToken(session.access_token)
      .setDeveloperKey(session.api_key)
      .setAppId(session.app_id)
      .setLocale(lang)
      .setOrigin(window.location.origin)
      .setCallback((data) => {
        const action = data?.[g.Response.ACTION];
        if (action === g.Action.PICKED) {
          resolve((data[g.Response.DOCUMENTS] || []).map((d) => ({ file_id: d[g.Document.ID] })).filter((d) => d.file_id));
        } else if (action === g.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

// ── OneDrive / SharePoint File Picker v8 ──────────────────────────────────────────────────────
// https://learn.microsoft.com/onedrive/developer/controls/file-pickers/ — protokół: „initialize”
// (port MessageChannel) → „activate” → polecenia „authenticate” / „pick” / „close”.
export function msPickerUrl(baseUrl, channelId, locale = 'pl-pl') {
  const options = {
    sdk: '8.0',
    entry: { oneDrive: { files: {} } },
    authentication: {},
    messaging: { origin: window.location.origin, channelId },
    selection: { mode: 'multiple', maxCount: MAX_PICK },
    typesAndSources: { mode: 'files', pivots: { oneDrive: true, recent: true, sharedLibraries: true } },
  };
  const qs = new URLSearchParams({ filePicker: JSON.stringify(options), locale });
  return `${String(baseUrl).replace(/\/+$/, '')}/_layouts/15/FilePicker.aspx?${qs}`;
}

export function pickFromMicrosoft(session, win, { getToken = (resource) => invokeCloud({ action: 'token', provider: 'microsoft', resource }) } = {}) {
  if (!win) throw new Error(tr('Przeglądarka zablokowała okno wyboru plików — zezwól na wyskakujące okna dla tej strony.'));
  const channelId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const url = msPickerUrl(session.base_url, channelId, String(appLocale() || 'pl-PL').toLowerCase());
  // POST z tokenem dla OneDrive osoby (wymaganie Pickera v8 — token nie trafia do adresu).
  const doc = win.document;
  const form = doc.createElement('form');
  form.setAttribute('action', url);
  form.setAttribute('method', 'POST');
  const input = doc.createElement('input');
  input.setAttribute('type', 'hidden');
  input.setAttribute('name', 'access_token');
  input.setAttribute('value', session.access_token);
  form.appendChild(input);
  doc.body.appendChild(form);
  form.submit();

  return new Promise((resolve) => {
    let port = null;
    let done = false;
    const finish = (items) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onWindowMessage);
      clearInterval(timer);
      try { port?.close(); } catch { /* */ }
      try { win.close(); } catch { /* */ }
      resolve(items);
    };
    const reply = (id, data) => port?.postMessage({ type: 'result', id, data });
    const onPortMessage = async (e) => {
      const msg = e.data || {};
      if (msg.type !== 'command') return;
      port.postMessage({ type: 'acknowledge', id: msg.id });
      const cmd = msg.data || {};
      if (cmd.command === 'authenticate') {
        try {
          const t = await getToken(cmd.resource);
          reply(msg.id, { result: 'token', token: t.access_token });
        } catch (err) {
          reply(msg.id, { result: 'error', error: { code: 'unableToObtainToken', message: err.message } });
        }
      } else if (cmd.command === 'pick') {
        reply(msg.id, { result: 'success' });
        finish((cmd.items || []).map((it) => ({ file_id: it?.id, drive_id: it?.parentReference?.driveId })).filter((x) => x.file_id && x.drive_id));
      } else if (cmd.command === 'close') {
        finish([]);
      } else {
        reply(msg.id, { result: 'error', error: { code: 'unsupportedCommand', message: String(cmd.command || '') }, isExpected: true });
      }
    };
    function onWindowMessage(event) {
      if (event.source !== win) return;
      let host = '';
      try { host = new URL(event.origin).hostname; } catch { return; }
      if (!isSharePointHost(host)) return;
      const m = event.data;
      if (m?.type === 'initialize' && m.channelId === channelId && event.ports?.[0]) {
        port = event.ports[0];
        port.addEventListener('message', onPortMessage);
        port.start();
        port.postMessage({ type: 'activate' });
      }
    }
    window.addEventListener('message', onWindowMessage);
    const timer = setInterval(() => { if (win.closed) finish([]); }, 800);
  });
}

// Całość: okno (Microsoft) otwarte w obsłudze kliknięcia → sesja → wybór → metadane od serwera.
// Zwraca { attachments, failed } (puste przy anulowaniu).
export async function pickCloudFiles(provider, { win = null } = {}) {
  let session;
  try {
    session = await invokeCloud({ action: 'picker_session', provider });
  } catch (e) {
    try { win?.close(); } catch { /* */ }
    throw e;
  }
  const items = provider === 'google' ? await pickFromGoogle(session) : await pickFromMicrosoft(session, win);
  if (!items.length) return { attachments: [], failed: [] };
  return invokeCloud({ action: 'resolve', provider, items: items.slice(0, MAX_PICK) });
}

export const shareWithOrganization = (provider, fileIds) => invokeCloud({ action: 'share', provider, file_ids: fileIds });
