import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Radio, ArrowLeft, Square, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import { tr } from '../../i18n';
import { callFn } from '../Komunikator/calls/callApi';
import { loadLivekit, mediaFailure } from '../Komunikator/calls/livekit';
import { retryDelay, interpErrorState } from './interpretationLogic';
import { useWakeLock, useLevelMeter, audioInputs } from './media';
import { LevelMeter, InputSelect } from './controls';
import './interpretation.css';

// Nadawanie kanału „Oryginał”: /tlumaczenie/oryginal/<id wydarzenia>. Komputer przy stole
// akustyka z wejściem z miksera (karta USB) — tłumacze słyszą nagłośnienie w konsoli, czysto,
// bez pogłosu sali. Bez obróbki mowy (echo/szumy/AGC wyłączone) i z jakością „muzyka” — to sygnał
// z miksera, nie mikrofon w laptopie. Słyszą go tylko tłumacze (nie słuchacze).

const IN_KEY = 'avenit.interp.original-input';
const readIn = () => { try { return localStorage.getItem(IN_KEY) || ''; } catch { return ''; } };
const writeIn = (v) => { try { localStorage.setItem(IN_KEY, v); } catch { /* ignore */ } };

const captureOpts = (deviceId, stereo) => ({
  deviceId: deviceId || undefined,
  echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false,
  channelCount: stereo ? 2 : 1,
});

