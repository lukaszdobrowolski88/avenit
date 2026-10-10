import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Video, MessageSquare, AlertTriangle, Clock, Users, Mail, X, Check } from 'lucide-react';
import { toast } from '../../lib/toast';
import { parseGuestInput } from '../Komunikator/meetings/meetingLogic';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { tr } from '../../i18n';
import { callFn } from '../Komunikator/calls/callApi';
import { useCalls } from '../Komunikator/calls/callContext';
import { JoinEventButton, isOnlineFormat } from './eventFormat';

// Karta „Spotkanie online” na stronie wydarzenia online/hybrydowego: stan spotkania, „Dołącz”,
// czat spotkania. Spotkanie zakłada serwer po zapisie wydarzenia (chwilę po zmianie formatu/godziny),
// więc karta odświeża się po zmianie tych pól i na realtime tabeli meetings.
const RESPONSE = { accepted: 'Bierze udział', tentative: 'Może', declined: 'Nie bierze udziału', pending: 'Bez odpowiedzi' };

// Goście spoza aplikacji (e-mail): osobisty link + plik kalendarza. Adres osoby z kontem trafia
// do uczestników spotkania (serwer). Tylko dla osób, które mogą edytować wydarzenie.
function EventGuests({ eventId }) {
  const [guests, setGuests] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const call = useCallback(async (body = {}) => {
    const res = await callFn('event-meeting-guests', { event_id: eventId, ...body });
    setGuests(res.guests || []);
    return res;
  }, [eventId]);
  useEffect(() => { call().catch(() => setGuests([])); }, [call]);

  const add = async () => {
    const { emails, invalid } = parseGuestInput(text);
    if (invalid.length) { setError(tr('Nieprawidłowy adres e-mail: {email}', { email: invalid[0] })); return; }
    if (!emails.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await call({ add: emails.map((email) => ({ email })) });
      setText('');
      if (res.added) toast.success(tr('Zaproszenia wysłane: {n}', { n: res.added }));
      if (res.members_added) toast.info(tr('Osoby z kontem w aplikacji dodano jako uczestników: {n}', { n: res.members_added }));
    } catch (err) {
      setError(err?.context?.error || err?.message || tr('Nie udało się wysłać zaproszeń.'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (g) => {
    try {
      await call({ remove: [g.id] });
      toast.success(tr('Zaproszenie wycofane'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wycofać zaproszenia.') });
    }
  };

  const field = 'w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm';
  return (
    <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{tr('Goście spoza aplikacji')}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">{tr('Każdy dostanie e-mail z osobistym linkiem i plikiem do kalendarza. Konto nie jest potrzebne.')}</p>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input type="email" multiple inputMode="email" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={tr('adres@przyklad.pl')} aria-label={tr('Adresy e-mail gości')} className={field} />
        </div>
        <button type="button" onClick={add} disabled={busy || !text.trim()}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
          {tr('Zaproś')}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {guests && guests.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label={tr('Zaproszeni goście')}>
          {guests.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate text-gray-900 dark:text-white">
                {g.name} <span className="text-gray-500 dark:text-gray-400">· {g.email}</span>
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                {g.email_sent && <Check size={12} aria-label={tr('E-mail wysłany')} />} {tr(RESPONSE[g.response] || RESPONSE.pending)}
              </span>
              <button type="button" onClick={() => remove(g)} aria-label={tr('Wycofaj zaproszenie: {name}', { name: g.email })} title={tr('Wycofaj zaproszenie')}
                className="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700">
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OnlineMeetingCard({ ev, wideAudience = false, canManage = false }) {
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
        {canManage && <EventGuests eventId={ev.id} />}
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
