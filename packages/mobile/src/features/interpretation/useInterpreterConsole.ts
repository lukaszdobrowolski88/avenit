// Konsola tłumacza w aplikacji — stan i połączenia (odpowiednik webowego InterpreterConsole.jsx).
//
// Dwa pokoje LiveKit (dwie instancje Room): kanał językowy (mój mikrofon + partner na zmianie)
// i „Oryginał” (nagłośnienie z miksera, tylko odsłuch — gdy włączony w ustawieniach tłumaczenia).
// Mikrofon jest opublikowany przez całą zmianę, ale otwarty tylko u aktywnego tłumacza (metadane
// pokoju {active}); „Przejmij mikrofon” (interp-take-over) wycisza poprzedniego także na serwerze.
// Zerwane połączenie — nowy token i ponowne wejście z rosnącą przerwą; koniec tłumaczenia / brak
// dostępu — koniec zmiany z komunikatem.
// Dźwięk: sesja „rozmowa głosowa” (audio.ts: beginConsoleAudio — iOS playAndRecord/voiceChat,
// Android communication) na czas zmiany; konsola przejmuje dźwięk od słuchacza tłumaczenia,
// a rozmowa (CallKit / Telecom) ma pierwszeństwo przed konsolą.
// Ekran: nie gaśnie przez całą zmianę (expo-keep-awake). Android z modułem w trybie „console”
// (usługa z mikrofonem) — może zgasnąć; bez niego Android w tle wycisza mikrofon.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalAudioTrack, Room } from 'livekit-client';
import { callkit } from '../calls/native/modules';
import { ensureMediaAccess, getCallState, subscribeCall } from '../calls/native/engine';
import {
  audioOutputs,
  beginConsoleAudio,
  claimInterpretationAudio,
  consoleServiceAvailable,
  CONSOLE_KEEP_AWAKE_TAG,
  endConsoleAudio,
  listenerTimers,
  loadListenerLiveKit,
  nativeListeningAvailable,
  playbackServiceMode,
  registerInterpretationAudioUser,
  releaseInterpretationAudio,
  setKeepAwake,
  startPlaybackService,
  stopPlaybackService,
  subscribePlaybackService,
} from './audio';
import {
  consoleChannels,
  consoleErrorFrom,
  consoleErrorMessage,
  consoleKeepAwake,
  consoleNotification,
  defaultConsoleChannel,
  headphonesConnected,
  holderName,
  isConnected,
  micShouldBeOpen,
  micState,
  OUTPUT_POLL_MS,
  parseRoomMeta,
  rejoinDecision,
  retryDelay,
  shouldRunConsoleService,
  staffLabel,
  STATS_POLL_MS,
  type ConsoleError,
  type ConsolePhase,
  type ConsoleSessionView,
  type ConsoleStats,
  type JoinResponse,
} from './consoleLogic';
import { interpFn, netInfo } from './useListener';

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();
const rememberKey = (eventId: string) => `avenit.interp.console.${eventId}`;
const MIC_TEXT = {
  title: 'Brak dostępu do mikrofonu',
  body: 'Aby słuchacze słyszeli tłumaczenie, zezwól Avenit na dostęp do mikrofonu w Ustawieniach.',
};

export interface Present {
  id: string;
  name: string;
  speaking: boolean;
}

