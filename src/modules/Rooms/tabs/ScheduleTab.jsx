import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Spinner from '../../../components/Spinner';
import {
  formatTime, formatDuration, startOfDay, startOfWeek, addDays, rangesOverlap,
} from '../lib/roomsApi';

const VIEW_OPTIONS = [
  { value: 'day', label: 'Dzień' },
  { value: 'week', label: 'Tydzień' },
];

const WEEKDAYS = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'niedz'];

export default function ScheduleTab({ resources, withCampusFilter }) {
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [resourceFilter, setResourceFilter] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const resourceById = useMemo(() => {
    const m = {}; (resources || []).forEach(r => { m[r.id] = r; }); return m;
  }, [resources]);

  const { rangeStart, rangeEnd, days } = useMemo(() => {
    if (view === 'day') {
      const s = startOfDay(anchor);
      return { rangeStart: s, rangeEnd: addDays(s, 1), days: [s] };
    }
    const s = startOfWeek(anchor);
    return { rangeStart: s, rangeEnd: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
  }, [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('resource_bookings')
        .select('*')
        .lt('start_at', rangeEnd.toISOString())
        .gt('end_at', rangeStart.toISOString())
        .order('start_at', { ascending: true });
      q = withCampusFilter(q);
      if (resourceFilter) q = q.eq('resource_id', resourceFilter);
      const { data, error } = await q;
      if (error) throw error;
      setBookings(data || []);
    } catch (err) {
      console.error('Load schedule error:', err);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter, resourceFilter, rangeStart, rangeEnd]);

  useEffect(() => { load(); }, [load]);

  const bookingsForDay = (day) => {
    const dayStart = startOfDay(day);
    const dayEnd = addDays(dayStart, 1);
    return bookings
      .filter(b => rangesOverlap(b.start_at, b.end_at, dayStart, dayEnd))
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  };

  const goPrev = () => setAnchor(a => addDays(a, view === 'day' ? -1 : -7));
  const goNext = () => setAnchor(a => addDays(a, view === 'day' ? 1 : 7));
  const goToday = () => setAnchor(startOfDay(new Date()));

  const rangeLabel = useMemo(() => {
    if (view === 'day') {
      return rangeStart.toLocaleDateString('pl-PL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    }
    const last = addDays(rangeStart, 6);
    return `${rangeStart.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' })} – ${last.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }, [view, rangeStart]);

  const resourceFilterOptions = useMemo(() => [
    { value: '', label: 'Wszystkie zasoby' },
    ...(resources || []).map(r => ({ value: r.id, label: r.name })),
  ], [resources]);

  const isToday = (day) => startOfDay(day).getTime() === startOfDay(new Date()).getTime();

  return (
    <div className="space-y-4">
      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-1">
          <button onClick={goPrev} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeft size={16} /></button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Dziś</button>
          <button onClick={goNext} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRight size={16} /></button>
        </div>
        <div className="text-sm font-semibold text-gray-900 dark:text-white capitalize flex-1 min-w-[160px]">{rangeLabel}</div>
        <div className="w-32"><CustomSelect value={view} onChange={setView} options={VIEW_OPTIONS} compact /></div>
        <div className="w-52"><CustomSelect value={resourceFilter} onChange={setResourceFilter} options={resourceFilterOptions} compact /></div>
      </div>

      {loading ? (
        <Spinner center />
      ) : (
        <div className={`grid gap-3 ${view === 'week' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-7' : 'grid-cols-1'}`}>
          {days.map((day, i) => {
            const dayBookings = bookingsForDay(day);
            const today = isToday(day);
            return (
              <div key={i} className={`bg-white dark:bg-gray-800 rounded-2xl border p-3 min-h-[120px] ${today ? 'border-accent-primary-light dark:border-accent-primary ring-1 ring-accent-primary-light/30' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className={`text-xs font-bold uppercase ${today ? 'text-accent-primary dark:text-accent-primary-light' : 'text-gray-400 dark:text-gray-500'}`}>
                    {view === 'week' ? WEEKDAYS[(day.getDay() + 6) % 7] : day.toLocaleDateString('pl-PL', { weekday: 'long' })}
                  </span>
                  <span className={`text-sm font-semibold ${today ? 'text-accent-primary dark:text-accent-primary-light' : 'text-gray-700 dark:text-gray-200'}`}>
                    {day.getDate()}.{String(day.getMonth() + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {dayBookings.length === 0 && (
                    <div className="text-xs text-gray-300 dark:text-gray-600 py-2 text-center">—</div>
                  )}
                  {dayBookings.map(b => {
                    const r = resourceById[b.resource_id];
                    const color = r?.color || '#94a3b8';
                    return (
                      <div key={b.id} className="rounded-lg px-2.5 py-1.5 text-xs border-l-[3px]" style={{ borderColor: color, background: color + '14' }}>
                        <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{b.title || 'Rezerwacja'}</div>
                        <div className="text-gray-500 dark:text-gray-400">{formatTime(b.start_at)}–{formatTime(b.end_at)} · {formatDuration(b.start_at, b.end_at)}</div>
                        {!resourceFilter && <div className="text-gray-500 dark:text-gray-400 truncate flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />{r?.name || '—'}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(resources || []).length === 0 && (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <CalendarDays size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Dodaj zasoby i rezerwacje, aby zobaczyć harmonogram.</p>
        </div>
      )}
    </div>
  );
}
