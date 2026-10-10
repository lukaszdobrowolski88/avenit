import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLivekit, roomOptions, mediaFailure } from './livekit';
import { participantAvatar } from './callLogic';

// Pokój LiveKit jednej rozmowy: połączenie, zdarzenia → migawka do renderu, akcje (mikrofon,
// kamera, ekran, urządzenia). Dźwięk zdalnych osób odtwarzamy w ukrytych <audio> poza drzewem
// Reacta — gra niezależnie od tego, czy okno rozmowy jest pełne, zminimalizowane czy na innej trasie.
export const EMPTY_SNAPSHOT = Object.freeze({
  connectionState: 'disconnected',
  participants: [],
  speakerIds: [],
  remoteCount: 0,
  local: { micOn: false, camOn: false, screenOn: false },
  canPlaybackAudio: true,
  canPublish: true, // false — kanał „piszą tylko administratorzy”: zwykły uczestnik tylko słucha
  mediaError: null, // { source: 'microphone'|'camera'|'screen', failure }
});

const raf = typeof requestAnimationFrame === 'function'
  ? (fn) => requestAnimationFrame(fn)
  : (fn) => setTimeout(fn, 16);

function participantView(lk, p, isLocal) {
  const S = lk.Track?.Source || {};
  const cam = p.getTrackPublication?.(S.Camera || 'camera');
  const scr = p.getTrackPublication?.(S.ScreenShare || 'screen_share');
  const cameraTrack = cam && !cam.isMuted && cam.track ? cam.track : null;
  const screenTrack = scr && !scr.isMuted && scr.track ? scr.track : null;
  return {
    id: p.identity,
    isLocal,
    name: p.name || p.identity || '',
    avatarUrl: participantAvatar(p.metadata),
    isSpeaking: !!p.isSpeaking,
    micOn: !!p.isMicrophoneEnabled,
    camOn: !!cameraTrack,
    screenOn: !!screenTrack,
    quality: p.connectionQuality || 'unknown',
    cameraTrack,
    screenTrack,
    joinedAt: p.joinedAt ? new Date(p.joinedAt).getTime() : 0,
  };
}

export function buildSnapshot(lk, room, extra = {}) {
  if (!room) return { ...EMPTY_SNAPSHOT, ...extra };
  const lp = room.localParticipant;
  const remotes = Array.from(room.remoteParticipants?.values?.() || [])
    .map((p) => participantView(lk, p, false))
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const participants = lp ? [participantView(lk, lp, true), ...remotes] : remotes;
  return {
    ...EMPTY_SNAPSHOT,
    connectionState: room.state || 'connected',
    participants,
    speakerIds: (room.activeSpeakers || []).map((p) => p.identity),
    remoteCount: remotes.length,
    local: {
      micOn: !!lp?.isMicrophoneEnabled,
      camOn: !!lp?.isCameraEnabled,
      screenOn: !!lp?.isScreenShareEnabled,
    },
    canPlaybackAudio: room.canPlaybackAudio !== false,
    ...extra,
  };
}

