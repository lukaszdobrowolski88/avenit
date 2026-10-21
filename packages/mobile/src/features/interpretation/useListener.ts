// Słuchacz tłumaczenia na żywo w aplikacji — stan i połączenie (odpowiednik webowego
// ListenerPage.jsx). Źródła danych:
//   • zalogowany (ekran wydarzenia, link /tlumaczenie/sluchaj/<id>): interp-session-get + interp-member-listen;
//   • publiczny link/QR /tlumaczenie/<token> (web tego kościoła): interp-public-info + interp-listen
//     (tenant idzie nagłówkiem X-Tenant z shimu supabase — jak każde wywołanie funkcji).
// Wybór języka → „Słuchaj” → ukryty słuchacz pokoju LiveKit kanału (tylko odbiór; dźwięk zdalnej
// ścieżki gra sam po subskrypcji). Kanał jeszcze nie nadaje (409) — odpytujemy co 10 s i łączymy
// sami. Zerwane połączenie / powrót sieci / powrót apki na wierzch — łączymy ponownie.
// Rozmowa (CallKit / Telecom) ma pierwszeństwo: w trakcie rozmowy nie zaczniemy słuchać, a gdy
// rozmowa się zaczyna (wychodząca albo dzwoni przychodząca) — słuchanie się kończy.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Room } from 'livekit-client';
import { supabase } from '../../lib/supabase';
import { appLang } from '../../i18n';
import { callkit } from '../calls/native/modules';
import { getCallState, subscribeCall } from '../calls/native/engine';
import { beginListeningAudio, endListeningAudio, loadListenerLiveKit, nativeListeningAvailable, setKeepAwake } from './audio';
import {
  defaultChannel,
  fatalFromError,
  infoFromSession,
  interpErrorState,
  pollDecision,
  pollInterval,
  retryDelay,
  shouldKeepAwake,
  type FatalState,
  type ListenerInfo,
  type ListenResponse,
  type Phase,
  type SessionGetResponse,
} from './logic';

export interface ListenerSource {
  key: string;
  isPublic: boolean;
  eventId: string | null;
  info: () => Promise<ListenerInfo>;
  listen: (channelId: string) => Promise<ListenResponse>;
}

type FnError = Error & { status?: number; code?: string; context?: { error?: string; code?: string } | null };

async function fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body, silent: true } as never);
  if (error) {
    const e = error as { message?: string; status?: number; context?: { error?: string; code?: string } | null };
    throw Object.assign(new Error(e.context?.error || e.message || 'Błąd'), {
      status: e.status,
      code: e.context?.code,
      context: e.context ?? null,
    }) as FnError;
  }
  return data as T;
}

export const fetchSession = (eventId: string | number) => fn<SessionGetResponse>('interp-session-get', { event_id: String(eventId) });

export function memberSource(eventId: string): ListenerSource {
  return {
    key: `ev:${eventId}`,
    isPublic: false,
    eventId,
    info: async () => {
      const info = infoFromSession(await fetchSession(eventId));
      if (!info) throw Object.assign(new Error('not found'), { status: 404, code: 'INTERP_NOT_FOUND' });
      return info;
    },
    listen: (channelId) => fn<ListenResponse>('interp-member-listen', { event_id: eventId, channel_id: channelId }),
  };
}

export function tokenSource(token: string): ListenerSource {
  return {
    key: token,
    isPublic: true,
    eventId: null,
    info: () => fn<ListenerInfo>('interp-public-info', { token }),
    listen: (channelId) => fn<ListenResponse>('interp-listen', { token, channel_id: channelId }),
  };
}

const rememberKey = (key: string) => `avenit.interp.${key}`;
const readRemembered = (key: string) => AsyncStorage.getItem(rememberKey(key)).catch(() => null);
const writeRemembered = (key: string, v: string) => {
  AsyncStorage.setItem(rememberKey(key), v).catch(() => undefined);
};

// Język telefonu (Intl w Hermesie) i aplikacji — do wyboru domyślnego kanału.
function deviceLanguages(): string[] {
  const out: string[] = [];
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;
    if (loc) out.push(loc);
  } catch {
    /* brak Intl */
  }
  out.push(appLang());
  return out;
}

type NetInfoModule = typeof import('@react-native-community/netinfo');
function netInfo(): NetInfoModule['default'] | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('@react-native-community/netinfo') as NetInfoModule;
    return m?.default ?? null;
  } catch {
    return null; // stary build bez modułu — ponawiamy i tak (z odstępami)
  }
}

export const CALL_BLOCK_HINT = 'Trwa rozmowa. Zakończ ją, żeby słuchać tłumaczenia.';
export const CALL_STOP_HINT = 'Słuchanie przerwała rozmowa. Dotknij „Słuchaj”, żeby wrócić.';

