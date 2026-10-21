import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Languages, ArrowLeft, Mic, MicOff, Headphones, Users, Radio, AlertTriangle, LogOut } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import { toast } from '../../lib/toast';
import { tr, trPlural } from '../../i18n';
import { callFn } from '../Komunikator/calls/callApi';
import { loadLivekit, mediaFailure } from '../Komunikator/calls/livekit';
import { STATS_POLL_MS, retryDelay, parseRoomMeta, consoleState, interpErrorState, staffLabel } from './interpretationLogic';
import { useWakeLock, useLevelMeter, createAudioBox, attachTrack, detachTrack, audioInputs } from './media';
import { LevelMeter, InputSelect, VolumeSlider } from './controls';
import './interpretation.css';

// Konsola tłumacza: /tlumaczenie/konsola/<id wydarzenia> (zalogowany przypisany tłumacz albo
// zarządzający). Dwa pokoje LiveKit: kanał językowy (mój mikrofon + partner na zmianie) i
// „Oryginał” (nagłośnienie z miksera, tylko odsłuch). Mikrofon otwarty tylko u aktywnego tłumacza
// (metadane pokoju {active}); „Przejmij mikrofon” wycisza poprzedniego także na serwerze.

const MIC_KEY = 'avenit.interp.mic';
const readMic = () => { try { return localStorage.getItem(MIC_KEY) || ''; } catch { return ''; } };
const writeMic = (v) => { try { localStorage.setItem(MIC_KEY, v); } catch { /* ignore */ } };
const roomOpts = { adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true };

function micMessage(failure) {
  if (failure === 'PermissionDenied') return tr('Przeglądarka nie ma dostępu do mikrofonu. Zezwól na mikrofon w ustawieniach strony i spróbuj ponownie.');
  if (failure === 'NotFound') return tr('Nie znaleziono mikrofonu. Podłącz mikrofon albo słuchawki z mikrofonem.');
  if (failure === 'DeviceInUse') return tr('Mikrofon jest używany przez inną aplikację. Zamknij ją i spróbuj ponownie.');
  return tr('Nie udało się włączyć mikrofonu.');
}

