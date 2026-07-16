import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, ChevronRight, CalendarCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';

// Kolory znaczników wg kategorii wydarzenia (spójne z modułem Kalendarz).
const CATEGORY_STYLES = {
  default: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300',
  spotkanie: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
  konferencja: 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300',
  warsztat: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
  wyjazd: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
};

// „Dziś / Jutro / 12 lip" + godzina. dateStr='YYYY-MM-DD', timeStr='HH:MM' (opcjonalnie).
function formatWhen(dateStr, timeStr) {
  const [y, m, dd] = String(dateStr).split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, dd || 1);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((d - startOfToday) / 86400000);
  let day;
  if (dayDiff === 0) day = 'Dziś';
  else if (dayDiff === 1) day = 'Jutro';
  else day = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  const time = timeStr ? String(timeStr).slice(0, 5) : '';
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
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const { data, error } = await supabase
          .from('events')
          .select('id, title, category, date, time, location')
          .gte('date', today)
          .order('date', { ascending: true })
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
        <p className="text-gray-600 dark:text-gray-300 font-medium text-sm">{tr('Brak nadchodzących wydarzeń')}</p>
        <button
          onClick={() => navigate('/calendar')}
          className="mt-3 text-sm text-accent-primary dark:text-accent-primary-light font-medium hover:underline"
        >
          {tr('Otwórz kalendarz')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
        {events.map((ev) => {
          const when = formatWhen(ev.date, ev.time);
          const style = CATEGORY_STYLES[(ev.category || '').toLowerCase()] || CATEGORY_STYLES.default;
          return (
            <button
              key={ev.id}
              onClick={() => navigate('/calendar')}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group text-left"
            >
              {/* Data */}
              <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl shrink-0 ${style}`}>
                <span className="text-[11px] font-semibold leading-none uppercase">{when.day}</span>
                {when.time && <span className="text-xs mt-1 leading-none">{when.time}</span>}
              </div>
              {/* Treść */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-white truncate text-sm">{ev.title}</p>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                  {ev.category && <span className="truncate">{ev.category}</span>}
                  {ev.location && (
                    <span className="flex items-center gap-1 truncate"><MapPin size={11} />{ev.location}</span>
                  )}
                </div>
              </div>
              {when.isSoon && (
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-500 dark:bg-red-500/20 dark:text-red-300">
                  {tr('wkrótce')}
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
        {tr('Pełny kalendarz')}
      </button>
    </div>
  );
}
