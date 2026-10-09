import React, { memo, useEffect, useRef } from 'react';
import { MicOff, MonitorUp, SignalHigh, SignalMedium, SignalLow, SignalZero } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import { tr } from '../../../i18n';

// Obraz ścieżki LiveKit w <video>. Podpięcie elementu = sygnał dla adaptiveStream (rozmiar,
// widoczność); odpięcie przy odmontowaniu — niewidoczne kafelki nie pobierają obrazu.
export function TrackVideo({ track, mirror = false, fit = 'cover', className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!track || !el || typeof track.attach !== 'function') return undefined;
    try { track.attach(el); } catch { /* ignore */ }
    return () => { try { track.detach(el); } catch { /* ignore */ } };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
}

const QUALITY = {
  excellent: { Icon: SignalHigh, label: 'Połączenie: bardzo dobre', cls: 'text-white/80' },
  good: { Icon: SignalMedium, label: 'Połączenie: dobre', cls: 'text-white/80' },
  poor: { Icon: SignalLow, label: 'Połączenie: słabe', cls: 'text-amber-300' },
  lost: { Icon: SignalZero, label: 'Połączenie: zerwane', cls: 'text-red-300' },
};

export function QualityIcon({ quality, size = 14 }) {
  const q = QUALITY[quality];
  if (!q) return null;
  const { Icon } = q;
  return <Icon size={size} className={q.cls} aria-label={tr(q.label)} role="img" />;
}

// Kafelek uczestnika: obraz kamery (albo udostępniony ekran), a bez obrazu — zdjęcie/inicjały.
function ParticipantTile({ p, screen = false, speaking = false, compact = false, className = '' }) {
  const track = screen ? p.screenTrack : p.cameraTrack;
  const name = p.isLocal ? tr('{name} (Ty)', { name: p.name }) : p.name;
  const label = screen
    ? tr('Ekran: {name}', { name: p.name })
    : [name, !p.micOn ? tr('mikrofon wyłączony') : null, speaking ? tr('mówi') : null].filter(Boolean).join(', ');
  return (
    <div
      role="group"
      aria-label={label}
      className={`relative overflow-hidden rounded-2xl bg-gray-800 flex items-center justify-center min-h-0 min-w-0 transition-shadow duration-150
        ${speaking && !screen ? 'ring-2 ring-accent-primary shadow-[0_0_0_4px_rgba(0,0,0,0.25)]' : 'ring-1 ring-white/5'} ${className}`}
    >
      {track ? (
        <TrackVideo track={track} mirror={p.isLocal && !screen} fit={screen ? 'contain' : 'cover'} />
      ) : (
        <UserAvatar user={{ full_name: p.name, email: p.id, avatar_url: p.avatarUrl }} size={compact ? 'md' : 'xl'} />
      )}
      <div className="absolute left-2 bottom-2 right-2 flex items-center gap-1.5 min-w-0">
        <span className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-full bg-black/55 text-white text-xs font-medium truncate">
          {screen && <MonitorUp size={12} aria-hidden="true" />}
          {!screen && !p.micOn && <MicOff size={12} className="text-red-300 shrink-0" aria-hidden="true" />}
          <span className="truncate">{screen ? tr('Ekran: {name}', { name: p.name }) : name}</span>
        </span>
        {!screen && !compact && (p.quality === 'poor' || p.quality === 'lost') && (
          <span className="ml-auto px-1.5 py-0.5 rounded-full bg-black/55"><QualityIcon quality={p.quality} size={12} /></span>
        )}
      </div>
    </div>
  );
}

export default memo(ParticipantTile);
