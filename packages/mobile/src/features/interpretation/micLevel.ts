import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import type { LocalAudioTrack } from 'livekit-client';
import { levelFromRms } from './consoleLogic';

// Poziom wejścia mikrofonu (0–1) do paska w konsoli tłumacza. Procesor głośności modułu LiveKit
// (createVolumeProcessor — ten sam, którego używa useTrackVolume z @livekit/react-native, już
// w buildzie 1.1.0) wysyła RMS ścieżki co ~40 ms. Własny hook zamiast useTrackVolume: tamten nie
// zeruje paska, gdy przychodzi cisza (zdarzenia z volume 0 pomija), więc po wyciszeniu pasek stał.
// Brak modułu / błąd — pasek po prostu stoi na zerze.
type LkModule = {
  createVolumeProcessor?: (pcId: number, trackId: string) => string;
  deleteVolumeProcessor?: (tag: string, pcId: number, trackId: string) => unknown;
};

const STALE_MS = 500;
const UI_MS = 120;

export function useMicLevel(track: LocalAudioTrack | null, enabled: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const mst = track?.mediaStreamTrack as unknown as { id?: string; _peerConnectionId?: number } | undefined;
    const mod = (NativeModules as Record<string, unknown>).LivekitReactNativeModule as LkModule | undefined;
    if (!enabled || !mst?.id || !mod?.createVolumeProcessor) {
      setLevel(0);
      return undefined;
    }
    const pcId = typeof mst._peerConnectionId === 'number' ? mst._peerConnectionId : -1;
    const trackId = mst.id;
    let tag: string | null = null;
    let last = 0;
    let at = 0;
    let sub: { remove(): void } | null = null;
    try {
      const emitter = new NativeEventEmitter(mod as never);
      sub = emitter.addListener('LK_VOLUME_PROCESSED', (e: { id?: string; volume?: number }) => {
        if (tag && e?.id === tag) {
          last = Number(e.volume) || 0;
          at = Date.now();
        }
      });
      tag = mod.createVolumeProcessor(pcId, trackId);
    } catch {
      tag = null;
    }
    const iv = setInterval(() => {
      const v = Date.now() - at > STALE_MS ? 0 : levelFromRms(last);
      setLevel((cur) => (Math.abs(cur - v) < 0.01 ? cur : v));
    }, UI_MS);
    return () => {
      clearInterval(iv);
      sub?.remove();
      if (tag) {
        try {
          mod.deleteVolumeProcessor?.(tag, pcId, trackId);
        } catch {
          /* ścieżka już zatrzymana */
        }
      }
    };
  }, [track, enabled]);
  return level;
}
