import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Headphones, Volume2, VolumeX, WifiOff, Smartphone } from 'lucide-react';
import { tr, appLocale, useI18n, hasSavedLang } from '../../i18n';
import { LANGUAGES } from '../../i18n/languages';
import { callFn } from '../Komunikator/calls/callApi';
import { loadLivekit } from '../Komunikator/calls/livekit';
import {
  INFO_POLL_MS, INFO_POLL_LISTENING_MS, retryDelay, interpErrorState, listenerMessage, browserUiLang, defaultChannel,
} from './interpretationLogic';
import { useWakeLock, useMediaSession, isIOS, createAudioBox, attachTrack, detachTrack } from './media';
import './interpretation.css';

// Strona słuchacza tłumaczenia na żywo.
//   publiczna: /tlumaczenie/<token> (bez konta, tenant z adresu — link/QR z plakatu);
//   w aplikacji: /tlumaczenie/sluchaj/<id wydarzenia> (zalogowany, który widzi wydarzenie).
// Wybór języka → „Słuchaj” (gest odblokowuje dźwięk) → odsłuch kanału (ukryty słuchacz, tylko
// odbiór). Kanał jeszcze nie nadaje — czekamy i łączymy sami. Zerwane połączenie — ponawiamy.
// Ekran nie gaśnie (Wake Lock): w przeglądarce iPhone'a dźwięk cichnie po zablokowaniu ekranu.

const MARK = '/brand/avenit-znak-kurkuma.png';
const rememberKey = (key) => `avenit.interp.${key}`;
const readRemembered = (key) => { try { return localStorage.getItem(rememberKey(key)); } catch { return null; } };
const writeRemembered = (key, v) => { try { localStorage.setItem(rememberKey(key), v); } catch { /* prywatne okno */ } };

function sourceFor(params) {
  if (params.token) {
    return {
      key: params.token,
      info: () => callFn('interp-public-info', { token: params.token }),
      listen: (channelId) => callFn('interp-listen', { token: params.token, channel_id: channelId }),
      isPublic: true,
    };
  }
  return {
    key: `ev:${params.eventId}`,
    info: async () => {
      const r = await callFn('interp-session-get', { event_id: params.eventId });
      if (!r.session) { const e = new Error('not found'); e.status = 404; e.code = 'INTERP_NOT_FOUND'; throw e; }
      return {
        church_name: '',
        event: r.event,
        status: r.session.status,
        channels: r.session.status === 'ended' ? [] : r.session.channels.map((c) => ({ id: c.id, lang_code: c.lang_code, label: c.label, live: c.status === 'live' })),
      };
    },
    listen: (channelId) => callFn('interp-member-listen', { event_id: params.eventId, channel_id: channelId }),
    isPublic: false,
  };
}

