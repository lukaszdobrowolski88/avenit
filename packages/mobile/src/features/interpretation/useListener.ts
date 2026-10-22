// Słuchacz tłumaczenia na żywo w aplikacji — stan i połączenie (odpowiednik webowego
// ListenerPage.jsx). Źródła danych:
//   • zalogowany (ekran wydarzenia, link /tlumaczenie/sluchaj/<id>): interp-session-get + interp-member-listen;
//   • publiczny link/QR /tlumaczenie/<token>: interp-public-info + interp-listen — kościół z linku
//     (Universal/App Link https://<kościół>.avenit.pl/…), także bez logowania albo z kontem w innym
//     kościele (shim: opcja `tenant` → X-Tenant linku, bez tokenu sesji); link bez hosta — kościół sesji.
// Wybór języka → „Słuchaj” → ukryty słuchacz pokoju LiveKit kanału (tylko odbiór; dźwięk zdalnej
// ścieżki gra sam po subskrypcji). Kanał jeszcze nie nadaje (409) — odpytujemy co 10 s i łączymy
// sami. Zerwane połączenie / powrót sieci / powrót apki na wierzch — łączymy ponownie.
// Rozmowa (CallKit / Telecom) ma pierwszeństwo: w trakcie rozmowy nie zaczniemy słuchać, a gdy
// rozmowa się zaczyna (wychodząca albo dzwoni przychodząca) — słuchanie się kończy.
// Android (build z modułem AvenitInterpretationPlayback): od „Słuchaj” działa usługa
// pierwszoplanowa z powiadomieniem — dźwięk gra przy wygaszonym ekranie, a timery (ponawianie,
// odpytywanie, ping LiveKit) są hybrydowe, bo RN w tle wstrzymuje setTimeout. „Zatrzymaj”
// w powiadomieniu kończy słuchanie. Bez modułu — jak dawniej: ekran nie gaśnie (keep-awake).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Room } from 'livekit-client';
import { supabase } from '../../lib/supabase';
import { appLang } from '../../i18n';
import { callkit } from '../calls/native/modules';
import { getCallState, subscribeCall } from '../calls/native/engine';
import {
  beginListeningAudio,
  claimInterpretationAudio,
  endListeningAudio,
  interpretationAudioUser,
  registerInterpretationAudioUser,
  releaseInterpretationAudio,
  listenerTimers,
  loadListenerLiveKit,
  nativeListeningAvailable,
  playbackServiceAvailable,
  setKeepAwake,
  startPlaybackService,
  stopPlaybackService,
  subscribePlaybackService,
} from './audio';
import {
  defaultChannel,
  fatalFromError,
  infoFromSession,
  interpErrorState,
  pollDecision,
  playbackNotification,
  pollInterval,
  retryDelay,
  shouldKeepAwake,
  shouldRunPlaybackService,
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
  // Kościół z linku (null = kościół sesji).
  tenant: string | null;
  info: () => Promise<ListenerInfo>;
  listen: (channelId: string) => Promise<ListenResponse>;
}

type FnError = Error & { status?: number; code?: string; context?: { error?: string; code?: string } | null };

async function fn<T>(name: string, body: Record<string, unknown>, tenant: string | null = null): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body, silent: true, ...(tenant ? { tenant } : {}) } as never);
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

// Wywołanie fn interp-* (też konsola tłumacza): błąd → Error z { status, code, context }.
export const interpFn = fn;

export const fetchSession = (eventId: string | number) => fn<SessionGetResponse>('interp-session-get', { event_id: String(eventId) });

export function memberSource(eventId: string): ListenerSource {
  return {
    key: `ev:${eventId}`,
    isPublic: false,
    eventId,
    tenant: null,
    info: async () => {
      const info = infoFromSession(await fetchSession(eventId));
      if (!info) throw Object.assign(new Error('not found'), { status: 404, code: 'INTERP_NOT_FOUND' });
      return info;
    },
    listen: (channelId) => fn<ListenResponse>('interp-member-listen', { event_id: eventId, channel_id: channelId }),
  };
}