export default function InterpreterConsole() {
  const { eventId } = useParams();
  const [view, setView] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [channelId, setChannelId] = useState(null);
  const [phase, setPhase] = useState('setup'); // setup | joining | on | reconnecting
  const [error, setError] = useState('');
  const [me, setMe] = useState('');
  const [active, setActive] = useState(null);
  const [selfMuted, setSelfMuted] = useState(false);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(readMic);
  const [mst, setMst] = useState(null);
  const [origVol, setOrigVol] = useState(0.9);
  const [partnerVol, setPartnerVol] = useState(0.8);
  const [origOn, setOrigOn] = useState(null); // null — bez Oryginału, false — cisza, true — nadaje
  const [present, setPresent] = useState([]); // inni tłumacze w pokoju kanału
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);

  const lkRef = useRef(null);
  const roomRef = useRef(null);
  const origRef = useRef(null);
  const micRef = useRef(null);
  const boxRef = useRef(null);
  const leavingRef = useRef(false);
  const attemptRef = useRef(0);
  const retryRef = useRef(null);
  const meRef = useRef('');
  const vols = useRef({ origVol, partnerVol });
  vols.current = { origVol, partnerVol };
  const activeRef = useRef(active);
  activeRef.current = active;

  const level = useLevelMeter(phase === 'on' || phase === 'reconnecting' ? mst : null);
  useWakeLock(phase === 'on' || phase === 'reconnecting');

  const load = useCallback(async () => {
    try {
      const r = await callFn('interp-session-get', { event_id: eventId });
      setView(r);
      setLoadError(null);
      const usable = (r.session?.channels || []).filter((c) => c.mine || r.can_manage);
      setChannelId((cur) => cur || usable.find((c) => c.mine)?.id || usable[0]?.id || null);
    } catch (err) {
      setLoadError(interpErrorState(err));
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const channels = (view?.session?.channels || []).filter((c) => c.mine || view?.can_manage);
  const channel = channels.find((c) => c.id === channelId) || null;

  // Głośności odsłuchu — na bieżąco.
  useEffect(() => {
    origRef.current?.remoteParticipants?.forEach?.((p) => p.audioTrackPublications?.forEach?.((pub) => pub.track?.setVolume?.(origVol)));
  }, [origVol]);
  useEffect(() => {
    roomRef.current?.remoteParticipants?.forEach?.((p) => p.audioTrackPublications?.forEach?.((pub) => pub.track?.setVolume?.(partnerVol)));
  }, [partnerVol]);

  const refreshPresent = useCallback(() => {
    const room = roomRef.current;
    setPresent(room ? Array.from(room.remoteParticipants?.values?.() || []).map((p) => ({ id: p.identity, name: p.name || p.identity, speaking: !!p.isSpeaking })) : []);
  }, []);
  const refreshOriginal = useCallback(() => {
    const o = origRef.current;
    if (!o) { setOrigOn(null); return; }
    const on = Array.from(o.remoteParticipants?.values?.() || []).some((p) => Array.from(p.audioTrackPublications?.values?.() || []).some((pub) => !pub.isMuted));
    setOrigOn(on);
  }, []);

  const disconnectRooms = useCallback(async () => {
    const room = roomRef.current;
    const orig = origRef.current;
    roomRef.current = null;
    origRef.current = null;
    await Promise.all([room, orig].filter(Boolean).map((r) => r.disconnect(false).catch(() => {})));
    if (boxRef.current) { try { boxRef.current.remove(); } catch { /* ignore */ } boxRef.current = null; }
    setPresent([]);
    setOrigOn(null);
  }, []);

  // Mikrofon: jedna ścieżka na całą zmianę (po zerwaniu połączenia — nowa, jeśli zgasła).
  const ensureMic = useCallback(async (lk) => {
    const cur = micRef.current;
    if (cur && cur.mediaStreamTrack?.readyState !== 'ended') return cur;
    const track = await lk.createLocalAudioTrack({
      deviceId: deviceId || undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
    });
    micRef.current = track;
    setMst(track.mediaStreamTrack);
    setDevices(await audioInputs());
    return track;
  }, [deviceId]);

  const scheduleRejoin = useRef(null);

  const connectRooms = useCallback(async () => {
    const lk = lkRef.current || await loadLivekit();
    lkRef.current = lk;
    const mic = await ensureMic(lk);
    const res = await callFn('interp-interpreter-join', { channel_id: channelId });
    if (leavingRef.current) return;
    meRef.current = res.identity;
    setMe(res.identity);
    await disconnectRooms();
    boxRef.current = createAudioBox();
    const E = lk.RoomEvent;

    const room = new lk.Room(roomOpts);
    roomRef.current = room;
    room.on(E.RoomMetadataChanged, (m) => setActive(parseRoomMeta(m).active));
    room.on(E.TrackSubscribed, (track) => attachTrack(boxRef.current, track, vols.current.partnerVol));
    room.on(E.TrackUnsubscribed, (track) => detachTrack(track));
    [E.ParticipantConnected, E.ParticipantDisconnected, E.ActiveSpeakersChanged, E.ParticipantNameChanged].forEach((ev) => ev && room.on(ev, refreshPresent));
    room.on(E.Reconnecting, () => setPhase('reconnecting'));
    room.on(E.Reconnected, () => setPhase('on'));
    room.on(E.Disconnected, () => {
      if (roomRef.current !== room || leavingRef.current) return;
      roomRef.current = null;
      scheduleRejoin.current?.();
    });
    await room.connect(res.url, res.token, { autoSubscribe: true });
    room.startAudio().catch(() => {});
    const current = parseRoomMeta(room.metadata).active ?? res.channel?.active_interpreter_email ?? null;
    setActive(current);
    // Wyciszony PRZED publikacją, gdy nie jestem aktywny — bez chwili otwartego mikrofonu.
    if (current !== res.identity) await mic.mute().catch(() => {});
    await room.localParticipant.publishTrack(mic, {
      source: lk.Track.Source.Microphone, audioPreset: lk.AudioPresets?.speech, dtx: true, red: true, forceStereo: false,
    });
    refreshPresent();

    if (res.original?.token) {
      const orig = new lk.Room(roomOpts);
      origRef.current = orig;
      orig.on(E.TrackSubscribed, (track) => { attachTrack(boxRef.current, track, vols.current.origVol); refreshOriginal(); });
      orig.on(E.TrackUnsubscribed, (track) => { detachTrack(track); refreshOriginal(); });
      [E.ParticipantConnected, E.ParticipantDisconnected, E.TrackMuted, E.TrackUnmuted, E.TrackPublished, E.TrackUnpublished].forEach((ev) => ev && orig.on(ev, refreshOriginal));
      try {
        await orig.connect(res.url, res.original.token, { autoSubscribe: true });
        orig.startAudio().catch(() => {});
      } catch { /* Oryginał niedostępny — kanał działa dalej */ }
      refreshOriginal();
    }
    attemptRef.current = 0;
  }, [channelId, ensureMic, disconnectRooms, refreshPresent, refreshOriginal]);

  // Zerwane połączenie — ponawiamy z rosnącą przerwą, z nowym tokenem.
  scheduleRejoin.current = () => {
    if (leavingRef.current) return;
    setPhase('reconnecting');
    clearTimeout(retryRef.current);
    retryRef.current = setTimeout(async () => {
      try {
        await connectRooms();
        if (!leavingRef.current) setPhase('on');
      } catch (err) {
        const state = interpErrorState(err);
        if (state === 'ended' || state === 'forbidden' || state === 'not_found') {
          leavingRef.current = true;
          await disconnectRooms();
          setPhase('setup');
          setError(state === 'ended' ? tr('Tłumaczenie zostało zakończone.') : tr('Nie masz już dostępu do tego kanału.'));
          return;
        }
        attemptRef.current += 1;
        scheduleRejoin.current?.();
      }
    }, retryDelay(attemptRef.current));
  };

  const join = async () => {
    if (!channelId) return;
    setBusy(true);
    setError('');
    leavingRef.current = false;
    setPhase('joining');
    try {
      await connectRooms();
      setPhase('on');
    } catch (err) {
      await disconnectRooms();
      setPhase('setup');
      if (err?.name && /NotAllowed|NotFound|NotReadable|Overconstrained|Security/.test(err.name)) {
        setError(micMessage(mediaFailure(lkRef.current, err)));
      } else {
        const state = interpErrorState(err);
        setError(state === 'ended' ? tr('Tłumaczenie zostało zakończone. Organizator może je wznowić na stronie wydarzenia.')
          : state === 'forbidden' ? tr('Do konsoli tego kanału wchodzi przypisany tłumacz.')
            : state === 'disabled' ? tr('Połączenia audio nie są włączone na tym serwerze.')
              : (err?.context?.error || tr('Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.')));
      }
    } finally {
      setBusy(false);
    }
  };

  // Mikrofon otwarty tylko u aktywnego tłumacza (i bez chwilowego wyciszenia).
  useEffect(() => {
    const t = micRef.current;
    if (!t || phase !== 'on') return;
    const open = !!active && active === meRef.current && !selfMuted;
    (open ? t.unmute() : t.mute()).catch(() => {});
  }, [active, selfMuted, phase]);

  // Licznik słuchaczy (co 10 s, gdy karta widoczna).
  useEffect(() => {
    if (phase !== 'on' && phase !== 'reconnecting') return undefined;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      try { const s = await callFn('interp-stats', { event_id: eventId }); if (alive) setStats(s); } catch { /* następnym razem */ }
    };
    tick();
    const t = setInterval(tick, STATS_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [phase, eventId]);

  const state = consoleState({ me, active, micMuted: selfMuted });

  // Zamknięcie karty w trakcie nadawania — ostrzeżenie przeglądarki.
  useEffect(() => {
    if (state !== 'on_air' && state !== 'muted') return undefined;
    const onBefore = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [state]);

  const leave = useCallback(async ({ silent = false } = {}) => {
    leavingRef.current = true;
    clearTimeout(retryRef.current);
    if (activeRef.current && activeRef.current === meRef.current && channelId) {
      callFn('interp-release', { channel_id: channelId }).catch(() => {});
    }
    await disconnectRooms();
    try { micRef.current?.stop(); } catch { /* ignore */ }
    micRef.current = null;
    setMst(null);
    setActive(null);
    setSelfMuted(false);
    if (!silent) setPhase('setup');
  }, [channelId, disconnectRooms]);

  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => () => { leaveRef.current({ silent: true }); }, []);

  const takeOver = async () => {
    setBusy(true);
    try {
      const r = await callFn('interp-take-over', { channel_id: channelId });
      setSelfMuted(false);
      setActive(r.channel?.active_interpreter_email || meRef.current);
    } catch (err) {
      toast.error(err?.context?.error || tr('Nie udało się przejąć mikrofonu.'));
    } finally {
      setBusy(false);
    }
  };
  const giveBack = async () => {
    setBusy(true);
    try {
      await callFn('interp-release', { channel_id: channelId });
      setActive(null);
    } catch (err) {
      toast.error(err?.context?.error || tr('Nie udało się oddać mikrofonu.'));
    } finally {
      setBusy(false);
    }
  };

  const changeDevice = async (id) => {
    setDeviceId(id);
    writeMic(id);
    const t = micRef.current;
    if (!t) return;
    try {
      await t.setDeviceId(id);
      setMst(t.mediaStreamTrack);
    } catch (err) {
      setError(micMessage(mediaFailure(lkRef.current, err)));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const header = (
    <PageHeader icon={Languages} title={tr('Konsola tłumacza')} subtitle={view?.event?.title || ''} cover={false}
      actions={<Link to={`/wydarzenie/${encodeURIComponent(eventId)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:underline"><ArrowLeft size={15} aria-hidden="true" /> {tr('Wydarzenie')}</Link>} />
  );
  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        {header}
        <EmptyState icon={Languages} title={loadError === 'not_found' ? tr('Nie znaleziono wydarzenia') : tr('Nie udało się wczytać tłumaczenia')}
          subtitle={loadError === 'not_found' ? tr('Wydarzenie nie istnieje albo nie masz do niego dostępu.') : tr('Sprawdź internet i odśwież stronę.')} />
      </div>
    );
  }
  if (!view) return <Spinner center />;
  if (!view.session || !channels.length) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        {header}
        <EmptyState icon={Languages} title={tr('Nie jesteś tłumaczem tego wydarzenia')}
          subtitle={view.session ? tr('Poproś lidera służby Tłumaczenia o przypisanie w Grafiku albo w karcie wydarzenia.') : tr('To wydarzenie nie ma jeszcze tłumaczenia na żywo.')} />
      </div>
    );
  }

  const listeners = stats?.channels?.find((c) => c.id === channelId)?.listeners;
  const holderName = active && active !== me
    ? (present.find((p) => p.id === active)?.name || channel?.interpreters?.find((i) => i.email === active)?.name || active)
    : null;
  const connected = phase === 'on' || phase === 'reconnecting';
  const ended = view.session.status === 'ended';
  const card = 'bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {header}

      {channels.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={tr('Kanał')}>
          {channels.map((c) => (
            <button key={c.id} type="button" disabled={connected || phase === 'joining'} aria-pressed={c.id === channelId}
              onClick={() => setChannelId(c.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors disabled:opacity-60 ${c.id === channelId ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`}>
              {staffLabel(c)}
            </button>
          ))}
        </div>
      )}

      <section className={card} aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[10rem]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{tr('Kanał')}</p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{channel ? staffLabel(channel) : ''}</p>
            {channel?.label && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Słuchacze widzą:')} <span lang={channel.lang_code} className="font-medium">{channel.label}</span></p>
            )}
          </div>
          {connected && state === 'on_air' && <span className="ip-onair">{tr('Na żywo')}</span>}
          {connected && state !== 'on_air' && <span className="ip-onair ip-onair--off">{state === 'muted' ? tr('Wyciszony') : tr('Mikrofon wyłączony')}</span>}
          {connected && (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300" title={tr('Słuchacze tego kanału')}>
              <Users size={16} aria-hidden="true" />
              {listeners == null ? '—' : trPlural(listeners, '{n} słuchacz', '{n} słuchaczy', '{n} słuchaczy')}
            </span>
          )}
        </div>

        {phase === 'reconnecting' && <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300">{tr('Łączenie ponownie…')}</p>}

        {connected && state === 'locked' && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            {tr('Mikrofon zablokowany — teraz tłumaczy {name}. Naciśnij „Przejmij mikrofon”, gdy będziesz gotowy(a).', { name: holderName })}
          </p>
        )}
        {connected && state === 'free' && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">{tr('Nikt teraz nie tłumaczy. Słuchacze usłyszą Cię po naciśnięciu „Przejmij mikrofon”.')}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!connected ? (
            <Button icon={Headphones} size="lg" onClick={join} loading={busy || phase === 'joining'} disabled={ended}>
              {tr('Dołącz do kanału')}
            </Button>
          ) : (state === 'on_air' || state === 'muted') ? (
            <>
              <Button variant="outline" size="lg" icon={selfMuted ? Mic : MicOff} onClick={() => setSelfMuted((m) => !m)}>
                {selfMuted ? tr('Włącz mikrofon') : tr('Wycisz na chwilę')}
              </Button>
              <Button variant="secondary" size="lg" onClick={giveBack} loading={busy}>{tr('Oddaj mikrofon')}</Button>
            </>
          ) : (
            <Button icon={Mic} size="lg" onClick={takeOver} loading={busy} disabled={phase === 'reconnecting'}>{tr('Przejmij mikrofon')}</Button>
          )}
          {connected && <Button variant="ghost" size="lg" icon={LogOut} onClick={() => leave()}>{tr('Zakończ zmianę')}</Button>}
        </div>
        {ended && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{tr('Tłumaczenie zostało zakończone. Organizator może je wznowić na stronie wydarzenia.')}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>

      <section className={card}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3"><Mic size={16} className="text-accent-primary" aria-hidden="true" /> {tr('Mikrofon')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputSelect id="ic-mic" label={tr('Wejście')} devices={devices} value={deviceId} onChange={changeDevice} disabled={!devices.length} />
          <LevelMeter level={connected ? level : 0} />
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{tr('Używaj słuchawek — dźwięk z głośnika wraca do mikrofonu i słuchacze słyszą echo.')}</p>
      </section>

      <section className={card}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3"><Headphones size={16} className="text-accent-primary" aria-hidden="true" /> {tr('Odsłuch')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <VolumeSlider id="ic-orig" label={tr('Oryginał (nagłośnienie)')} value={origVol} onChange={setOrigVol} disabled={origOn === null} />
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Radio size={12} aria-hidden="true" />
              {!view.session.original_enabled ? tr('Kanał „Oryginał” jest wyłączony.')
                : !connected ? tr('Usłyszysz go po dołączeniu.')
                  : origOn ? tr('Oryginał nadaje.') : tr('Oryginał jeszcze nie nadaje.')}
            </p>
          </div>
          <div>
            <VolumeSlider id="ic-partner" label={tr('Partner na kanale')} value={partnerVol} onChange={setPartnerVol} />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {present.length ? present.map((p) => p.name).join(', ') : tr('Nikogo więcej na kanale.')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
