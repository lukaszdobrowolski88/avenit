// livekit-client ładowany leniwie — dopiero przy pierwszym połączeniu (osobny chunk, nie
// obciąża startu aplikacji).
let lkPromise = null;
export function loadLivekit() {
  if (!lkPromise) lkPromise = import('livekit-client').catch((err) => { lkPromise = null; throw err; });
  return lkPromise;
}

// Opcje pokoju: adaptiveStream (jakość wg rozmiaru/widoczności kafelka; niewidoczne kafelki
// nie pobierają obrazu), dynacast (nadawca nie wysyła warstw, których nikt nie ogląda),
// simulcast 180p/360p/540p — rozsądnie dla ~30 osób na jednym serwerze.
export function roomOptions(lk) {
  const P = lk.VideoPresets || {};
  const S = lk.ScreenSharePresets || {};
  return {
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    videoCaptureDefaults: P.h540 ? { resolution: P.h540.resolution } : undefined,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [P.h180, P.h360].filter(Boolean),
      screenShareEncoding: S.h1080fps15?.encoding,
      dtx: true,
      red: true,
    },
  };
}

// Błąd urządzenia → 'PermissionDenied' | 'NotFound' | 'DeviceInUse' | 'Other'.
export function mediaFailure(lk, err) {
  try {
    const f = lk?.MediaDeviceFailure?.getFailure?.(err);
    if (f) return f;
  } catch { /* ignore */ }
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'PermissionDenied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'NotFound';
  if (name === 'NotReadableError') return 'DeviceInUse';
  return 'Other';
}

// Udostępnianie ekranu — tylko na komputerze (telefony nie mają getDisplayMedia).
export function canShareScreen() {
  if (typeof navigator === 'undefined') return false;
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== 'function') return false;
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;
  return !coarse;
}
