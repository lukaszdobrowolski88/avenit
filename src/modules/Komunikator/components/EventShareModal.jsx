import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT, tr, appLocale } from '../../../i18n';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';

// Modal wyboru nadchodzącego wydarzenia do udostępnienia w czacie.
export default function EventShareModal({ isOpen, onClose, onShare }) {
  const t = useT();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
          .from('events')
          .select('id, title, date, time, location, max_participants, description')
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(50);
        if (error) throw error;
        setEvents(data || []);
      } catch (err) {
        console.error('Error fetching events:', err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = events.filter(e =>
    !query || e.title?.toLowerCase().includes(query.toLowerCase())
  );

  const handleShare = (ev) => {
    onShare?.({
      event_id: ev.id,
      title: ev.title,
      date: ev.date,
      time: ev.time,
      location: ev.location,
      max_participants: ev.max_participants,
      description: ev.description
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      title={tr('Udostępnij wydarzenie')}
      icon={Calendar}
      size="sm"
    >
      <div className="px-6 pt-4 pb-2 sticky top-0 z-10 bg-white dark:bg-gray-900">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Szukaj wydarzeń...')}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />
        </div>
      </div>

      <div className="px-4 pb-4">
        {loading ? (
          <Spinner center />
        ) : filtered.length === 0 ? (
          <EmptyState compact icon={Calendar} title={tr('Brak nadchodzących wydarzeń')} />
        ) : (
          <div className="space-y-1">
            {filtered.map(ev => {
              let dateLabel = ev.date;
              try {
                dateLabel = new Date(`${ev.date}T${ev.time || '00:00'}`).toLocaleDateString(appLocale(), { weekday: 'short', day: 'numeric', month: 'long' });
              } catch { /* surowe */ }
              return (
                <button
                  key={ev.id}
                  onClick={() => handleShare(ev)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center flex-shrink-0">
                    <Calendar size={16} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{ev.title}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar size={11} /> {dateLabel}</span>
                      {ev.time && <span className="flex items-center gap-1"><Clock size={11} /> {ev.time}</span>}
                      {ev.location && <span className="flex items-center gap-1 truncate"><MapPin size={11} /> {ev.location}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