export function useInterpretationListener(src: ListenerSource) {
  const available = nativeListeningAvailable();
  const [info, setInfo] = useState<ListenerInfo | null>(null);
  const [fatal, setFatal] = useState<FatalState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [online, setOnline] = useState(true);
  const [hint, setHint] = useState('');

  const roomRef = useRef<Room | null>(null);
  const audioOnRef = useRef(false);
  const leavingRef = useRef(false);
  const unmountedRef = useRef(false);
  const attemptRef = useRef(0);
  const runRef = useRef(0); // numer bieżącej próby — starsze odpowiedzi ignorujemy
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const set = useCallback(<T,>(fnSet: (v: T) => void, v: T) => {
    if (!unmountedRef.current) fnSet(v);
  }, []);

  const clearRetry = () => {
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
  };

  const teardownRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        room.removeAllListeners();
        await room.disconnect(true);
      } catch {
        /* już rozłączony */
      }
    }
  }, []);

  // Koniec słuchania (przycisk, wyjście z ekranu, koniec tłumaczenia, rozmowa).
  const stopAll = useCallback(
    async (reason: 'user' | 'call' | 'fatal' | 'unmount' = 'user') => {
      leavingRef.current = true;
      runRef.current += 1;
      attemptRef.current = 0;
      clearRetry();
      await teardownRoom();
      if (audioOnRef.current) {
        audioOnRef.current = false;
        await endListeningAudio({ takenByCall: reason === 'call' }).catch(() => undefined);
      }
      if (reason !== 'unmount') set(setPhase, 'idle' as Phase);
    },
    [teardownRoom, set],
  );

  const loadInfo = useCallback(async (): Promise<ListenerInfo | null> => {
    try {
      const r = await src.info();
      set(setInfo, r as ListenerInfo | null);
      if (r.status === 'ended') {
        set(setFatal, 'ended' as FatalState | null);
        await stopAll('fatal');
      }
      return r;
    } catch (err) {
      const f = fatalFromError(interpErrorState(err));
      if (f) {
        set(setFatal, f as FatalState | null);
        await stopAll('fatal');
      }
      return null;
    }
  }, [src, stopAll, set]);

  const connectRef = useRef<(channelId: string) => Promise<void>>(async () => undefined);

  const scheduleRetry = useCallback((channelId: string, run: number, { withInfo = false } = {}) => {
    clearRetry();
    const delay = retryDelay(attemptRef.current++);
    set(setPhase, 'reconnecting' as Phase);
    retryRef.current = setTimeout(async () => {
      if (run !== runRef.current || leavingRef.current || selectedRef.current !== channelId) return;
      if (withInfo) {
        const r = await loadInfo();
        if (!r || r.status === 'ended' || run !== runRef.current || leavingRef.current) return;
      }
      void connectRef.current(channelId);
    }, delay);
  }, [loadInfo, set]);

  const connect = useCallback(
    async (channelId: string) => {
      clearRetry();
      leavingRef.current = false;
      if (getCallState()) {
        set(setHint, CALL_BLOCK_HINT);
        await stopAll('call');
        return;
      }
      const run = ++runRef.current;
      set(setPhase, (phaseRef.current === 'listening' || phaseRef.current === 'reconnecting' ? 'reconnecting' : 'connecting') as Phase);
      let res: ListenResponse;
      try {
        res = await src.listen(channelId);
      } catch (err) {
        if (run !== runRef.current) return;
        const state = interpErrorState(err);
        if (state === 'not_live') {
          await teardownRoom();
          set(setPhase, 'waiting' as Phase);
          return;
        }
        const f = fatalFromError(state);
        if (f) {
          set(setFatal, f as FatalState | null);
          await stopAll('fatal');
          return;
        }
        scheduleRetry(channelId, run); // sieć / chwilowy błąd
        return;
      }
      if (run !== runRef.current || leavingRef.current) return;

      let client: ReturnType<typeof loadListenerLiveKit>['client'];
      try {
        client = loadListenerLiveKit().client;
        if (!audioOnRef.current) {
          await beginListeningAudio();
          audioOnRef.current = true;
        }
      } catch (e) {
        if (__DEV__) console.warn('[interp] audio:', (e as Error)?.message);
        set(setHint, 'Nie udało się włączyć dźwięku. Spróbuj ponownie.');
        await stopAll('user');
        return;
      }
      if (run !== runRef.current || leavingRef.current) return;

      await teardownRoom();
      const { Room: LkRoom, RoomEvent } = client;
      const room = new LkRoom({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      room.on(RoomEvent.Reconnecting, () => roomRef.current === room && set(setPhase, 'reconnecting' as Phase));
      room.on(RoomEvent.SignalReconnecting, () => roomRef.current === room && set(setPhase, 'reconnecting' as Phase));
      room.on(RoomEvent.Reconnected, () => roomRef.current === room && set(setPhase, 'listening' as Phase));
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== room) return;
        roomRef.current = null;
        if (leavingRef.current || run !== runRef.current) return;
        // Zerwane (sieć, restart serwera, koniec tłumaczenia) — sprawdź stan i połącz ponownie.
        scheduleRetry(channelId, run, { withInfo: true });
      });
      try {
        await room.connect(res.url, res.token, { autoSubscribe: true });
      } catch {
        if (roomRef.current === room) roomRef.current = null;
        if (run !== runRef.current || leavingRef.current) return;
        scheduleRetry(channelId, run);
        return;
      }
      if (roomRef.current !== room || run !== runRef.current) return;
      attemptRef.current = 0;
      set(setPhase, 'listening' as Phase);
    },
    [src, stopAll, teardownRoom, scheduleRetry, set],
  );
  connectRef.current = connect;

  // Pierwsze wczytanie + domyślny język.
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await loadInfo();
      if (!alive || !r) return;
      const remembered = await readRemembered(src.key);
      const pick = defaultChannel(r.channels, { remembered, languages: deviceLanguages() });
      if (alive && pick) setSelected((cur) => cur || pick);
    })();
    return () => {
      alive = false;
    };
  }, [loadInfo, src]);

  // Odpytywanie stanu: co 10 s przed słuchaniem (czekamy na tłumacza), co 30 s w trakcie.
  useEffect(() => {
    const ms = pollInterval(phase, fatal);
    if (!ms) return undefined;
    const t = setInterval(async () => {
      if (AppState.currentState !== 'active' && phaseRef.current !== 'waiting') return;
      const r = await loadInfo();
      if (pollDecision(phaseRef.current, r, selectedRef.current) === 'connect' && selectedRef.current) {
        attemptRef.current = 0;
        void connectRef.current(selectedRef.current);
      }
    }, ms);
    return () => clearInterval(t);
  }, [phase, fatal, loadInfo]);

  // Sieć: powrót — od razu ponów (zamiast czekać na kolejną próbę).
  useEffect(() => {
    const NI = netInfo();
    if (!NI) return undefined;
    let unsub: (() => void) | null = null;
    try {
      unsub = NI.addEventListener((s) => {
        const on = s.isConnected !== false && s.isInternetReachable !== false;
        const was = onlineRef.current;
        set(setOnline, on);
        if (on && !was && phaseRef.current === 'reconnecting' && selectedRef.current) {
          attemptRef.current = 0;
          void connectRef.current(selectedRef.current);
        }
      });
    } catch {
      unsub = null;
    }
    return () => unsub?.();
  }, [set]);

  // Powrót apki na wierzch: czekamy / łączymy ponownie — sprawdź od razu.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const p = phaseRef.current;
      const ch = selectedRef.current;
      if (!ch) return;
      if (p === 'reconnecting') {
        attemptRef.current = 0;
        void connectRef.current(ch);
      } else if (p === 'waiting') {
        void loadInfo().then((r) => {
          if (pollDecision(phaseRef.current, r, selectedRef.current) === 'connect') void connectRef.current(ch);
        });
      }
    });
    return () => sub.remove();
  }, [loadInfo]);

  // Rozmowa ma pierwszeństwo: zaczęta (wychodząca / odebrana) albo dzwoni przychodząca → koniec słuchania.
  useEffect(() => {
    const interrupt = () => {
      if (phaseRef.current === 'idle') return;
      set(setHint, CALL_STOP_HINT);
      void stopAll('call');
    };
    const unsub = subscribeCall(() => {
      if (getCallState()) interrupt();
    });
    let incoming: { remove: () => void } | null = null;
    try {
      incoming = callkit()?.addIncomingCallReportedListener(() => interrupt()) ?? null;
    } catch {
      incoming = null;
    }
    return () => {
      unsub();
      incoming?.remove();
    };
  }, [stopAll, set]);

  // Ekran nie gaśnie (Android przez całe słuchanie, iOS do czasu, aż popłynie dźwięk).
  useEffect(() => {
    setKeepAwake(shouldKeepAwake(Platform.OS, phase));
  }, [phase]);

  // Wyjście z ekranu = koniec słuchania.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      setKeepAwake(false);
      void stopAll('unmount');
    };
  }, [stopAll]);

  const listen = useCallback(() => {
    const ch = selectedRef.current;
    if (!ch) {
      setHint('Najpierw wybierz język.');
      return;
    }
    if (getCallState()) {
      setHint(CALL_BLOCK_HINT);
      return;
    }
    setHint('');
    writeRemembered(src.key, ch);
    attemptRef.current = 0;
    void connect(ch);
  }, [connect, src]);

  const choose = useCallback(
    (id: string) => {
      if (id === selectedRef.current) return;
      setSelected(id);
      selectedRef.current = id;
      setHint('');
      writeRemembered(src.key, id);
      if (phaseRef.current !== 'idle') {
        attemptRef.current = 0;
        void connect(id);
      }
    },
    [connect, src],
  );

  const stop = useCallback(() => {
    setHint('');
    void stopAll('user');
  }, [stopAll]);

  const channel = info?.channels.find((c) => c.id === selected) ?? null;
  return { available, info, fatal, selected, channel, phase, online, hint, listen, choose, stop, reload: loadInfo };
}
