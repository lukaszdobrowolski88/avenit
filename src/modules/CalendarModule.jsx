import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
  Calendar as CalIcon, ChevronLeft, ChevronRight,
  Plus, CheckCircle, Clock, Video, Music, X, Save,
  Users, HeartHandshake, Home, Baby, Trash2,
  ChevronDown, MapPin, AlignLeft, Search, Check,
  FileText, LayoutGrid, List, LayoutList, Columns, CalendarPlus, ListTodo,
  Filter, PanelLeftClose, PanelLeft, AlertTriangle
} from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import ProgramEditorModal from './Programs/ProgramEditorModal';

// --- MODAL POTWIERDZENIA USUNIĘCIA ---

const ConfirmDeleteModal = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen || !document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-white/20 dark:border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={24} className="text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Anuluj
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition flex items-center justify-center gap-2"
          >
            <Trash2 size={16} /> Usuń
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- KONFIGURACJA ZESPOŁÓW I DANYCH ---

const TEAMS = {
  program: { label: 'Nabożeństwa', color: 'pink', icon: Music },
  media: { label: 'Media Team', color: 'orange', icon: Video },
  atmosfera: { label: 'Atmosfera', color: 'teal', icon: HeartHandshake },
  worship: { label: 'Zespół Uwielbienia', color: 'purple', icon: Music },
  kids: { label: 'Małe SCH TOMY', color: 'yellow', icon: Baby },
  groups: { label: 'Grupy Domowe', color: 'blue', icon: Home },
  mlodziezowka: { label: 'Młodzieżówka', color: 'rose', icon: Users },
};

// --- HELPERY UI ---

function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const update = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 300;
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
      update();
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
    }
  }, [isOpen]);
  return coords;
}