export function tokenSource(token: string, tenant: string | null = null): ListenerSource {
  return {
    key: token,
    isPublic: true,
    eventId: null,
    tenant,
    info: () => fn<ListenerInfo>('interp-public-info', { token }, tenant),
    listen: (channelId) => fn<ListenResponse>('interp-listen', { token, channel_id: channelId }, tenant),
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
export function netInfo(): NetInfoModule['default'] | null {
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
export const CONSOLE_BLOCK_HINT = 'Trwa Twoja zmiana w konsoli tłumacza. Zakończ ją, żeby słuchać.';
export const CONSOLE_STOP_HINT = 'Słuchanie przerwała konsola tłumacza.';

export function useInterpretationListener(src: ListenerSource) {
  const available = nativeListeningAvailable();
  const [info, setInfo] = useState<ListenerInfo | null>(null);
  const [fatal, setFatal] = useState<FatalState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [online, setOnline] = useState(true);
  const [hint, setHint] = useState('');
  // Usługa słuchania w tle (Android 1.2.0+); failed — Android jej nie uruchomił → keep-awake.
  const serviceAvailable = useMemo(() => playbackServiceAvailable(), []);
  const [serviceFailed, setServiceFailed] = useState(false);
  const backgroundPlayback = serviceAvailable && !serviceFailed;

  const roomRef = useRef<Room | null>(null);
  const audioOnRef = useRef(false);
  const leavingRef = useRef(false);
  const unmountedRef = useRef(false);
  const attemptRef = useRef(0);
  const runRef = useRef(0); // numer bieżącej próby — starsze odpowiedzi ignorujemy
  const retryRef = useRef<unknown>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const backgroundRef = useRef(backgroundPlayback);
  backgroundRef.current = backgroundPlayback;

  const set = useCallback(<T,>(fnSet: (v: T) => void, v: T) => {
    if (!unmountedRef.current) fnSet(v);
  }, []);

  const clearRetry = () => {
    if (retryRef.current != null) listenerTimers.clear(retryRef.current);
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
      releaseInterpretationAudio('listener');
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
    retryRef.current = listenerTimers.setTimeout(async () => {
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
      if (interpretationAudioUser() === 'console') {
        set(setHint, CONSOLE_BLOCK_HINT);
        await stopAll('user');
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
          await claimInterpretationAudio('listener');
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
  // W tle — czekając na tłumacza, a z usługą słuchania także w trakcie (koniec tłumaczenia
  // zatrzyma usługę, powiadomienie pokaże przerwę).
  useEffect(() => {
    const ms = pollInterval(phase, fatal);
    if (!ms) return undefined;
    const t = listenerTimers.setInterval(async () => {
      const p = phaseRef.current;
      const serviceOn = backgroundRef.current && p !== 'idle';
      if (AppState.currentState !== 'active' && p !== 'waiting' && !serviceOn) return;
      const r = await loadInfo();
      if (pollDecision(phaseRef.current, r, selectedRef.current) === 'connect' && selectedRef.current) {
        attemptRef.current = 0;
        void connectRef.current(selectedRef.current);
      }
    }, ms);
    return () => listenerTimers.clear(t);
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

  // „Zatrzymaj” w powiadomieniu usługi (albo apka zamknięta z ostatnich) → koniec słuchania;
  // usługa nie wstała → wracamy do „nie wyłączaj ekranu”.
  useEffect(
    () =>
      subscribePlaybackService({
        onStop: () => {
          if (phaseRef.current === 'idle') return;
          set(setHint, '');
          void stopAll('user');
        },
        onFailed: () => set(setServiceFailed, true),
      }),
    [stopAll, set],
  );

  // Android z usługą: powiadomienie przez całe słuchanie (tekst = stan); bez usługi ekran nie gaśnie
  // (Android przez całe słuchanie, iOS do czasu, aż popłynie dźwięk).
  const channelNow = info?.channels.find((c) => c.id === selected) ?? null;
  const note = playbackNotification(phase, { channel: channelNow, eventTitle: info?.event?.title ?? null, online });
  useEffect(() => {
    if (shouldRunPlaybackService(Platform.OS, phase, backgroundPlayback)) {
      if (!startPlaybackService(note.title, note.text)) setServiceFailed(true);
    } else if (serviceAvailable) {
      stopPlaybackService('listen');
    }
    setKeepAwake(shouldKeepAwake(Platform.OS, phase, backgroundPlayback));
  }, [phase, backgroundPlayback, serviceAvailable, note.title, note.text]);

  // Konsola tłumacza przejmuje dźwięk → koniec słuchania (z podpowiedzią).
  useEffect(
    () =>
      registerInterpretationAudioUser('listener', async () => {
        set(setHint, CONSOLE_STOP_HINT);
        await stopAll('user');
      }),
    [stopAll, set],
  );

  // Wyjście z ekranu = koniec słuchania.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      setKeepAwake(false);
      stopPlaybackService('listen');
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
    if (interpretationAudioUser() === 'console') {
      setHint(CONSOLE_BLOCK_HINT);
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

  return {
    available,
    info,
    fatal,
    selected,
    channel: channelNow,
    phase,
    online,
    hint,
    backgroundPlayback,
    listen,
    choose,
    stop,
    reload: loadInfo,
  };
}
