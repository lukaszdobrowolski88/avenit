import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, ExternalLink } from 'lucide-react';
import EventRSVP from '../../../components/EventRSVP';
import { tr } from '../../../i18n';

// Karta udostępnionego wydarzenia z osadzonym panelem zapisów (RSVP).
export default function EventCard({ message }) {
  const meta = message.metadata || {};
  const { event_id, title, date, time, location, max_participants, description } = meta;

  let dateLabel = date;
  let dayNum = '';
  let monthShort = '';
  try {
    if (date) {
      const d = new Date(`${date}T${time || '00:00'}`);
      dateLabel = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
      dayNum = d.toLocaleDateString('pl-PL', { day: 'numeric' });
      monthShort = d.toLocaleDateString('pl-PL', { month: 'short' });
    }
  } catch { /* zostaw surowe */ }

  return (
    <div className="w-72 sm:w-80 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/70 shadow-sm overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex flex-col items-center justify-center text-white flex-shrink-0 leading-none">
          <span className="text-lg font-bold">{dayNum || <Calendar size={18} />}</span>
          {monthShort && <span className="text-[9px] uppercase tracking-wide opacity-90">{monthShort}</span>}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent-primary dark:text-accent-primary-light">
            {tr('Wydarzenie')}
          </p>
          <p className="font-semibold text-gray-900 dark:text-white break-words leading-snug">{title || tr('Wydarzenie')}</p>
          <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
            {date && <p className="flex items-center gap-1.5"><Calendar size={12} /> {dateLabel}</p>}
            {time && <p className="flex items-center gap-1.5"><Clock size={12} /> {time}</p>}
            {location && <p className="flex items-center gap-1.5"><MapPin size={12} /> {location}</p>}
          </div>
        </div>
      </div>

      {description && (
        <p className="px-4 pb-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-3 whitespace-pre-wrap">{description}</p>
      )}

      {/* Zapisy (RSVP) – osadzony wspólny komponent */}
      {event_id && (
        <div className="px-3">
          <EventRSVP eventId={event_id} maxParticipants={max_participants} />
        </div>
      )}

      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700/60">
        <Link
          to="/calendar"
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-accent-primary dark:text-accent-primary-light hover:underline"
        >
          <ExternalLink size={13} />
          {tr('Otwórz w kalendarzu')}
        </Link>
      </div>
    </div>
  );
}
