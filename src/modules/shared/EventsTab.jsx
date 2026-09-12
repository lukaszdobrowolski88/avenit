import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Plus, Search, Trash2, X, Calendar, MapPin, Users, ChevronLeft, ChevronRight, Save, Clock, Filter, Edit2, SlidersHorizontal } from 'lucide-react';
import CustomSelect from '../../components/CustomSelect';
import TabHeader from '../../components/TabHeader';
import TimeInput from '../../components/TimeInput';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useModuleCalendar, saveModuleCalendar } from '../../hooks/useModuleLabel';
import Modal from '../../components/Modal';
import { useCan } from '../../components/Can';
import { useT } from '../../i18n';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

// Hook do obliczania pozycji dropdowna
function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        setCoords({
          top: openUpward ? rect.top + window.scrollY - 4 : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
          openUpward
        });
      };
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

  return coords;
}

// Custom Date Picker
const CustomDatePicker = ({ label, value, onChange }) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  useEffect(() => { if (value) setViewDate(new Date(value)); }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.portal-datepicker')) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleDayClick = (day) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${dayStr}`);
    setIsOpen(false);
  };

  const monthName = viewDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const startDay = (new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() + 6) % 7;

  return (
    <div className="relative w-full">
      {label && <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm cursor-pointer flex justify-between items-center transition-all
          ${isOpen ? 'border-accent-primary-light ring-2 ring-accent-primary-light/20 dark:border-accent-primary-light' : 'border-gray-200/50 dark:border-gray-700/50 hover:border-accent-primary-light dark:hover:border-accent-primary'}
        `}
      >
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={16} className="text-gray-400" />
          <span className={value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
            {value ? new Date(value).toLocaleDateString('pl-PL') : tr('Wybierz datę')}
          </span>
        </div>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="portal-datepicker fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 animate-in fade-in zoom-in-95 duration-100 w-[280px]"
          style={{
            ...(coords.openUpward ? { bottom: `calc(100vh - ${coords.top}px)` } : { top: coords.top }),
            left: coords.left
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1)); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><ChevronLeft size={18} className="text-gray-600 dark:text-gray-400"/></button>
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">{monthName}</span>
            <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><ChevronRight size={18} className="text-gray-600 dark:text-gray-400"/></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {[tr('Pn'), tr('Wt'), tr('Śr'), tr('Cz'), tr('Pt'), tr('So'), tr('Nd')].map(d => <div key={d} className="text-[10px] font-bold text-gray-400 uppercase">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isSelected = value === dateStr;
              const isToday = new Date().toDateString() === new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString();
              return (
                <button
                  key={day}
                  onClick={(e) => { e.stopPropagation(); handleDayClick(day); }}
                  className={`h-8 w-8 rounded-lg text-xs font-medium transition flex items-center justify-center
                    ${isSelected ? 'bg-accent-primary text-white shadow-md shadow-accent-primary-light/30' :
                      isToday ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 text-accent-primary dark:text-accent-primary-light border border-accent-primary-lighter dark:border-accent-primary-dark' :
                      'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Konfiguracja dla różnych służb
// UWAGA: to jest stała na poziomie modułu — ewaluowana przy imporcie, PRZED
// zamontowaniem komponentów. Wolno tu używać tylko globalnego `tr(...)`, nigdy
// hookowego `t` z useT() (nie istnieje w tym zasięgu → ReferenceError, biały ekran).
const MINISTRY_CONFIG = {
  worship: {
    tableName: 'module_events', teamType: 'worship',
    icon: '🎵',
    title: tr('Zespół Uwielbienia'),
    defaultType: 'proba',
    types: [
      { value: 'proba', label: tr('Próba') },
      { value: 'koncert', label: 'Koncert' },
      { value: 'nabozesnstwo', label: tr('Nabożeństwo') },
      { value: 'warsztat', label: 'Warsztat' },
      { value: 'inne', label: tr('Inne') }
    ],
    color: 'purple'
  },
  media: {
    tableName: 'module_events', teamType: 'media',
    icon: '🎬',
    title: 'Media Team',
    defaultType: 'produkcja',
    types: [
      { value: 'produkcja', label: 'Produkcja' },
      { value: 'szkolenie', label: 'Szkolenie' },
      { value: 'streaming', label: 'Streaming' },
      { value: 'inne', label: tr('Inne') }
    ],
    color: 'orange'
  },
  atmosfera: {
    tableName: 'module_events', teamType: 'atmosfera',
    icon: '💚',
    title: 'Atmosfera Team',
    defaultType: 'spotkanie',
    types: [
      { value: 'spotkanie', label: tr('Spotkanie') },
      { value: 'szkolenie', label: 'Szkolenie' },
      { value: 'integracja', label: tr('Integracja') },
      { value: 'inne', label: tr('Inne') }
    ],
    color: 'teal'
  },
  kids: {
    tableName: 'module_events', teamType: 'kids',
    icon: '👶',
    title: tr('Małe Avenit'),
    defaultType: 'zajecia',
    types: [
      { value: 'zajecia', label: tr('Zajęcia') },
      { value: 'wycieczka', label: 'Wycieczka' },
      { value: 'warsztat', label: 'Warsztat' },
      { value: 'przedstawienie', label: 'Przedstawienie' },
      { value: 'inne', label: tr('Inne') }
    ],
    color: 'yellow'
  },
  homegroups: {
    tableName: 'module_events', teamType: 'homegroups',
    icon: '🏠',
    title: 'Grupy Domowe',
    defaultType: 'spotkanie',
    types: [
      { value: 'spotkanie', label: tr('Spotkanie') },
      { value: 'integracja', label: tr('Integracja') },
      { value: 'szkolenie', label: 'Szkolenie' },
      { value: 'inne', label: tr('Inne') }
    ],
    color: 'blue'
  }
};

// Funkcja do uzyskania konfiguracji dla modułu (obsługuje niestandardowe moduły)
function getModuleConfig(ministry) {
  const t = useT();
  // Jeśli istnieje predefiniowana konfiguracja, użyj jej
  if (MINISTRY_CONFIG[ministry]) {
    return MINISTRY_CONFIG[ministry];
  }

  // Dla niestandardowych modułów - użyj domyślnej konfiguracji z dynamiczną nazwą tabeli
  return {
    tableName: 'module_events', teamType: ministry,
    icon: '📅',
    title: 'Wydarzenia',
    defaultType: 'spotkanie',
    types: [
      { value: 'spotkanie', label: t('Spotkanie') },
      { value: 'szkolenie', label: 'Szkolenie' },
      { value: 'warsztat', label: 'Warsztat' },
      { value: 'wydarzenie', label: t('Wydarzenie') },
      { value: 'inne', label: t('Inne') }
    ],
    color: 'pink'
  };
}

// Modal edycji wydarzenia
const EventModal = ({ event, onClose, onSave, onDelete, config }) => {
  const t = useT();
  const [form, setForm] = useState({
    id: event?.id || null,
    title: event?.title || '',
    description: event?.description || '',
    start_date: event?.start_date ? event.start_date.split('T')[0] : '',
    start_time: event?.start_date?.includes('T') ? event.start_date.split('T')[1].substring(0,5) : '',
    end_time: event?.end_time || '',
    location: event?.location || '',
    max_participants: event?.max_participants || '',
    event_type: event?.event_type || config.defaultType
  });

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error(tr('Tytuł wydarzenia jest wymagany'));
      return;
    }

    const eventData = {
      title: form.title.trim(),
      description: form.description.trim(),
      // Godzina „wall-clock" bez konwersji strefy. Wcześniej new Date(...).toISOString()
      // przesuwał lokalną godzinę do UTC (11:00 → 09:00Z), a odczyt (start_date.split('T')[1])
      // czytał surowy string → każdy zapis ucinał offset (2h) i kumulował się (10→8→6…).
      // Zapis jako jawne UTC sprawia, że odczytana godzina zawsze równa się wpisanej.
      start_date: form.start_date ? `${form.start_date}T${form.start_time || '00:00'}:00.000Z` : null,
      end_time: form.end_time || null,
      location: form.location,
      max_participants: form.max_participants ? parseInt(form.max_participants) : null,
      event_type: form.event_type || config.defaultType
    };

    onSave(form.id, eventData);
  };

  if (!document.body) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between mb-6">
          <h3 className="font-bold text-xl text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl">{config.icon}</span>
            {form.id ? 'Edytuj wydarzenie' : 'Nowe wydarzenie'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"><X size={20}/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Tytuł wydarzenia')}</label>
            <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder={t('Nazwa wydarzenia')} value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Opis')}</label>
            <textarea className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none" rows={3} placeholder={t('Szczegóły wydarzenia...')} value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Data')}</label>
              <CustomDatePicker value={form.start_date} onChange={val => setForm({...form, start_date: val})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Godzina rozpoczęcia')}</label>
              <TimeInput className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800" value={form.start_time || ''} onChange={v => setForm({...form, start_time: v})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Godzina zakończenia')}</label>
              <TimeInput className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800" value={form.end_time || ''} onChange={v => setForm({...form, end_time: v})} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Lokalizacja')}</label>
            <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder={t('Sala główna, Kościół...')} value={form.location || ''} onChange={e => setForm({...form, location: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Max. uczestników')}</label>
              <input type="number" className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="30" value={form.max_participants || ''} onChange={e => setForm({...form, max_participants: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Typ wydarzenia</label>
              <CustomSelect
                value={form.event_type}
                onChange={val => setForm({...form, event_type: val})}
                options={config.types}
              />
            </div>
          </div>

          <div className="flex justify-between items-center gap-3 mt-6">
            {form.id && onDelete ? (
              <button onClick={() => onDelete(form.id)} className="px-4 py-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition font-medium flex items-center gap-2">
                <Trash2 size={16} /> Usuń
              </button>
            ) : <div></div>}
            <div className="flex gap-3">
              <button onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">{t('Anuluj')}</button>
              <button onClick={handleSubmit} className="px-5 py-2.5 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white rounded-xl hover:shadow-lg hover:shadow-accent-primary-light/50 transition font-medium flex items-center gap-2">
                <Save size={16} /> Zapisz
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Główny komponent EventsTab
export default function EventsTab({ ministry, currentUserEmail: propUserEmail }) {
  const t = useT();
  const config = getModuleConfig(ministry);
  // Typy wydarzeń tego modułu: z konfiguracji (Ustawienia kalendarza modułu) lub domyślne.
  const calCfg = useModuleCalendar(ministry);
  const eventTypes = (calCfg?.types && calCfg.types.length) ? calCfg.types : config.types;
  const canManageCalendar = useCan('module:settings');
  const [showTypes, setShowTypes] = useState(false);
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [rsvpMap, setRsvpMap] = useState({}); // event_id -> { count, mine } (RSVP wydarzeń modułu)
  const [typeFilter, setTypeFilter] = useState('');
  const [tableExists, setTableExists] = useState(true);
  const [userEmail, setUserEmail] = useState(propUserEmail || null);

  // Pobierz email użytkownika jeśli nie został przekazany
  useEffect(() => {
    if (!propUserEmail) {
      const fetchUserEmail = async () => {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.email) {
          setUserEmail(data.user.email);
        }
      };
      fetchUserEmail();
    } else {
      setUserEmail(propUserEmail);
    }
  }, [propUserEmail]);

  useEffect(() => {
    fetchEvents();
  }, [selectedCampusId]);

  // ── RSVP / obecność na wydarzeniach modułu ──
  const fetchRsvp = async (evs) => {
    const ids = (evs || []).map((e) => e.id);
    if (!ids.length) { setRsvpMap({}); return; }
    try {
      const { data } = await supabase.from('event_registrations').select('event_id, user_email, status').in('event_id', ids);
      const m = {};
      (data || []).forEach((r) => {
        if (r.status === 'not_going') return;
        if (!m[r.event_id]) m[r.event_id] = { count: 0, mine: false };
        m[r.event_id].count += 1;
        if ((r.user_email || '').toLowerCase() === (userEmail || '').toLowerCase()) m[r.event_id].mine = true;
      });
      setRsvpMap(m);
    } catch { setRsvpMap({}); }
  };
  useEffect(() => { fetchRsvp(events); /* eslint-disable-next-line */ }, [events, userEmail]);
  const toggleRsvp = async (ev) => {
    if (!userEmail) { toast.error(tr('Zaloguj się, aby potwierdzić obecność')); return; }
    const mine = rsvpMap[ev.id]?.mine;
    try {
      if (mine) await supabase.from('event_registrations').delete().eq('event_id', ev.id).eq('user_email', userEmail);
      else await supabase.from('event_registrations').insert([{ event_id: ev.id, user_email: userEmail, full_name: userEmail.split('@')[0], status: 'going' }]);
      fetchRsvp(events);
    } catch (e) { toast.error(e.message); }
  };

  const fetchEvents = async () => {
    setLoading(true);
    // Jeden model: wydarzenia modułu = wspólna tabela `events` filtrowana po module_key.
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      const { data, error } = await withCampusFilter(supabase
        .from('events')
        .select('*'))
        .eq('module_key', config.teamType)
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) {
        console.error('Błąd pobierania wydarzeń:', error);
        setEvents([]);
      } else {
        setTableExists(true);
        // Normalizacja: reszta komponentu operuje na `start_date` (jak dawne module_events),
        // więc mapujemy date+time → start_date (wall-clock jako UTC, spójnie z modalem).
        setEvents((data || []).map((r) => ({
          ...r,
          start_date: r.date ? `${r.date}T${(r.time || '00:00')}:00.000Z` : null,
        })));
      }
    } catch (err) {
      console.error('Błąd pobierania wydarzeń:', err);
      setEvents([]);
    }
    setLoading(false);
  };

  const handleSave = async (id, eventData) => {
    // eventData z modala: start_date (ISO) + end_time + reszta. Mapujemy na kolumny `events` (date + time).
    const { start_date, team_type, ...rest } = eventData;
    const row = {
      ...rest,
      module_key: config.teamType,
      date: start_date ? start_date.split('T')[0] : null,
      time: start_date && start_date.includes('T') ? start_date.split('T')[1].substring(0, 5) : null,
    };
    let error = null;
    if (id) {
      const { error: e } = await supabase.from('events').update(row).eq('id', id);
      error = e;
    } else {
      const { error: e } = await supabase.from('events').insert([{ ...row, created_by: userEmail, campus_id: campusIdForInsert }]);
      error = e;
    }

    if (error) {
      toast.error(`Błąd zapisu wydarzenia: ${error.message}`);
    } else {
      setShowModal(null);
      fetchEvents();
    }
  };

  const handleDelete = async (id) => {
    if (confirm(tr('Czy na pewno chcesz usunąć to wydarzenie?'))) {
      await supabase.from('events').delete().eq('id', id);
      setShowModal(null);
      fetchEvents();
    }
  };

  const filteredEvents = events.filter(ev => {
    const matchesSearch = !searchFilter ||
      ev.title?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      ev.description?.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesType = !typeFilter || ev.event_type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Grupowanie wydarzeń po miesiącach
  const eventsByMonth = filteredEvents.reduce((acc, ev) => {
    if (!ev.start_date) return acc;
    const date = new Date(ev.start_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(ev);
    return acc;
  }, {});

  const colorClasses = {
    purple: 'from-purple-500 to-indigo-500',
    orange: 'from-accent-secondary-light to-red-500',
    teal: 'from-teal-500 to-green-500',
    yellow: 'from-yellow-500 to-amber-500',
    blue: 'from-blue-500 to-cyan-500'
  };

  const getTypeLabel = (type) => {
    const found = eventTypes.find(t => t.value === type);
    return found ? found.label : type;
  };

  // Dodaj kolor pink do colorClasses jeśli go brakuje
  if (!colorClasses[config.color]) {
    colorClasses[config.color] = 'from-accent-primary-light to-accent-secondary-light';
  }

  // Jeśli tabela nie istnieje, pokaż instrukcję
  if (!tableExists) {
    const sqlScript = `-- Utwórz tabelę ${config.tableName}
CREATE TABLE ${config.tableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ,
  location TEXT,
  max_participants INTEGER,
  event_type TEXT DEFAULT 'spotkanie',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Włącz RLS
ALTER TABLE ${config.tableName} ENABLE ROW LEVEL SECURITY;

-- Polityka dostępu dla zalogowanych użytkowników
CREATE POLICY "${config.tableName}_policy" ON ${config.tableName}
  FOR ALL USING (true) WITH CHECK (true);

-- Uprawnienia
GRANT ALL ON ${config.tableName} TO authenticated;
GRANT ALL ON ${config.tableName} TO anon;`;

    return (
      <div className="p-8 text-center">
        <div className="max-w-2xl mx-auto bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">
            Tabela nie istnieje
          </h3>
          <p className="text-yellow-700 dark:text-yellow-300 mb-4">
            {tr('Ta funkcja wymaga tabeli, której nie ma jeszcze w bazie danych. Skontaktuj się z administratorem.')}
          </p>
          <div className="bg-gray-900 rounded-xl p-4 text-left overflow-x-auto">
            <pre className="text-green-400 text-xs whitespace-pre">{sqlScript}</pre>
          </div>
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-4">
            {tr('Poproś administratora o utworzenie tabeli wg poniższego schematu.')}
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(sqlScript);
              toast.success('Skopiowano do schowka!');
            }}
            className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-xl hover:bg-yellow-700 transition"
          >
            Skopiuj SQL
          </button>
          <button
            onClick={fetchEvents}
            className="mt-4 ml-2 px-4 py-2 bg-accent-primary text-white rounded-xl hover:bg-accent-primary transition"
          >
            {tr('Odśwież')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Nagłówek */}
      <TabHeader className="!mb-0" title={t('Wydarzenia')} actions={
        <div className="flex items-center gap-2">
          {canManageCalendar && (
            <button
              onClick={() => setShowTypes(true)}
              className="text-sm px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-2"
            >
              <SlidersHorizontal size={16}/> {t('Typy')}
            </button>
          )}
          <button
            onClick={() => setShowModal({ id: null })}
            className="bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-accent-primary-light/50 transition flex items-center gap-2"
          >
            <Plus size={18}/> {t('Dodaj wydarzenie')}
          </button>
        </div>
      } />

      {/* Filtry */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex items-center gap-2">
          <Search className="text-gray-400 dark:text-gray-500" size={20} />
          <input
            className="w-full outline-none text-sm bg-transparent text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            placeholder={t('Szukaj wydarzeń...')}
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">Wszystkie typy</option>
            {eventTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista wydarzeń */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-accent-primary-light border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Calendar size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">{t('Brak wydarzeń')}</p>
          <p className="text-sm">{t('Kliknij "Dodaj wydarzenie" aby utworzyć pierwsze')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(eventsByMonth).sort().map(([monthKey, monthEvents]) => {
            const [year, month] = monthKey.split('-');
            const monthName = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

            return (
              <div key={monthKey}>
                <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-4 capitalize">{monthName}</h3>
                <div className="space-y-3">
                  {monthEvents.map(ev => {
                    const date = new Date(ev.start_date);
                    const timeStr = ev.start_date?.includes('T') ? ev.start_date.split('T')[1].substring(0,5) : null;

                    return (
                      <div
                        key={ev.id}
                        onClick={() => setShowModal(ev)}
                        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-accent-primary-lighter dark:hover:border-accent-primary-dark transition cursor-pointer group"
                      >
                        <div className="flex items-start gap-4">
                          {/* Data */}
                          <div className={`bg-gradient-to-br ${colorClasses[config.color] || 'from-accent-primary-light to-accent-secondary-light'} text-white rounded-xl p-3 text-center min-w-[70px]`}>
                            <div className="text-2xl font-bold">{date.getDate()}</div>
                            <div className="text-xs uppercase opacity-90">{date.toLocaleDateString('pl-PL', { weekday: 'short' })}</div>
                          </div>

                          {/* Treść */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-bold text-gray-800 dark:text-gray-200 text-lg">{ev.title}</h4>
                              <span className={`px-2 py-1 text-xs rounded-full font-medium bg-gradient-to-r ${colorClasses[config.color] || 'from-accent-primary-light to-accent-secondary-light'} text-white`}>
                                {getTypeLabel(ev.event_type)}
                              </span>
                            </div>
                            {ev.description && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{ev.description}</p>
                            )}
                            <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                              {timeStr && (
                                <span className="flex items-center gap-1">
                                  <Clock size={14} /> {timeStr}{ev.end_time ? ` - ${ev.end_time}` : ''}
                                </span>
                              )}
                              {ev.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin size={14} /> {ev.location}
                                </span>
                              )}
                              {ev.max_participants && (
                                <span className="flex items-center gap-1">
                                  <Users size={14} /> max. {ev.max_participants}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Akcje */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleRsvp(ev); }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${rsvpMap[ev.id]?.mine ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                              title={tr('Potwierdź obecność')}
                            >
                              <Users size={14} /> {rsvpMap[ev.id]?.mine ? tr('Będę') : tr('Potwierdź')}{rsvpMap[ev.id]?.count ? ` · ${rsvpMap[ev.id].count}` : ''}
                            </button>
                            <button className="opacity-0 group-hover:opacity-100 transition p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                              <Edit2 size={16} className="text-gray-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <EventModal
          event={showModal.id ? showModal : null}
          onClose={() => setShowModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          config={{ ...config, types: eventTypes }}
        />
      )}

      {showTypes && (
        <EventTypesEditor
          initial={eventTypes}
          onClose={() => setShowTypes(false)}
          onSave={async (types) => {
            try { await saveModuleCalendar(ministry, { ...(calCfg || {}), types }); toast.success(tr('Zapisano typy wydarzeń')); setShowTypes(false); }
            catch (e) { toast.error(e.message); }
          }}
        />
      )}
    </div>
  );
}

// Edytor typów wydarzeń modułu (label + kolor). Zapis do app_settings['module_calendar'].
function EventTypesEditor({ initial, onClose, onSave }) {
  const PALETTE = ['#e2445c', '#fdab3d', '#00c875', '#579bfc', '#a25ddc', '#00c2e0', '#ff5ac4', '#808080'];
  const [rows, setRows] = useState(() => (initial || []).map((tp) => ({ value: tp.value, label: tp.label, color: tp.color || '#808080' })));
  const add = () => setRows((r) => [...r, { value: `t_${Date.now().toString(36)}`, label: '', color: PALETTE[r.length % PALETTE.length] }]);
  const upd = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const del = (i) => setRows((r) => r.filter((_, j) => j !== i));
  return (
    <Modal isOpen onClose={onClose} title={tr('Typy wydarzeń')} size="md">
      <div className="p-5 space-y-2">
        {rows.map((row, i) => (
          <div key={row.value} className="flex items-center gap-2">
            <input value={row.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder={tr('Nazwa typu')}
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent-primary/30" />
            <div className="flex items-center gap-1 shrink-0">
              {PALETTE.map((c) => (
                <button key={c} onClick={() => upd(i, { color: c })} title={c}
                  className={`w-5 h-5 rounded-md ring-1 ring-black/10 ${row.color === c ? 'ring-2 ring-offset-1 ring-gray-800 dark:ring-white' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <button onClick={() => del(i)} className="p-1.5 text-gray-400 hover:text-red-500 shrink-0"><X size={16} /></button>
          </div>
        ))}
        <button onClick={add} className="flex items-center gap-1.5 text-sm text-accent-primary hover:text-accent-secondary mt-1"><Plus size={15} /> {tr('Dodaj typ')}</button>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">{tr('Anuluj')}</button>
        <button onClick={() => onSave(rows.filter((r) => r.label.trim()))} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium">{tr('Zapisz')}</button>
      </div>
    </Modal>
  );
}
