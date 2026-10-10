import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Video, MessageSquare, AlertTriangle, Clock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { tr } from '../../i18n';
import { callFn } from '../Komunikator/calls/callApi';
import { useCalls } from '../Komunikator/calls/callContext';
import { JoinEventButton, isOnlineFormat } from './eventFormat';

// Karta „Spotkanie online” na stronie wydarzenia online/hybrydowego: stan spotkania, „Dołącz”,
// czat spotkania. Spotkanie zakłada serwer po zapisie wydarzenia (chwilę po zmianie formatu/godziny),
// więc karta odświeża się po zmianie tych pól i na realtime tabeli meetings.
export default function OnlineMeetingCard({ ev, wideAudience = false }) {
  const calls = useCalls();
  const [state, setState] = useState(null); // odpowiedź event-meeting
  const [error, setError] = useState(false);
  const timer = useRef(null);
  const eventId = ev?.id;

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      setState(await callFn('event-meeting', { event_id: eventId }));
      setError(false);
    } catch {
      setError(true);
    }
  }, [eventId]);

  // Po zmianie formatu/terminu serwer uzgadnia spotkanie w tle — odczyt z małym opóźnieniem.
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 700);
    return () => clearTimeout(timer.current);
  }, [load, ev?.format, ev?.date, ev?.time, ev?.end_time, ev?.title]);

  useEffect(() => {
    if (!eventId) return undefined;
    const chan = supabase.channel(`event-meeting:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, (payload) => {
        if (String(payload?.new?.event_id) === String(eventId)) load();
      })
      .subscribe();
    const onReconnect = () => load();
    window.addEventListener('avenit:realtime-reconnect', onReconnect);
    return () => { supabase.removeChannel(chan); window.removeEventListener('avenit:realtime-reconnect', onReconnect); };
  }, [eventId, load]);

  if (!isOnlineFormat(ev?.format)) return null;
  const m = state?.meeting;
  const live = !!m && (m.call_live || !!calls?.activeCallFor?.(m.conversation_id));
  const callsOff = !calls || calls.callsEnabled === false;

  let body;
  if (error && !state) {
    body = (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {tr('Nie udało się wczytać spotkania online.')} <button type="button" onClick={load} className="font-semibold underline">{tr('Spróbuj ponownie')}</button>
      </p>
    );
  } else if (!state) {
    body = <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Przygotowuję spotkanie online…')}</p>;
  } else if (state.status === 'needs_time') {
    body = (
      <p className="inline-flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
        <Clock size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        {tr('Ustaw godzinę rozpoczęcia — wtedy utworzy się spotkanie online z czatem.')}
      </p>
    );
  } else if (state.status === 'cancelled') {
    body = <p className="text-sm text-gray-700 dark:text-gray-200">{tr('Spotkanie online tego wydarzenia zostało odwołane.')}</p>;
  } else {
    body = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[12rem] text-sm text-gray-700 dark:text-gray-200">
            {live
              ? <span className="font-semibold">{tr('Spotkanie trwa')}</span>
              : tr('Dołączyć może każdy, kto widzi to wydarzenie. Osoby zapisane bez konta dostaną e-mailem osobisty link.')}
          </p>
          {!callsOff && <JoinEventButton eventId={ev.id} title={ev.title} label={live ? tr('Dołącz') : tr('Dołącz do spotkania')} />}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1"><Users size={13} aria-hidden="true" /> {tr('Zaproszonych: {n}', { n: m.invited || 0 })}</span>
          {m.participant && m.conversation_id && (
            <Link to={`/komunikator?conversation=${encodeURIComponent(m.conversation_id)}`} className="inline-flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-200 hover:underline">
              <MessageSquare size={13} aria-hidden="true" /> {tr('Czat spotkania')}
            </Link>
          )}
        </div>
        {callsOff && <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Połączenia audio i wideo nie są jeszcze włączone. Zapytaj administratora.')}</p>}
        {wideAudience && (
          <p className="inline-flex items-start gap-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            {tr('Wydarzenie widzi cały kościół. Rozmowa wideo działa wygodnie do ok. 30 osób z kamerami — przy większym gronie rozważ transmisję.')}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
        <Video size={16} className="text-accent-primary" aria-hidden="true" /> {tr('Spotkanie online')}
      </h2>
      {body}
    </section>
  );
}
