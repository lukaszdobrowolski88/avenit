import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Settings2, PhoneOff, X } from 'lucide-react';
import { tr } from '../../../i18n';
import { canShareScreen } from './livekit';

// Okrągły przycisk sterowania rozmową (ciemne tło okna rozmowy).
export function RoundButton({ icon: Icon, label, onClick, pressed, danger = false, off = false, size = 'md', ...rest }) {
  const dim = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
  const tone = danger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : off
      ? 'bg-white text-gray-900 hover:bg-gray-100'
      : 'bg-white/10 hover:bg-white/20 text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`${dim} rounded-full inline-flex items-center justify-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:opacity-40 ${tone}`}
      {...rest}
    >
      <Icon size={size === 'sm' ? 18 : 20} aria-hidden="true" />
    </button>
  );
}

const hasSinkId = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

// Wybór mikrofonu / kamery / głośnika (głośnik — tylko gdy przeglądarka pozwala).
export function DevicePicker({ room, onClose }) {
  const [devices, setDevices] = useState({ audioinput: [], videoinput: [], audiooutput: [] });
  const [active, setActive] = useState({});
  const panelRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const kinds = ['audioinput', 'videoinput', ...(hasSinkId() ? ['audiooutput'] : [])];
      const lists = await Promise.all(kinds.map((k) => room.listDevices(k)));
      if (!alive) return;
      const next = { audioinput: [], videoinput: [], audiooutput: [] };
      kinds.forEach((k, i) => { next[k] = lists[i] || []; });
      setDevices(next);
      setActive(Object.fromEntries(kinds.map((k) => [k, room.activeDevice(k)])));
    })();
    return () => { alive = false; };
  }, [room]);

  useEffect(() => {
    panelRef.current?.querySelector('select')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const el = panelRef.current;
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, [onClose]);

  const change = async (kind, id) => {
    setActive((a) => ({ ...a, [kind]: id }));
    try { await room.switchDevice(kind, id); } catch { /* urządzenie zniknęło */ }
  };

  const rows = [
    ['audioinput', tr('Mikrofon')],
    ['videoinput', tr('Kamera')],
    ...(hasSinkId() ? [['audiooutput', tr('Głośnik')]] : []),
  ];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={tr('Urządzenia')}
      data-popover
      className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl bg-gray-900 text-white shadow-2xl ring-1 ring-white/10 p-4 space-y-3 z-10"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{tr('Urządzenia')}</h3>
        <button type="button" onClick={onClose} aria-label={tr('Zamknij')} className="p-1 rounded-lg hover:bg-white/10"><X size={16} aria-hidden="true" /></button>
      </div>
      {rows.map(([kind, label]) => (
        <label key={kind} className="block">
          <span className="block text-xs text-white/70 mb-1">{label}</span>
          <select
            value={active[kind] || ''}
            onChange={(e) => change(kind, e.target.value)}
            className="w-full rounded-xl bg-white/10 text-white text-sm px-3 py-2 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {devices[kind].length === 0 && <option value="">{tr('Brak urządzeń')}</option>}
            {devices[kind].map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId} className="text-gray-900">{d.label || `${label} ${i + 1}`}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

// Pasek sterowania pełnego okna rozmowy.
export default function CallControls({ room, local, onLeave, leaveLabel, canPublish = true }) {
  const [showDevices, setShowDevices] = useState(false);
  const screenOk = canShareScreen();
  return (
    <div className="relative flex items-center justify-center gap-3 sm:gap-4 py-4 px-4" role="toolbar" aria-label={tr('Sterowanie rozmową')}>
      {!canPublish && (
        <span className="text-xs text-white/70 px-3 py-1.5 rounded-full bg-white/10">{tr('Tylko słuchasz — w tym kanale mówią administratorzy')}</span>
      )}
      {canPublish && <>
      <RoundButton
        icon={local.micOn ? Mic : MicOff}
        off={!local.micOn}
        label={local.micOn ? tr('Wycisz mikrofon (M)') : tr('Włącz mikrofon (M)')}
        onClick={room.toggleMic}
      />
      <RoundButton
        icon={local.camOn ? Video : VideoOff}
        off={!local.camOn}
        label={local.camOn ? tr('Wyłącz kamerę (V)') : tr('Włącz kamerę (V)')}
        onClick={room.toggleCamera}
      />
      {screenOk && (
        <RoundButton
          icon={local.screenOn ? MonitorOff : MonitorUp}
          label={local.screenOn ? tr('Zakończ udostępnianie ekranu') : tr('Udostępnij ekran')}
          onClick={room.toggleScreenShare}
        />
      )}
      </>}
      <div className="relative">
        <RoundButton
          icon={Settings2}
          label={tr('Urządzenia')}
          aria-haspopup="dialog"
          aria-expanded={showDevices}
          onClick={() => setShowDevices((v) => !v)}
        />
        {showDevices && <DevicePicker room={room} onClose={() => setShowDevices(false)} />}
      </div>
      <RoundButton icon={PhoneOff} danger label={leaveLabel || tr('Zakończ rozmowę')} onClick={onLeave} />
    </div>
  );
}