// Błąd mikrofonu z getUserMedia (odmowa w systemie).
const isMicError = (e: unknown) => /NotAllowed|Permission|denied|NotFound|NotReadable|Security/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`);

export function useInterpreterConsole(eventId: string) {
  const available = nativeListeningAvailable();
  const [view, setView] = useState<ConsoleSessionView | null>(null);
  const [loadError, setLoadError] = useState<ConsoleError | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConsolePhase>('setup');
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ConsoleError | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [selfMuted, setSelfMuted] = useState(false);
  const [present, setPresent] = useState<Present[]>([]);
  const [origOn, setOrigOn] = useState<boolean | null>(null);
  const [origVol, setOrigVol] = useState(0.8);
  const [partnerVol, setPartnerVol] = useState(0.8);
  const [stats, setStats] = useState<ConsoleStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [micTrack, setMicTrack] = useState<LocalAudioTrack | null>(null);
  const [outputs, setOutputs] = useState<string[] | null>(null);
  const [online, setOnline] = useState(true);
  const serviceAvailable = useMemo(() => consoleServiceAvailable(), []);
  const [serviceFailed, setServiceFailed] = useState(false);
  const backgroundService = serviceAvailable && !serviceFailed;

  const roomRef = useRef<Room | null>(null);
  const origRef = useRef<Room | null>(null);
  const micRef = useRef<LocalAudioTrack | null>(null);
  const audioOnRef = useRef(false);
  const leavingRef = useRef(false);
  const unmountedRef = useRef(false);
  const attemptRef = useRef(0);
  const runRef = useRef(0);
  const retryRef = useRef<unknown>(null);
  const meRef = useRef<string | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const channelRef = useRef(channelId);
  channelRef.current = channelId;
  const volsRef = useRef({ origVol, partnerVol });
  volsRef.current = { origVol, partnerVol };
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const set = useCallback(<T,>(fnSet: (v: T) => void, v: T) => {
    if (!unmountedRef.current) fnSet(v);
  }, []);

  const fail = useCallback(
    (kind: ConsoleError, message: string) => {
      set(setErrorKind, kind as ConsoleError | null);
      set(setError, message as string | null);
    },
    [set],
  );

  // ── Dane sesji ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const r = await interpFn<ConsoleSessionView>('interp-session-get', { event_id: String(eventId) });
      set(setView, r as ConsoleSessionView | null);
      set(setLoadError, null as ConsoleError | null);
      const list = consoleChannels(r);
      const remembered = await AsyncStorage.getItem(rememberKey(eventId)).catch(() => null);
      const pick = defaultConsoleChannel(list, { remembered, myChannels: r.my_channels ?? [] });
      if (!unmountedRef.current) setChannelId((cur) => (cur && list.some((c) => c.id === cur) ? cur : pick));
      return r;
    } catch (err) {
      set(setLoadError, consoleErrorFrom(err) as ConsoleError | null);
      return null;
    }
  }, [eventId, set]);
  useEffect(() => {
    void load();
  }, [load]);

  const channels = useMemo(() => consoleChannels(view), [view]);
  const channel = channels.find((c) => c.id === channelId) ?? null;

  // ── Pokoje ────────────────────────────────────────────────────────────────
  const refreshPresent = useCallback(() => {
    const room = roomRef.current;
    const list = room
      ? Array.from(room.remoteParticipants.values()).map((p) => ({ id: lower(p.identity), name: p.name || p.identity, speaking: !!p.isSpeaking }))
      : [];
    set(setPresent, list);
  }, [set]);

  const refreshOriginal = useCallback(() => {
    const o = origRef.current;
    if (!o) {
      set(setOrigOn, null as boolean | null);
      return;
    }
    const on = Array.from(o.remoteParticipants.values()).some((p) =>
      Array.from(p.audioTrackPublications.values()).some((pub) => !pub.isMuted),
    );
    set(setOrigOn, on as boolean | null);
  }, [set]);

  const setRoomVolume = (room: Room | null, v: number) => {
    room?.remoteParticipants.forEach((p) =>
      p.audioTrackPublications.forEach((pub) => {
        try {
          (pub.track as { setVolume?: (x: number) => void } | undefined)?.setVolume?.(v);
        } catch {
          /* starszy WebRTC — bez regulacji */
        }
      }),
    );
  };
  useEffect(() => setRoomVolume(origRef.current, origVol), [origVol]);
  useEffect(() => setRoomVolume(roomRef.current, partnerVol), [partnerVol]);

  const disconnectRooms = useCallback(async () => {
    const rooms = [roomRef.current, origRef.current].filter(Boolean) as Room[];
    roomRef.current = null;
    origRef.current = null;
    await Promise.all(
      rooms.map(async (r) => {
        try {
          r.removeAllListeners();
          await r.disconnect(false);
        } catch {
          /* już rozłączony */
        }
      }),
    );
    set(setPresent, [] as Present[]);
    set(setOrigOn, null as boolean | null);
  }, [set]);

  const stopMic = useCallback(() => {
    const t = micRef.current;
    micRef.current = null;
    set(setMicTrack, null as LocalAudioTrack | null);
    try {
      t?.stop();
    } catch {
      /* już zatrzymany */
    }
  }, [set]);

  // Koniec zmiany (przycisk, wyjście z ekranu, koniec tłumaczenia, rozmowa, powiadomienie).
  const leave = useCallback(
    async (reason: 'user' | 'call' | 'fatal' | 'unmount' = 'user') => {
      leavingRef.current = true;
      runRef.current += 1;
      attemptRef.current = 0;
      if (retryRef.current != null) listenerTimers.clear(retryRef.current);
      retryRef.current = null;
      const ch = channelRef.current;
      if (ch && meRef.current && activeRef.current === meRef.current) {
        interpFn('interp-release', { channel_id: ch }).catch(() => undefined);
      }
      await disconnectRooms();
      stopMic();
      if (audioOnRef.current) {
        audioOnRef.current = false;
        await endConsoleAudio({ takenByCall: reason === 'call' }).catch(() => undefined);
      }
      releaseInterpretationAudio('console');
      set(setActive, null as string | null);
      set(setSelfMuted, false);
      set(setStats, null as ConsoleStats | null);
      if (reason !== 'unmount') set(setPhase, 'setup' as ConsolePhase);
    },
    [disconnectRooms, stopMic, set],
  );

  const scheduleRef = useRef<() => void>(() => undefined);

  const connectRooms = useCallback(
    async (run: number) => {
      const ch = channelRef.current;
      if (!ch) throw new Error('no channel');
      const { client } = loadListenerLiveKit();
      // Mikrofon: jedna ścieżka na całą zmianę (po zerwaniu — nowa, jeśli zgasła).
      let mic = micRef.current;
      if (!mic || (mic.mediaStreamTrack as { readyState?: string } | undefined)?.readyState === 'ended') {
        mic = await client.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
        if (run !== runRef.current || leavingRef.current) {
          // Wyszliśmy w trakcie — nie zostawiamy włączonego mikrofonu.
          try {
            mic.stop();
          } catch {
            /* już zatrzymany */
          }
          return;
        }
        micRef.current = mic;
        set(setMicTrack, mic as LocalAudioTrack | null);
      }
      const res = await interpFn<JoinResponse>('interp-interpreter-join', { channel_id: ch });
      if (run !== runRef.current || leavingRef.current) return;
      const identity = lower(res.identity);
      meRef.current = identity;
      set(setMe, identity as string | null);
      await disconnectRooms();

      const { Room: LkRoom, RoomEvent: E, Track, AudioPresets } = client;
      const room = new LkRoom({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      room.on(E.RoomMetadataChanged, (m) => roomRef.current === room && set(setActive, parseRoomMeta(m).active));
      room.on(E.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          try {
            (track as { setVolume?: (x: number) => void }).setVolume?.(volsRef.current.partnerVol);
          } catch {
            /* bez regulacji */
          }
        }
      });
      for (const ev of [E.ParticipantConnected, E.ParticipantDisconnected, E.ActiveSpeakersChanged, E.ParticipantNameChanged]) {
        room.on(ev, () => roomRef.current === room && refreshPresent());
      }
      room.on(E.Reconnecting, () => roomRef.current === room && set(setPhase, 'reconnecting' as ConsolePhase));
      room.on(E.SignalReconnecting, () => roomRef.current === room && set(setPhase, 'reconnecting' as ConsolePhase));
      room.on(E.Reconnected, () => roomRef.current === room && set(setPhase, 'on' as ConsolePhase));
      room.on(E.Disconnected, () => {
        if (roomRef.current !== room) return;
        roomRef.current = null;
        if (leavingRef.current || run !== runRef.current) return;
        scheduleRef.current();
      });
      await room.connect(res.url, res.token, { autoSubscribe: true });
      if (roomRef.current !== room || run !== runRef.current) return;
      const current = parseRoomMeta(room.metadata).active ?? (res.channel?.active_interpreter_email ? lower(res.channel.active_interpreter_email) : null);
      set(setActive, current);
      activeRef.current = current;
      // Wyciszony PRZED publikacją, gdy nie jestem aktywny — bez chwili otwartego mikrofonu.
      if (current !== identity) await mic.mute().catch(() => undefined);
      await room.localParticipant.publishTrack(mic, {
        source: Track.Source.Microphone,
        audioPreset: AudioPresets?.speech,
        dtx: true,
        red: true,
        forceStereo: false,
      });
      refreshPresent();

      if (res.original?.token) {
        const orig = new LkRoom({ adaptiveStream: false, dynacast: false });
        origRef.current = orig;
        orig.on(E.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            try {
              (track as { setVolume?: (x: number) => void }).setVolume?.(volsRef.current.origVol);
            } catch {
              /* bez regulacji */
            }
          }
          refreshOriginal();
        });
        for (const ev of [E.TrackUnsubscribed, E.ParticipantConnected, E.ParticipantDisconnected, E.TrackMuted, E.TrackUnmuted, E.TrackPublished, E.TrackUnpublished]) {
          orig.on(ev, () => origRef.current === orig && refreshOriginal());
        }
        orig.on(E.Disconnected, () => {
          if (origRef.current === orig) {
            origRef.current = null;
            refreshOriginal();
          }
        });
        try {
          await orig.connect(res.url, res.original.token, { autoSubscribe: true });
        } catch {
          // Oryginał niedostępny — kanał działa dalej.
          if (origRef.current === orig) origRef.current = null;
        }
        refreshOriginal();
      }
      attemptRef.current = 0;
    },
    [disconnectRooms, refreshPresent, refreshOriginal, set],
  );

  // Zerwane połączenie — ponawiamy z rosnącą przerwą, z nowym tokenem.
  scheduleRef.current = () => {
    if (leavingRef.current) return;
    set(setPhase, 'reconnecting' as ConsolePhase);
    if (retryRef.current != null) listenerTimers.clear(retryRef.current);
    const run = runRef.current;
    retryRef.current = listenerTimers.setTimeout(async () => {
      retryRef.current = null;
      if (run !== runRef.current || leavingRef.current) return;
      try {
        await connectRooms(run);
        if (run === runRef.current && !leavingRef.current) set(setPhase, 'on' as ConsolePhase);
      } catch (err) {
        if (run !== runRef.current || leavingRef.current) return;
        const kind = isMicError(err) ? 'mic_denied' : consoleErrorFrom(err);
        if (kind === 'mic_denied' || rejoinDecision(kind) === 'stop') {
          await leave('fatal');
          fail(kind, kind === 'ended' ? 'Tłumaczenie zostało zakończone.' : kind === 'forbidden' ? 'Nie masz już dostępu do tego kanału.' : messageFor(kind));
          if (kind === 'ended') void load();
          return;
        }
        attemptRef.current += 1;
        scheduleRef.current();
      }
    }, retryDelay(attemptRef.current));
  };

  // Natychmiastowe ponowienie (wróciła sieć / apka wróciła na wierzch).
  const retryNow = useCallback(() => {
    if (phaseRef.current !== 'reconnecting' || leavingRef.current) return;
    attemptRef.current = 0;
    scheduleRef.current();
  }, []);

  const join = useCallback(async () => {
    const ch = channelRef.current;
    if (!ch || busy) return;
    set(setError, null as string | null);
    set(setErrorKind, null as ConsoleError | null);
    if (getCallState()) {
      fail('call_active', messageFor('call_active'));
      return;
    }
    setBusy(true);
    leavingRef.current = false;
    const run = ++runRef.current;
    set(setPhase, 'joining' as ConsolePhase);
    AsyncStorage.setItem(rememberKey(eventId), ch).catch(() => undefined);
    try {
      if (!(await ensureMediaAccess('microphone', MIC_TEXT))) {
        await leave('user');
        fail('mic_denied', messageFor('mic_denied'));
        return;
      }
      try {
        await claimInterpretationAudio('console');
        if (!audioOnRef.current) {
          await beginConsoleAudio();
          if (run !== runRef.current) {
            // Ekran zamknięty w trakcie — oddaj sesję audio od razu.
            await endConsoleAudio().catch(() => undefined);
            releaseInterpretationAudio('console');
            return;
          }
          audioOnRef.current = true;
        }
      } catch (e) {
        if (__DEV__) console.warn('[interp] konsola — audio:', (e as Error)?.message);
        await leave('user');
        fail('audio', messageFor('audio'));
        return;
      }
      await connectRooms(run);
      if (run === runRef.current && !leavingRef.current) set(setPhase, 'on' as ConsolePhase);
    } catch (err) {
      if (run !== runRef.current) return;
      await leave('user');
      const kind = isMicError(err) ? 'mic_denied' : consoleErrorFrom(err);
      fail(kind, kind === 'network' ? (err as { context?: { error?: string } })?.context?.error || messageFor(kind) : messageFor(kind));
      if (kind === 'ended') void load();
    } finally {
      set(setBusy, false);
    }
  }, [busy, connectRooms, eventId, fail, leave, load, set]);

  // Mikrofon otwarty tylko u aktywnego tłumacza (i bez chwilowego wyciszenia).
  useEffect(() => {
    const t = micRef.current;
    if (!t || phase !== 'on') return;
    const open = micShouldBeOpen({ phase, me, active, selfMuted });
    (open ? t.unmute() : t.mute()).catch(() => undefined);
  }, [active, selfMuted, phase, me]);

  const takeOver = useCallback(async () => {
    const ch = channelRef.current;
    if (!ch) return;
    setBusy(true);
    try {
      const r = await interpFn<{ channel?: { active_interpreter_email?: string | null } }>('interp-take-over', { channel_id: ch });
      set(setSelfMuted, false);
      set(setActive, lower(r?.channel?.active_interpreter_email || meRef.current) || null);
    } catch (err) {
      const kind = consoleErrorFrom(err);
      fail(kind, (err as { context?: { error?: string } })?.context?.error || 'Nie udało się przejąć mikrofonu.');
    } finally {
      set(setBusy, false);
    }
  }, [fail, set]);

  const giveBack = useCallback(async () => {
    const ch = channelRef.current;
    if (!ch) return;
    setBusy(true);
    try {
      await interpFn('interp-release', { channel_id: ch });
      set(setActive, null as string | null);
      set(setSelfMuted, false);
    } catch (err) {
      fail(consoleErrorFrom(err), (err as { context?: { error?: string } })?.context?.error || 'Nie udało się oddać mikrofonu.');
    } finally {
      set(setBusy, false);
    }
  }, [fail, set]);

  const choose = useCallback(
    (id: string) => {
      if (isConnected(phaseRef.current) || phaseRef.current === 'joining') return;
      setChannelId(id);
      setError(null);
      setErrorKind(null);
    },
    [],
  );

  // ── Licznik słuchaczy i stan (co 10 s na kanale) ──────────────────────────
  useEffect(() => {
    if (!isConnected(phase)) return undefined;
    let alive = true;
    const tick = async () => {
      if (AppState.currentState !== 'active' && !backgroundService) return;
      try {
        const s = await interpFn<ConsoleStats>('interp-stats', { event_id: String(eventId) });
        if (alive) set(setStats, s as ConsoleStats | null);
      } catch {
        /* następnym razem */
      }
    };
    void tick();
    const t = listenerTimers.setInterval(() => void tick(), STATS_POLL_MS);
    return () => {
      alive = false;
      listenerTimers.clear(t);
    };
  }, [phase, eventId, backgroundService, set]);

  // ── Słuchawki (Android: lista wyjść; iOS — nie wiadomo) ───────────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || !isConnected(phase)) return undefined;
    let alive = true;
    const check = async () => {
      const o = await audioOutputs();
      if (alive) set(setOutputs, o);
    };
    void check();
    const t = setInterval(() => void check(), OUTPUT_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [phase, set]);

  // ── Sieć i powrót na wierzch ──────────────────────────────────────────────
  useEffect(() => {
    const NI = netInfo();
    if (!NI) return undefined;
    let unsub: (() => void) | null = null;
    try {
      unsub = NI.addEventListener((s) => {
        const on = s.isConnected !== false && s.isInternetReachable !== false;
        const was = onlineRef.current;
        set(setOnline, on);
        if (on && !was) retryNow();
      });
    } catch {
      unsub = null;
    }
    return () => unsub?.();
  }, [retryNow, set]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') retryNow();
    });
    return () => sub.remove();
  }, [retryNow]);

  // ── Rozmowa ma pierwszeństwo ──────────────────────────────────────────────
  useEffect(() => {
    const interrupt = () => {
      if (phaseRef.current === 'setup') return;
      void leave('call').then(() => fail('call_active', 'Konsolę przerwała rozmowa. Zakończ ją i dołącz ponownie.'));
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
  }, [leave, fail]);

  // Słuchanie tłumaczenia przejmuje dźwięk (nie powinno — blokujemy je w trakcie zmiany), na wszelki wypadek.
  useEffect(
    () =>
      registerInterpretationAudioUser('console', async () => {
        await leave('user');
      }),
    [leave],
  );

  // ── Ekran / usługa w tle (Android z modułem w trybie „console”) ───────────
  const state = micState({ me, active, selfMuted });
  const holder = holderName({
    active,
    me,
    present,
    channel,
    statsName: stats?.channels?.find((c) => c.id === channelId)?.active_interpreter_name ?? null,
  });
  const note = consoleNotification(phase, state, {
    channelLabel: channel ? staffLabel(channel) : null,
    eventTitle: view?.event?.title ?? null,
    holder,
  });
  useEffect(() => {
    if (shouldRunConsoleService(Platform.OS, phase, backgroundService)) {
      if (!startPlaybackService(note.title, note.text, 'console')) setServiceFailed(true);
    } else if (serviceAvailable) {
      stopPlaybackService('console');
    }
    setKeepAwake(consoleKeepAwake(Platform.OS, phase, backgroundService), CONSOLE_KEEP_AWAKE_TAG);
  }, [phase, backgroundService, serviceAvailable, note.title, note.text]);

  useEffect(
    () =>
      subscribePlaybackService({
        // „Zakończ” w powiadomieniu (albo apka zamknięta z ostatnich) — tylko gdy usługa jest konsoli.
        onStop: () => {
          if (phaseRef.current === 'setup' || playbackServiceMode() === 'listen') return;
          void leave('user');
        },
        onFailed: () => {
          if (phaseRef.current !== 'setup') set(setServiceFailed, true);
        },
      }),
    [leave, set],
  );

  // Wyjście z ekranu = koniec zmiany (z oddaniem mikrofonu).
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      setKeepAwake(false, CONSOLE_KEEP_AWAKE_TAG);
      if (serviceAvailable) stopPlaybackService('console');
      void leave('unmount');
    };
  }, [leave, serviceAvailable]);

  const listeners = stats?.channels?.find((c) => c.id === channelId)?.listeners ?? null;
  const sessionStatus = (stats?.status ?? view?.session?.status ?? null) as 'idle' | 'live' | 'ended' | null;
  const originalEnabled = stats?.original?.enabled ?? !!view?.session?.original_enabled;

  return {
    available,
    view,
    loadError,
    reload: load,
    channels,
    channel,
    channelId,
    choose,
    phase,
    state,
    me,
    active,
    holder,
    selfMuted,
    toggleMute: () => setSelfMuted((m) => !m),
    present,
    origOn,
    originalEnabled,
    origVol,
    setOrigVol,
    partnerVol,
    setPartnerVol,
    listeners,
    sessionStatus,
    busy,
    error,
    errorKind,
    micTrack,
    headphones: headphonesConnected(Platform.OS, outputs),
    online,
    backgroundService,
    join,
    takeOver,
    giveBack,
    leave: () => void leave('user'),
  };
}

const messageFor = (kind: ConsoleError) => consoleErrorMessage(kind);