export default function OriginalBroadcastPage() {
  const { eventId } = useParams();
  const [view, setView] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(readIn);
  const [stereo, setStereo] = useState(false);
  const [mst, setMst] = useState(null);
  const [phase, setPhase] = useState('setup'); // setup | preview | starting | live | reconnecting
  const [error, setError] = useState('');
  const [since, setSince] = useState(null);
  const [, setTick] = useState(0);

  const lkRef = useRef(null);
  const trackRef = useRef(null);
  const roomRef = useRef(null);
  const leavingRef = useRef(false);
  const attemptRef = useRef(0);
  const retryRef = useRef(null);

  const level = useLevelMeter(mst);
  useWakeLock(phase === 'live' || phase === 'reconnecting');

  useEffect(() => {
    callFn('interp-session-get', { event_id: eventId })
      .then((r) => { setView(r); setLoadError(null); })
      .catch((err) => setLoadError(interpErrorState(err)));
  }, [eventId]);

  useEffect(() => {
    if (phase !== 'live') return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const failMedia = (err) => {
    const f = mediaFailure(lkRef.current, err);
    setError(f === 'PermissionDenied' ? tr('Przeglądarka nie ma dostępu do wejścia audio. Zezwól na mikrofon w ustawieniach strony.')
      : f === 'NotFound' ? tr('Nie znaleziono wejścia audio. Podłącz kartę dźwiękową z miksera.')
        : tr('Nie udało się włączyć wejścia audio.'));
  };

  // Podgląd wejścia (poziom) — przed nadawaniem; ta sama ścieżka idzie potem na żywo.
  const openInput = useCallback(async (id = deviceId, st = stereo) => {
    const lk = lkRef.current || await loadLivekit();
    lkRef.current = lk;
    try { trackRef.current?.stop(); } catch { /* ignore */ }
    const track = await lk.createLocalAudioTrack(captureOpts(id, st));
    trackRef.current = track;
    setMst(track.mediaStreamTrack);
    setDevices(await audioInputs());
    return track;
  }, [deviceId, stereo]);

  const preview = async () => {
    setError('');
    try { await openInput(); setPhase('preview'); } catch (err) { failMedia(err); }
  };

  const connect = useCallback(async () => {
    const lk = lkRef.current || await loadLivekit();
    lkRef.current = lk;
    let track = trackRef.current;
    if (!track || track.mediaStreamTrack?.readyState === 'ended') track = await openInput();
    const res = await callFn('interp-original-join', { event_id: eventId });
    if (leavingRef.current) return;
    const room = new lk.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
    roomRef.current = room;
    const E = lk.RoomEvent;
    room.on(E.Reconnecting, () => setPhase('reconnecting'));
    room.on(E.Reconnected, () => setPhase('live'));
    room.on(E.Disconnected, () => {
      if (roomRef.current !== room || leavingRef.current) return;
      roomRef.current = null;
      retryFn.current?.();
    });
    await room.connect(res.url, res.token, { autoSubscribe: false });
    const P = lk.AudioPresets || {};
    await room.localParticipant.publishTrack(track, {
      source: lk.Track.Source.Microphone,
      audioPreset: stereo ? (P.musicHighQualityStereo || P.musicStereo) : (P.musicHighQuality || P.music),
      dtx: false, red: true, forceStereo: stereo,
    });
    attemptRef.current = 0;
  }, [eventId, openInput, stereo]);

  // Zerwane połączenie — ponawiamy z rosnącą przerwą (nowy token).
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const retryFn = useRef(null);
  retryFn.current = () => {
    if (leavingRef.current) return;
    setPhase('reconnecting');
    clearTimeout(retryRef.current);
    retryRef.current = setTimeout(async () => {
      try {
        await connectRef.current();
        if (!leavingRef.current) setPhase('live');
      } catch (err) {
        const s = interpErrorState(err);
        if (s === 'ended' || s === 'original_off' || s === 'forbidden') {
          leavingRef.current = true;
          setPhase('preview');
          setError(s === 'ended' ? tr('Tłumaczenie zostało zakończone.') : tr('Kanał „Oryginał” został wyłączony.'));
          return;
        }
        attemptRef.current += 1;
        retryFn.current?.();
      }
    }, retryDelay(attemptRef.current));
  };

  const start = async () => {
    setError('');
    leavingRef.current = false;
    setPhase('starting');
    try {
      await connect();
      setSince(Date.now());
      setPhase('live');
    } catch (err) {
      try { await roomRef.current?.disconnect(false); } catch { /* ignore */ }
      roomRef.current = null;
      setPhase(trackRef.current ? 'preview' : 'setup');
      if (err?.name && /NotAllowed|NotFound|NotReadable|Overconstrained|Security/.test(err.name)) { failMedia(err); return; }
      const s = interpErrorState(err);
      setError(s === 'original_off' ? tr('Kanał „Oryginał” jest wyłączony w ustawieniach tłumaczenia.')
        : s === 'ended' ? tr('Tłumaczenie zostało zakończone.')
          : s === 'forbidden' ? tr('Nadawać może organizator albo tłumacz tego wydarzenia.')
            : (err?.context?.error || tr('Nie udało się zacząć nadawania.')));
    }
  };

  const stop = useCallback(async ({ silent = false } = {}) => {
    leavingRef.current = true;
    clearTimeout(retryRef.current);
    const room = roomRef.current;
    roomRef.current = null;
    if (room) { try { await room.disconnect(false); } catch { /* ignore */ } }
    if (!silent) { setPhase(trackRef.current ? 'preview' : 'setup'); setSince(null); }
  }, []);

  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => {
    stopRef.current({ silent: true });
    try { trackRef.current?.stop(); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (phase !== 'live' && phase !== 'reconnecting') return undefined;
    const onBefore = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [phase]);

  const changeDevice = async (id) => {
    setDeviceId(id);
    writeIn(id);
    if (phase === 'live' || phase === 'reconnecting') {
      try { await trackRef.current?.restartTrack(captureOpts(id, stereo)); setMst(trackRef.current?.mediaStreamTrack); } catch (err) { failMedia(err); }
    } else if (trackRef.current) {
      try { await openInput(id, stereo); } catch (err) { failMedia(err); }
    }
  };
  const changeStereo = async (st) => {
    setStereo(st);
    if (trackRef.current && phase !== 'live' && phase !== 'reconnecting') {
      try { await openInput(deviceId, st); } catch (err) { failMedia(err); }
    }
  };

  const header = (
    <PageHeader icon={Radio} title={tr('Nadawanie oryginału')} subtitle={view?.event?.title || ''} cover={false}
      actions={<Link to={`/wydarzenie/${encodeURIComponent(eventId)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:underline"><ArrowLeft size={15} aria-hidden="true" /> {tr('Wydarzenie')}</Link>} />
  );
  if (loadError) {
    return <div className="max-w-3xl mx-auto px-4 py-6">{header}<EmptyState icon={Radio} title={tr('Nie udało się wczytać tłumaczenia')} subtitle={tr('Wydarzenie nie istnieje albo nie masz do niego dostępu.')} /></div>;
  }
  if (!view) return <Spinner center />;
  const allowed = view.can_manage || view.my_channels?.length > 0;
  if (!view.session || !allowed) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">{header}
        <EmptyState icon={Radio} title={!view.session ? tr('To wydarzenie nie ma jeszcze tłumaczenia na żywo') : tr('Brak dostępu')}
          subtitle={!view.session ? tr('Włącz tłumaczenie na stronie wydarzenia.') : tr('Nadawać może organizator albo tłumacz tego wydarzenia.')} />
      </div>
    );
  }
  const on = phase === 'live' || phase === 'reconnecting';
  const card = 'bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5';
  const elapsed = since ? Math.floor((Date.now() - since) / 1000) : 0;
  const clock = `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {header}
      {!view.session.original_enabled && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          {tr('Kanał „Oryginał” jest wyłączony. Włącz go w karcie „Tłumaczenie na żywo” na stronie wydarzenia.')}
        </p>
      )}
      <section className={card} aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[12rem] text-sm text-gray-700 dark:text-gray-200">
            {tr('Podłącz wyjście z miksera (np. przez kartę dźwiękową USB) i wybierz je poniżej. Tłumacze usłyszą nagłośnienie w swojej konsoli.')}
          </p>
          {on ? <span className="ip-onair">{phase === 'reconnecting' ? tr('Łączenie…') : `${tr('Na żywo')} ${clock}`}</span> : <span className="ip-onair ip-onair--off">{tr('Nie nadaje')}</span>}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <InputSelect id="ob-in" label={tr('Wejście audio')} devices={devices} value={deviceId} onChange={changeDevice} disabled={!devices.length} />
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{tr('Kanały')}</span>
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5" role="group" aria-label={tr('Kanały')}>
              {[[false, tr('Mono')], [true, tr('Stereo')]].map(([v, label]) => (
                <button key={label} type="button" aria-pressed={stereo === v} disabled={on} onClick={() => changeStereo(v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold disabled:opacity-60 ${stereo === v ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-300'}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4"><LevelMeter level={level} label={tr('Poziom sygnału z miksera')} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {phase === 'setup' && <Button variant="outline" onClick={preview}>{tr('Sprawdź wejście')}</Button>}
          {!on ? (
            <Button icon={Radio} onClick={start} loading={phase === 'starting'} disabled={!view.session.original_enabled || view.session.status === 'ended'}>{tr('Zacznij nadawać')}</Button>
          ) : (
            <Button variant="danger" icon={Square} onClick={() => stop()}>{tr('Zatrzymaj nadawanie')}</Button>
          )}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{tr('Nie zamykaj tej karty w trakcie nabożeństwa. Ekran komputera nie zgaśnie, póki nadajesz.')}</p>
      </section>
    </div>
  );
}
