import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Loader2, WifiOff, Volume2, Users } from 'lucide-react';
import { tr } from '../../../../i18n';
import { callFn } from '../callApi';
import useCallRoom from '../useCallRoom';
import CallStage from '../CallStage';
import CallControls from '../CallControls';
import { QualityIcon } from '../ParticipantTile';
import { MediaHelp, useNow } from '../CallWindow';
import { formatClock } from '../callLogic';
import { mediaFailure } from '../livekit';
import { GUEST_POLL_MS, guestErrorState, guestStateMessage } from '../guestLogic';
import './guestCall.css';

// Publiczna strona gościa rozmowy: /rozmowa/<token> (bez logowania, tenant z adresu).
//   formularz (imię + podgląd kamery/mikrofonu) → „Poproś o dołączenie” → poczekalnia
//   („Czekasz na wpuszczenie…”) → rozmowa (te same komponenty co w aplikacji, bez czatu)
//   albo stan końcowy (odrzucono / link wygasł / rozmowa zakończona…).
// Prośba (id + sekret) w sessionStorage — odświeżenie strony wraca do poczekalni/rozmowy.

const MARK = '/brand/avenit-znak-kurkuma.png';
const storeKey = (token) => `avenit.guest.${token}`;
function readStored(token) {
  try {
    const v = JSON.parse(sessionStorage.getItem(storeKey(token)) || 'null');
    return v && v.request_id && v.secret ? v : null;
  } catch { return null; }
}
function writeStored(token, value) {
  try {
    if (value) sessionStorage.setItem(storeKey(token), JSON.stringify(value));
    else sessionStorage.removeItem(storeKey(token));
  } catch { /* prywatne okno — tylko w pamięci */ }
}

// Zamknięcie karty w poczekalni: rezygnacja (prośba znika u osób w rozmowie). keepalive — żądanie
// przeżywa zamknięcie strony.
function leaveOnUnload(body) {
  try {
    const base = import.meta.env.VITE_API_URL || '';
    const headers = { 'Content-Type': 'application/json' };
    if (import.meta.env.VITE_TENANT) headers['X-Tenant'] = import.meta.env.VITE_TENANT;
    fetch(`${base}/api/fn/call-guest-leave`, { method: 'POST', headers, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}

// Podgląd kamery i mikrofonu przed wejściem (strumień zwalniany przy wyjściu z ekranu).
export function DevicePreview({ prefs, onToggle, name }) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    if (!md?.getUserMedia || (!prefs.cam && !prefs.mic)) { setStream(null); return undefined; }
    let cancelled = false;
    let own = null;
    md.getUserMedia({ video: prefs.cam ? { facingMode: 'user' } : false, audio: !!prefs.mic })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        own = s;
        setStream(s);
        setFailure(null);
      })
      .catch((err) => { if (!cancelled) { setStream(null); setFailure(mediaFailure(null, err)); } });
    return () => {
      cancelled = true;
      own?.getTracks().forEach((t) => t.stop());
    };
  }, [prefs.cam, prefs.mic]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) { try { el.srcObject = stream; } catch { /* ignore */ } }
  }, [stream]);

  const showVideo = prefs.cam && stream && stream.getVideoTracks().length > 0;
  const initial = (String(name || '').trim()[0] || '?').toUpperCase();
  return (
    <div>
      <div className="gc-preview">
        {showVideo
          ? <video ref={videoRef} autoPlay playsInline muted aria-label={tr('Podgląd kamery')} />
          : (
            <div className="gc-preview-off">
              <span className="gc-initial" aria-hidden="true">{initial}</span>
              <span>{!prefs.cam ? tr('Kamera wyłączona') : failure ? tr('Kamera niedostępna') : tr('Włączanie kamery…')}</span>
            </div>
          )}
        <div className="gc-preview-bar" role="group" aria-label={tr('Urządzenia')}>
          <button type="button" className="gc-round" aria-pressed={prefs.mic} onClick={() => onToggle('mic')}
            aria-label={prefs.mic ? tr('Wycisz mikrofon') : tr('Włącz mikrofon')} title={prefs.mic ? tr('Wycisz mikrofon') : tr('Włącz mikrofon')}>
            {prefs.mic ? <Mic size={20} aria-hidden="true" /> : <MicOff size={20} aria-hidden="true" />}
          </button>
          <button type="button" className="gc-round" aria-pressed={prefs.cam} onClick={() => onToggle('cam')}
            aria-label={prefs.cam ? tr('Wyłącz kamerę') : tr('Włącz kamerę')} title={prefs.cam ? tr('Wyłącz kamerę') : tr('Włącz kamerę')}>
            {prefs.cam ? <Video size={20} aria-hidden="true" /> : <VideoOff size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {failure === 'PermissionDenied' && (
        <p className="gc-hint" style={{ marginTop: 10 }}>
          {tr('Przeglądarka blokuje kamerę lub mikrofon. Kliknij ikonę kłódki obok adresu strony i zezwól na dostęp — możesz też dołączyć bez nich.')}
        </p>
      )}
      {failure && failure !== 'PermissionDenied' && (
        <p className="gc-hint" style={{ marginTop: 10 }}>{tr('Nie udało się włączyć kamery lub mikrofonu. Możesz dołączyć bez nich.')}</p>
      )}
    </div>
  );
}

