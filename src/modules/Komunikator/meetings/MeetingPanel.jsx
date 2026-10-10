import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Video, PhoneCall, Users, ChevronDown, CalendarPlus, Pencil, XCircle, Ban } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { tr } from '../../../i18n';
import { useCalls } from '../calls/callContext';
import { inCall } from '../calls/callLogic';
import { callFn } from '../calls/callApi';
import MeetingModal from './MeetingModal';
import {
  meetingPhase, formatMeetingWhen, formatMeetingLong, responseCounts, RESPONSES, RESPONSE_LABELS, RESPONSE_STATUS,
} from './meetingLogic';

function downloadIcs({ filename, content }) {
  try {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'spotkanie.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

// Karta spotkania pod nagłówkiem rozmowy typu 'meeting': termin, Dołącz/Rozpocznij, odpowiedź,
// uczestnicy z odpowiedziami; organizator — Edytuj / Odwołaj.
export default function MeetingPanel({ conversation, currentUserEmail }) {
  const calls = useCalls();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState(null);
  const [showPeople, setShowPeople] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const convId = conversation?.id;

  const load = useCallback(async () => {
    if (!convId) return;
    try {
      const res = await callFn('meeting-get', { conversation_id: convId });
      setMeeting(res.meeting || null);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [convId]);

  useEffect(() => { setMeeting(null); load(); }, [load]);
  // Zmiany spotkania (termin, odpowiedzi, odwołanie) — realtime + po ponownym połączeniu.
  useEffect(() => {
    if (!convId) return undefined;
    const chan = supabase.channel(`meeting:${convId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, (payload) => {
        if (String(payload?.new?.conversation_id) === String(convId)) load();
      })
      .subscribe();
    const onReconnect = () => load();
    window.addEventListener('avenit:realtime-reconnect', onReconnect);
    return () => {
      supabase.removeChannel(chan);
      window.removeEventListener('avenit:realtime-reconnect', onReconnect);
    };
  }, [convId, load]);
  // Zegar (przejście „za chwilę” → „teraz”) co 30 s.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const live = !!calls?.activeCallFor?.(convId);
  const mineHere = !!calls && inCall(calls.state) && String(calls.state.conversation?.id) === String(convId);

  if (error && !meeting) {
    return (
      <div className="px-4 py-2.5 border-b border-gray-200/60 dark:border-gray-700/60 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-3">
        <CalendarClock size={16} aria-hidden="true" />
        <span className="flex-1">{tr('Nie udało się wczytać spotkania.')}</span>
        <button type="button" onClick={load} className="text-xs font-semibold underline">{tr('Spróbuj ponownie')}</button>
      </div>
    );
  }
  if (!meeting) return null;

  const phase = meetingPhase(meeting, { now, callLive: live });
  const cancelled = phase === 'cancelled';
  const counts = responseCounts(meeting);
  const invited = meeting.my_response != null && meeting.organizer?.email?.toLowerCase() !== String(currentUserEmail || '').toLowerCase();
  const callsOn = !!calls && calls.callsEnabled !== false;

  const join = () => {
    if (!calls) return;
    const conv = { ...conversation, displayName: meeting.title };
    if (live) calls.joinCall(calls.activeCallFor(convId), conv, meeting.kind === 'video' ? 'video' : 'audio');
    else calls.startCall(conv, meeting.kind);
  };

  const respond = async (response) => {
    if (busy || response === meeting.my_response) return;
    setBusy(true);
    try {
      const res = await callFn('meeting-respond', { meeting_id: meeting.id, response });
      setMeeting(res.meeting);
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zapisać odpowiedzi.') });
    } finally {
      setBusy(false);
    }
  };

  const toCalendar = async () => {
    try {
      const res = await callFn('meeting-ics', { meeting_id: meeting.id });
      if (!downloadIcs(res)) toast.error(tr('Nie udało się pobrać pliku kalendarza.'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się pobrać pliku kalendarza.') });
    }
  };

  const cancel = async () => {
    const ok = await confirmDialog({
      title: tr('Odwołać spotkanie?'),
      message: tr('Zaproszeni dostaną informację, a linki gości przestaną działać. Czat spotkania zostanie.'),
      confirmLabel: tr('Odwołaj spotkanie'),
      danger: true,
      isDelete: false,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await callFn('meeting-cancel', { meeting_id: meeting.id });
      setMeeting(res.meeting);
      toast.success(tr('Spotkanie odwołane'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się odwołać spotkania.') });
    } finally {
      setBusy(false);
    }
  };

  const openEdit = async () => {
    // Pełne dane (e-maile gości) ma tylko organizator — świeży odczyt przed edycją.
    await load();
    setEditing(true);
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50';
  const ghost = `${btn} bg-white/80 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-700`;
  const primary = `${btn} bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100`;
  const phaseText = {
    live: tr('Spotkanie trwa'),
    now: tr('Spotkanie powinno się już zacząć'),
    soon: tr('Zaczyna się za chwilę'),
    ended: tr('Spotkanie się zakończyło'),
    cancelled: tr('Spotkanie odwołane'),
    upcoming: null,
  }[phase];

  return (
    <section
      aria-label={tr('Spotkanie: {title}', { title: meeting.title })}
      className="px-4 py-3 border-b border-gray-200/60 dark:border-gray-700/60 bg-accent-primary-lightest/60 dark:bg-accent-primary-darkest/20"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-9 h-9 shrink-0 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200">
          {cancelled ? <Ban size={17} aria-hidden="true" /> : <CalendarClock size={17} aria-hidden="true" />}
        </span>
        <div className="flex-1 min-w-[12rem]">
          <p className={`text-sm font-semibold text-gray-900 dark:text-white ${cancelled ? 'line-through decoration-gray-400' : ''}`}>
            <time dateTime={meeting.starts_at} title={formatMeetingLong(meeting.starts_at)}>{formatMeetingWhen(meeting.starts_at, meeting.ends_at)}</time>
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {phaseText ? <><span className="font-semibold">{phaseText}</span> · </> : null}
            {tr('Prowadzi: {name}', { name: meeting.organizer?.name || '' })}
          </p>
        </div>
        {!cancelled && phase !== 'ended' && callsOn && !mineHere && (
          <button type="button" onClick={join} className={primary}>
            {meeting.kind === 'video' ? <Video size={14} aria-hidden="true" /> : <PhoneCall size={14} aria-hidden="true" />}
            {live ? tr('Dołącz') : tr('Rozpocznij spotkanie')}
          </button>
        )}
      </div>

      {meeting.description && !cancelled && (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line line-clamp-3">{meeting.description}</p>
      )}

      {!cancelled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {invited && phase !== 'ended' && (
            <div role="radiogroup" aria-label={tr('Twoja odpowiedź')} className="inline-flex flex-wrap gap-1">
              {RESPONSES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={meeting.my_response === r}
                  onClick={() => respond(r)}
                  disabled={busy}
                  className={meeting.my_response === r ? primary : ghost}
                >
                  {tr(RESPONSE_LABELS[r])}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setShowPeople((v) => !v)} aria-expanded={showPeople} className={ghost}>
            <Users size={14} aria-hidden="true" />
            {tr('Uczestnicy: {n}', { n: meeting.members.length + meeting.guests.length })}
            {counts.accepted > 0 && <span className="font-normal text-gray-500 dark:text-gray-400">· {tr('potwierdziło: {n}', { n: counts.accepted })}</span>}
            <ChevronDown size={13} className={`transition-transform ${showPeople ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <button type="button" onClick={toCalendar} className={ghost}>
            <CalendarPlus size={14} aria-hidden="true" /> {tr('Do kalendarza')}
          </button>
          {meeting.can_manage && (
            <>
              <button type="button" onClick={openEdit} disabled={busy} className={ghost}>
                <Pencil size={14} aria-hidden="true" /> {tr('Edytuj')}
              </button>
              <button type="button" onClick={cancel} disabled={busy} className={ghost}>
                <XCircle size={14} aria-hidden="true" /> {tr('Odwołaj')}
              </button>
            </>
          )}
        </div>
      )}

      {showPeople && !cancelled && (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2" aria-label={tr('Uczestnicy spotkania')}>
          {meeting.members.map((p) => (
            <li key={p.email} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 dark:bg-gray-800/60 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-gray-900 dark:text-white">
                {p.name}{p.organizer && <span className="text-gray-500 dark:text-gray-400"> · {tr('organizator')}</span>}
              </span>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{tr(RESPONSE_STATUS[p.response] || RESPONSE_STATUS.pending)}</span>
            </li>
          ))}
          {meeting.guests.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 dark:bg-gray-800/60 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-gray-900 dark:text-white">
                {g.name} <span className="text-gray-500 dark:text-gray-400">· {g.email || tr('gość')}</span>
              </span>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{tr(RESPONSE_STATUS[g.response] || RESPONSE_STATUS.pending)}</span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <MeetingModal
          isOpen
          onClose={() => setEditing(false)}
          currentUserEmail={currentUserEmail}
          meeting={meeting}
          onSaved={(m) => setMeeting(m)}
        />
      )}
    </section>
  );
}
