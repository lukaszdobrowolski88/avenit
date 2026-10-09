import React, { useEffect, useRef, useState } from 'react';
import { Minimize2, MessageSquare, Loader2, Volume2, X, MicOff, VideoOff, WifiOff, Users } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import CallStage from './CallStage';
import CallControls from './CallControls';
import ParticipantTile, { QualityIcon } from './ParticipantTile';
import { formatClock, isTypingTarget } from './callLogic';
import { useFocusTrap } from '../../../components/ui/useFocusTrap';
import { tr } from '../../../i18n';

export function useNow(active, every = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

export function callStatusText(state, snapshot, now, startedAt) {
  if (state.phase === 'joining') return tr('Łączenie…');
  if (state.phase === 'outgoing') return tr('Dzwonię…');
  if (snapshot.connectionState === 'reconnecting' || snapshot.connectionState === 'signalReconnecting') return tr('Łączenie ponownie…');
  return startedAt ? formatClock(now - startedAt) : '';
}

// Pomoc, gdy przeglądarka nie daje mikrofonu/kamery.
export function MediaHelp({ error, onRetry, onDismiss }) {
  if (!error) return null;
  const cam = error.source === 'camera';
  const screen = error.source === 'screen';
  const Icon = cam ? VideoOff : MicOff;
  let title;
  let body;
  if (screen) {
    title = tr('Nie udało się udostępnić ekranu');
    body = tr('Spróbuj ponownie i wybierz okno albo kartę do udostępnienia.');
  } else if (error.failure === 'PermissionDenied') {
    title = cam ? tr('Przeglądarka blokuje kamerę') : tr('Przeglądarka blokuje mikrofon');
    body = tr('Kliknij ikonę kłódki obok adresu strony, zezwól na dostęp i wybierz „Spróbuj ponownie”. W ustawieniach systemu sprawdź też, czy przeglądarka ma dostęp do urządzenia.');
  } else if (error.failure === 'NotFound') {
    title = cam ? tr('Nie znaleziono kamery') : tr('Nie znaleziono mikrofonu');
    body = tr('Podłącz urządzenie albo wybierz inne w ustawieniach urządzeń.');
  } else if (error.failure === 'DeviceInUse') {
    title = cam ? tr('Kamera jest zajęta') : tr('Mikrofon jest zajęty');
    body = tr('Inna aplikacja używa tego urządzenia. Zamknij ją i spróbuj ponownie.');
  } else {
    title = cam ? tr('Nie udało się włączyć kamery') : tr('Nie udało się włączyć mikrofonu');
    body = tr('Spróbuj ponownie albo wybierz inne urządzenie.');
  }
  return (
    <div role="alert" className="mx-3 sm:mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">
      <Icon size={18} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-white/75 mt-0.5">{body}</p>
        {!screen && (
          <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold underline underline-offset-2 hover:text-white/90">
            {tr('Spróbuj ponownie')}
          </button>
        )}
      </div>
      <button type="button" onClick={onDismiss} aria-label={tr('Zamknij')} className="p-1 rounded-lg hover:bg-white/10"><X size={16} aria-hidden="true" /></button>
    </div>
  );
}

// Pełne okno rozmowy (nad całą aplikacją). Esc — minimalizuj, M — mikrofon, V — kamera.
export default function CallWindow({ calls, room }) {
  const { state, startedAt } = calls;
  const { snapshot } = room;
  const panelRef = useRef(null);
  useFocusTrap(panelRef, true);
  const now = useNow(state.phase === 'active');
  const conv = state.conversation || {};
  const status = callStatusText(state, snapshot, now, startedAt);
  const reconnecting = snapshot.connectionState === 'reconnecting' || snapshot.connectionState === 'signalReconnecting';
  const local = snapshot.participants.find((p) => p.isLocal);
  const waiting = state.phase === 'joining' || (state.phase === 'outgoing' && snapshot.remoteCount === 0);

  const roomRef = useRef(room);
  roomRef.current = room;
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); calls.minimize(); return; }
      if (isTypingTarget(e.target) || roomRef.current.snapshot?.canPublish === false) return;
      const k = e.key.toLowerCase();
      if (k === 'm') { e.preventDefault(); roomRef.current.toggleMic(); }
      else if (k === 'v') { e.preventDefault(); roomRef.current.toggleCamera(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [calls]);

  const leaveLabel = state.phase === 'outgoing' || (state.phase === 'joining' && state.outgoing) ? tr('Anuluj połączenie') : tr('Zakończ rozmowę');

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={tr('Rozmowa: {name}', { name: conv.name || '' })}
      className="fixed inset-0 z-[95] flex flex-col bg-gray-950 text-white outline-none"
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        <UserAvatar user={{ full_name: conv.name, avatar_url: conv.avatar }} size="sm" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{conv.name}</h2>
          <p className="text-xs text-white/70 tabular-nums flex items-center gap-2">
            <span>{status}</span>
            {state.phase === 'active' && snapshot.participants.length > 2 && (
              <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden="true" />{snapshot.participants.length}</span>
            )}
            {local && <QualityIcon quality={local.quality} size={12} />}
          </p>
        </div>
        <button type="button" onClick={calls.openChat} className="p-2.5 rounded-xl hover:bg-white/10" aria-label={tr('Przejdź do czatu')} title={tr('Przejdź do czatu')}>
          <MessageSquare size={18} aria-hidden="true" />
        </button>
        <button type="button" onClick={calls.minimize} data-autofocus className="p-2.5 rounded-xl hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-label={tr('Zminimalizuj (Esc)')} title={tr('Zminimalizuj (Esc)')}>
          <Minimize2 size={18} aria-hidden="true" />
        </button>
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

      {waiting ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 text-center px-6">
          <UserAvatar user={{ full_name: conv.name, avatar_url: conv.avatar }} size="xl" />
          <div>
            <p className="text-lg font-semibold">{conv.name}</p>
            <p className="text-sm text-white/70 mt-1 inline-flex items-center gap-2" role="status">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              {state.phase === 'joining' ? tr('Łączenie…') : tr('Dzwonię…')}
            </p>
          </div>
          {local?.camOn && (
            <div className="w-40 sm:w-56 aspect-video rounded-2xl overflow-hidden">
              <ParticipantTile p={local} compact className="w-full h-full" />
            </div>
          )}
        </div>
      ) : (
        <CallStage snapshot={snapshot} />
      )}

      <CallControls room={room} local={snapshot.local} canPublish={snapshot.canPublish} onLeave={calls.leaveCall} leaveLabel={leaveLabel} />
    </div>
  );
}