// Rozmowa gościa: ciemne okno jak w aplikacji, bez czatu i bez linków do rozmowy.
function GuestCallView({ room, heading, startedAt, onLeave }) {
  const { snapshot } = room;
  const now = useNow(true);
  const reconnecting = snapshot.connectionState === 'reconnecting' || snapshot.connectionState === 'signalReconnecting';
  const local = snapshot.participants.find((p) => p.isLocal);
  return (
    <div className="fixed inset-0 flex flex-col bg-gray-950 text-white" role="main" aria-label={heading}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        <img src={MARK} alt="" className="w-7 h-7 shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{heading}</h1>
          <p className="text-xs text-white/70 tabular-nums flex items-center gap-2">
            <span>{reconnecting ? tr('Łączenie ponownie…') : (startedAt ? formatClock(now - startedAt) : '')}</span>
            {snapshot.participants.length > 2 && (
              <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden="true" />{snapshot.participants.length}</span>
            )}
            {local && <QualityIcon quality={local.quality} size={12} />}
          </p>
        </div>
      </header>
      {reconnecting && (
        <div role="status" className="mx-3 sm:mx-4 mt-3 flex items-center gap-2 rounded-2xl bg-amber-400/15 px-4 py-2.5 text-sm text-amber-100">
          <WifiOff size={16} aria-hidden="true" /> {tr('Słabe połączenie — łączę ponownie…')}
        </div>
      )}
      {!snapshot.canPlaybackAudio && (
        <div className="mx-3 sm:mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2.5 text-sm">
          <Volume2 size={16} aria-hidden="true" />
          <span className="flex-1">{tr('Przeglądarka wstrzymała dźwięk rozmowy.')}</span>
          <button type="button" onClick={room.startAudio} className="font-semibold underline underline-offset-2">{tr('Włącz dźwięk')}</button>
        </div>
      )}
      <MediaHelp error={snapshot.mediaError} onRetry={room.retryMedia} onDismiss={room.clearMediaError} />
      {snapshot.participants.length === 0
        ? <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" aria-hidden="true" /></div>
        : <CallStage snapshot={snapshot} />}
      <CallControls room={room} local={snapshot.local} canPublish={snapshot.canPublish} onLeave={onLeave} leaveLabel={tr('Opuść rozmowę')} />
    </div>
  );
}

