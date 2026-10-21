import { useEffect, useRef, useState } from 'react';

// Wspólne narzędzia stron tłumaczenia: blokada wygaszania ekranu, Media Session (ekran blokady /
// słuchawki), poziom sygnału mikrofonu, ukryte elementy <audio>.

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

// Ekran nie gaśnie, póki active (Wake Lock API; przeglądarka zwalnia blokadę po schowaniu karty —
// odzyskujemy ją po powrocie). Brak API — bez błędu. → czy blokada działa.
export function useWakeLock(active) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock?.request) { setHeld(false); return undefined; }
    let lock = null;
    let alive = true;
    const acquire = async () => {
      if (!alive || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (!alive) { lock.release().catch(() => {}); return; }
        setHeld(true);
        lock.addEventListener?.('release', () => { if (alive) setHeld(false); });
      } catch {
        setHeld(false);
      }
    };
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      if (lock) lock.release().catch(() => {});
      setHeld(false);
    };
  }, [active]);
  return held;
}

// Metadane i przyciski odtwarzania na ekranie blokady / w słuchawkach (Media Session API).
export function useMediaSession({ active, title, artist, album, onPlay, onPause }) {
  const cb = useRef({ onPlay, onPause });
  cb.current = { onPlay, onPause };
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
    if (!ms || !active) return undefined;
    try {
      if (typeof window.MediaMetadata === 'function') {
        ms.metadata = new window.MediaMetadata({ title: title || '', artist: artist || '', album: album || '', artwork: [{ src: '/brand/avenit-znak-kurkuma.png', sizes: '512x512', type: 'image/png' }] });
      }
      ms.playbackState = 'playing';
      ms.setActionHandler?.('play', () => cb.current.onPlay?.());
      ms.setActionHandler?.('pause', () => cb.current.onPause?.());
      ms.setActionHandler?.('stop', () => cb.current.onPause?.());
    } catch { /* starsze przeglądarki */ }
    return () => {
      try {
        ms.playbackState = 'none';
        ['play', 'pause', 'stop'].forEach((a) => ms.setActionHandler?.(a, null));
        ms.metadata = null;
      } catch { /* ignore */ }
    };
  }, [active, title, artist, album]);
}

// Poziom sygnału (0–1) ścieżki mikrofonu — do paska „poziom wejścia”. Odświeżanie ~15 razy/s.
export function useLevelMeter(mediaStreamTrack) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!mediaStreamTrack || typeof window === 'undefined') { setLevel(0); return undefined; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return undefined;
    let ctx;
    let raf = 0;
    let last = 0;
    try {
      ctx = new AC();
      const src = ctx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = (t) => {
        raf = requestAnimationFrame(tick);
        if (t - last < 66) return;
        last = t;
        an.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        // Skala zbliżona do dB: cisza ~0, mowa 0,4–0,8, przester ~1.
        const db = 20 * Math.log10(Math.max(peak, 1e-5));
        setLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
      };
      ctx.resume?.().catch(() => {});
      raf = requestAnimationFrame(tick);
    } catch {
      return undefined;
    }
    return () => {
      cancelAnimationFrame(raf);
      try { ctx?.close(); } catch { /* ignore */ }
    };
  }, [mediaStreamTrack]);
  return level;
}

// Ukryty pojemnik na elementy <audio> zdalnych ścieżek (poza drzewem Reacta).
export function createAudioBox() {
  if (typeof document === 'undefined') return null;
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.display = 'none';
  box.dataset.interpAudio = '';
  document.body.appendChild(box);
  return box;
}

export function attachTrack(box, track, volume = 1) {
  if (!track || track.kind !== 'audio' || typeof track.attach !== 'function') return;
  try {
    const el = track.attach();
    if (el && !el.isConnected) box?.appendChild(el);
    track.setVolume?.(volume);
  } catch { /* ignore */ }
}

export function detachTrack(track) {
  if (!track || typeof track.detach !== 'function') return;
  try { (track.detach() || []).forEach((el) => el.remove?.()); } catch { /* ignore */ }
}

// Lista wejść audio (etykiety dopiero po zgodzie na mikrofon).
export async function audioInputs() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput' && d.deviceId);
  } catch {
    return [];
  }
}