export default function useCallRoom({ onRemoteJoined, onRemoteLeft, onDisconnected } = {}) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const roomRef = useRef(null);
  const lkRef = useRef(null);
  const audioBoxRef = useRef(null);
  const leavingRef = useRef(false);
  const pendingRef = useRef(false);
  const mediaErrorRef = useRef(null);
  const canPublishRef = useRef(true);
  const cbRef = useRef({ onRemoteJoined, onRemoteLeft, onDisconnected });
  cbRef.current = { onRemoteJoined, onRemoteLeft, onDisconnected };

  const refresh = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    raf(() => {
      pendingRef.current = false;
      const room = roomRef.current;
      setSnapshot(room ? buildSnapshot(lkRef.current, room, { mediaError: mediaErrorRef.current, canPublish: canPublishRef.current }) : EMPTY_SNAPSHOT);
    });
  }, []);

  const setMediaError = useCallback((value) => {
    mediaErrorRef.current = value;
    refresh();
  }, [refresh]);

  const audioBox = () => {
    if (audioBoxRef.current) return audioBoxRef.current;
    if (typeof document === 'undefined') return null;
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.display = 'none';
    box.dataset.callAudio = '';
    document.body.appendChild(box);
    audioBoxRef.current = box;
    return box;
  };

  const attachAudio = (track) => {
    if (!track || track.kind !== 'audio' || typeof track.attach !== 'function') return;
    try {
      const el = track.attach();
      if (el && !el.isConnected) audioBox()?.appendChild(el);
    } catch { /* ignore */ }
  };
  const detachAudio = (track) => {
    if (!track || track.kind !== 'audio' || typeof track.detach !== 'function') return;
    try { (track.detach() || []).forEach((el) => el.remove?.()); } catch { /* ignore */ }
  };

  const cleanup = useCallback(() => {
    const box = audioBoxRef.current;
    audioBoxRef.current = null;
    if (box) { try { box.remove(); } catch { /* ignore */ } }
    mediaErrorRef.current = null;
    setSnapshot(EMPTY_SNAPSHOT);
  }, []);

  // Połącz z pokojem i włącz mikrofon (+ kamerę dla wideo). Błąd urządzenia nie przerywa
  // rozmowy — można słuchać i włączyć mikrofon po nadaniu uprawnień.
  // audio: false — wejście z wyciszonym mikrofonem (strona gościa: wybór w podglądzie).
  const connect = useCallback(async ({ url, token, video = false, audio = true, canPublish = true }) => {
    const lk = await loadLivekit();
    lkRef.current = lk;
    const room = new lk.Room(roomOptions(lk));
    roomRef.current = room;
    leavingRef.current = false;
    mediaErrorRef.current = null;
    canPublishRef.current = canPublish !== false;
    const E = lk.RoomEvent;
    const on = (ev, fn) => { if (ev) room.on(ev, fn); };

    on(E.ParticipantConnected, (p) => { cbRef.current.onRemoteJoined?.(p); refresh(); });
    on(E.ParticipantDisconnected, (p) => { cbRef.current.onRemoteLeft?.(p); refresh(); });
    on(E.TrackSubscribed, (track) => { attachAudio(track); refresh(); });
    on(E.TrackUnsubscribed, (track) => { detachAudio(track); refresh(); });
    [E.TrackMuted, E.TrackUnmuted, E.LocalTrackPublished, E.LocalTrackUnpublished, E.ActiveSpeakersChanged,
      E.ConnectionQualityChanged, E.ConnectionStateChanged, E.Reconnecting, E.Reconnected, E.SignalReconnecting,
      E.AudioPlaybackStatusChanged, E.ParticipantNameChanged, E.ParticipantMetadataChanged, E.TrackPublished,
      E.TrackUnpublished].forEach((ev) => on(ev, refresh));
    on(E.MediaDevicesError, (err) => setMediaError({ source: 'microphone', failure: mediaFailure(lk, err) }));
    on(E.Disconnected, (reason) => {
      const mine = leavingRef.current;
      if (roomRef.current === room) roomRef.current = null;
      cleanup();
      if (!mine) cbRef.current.onDisconnected?.(reason);
    });

    try { room.prepareConnection?.(url, token); } catch { /* ignore */ }
    await room.connect(url, token, { autoSubscribe: true });
    if (roomRef.current !== room) return room; // rozłączono w trakcie łączenia

    if (canPublishRef.current && audio !== false) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        mediaErrorRef.current = { source: 'microphone', failure: mediaFailure(lk, err) };
      }
    }
    if (video && canPublishRef.current) {
      try {
        await room.localParticipant.setCameraEnabled(true);
      } catch (err) {
        mediaErrorRef.current = mediaErrorRef.current || { source: 'camera', failure: mediaFailure(lk, err) };
      }
    }
    // Już obecne osoby (dołączenie do trwającej rozmowy) — ich dźwięk.
    room.remoteParticipants?.forEach?.((p) => {
      p.audioTrackPublications?.forEach?.((pub) => { if (pub.track) attachAudio(pub.track); });
    });
    refresh();
    return room;
  }, [refresh, cleanup, setMediaError]);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    leavingRef.current = true;
    if (room) {
      try { await room.disconnect(true); } catch { /* ignore */ }
    }
    cleanup();
  }, [cleanup]);

  const withRoom = (fn) => async (...args) => {
    const room = roomRef.current;
    if (!room) return;
    await fn(room, ...args);
    refresh();
  };

  const toggleMic = useCallback(withRoom(async (room) => {
    const next = !room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      if (next && mediaErrorRef.current?.source === 'microphone') mediaErrorRef.current = null;
    } catch (err) {
      mediaErrorRef.current = { source: 'microphone', failure: mediaFailure(lkRef.current, err) };
    }
  }), [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCamera = useCallback(withRoom(async (room) => {
    const next = !room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(next);
      if (next && mediaErrorRef.current?.source === 'camera') mediaErrorRef.current = null;
    } catch (err) {
      mediaErrorRef.current = { source: 'camera', failure: mediaFailure(lkRef.current, err) };
    }
  }), [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleScreenShare = useCallback(withRoom(async (room) => {
    const next = !room.localParticipant.isScreenShareEnabled;
    try {
      await room.localParticipant.setScreenShareEnabled(next, { audio: true, selfBrowserSurface: 'exclude' });
    } catch (err) {
      // Anulowanie okna wyboru ekranu to nie błąd.
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        mediaErrorRef.current = { source: 'screen', failure: mediaFailure(lkRef.current, err) };
      }
    }
  }), [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearMediaError = useCallback(() => setMediaError(null), [setMediaError]);

  // Ponów dostęp do urządzeń (po nadaniu uprawnień w przeglądarce).
  const retryMedia = useCallback(withRoom(async (room) => {
    const src = mediaErrorRef.current?.source;
    mediaErrorRef.current = null;
    try {
      if (src === 'camera') await room.localParticipant.setCameraEnabled(true);
      else await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      mediaErrorRef.current = { source: src || 'microphone', failure: mediaFailure(lkRef.current, err) };
    }
  }), [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const listDevices = useCallback(async (kind) => {
    const lk = lkRef.current || await loadLivekit();
    try { return await lk.Room.getLocalDevices(kind, false); } catch { return []; }
  }, []);

  const activeDevice = useCallback((kind) => roomRef.current?.getActiveDevice?.(kind) || '', []);

  const switchDevice = useCallback(withRoom(async (room, kind, deviceId) => {
    await room.switchActiveDevice(kind, deviceId);
  }), [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const startAudio = useCallback(withRoom(async (room) => {
    try { await room.startAudio(); } catch { /* ignore */ }
  }), [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Odmontowanie (wylogowanie) — rozłącz i zwolnij urządzenia.
  useEffect(() => () => {
    const room = roomRef.current;
    roomRef.current = null;
    leavingRef.current = true;
    if (room) { try { room.disconnect(true); } catch { /* ignore */ } }
    const box = audioBoxRef.current;
    if (box) { try { box.remove(); } catch { /* ignore */ } }
  }, []);

  return {
    snapshot,
    connect,
    disconnect,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    retryMedia,
    clearMediaError,
    listDevices,
    activeDevice,
    switchDevice,
    startAudio,
    hasRoom: () => !!roomRef.current,
  };
}