export default function GuestCallPage() {
  const { token } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | form | waiting | connecting | call | final
  const [finalState, setFinalState] = useState(null);
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const [waiting, setWaiting] = useState('admission'); // admission | host
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [prefs, setPrefs] = useState({ mic: true, cam: true });
  const [startedAt, setStartedAt] = useState(null);
  const reqRef = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const finish = useCallback((state, { clear = true } = {}) => {
    if (clear) { writeStored(token, null); reqRef.current = null; }
    setFinalState(state);
    setPhase('final');
  }, [token]);

  const onDisconnectedRef = useRef(null);
  const room = useCallRoom({ onDisconnected: () => onDisconnectedRef.current?.() });
  const roomRef = useRef(room);
  roomRef.current = room;

  // Start: informacje o linku; zapisana prośba (odświeżenie strony) — od razu poczekalnia.
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = readStored(token);
      let inf = null;
      let infErr = null;
      try { inf = await callFn('call-guest-info', { token }); } catch (err) { infErr = err; }
      if (!alive) return;
      if (inf) {
        setInfo(inf);
        if (inf.kind === 'audio') setPrefs((p) => ({ ...p, cam: false }));
      }
      if (stored) {
        reqRef.current = stored;
        setName(stored.name || '');
        setPhase('waiting');
        return;
      }
      if (infErr) { finish(guestErrorState(infErr)); return; }
      setPhase('form');
    })();
    return () => { alive = false; };
  }, [token, finish]);

  const connect = useCallback(async (res) => {
    setPhase('connecting');
    try {
      await roomRef.current.connect({ url: res.url, token: res.token, video: prefsRef.current.cam, audio: prefsRef.current.mic, canPublish: true });
      if (phaseRef.current !== 'connecting') return;
      setStartedAt(Date.now());
      setPhase('call');
    } catch {
      await roomRef.current.disconnect();
      finish('error', { clear: false });
    }
  }, [finish]);

  // Poczekalnia: odpytywanie stanu prośby, aż ktoś wpuści / odrzuci.
  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    let alive = true;
    let timer = null;
    const tick = async () => {
      const req = reqRef.current;
      if (!req) return;
      try {
        const res = await callFn('call-guest-status', { request_id: req.request_id, secret: req.secret });
        if (!alive) return;
        if (res.status === 'admitted' && res.token) { connect(res); return; }
        if (res.status === 'pending' || res.status === 'admitted') {
          setWaiting(res.status === 'admitted' ? 'host' : 'admission');
        } else if (res.status === 'left') {
          // Wyszedł wcześniej (np. zamknięta karta w poczekalni) — można poprosić ponownie.
          writeStored(token, null);
          reqRef.current = null;
          if (info) setPhase('form'); else finish('left');
          return;
        } else {
          finish(res.status === 'denied' ? 'denied' : res.status === 'ended' ? 'ended' : 'expired');
          return;
        }
      } catch (err) {
        if (!alive) return;
        if (err?.status === 404) {
          writeStored(token, null);
          reqRef.current = null;
          if (info) setPhase('form'); else finish('not_found');
          return;
        }
        const state = guestErrorState(err);
        if (state !== 'error' && state !== 'busy') { finish(state); return; }
        // Sieć / chwilowy błąd — próbujemy dalej.
      }
      timer = setTimeout(tick, GUEST_POLL_MS);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [phase, token, info, connect, finish]);

  // Zamknięcie karty w poczekalni (jeszcze niewpuszczony) — rezygnacja.
  useEffect(() => {
    const onHide = () => {
      const req = reqRef.current;
      if (req && phaseRef.current === 'waiting') leaveOnUnload({ request_id: req.request_id, secret: req.secret });
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // Rozłączenie z zewnątrz (koniec rozmowy, wyłączony link) — stan z serwera.
  onDisconnectedRef.current = async () => {
    if (phaseRef.current !== 'call' && phaseRef.current !== 'connecting') return;
    const req = reqRef.current;
    let state = 'ended';
    if (req) {
      try {
        const res = await callFn('call-guest-status', { request_id: req.request_id, secret: req.secret });
        if (res.status === 'expired') state = 'expired';
        if (res.status === 'admitted' && res.token) { connect(res); return; }
      } catch { /* zostaje „zakończona” */ }
    }
    finish(state);
  };

  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) { setFormError(tr('Podaj swoje imię.')); return; }
    setFormError('');
    setSubmitting(true);
    try {
      const res = await callFn('call-guest-request', { token, name: clean });
      const stored = { request_id: res.request_id, secret: res.secret, name: res.name || clean };
      reqRef.current = stored;
      writeStored(token, stored);
      setName(stored.name);
      setWaiting(res.status === 'admitted' ? 'host' : 'admission');
      setPhase('waiting');
    } catch (err) {
      const state = guestErrorState(err);
      if (err?.code === 'BAD_NAME') setFormError(tr('Podaj swoje imię (do 60 znaków).'));
      else if (state === 'busy') setFormError(guestStateMessage('busy').body);
      else if (state === 'error') setFormError(tr('Nie udało się wysłać prośby. Sprawdź internet i spróbuj ponownie.'));
      else finish(state);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelWaiting = async () => {
    const req = reqRef.current;
    writeStored(token, null);
    reqRef.current = null;
    setPhase('form');
    if (req) callFn('call-guest-leave', { request_id: req.request_id, secret: req.secret }).catch(() => {});
  };

  const leaveCall = async () => {
    const req = reqRef.current;
    setPhase('final');
    await roomRef.current.disconnect();
    if (req) callFn('call-guest-leave', { request_id: req.request_id, secret: req.secret }).catch(() => {});
    finish('left');
  };

  const church = info?.church_name || '';
  const heading = info?.title || (church ? tr('Rozmowa w {church}', { church }) : tr('Rozmowa'));
  const togglePref = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  if (phase === 'call') return <GuestCallView room={room} heading={heading} startedAt={startedAt} onLeave={leaveCall} />;

  let content;
  if (phase === 'loading') {
    content = <div className="gc-wait" role="status"><span className="gc-wait-dot" aria-hidden="true" /><p className="gc-wait-title">{tr('Wczytywanie…')}</p></div>;
  } else if (phase === 'final') {
    const msg = guestStateMessage(finalState);
    const canRetry = finalState === 'error' || finalState === 'left' || finalState === 'ended';
    content = (
      <>
        <div className="gc-head">
          <h1 className="gc-title">{msg.title}</h1>
          <p className="gc-sub">{msg.body}</p>
        </div>
        {canRetry && info && (
          <button type="button" className="gc-ghost" onClick={() => setPhase(reqRef.current ? 'waiting' : 'form')}>
            {finalState === 'error' ? tr('Spróbuj ponownie') : tr('Dołącz ponownie')}
          </button>
        )}
      </>
    );
  } else if (phase === 'waiting' || phase === 'connecting') {
    content = (
      <>
        <div className="gc-head">
          <h1 className="gc-title">{heading}</h1>
        </div>
        <DevicePreview prefs={prefs} onToggle={togglePref} name={name} />
        <div className="gc-wait" role="status" aria-live="polite">
          <span className="gc-wait-dot" aria-hidden="true" />
          <div>
            <p className="gc-wait-title">
              {phase === 'connecting' ? tr('Łączenie…') : waiting === 'host' ? tr('Czekasz na rozpoczęcie rozmowy…') : tr('Czekasz na wpuszczenie…')}
            </p>
            <p className="gc-wait-sub">
              {phase === 'connecting' ? tr('Za chwilę dołączysz do rozmowy.')
                : waiting === 'host' ? tr('Dołączysz automatycznie, gdy ktoś z rozmowy będzie w połączeniu.')
                  : tr('Ktoś z rozmowy zobaczy Twoją prośbę i Cię wpuści.')}
            </p>
          </div>
        </div>
        {phase === 'waiting' && <button type="button" className="gc-ghost" onClick={cancelWaiting}>{tr('Zrezygnuj')}</button>}
      </>
    );
  } else {
    content = (
      <>
        <div className="gc-head">
          <h1 className="gc-title">{heading}</h1>
          <p className="gc-sub">{tr('Zaproszono Cię do rozmowy audio/wideo. Podaj imię, sprawdź kamerę i mikrofon, a potem poproś o dołączenie.')}</p>
        </div>
        <DevicePreview prefs={prefs} onToggle={togglePref} name={name} />
        <form className="gc-form" onSubmit={submit} noValidate>
          <label className="gc-label" htmlFor="gc-name">{tr('Twoje imię')}</label>
          <input
            id="gc-name"
            className="gc-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="given-name"
            placeholder={tr('np. Anna Kowalska')}
            aria-invalid={formError ? 'true' : undefined}
            aria-describedby={formError ? 'gc-name-err' : 'gc-name-hint'}
          />
          <p id="gc-name-hint" className="gc-hint">{tr('Tak zobaczą Cię osoby w rozmowie.')}</p>
          {formError && <p id="gc-name-err" className="gc-msg gc-msg--error" role="alert">{formError}</p>}
          <button type="submit" className="gc-cta" disabled={submitting}>
            {submitting && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
            {info?.auto_admit ? tr('Dołącz do rozmowy') : tr('Poproś o dołączenie')}
          </button>
        </form>
      </>
    );
  }

  return (
    <div className="gc-root">
      <main className="gc-card">
        <div className="gc-top">
          <img src={MARK} alt="" className="gc-mark" />
          <span className="gc-eyebrow">{church || 'Avenit'}</span>
        </div>
        {content}
        <p className="gc-foot">{tr('Gość widzi tylko tę rozmowę — bez czatu i innych danych.')}</p>
      </main>
    </div>
  );
}
