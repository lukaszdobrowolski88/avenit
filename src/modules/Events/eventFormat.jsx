import React, { useState } from 'react';
import { MapPin, Video, Users, PhoneCall, Loader2 } from 'lucide-react';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import { useCalls } from '../Komunikator/calls/callContext';
import { callFn } from '../Komunikator/calls/callApi';

// Format wydarzenia (migracja 099): stacjonarne / online / hybrydowe. Online i hybrydowe mają
// spotkanie audio/wideo (czat + połączenie) — zakłada je serwer po zapisie wydarzenia.
export const FORMATS = [
  { value: 'in_person', label: 'Stacjonarne', icon: MapPin, hint: 'Spotkanie na miejscu' },
  { value: 'online', label: 'Online', icon: Video, hint: 'Spotkanie audio/wideo w aplikacji' },
  { value: 'hybrid', label: 'Hybrydowe', icon: Users, hint: 'Na miejscu i online jednocześnie' },
];
export const isOnlineFormat = (f) => f === 'online' || f === 'hybrid';
export const hasPlace = (f) => f !== 'online';
export const formatLabel = (f) => tr(FORMATS.find((x) => x.value === f)?.label || 'Stacjonarne');

// „Dołącz” ma sens od 15 min przed początkiem do końca (bez końca — 3 h od początku).
export function joinWindowOpen(ev, now = Date.now()) {
  if (!ev?.date || !ev?.time || !isOnlineFormat(ev.format)) return false;
  const day = String(ev.date).slice(0, 10);
  const start = new Date(`${day}T${String(ev.time).slice(0, 5)}:00`).getTime();
  if (!Number.isFinite(start)) return false;
  const endDay = String(ev.end_date || day).slice(0, 10);
  const endT = ev.end_time ? new Date(`${endDay}T${String(ev.end_time).slice(0, 5)}:00`).getTime() : NaN;
  const end = Number.isFinite(endT) && endT > start ? endT : start + 3 * 3_600_000;
  return now >= start - 15 * 60_000 && now <= end;
}

export function EventFormatPicker({ value = 'in_person', onChange, disabled = false, size = 'md' }) {
  const sm = size === 'sm';
  return (
    <div role="radiogroup" aria-label={tr('Forma wydarzenia')} className="flex flex-wrap gap-1.5">
      {FORMATS.map((f) => {
        const active = (value || 'in_person') === f.value;
        const Icon = f.icon;
        return (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={tr(f.hint)}
            onClick={() => !active && onChange?.(f.value)}
            className={`inline-flex items-center gap-1.5 ${sm ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'} rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-60 ${
              active ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            <Icon size={sm ? 13 : 15} aria-hidden="true" /> {tr(f.label)}
          </button>
        );
      })}
    </div>
  );
}

// Mała pigułka „Online” / „Hybrydowe” (stacjonarne — nic, jak dotąd).
export function EventFormatBadge({ format, className = '' }) {
  if (!isOnlineFormat(format)) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-700 dark:text-gray-200 ${className}`}>
      <Video size={11} aria-hidden="true" /> {formatLabel(format)}
    </span>
  );
}

// „Dołącz” do spotkania wydarzenia: serwer dopisuje do czatu spotkania (jeśli widzę wydarzenie),
// potem połączenie (trwające — dołączenie, inaczej rozpoczęcie bez dzwonienia).
export async function joinEventMeeting(calls, eventId, { title } = {}) {
  const res = await callFn('event-meeting', { event_id: eventId, join: true });
  if (res.status === 'needs_time') throw Object.assign(new Error(tr('Ustaw godzinę wydarzenia, żeby utworzyć spotkanie online.')), { handled: true });
  if (res.status === 'cancelled') throw Object.assign(new Error(tr('Spotkanie online tego wydarzenia zostało odwołane.')), { handled: true });
  const m = res.meeting;
  if (!m?.conversation_id) throw new Error('no-conversation');
  const conv = { id: m.conversation_id, type: 'meeting', name: title || m.title, displayName: title || m.title };
  if (!calls) return m;
  const live = calls.activeCallFor?.(m.conversation_id);
  if (live) calls.joinCall(live, conv, m.kind === 'video' ? 'video' : 'audio');
  else calls.startCall(conv, m.kind || 'video');
  return m;
}

export function JoinEventButton({ eventId, title, className = '', label }) {
  const calls = useCalls();
  const [busy, setBusy] = useState(false);
  if (!calls || calls.callsEnabled === false) return null;
  const go = async (e) => {
    e?.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      await joinEventMeeting(calls, eventId, { title });
    } catch (err) {
      if (err?.handled) toast.info(err.message);
      else toast.error(err, { fallback: tr('Nie udało się dołączyć do spotkania. Spróbuj ponownie.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={go} disabled={busy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-60 ${className}`}>
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <PhoneCall size={13} aria-hidden="true" />}
      {label || tr('Dołącz')}
    </button>
  );
}