function whenText(ev) {
  if (!ev?.date) return '';
  try {
    const at = ev.starts_at ? new Date(ev.starts_at) : new Date(`${String(ev.date).slice(0, 10)}T12:00:00`);
    const day = at.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    return ev.time ? `${day}, ${String(ev.time).slice(0, 5)}` : day;
  } catch {
    return '';
  }
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="ip-langs" role="group" aria-label={tr('Język strony')}>
      {LANGUAGES.map((l) => (
        <button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)} lang={l.code}>
          {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function ListenerPage() {
  const params = useParams();
  const src = useRef(sourceFor(params)).current;
  const { setLang } = useI18n();
  const [info, setInfo] = useState(null);
  const [fatal, setFatal] = useState(null); // stan końcowy: not_found / ended / unavailable / disabled
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | waiting | connecting | listening | reconnecting
  const [canPlay, setCanPlay] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [hint, setHint] = useState('');

  const roomRef = useRef(null);
  const boxRef = useRef(null);
  const lkRef = useRef(null);
  const leavingRef = useRef(false);
  const attemptRef = useRef(0);
  const retryRef = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const volRef = useRef({ volume, muted });
  volRef.current = { volume, muted };
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Język strony z przeglądarki (publiczna strona; wybór ręczny zapamiętuje przełącznik).
  useEffect(() => {
    if (src.isPublic && !hasSavedLang()) setLang(browserUiLang(navigator.languages || [navigator.language]), { persist: false });
  }, [src, setLang]);

  useEffect(() => { loadLivekit().then((lk) => { lkRef.current = lk; }).catch(() => {}); }, []);

  const applyVolume = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const { volume: v, muted: m } = volRef.current;
    room.remoteParticipants?.forEach?.((p) => p.audioTrackPublications?.forEach?.((pub) => {
      try { pub.track?.setVolume?.(m ? 0 : v); } catch { /* ignore */ }
    }));
  }, []);
  useEffect(() => { applyVolume(); }, [volume, muted, applyVolume]);

  const teardown = useCallback(async () => {
    clearTimeout(retryRef.current);
    const room = roomRef.current;
    roomRef.current = null;
    if (room) { try { await room.disconnect(true); } catch { /* ignore */ } }
    if (boxRef.current) { try { boxRef.current.remove(); } catch { /* ignore */ } boxRef.current = null; }
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      const r = await src.info();
      setInfo(r);
      if (r.status === 'ended') { setFatal('ended'); await teardown(); setPhase('idle'); }
      return r;
    } catch (err) {
      const state = interpErrorState(err);
      if (['not_found', 'ended', 'unavailable', 'disabled', 'forbidden'].includes(state)) {
        setFatal(state === 'forbidden' ? 'not_found' : state);
        await teardown();
        setPhase('idle');
      }
      return null;
    }
  }, [src, teardown]);

  // Połączenie z kanałem. fromGesture: room.startAudio() w tym samym kliknięciu (iOS/Safari).
  const connect = useCallback(async (channelId, { fromGesture = false } = {}) => {
    clearTimeout(retryRef.current);
    leavingRef.current = false;
    let lk = lkRef.current;
    let room = null;
    if (lk) {
      room = new lk.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
      if (fromGesture) room.startAudio().catch(() => {});
    }
    setPhase((p) => (p === 'listening' || p === 'reconnecting' ? 'reconnecting' : 'connecting'));
    let res;
    try {
      res = await src.listen(channelId);
    } catch (err) {
      const state = interpErrorState(err);
      if (state === 'not_live') { setPhase('waiting'); return; }
      if (['not_found', 'ended', 'unavailable', 'disabled'].includes(state)) { setFatal(state); setPhase('idle'); return; }
      // Sieć / chwilowy błąd — spróbuj ponownie.
      const delay = retryDelay(attemptRef.current++);
      setPhase('reconnecting');
      retryRef.current = setTimeout(() => { if (selectedRef.current === channelId && !leavingRef.current) connect(channelId); }, delay);
      return;
    }
    if (leavingRef.current || selectedRef.current !== channelId) return;
    if (!lk) { lk = await loadLivekit(); lkRef.current = lk; }
    if (!room) room = new lk.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
    await teardown();
    roomRef.current = room;
    boxRef.current = createAudioBox();
    const E = lk.RoomEvent;
    room.on(E.TrackSubscribed, (track) => {
      const { volume: v, muted: m } = volRef.current;
      attachTrack(boxRef.current, track, m ? 0 : v);
    });
    room.on(E.TrackUnsubscribed, (track) => detachTrack(track));
    room.on(E.AudioPlaybackStatusChanged, () => setCanPlay(room.canPlaybackAudio !== false));
    room.on(E.Reconnecting, () => setPhase('reconnecting'));
    room.on(E.SignalReconnecting, () => setPhase('reconnecting'));
    room.on(E.Reconnected, () => setPhase('listening'));
    room.on(E.Disconnected, () => {
      if (roomRef.current !== room) return;
      roomRef.current = null;
      if (leavingRef.current) return;
      // Zerwane (sieć, restart serwera, koniec tłumaczenia) — sprawdź stan i połącz ponownie.
      setPhase('reconnecting');
      const delay = retryDelay(attemptRef.current++);
      retryRef.current = setTimeout(async () => {
        const r = await loadInfo();
        if (!r || r.status === 'ended' || leavingRef.current) return;
        if (selectedRef.current === channelId) connect(channelId);
      }, delay);
    });
    try {
      await room.connect(res.url, res.token, { autoSubscribe: true });
    } catch {
      if (roomRef.current === room) roomRef.current = null;
      const delay = retryDelay(attemptRef.current++);
      setPhase('reconnecting');
      retryRef.current = setTimeout(() => { if (selectedRef.current === channelId && !leavingRef.current) connect(channelId); }, delay);
      return;
    }
    if (roomRef.current !== room) return;
    attemptRef.current = 0;
    room.remoteParticipants?.forEach?.((p) => p.audioTrackPublications?.forEach?.((pub) => {
      if (pub.track) attachTrack(boxRef.current, pub.track, volRef.current.muted ? 0 : volRef.current.volume);
    }));
    setCanPlay(room.canPlaybackAudio !== false);
    setPhase('listening');
  }, [src, teardown, loadInfo]);

  // Pierwsze wczytanie + domyślny język kanału.
  useEffect(() => {
    let alive = true;
    loadInfo().then((r) => {
      if (!alive || !r) return;
      const pick = defaultChannel(r.channels, { remembered: readRemembered(src.key), languages: navigator.languages || [navigator.language] });
      if (pick) setSelected((cur) => cur || pick);
    });
    return () => { alive = false; };
  }, [loadInfo, src]);

  // Odpytywanie stanu: co 10 s przed słuchaniem (czekamy na tłumacza), co 30 s w trakcie.
  useEffect(() => {
    if (fatal) return undefined;
    const ms = phase === 'listening' ? INFO_POLL_LISTENING_MS : INFO_POLL_MS;
    const t = setInterval(async () => {
      if (document.visibilityState === 'hidden' && phaseRef.current !== 'waiting') return;
      const r = await loadInfo();
      if (!r) return;
      const ch = r.channels.find((c) => c.id === selectedRef.current);
      if (phaseRef.current === 'waiting' && ch?.live) connect(ch.id);
    }, ms);
    return () => clearInterval(t);
  }, [phase, fatal, loadInfo, connect]);

  // Powrót sieci — od razu ponów.
  useEffect(() => {
    const on = () => {
      setOnline(true);
      if (phaseRef.current === 'reconnecting' && selectedRef.current) connect(selectedRef.current);
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [connect]);

  useEffect(() => () => { leavingRef.current = true; teardown(); }, [teardown]);

  const active = phase === 'listening' || phase === 'reconnecting' || phase === 'connecting' || phase === 'waiting';
  useWakeLock(active);
  const channel = info?.channels?.find((c) => c.id === selected) || null;

  const stop = useCallback(async () => {
    leavingRef.current = true;
    attemptRef.current = 0;
    setPhase('idle');
    await teardown();
  }, [teardown]);

  useMediaSession({
    active: phase === 'listening',
    title: channel ? `${channel.label} — ${tr('tłumaczenie na żywo')}` : tr('Tłumaczenie na żywo'),
    artist: info?.event?.title || '',
    album: info?.church_name || '',
    onPause: () => setMuted(true),
    onPlay: () => setMuted(false),
  });

  const listen = () => {
    if (!selected) { setHint(tr('Najpierw wybierz język.')); return; }
    setHint('');
    writeRemembered(src.key, selected);
    attemptRef.current = 0;
    connect(selected, { fromGesture: true });
  };

  const choose = (id) => {
    if (id === selected) return;
    setSelected(id);
    setHint('');
    writeRemembered(src.key, id);
    if (active) {
      selectedRef.current = id;
      attemptRef.current = 0;
      connect(id, { fromGesture: true });
    }
  };

  const unlock = async () => {
    try { await roomRef.current?.startAudio(); } catch { /* ignore */ }
    setCanPlay(roomRef.current?.canPlaybackAudio !== false);
  };

  const church = info?.church_name || '';
  const ios = isIOS();
  let body;
  if (fatal) {
    const msg = listenerMessage(fatal);
    body = (
      <div className="ip-head">
        <h1 className="ip-title">{msg.title}</h1>
        <p className="ip-sub">{msg.body}</p>
      </div>
    );
  } else if (!info) {
    body = <div className="ip-wait" role="status"><span className="ip-dot" aria-hidden="true" /><p className="ip-wait-title">{tr('Wczytywanie…')}</p></div>;
  } else {
    const when = whenText(info.event);
    body = (
      <>
        <div className="ip-head">
          <span className="ip-kicker"><Headphones size={15} aria-hidden="true" /> {tr('Tłumaczenie na żywo')}</span>
          <h1 className="ip-title">{info.event?.title || tr('Tłumaczenie na żywo')}</h1>
          {when && <p className="ip-sub">{when}</p>}
        </div>

        {info.channels.length === 0 ? (
          <p className="ip-msg ip-msg--info">{tr('Języki tłumaczenia nie zostały jeszcze dodane. Zajrzyj tu za chwilę.')}</p>
        ) : (
          <fieldset className="ip-channels">
            <legend className="ip-label">{tr('Wybierz język')}</legend>
            {info.channels.map((c) => (
              <label key={c.id} className="ip-channel" data-selected={selected === c.id ? 'true' : undefined}>
                <input type="radio" name="ip-channel" value={c.id} checked={selected === c.id} onChange={() => choose(c.id)} />
                <span className="ip-channel-name" lang={c.lang_code}>{c.label}</span>
                <span className={`ip-badge ${c.live ? 'ip-badge--live' : ''}`}>
                  {c.live ? tr('na żywo') : tr('jeszcze nie nadaje')}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {hint && <p className="ip-msg ip-msg--error" role="alert">{hint}</p>}

        {phase === 'idle' ? (
          <button type="button" className="ip-cta" onClick={listen} disabled={!info.channels.length}>
            <Headphones size={20} aria-hidden="true" /> {tr('Słuchaj')}
          </button>
        ) : (
          <>
            <div className="ip-wait" role="status" aria-live="polite">
              {phase === 'listening' ? <span className="ip-bars" aria-hidden="true"><i /><i /><i /><i /></span> : <span className="ip-dot" aria-hidden="true" />}
              <div>
                <p className="ip-wait-title">
                  {phase === 'listening' && (channel?.live === false ? tr('Tłumacz ma przerwę') : tr('Słuchasz: {lang}', { lang: channel?.label || '' }))}
                  {phase === 'waiting' && tr('Czekamy na tłumacza…')}
                  {phase === 'connecting' && tr('Łączenie…')}
                  {phase === 'reconnecting' && tr('Łączenie ponownie…')}
                </p>
                <p className="ip-wait-sub">
                  {phase === 'listening' && (channel?.live === false ? tr('Dźwięk wróci sam, gdy tłumacz znów zacznie mówić.') : tr('Włóż słuchawki. Głos tłumacza słychać z kilkusekundowym zapasem — to normalne.'))}
                  {phase === 'waiting' && tr('Tłumaczenie jeszcze się nie zaczęło. Połączymy Cię automatycznie.')}
                  {phase === 'connecting' && tr('Za chwilę usłyszysz tłumacza.')}
                  {phase === 'reconnecting' && (online ? tr('Połączenie zostało przerwane — próbujemy dalej.') : tr('Brak internetu. Połączymy ponownie, gdy wróci.'))}
                </p>
              </div>
              {phase === 'reconnecting' && !online && <WifiOff size={18} aria-hidden="true" className="ip-wait-icon" />}
            </div>

            {phase === 'listening' && !canPlay && (
              <button type="button" className="ip-cta" onClick={unlock}>
                <Volume2 size={20} aria-hidden="true" /> {tr('Dotknij, aby włączyć dźwięk')}
              </button>
            )}

            <div className="ip-controls">
              <button type="button" className="ip-round" aria-pressed={muted} onClick={() => setMuted((m) => !m)}
                aria-label={muted ? tr('Włącz dźwięk') : tr('Wycisz')} title={muted ? tr('Włącz dźwięk') : tr('Wycisz')}>
                {muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
              </button>
              {!ios && (
                <input type="range" className="ip-range" min="0" max="1" step="0.05" value={volume}
                  onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} aria-label={tr('Głośność')} />
              )}
              {ios && <span className="ip-hint">{tr('Głośność ustawisz przyciskami telefonu.')}</span>}
              <button type="button" className="ip-ghost" onClick={stop}>{tr('Zatrzymaj')}</button>
            </div>
          </>
        )}

        <div className="ip-tips">
          {ios ? (
            <p className="ip-hint"><Smartphone size={14} aria-hidden="true" /> {tr('Na iPhonie nie blokuj ekranu w trakcie słuchania (dźwięk w przeglądarce wtedy cichnie) — albo słuchaj w aplikacji Avenit.')}</p>
          ) : (
            <p className="ip-hint"><Smartphone size={14} aria-hidden="true" /> {tr('Ekran telefonu nie zgaśnie, póki słuchasz. Najlepiej słuchać w słuchawkach.')}</p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="ip-root">
      <main className="ip-card">
        <div className="ip-top">
          <img src={MARK} alt="" className="ip-mark" />
          <span className="ip-eyebrow">{church || 'Avenit'}</span>
          {src.isPublic && <LangSwitch />}
        </div>
        {body}
        {src.isPublic && <p className="ip-foot">{tr('Konto nie jest potrzebne. Nikt nie widzi, kto słucha.')}</p>}
      </main>
    </div>
  );
}

