import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, Users, ChevronRight, CalendarCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// Kolory znaczników wg typu wydarzenia (spójne z modułem Kalendarz).
const TYPE_STYLES = {
  default: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300',
  spotkanie: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
  konferencja: 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300',
  warsztat: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
  wyjazd: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
};

// „Dziś / Jutro / 12 lip" + godzina.
function formatWhen(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - startOfToday) / 86400000);
  const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  let day;
  if (dayDiff === 0) day = 'Dziś';
  else if (dayDiff === 1) day = 'Jutro';
  else day = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  return { day, time, isSoon: dayDiff <= 1 };
}

export default function UpcomingEventsWidget() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('events')
          .select('id, title, event_type, start_date, location, max_participants')
          .gte('start_date', nowIso)
          .order('start_date', { ascending: true })
          .limit(6);
        if (error) throw error;
        if (active) setEvents(data || []);
      } catch (err) {
        console.error('Error fetching upcoming events:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-accent-primary-light border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
          <CalendarCheck size={24} className="text-indigo-500" />
        </div>
        <p className="text-gray-600 dark:text-gray-300 font-medium text-sm">Brak nadchodzących wydarzeń</p>
        <button
          onClick={() => navigate('/calendar')}
          className="mt-3 text-sm text-accent-primary dark:text-accent-primary-light font-medium hover:underline"
        >
          Otwórz kalendarz
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
        {events.map((ev) => {
          const when = formatWhen(ev.start_date);
          const style = TYPE_STYLES[ev.event_type] || TYPE_STYLES.default;
          return (
            <button
              key={ev.id}
              onClick={() => navigate('/calendar')}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group text-left"
            >
              {/* Data */}
              <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl shrink-0 ${style}`}>
                <span className="text-[11px] font-semibold leading-none uppercase">{when.day}</span>
                <span className="text-xs mt-1 leading-none">{when.time}</span>
              </div>
              {/* Treść */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-white truncate text-sm">{ev.title}</p>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                  {ev.location && (
                    <span className="flex items-center gap-1 truncate"><MapPin size={11} />{ev.location}</span>
                  )}
                  {ev.max_participants ? (
                    <span className="flex items-center gap-1 shrink-0"><Users size={11} />max {ev.max_participants}</span>
                  ) : null}
                </div>
              </div>
              {when.isSoon && (
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-500 dark:bg-red-500/20 dark:text-red-300">
                  wkrótce
                </span>
              )}
              <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-accent-primary-light transition-colors shrink-0" />
            </button>
          );
        })}
      </div>
      <button
        onClick={() => navigate('/calendar')}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
      >
        <CalendarDays size={16} />
        Pełny kalendarz
      </button>
    </div>
  );
}
