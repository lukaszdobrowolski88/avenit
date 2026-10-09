import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Maximize2, PhoneOff, GripHorizontal } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import { TrackVideo } from './ParticipantTile';
import { RoundButton } from './CallControls';
import { useNow, callStatusText } from './CallWindow';
import { tr } from '../../../i18n';

const POS_KEY = 'avenit.call.mini.pos';
const MARGIN = 16;

function readPos() {
  try { const v = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null; } catch { return null; }
}
function savePos(p) {
  try { sessionStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

// Pływające mini-okno rozmowy — zostaje przy zmianie strony, można je przeciągać
// (mysz/dotyk; klawiaturą: strzałki na uchwycie).
export default function CallMiniWindow({ calls, room }) {
  const { state, startedAt } = calls;
  const { snapshot } = room;
  const ref = useRef(null);
  const drag = useRef(null);
  const [pos, setPos] = useState(() => readPos());
  const now = useNow(state.phase === 'active');

  const place = useCallback((x, y) => {
    const el = ref.current;
    const w = el?.offsetWidth || 256;
    const h = el?.offsetHeight || 180;
    const next = {
      x: clamp(x, MARGIN, window.innerWidth - w - MARGIN),
      y: clamp(y, MARGIN, window.innerHeight - h - MARGIN),
    };
    setPos(next);
    return next;
  }, []);

  // Po zmianie rozmiaru okna przeglądarki — nie zgub mini-okna poza ekranem.
  useEffect(() => {
    const on = () => { if (pos) place(pos.x, pos.y); };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [pos, place]);

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button') && !e.target.closest('[data-drag-handle]')) return;
    const rect = ref.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
    try { ref.current.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    place(e.clientX - d.dx, e.clientY - d.dy);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && pos) savePos(pos);
  };
  const onHandleKey = (e) => {
    const step = e.shiftKey ? 40 : 12;
    const rect = ref.current.getBoundingClientRect();
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    savePos(place(rect.left + m[0], rect.top + m[1]));
  };

  const conv = state.conversation || {};
  // Na podglądzie: udostępniony ekran, mówiący z kamerą, ktokolwiek z kamerą (najpierw inni).
  const others = snapshot.participants.filter((p) => !p.isLocal);
  const speaker = others.find((p) => snapshot.speakerIds.includes(p.id));
  const sharer = snapshot.participants.find((p) => p.screenOn && !p.isLocal);
  const withCam = (speaker?.camOn && speaker) || others.find((p) => p.camOn);
  const track = sharer?.screenTrack || withCam?.cameraTrack || null;
  const focus = sharer || withCam || speaker || others[0] || null;
  const status = callStatusText(state, snapshot, now, startedAt);

  const style = pos ? { left: pos.x, top: pos.y } : { right: MARGIN, bottom: MARGIN };

  return (
    <section
      ref={ref}
      aria-label={tr('Rozmowa w toku: {name}', { name: conv.name || '' })}
      className="fixed z-[94] w-56 sm:w-64 rounded-2xl bg-gray-950 text-white shadow-2xl ring-1 ring-white/10 overflow-hidden select-none touch-none"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative aspect-video bg-gray-800 flex items-center justify-center">
        {track ? (
          <TrackVideo track={track} fit={sharer ? 'contain' : 'cover'} />
        ) : (
          <UserAvatar user={{ full_name: focus?.name || conv.name, avatar_url: focus?.avatarUrl || conv.avatar }} size="lg" />
        )}
        <button
          type="button"
          data-drag-handle
          onKeyDown={onHandleKey}
          className="absolute top-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/40 text-white/80 cursor-grab focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label={tr('Przesuń okno rozmowy (strzałki)')}
          title={tr('Przeciągnij, aby przesunąć')}
        >
          <GripHorizontal size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{conv.name}</p>
          <p className="text-[11px] text-white/70 tabular-nums">{status}</p>
        </div>
        {snapshot.canPublish && (
          <RoundButton size="sm" icon={snapshot.local.micOn ? Mic : MicOff} off={!snapshot.local.micOn}
            label={snapshot.local.micOn ? tr('Wycisz mikrofon') : tr('Włącz mikrofon')} onClick={room.toggleMic} />
        )}
        <RoundButton size="sm" icon={Maximize2} label={tr('Powiększ okno rozmowy')} onClick={calls.restore} />
        <RoundButton size="sm" icon={PhoneOff} danger label={tr('Zakończ rozmowę')} onClick={calls.leaveCall} />
      </div>
    </section>
  );
}