const CustomDatePicker = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  useEffect(() => { if (value) setViewDate(new Date(value)); }, [value]);

  const handleDayClick = (day) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    onChange(`${d.getFullYear()}-${month}-${dayStr}`);
    setIsOpen(false);
  };

  const { days, firstDay } = getDaysInMonth(viewDate);
  const daysArray = Array.from({ length: days }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDay });

  return (
    <div className="relative w-full">
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)} className="w-full h-[42px] px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center gap-2 cursor-pointer hover:border-accent-primary-light transition">
        <CalIcon size={16} className="text-accent-primary dark:text-accent-primary-light" />
        <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
          {value ? new Date(value).toLocaleDateString('pl-PL') : 'Wybierz datę'}
        </span>
      </div>
      {isOpen && coords.width > 0 && document.body && createPortal(
        <div className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 animate-in fade-in zoom-in-95 duration-100 w-[280px]" style={{ ...(coords.openUpward ? { bottom: `calc(100vh - ${coords.top}px)` } : { top: coords.top }), left: coords.left }}>
           <div className="flex justify-between items-center mb-4">
             <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1))); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronLeft size={18} /></button>
             <span className="text-sm font-bold capitalize text-gray-800 dark:text-white">{viewDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
             <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1))); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronRight size={18} /></button>
           </div>
           <div className="grid grid-cols-7 gap-1 text-center mb-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">{['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(d => <div key={d}>{d}</div>)}</div>
           <div className="grid grid-cols-7 gap-1">
             {emptyDays.map((_, i) => <div key={`e-${i}`} />)}
             {daysArray.map(d => {
               const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
               return (
                 <button key={d} onClick={(e) => { e.stopPropagation(); handleDayClick(d); }} className={`h-8 w-8 rounded-lg text-xs font-medium transition ${value === dateStr ? 'bg-accent-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                   {d}
                 </button>
               )
             })}
           </div>
        </div>, document.body
      )}
    </div>
  );
};

const CustomTimePicker = ({ value, onChange, placeholder = 'Wybierz' }) => {
  return (
    <div className="relative w-full">
      <input
        type="time"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-[42px] px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 font-medium hover:border-accent-primary-light focus:border-accent-primary-light focus:ring-2 focus:ring-accent-primary-light/20 outline-none transition cursor-pointer"
      />
    </div>
  );
};

const getDaysInMonth = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  return { days, firstDay: firstDay === 0 ? 6 : firstDay - 1 };
};

// --- MODAL WYBORU TYPU (WYDARZENIE VS ZADANIE) ---

const ModalSelectType = ({ date, onClose, onSelectTask, onSelectEvent }) => {
  if (!document.body) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-white/20 dark:border-gray-700 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
          <X size={20} className="text-gray-500" />
        </button>

        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
          <Plus size={24} className="text-accent-primary" /> Co chcesz dodać?
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {date ? new Date(date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Wybierz typ'}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onSelectEvent}
            className="flex flex-col items-center gap-3 p-6 bg-gradient-to-br from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 border-2 border-accent-primary-lighter dark:border-accent-primary-dark rounded-2xl hover:border-accent-primary-light dark:hover:border-accent-primary hover:shadow-lg transition group"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center text-white shadow-lg shadow-accent-primary-light/30 group-hover:scale-110 transition">
              <CalendarPlus size={28} />
            </div>
            <div className="text-center">
              <div className="font-bold text-gray-800 dark:text-white">Wydarzenie</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Nabożeństwo, spotkanie...</div>
            </div>
          </button>

          <button
            onClick={onSelectTask}
            className="flex flex-col items-center gap-3 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg transition group"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 group-hover:scale-110 transition">
              <ListTodo size={28} />
            </div>
            <div className="text-center">
              <div className="font-bold text-gray-800 dark:text-white">Zadanie</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Do zrobienia, reminder...</div>
            </div>
          </button>
        </div>
      </div>
    </div>, document.body
  );
};

// --- MODAL WYBORU KATEGORII WYDARZENIA ---

// Lista służb do wyboru przy dodawaniu wydarzenia
const MINISTRY_CALENDARS = [
  { key: 'worship', icon: '🎵', title: 'Zespół Uwielbienia', color: 'from-purple-500 to-indigo-500', description: 'Próby, koncerty, nabożeństwa' },
  { key: 'media', icon: '🎬', title: 'Media Team', color: 'from-accent-secondary-light to-red-500', description: 'Produkcje, streaming, szkolenia' },
  { key: 'atmosfera', icon: '💚', title: 'Atmosfera Team', color: 'from-teal-500 to-green-500', description: 'Spotkania, integracje' },
  { key: 'kids', icon: '👶', title: 'Małe SCH TOMY', color: 'from-yellow-500 to-amber-500', description: 'Zajęcia, warsztaty, wycieczki' },
  { key: 'homegroups', icon: '🏠', title: 'Grupy Domowe', color: 'from-blue-500 to-cyan-500', description: 'Spotkania grupowe' },
  { key: 'mlodziezowka', icon: '🎉', title: 'Młodzieżówka', color: 'from-accent-primary-light to-rose-500', description: 'Wydarzenia młodzieżowe' }
];

const ModalSelectEventCategory = ({ date, categories, onClose, onSelectCategory, onSelectMinistry }) => {
  if (!document.body) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-white/20 dark:border-gray-700 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
          <X size={20} className="text-gray-500" />
        </button>

        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
          <CalendarPlus size={24} className="text-accent-primary" /> Wybierz kalendarz
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {date ? new Date(date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        </p>

        <div className="space-y-2">
          {/* Nabożeństwo - zawsze na górze */}
          <button
            onClick={() => onSelectCategory('nabożeństwo')}
            className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 border-2 border-accent-primary-lighter dark:border-accent-primary-dark rounded-xl hover:border-accent-primary-light dark:hover:border-accent-primary hover:shadow-md transition group"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center text-white shadow-lg shadow-accent-primary-light/30 group-hover:scale-105 transition">
              <Music size={24} />
            </div>
            <div className="text-left flex-1">
              <div className="font-bold text-gray-800 dark:text-white">Nabożeństwo</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Pełny program z pieśniami i służbami</div>
            </div>
          </button>

          {/* Kalendarze służb */}
          {MINISTRY_CALENDARS.map(ministry => (
            <button
              key={ministry.key}
              onClick={() => onSelectMinistry(ministry.key)}
              className="w-full flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-accent-primary-light dark:hover:border-accent-primary hover:bg-accent-primary-lightest/50 dark:hover:bg-accent-primary-darkest/10 transition group"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${ministry.color} flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition text-2xl`}>
                {ministry.icon}
              </div>
              <div className="text-left flex-1">
                <div className="font-bold text-gray-800 dark:text-white">{ministry.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{ministry.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>, document.body
  );
};

// --- MODAL OGÓLNEGO WYDARZENIA (nie Nabożeństwo) ---

const ModalAddEvent = ({ initialEvent, category, onClose, onSave, onDelete }) => {
  const [event, setEvent] = useState(initialEvent || {
    title: '',
    description: '',
    category: category || '',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    end_time: '12:00',
    location: ''
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (initialEvent) {
      setEvent({
        ...initialEvent,
        category: initialEvent.category || category || '',
        location: initialEvent.location || '',
        description: initialEvent.description || ''
      });
    }
  }, [initialEvent, category]);

  const handleSubmit = async () => {
    if (!event.title) return alert('Podaj tytuł wydarzenia');

    const payload = {
      title: event.title,
      description: event.description || '',
      category: event.category || category,
      date: event.date,
      time: event.time || '10:00',
      end_time: event.end_time || '',
      location: event.location || ''
    };

    if (event.id) payload.id = event.id;

    onSave(payload);
    onClose();
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete(event.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  if (!document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-white/20 dark:border-gray-700 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
          <X size={20} className="text-gray-500" />
        </button>

        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
          <CalendarPlus size={24} className="text-accent-primary" />
          {event.id ? 'Edytuj Wydarzenie' : 'Nowe Wydarzenie'}
        </h2>
        <div className="mb-6">
          <span className="inline-block px-3 py-1 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light text-xs font-bold rounded-full">
            {event.category || category}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tytuł</label>
            <input
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 outline-none"
              value={event.title}
              onChange={e => setEvent({...event, title: e.target.value})}
              placeholder="Nazwa wydarzenia"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label>
            <CustomDatePicker value={event.date} onChange={v => setEvent({...event, date: v})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Godzina rozpoczęcia</label>
              <CustomTimePicker
                value={event.time}
                onChange={v => setEvent({...event, time: v})}
                placeholder="Wybierz"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Godzina zakończenia</label>
              <CustomTimePicker
                value={event.end_time || ''}
                onChange={v => setEvent({...event, end_time: v})}
                placeholder="Opcjonalnie"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Miejsce</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm"
                value={event.location || ''}
                onChange={e => setEvent({...event, location: e.target.value})}
                placeholder="np. Sala główna"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Opis</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm h-24 resize-none"
              value={event.description || ''}
              onChange={e => setEvent({...event, description: e.target.value})}
              placeholder="Szczegóły wydarzenia..."
            />
          </div>
        </div>

        <div className="mt-6 flex justify-between items-center">
          {event.id && onDelete ? (
            <button onClick={handleDeleteClick} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
              <Trash2 size={16}/> Usuń
            </button>
          ) : <div></div>}

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition">Anuluj</button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-bold rounded-xl hover:shadow-lg shadow-accent-primary-light/30 flex items-center gap-2 transition">
              <Save size={16} /> Zapisz
            </button>
          </div>
        </div>

        <ConfirmDeleteModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
          title="Usuń wydarzenie"
          message="Czy na pewno chcesz usunąć to wydarzenie? Tej operacji nie można cofnąć."
        />
      </div>
    </div>, document.body
  );
};

// --- TASK MODAL ---

const ModalAddTask = ({ initialTask, onClose, onSave, onDelete }) => {
  const [task, setTask] = useState(initialTask || {
    title: '',
    description: '',
    team: 'media',
    due_date: new Date().toISOString().split('T')[0],
    due_time: '10:00',
    end_time: '11:00',
    location: '',
    status: 'Do zrobienia'
  });

  useEffect(() => {
      if (initialTask) {
          setTask({
              ...initialTask,
              location: initialTask.location || '',
              description: initialTask.description || '',
              end_time: initialTask.end_time || ''
          });
      }
  }, [initialTask]);

  const handleDateChange = (val) => {
      setTask(prev => ({...prev, due_date: val}));
  };

  const handleSubmit = () => {
    if (!task.title) return alert('Podaj tytuł');

    const dateStr = task.due_date;
    const timeStr = task.due_time || '00:00';

    // Tworzymy datę w formacie ISO z offsetem, aby baza zapisała to poprawnie
    const localDate = new Date(`${dateStr}T${timeStr}:00`);

    const payload = {
        title: task.title,
        description: task.description || '',
        team: task.team || 'media',
        due_date: localDate.toISOString(), // Pełny timestamp ISO
        due_time: task.due_time || null,
        end_time: task.end_time || null,
        location: task.location || '',
        status: task.status || 'Do zrobienia'
    };

    if (task.id) payload.id = task.id;

    onSave(payload);
    onClose();
  };

  if (!document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-white/20 dark:border-gray-700 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><X size={20} className="text-gray-500" /></button>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            {task.id ? <CheckCircle size={24} className="text-blue-600" /> : <Plus size={24} className="text-blue-600" />} 
            {task.id ? 'Edytuj Zadanie' : 'Nowe Zadanie'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tytuł</label>
            <input autoFocus className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none" value={task.title} onChange={e => setTask({...task, title: e.target.value})} placeholder="Co jest do zrobienia?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kategoria</label><CustomSelect value={task.team} onChange={v => setTask({...task, team: v})} options={Object.entries(TEAMS).filter(([k]) => k !== 'program').map(([k, v]) => ({ value: k, label: v.label }))} /></div>
             <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Miejsce</label><div className="relative"><MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm" value={task.location || ''} onChange={e => setTask({...task, location: e.target.value})} placeholder="np. Biuro" /></div></div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label>
            <CustomDatePicker value={task.due_date} onChange={handleDateChange} />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Godzina rozpoczęcia</label><CustomTimePicker value={task.due_time} onChange={v => setTask({...task, due_time: v})} placeholder="Od" /></div>
             <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Godzina zakończenia</label><CustomTimePicker value={task.end_time} onChange={v => setTask({...task, end_time: v})} placeholder="Do" /></div>
          </div>
          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Opis</label><textarea className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm h-24 resize-none" value={task.description || ''} onChange={e => setTask({...task, description: e.target.value})} placeholder="Szczegóły zadania..." /></div>
        </div>
        <div className="mt-6 flex justify-between items-center">
           {task.id && onDelete ? (
              <button onClick={() => onDelete(task.id)} className="text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><Trash2 size={16}/> Usuń</button>
           ) : <div></div>}
           
           <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition">Anuluj</button>
              <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-500/30 transition"><Save size={16} /> Zapisz</button>
           </div>
        </div>
      </div>
    </div>, document.body
  );
};

const EventBadge = ({ event, onClick }) => {
  const teamConfig = TEAMS[event.team] || TEAMS.media;
  const colors = {
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    orange: "bg-accent-secondary-lighter text-accent-secondary border-accent-secondary-lighter",
    pink: "bg-accent-primary-lighter text-accent-primary border-accent-primary-lighter",
    purple: "bg-purple-100 text-purple-700 border-purple-200",
    yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
    teal: "bg-teal-100 text-teal-700 border-teal-200",
    rose: "bg-rose-100 text-rose-700 border-rose-200",
  };
  const style = colors[teamConfig.color] || colors.orange;

  // Formatowanie czasu z raw data, aby uniknąć konwersji stref czasowych
  let timeDisplay = "";
  if (event.raw) {
      // Próbujemy wziąć wprost due_time jeśli istnieje, a jak nie to parsować datę
      if (event.raw.due_time && event.raw.due_time.length === 5) {
         timeDisplay = event.raw.end_time ? `${event.raw.due_time} - ${event.raw.end_time}` : event.raw.due_time;
      } else if (event.raw.due_date && event.raw.due_date.includes('T')) {
          const parts = event.raw.due_date.split('T')[1].split(':');
          timeDisplay = `${parts[0]}:${parts[1]}`;
      }
  }

  return (
    <div onClick={e => { e.stopPropagation(); onClick(event); }} className={`text-[10px] px-1.5 py-1 rounded-md border mb-1 cursor-pointer truncate flex items-center gap-1 transition hover:brightness-95 ${style}`}>
      <div className={`w-1.5 h-1.5 rounded-full bg-current opacity-50`} />
      <span className="truncate font-medium">{event.title}</span>
      {timeDisplay && <span className="ml-auto opacity-60 text-[9px]">{timeDisplay}</span>}
    </div>
  );
};


// --- UNIWERSALNY MODAL WYDARZEŃ SŁUŻB ---

const MINISTRY_EVENT_CONFIG = {
  mlodziezowka: {
    icon: '🎉',
    title: 'Młodzieżówka',
    defaultType: 'spotkanie',
    types: [
      { value: 'spotkanie', label: 'Spotkanie' },
      { value: 'wyjazd', label: 'Wyjazd' },
      { value: 'integracja', label: 'Integracja' },
      { value: 'inne', label: 'Inne' }
    ]
  },
  worship: {
    icon: '🎵',
    title: 'Zespół Uwielbienia',
    defaultType: 'proba',
    types: [
      { value: 'proba', label: 'Próba' },
      { value: 'koncert', label: 'Koncert' },
      { value: 'nabozesnstwo', label: 'Nabożeństwo' },
      { value: 'warsztat', label: 'Warsztat' },
      { value: 'inne', label: 'Inne' }
    ]
  },
  media: {
    icon: '🎬',
    title: 'Media Team',
    defaultType: 'produkcja',
    types: [
      { value: 'produkcja', label: 'Produkcja' },
      { value: 'szkolenie', label: 'Szkolenie' },
      { value: 'streaming', label: 'Streaming' },
      { value: 'inne', label: 'Inne' }
    ]
  },
  atmosfera: {
    icon: '💚',
    title: 'Atmosfera Team',
    defaultType: 'spotkanie',
    types: [
      { value: 'spotkanie', label: 'Spotkanie' },
      { value: 'szkolenie', label: 'Szkolenie' },
      { value: 'integracja', label: 'Integracja' },
      { value: 'inne', label: 'Inne' }
    ]
  },
  kids: {
    icon: '👶',
    title: 'Małe SCH TOMY',
    defaultType: 'zajecia',
    types: [
      { value: 'zajecia', label: 'Zajęcia' },
      { value: 'wycieczka', label: 'Wycieczka' },
      { value: 'warsztat', label: 'Warsztat' },
      { value: 'przedstawienie', label: 'Przedstawienie' },
      { value: 'inne', label: 'Inne' }
    ]
  },
  homegroups: {
    icon: '🏠',
    title: 'Grupy Domowe',
    defaultType: 'spotkanie',
    types: [
      { value: 'spotkanie', label: 'Spotkanie' },
      { value: 'integracja', label: 'Integracja' },
      { value: 'szkolenie', label: 'Szkolenie' },
      { value: 'inne', label: 'Inne' }
    ]
  }
};

const ModalMinistryEvent = ({ event, onClose, onSave, onDelete, ministry }) => {
  const config = MINISTRY_EVENT_CONFIG[ministry];
  const [eventForm, setEventForm] = useState({
    id: event?.id || null,
    title: event?.title?.replace(/^[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}]+\s*/gu, '') || '', // Usuwa tylko emoji z początku
    description: event?.description || '',
    start_date: event?.start_date ? event.start_date.split('T')[0] : '',
    event_time: event?.due_time || '',
    end_time: event?.end_time || '',
    location: event?.location || '',
    max_participants: event?.max_participants || '',
    event_type: event?.event_type || config?.defaultType || 'spotkanie'
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSubmit = async () => {
    if (!eventForm.title.trim()) {
      alert('Tytuł wydarzenia jest wymagany');
      return;
    }

    const eventData = {
      title: eventForm.title.trim(),
      description: eventForm.description.trim(),
      start_date: eventForm.start_date ? new Date(eventForm.start_date + (eventForm.event_time ? 'T' + eventForm.event_time : 'T00:00:00')).toISOString() : null,
      end_time: eventForm.end_time || null,
      location: eventForm.location,
      max_participants: eventForm.max_participants ? parseInt(eventForm.max_participants) : null,
      event_type: eventForm.event_type || config?.defaultType
    };

    onSave(eventForm.id, eventData);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete(eventForm.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  if (!document.body || !config) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700">
        <div className="flex justify-between mb-6">
          <h3 className="font-bold text-xl text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl">{config.icon}</span>
            {eventForm.id ? `Edytuj wydarzenie - ${config.title}` : `Nowe wydarzenie - ${config.title}`}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"><X size={20}/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tytuł</label>
            <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="Nazwa wydarzenia" value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Opis</label>
            <textarea className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none" rows={3} placeholder="Szczegóły wydarzenia..." value={eventForm.description || ''} onChange={e => setEventForm({...eventForm, description: e.target.value})} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Data</label>
              <CustomDatePicker value={eventForm.start_date} onChange={val => setEventForm({...eventForm, start_date: val})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Początek</label>
              <CustomTimePicker value={eventForm.event_time || ''} onChange={v => setEventForm({...eventForm, event_time: v})} placeholder="Od" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Koniec</label>
              <CustomTimePicker value={eventForm.end_time || ''} onChange={v => setEventForm({...eventForm, end_time: v})} placeholder="Do" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Lokalizacja</label>
            <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="Sala główna, Kościół..." value={eventForm.location || ''} onChange={e => setEventForm({...eventForm, location: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Maks. osób</label>
              <input type="number" className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="30" value={eventForm.max_participants || ''} onChange={e => setEventForm({...eventForm, max_participants: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Typ</label>
              <CustomSelect
                value={eventForm.event_type}
                onChange={val => setEventForm({...eventForm, event_type: val})}
                options={config.types}
              />
            </div>
          </div>

          <div className="flex justify-between items-center gap-3 mt-6">
            {eventForm.id && onDelete ? (
              <button onClick={handleDeleteClick} className="px-4 py-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition font-medium flex items-center gap-2">
                <Trash2 size={16} /> Usuń
              </button>
            ) : <div></div>}
            <div className="flex gap-3">
              <button onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Anuluj</button>
              <button onClick={handleSubmit} className="px-5 py-2.5 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white rounded-xl hover:shadow-lg hover:shadow-accent-primary-light/50 transition font-medium flex items-center gap-2">
                <Save size={16} /> Zapisz
              </button>
            </div>
          </div>
        </div>

        <ConfirmDeleteModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
          title="Usuń wydarzenie"
          message={`Czy na pewno chcesz usunąć to wydarzenie z ${config.title}? Tej operacji nie można cofnąć.`}
        />
      </div>
    </div>,
    document.body
  );
};

// --- MAIN MODULE ---


export default function CalendarModule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [songs, setSongs] = useState([]);
  const [visibleTeams, setVisibleTeams] = useState(() => {
    const saved = localStorage.getItem('calendarVisibleTeams');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Sprawdź czy wszystkie klucze są prawidłowe
        const validKeys = Object.keys(TEAMS);
        const filtered = parsed.filter(key => validKeys.includes(key));
        return filtered.length > 0 ? filtered : validKeys;
      } catch {
        return Object.keys(TEAMS);
      }
    }
    return Object.keys(TEAMS);
  });
  const [modals, setModals] = useState({
    addTask: null,
    editProgram: null,
    selectType: null,      // { date: 'YYYY-MM-DD' } - modal wyboru typu
    selectCategory: null,  // { date: 'YYYY-MM-DD' } - modal wyboru kategorii wydarzenia
    addEvent: null,        // { date, category } - modal dodawania ogólnego wydarzenia
    mlodziezowkaEvent: null, // { event data } - modal edycji wydarzenia Młodzieżówki
    worshipEvent: null,    // { event data } - modal edycji wydarzenia Zespołu Uwielbienia
    mediaEvent: null,      // { event data } - modal edycji wydarzenia Media Team
    atmosferaEvent: null,  // { event data } - modal edycji wydarzenia Atmosfera Team
    kidsEvent: null,       // { event data } - modal edycji wydarzenia Małe SCH TOMY
    homegroupsEvent: null  // { event data } - modal edycji wydarzenia Grup Domowych
  });
  const [view, setView] = useState('month');
  const [eventCategories, setEventCategories] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  // Śledzenie rozmiaru okna dla responsywności
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Zapisz wybrane kalendarze do localStorage przy każdej zmianie
  useEffect(() => {
    localStorage.setItem('calendarVisibleTeams', JSON.stringify(visibleTeams));
  }, [visibleTeams]);

  useEffect(() => {
      fetchEvents();
      fetchSongs();
      fetchEventCategories();
  }, [currentDate.getMonth()]);

  const fetchEventCategories = async () => {
    const { data } = await supabase.from('app_dictionaries').select('*').eq('category', 'event_category');
    if (data) setEventCategories(data);
  };

  const fetchSongs = async () => {
      const { data } = await supabase.from('songs').select('*');
      if (data) setSongs(data);
  }

  const fetchEvents = async () => {
    const { data: prog } = await supabase.from('programs').select('*');
    const { data: task } = await supabase.from('tasks').select('*');
    const { data: eventsData } = await supabase.from('events').select('*');
    const { data: mlodziezowkaEvents } = await supabase.from('mlodziezowka_events').select('*');
    const { data: worshipEvents } = await supabase.from('worship_events').select('*');
    const { data: mediaEvents } = await supabase.from('media_events').select('*');
    const { data: atmosferaEvents } = await supabase.from('atmosfera_events').select('*');
    const { data: kidsEvents } = await supabase.from('kids_events').select('*');
    const { data: homegroupsEvents } = await supabase.from('homegroups_events').select('*');
    const all = [];

    prog?.forEach(p => all.push({ id: p.id, type: 'program', team: 'program', title: p.title || 'Nabożeństwo', date: new Date(p.date), raw: p }));

    // Ogólne wydarzenia (nie-nabożeństwa)
    eventsData?.forEach(ev => {
        if (!ev.date) return;
        const d = new Date(ev.date);
        if (isNaN(d.getTime())) return;

        all.push({
            id: ev.id,
            type: 'event',
            team: 'program', // Wyświetlamy jak program (różowe)
            title: ev.title,
            date: d,
            raw: {
                ...ev,
                due_time: ev.time || '10:00'
            }
        });
    });

    task?.forEach(t => {
        if (!t.due_date) return;
        const d = new Date(t.due_date);
        if (isNaN(d.getTime())) return;

        // FIX 2: Pobieranie czasu bezpośrednio ze stringa ISO, aby uniknąć przesunięć
        // Format ISO: YYYY-MM-DDTHH:MM:SS
        let timeStr = '00:00';
        let dateStr = t.due_date.split('T')[0];

        if (t.due_date.includes('T')) {
           const timePart = t.due_date.split('T')[1];
           const [h, m] = timePart.split(':');
           timeStr = `${h}:${m}`;
        }

        all.push({
            id: t.id,
            type: 'task',
            team: t.team || 'media',
            title: t.title,
            date: d,
            status: t.status,
            // Przekazujemy "surową" godzinę i datę do edycji
            raw: {
                ...t,
                due_time: timeStr,
                due_date: dateStr
            }
        });
    });

    // Wydarzenia z Młodzieżówki
    mlodziezowkaEvents?.forEach(ev => {
        if (!ev.start_date) return;
        const d = new Date(ev.start_date);
        if (isNaN(d.getTime())) return;

        let timeStr = '00:00';
        if (ev.start_date.includes('T')) {
            const timePart = ev.start_date.split('T')[1];
            const [h, m] = timePart.split(':');
            timeStr = `${h}:${m}`;
        }

        all.push({
            id: `mlodziezowka_${ev.id}`,
            type: 'mlodziezowka',
            team: 'mlodziezowka',
            title: `🎉 ${ev.title}`,
            date: d,
            raw: { ...ev, due_time: timeStr }
        });
    });

    // Wydarzenia z Zespołu Uwielbienia
    worshipEvents?.forEach(ev => {
        if (!ev.start_date) return;
        const d = new Date(ev.start_date);
        if (isNaN(d.getTime())) return;

        let timeStr = '00:00';
        if (ev.start_date.includes('T')) {
            const timePart = ev.start_date.split('T')[1];
            const [h, m] = timePart.split(':');
            timeStr = `${h}:${m}`;
        }

        all.push({
            id: `worship_${ev.id}`,
            type: 'worship_event',
            team: 'worship',
            title: `🎵 ${ev.title}`,
            date: d,
            raw: { ...ev, due_time: timeStr }
        });
    });

    // Wydarzenia z Media Team
    mediaEvents?.forEach(ev => {
        if (!ev.start_date) return;
        const d = new Date(ev.start_date);
        if (isNaN(d.getTime())) return;

        let timeStr = '00:00';
        if (ev.start_date.includes('T')) {
            const timePart = ev.start_date.split('T')[1];
            const [h, m] = timePart.split(':');
            timeStr = `${h}:${m}`;
        }

        all.push({
            id: `media_${ev.id}`,
            type: 'media_event',
            team: 'media',
            title: `🎬 ${ev.title}`,
            date: d,
            raw: { ...ev, due_time: timeStr }
        });
    });

    // Wydarzenia z Atmosfera Team
    atmosferaEvents?.forEach(ev => {
        if (!ev.start_date) return;
        const d = new Date(ev.start_date);
        if (isNaN(d.getTime())) return;

        let timeStr = '00:00';
        if (ev.start_date.includes('T')) {
            const timePart = ev.start_date.split('T')[1];
            const [h, m] = timePart.split(':');
            timeStr = `${h}:${m}`;
        }

        all.push({
            id: `atmosfera_${ev.id}`,
            type: 'atmosfera_event',
            team: 'atmosfera',
            title: `💚 ${ev.title}`,
            date: d,
            raw: { ...ev, due_time: timeStr }
        });
    });

    // Wydarzenia z Małe SCH TOMY (Kids)
    kidsEvents?.forEach(ev => {
        if (!ev.start_date) return;
        const d = new Date(ev.start_date);
        if (isNaN(d.getTime())) return;

        let timeStr = '00:00';
        if (ev.start_date.includes('T')) {
            const timePart = ev.start_date.split('T')[1];
            const [h, m] = timePart.split(':');
            timeStr = `${h}:${m}`;
        }

        all.push({
            id: `kids_${ev.id}`,
            type: 'kids_event',
            team: 'kids',
            title: `👶 ${ev.title}`,
            date: d,
            raw: { ...ev, due_time: timeStr }
        });
    });

    // Wydarzenia z Grup Domowych
    homegroupsEvents?.forEach(ev => {
        if (!ev.start_date) return;
        const d = new Date(ev.start_date);
        if (isNaN(d.getTime())) return;

        let timeStr = '00:00';
        if (ev.start_date.includes('T')) {
            const timePart = ev.start_date.split('T')[1];
            const [h, m] = timePart.split(':');
            timeStr = `${h}:${m}`;
        }

        all.push({
            id: `homegroups_${ev.id}`,
            type: 'homegroups_event',
            team: 'groups',
            title: `🏠 ${ev.title}`,
            date: d,
            raw: { ...ev, due_time: timeStr }
        });
    });

    setEvents(all.filter(e => e.date));
  };

  const handleSaveTask = async (taskData) => { 
      let error = null;
      if (taskData.id) {
          const { error: e } = await supabase.from('tasks').update(taskData).eq('id', taskData.id);
          error = e;
      } else {
          const { error: e } = await supabase.from('tasks').insert([taskData]); 
          error = e;
      }

      if (error) {
          alert(`Błąd zapisu: ${error.message}`);
          console.error(error);
      } else {
          fetchEvents(); 
      }
  };

  const handleDeleteTask = async (id) => {
      if (confirm("Czy na pewno chcesz usunąć to zadanie?")) {
          await supabase.from('tasks').delete().eq('id', id);
          setModals({...modals, addTask: null});
          fetchEvents();
      }
  }

  const handleSaveProgram = async () => { fetchEvents(); };

  const handleDeleteProgram = async (programId) => {
    fetchEvents();
  };

  // Obsługa zapisywania ogólnych wydarzeń
  const handleSaveEvent = async (eventData) => {
    let error = null;
    if (eventData.id) {
      const { error: e } = await supabase.from('events').update(eventData).eq('id', eventData.id);
      error = e;
    } else {
      const { error: e } = await supabase.from('events').insert([eventData]);
      error = e;
    }

    if (error) {
      alert(`Błąd zapisu wydarzenia: ${error.message}`);
      console.error(error);
    } else {
      fetchEvents();
    }
  };

  const handleDeleteEvent = async (id) => {
    if (confirm("Czy na pewno chcesz usunąć to wydarzenie?")) {
      await supabase.from('events').delete().eq('id', id);
      setModals({...modals, addEvent: null});
      fetchEvents();
    }
  };

  // Obsługa zapisywania wydarzeń Młodzieżówki
  const handleSaveMlodziezowkaEvent = async (id, eventData) => {
    let error = null;
    if (id) {
      const { error: e } = await supabase.from('mlodziezowka_events').update(eventData).eq('id', id);
      error = e;
    } else {
      const { error: e } = await supabase.from('mlodziezowka_events').insert([eventData]);
      error = e;
    }

    if (error) {
      alert(`Błąd zapisu wydarzenia: ${error.message}`);
      console.error(error);
    } else {
      setModals({...modals, mlodziezowkaEvent: null});
      fetchEvents();
    }
  };

  const handleDeleteMlodziezowkaEvent = async (id) => {
    if (confirm("Czy na pewno chcesz usunąć to wydarzenie Młodzieżówki?")) {
      await supabase.from('mlodziezowka_events').delete().eq('id', id);
      setModals({...modals, mlodziezowkaEvent: null});
      fetchEvents();
    }
  };

  // Obsługa zapisywania wydarzeń Zespołu Uwielbienia
  const handleSaveWorshipEvent = async (id, eventData) => {
    let error = null;
    if (id) {
      const { error: e } = await supabase.from('worship_events').update(eventData).eq('id', id);
      error = e;
    } else {
      const { error: e } = await supabase.from('worship_events').insert([eventData]);
      error = e;
    }
    if (error) {
      alert(`Błąd zapisu wydarzenia: ${error.message}`);
    } else {
      setModals({...modals, worshipEvent: null});
      fetchEvents();
    }
  };

  const handleDeleteWorshipEvent = async (id) => {
    if (confirm("Czy na pewno chcesz usunąć to wydarzenie?")) {
      await supabase.from('worship_events').delete().eq('id', id);
      setModals({...modals, worshipEvent: null});
      fetchEvents();
    }
  };

  // Obsługa zapisywania wydarzeń Media Team
  const handleSaveMediaEvent = async (id, eventData) => {
    let error = null;
    if (id) {
      const { error: e } = await supabase.from('media_events').update(eventData).eq('id', id);
      error = e;
    } else {
      const { error: e } = await supabase.from('media_events').insert([eventData]);
      error = e;
    }
    if (error) {
      alert(`Błąd zapisu wydarzenia: ${error.message}`);
    } else {
      setModals({...modals, mediaEvent: null});
      fetchEvents();
    }
  };

  const handleDeleteMediaEvent = async (id) => {
    if (confirm("Czy na pewno chcesz usunąć to wydarzenie?")) {
      await supabase.from('media_events').delete().eq('id', id);
      setModals({...modals, mediaEvent: null});
      fetchEvents();
    }
  };

  // Obsługa zapisywania wydarzeń Atmosfera Team
  const handleSaveAtmosferaEvent = async (id, eventData) => {
    let error = null;
    if (id) {
      const { error: e } = await supabase.from('atmosfera_events').update(eventData).eq('id', id);
      error = e;
    } else {
      const { error: e } = await supabase.from('atmosfera_events').insert([eventData]);
      error = e;
    }
    if (error) {
      alert(`Błąd zapisu wydarzenia: ${error.message}`);
    } else {
      setModals({...modals, atmosferaEvent: null});
      fetchEvents();
    }
  };

  const handleDeleteAtmosferaEvent = async (id) => {
    if (confirm("Czy na pewno chcesz usunąć to wydarzenie?")) {
      await supabase.from('atmosfera_events').delete().eq('id', id);
      setModals({...modals, atmosferaEvent: null});
      fetchEvents();
    }
  };

  // Obsługa zapisywania wydarzeń Małe SCH TOMY
  const handleSaveKidsEvent = async (id, eventData) => {
    let error = null;
    if (id) {
      const { error: e } = await supabase.from('kids_events').update(eventData).eq('id', id);
      error = e;
    } else {
      const { error: e } = await supabase.from('kids_events').insert([eventData]);
      error = e;
    }
    if (error) {
      alert(`Błąd zapisu wydarzenia: ${error.message}`);
    } else {
      setModals({...modals, kidsEvent: null});
      fetchEvents();
    }
  };

  const handleDeleteKidsEvent = async (id) => {
    if (confirm("Czy na pewno chcesz usunąć to wydarzenie?")) {
      await supabase.from('kids_events').delete().eq('id', id);
      setModals({...modals, kidsEvent: null});
      fetchEvents();
    }
  };

  // Obsługa zapisywania wydarzeń Grup Domowych
  const handleSaveHomegroupsEvent = async (id, eventData) => {
    let error = null;
    if (id) {
      const { error: e } = await supabase.from('homegroups_events').update(eventData).eq('id', id);
      error = e;
    } else {
      const { error: e } = await supabase.from('homegroups_events').insert([eventData]);
      error = e;
    }
    if (error) {
      alert(`Błąd zapisu wydarzenia: ${error.message}`);
    } else {
      setModals({...modals, homegroupsEvent: null});
      fetchEvents();
    }
  };

  const handleDeleteHomegroupsEvent = async (id) => {
    if (confirm("Czy na pewno chcesz usunąć to wydarzenie?")) {
      await supabase.from('homegroups_events').delete().eq('id', id);
      setModals({...modals, homegroupsEvent: null});
      fetchEvents();
    }
  };

  // Flow dodawania: kliknięcie na + otwiera modal wyboru typu
  const handleAddClick = (dateStr) => {
    setModals({...modals, selectType: { date: dateStr }});
  };

  // Po wyborze "Wydarzenie" - otwórz modal kategorii
  const handleSelectEvent = () => {
    const date = modals.selectType?.date;
    setModals({...modals, selectType: null, selectCategory: { date }});
  };

  // Po wyborze "Zadanie" - otwórz modal zadania
  const handleSelectTask = () => {
    const date = modals.selectType?.date;
    setModals({
      ...modals,
      selectType: null,
      addTask: { due_date: date, due_time: '10:00', end_time: '11:00', team: 'media' }
    });
  };

  // Po wyborze kategorii wydarzenia
  const handleSelectCategory = async (category) => {
    const date = modals.selectCategory?.date;

    if (category.toLowerCase() === 'nabożeństwo') {
      // Utwórz nowy program i otwórz edytor
      const { data, error } = await supabase.from('programs').insert([{
        date: date,
        schedule: [],
        zespol: { lider: '', piano: '', gitara_akustyczna: '', gitara_elektryczna: '', bas: '', wokale: '', cajon: '', notatki: '', absencja: '' },
        atmosfera_team: { przygotowanie: '', witanie: '' },
        produkcja: { naglosnienie: '', propresenter: '', social: '', host: '' },
        scena: { prowadzenie: '', czytanie: '', kazanie: '', modlitwa: '', wieczerza: '', ogloszenia: '' },
        szkolka: { mlodsza: '', srednia: '', starsza: '' }
      }]).select().single();

      if (error) {
        alert('Błąd tworzenia nabożeństwa: ' + error.message);
        return;
      }

      setModals({...modals, selectCategory: null, editProgram: data.id});
      fetchEvents();
    } else {
      // Otwórz modal ogólnego wydarzenia
      setModals({
        ...modals,
        selectCategory: null,
        addEvent: { date, category, title: '', time: '10:00' }
      });
    }
  };

  // Po wyborze służby (kalendarza) - otwórz odpowiedni modal wydarzenia
  const handleSelectMinistry = (ministryKey) => {
    const date = modals.selectCategory?.date;
    const modalKey = ministryKey === 'mlodziezowka' ? 'mlodziezowkaEvent' :
                     ministryKey === 'worship' ? 'worshipEvent' :
                     ministryKey === 'media' ? 'mediaEvent' :
                     ministryKey === 'atmosfera' ? 'atmosferaEvent' :
                     ministryKey === 'kids' ? 'kidsEvent' :
                     ministryKey === 'homegroups' ? 'homegroupsEvent' : null;

    if (modalKey) {
      setModals({
        ...modals,
        selectCategory: null,
        [modalKey]: {
          id: null,
          title: '',
          description: '',
          start_date: date,
          due_time: '10:00',
          end_time: '11:00',
          location: '',
          max_participants: null,
          event_type: MINISTRY_EVENT_CONFIG[ministryKey]?.defaultType || 'spotkanie'
        }
      });
    }
  };

  // Obsługa kliknięcia w wydarzenie na kalendarzu
  const handleEventClick = (ev) => {
    // Wydarzenia z poszczególnych służb
    if (ev.type === 'mlodziezowka') {
      const realId = ev.id.replace('mlodziezowka_', '');
      setModals({...modals, mlodziezowkaEvent: { ...ev.raw, id: realId }});
      return;
    }
    if (ev.type === 'worship_event') {
      const realId = ev.id.replace('worship_', '');
      setModals({...modals, worshipEvent: { ...ev.raw, id: realId }});
      return;
    }
    if (ev.type === 'media_event') {
      const realId = ev.id.replace('media_', '');
      setModals({...modals, mediaEvent: { ...ev.raw, id: realId }});
      return;
    }
    if (ev.type === 'atmosfera_event') {
      const realId = ev.id.replace('atmosfera_', '');
      setModals({...modals, atmosferaEvent: { ...ev.raw, id: realId }});
      return;
    }
    if (ev.type === 'kids_event') {
      const realId = ev.id.replace('kids_', '');
      setModals({...modals, kidsEvent: { ...ev.raw, id: realId }});
      return;
    }
    if (ev.type === 'homegroups_event') {
      const realId = ev.id.replace('homegroups_', '');
      setModals({...modals, homegroupsEvent: { ...ev.raw, id: realId }});
      return;
    }
    if (ev.type === 'program') {
      setModals({...modals, editProgram: ev.id});
    } else if (ev.type === 'event') {
      setModals({...modals, addEvent: ev.raw});
    } else {
      setModals({...modals, addTask: ev.raw});
    }
  };

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const today = () => setCurrentDate(new Date());

  const { days, firstDay } = getDaysInMonth(currentDate);
  const daysArray = Array.from({ length: days }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDay });
  const filteredEvents = events.filter(e => {
    // Filtruj po widocznych zespołach
    if (!visibleTeams.includes(e.team)) return false;

    // Filtruj po wyszukiwaniu
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const titleMatch = e.title?.toLowerCase().includes(query);
      const descMatch = e.raw?.description?.toLowerCase().includes(query);
      const locationMatch = e.raw?.location?.toLowerCase().includes(query);
      const teamLabel = TEAMS[e.team]?.label?.toLowerCase().includes(query);
      return titleMatch || descMatch || locationMatch || teamLabel;
    }

    return true;
  });

  // --- RENDER LOGIC FOR VIEWS ---

  // Nowy mobilny widok kalendarza (inspirowany Smart Calendar)
  const renderMobileScheduleView = () => {
    const [selectedDate, setSelectedDate] = useState(currentDate);
    const [mobileViewMode, setMobileViewMode] = useState('day'); // 'day' | 'week' | 'month'

    // Pobierz dni tygodnia dla wybranej daty
    const getWeekDays = () => {
      const curr = new Date(selectedDate);
      const first = curr.getDate() - curr.getDay() + 1; // Poniedziałek
      return Array.from({length: 7}, (_, i) => {
        const d = new Date(curr);
        d.setDate(first + i);
        return d;
      });
    };

    const weekDays = getWeekDays();
    const dayEvents = filteredEvents.filter(e =>
      e.date.getDate() === selectedDate.getDate() &&
      e.date.getMonth() === selectedDate.getMonth() &&
      e.date.getFullYear() === selectedDate.getFullYear()
    );

    // Godziny timeline (6:00 - 22:00)
    const hours = Array.from({length: 17}, (_, i) => i + 6);

    // Grupuj wydarzenia po godzinie rozpoczęcia
    const getEventPosition = (ev) => {
      let h, m;
      if (ev.raw?.due_time) {
        [h, m] = ev.raw.due_time.split(':').map(Number);
      } else {
        h = ev.date.getHours() || 10;
        m = ev.date.getMinutes() || 0;
      }
      return { hour: h, minute: m };
    };

    return (
      <div className="flex flex-col h-full bg-white dark:bg-gray-900">
        {/* Header z miesiącem i rokiem */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {selectedDate.toLocaleDateString('pl-PL', { month: 'long' })}
                <span className="text-accent-primary-light ml-2">{selectedDate.getFullYear()}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-600 dark:text-gray-400"
              >
                <Filter size={18} />
              </button>
              <button
                onClick={() => {
                  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
                  handleAddClick(dateStr);
                }}
                className="p-2 bg-accent-primary-light rounded-xl text-white shadow-lg shadow-accent-primary-light/30"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Przełącznik widoku: Schedule / Day / Week / Month */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-4">
            {[
              { id: 'day', label: 'Dzień' },
              { id: 'week', label: 'Tydzień' },
              { id: 'month', label: 'Miesiąc' },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setMobileViewMode(v.id)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                  mobileViewMode === v.id
                    ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Mini kalendarz tygodniowy */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() - 7);
                setSelectedDate(newDate);
                setCurrentDate(newDate);
              }}
              className="p-1 text-gray-400"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex gap-1 flex-1 justify-center">
              {weekDays.map((d, i) => {
                const isSelected = d.getDate() === selectedDate.getDate() &&
                                   d.getMonth() === selectedDate.getMonth();
                const isToday = d.getDate() === new Date().getDate() &&
                                d.getMonth() === new Date().getMonth() &&
                                d.getFullYear() === new Date().getFullYear();
                const hasEvents = filteredEvents.some(e =>
                  e.date.getDate() === d.getDate() &&
                  e.date.getMonth() === d.getMonth()
                );

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedDate(d);
                      setCurrentDate(d);
                    }}
                    className={`flex flex-col items-center py-2 px-2.5 rounded-2xl transition min-w-[40px] ${
                      isSelected
                        ? 'bg-accent-primary-light text-white shadow-lg shadow-accent-primary-light/30'
                        : isToday
                          ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
                          : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className={`text-[10px] font-medium uppercase ${isSelected ? 'text-accent-primary-lighter' : 'text-gray-400 dark:text-gray-500'}`}>
                      {d.toLocaleDateString('pl-PL', { weekday: 'short' }).slice(0, 2)}
                    </span>
                    <span className={`text-lg font-bold ${isSelected ? '' : ''}`}>
                      {d.getDate()}
                    </span>
                    {hasEvents && !isSelected && (
                      <div className="w-1 h-1 rounded-full bg-accent-primary-light mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() + 7);
                setSelectedDate(newDate);
                setCurrentDate(newDate);
              }}
              className="p-1 text-gray-400"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Timeline widok dnia */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="relative">
            {hours.map((h, idx) => {
              const hourEvents = dayEvents.filter(ev => {
                const pos = getEventPosition(ev);
                return pos.hour === h;
              });

              return (
                <div key={h} className="flex min-h-[60px] border-b border-gray-100 dark:border-gray-800">
                  {/* Godzina */}
                  <div className="w-16 flex-shrink-0 py-2 pr-3 text-right">
                    <span className={`text-xs font-medium ${
                      h === 12 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {h === 12 ? 'Noon' : `${String(h).padStart(2, '0')}:00`}
                    </span>
                  </div>

                  {/* Wydarzenia */}
                  <div className="flex-1 py-1 pr-4 space-y-1">
                    {hourEvents.map(ev => {
                      const pos = getEventPosition(ev);
                      const teamColor = TEAMS[ev.team]?.color || 'gray';
                      const colorClasses = {
                        pink: 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 border-l-accent-primary-light text-accent-primary-darkest dark:text-accent-primary-lighter',
                        orange: 'bg-accent-secondary-lightest dark:bg-accent-secondary-darkest/20 border-l-accent-secondary-light text-accent-secondary-darkest dark:text-accent-secondary-lighter',
                        purple: 'bg-purple-50 dark:bg-purple-900/20 border-l-purple-500 text-purple-900 dark:text-purple-100',
                        teal: 'bg-teal-50 dark:bg-teal-900/20 border-l-teal-500 text-teal-900 dark:text-teal-100',
                        blue: 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500 text-blue-900 dark:text-blue-100',
                        yellow: 'bg-amber-50 dark:bg-amber-900/20 border-l-amber-500 text-amber-900 dark:text-amber-100',
                        rose: 'bg-rose-50 dark:bg-rose-900/20 border-l-rose-500 text-rose-900 dark:text-rose-100',
                        gray: 'bg-gray-50 dark:bg-gray-800 border-l-gray-400 text-gray-900 dark:text-gray-100',
                      };

                      return (
                        <div
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          className={`p-3 rounded-xl border-l-4 cursor-pointer hover:shadow-md transition ${colorClasses[teamColor]}`}
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-sm truncate">{ev.title}</h4>
                            <div className="w-5 h-5 rounded-md bg-white/50 dark:bg-gray-700/50 flex items-center justify-center flex-shrink-0 ml-2">
                              <CheckCircle size={12} className="text-gray-400" />
                            </div>
                          </div>
                          <p className="text-xs opacity-70 mt-0.5">
                            {String(pos.hour).padStart(2, '0')}:{String(pos.minute).padStart(2, '0')} - {TEAMS[ev.team]?.label || 'Wydarzenie'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Linia aktualnej godziny */}
            {selectedDate.getDate() === new Date().getDate() &&
             selectedDate.getMonth() === new Date().getMonth() && (
              <div
                className="absolute left-14 right-4 border-t-2 border-red-400 z-10 pointer-events-none"
                style={{
                  top: `${((new Date().getHours() - 6) * 60 + new Date().getMinutes()) / 60 * 60}px`
                }}
              >
                <div className="absolute -left-2 -top-1.5 w-3 h-3 bg-red-400 rounded-full" />
              </div>
            )}
          </div>

          {/* Pusty stan */}
          {dayEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                <CalIcon size={28} className="text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Brak wydarzeń w tym dniu</p>
              <button
                onClick={() => {
                  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
                  handleAddClick(dateStr);
                }}
                className="mt-3 text-accent-primary-light text-sm font-medium flex items-center gap-1"
              >
                <Plus size={16} /> Dodaj wydarzenie
              </button>
            </div>
          )}
        </div>

        {/* FAB - Floating Action Button */}
        <button
          onClick={() => {
            const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
            handleAddClick(dateStr);
          }}
          className="absolute bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-2xl shadow-lg shadow-accent-primary-light/40 flex items-center justify-center text-white hover:shadow-xl transition transform hover:scale-105"
        >
          <Plus size={24} />
        </button>
      </div>
    );
  };

  // Wrapper dla mobilnego widoku schedule z własnym stanem
  const MobileScheduleWrapper = () => {
    const [selectedDate, setSelectedDateLocal] = useState(currentDate);
    const [mobileViewMode, setMobileViewMode] = useState('day');
    const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false);
    const mobileSearchRef = useRef(null);

    const getWeekDays = () => {
      const curr = new Date(selectedDate);
      // Oblicz poniedziałek tego tygodnia
      // getDay() zwraca 0 dla niedzieli, 1 dla poniedziałku, itd.
      const dayOfWeek = curr.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Dla niedzieli cofamy się o 6 dni
      const monday = new Date(curr);
      monday.setDate(curr.getDate() + mondayOffset);

      return Array.from({length: 7}, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
      });
    };

    const weekDays = getWeekDays();
    const dayEvents = filteredEvents.filter(e =>
      e.date.getDate() === selectedDate.getDate() &&
      e.date.getMonth() === selectedDate.getMonth() &&
      e.date.getFullYear() === selectedDate.getFullYear()
    );

    const hours = Array.from({length: 17}, (_, i) => i + 6);

    const getEventPosition = (ev) => {
      let h, m;
      if (ev.raw?.due_time) {
        [h, m] = ev.raw.due_time.split(':').map(Number);
      } else {
        h = ev.date.getHours() || 10;
        m = ev.date.getMinutes() || 0;
      }
      return { hour: h, minute: m };
    };

    return (
      <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
        {/* Header z miesiącem */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {selectedDate.toLocaleDateString('pl-PL', { month: 'long' })}
                <span className="text-accent-primary-light ml-2">{selectedDate.getFullYear()}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Search button - rozwijalna lupka */}
              <button
                onClick={() => { setMobileSearchExpanded(true); setTimeout(() => mobileSearchRef.current?.focus(), 100); }}
                className={`p-2 rounded-xl transition ${searchQuery ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
              >
                <Search size={18} />
              </button>
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-600 dark:text-gray-400"
              >
                <Filter size={18} />
              </button>
            </div>
          </div>

          {/* Rozwinięty pasek wyszukiwania */}
          {mobileSearchExpanded && (
            <div className="relative mb-3 animate-in slide-in-from-top duration-200">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={mobileSearchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setMobileSearchExpanded(false); }}
                placeholder="Szukaj wydarzeń..."
                className="w-full pl-9 pr-9 py-2.5 bg-gray-100 dark:bg-gray-800 border border-accent-primary-light dark:border-accent-primary-light rounded-xl text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none transition"
              />
              <button
                onClick={() => { setSearchQuery(''); setMobileSearchExpanded(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {searchQuery && !mobileSearchExpanded && (
            <p className="text-xs text-accent-primary dark:text-accent-primary-light font-medium mb-2">
              Znaleziono {filteredEvents.length} wydarzeń
            </p>
          )}

          {/* Przełącznik widoku */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-4">
            {[
              { id: 'day', label: 'Dzień', icon: LayoutList },
              { id: 'week', label: 'Tydzień', icon: Columns },
              { id: 'month', label: 'Miesiąc', icon: LayoutGrid },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setMobileViewMode(v.id)}
                className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                  mobileViewMode === v.id
                    ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <v.icon size={14} />
                {v.label}
              </button>
            ))}
          </div>

          {/* Mini kalendarz tygodniowy z nawigacją */}
          <div className="flex items-center gap-2 mb-2">
            {/* Strzałka wstecz */}
            <button
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() - 7);
                setSelectedDateLocal(newDate);
                setCurrentDate(newDate);
              }}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex-shrink-0"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Dni tygodnia */}
            <div className="flex-1 grid grid-cols-7 gap-1">
              {weekDays.map((d, i) => {
                const isSelected = d.getDate() === selectedDate.getDate() &&
                                   d.getMonth() === selectedDate.getMonth();
                const isToday = d.getDate() === new Date().getDate() &&
                                d.getMonth() === new Date().getMonth() &&
                                d.getFullYear() === new Date().getFullYear();
                const hasEvents = filteredEvents.some(e =>
                  e.date.getDate() === d.getDate() &&
                  e.date.getMonth() === d.getMonth()
                );

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedDateLocal(d);
                      setCurrentDate(d);
                    }}
                    className={`flex flex-col items-center py-1.5 rounded-xl transition ${
                      isSelected
                        ? 'bg-accent-primary-light text-white shadow-lg shadow-accent-primary-light/30'
                        : isToday
                          ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className={`text-[9px] font-medium uppercase ${isSelected ? 'text-accent-primary-lighter' : 'text-gray-400 dark:text-gray-500'}`}>
                      {d.toLocaleDateString('pl-PL', { weekday: 'short' }).slice(0, 2)}
                    </span>
                    <span className="text-base font-bold">
                      {d.getDate()}
                    </span>
                    {hasEvents && !isSelected && (
                      <div className="w-1 h-1 rounded-full bg-accent-primary-light mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Strzałka w przód */}
            <button
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() + 7);
                setSelectedDateLocal(newDate);
                setCurrentDate(newDate);
              }}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex-shrink-0"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Zawartość w zależności od trybu */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {/* WIDOK DNIA - Lista wydarzeń */}
          {mobileViewMode === 'day' && (
            <div className="p-3">
              {/* Nagłówek dnia */}
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                {selectedDate.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>

              {dayEvents.length > 0 ? (
                <div className="space-y-2">
                  {dayEvents.map(ev => {
                    const teamColor = TEAMS[ev.team]?.color || 'gray';
                    const colorClasses = {
                      pink: 'bg-gradient-to-r from-accent-primary-lightest to-accent-primary-lighter/50 dark:from-accent-primary-darkest/30 dark:to-accent-primary-darkest/10 border-l-accent-primary-light',
                      orange: 'bg-gradient-to-r from-accent-secondary-lightest to-accent-secondary-lighter/50 dark:from-accent-secondary-darkest/30 dark:to-accent-secondary-darkest/10 border-l-accent-secondary-light',
                      purple: 'bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-900/10 border-l-purple-500',
                      teal: 'bg-gradient-to-r from-teal-50 to-teal-100/50 dark:from-teal-900/30 dark:to-teal-900/10 border-l-teal-500',
                      blue: 'bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-900/10 border-l-blue-500',
                      yellow: 'bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-900/10 border-l-amber-500',
                      rose: 'bg-gradient-to-r from-rose-50 to-rose-100/50 dark:from-rose-900/30 dark:to-rose-900/10 border-l-rose-500',
                      gray: 'bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50 border-l-gray-400',
                    };

                    return (
                      <div
                        key={ev.id}
                        onClick={() => handleEventClick(ev)}
                        className={`p-3 rounded-xl border-l-4 cursor-pointer active:scale-[0.98] transition ${colorClasses[teamColor]}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{ev.title}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {ev.raw?.due_time
                                ? (ev.raw?.end_time ? `${ev.raw.due_time} - ${ev.raw.end_time}` : ev.raw.due_time)
                                : 'Cały dzień'} • {TEAMS[ev.team]?.label || 'Wydarzenie'}
                            </p>
                            {ev.raw?.location && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                                📍 {ev.raw.location}
                              </p>
                            )}
                          </div>
                          <div className="w-7 h-7 rounded-lg bg-white/70 dark:bg-gray-700/70 flex items-center justify-center flex-shrink-0">
                            <CheckCircle size={16} className="text-gray-400" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-3">
                    <CalIcon size={24} className="text-gray-400" />
                  </div>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mb-2">Brak wydarzeń</p>
                  <button
                    onClick={() => {
                      const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
                      handleAddClick(dateStr);
                    }}
                    className="text-accent-primary-light text-sm font-medium flex items-center gap-1 pointer-events-auto"
                  >
                    <Plus size={16} /> Dodaj wydarzenie
                  </button>
                </div>
              )}
            </div>
          )}

          {/* WIDOK TYGODNIA */}
          {mobileViewMode === 'week' && (
            <div className="p-3 space-y-3">
              {weekDays.map(d => {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const dayEventsForWeek = filteredEvents.filter(e =>
                  e.date.getDate() === d.getDate() &&
                  e.date.getMonth() === d.getMonth() &&
                  e.date.getFullYear() === d.getFullYear()
                );
                const isToday = d.getDate() === new Date().getDate() &&
                                d.getMonth() === new Date().getMonth() &&
                                d.getFullYear() === new Date().getFullYear();
                const isSelected = d.getDate() === selectedDate.getDate() &&
                                   d.getMonth() === selectedDate.getMonth();

                return (
                  <div
                    key={d.toString()}
                    className={`p-3 rounded-xl border transition ${
                      isSelected
                        ? 'border-accent-primary-light dark:border-accent-primary bg-accent-primary-lightest/50 dark:bg-accent-primary-darkest/20'
                        : isToday
                          ? 'border-accent-primary-lighter dark:border-accent-primary-dark bg-accent-primary-lightest/30 dark:bg-accent-primary-darkest/10'
                          : 'border-gray-200 dark:border-gray-700'
                    }`}
                    onClick={() => {
                      setSelectedDateLocal(d);
                      setCurrentDate(d);
                    }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        isSelected
                          ? 'bg-accent-primary-light text-white'
                          : isToday
                            ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/50 text-accent-primary dark:text-accent-primary-light'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}>
                        {d.getDate()}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-800 dark:text-white">
                          {d.toLocaleDateString('pl-PL', { weekday: 'long' })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}
                        </div>
                      </div>
                      {dayEventsForWeek.length > 0 && (
                        <span className="px-2 py-0.5 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light text-xs font-medium rounded-full">
                          {dayEventsForWeek.length}
                        </span>
                      )}
                    </div>
                    {dayEventsForWeek.length > 0 && (
                      <div className="space-y-1.5 ml-13">
                        {dayEventsForWeek.slice(0, 3).map(ev => {
                          const teamColor = TEAMS[ev.team]?.color || 'gray';
                          return (
                            <div
                              key={ev.id}
                              onClick={(e) => { e.stopPropagation(); handleEventClick(ev); }}
                              className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700"
                            >
                              <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                                teamColor === 'pink' ? 'bg-accent-primary-light' :
                                teamColor === 'orange' ? 'bg-accent-secondary-light' :
                                teamColor === 'purple' ? 'bg-purple-500' :
                                teamColor === 'teal' ? 'bg-teal-500' :
                                teamColor === 'blue' ? 'bg-blue-500' :
                                teamColor === 'yellow' ? 'bg-amber-500' :
                                teamColor === 'rose' ? 'bg-rose-500' : 'bg-gray-400'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{ev.title}</p>
                                <p className="text-[10px] text-gray-500">{ev.raw?.due_time ? (ev.raw?.end_time ? `${ev.raw.due_time} - ${ev.raw.end_time}` : ev.raw.due_time) : ''}</p>
                              </div>
                            </div>
                          );
                        })}
                        {dayEventsForWeek.length > 3 && (
                          <p className="text-xs text-gray-400 text-center">+{dayEventsForWeek.length - 3} więcej</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Lista wydarzeń w wybranym dniu pod tygodniem */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                  {selectedDate.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {dayEvents.length > 0 ? (
                  <div className="space-y-2">
                    {dayEvents.map(ev => {
                      const teamColor = TEAMS[ev.team]?.color || 'gray';
                      return (
                        <div
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer active:scale-[0.98] transition"
                        >
                          <div className={`w-1 h-10 rounded-full flex-shrink-0 ${
                            teamColor === 'pink' ? 'bg-accent-primary-light' :
                            teamColor === 'orange' ? 'bg-accent-secondary-light' :
                            teamColor === 'purple' ? 'bg-purple-500' :
                            teamColor === 'teal' ? 'bg-teal-500' :
                            teamColor === 'blue' ? 'bg-blue-500' :
                            teamColor === 'yellow' ? 'bg-amber-500' :
                            teamColor === 'rose' ? 'bg-rose-500' : 'bg-gray-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{ev.title}</p>
                            <p className="text-xs text-gray-500">
                              {ev.raw?.due_time ? (ev.raw?.end_time ? `${ev.raw.due_time} - ${ev.raw.end_time}` : ev.raw.due_time) : ''} • {TEAMS[ev.team]?.label || 'Wydarzenie'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-gray-400 text-sm py-4">Brak wydarzeń w tym dniu</p>
                )}
              </div>
            </div>
          )}

          {/* WIDOK MIESIĄCA */}
          {mobileViewMode === 'month' && (
            <div className="p-3">
              {/* Nagłówek dni tygodnia */}
              <div className="grid grid-cols-7 mb-2">
                {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Siatka dni */}
              <div className="grid grid-cols-7 gap-1">
                {emptyDays.map((_, i) => <div key={`e-${i}`} className="aspect-square" />)}
                {daysArray.map(d => {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
                  const dayEventsMonth = filteredEvents.filter(e =>
                    e.date.getDate() === d &&
                    e.date.getMonth() === currentDate.getMonth()
                  );
                  const isToday = d === new Date().getDate() &&
                                  currentDate.getMonth() === new Date().getMonth() &&
                                  currentDate.getFullYear() === new Date().getFullYear();
                  const isSelected = d === selectedDate.getDate() &&
                                     currentDate.getMonth() === selectedDate.getMonth();

                  return (
                    <button
                      key={d}
                      onClick={() => {
                        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
                        setSelectedDateLocal(newDate);
                        // NIE zmieniaj currentDate - to by przełączyło tydzień w mini kalendarzu
                      }}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition ${
                        isSelected
                          ? 'bg-accent-primary-light text-white'
                          : isToday
                            ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="text-sm font-medium">{d}</span>
                      {dayEventsMonth.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {dayEventsMonth.slice(0, 3).map((ev, idx) => {
                            const color = TEAMS[ev.team]?.color || 'gray';
                            return (
                              <div
                                key={idx}
                                className={`w-1 h-1 rounded-full ${
                                  isSelected ? 'bg-white/70' :
                                  color === 'pink' ? 'bg-accent-primary-light' :
                                  color === 'orange' ? 'bg-accent-secondary-light' :
                                  color === 'purple' ? 'bg-purple-500' : 'bg-gray-400'
                                }`}
                              />
                            );
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Lista wydarzeń w wybranym dniu poniżej kalendarza */}
              {(() => {
                // Użyj selectedDate dla wydarzeń, ale tylko jeśli jest w aktualnym miesiącu
                const monthDayEvents = filteredEvents.filter(e =>
                  e.date.getDate() === selectedDate.getDate() &&
                  e.date.getMonth() === selectedDate.getMonth() &&
                  e.date.getFullYear() === selectedDate.getFullYear()
                );
                return (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                  {selectedDate.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {monthDayEvents.length > 0 ? (
                  <div className="space-y-2">
                    {monthDayEvents.map(ev => {
                      const teamColor = TEAMS[ev.team]?.color || 'gray';
                      return (
                        <div
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer active:scale-[0.98] transition"
                        >
                          <div className={`w-1 h-10 rounded-full flex-shrink-0 ${
                            teamColor === 'pink' ? 'bg-accent-primary-light' :
                            teamColor === 'orange' ? 'bg-accent-secondary-light' :
                            teamColor === 'purple' ? 'bg-purple-500' :
                            teamColor === 'teal' ? 'bg-teal-500' :
                            teamColor === 'blue' ? 'bg-blue-500' :
                            teamColor === 'yellow' ? 'bg-amber-500' :
                            teamColor === 'rose' ? 'bg-rose-500' : 'bg-gray-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{ev.title}</p>
                            <p className="text-xs text-gray-500">
                              {ev.raw?.due_time ? (ev.raw?.end_time ? `${ev.raw.due_time} - ${ev.raw.end_time}` : ev.raw.due_time) : ''} • {TEAMS[ev.team]?.label || 'Wydarzenie'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-gray-400 text-sm py-4">Brak wydarzeń</p>
                )}
              </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => {
            const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
            handleAddClick(dateStr);
          }}
          className="absolute bottom-4 right-4 w-12 h-12 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-xl shadow-lg shadow-accent-primary-light/40 flex items-center justify-center text-white active:scale-95 transition"
        >
          <Plus size={22} />
        </button>
      </div>
    );
  };

  const renderMonthView = () => {
    const dayNames = [
      { short: 'Pn', full: 'Poniedziałek' },
      { short: 'Wt', full: 'Wtorek' },
      { short: 'Śr', full: 'Środa' },
      { short: 'Cz', full: 'Czwartek' },
      { short: 'Pt', full: 'Piątek' },
      { short: 'So', full: 'Sobota' },
      { short: 'Nd', full: 'Niedziela' },
    ];

    return (
      <>
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {dayNames.map(d => (
            <div key={d.short} className="py-2 lg:py-3 text-center text-[10px] lg:text-xs font-bold text-gray-500 uppercase">
              <span className="lg:hidden">{d.short}</span>
              <span className="hidden lg:inline">{d.full}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 grid grid-cols-7 auto-rows-fr bg-gray-200 dark:bg-gray-700 gap-px overflow-y-auto custom-scrollbar">
          {emptyDays.map((_, i) => <div key={`em-${i}`} className="bg-gray-50/50 dark:bg-gray-900/50" />)}
          {daysArray.map(d => {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const dayEvents = filteredEvents.filter(e => e.date.getDate() === d && e.date.getMonth() === currentDate.getMonth());
            return (
              <div key={d} className="bg-white dark:bg-gray-900 min-h-[60px] lg:min-h-[100px] p-1 lg:p-2 relative group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                <div className="flex justify-between items-center mb-0.5 lg:mb-1">
                  <span className={`text-xs lg:text-sm font-bold w-5 h-5 lg:w-7 lg:h-7 flex items-center justify-center rounded-full ${d === new Date().getDate() && currentDate.getMonth() === new Date().getMonth() ? 'bg-accent-primary text-white' : 'text-gray-700 dark:text-gray-300'}`}>{d}</span>
                  <button onClick={() => handleAddClick(dateStr)} className="opacity-0 group-hover:opacity-100 p-0.5 lg:p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400"><Plus size={12} /></button>
                </div>
                <div className="space-y-0.5 lg:space-y-1 overflow-y-auto max-h-[40px] lg:max-h-[100px] custom-scrollbar">
                  {/* Mobile: pokaż max 2 wydarzenia */}
                  <div className="lg:hidden">
                    {dayEvents.slice(0, 2).map(ev => (
                      <EventBadge key={ev.id} event={ev} onClick={() => handleEventClick(ev)} />
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-gray-400 text-center">+{dayEvents.length - 2}</div>
                    )}
                  </div>
                  {/* Desktop: pokaż wszystkie */}
                  <div className="hidden lg:block">
                    {dayEvents.map(ev => (
                      <EventBadge key={ev.id} event={ev} onClick={() => handleEventClick(ev)} />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
          {Array.from({ length: (42 - (days + firstDay)) % 7 }).map((_, i) => <div key={`end-${i}`} className="bg-gray-50/50 dark:bg-gray-900/50" />)}
        </div>
      </>
    );
  };

  const renderWeekView = () => {
    const curr = new Date(currentDate);
    const first = curr.getDate() - curr.getDay() + 1;
    const weekDays = Array.from({length: 7}, (_, i) => new Date(new Date(curr).setDate(first + i)));

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Desktop: 7 kolumn */}
        <div className="hidden lg:block flex-1 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
            {weekDays.map(d => (
              <div key={d.toString()} className="py-3 text-center border-r border-gray-100 dark:border-gray-700/50 last:border-0">
                <div className="text-xs text-gray-500 uppercase mb-1">{d.toLocaleDateString('pl-PL', {weekday: 'short'})}</div>
                <div className={`text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center mx-auto ${d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth() ? 'bg-accent-primary text-white' : 'text-gray-800 dark:text-white'}`}>
                  {d.getDate()}
                </div>
              </div>
            ))}
          </div>
          <div className="h-[calc(100%-70px)] grid grid-cols-7 divide-x divide-gray-100 dark:divide-gray-700/50 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900">
            {weekDays.map(d => {
              const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
              const dayEvents = filteredEvents.filter(e => e.date.getDate() === d.getDate() && e.date.getMonth() === d.getMonth());
              return (
                <div key={d.toString()} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition min-h-[200px]">
                  {dayEvents.map(ev => <EventBadge key={ev.id} event={ev} onClick={() => handleEventClick(ev)} />)}
                  <button onClick={() => handleAddClick(dateStr)} className="w-full mt-2 py-2 text-xs text-gray-300 hover:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg transition flex items-center justify-center gap-1"><Plus size={12}/> Dodaj</button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mobile: lista dni */}
        <div className="lg:hidden flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900 p-3 space-y-3">
          {weekDays.map(d => {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const dayEvents = filteredEvents.filter(e => e.date.getDate() === d.getDate() && e.date.getMonth() === d.getMonth());
            const isToday = d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth();
            return (
              <div key={d.toString()} className={`p-3 rounded-xl border ${isToday ? 'border-accent-primary-light dark:border-accent-primary bg-accent-primary-lightest/50 dark:bg-accent-primary-darkest/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isToday ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                    {d.getDate()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-800 dark:text-white">{d.toLocaleDateString('pl-PL', {weekday: 'long'})}</div>
                    <div className="text-xs text-gray-500">{d.toLocaleDateString('pl-PL', {day: 'numeric', month: 'long'})}</div>
                  </div>
                  <button onClick={() => handleAddClick(dateStr)} className="ml-auto p-2 text-gray-400 hover:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition">
                    <Plus size={18} />
                  </button>
                </div>
                {dayEvents.length > 0 ? (
                  <div className="space-y-1.5 ml-13">
                    {dayEvents.map(ev => <EventBadge key={ev.id} event={ev} onClick={() => handleEventClick(ev)} />)}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 ml-13">Brak wydarzeń</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  };

  const renderDayView = () => {
      const dayEvents = filteredEvents.filter(e => e.date.getDate() === currentDate.getDate() && e.date.getMonth() === currentDate.getMonth());
      const hours = Array.from({length: 15}, (_, i) => i + 8); // 08:00 - 22:00

      return (
        <div className="flex-1 bg-white dark:bg-gray-900 overflow-y-auto custom-scrollbar flex">
            {/* Nagłówek z datą na mobile */}
            <div className="lg:hidden absolute top-0 left-0 right-0 p-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800 z-30">
                <div className="text-center">
                    <div className="font-bold text-gray-800 dark:text-white">{currentDate.toLocaleDateString('pl-PL', {weekday: 'long'})}</div>
                    <div className="text-sm text-gray-500">{currentDate.toLocaleDateString('pl-PL', {day: 'numeric', month: 'long', year: 'numeric'})}</div>
                </div>
            </div>

            {/* Lewa kolumna godzin */}
            <div className="w-10 lg:w-16 flex-shrink-0 border-r border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900 mt-14 lg:mt-0">
                {hours.map(h => (
                    <div key={h} className="h-[60px] lg:h-[80px] border-b border-gray-100 dark:border-gray-800 text-right pr-1 lg:pr-3 pt-1 lg:pt-2 text-[10px] lg:text-xs text-gray-400 font-medium relative">
                        {String(h).padStart(2, '0')}:00
                    </div>
                ))}
            </div>

            {/* Prawa kolumna zdarzeń */}
            <div className="flex-1 relative min-h-[900px] lg:min-h-[1200px] mt-14 lg:mt-0">
                {/* Linie poziome */}
                {hours.map(h => (
                    <div key={h} className="h-[60px] lg:h-[80px] border-b border-gray-100 dark:border-gray-800/50 w-full absolute" style={{top: (h-8) * (isDesktop ? 80 : 60)}}></div>
                ))}

                {/* Zdarzenia */}
                {dayEvents.map(ev => {
                    // Pobieranie godziny z raw data jeśli dostępne, lub z daty
                    let h, m;
                    if (ev.raw.due_time) {
                        [h, m] = ev.raw.due_time.split(':').map(Number);
                    } else {
                        h = ev.date.getHours();
                        m = ev.date.getMinutes();
                    }

                    const startMin = (Math.max(8, h) - 8) * 60 + m;
                    const hourHeight = isDesktop ? 80 : 60;
                    const top = (startMin / 60) * hourHeight;

                    return (
                        <div
                            key={ev.id}
                            onClick={() => handleEventClick(ev)}
                            className={`absolute left-1 lg:left-2 right-1 lg:right-2 rounded-lg lg:rounded-xl p-2 lg:p-3 shadow-sm border cursor-pointer hover:shadow-md transition z-10 ${ev.team === 'program' ? 'bg-accent-primary-lightest border-accent-primary-lighter text-accent-primary-dark' : 'bg-blue-50 border-blue-200 text-blue-800'}`}
                            style={{ top: `${top}px`, height: isDesktop ? '70px' : '55px' }}
                        >
                            <div className="flex items-center gap-1 lg:gap-2 text-[10px] lg:text-xs font-bold opacity-70 mb-0.5 lg:mb-1">
                                <Clock size={10} className="lg:w-3 lg:h-3"/>
                                {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}{ev.raw?.end_time ? ` - ${ev.raw.end_time}` : ''}
                            </div>
                            <div className="font-bold truncate text-xs lg:text-base">{ev.title}</div>
                            <div className="text-[10px] lg:text-xs opacity-60 truncate hidden lg:block">{TEAMS[ev.team]?.label}</div>
                        </div>
                    );
                })}

                {/* Aktualna godzina (linia) */}
                {currentDate.getDate() === new Date().getDate() && (
                    <div
                        className="absolute w-full border-t-2 border-red-400 z-20 flex items-center"
                        style={{ top: `${((new Date().getHours() - 8) * 60 + new Date().getMinutes()) / 60 * (isDesktop ? 80 : 60)}px` }}
                    >
                        <div className="w-2 h-2 bg-red-400 rounded-full -ml-1"></div>
                    </div>
                )}
            </div>
        </div>
      )
  };

  const renderListView = () => {
      const sortedEvents = [...filteredEvents].sort((a,b) => a.date - b.date);
      return (
        <div className="flex-1 bg-white dark:bg-gray-900 overflow-y-auto custom-scrollbar p-3 lg:p-6">
             <div className="max-w-4xl mx-auto space-y-1 lg:space-y-2">
                 {sortedEvents.map(ev => (
                     <div key={ev.id} onClick={() => handleEventClick(ev)} className="flex items-center gap-2 lg:gap-4 p-2 lg:p-3 rounded-lg lg:rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer transition">
                         <div className="w-12 lg:w-16 text-center flex-shrink-0">
                             <div className="text-[10px] lg:text-xs text-gray-400 uppercase font-bold">{ev.date.toLocaleDateString('pl-PL', {month: 'short'})}</div>
                             <div className="text-lg lg:text-xl font-bold text-gray-800 dark:text-white">{ev.date.getDate()}</div>
                         </div>
                         <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                           TEAMS[ev.team]?.color === 'pink' ? 'bg-accent-primary-light' :
                           TEAMS[ev.team]?.color === 'rose' ? 'bg-rose-500' :
                           TEAMS[ev.team]?.color === 'orange' ? 'bg-accent-secondary-light' :
                           TEAMS[ev.team]?.color === 'purple' ? 'bg-purple-500' :
                           TEAMS[ev.team]?.color === 'teal' ? 'bg-teal-500' :
                           TEAMS[ev.team]?.color === 'blue' ? 'bg-blue-500' :
                           TEAMS[ev.team]?.color === 'yellow' ? 'bg-yellow-500' :
                           'bg-gray-300'
                         }`}></div>
                         <div className="flex-1 min-w-0">
                             <h4 className="font-bold text-sm lg:text-base text-gray-800 dark:text-gray-200 truncate">{ev.title}</h4>
                             <div className="text-[10px] lg:text-xs text-gray-500 flex gap-2 lg:gap-3 mt-0.5 flex-wrap">
                                 <span className="truncate">{TEAMS[ev.team]?.label || ev.raw?.category}</span>
                                 {ev.raw?.due_time && <span>• {ev.raw.due_time}{ev.raw?.end_time ? ` - ${ev.raw.end_time}` : ''}</span>}
                             </div>
                         </div>
                     </div>
                 ))}
                 {sortedEvents.length === 0 && <div className="text-center text-gray-400 py-10 text-sm lg:text-base">Brak wydarzeń w tym miesiącu</div>}
             </div>
        </div>
      )
  }

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col gap-2 lg:gap-4">
      {/* MOBILE VIEW - Nowy widok kalendarza */}
      <div className="lg:hidden h-full">
        <MobileScheduleWrapper />
      </div>

      {/* DESKTOP VIEW - Stary layout */}
      <div className="hidden lg:flex lg:flex-col lg:gap-4 h-full">
        {/* HEADER */}
        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 rounded-lg text-accent-primary dark:text-accent-primary-light"><CalIcon size={24} /></div>
              <div>
                 <h1 className="text-xl font-bold text-gray-800 dark:text-white">Kalendarz</h1>
                 <p className="text-xs text-gray-500 dark:text-gray-400">Zarządzanie wydarzeniami i zadaniami</p>
              </div>
           </div>

           {/* Search bar - pełne pole */}
           <div className="flex-1 max-w-md mx-4">
             <div className="relative">
               <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input
                 type="text"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 placeholder="Szukaj wydarzeń..."
                 className="w-full pl-10 pr-10 py-2 bg-gray-100 dark:bg-gray-700 border border-transparent focus:border-accent-primary-light dark:focus:border-accent-primary-light rounded-xl text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-primary-light/20 transition"
               />
               {searchQuery && (
                 <button
                   onClick={() => setSearchQuery('')}
                   className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                 >
                   <X size={16} />
                 </button>
               )}
             </div>
             {searchQuery && (
               <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-1">
                 Znaleziono {filteredEvents.length} wydarzeń
               </p>
             )}
           </div>

           {/* View switcher */}
           <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
              {[
                { id: 'month', icon: LayoutGrid, label: 'Miesiąc' },
                { id: 'week', icon: Columns, label: 'Tydzień' },
                { id: 'day', icon: LayoutList, label: 'Dzień' },
                { id: 'list', icon: List, label: 'Lista' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition ${view === v.id ? 'bg-white dark:bg-gray-800 text-accent-primary dark:text-accent-primary-light shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  title={v.label}
                >
                   <v.icon size={16} /> <span>{v.label}</span>
                </button>
              ))}
           </div>
        </div>

        <div className="flex-1 flex gap-6 overflow-hidden relative">
        {/* SIDEBAR - tylko desktop */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-6">
          <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-lg text-gray-800 dark:text-white capitalize">{currentDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronLeft size={16} /></button>
                <button onClick={nextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-2">{['Pon','Wt','Śr','Czw','Pt','Sob','Nd'].map(d => <div key={d} className="py-1">{d.charAt(0)}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {emptyDays.map((_, i) => <div key={`e-${i}`} />)}
              {daysArray.map(d => (
                <div key={d} onClick={() => { setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), d)); setSidebarOpen(false); }} className={`h-8 w-8 flex items-center justify-center text-sm rounded-full cursor-pointer hover:bg-accent-primary-lightest dark:hover:bg-gray-700 ${d === currentDate.getDate() ? 'bg-accent-primary text-white font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                  {d}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-y-auto">
            <h3 className="font-bold text-gray-500 uppercase text-xs mb-4 tracking-wider">Twoje Kalendarze</h3>
            <div className="space-y-2">
              {Object.entries(TEAMS).map(([key, cfg]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition select-none">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-gray-300 text-accent-primary focus:ring-accent-primary-light rounded cursor-pointer accent-accent-primary"
                    checked={visibleTeams.includes(key)}
                    onChange={() => setVisibleTeams(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cfg.label}</span>
                </label>
              ))}
            </div>
            <button onClick={() => { handleAddClick(new Date().toISOString().split('T')[0]); setSidebarOpen(false); }} className="w-full mt-6 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-bold rounded-xl shadow-lg shadow-accent-primary-light/30 flex items-center justify-center gap-2 hover:shadow-accent-primary-light/50 transition transform hover:-translate-y-0.5">
              <Plus size={18} /> Dodaj
            </button>
          </div>
        </div>

        {/* MAIN CALENDAR CONTENT */}
        <div className="flex-1 bg-white dark:bg-gray-900/50 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          {view === 'month' && renderMonthView()}
          {view === 'week' && renderWeekView()}
          {view === 'day' && renderDayView()}
          {view === 'list' && renderListView()}
        </div>
        </div>
      </div>

      {/* Mobile Filter Modal */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl p-6 pb-8 animate-in slide-in-from-bottom duration-300">
            {/* Handle bar */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />

            <div className="flex items-center justify-between mb-6 mt-2">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Filter size={20} className="text-accent-primary" />
                Filtry kalendarza
              </h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <h3 className="font-bold text-gray-500 uppercase text-xs mb-3 tracking-wider">Twoje Kalendarze</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(TEAMS).map(([key, cfg]) => {
                  const isActive = visibleTeams.includes(key);
                  const TeamIcon = cfg.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setVisibleTeams(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition ${
                        isActive
                          ? 'border-accent-primary-light bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <TeamIcon size={18} />
                      <span className="text-sm font-medium truncate">{cfg.label}</span>
                      {isActive && <Check size={16} className="ml-auto text-accent-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setVisibleTeams(Object.keys(TEAMS))}
                className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Wybierz wszystkie
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex-1 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-bold rounded-xl shadow-lg shadow-accent-primary-light/30"
              >
                Gotowe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale */}
      {modals.selectType && (
        <ModalSelectType
          date={modals.selectType.date}
          onClose={() => setModals({...modals, selectType: null})}
          onSelectTask={handleSelectTask}
          onSelectEvent={handleSelectEvent}
        />
      )}

      {modals.selectCategory && (
        <ModalSelectEventCategory
          date={modals.selectCategory.date}
          categories={eventCategories}
          onClose={() => setModals({...modals, selectCategory: null})}
          onSelectCategory={handleSelectCategory}
          onSelectMinistry={handleSelectMinistry}
        />
      )}

      {modals.addEvent && (
        <ModalAddEvent
          initialEvent={modals.addEvent}
          category={modals.addEvent.category}
          onClose={() => setModals({...modals, addEvent: null})}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {modals.addTask && <ModalAddTask initialTask={modals.addTask} onClose={() => setModals({...modals, addTask: null})} onSave={handleSaveTask} onDelete={handleDeleteTask} />}
      {modals.editProgram && <ProgramEditorModal programId={modals.editProgram} onClose={() => setModals({...modals, editProgram: null})} onSave={handleSaveProgram} onDelete={handleDeleteProgram} />}

      {modals.mlodziezowkaEvent && (
        <ModalMinistryEvent
          event={modals.mlodziezowkaEvent}
          ministry="mlodziezowka"
          onClose={() => setModals({...modals, mlodziezowkaEvent: null})}
          onSave={handleSaveMlodziezowkaEvent}
          onDelete={handleDeleteMlodziezowkaEvent}
        />
      )}

      {modals.worshipEvent && (
        <ModalMinistryEvent
          event={modals.worshipEvent}
          ministry="worship"
          onClose={() => setModals({...modals, worshipEvent: null})}
          onSave={handleSaveWorshipEvent}
          onDelete={handleDeleteWorshipEvent}
        />
      )}

      {modals.mediaEvent && (
        <ModalMinistryEvent
          event={modals.mediaEvent}
          ministry="media"
          onClose={() => setModals({...modals, mediaEvent: null})}
          onSave={handleSaveMediaEvent}
          onDelete={handleDeleteMediaEvent}
        />
      )}

      {modals.atmosferaEvent && (
        <ModalMinistryEvent
          event={modals.atmosferaEvent}
          ministry="atmosfera"
          onClose={() => setModals({...modals, atmosferaEvent: null})}
          onSave={handleSaveAtmosferaEvent}
          onDelete={handleDeleteAtmosferaEvent}
        />
      )}

      {modals.kidsEvent && (
        <ModalMinistryEvent
          event={modals.kidsEvent}
          ministry="kids"
          onClose={() => setModals({...modals, kidsEvent: null})}
          onSave={handleSaveKidsEvent}
          onDelete={handleDeleteKidsEvent}
        />
      )}

      {modals.homegroupsEvent && (
        <ModalMinistryEvent
          event={modals.homegroupsEvent}
          ministry="homegroups"
          onClose={() => setModals({...modals, homegroupsEvent: null})}
          onSave={handleSaveHomegroupsEvent}
          onDelete={handleDeleteHomegroupsEvent}
        />
      )}
    </div>
  );
}
