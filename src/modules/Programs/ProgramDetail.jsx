import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import {
  Plus, Save, FileText, Presentation, Trash2, Calendar,
  ChevronDown, GripVertical, Search, X, Check,
  ChevronLeft, ChevronRight, Mail, Loader2, AlertTriangle, UserX, ArrowLeft,
  Music, Type, Image, Clock, MoreHorizontal, FileText as NoteIcon,
  Info, User, Mic2
} from 'lucide-react';
import { downloadPDF, savePDFToSupabase } from '../../lib/utils';
import { generatePPT } from '../../lib/ppt';
import { exportToProPresenter } from '../../lib/propresenter';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import GraphicsOverride from './components/GraphicsOverride';

const PROGRAM_ELEMENTS = [
  'Wstęp', 'Uwielbienie', 'Modlitwa', 'Czytanie', 'Kazanie',
  'Wieczerza', 'Uwielbienie / Kolekta', 'Ogłoszenia', 'Zakończenie'
];

const MUSICAL_KEYS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

// Item types for schedule - inspired by Planning Center
const ITEM_TYPES = {
  item: { label: 'Element', icon: Type, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
  header: { label: 'Nagłówek', icon: MoreHorizontal, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  song: { label: 'Pieśń', icon: Music, color: 'text-accent-primary dark:text-accent-primary-light', bg: 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30' },
  media: { label: 'Media', icon: Image, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
};

// Format time as MM:SS
const formatTime = (seconds) => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

// Calculate total time
const calculateTotalTime = (schedule) => {
  return schedule.reduce((total, item) => total + (item.duration || 0), 0);
};

// --- HOOK DO POZYCJONOWANIA DROPDOWNÓW (PORTAL) ---

function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      let rafId;
      let lastTop = 0;
      let lastLeft = 0;

      const updatePosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        if (rect.top !== lastTop || rect.left !== lastLeft) {
          lastTop = rect.top;
          lastLeft = rect.left;
          setCoords({
            top: openUpward ? rect.top : rect.bottom,
            left: rect.left,
            width: Math.max(rect.width, 200),
            openUpward
          });
        }
      };

      const tick = () => {
        updatePosition();
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
      };
    }
  }, [isOpen]);

  return coords;
}

// --- FUNKCJA POMOCNICZA DO ZBIERANIA MAILI ---

const getAllRecipients = (program, worshipTeamMembers) => {
  const recipients = new Set();

  if (program.zespol) {
    Object.values(program.zespol).forEach(value => {
      if (typeof value === 'string') {
        const names = value.split(',').map(s => s.trim()).filter(Boolean);
        names.forEach(name => {
           const member = worshipTeamMembers.find(m => m.full_name === name);
           if (member?.email) recipients.add(member.email);
        });
      }
    });
  }

  return Array.from(recipients);
};

// --- HELPERY KALENDARZA ---

const getDaysInMonth = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  return { days, firstDay: firstDay === 0 ? 6 : firstDay - 1 };
};

const CustomDatePicker = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const wrapperRef = useRef(null);
  const coords = useDropdownPosition(wrapperRef, isOpen);

  useEffect(() => { if (value) setViewDate(new Date(value)); }, [value]);

  useEffect(() => {
    const handleClick = (e) => {
        if (isOpen && wrapperRef.current && !wrapperRef.current.contains(e.target)) {
           const portal = document.getElementById('datepicker-portal');
           if (portal && !portal.contains(e.target)) setIsOpen(false);
        }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleDayClick = (day) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${dayStr}`);
    setIsOpen(false);
  };

  const { days, firstDay } = getDaysInMonth(viewDate);
  const daysArray = Array.from({ length: days }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDay });

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-gray-200/50 dark:border-gray-700/50 cursor-pointer hover:border-accent-primary-light transition"
      >
        <Calendar size={16} className="text-accent-primary dark:text-accent-primary-light" />
        <span className="text-gray-700 dark:text-gray-200 font-medium text-sm">
          {value ? new Date(value).toLocaleDateString('pl-PL') : 'Wybierz datę'}
        </span>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
            id="datepicker-portal"
            className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 w-[280px]"
            style={{
              top: coords.openUpward ? 'auto' : `${coords.top}px`,
              bottom: coords.openUpward ? `${window.innerHeight - coords.top + 4}px` : 'auto',
              left: `${coords.left}px`
            }}
        >
           <div className="flex justify-between items-center mb-4">
             <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1))); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"><ChevronLeft size={18} /></button>
             <span className="text-sm font-bold capitalize text-gray-800 dark:text-gray-200">{viewDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
             <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1))); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"><ChevronRight size={18} /></button>
           </div>
           <div className="grid grid-cols-7 gap-1 text-center mb-2 text-[10px] font-bold text-gray-400 uppercase">{['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(d => <div key={d}>{d}</div>)}</div>
           <div className="grid grid-cols-7 gap-1">
             {emptyDays.map((_, i) => <div key={`e-${i}`} />)}
             {daysArray.map(d => {
               const dDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
               const dStr = `${dDate.getFullYear()}-${String(dDate.getMonth()+1).padStart(2,'0')}-${String(dDate.getDate()).padStart(2,'0')}`;
               const isSelected = value === dStr;
               return (
                 <button
                    key={d}
                    onClick={(e) => { e.stopPropagation(); handleDayClick(d); }}
                    className={`h-8 w-8 rounded-lg text-xs font-medium transition
                      ${isSelected ? 'bg-accent-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
                    `}
                 >
                   {d}
                 </button>
               )
             })}
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// --- POMOCNICZE KOMPONENTY ---

const ElementSelector = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const coords = useDropdownPosition(wrapperRef, isOpen);

  useEffect(() => {
    const handleClick = (e) => {
        if (isOpen && wrapperRef.current && !wrapperRef.current.contains(e.target)) {
             const portal = document.getElementById('element-selector-portal');
             if (portal && !portal.contains(e.target)) setIsOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative">
        <input
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-accent-primary-light/20 outline-none placeholder:text-gray-400 dark:placeholder-gray-600"
          placeholder="Wybierz lub wpisz..."
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onClick={() => setIsOpen(true)}
        />
        <ChevronDown
          size={16}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        />
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
            id="element-selector-portal"
            className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar"
            style={{
              top: coords.openUpward ? 'auto' : `${coords.top}px`,
              bottom: coords.openUpward ? `${window.innerHeight - coords.top + 4}px` : 'auto',
              left: `${coords.left}px`,
              width: `${coords.width}px`
            }}
        >
          {options.map((opt) => (
            <div
              key={opt}
              className="px-4 py-2 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 cursor-pointer text-sm text-gray-700 dark:text-gray-300 border-b border-gray-50 dark:border-gray-800 last:border-0"
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

const MultiSelect = ({ label, options, value, onChange, absentMembers = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const coords = useDropdownPosition(wrapperRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    const handleClick = (e) => {
        if (isOpen && wrapperRef.current && !wrapperRef.current.contains(e.target)) {
            const portal = document.getElementById(`multiselect-portal-${label}`);
            if (portal && !portal.contains(e.target)) setIsOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, label]);

  const toggleSelection = (name, isAbsent) => {
    if (isAbsent) return;
    let newSelection;
    if (selectedItems.includes(name)) {
      newSelection = selectedItems.filter(i => i !== name);
    } else {
      newSelection = [...selectedItems, name];
    }
    onChange(newSelection.join(', '));
  };

  return (
    <div ref={wrapperRef} className="relative group">
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>
      <div
        className="w-full min-h-[42px] px-4 py-2 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus-within:ring-2 focus-within:ring-accent-primary-light/20 cursor-pointer flex flex-wrap gap-2 items-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-sm">Wybierz osoby...</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-accent-primary-lighter dark:bg-accent-primary-darkest/40 text-accent-primary-dark dark:text-accent-primary-lighter px-2 py-0.5 rounded-lg text-xs font-medium border border-accent-primary-lighter dark:border-accent-primary-dark flex items-center gap-1">
              {item}
              <span
                onClick={(e) => { e.stopPropagation(); toggleSelection(item); }}
                className="hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-dark rounded-full p-0.5 cursor-pointer"
              >
                <X size={10} />
              </span>
            </span>
          ))
        )}
        <div className="ml-auto">
          <ChevronDown size={16} className="text-gray-400" />
        </div>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
            id={`multiselect-portal-${label}`}
            className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar"
            style={{
              top: coords.openUpward ? 'auto' : `${coords.top}px`,
              bottom: coords.openUpward ? `${window.innerHeight - coords.top + 4}px` : 'auto',
              left: `${coords.left}px`,
              width: `${coords.width}px`
            }}
        >
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            const isAbsent = absentMembers.includes(person.full_name);

            return (
              <div
                key={person.id}
                className={`px-4 py-2 text-sm cursor-pointer flex items-center justify-between transition
                  ${isAbsent ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 text-gray-700 dark:text-gray-300'}
                  ${isSelected && !isAbsent ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 text-accent-primary-dark dark:text-accent-primary-lighter font-medium' : ''}
                `}
                onClick={() => toggleSelection(person.full_name, isAbsent)}
              >
                <span className={isAbsent ? 'line-through decoration-gray-400' : ''}>
                  {person.full_name}{person.role && <span className="text-xs ml-1 opacity-60">({person.role})</span>}
                </span>
                {isSelected && !isAbsent && <Check size={16} />}
                {isAbsent && <UserX size={16} className="text-red-300 dark:text-red-800" />}
              </div>
            );
          })}
          {options.length === 0 && <div className="p-3 text-center text-gray-400 text-xs">Brak członków w bazie</div>}
        </div>,
        document.body
      )}
    </div>
  );
};

const SongSelector = ({ songs, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);
  const coords = useDropdownPosition(wrapperRef, isOpen);

  useEffect(() => {
    const handleClick = (e) => {
        if (isOpen && wrapperRef.current && !wrapperRef.current.contains(e.target)) {
            const portal = document.getElementById('song-selector-portal');
            if (portal && !portal.contains(e.target)) setIsOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const filteredSongs = songs.filter(s => s.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div
        className="w-full px-3 py-2 bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 border border-accent-primary-lighter dark:border-accent-primary-dark rounded-lg text-sm text-accent-primary-dark dark:text-accent-primary-lighter font-medium flex items-center justify-between cursor-pointer hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-darkest/30 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>+ Wybierz pieśń...</span>
        <ChevronDown size={16} className="text-accent-primary-light" />
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
            id="song-selector-portal"
            className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 flex flex-col overflow-hidden"
            style={{
              top: coords.openUpward ? 'auto' : `${coords.top}px`,
              bottom: coords.openUpward ? `${window.innerHeight - coords.top + 4}px` : 'auto',
              left: `${coords.left}px`,
              width: `${coords.width}px`
            }}
        >
          <div className="p-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <Search size={14} className="text-gray-400" />
              <input
                autoFocus
                className="bg-transparent outline-none text-sm w-full text-gray-700 dark:text-gray-200 placeholder-gray-400"
                placeholder="Szukaj..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 max-h-48 custom-scrollbar">
            {filteredSongs.length === 0 ? (
              <div className="p-3 text-xs text-gray-400 text-center">Brak wyników</div>
            ) : (
              filteredSongs.map(s => (
                <div
                  key={s.id}
                  className="px-4 py-2 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex justify-between items-center border-b border-gray-50 dark:border-gray-800 last:border-0"
                  onClick={() => {
                    onSelect(s);
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  <span className="font-medium">{s.title}</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">{s.key}</span>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const SortableSongItem = ({ item, idx, songDef, onRemove, onChangeKey }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.internalId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: transform ? 999 : 'auto',
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-accent-primary-lighter dark:border-accent-primary-darkest/30 rounded-lg shadow-sm group">
      <div {...attributes} {...listeners} className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-accent-primary active:cursor-grabbing">
        <GripVertical size={14} />
      </div>

      <div className="flex items-center gap-2 flex-1">
        <span className="text-accent-primary-dark dark:text-accent-primary-light font-medium text-xs">{idx + 1}.</span>
        <span className="text-gray-700 dark:text-gray-200 text-sm truncate">{songDef.title}</span>
      </div>

      <div className="flex items-center gap-1">
        <div className="relative">
          <select
            className="appearance-none bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-[10px] font-bold py-0.5 pl-2 pr-4 rounded focus:outline-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
            value={item.key}
            onChange={(e) => onChangeKey(item.internalId, e.target.value)}
          >
            {MUSICAL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        <button onClick={() => onRemove(item.internalId)} className="text-gray-300 dark:text-gray-600 hover:text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

// --- SCHEDULE ITEM COMPONENT (Planning Center style) ---

const ScheduleItem = ({ item, index, isSelected, onSelect, onDelete, songs, onUpdateKey }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [showKeyPicker, setShowKeyPicker] = useState(false);
  const keyPickerRef = useRef(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative',
  };

  const itemType = ITEM_TYPES[item.type] || ITEM_TYPES.item;
  const IconComponent = itemType.icon;

  // Close key picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (keyPickerRef.current && !keyPickerRef.current.contains(e.target)) {
        setShowKeyPicker(false);
      }
    };
    if (showKeyPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showKeyPicker]);

  // Get song details
  const song = item.type === 'song' && item.songId ? songs.find(s => s.id === item.songId) : null;
  const songTitle = song?.title || (item.type === 'song' ? (item.title || 'Wybierz pieśń...') : null);
  const currentKey = item.songKey || song?.key;

  // Header rendering
  if (item.type === 'header') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        onClick={() => onSelect(item)}
        className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all
          ${isDragging ? 'opacity-50 scale-[1.02] shadow-xl' : ''}
          ${isSelected
            ? 'bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-900/10 border-l-[3px] border-amber-500'
            : 'bg-gradient-to-r from-gray-100/80 to-transparent dark:from-gray-700/40 dark:to-transparent hover:from-amber-50 dark:hover:from-amber-900/20'}
        `}
      >
        <div {...attributes} {...listeners} className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-amber-500 active:cursor-grabbing p-1 -ml-1 rounded hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition">
          <GripVertical size={14} />
        </div>
        <div className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
          <MoreHorizontal size={14} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 flex items-center gap-2">
          <span className="font-semibold text-[13px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {item.title || 'Nowy nagłówek'}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition"
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  // Regular item rendering
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(item)}
      className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all
        ${isDragging ? 'opacity-50 scale-[1.02] shadow-xl bg-white dark:bg-gray-800 rounded-lg' : ''}
        ${isSelected
          ? 'bg-gradient-to-r from-accent-primary-lightest to-transparent dark:from-accent-primary-darkest/20 dark:to-transparent border-l-[3px] border-accent-primary-light'
          : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/50 border-l-[3px] border-transparent'}
      `}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-accent-primary-light active:cursor-grabbing p-1 -ml-1 rounded hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 transition">
        <GripVertical size={14} />
      </div>

      {/* Type indicator */}
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${itemType.bg} shadow-sm`}>
        <IconComponent size={14} className={itemType.color} />
      </div>

      {/* Title & info */}
      <div className="flex-1 min-w-0 py-0.5">
        <div className="font-medium text-[13px] text-gray-800 dark:text-gray-200 truncate leading-tight">
          {item.type === 'song' ? songTitle : (item.title || 'Nowy element')}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.person && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <User size={10} className="text-gray-400" />
              {item.person}
            </span>
          )}
          {item.timing && item.timing !== 'during' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              item.timing === 'before' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            }`}>
              {item.timing === 'before' ? 'Przed' : 'Po'}
            </span>
          )}
        </div>
      </div>

      {/* Song key badge with quick picker */}
      {item.type === 'song' && (
        <div className="relative" ref={keyPickerRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowKeyPicker(!showKeyPicker);
            }}
            className={`text-[11px] font-bold px-2 py-1 rounded-md shadow-sm border transition-all hover:scale-105
              ${currentKey
                ? 'bg-gradient-to-r from-accent-primary-lighter to-accent-primary-lightest dark:from-accent-primary-darkest/40 dark:to-accent-primary-darkest/20 text-accent-primary-dark dark:text-accent-primary-lighter border-accent-primary-lighter/50 dark:border-accent-primary-dark/50 hover:border-accent-primary-lighter dark:hover:border-accent-primary-dark'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-accent-primary-lighter dark:hover:border-accent-primary'
              }`}
            title="Zmień tonację"
          >
            {currentKey || '?'}
          </button>

          {/* Key picker dropdown */}
          {showKeyPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-2 min-w-[200px]">
              <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">Wybierz tonację</div>
              <div className="grid grid-cols-6 gap-1">
                {MUSICAL_KEYS.map(k => (
                  <button
                    key={k}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateKey(item.id, k);
                      setShowKeyPicker(false);
                    }}
                    className={`py-1.5 text-[10px] font-bold rounded-lg transition-all
                      ${currentKey === k
                        ? 'bg-accent-primary-light text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-darkest/40 hover:text-accent-primary dark:hover:text-accent-primary-light'
                      }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {currentKey && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateKey(item.id, null);
                    setShowKeyPicker(false);
                  }}
                  className="w-full mt-2 py-1.5 text-[10px] text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                >
                  Usuń tonację
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Duration */}
      <div className="w-14 text-right">
        <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          {formatTime(item.duration || 0)}
        </span>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

// --- ITEM EDIT PANEL (Side panel like Planning Center) ---

const ItemEditPanel = ({ item, songs, worshipTeam = [], mediaTeam = [], onUpdate, onClose, onDelete }) => {
  if (!item) return null;

  const [activeTab, setActiveTab] = useState('details');
  const itemType = ITEM_TYPES[item.type] || ITEM_TYPES.item;
  const IconComponent = itemType.icon;

  const tabs = [
    { id: 'details', label: 'Szczegóły', icon: Info },
    ...(item.type === 'song' ? [{ id: 'song', label: 'Pieśń', icon: Music }] : []),
    ...(item.type === 'media' ? [{ id: 'media', label: 'Media', icon: Image }] : []),
    { id: 'teams', label: 'Zespoły', icon: User },
    { id: 'notes', label: 'Notatki', icon: NoteIcon },
  ];

  const handleChange = (field, value) => {
    onUpdate({ ...item, [field]: value });
  };

  const handleTeamAssignment = (team, value) => {
    onUpdate({
      ...item,
      teamAssignments: {
        ...item.teamAssignments,
        [team]: value
      }
    });
  };

  // Get song details
  const selectedSong = item.type === 'song' && item.songId ? songs.find(s => s.id === item.songId) : null;

  // Timing options
  const timingOptions = [
    { value: 'before', label: 'Przed', icon: '◀' },
    { value: 'during', label: 'W trakcie', icon: '●' },
    { value: 'after', label: 'Po', icon: '▶' },
  ];

  return (
    <div className="w-full lg:w-[380px] bg-gradient-to-b from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/50 border-l border-gray-200/80 dark:border-gray-700/80 flex flex-col h-full shadow-[-4px_0_20px_rgba(0,0,0,0.03)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${itemType.bg} shadow-sm`}>
            <IconComponent size={18} className={itemType.color} />
          </div>
          <div>
            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">Edytuj element</span>
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${itemType.bg} ${itemType.color} font-medium`}>
              {itemType.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDelete(item.id)}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition"
            title="Usuń element"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
            title="Zamknij"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Title input */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Tytuł</label>
        <input
          type="text"
          value={item.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder={item.type === 'header' ? 'Nazwa sekcji...' : 'Tytuł elementu...'}
          className="w-full text-base font-medium bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-lighter dark:focus:border-accent-primary-dark text-gray-800 dark:text-white placeholder-gray-400 transition"
        />
      </div>

      {/* Duration & timing */}
      {item.type !== 'header' && (
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 space-y-4">
          {/* Duration */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Czas trwania</label>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200/80 dark:border-gray-700/80">
              <Clock size={16} className="text-gray-400" />
              <input
                type="number"
                min="0"
                value={Math.floor((item.duration || 0) / 60)}
                onChange={(e) => handleChange('duration', (parseInt(e.target.value) || 0) * 60 + ((item.duration || 0) % 60))}
                className="w-16 px-3 py-2 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-center focus:ring-2 focus:ring-accent-primary-light/20 outline-none"
              />
              <span className="text-gray-400 text-xs font-medium">min</span>
              <input
                type="number"
                min="0"
                max="59"
                value={(item.duration || 0) % 60}
                onChange={(e) => handleChange('duration', Math.floor((item.duration || 0) / 60) * 60 + (parseInt(e.target.value) || 0))}
                className="w-16 px-3 py-2 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-center focus:ring-2 focus:ring-accent-primary-light/20 outline-none"
              />
              <span className="text-gray-400 text-xs font-medium">sek</span>
              <div className="ml-auto text-base font-mono font-bold text-accent-primary dark:text-accent-primary-light bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 px-3 py-1.5 rounded-lg">
                {formatTime(item.duration || 0)}
              </div>
            </div>
          </div>

          {/* Timing */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Kiedy wyświetlić</label>
            <div className="grid grid-cols-3 gap-2">
              {timingOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleChange('timing', opt.value)}
                  className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl font-medium text-xs transition-all
                    ${item.timing === opt.value || (!item.timing && opt.value === 'during')
                      ? 'bg-gradient-to-b from-accent-primary-light to-accent-primary text-white shadow-lg shadow-accent-primary-light/25'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <span className="text-base">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {item.type !== 'header' && (
        <div className="flex gap-1 px-3 pt-3 pb-0 bg-gray-50/50 dark:bg-gray-800/30">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-t-lg transition-all
                ${activeTab === tab.id
                  ? 'bg-white dark:bg-gray-900 text-accent-primary dark:text-accent-primary-light shadow-sm border border-gray-200/80 dark:border-gray-700/80 border-b-white dark:border-b-gray-900 -mb-px relative z-10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              `}
            >
              <tab.icon size={14} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar bg-white dark:bg-gray-900 border-t border-gray-200/80 dark:border-gray-700/80">
        {/* Notes tab */}
        {(activeTab === 'notes' || item.type === 'header') && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <NoteIcon size={12} />
                Notatki
              </label>
              <textarea
                value={item.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Dodaj notatki dotyczące tego elementu..."
                rows={6}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-xl text-sm resize-none focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-lighter dark:focus:border-accent-primary-dark outline-none transition"
              />
            </div>
          </div>
        )}

        {/* Details tab */}
        {activeTab === 'details' && item.type !== 'header' && (
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <User size={12} />
                Osoba odpowiedzialna
              </label>
              <input
                type="text"
                value={item.person || ''}
                onChange={(e) => handleChange('person', e.target.value)}
                placeholder="Wpisz imię i nazwisko..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-xl text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-lighter dark:focus:border-accent-primary-dark outline-none transition"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Mic2 size={12} />
                Dodatkowe szczegóły
              </label>
              <textarea
                value={item.details || ''}
                onChange={(e) => handleChange('details', e.target.value)}
                placeholder="Instrukcje, uwagi techniczne..."
                rows={4}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-xl text-sm resize-none focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-lighter dark:focus:border-accent-primary-dark outline-none transition"
              />
            </div>
          </div>
        )}

        {/* Song tab */}
        {activeTab === 'song' && item.type === 'song' && (
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Music size={12} />
                Wybrana pieśń
              </label>
              {selectedSong ? (
                <div className="p-4 bg-gradient-to-r from-accent-primary-lightest to-accent-primary-lighter/50 dark:from-accent-primary-darkest/20 dark:to-accent-primary-darkest/10 border border-accent-primary-lighter/80 dark:border-accent-primary-dark/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-accent-primary-lighter dark:bg-accent-primary-darkest/40 rounded-lg flex items-center justify-center">
                      <Music size={18} className="text-accent-primary dark:text-accent-primary-light" />
                    </div>
                    <div>
                      <div className="font-semibold text-accent-primary-dark dark:text-accent-primary-lighter">{selectedSong.title}</div>
                      <div className="text-xs text-accent-primary/70 dark:text-accent-primary-light/70 mt-0.5">Oryginalna tonacja: {selectedSong.key}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <SongSelector
                  songs={songs}
                  onSelect={(song) => {
                    handleChange('songId', song.id);
                    handleChange('songKey', song.key);
                    handleChange('title', song.title);
                  }}
                />
              )}
            </div>

            {selectedSong && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Tonacja wykonania</label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {MUSICAL_KEYS.map(k => (
                      <button
                        key={k}
                        onClick={() => handleChange('songKey', k)}
                        className={`py-2 text-xs font-bold rounded-lg transition-all
                          ${(item.songKey || selectedSong.key) === k
                            ? 'bg-gradient-to-b from-accent-primary-light to-accent-primary text-white shadow-lg shadow-accent-primary-light/25'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }
                        `}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    handleChange('songId', null);
                    handleChange('songKey', null);
                    handleChange('title', '');
                  }}
                  className="w-full px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700 rounded-xl transition flex items-center justify-center gap-2"
                >
                  <X size={14} />
                  Zmień pieśń
                </button>
              </>
            )}
          </div>
        )}

        {/* Media tab */}
        {activeTab === 'media' && item.type === 'media' && (
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Image size={12} />
                Typ mediów
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'video', label: 'Wideo', icon: '🎬' },
                  { value: 'presentation', label: 'Prezentacja', icon: '📊' },
                  { value: 'image', label: 'Obraz', icon: '🖼️' },
                  { value: 'countdown', label: 'Odliczanie', icon: '⏱️' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleChange('mediaType', opt.value)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all
                      ${(item.mediaType || 'video') === opt.value
                        ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">URL / Ścieżka do pliku</label>
              <input
                type="text"
                value={item.mediaUrl || ''}
                onChange={(e) => handleChange('mediaUrl', e.target.value)}
                placeholder="https://example.com/video.mp4"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-xl text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-lighter dark:focus:border-accent-primary-dark outline-none transition font-mono"
              />
            </div>
          </div>
        )}

        {/* Teams tab */}
        {activeTab === 'teams' && item.type !== 'header' && (
          <div className="space-y-5">
            {/* Technical team assignments */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100/30 dark:from-blue-900/20 dark:to-blue-900/10 rounded-xl p-4 border border-blue-200/50 dark:border-blue-800/30">
              <h4 className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Mic2 size={12} />
                Zespół techniczny
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-400/70 mb-1.5">Audio / Nagłośnienie</label>
                  <select
                    value={item.teamAssignments?.audio || ''}
                    onChange={(e) => handleTeamAssignment('audio', e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-blue-200/80 dark:border-blue-700/50 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  >
                    <option value="">— Wybierz osobę —</option>
                    {mediaTeam.map(member => (
                      <option key={member.id} value={member.full_name}>{member.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-400/70 mb-1.5">Visual / ProPresenter</label>
                  <select
                    value={item.teamAssignments?.visual || ''}
                    onChange={(e) => handleTeamAssignment('visual', e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-blue-200/80 dark:border-blue-700/50 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  >
                    <option value="">— Wybierz osobę —</option>
                    {mediaTeam.map(member => (
                      <option key={member.id} value={member.full_name}>{member.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {item.type === 'song' && (
              <div className="bg-gradient-to-r from-accent-primary-lightest to-accent-primary-lighter/30 dark:from-accent-primary-darkest/20 dark:to-accent-primary-darkest/10 rounded-xl p-4 border border-accent-primary-lighter/50 dark:border-accent-primary-dark/30">
                <h4 className="text-[11px] font-bold text-accent-primary-dark dark:text-accent-primary-light uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Music size={12} />
                  Zespół muzyczny
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-medium text-accent-primary/70 dark:text-accent-primary-light/70 mb-1.5">Konfiguracja zespołu</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { value: '', label: 'Cały' },
                        { value: 'full', label: 'Pełny' },
                        { value: 'acoustic', label: 'Akust.' },
                        { value: 'minimal', label: 'Minimal.' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => handleTeamAssignment('band', opt.value)}
                          className={`py-2 text-[11px] font-medium rounded-lg transition-all
                            ${(item.teamAssignments?.band || '') === opt.value
                              ? 'bg-accent-primary-light text-white shadow-sm'
                              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-accent-primary-lighter/80 dark:border-accent-primary-dark/50 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30'
                            }
                          `}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-accent-primary/70 dark:text-accent-primary-light/70 mb-1.5">Wokalista prowadzący</label>
                    <select
                      value={item.teamAssignments?.vocals || ''}
                      onChange={(e) => handleTeamAssignment('vocals', e.target.value)}
                      className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-accent-primary-lighter/80 dark:border-accent-primary-dark/50 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none transition"
                    >
                      <option value="">— Wybierz osobę —</option>
                      {worshipTeam.map(member => (
                        <option key={member.id} value={member.full_name}>{member.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Team assignments summary */}
            {Object.entries(item.teamAssignments || {}).filter(([_, v]) => v).length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200/80 dark:border-gray-700/50">
                <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Podsumowanie</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(item.teamAssignments || {}).filter(([_, v]) => v).map(([key, value]) => (
                    <span key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-gray-700 rounded-lg text-xs border border-gray-200 dark:border-gray-600 shadow-sm">
                      <span className="text-gray-400 capitalize">{key}:</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{value}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- ADD ITEM DROPDOWN ---

const AddItemDropdown = ({ onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (isOpen && wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const items = [
    { type: 'item', label: 'Element', icon: Type, shortcut: 'i' },
    { type: 'header', label: 'Nagłówek', icon: MoreHorizontal, shortcut: 'h' },
    { type: 'song', label: 'Pieśń', icon: Music, shortcut: 's' },
    { type: 'media', label: 'Media', icon: Image, shortcut: 'm' },
  ];

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-accent-primary-light/20 transition"
      >
        <Plus size={16} />
        Dodaj
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 text-xs font-medium text-gray-400 uppercase">Przeciągnij lub kliknij</div>
          {items.map(item => (
            <button
              key={item.type}
              onClick={() => {
                onAdd(item.type);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-left"
            >
              <item.icon size={16} className="text-gray-500" />
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{item.shortcut}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// --- DYNAMICZNA SEKCJA ZESPOŁU Z MULTISELECT ---

const DynamicTeamSection = ({ title, dataKey, program, setProgram, roles, teamMembers, fallbackFields, absentList, memberRoles = [] }) => {
  const fields = roles.length > 0
    ? roles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
    : fallbackFields;

  const handleChange = (fieldKey, newValue) => {
    setProgram(prev => ({
      ...prev,
      [dataKey]: {
        ...prev[dataKey],
        [fieldKey]: newValue
      }
    }));
  };

  const getMembersForRole = (roleId) => {
    if (!roleId || memberRoles.length === 0) {
      return teamMembers;
    }
    const assignedMemberIds = memberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => String(mr.member_id));

    if (assignedMemberIds.length === 0) {
      return teamMembers;
    }

    return teamMembers.filter(member => assignedMemberIds.includes(String(member.id)));
  };

  return (
    <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 dark:border-gray-700/50 p-6 h-full hover:shadow-xl transition relative z-0">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg bg-gradient-to-r from-accent-primary-dark to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent">{title}</h3>
      </div>
      <div className="space-y-4">
        {teamMembers.length > 0 ? (
          fields.map(field => (
            <MultiSelect
              key={field.key}
              label={field.label}
              options={getMembersForRole(field.roleId)}
              value={program[dataKey]?.[field.key] || ''}
              onChange={(newValue) => handleChange(field.key, newValue)}
              absentMembers={absentList}
            />
          ))
        ) : (
          fields.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{field.label}</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program[dataKey]?.[field.key] || ''}
                onChange={e => handleChange(field.key, e.target.value)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- SEKCJA SZKÓŁKI Z DYNAMICZNYMI POLAMI ---

const AbsenceMultiSelectDashboard = ({ options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const coords = useDropdownPosition(wrapperRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    const handleClick = (e) => {
      if (isOpen && wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        const portal = document.getElementById('absence-multiselect-portal');
        if (portal && !portal.contains(e.target)) setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const toggleSelection = (name) => {
    const newSelection = selectedItems.includes(name)
      ? selectedItems.filter(i => i !== name)
      : [...selectedItems, name];
    onChange(newSelection.join(', '));
  };

  return (
    <div ref={wrapperRef} className="relative group">
      <div
        className="w-full min-h-[42px] px-4 py-2 bg-red-50/50 dark:bg-red-900/20 backdrop-blur-sm border border-red-200/50 dark:border-red-700/50 rounded-xl focus-within:ring-2 focus-within:ring-red-500/20 cursor-pointer flex flex-wrap gap-2 items-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-sm">Wybierz nieobecnych...</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-lg text-xs font-medium border border-red-200 dark:border-red-800 flex items-center gap-1">
              {item}
              <span
                onClick={(e) => { e.stopPropagation(); toggleSelection(item); }}
                className="hover:bg-red-200 dark:hover:bg-red-800 rounded-full p-0.5 cursor-pointer"
              >
                <X size={10} />
              </span>
            </span>
          ))
        )}
        <div className="ml-auto">
          <ChevronDown size={16} className="text-gray-400" />
        </div>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          id="absence-multiselect-portal"
          className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar"
          style={{
            top: coords.openUpward ? 'auto' : `${coords.top}px`,
            bottom: coords.openUpward ? `${window.innerHeight - coords.top + 4}px` : 'auto',
            left: `${coords.left}px`,
            width: `${coords.width}px`
          }}
        >
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            return (
              <div
                key={person.id}
                className={`px-4 py-2 text-sm cursor-pointer flex items-center justify-between transition
                  hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-700 dark:text-gray-300
                  ${isSelected ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium' : ''}
                `}
                onClick={() => toggleSelection(person.full_name)}
              >
                <span>{person.full_name}</span>
                {isSelected && <UserX size={16} className="text-red-500" />}
              </div>
            );
          })}
          {options.length === 0 && <div className="p-3 text-center text-gray-400 text-xs">Brak nauczycieli w bazie</div>}
        </div>,
        document.body
      )}
    </div>
  );
};

const SzkolkaSection = ({ program, setProgram, kidsGroups, kidsTeachers }) => {
  const absentList = program.szkolka?.absencja
    ? program.szkolka.absencja.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const handleTeacherChange = (groupId, newValue) => {
    setProgram(prev => ({
      ...prev,
      szkolka: {
        ...prev.szkolka,
        [groupId]: newValue
      }
    }));
  };

  const handleFieldChange = (fieldKey, newValue) => {
    setProgram(prev => ({
      ...prev,
      szkolka: {
        ...prev.szkolka,
        [fieldKey]: newValue
      }
    }));
  };

  return (
    <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 dark:border-gray-700/50 p-6 h-full hover:shadow-xl transition relative z-0">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg bg-gradient-to-r from-accent-primary-dark to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent">Szkółka Niedzielna</h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Temat lekcji</label>
          <input
            className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            value={program.szkolka?.temat || ''}
            onChange={e => handleFieldChange('temat', e.target.value)}
            placeholder="Temat lekcji..."
          />
        </div>

        {kidsGroups.length > 0 ? (
          kidsGroups.map(group => (
            <MultiSelect
              key={group.id}
              label={group.name}
              options={kidsTeachers}
              value={program.szkolka?.[group.id] || ''}
              onChange={(newValue) => handleTeacherChange(group.id, newValue)}
              absentMembers={absentList}
            />
          ))
        ) : (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Grupa Młodsza</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.mlodsza || ''}
                onChange={e => handleFieldChange('mlodsza', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Grupa Średnia</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.srednia || ''}
                onChange={e => handleFieldChange('srednia', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Grupa Starsza</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.starsza || ''}
                onChange={e => handleFieldChange('starsza', e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-bold text-red-500 dark:text-red-400 uppercase mb-1 ml-1">Absencja nauczycieli</label>
          <div className="relative">
            <AbsenceMultiSelectDashboard
              options={kidsTeachers}
              value={program.szkolka?.absencja || ''}
              onChange={(newValue) => handleFieldChange('absencja', newValue)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Notatki</label>
          <input
            className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            value={program.szkolka?.notatki || ''}
            onChange={e => handleFieldChange('notatki', e.target.value)}
            placeholder="Notatki..."
          />
        </div>
      </div>
    </div>
  );
};

// --- DYNAMICZNA SEKCJA SCENA ---

const DynamicScenaSection = ({
  program,
  setProgram,
  teachingSpeakers,
  mcMembers,
  mcRoles,
  mcMemberRoles
}) => {
  const mcFields = mcRoles.length > 0
    ? mcRoles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id, source: 'mc' }))
    : [
        { key: 'prowadzenie', label: 'Prowadzenie', roleId: null, source: 'mc' },
        { key: 'modlitwa', label: 'Modlitwa', roleId: null, source: 'mc' },
        { key: 'wieczerza', label: 'Wieczerza', roleId: null, source: 'mc' },
        { key: 'ogloszenia', label: 'Ogłoszenia', roleId: null, source: 'mc' }
      ];

  const kazanieField = { key: 'kazanie', label: 'Kazanie', source: 'teaching' };

  const allFields = [];
  let kazanieAdded = false;

  for (const field of mcFields) {
    allFields.push(field);
    if (!kazanieAdded && (field.key === 'modlitwa' || field.key === 'prowadzenie')) {
      const nextIdx = mcFields.indexOf(field) + 1;
      if (nextIdx >= mcFields.length || mcFields[nextIdx].key !== 'kazanie') {
        allFields.push(kazanieField);
        kazanieAdded = true;
      }
    }
  }

  if (!kazanieAdded) {
    allFields.push(kazanieField);
  }

  const getMcMembersForRole = (roleId) => {
    if (!roleId || mcMemberRoles.length === 0) {
      return mcMembers;
    }
    const assignedMemberIds = mcMemberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => String(mr.member_id));

    if (assignedMemberIds.length === 0) {
      return mcMembers;
    }

    return mcMembers.filter(member => assignedMemberIds.includes(String(member.id)));
  };

  const mcScheduleKey = 'custom_mc_schedule';

  const handleChange = (fieldKey, newValue, source) => {
    if (source === 'teaching') {
      const speaker = teachingSpeakers.find(s => s.name === newValue);
      setProgram(prev => ({
        ...prev,
        teaching: {
          ...prev.teaching,
          speaker_id: speaker?.id || null,
          speaker_name: newValue
        }
      }));
    } else {
      setProgram(prev => ({
        ...prev,
        [mcScheduleKey]: {
          ...prev[mcScheduleKey],
          [fieldKey]: newValue
        }
      }));
    }
  };

  const getSpeakerFromTeaching = () => {
    if (program.teaching?.speaker_name) {
      return program.teaching.speaker_name;
    }
    if (program.teaching?.speaker_id) {
      const speaker = teachingSpeakers.find(s => s.id === program.teaching.speaker_id);
      return speaker?.name || '';
    }
    return '';
  };

  const getMcValueFromSchedule = (fieldKey) => {
    if (program[mcScheduleKey]?.[fieldKey]) {
      return program[mcScheduleKey][fieldKey];
    }
    return '';
  };

  const speakersAsMembers = teachingSpeakers.map(s => ({ id: s.id, full_name: s.name }));

  return (
    <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 dark:border-gray-700/50 p-6 h-full hover:shadow-xl transition relative z-0">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg bg-gradient-to-r from-accent-primary-dark to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent">Scena</h3>
      </div>
      <div className="space-y-4">
        {allFields.map(field => {
          if (field.source === 'teaching') {
            const displayValue = getSpeakerFromTeaching();

            return speakersAsMembers.length > 0 ? (
              <MultiSelect
                key={field.key}
                label={field.label}
                options={speakersAsMembers}
                value={displayValue}
                onChange={(newValue) => handleChange(field.key, newValue, 'teaching')}
                absentMembers={[]}
              />
            ) : (
              <div key={field.key}>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{field.label}</label>
                <input
                  className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                  value={displayValue}
                  onChange={e => handleChange(field.key, e.target.value, 'teaching')}
                />
              </div>
            );
          }

          const displayValue = getMcValueFromSchedule(field.key);
          const membersForRole = getMcMembersForRole(field.roleId);

          return membersForRole.length > 0 ? (
            <MultiSelect
              key={field.key}
              label={field.label}
              options={membersForRole}
              value={displayValue}
              onChange={(newValue) => handleChange(field.key, newValue, 'mc')}
              absentMembers={[]}
            />
          ) : (
            <div key={field.key}>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{field.label}</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={displayValue}
                onChange={e => handleChange(field.key, e.target.value, 'mc')}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- MODAL OSTRZEŻENIA O NIEZAPISANYCH ZMIANACH ---

const UnsavedChangesModal = ({ isOpen, onClose, onSave, onDiscard }) => {
  if (!isOpen || !document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-white/20 dark:border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-accent-secondary-lighter dark:bg-accent-secondary/30 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={24} className="text-accent-secondary dark:text-accent-secondary-light" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">Niezapisane zmiany</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Masz niezapisane zmiany w programie. Co chcesz zrobić?
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onDiscard}
            className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Opuść
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-bold rounded-xl hover:shadow-lg hover:shadow-accent-primary-light/30 transition flex items-center justify-center gap-2"
          >
            <Save size={16} /> Zapisz
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- MODAL SZABLONÓW ---

const TemplateModal = ({ isOpen, onClose, templates, onLoad, onDelete }) => {
  if (!isOpen || !document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-white/20 dark:border-gray-700 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <FileText size={20} className="text-accent-primary-light" />
            Szablony programów
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {templates.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Brak zapisanych szablonów</p>
              <p className="text-xs mt-1">Zapisz aktualny plan jako szablon</p>
            </div>
          ) : (
            templates.map(template => (
              <div
                key={template.id}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition group"
              >
                <div className="w-10 h-10 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-accent-primary dark:text-accent-primary-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate">
                    {template.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {template.schedule?.length || 0} elementów
                    {template.created_at && ` • ${new Date(template.created_at).toLocaleDateString('pl-PL')}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onLoad(template)}
                    className="px-3 py-1.5 text-xs font-medium text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 rounded-lg transition"
                  >
                    Wczytaj
                  </button>
                  <button
                    onClick={() => onDelete(template.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- GŁÓWNY KOMPONENT ---

export default function ProgramDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNewProgram = id === 'new';
  const { setHasUnsavedChanges: setGlobalUnsavedChanges, setOnSaveCallback } = useUnsavedChanges();
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();

  const [program, setProgram] = useState(getEmptyProgram());
  const [originalProgram, setOriginalProgram] = useState(null);
  const [songs, setSongs] = useState([]);
  const [worshipTeam, setWorshipTeam] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProgram, setIsLoadingProgram] = useState(!isNewProgram);

  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Schedule editor state
  const [selectedScheduleItem, setSelectedScheduleItem] = useState(null);
  const [scheduleTab, setScheduleTab] = useState('order'); // 'order', 'teams', 'rehearse'

  const [kidsGroups, setKidsGroups] = useState([]);
  const [kidsTeachers, setKidsTeachers] = useState([]);

  const [worshipRoles, setWorshipRoles] = useState([]);
  const [mediaRoles, setMediaRoles] = useState([]);
  const [atmosferaRoles, setAtmosferaRoles] = useState([]);
  const [mediaTeam, setMediaTeam] = useState([]);
  const [atmosferaTeam, setAtmosferaTeam] = useState([]);

  const [worshipMemberRoles, setWorshipMemberRoles] = useState([]);
  const [mediaMemberRoles, setMediaMemberRoles] = useState([]);
  const [atmosferaMemberRoles, setAtmosferaMemberRoles] = useState([]);

  const [teachingSpeakers, setTeachingSpeakers] = useState([]);
  const [seriesGraphics, setSeriesGraphics] = useState([]);
  const [mcMembers, setMcMembers] = useState([]);
  const [mcRoles, setMcRoles] = useState([]);
  const [mcMemberRoles, setMcMemberRoles] = useState([]);
  const [programTypeConfig, setProgramTypeConfig] = useState(null);

  // Template state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchSongs();
    fetchWorshipTeam();
    fetchKidsData();
    fetchTeamRoles();
    fetchAllTeams();
    fetchScenaData();
    fetchTemplates();

    if (!isNewProgram && id) {
      fetchProgram(id);
    } else {
      const empty = getEmptyProgram();
      setProgram(empty);
      setOriginalProgram(JSON.parse(JSON.stringify(empty)));
    }
  }, [id, isNewProgram]);

  // Fetch series graphics when program's teaching series changes
  useEffect(() => {
    const seriesId = program?.teaching?.series_id;
    if (seriesId) {
      supabase.from('teaching_series').select('graphics').eq('id', seriesId).single()
        .then(({ data }) => setSeriesGraphics(data?.graphics || []));
    } else {
      setSeriesGraphics([]);
    }
  }, [program?.teaching?.series_id]);

  // Fetch program type config for conditional section rendering
  useEffect(() => {
    const typeId = program?.type_id;
    if (typeId) {
      supabase.from('program_types').select('visible_sections').eq('id', typeId).maybeSingle()
        .then(({ data }) => setProgramTypeConfig(data));
    } else {
      setProgramTypeConfig(null); // Show all sections when no type
    }
  }, [program?.type_id]);

  // Helper: check if a section is visible for the current program type
  const isSectionVisible = (sectionKey) => {
    if (!programTypeConfig?.visible_sections) return true; // No config = show all
    return programTypeConfig.visible_sections.includes(sectionKey);
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('program_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error) setTemplates(data || []);
    } catch (err) {
      // Tabela może jeszcze nie istnieć
    }
  };

  const handleSaveAsTemplate = async () => {
    const name = window.prompt('Podaj nazwę szablonu:', program.title || 'Nowy szablon');
    if (!name) return;

    try {
      const templateData = {
        name,
        schedule: program.schedule.map(item => ({
          ...item,
          id: undefined, // Remove IDs so new ones are generated
        })),
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('program_templates')
        .insert([templateData]);

      if (error) throw error;
      alert('Szablon został zapisany!');
      fetchTemplates();
    } catch (err) {
      console.error('Błąd zapisywania szablonu:', err);
      alert('Nie udało się zapisać szablonu.');
    }
  };

  const handleLoadTemplate = (template) => {
    const newSchedule = template.schedule.map(item => ({
      ...item,
      id: Date.now() + Math.random(), // Generate new unique IDs
    }));
    setProgram({ ...program, schedule: newSchedule });
    setShowTemplateModal(false);
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć ten szablon?')) return;
    try {
      await supabase.from('program_templates').delete().eq('id', templateId);
      fetchTemplates();
    } catch (err) {
      console.error('Błąd usuwania szablonu:', err);
    }
  };

  const fetchProgram = async (programId) => {
    setIsLoadingProgram(true);
    const { data, error } = await supabase.from('programs').select('*').eq('id', programId).single();
    if (data && !error) {
      setProgram(data);
      setOriginalProgram(JSON.parse(JSON.stringify(data)));
    } else {
      navigate('/programs');
    }
    setIsLoadingProgram(false);
  };

  const fetchKidsData = async () => {
    try {
      const { data: groupsData } = await withCampusFilter(supabase.from('kids_groups').select('*')).order('created_at');
      const { data: teachersData } = await supabase.from('kids_teachers').select('*').order('full_name');
      setKidsGroups(groupsData || []);
      setKidsTeachers(teachersData || []);
    } catch (err) {
      console.error('Błąd pobierania danych Kids:', err);
    }
  };

  const hasUnsavedChanges = useCallback(() => {
    if (!program || !originalProgram) return false;
    return JSON.stringify(program) !== JSON.stringify(originalProgram);
  }, [program, originalProgram]);

  useEffect(() => {
    const unsaved = hasUnsavedChanges();
    setGlobalUnsavedChanges(unsaved);
  }, [hasUnsavedChanges, setGlobalUnsavedChanges]);

  useEffect(() => {
    setOnSaveCallback(() => handleSave);
    return () => setOnSaveCallback(null);
  }, [setOnSaveCallback, program]);

  useEffect(() => {
    return () => {
      setGlobalUnsavedChanges(false);
    };
  }, [setGlobalUnsavedChanges]);

  function getEmptyProgram() {
    // Read type_id from URL query param if creating new program
    const urlParams = new URLSearchParams(window.location.search);
    const typeIdFromUrl = urlParams.get('type');
    return {
      title: '',
      date: new Date().toISOString().split('T')[0],
      schedule: [],
      globalNotes: '',
      type_id: typeIdFromUrl ? parseInt(typeIdFromUrl, 10) : null,
      atmosfera_team: { przygotowanie: '', witanie: '' },
      produkcja: { naglosnienie: '', propresenter: '', social: '', host: '' },
      scena: { prowadzenie: '', czytanie: '', kazanie: '', modlitwa: '', wieczerza: '', ogloszenia: '' },
      szkolka: { mlodsza: '', srednia: '', starsza: '' },
      zespol: { lider: '', piano: '', gitara_akustyczna: '', gitara_elektryczna: '', bas: '', wokale: '', cajon: '', notatki: '', absencja: '' }
    };
  }

  const fetchSongs = async () => {
    const { data } = await supabase.from('songs').select('*');
    setSongs(data || []);
  };

  const fetchWorshipTeam = async () => {
    const { data } = await supabase.from('worship_team').select('*').order('full_name');
    setWorshipTeam(data || []);
  };

  const fetchTeamRoles = async () => {
    try {
      const { data } = await supabase.from('team_roles').select('*').eq('is_active', true).order('display_order');
      if (data) {
        setWorshipRoles(data.filter(r => r.team_type === 'worship'));
        setMediaRoles(data.filter(r => r.team_type === 'media'));
        setAtmosferaRoles(data.filter(r => r.team_type === 'atmosfera'));
      }

      const { data: memberRolesData } = await supabase.from('team_member_roles').select('*');
      if (memberRolesData) {
        setWorshipMemberRoles(memberRolesData.filter(mr => mr.member_table === 'worship_team'));
        setMediaMemberRoles(memberRolesData.filter(mr => mr.member_table === 'media_team'));
        setAtmosferaMemberRoles(memberRolesData.filter(mr => mr.member_table === 'atmosfera_members'));
      }
    } catch (err) {
      console.error('Błąd pobierania służb:', err);
    }
  };

  const fetchAllTeams = async () => {
    try {
      const { data: media } = await supabase.from('media_team').select('*').order('full_name');
      const { data: atmosfera } = await supabase.from('atmosfera_members').select('*').order('full_name');
      setMediaTeam(media || []);
      setAtmosferaTeam(atmosfera || []);
    } catch (err) {
      console.error('Błąd pobierania zespołów:', err);
    }
  };

  const fetchScenaData = async () => {
    try {
      const { data: speakers } = await supabase.from('teaching_speakers').select('*').order('name');
      setTeachingSpeakers(speakers || []);

      const { data: mcMembersData, error: mcError } = await supabase
        .from('custom_mc_members')
        .select('*')
        .order('full_name');

      if (!mcError) {
        setMcMembers(mcMembersData || []);
      }

      const { data: mcRolesData } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', 'mc')
        .eq('is_active', true)
        .order('display_order');

      setMcRoles(mcRolesData || []);

      const { data: mcMemberRolesData } = await supabase
        .from('team_member_roles')
        .select('*')
        .eq('member_table', 'custom_mc_members');

      setMcMemberRoles(mcMemberRolesData || []);
    } catch (err) {
      console.error('Błąd pobierania danych Scena:', err);
    }
  };

  const handleSave = async () => {
    // Only send known base DB columns
    const BASE_COLUMNS = [
      'date', 'template', 'notes', 'status', 'type',
      'schedule', 'song_ids', 'assignments', 'file_attachments',
      'zespol', 'produkcja', 'atmosfera_team', 'scena', 'szkolka',
      'teaching', 'custom_mc_schedule', 'custom_mailing_schedule', 'custom_mail_schedule',
      'created_by'
    ];
    // Optional columns from migrations (may not exist yet)
    const OPTIONAL_COLUMNS = ['title', 'campus_id', 'graphics_override', 'type_id'];

    const dbData = {};
    for (const key of BASE_COLUMNS) {
      if (key in program && program[key] !== undefined) {
        dbData[key] = program[key];
      }
    }
    for (const key of OPTIONAL_COLUMNS) {
      if (key in program && program[key] != null) {
        dbData[key] = program[key];
      }
    }

    const doSave = async (data) => {
      if (program.id) {
        return await supabase.from('programs').update(data).eq('id', program.id).select();
      } else {
        if (campusIdForInsert) data.campus_id = campusIdForInsert;
        return await supabase.from('programs').insert([data]).select();
      }
    };

    // Try with all columns, retry without optional if 400
    let result = await doSave({ ...dbData });
    if (result.error?.code === '42703' || result.error?.message?.includes('column') || result.status === 400) {
      // Column doesn't exist - retry without optional columns
      const fallbackData = {};
      for (const key of BASE_COLUMNS) {
        if (key in program && program[key] !== undefined) {
          fallbackData[key] = program[key];
        }
      }
      result = await doSave(fallbackData);
    }

    if (result.error) {
      alert('Błąd zapisu: ' + result.error.message);
      return;
    }

    if (!program.id && result.data?.[0]) {
      navigate(`/programs/${result.data[0].id}`, { replace: true });
      setProgram(result.data[0]);
    }
    setOriginalProgram(JSON.parse(JSON.stringify(program)));
    alert('Zapisano!');
  };

  const handleSaveAndUploadPDF = async () => {
    if (!program || !program.date) {
      alert('Najpierw wybierz lub utwórz program.');
      return;
    }

    setIsLoading(true);

    try {
      const { data: allSongsData } = await supabase.from('songs').select('*');

      const freshSongsMap = {};
      (allSongsData || []).forEach(s => { freshSongsMap[s.id] = s; });

      const teamRolesForPDF = {
        worship: worshipRoles,
        media: mediaRoles,
        atmosfera: atmosferaRoles,
        kidsGroups: kidsGroups,
        mc: mcRoles,
        teachingSpeakers: teachingSpeakers
      };

      await downloadPDF(program, freshSongsMap, teamRolesForPDF);

      const result = await savePDFToSupabase(program, freshSongsMap, teamRolesForPDF);

      if (result.success) {
        alert('PDF został pobrany i zapisany w chmurze!');
      } else {
        alert('PDF pobrany na dysk, ale wystąpił błąd zapisu w chmurze.');
      }
    } catch (error) {
      console.error('Critical error saving PDF:', error);
      alert('Wystąpił błąd podczas generowania PDF.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateDocuments = async (type) => {
    try {
      const { data: songsData, error } = await supabase.from('songs').select('*');
      if (error) throw error;

      const songsMap = (songsData || []).reduce((acc, song) => {
        acc[song.id] = song;
        return acc;
      }, {});

      if (type === 'ppt') {
        await generatePPT(program, songsMap);
      }
    } catch (err) {
      console.error(`Błąd generowania ${type}:`, err);
      alert(`Wystąpił błąd podczas generowania ${type}`);
    }
  };

  const handleExportProPresenter = async () => {
    if (!program || !program.schedule || program.schedule.length === 0) {
      alert('Brak elementów w programie do eksportu.');
      return;
    }

    const songItems = program.schedule.filter(item => item.type === 'song' && item.songId);
    if (songItems.length === 0) {
      alert('Brak pieśni w programie. Eksport ProPresenter wymaga co najmniej jednej pieśni.');
      return;
    }

    try {
      const { data: songsData, error } = await supabase.from('songs').select('*');
      if (error) throw error;

      const songsMap = (songsData || []).reduce((acc, song) => {
        acc[song.id] = song;
        return acc;
      }, {});

      const result = await exportToProPresenter(program, songsMap);

      if (result.success) {
        alert(`Eksport zakończony pomyślnie!\n\nWyeksportowano ${result.songsCount} pieśni.\n\nRozpakuj pobrany plik ZIP i zaimportuj pliki do ProPresenter.`);
      }
    } catch (err) {
      console.error('Błąd eksportu do ProPresenter:', err);
      alert('Wystąpił błąd podczas eksportu do ProPresenter.');
    }
  };

  const handleSendEmail = async () => {
    if (!program || !program.date) {
      alert('Najpierw wybierz lub utwórz program.');
      return;
    }

    const recipients = getAllRecipients(program, worshipTeam);

    if (recipients.length === 0) {
      alert('Brak adresów e-mail do wysyłki. Upewnij się, że członkowie zespołu mają przypisane adresy e-mail.');
      return;
    }

    const confirmed = window.confirm(`Wysłać program do ${recipients.length} osób?\n\nOdbiorcy:\n${recipients.join('\n')}`);
    if (!confirmed) return;

    setIsSending(true);

    try {
      const { data: allSongsData } = await supabase.from('songs').select('*');
      const freshSongsMap = {};
      (allSongsData || []).forEach(s => { freshSongsMap[s.id] = s; });

      const teamRolesForPDF = {
        worship: worshipRoles,
        media: mediaRoles,
        atmosfera: atmosferaRoles,
        kidsGroups: kidsGroups,
        mc: mcRoles,
        teachingSpeakers: teachingSpeakers
      };

      const response = await fetch('/api/send-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program,
          songsMap: freshSongsMap,
          teamRoles: teamRolesForPDF,
          recipients
        })
      });

      const result = await response.json();
      if (result.success) {
        alert('Program został wysłany!');
      } else {
        alert('Błąd wysyłki: ' + (result.error || 'Nieznany błąd'));
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Wystąpił błąd podczas wysyłania.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = program.schedule.findIndex(s => s.id === active.id);
      const newIndex = program.schedule.findIndex(s => s.id === over.id);
      const newSchedule = arrayMove(program.schedule, oldIndex, newIndex);
      setProgram({ ...program, schedule: newSchedule });
    }
  };

  const handleBackToList = () => {
    if (hasUnsavedChanges()) {
      setPendingAction({ type: 'navigate', payload: '/programs' });
      setShowUnsavedModal(true);
    } else {
      navigate('/programs');
    }
  };

  const handleSaveAndProceed = async () => {
    await handleSave();
    setShowUnsavedModal(false);
    if (pendingAction?.type === 'navigate') {
      navigate(pendingAction.payload);
    }
    setPendingAction(null);
  };

  const handleDiscardAndProceed = () => {
    setShowUnsavedModal(false);
    if (pendingAction?.type === 'navigate') {
      navigate(pendingAction.payload);
    }
    setPendingAction(null);
  };

  const absentList = program.zespol?.absencja
    ? program.zespol.absencja.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (isLoadingProgram) {
    return (
      <div className="min-h-full bg-gradient-to-br from-accent-primary-lightest via-accent-secondary-lightest to-accent-primary-lightest dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-accent-primary mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">Ładowanie programu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 -m-4 lg:-m-6 p-4 md:p-6 lg:p-8">
      <div className="space-y-6">

        {/* EDYCJA PROGRAMU */}
        <div>
          {/* Przycisk wróć */}
          <button
            onClick={handleBackToList}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-4 hover:text-accent-primary dark:hover:text-accent-primary-light transition"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Wróć do listy</span>
          </button>

          <div className="flex flex-col lg:flex-row justify-between items-start gap-4 mb-6 lg:mb-8 pb-4 lg:pb-6 border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="flex-1 max-w-xl">
              <input
                type="text"
                value={program.title || ''}
                onChange={(e) => setProgram({...program, title: e.target.value})}
                placeholder={isNewProgram ? 'Nazwa programu (np. Nabożeństwo niedzielne)' : 'Nabożeństwo niedzielne'}
                className="text-xl lg:text-2xl font-bold bg-transparent border-none outline-none text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 w-full mb-2"
              />
              <div className="flex items-center gap-3">
                <CustomDatePicker
                  value={program.date}
                  onChange={(v) => setProgram({...program, date: v})}
                />
                {/* Template buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveAsTemplate}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition flex items-center gap-1"
                    title="Zapisz jako szablon"
                  >
                    <Save size={14} />
                    Szablon
                  </button>
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition flex items-center gap-1"
                    title="Wczytaj szablon"
                  >
                    <FileText size={14} />
                    Wczytaj
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:gap-3 w-full lg:w-auto">
              <button
                onClick={handleSendEmail}
                disabled={isSending}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 font-medium text-sm disabled:opacity-50"
                title="Wyślij program przez e-mail"
              >
                {isSending ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                <span className="hidden sm:inline">Mail</span>
              </button>
              <button
                onClick={handleSaveAndUploadPDF}
                disabled={isLoading}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2.5 text-accent-primary bg-accent-primary-lightest hover:bg-accent-primary-lighter rounded-lg transition-colors border border-accent-primary-lighter font-medium text-sm disabled:opacity-50"
                title="Zapisz PDF na dysku i w chmurze Supabase"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                onClick={() => generateDocuments('ppt')}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2.5 text-accent-secondary bg-accent-secondary-lightest hover:bg-accent-secondary-lighter rounded-lg transition-colors border border-accent-secondary-lighter font-medium text-sm"
              >
                <Presentation size={18} />
                <span className="hidden sm:inline">PPT</span>
              </button>
              <button
                onClick={handleExportProPresenter}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2.5 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200 font-medium text-sm"
                title="Eksportuj do ProPresenter"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                  <path d="M8 21h8"/>
                  <path d="M12 17v4"/>
                  <path d="M7 8h4"/>
                  <path d="M7 11h2"/>
                </svg>
                <span className="hidden sm:inline">ProPresenter</span>
              </button>

              <button
                onClick={handleSave}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary-light hover:from-accent-primary-dark hover:to-accent-secondary text-white rounded-lg shadow-lg shadow-accent-primary-light/20 hover:shadow-accent-primary-light/30 transition-all font-medium text-sm"
              >
                <Save size={18} />
                <span className="hidden sm:inline">Zapisz</span>
              </button>
            </div>
          </div>

          {/* SCHEDULE SECTION - Planning Center style */}
          <div className="bg-white/70 dark:bg-gray-800/40 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 dark:border-gray-700/50 mb-6 lg:mb-8 overflow-hidden">
            {/* Stats bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border-b border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={16} className="text-accent-primary-light" />
                  <span className="font-mono font-bold text-accent-primary dark:text-accent-primary-light">{formatTime(calculateTotalTime(program.schedule))}</span>
                  <span className="text-gray-500 dark:text-gray-400">łącznie</span>
                </div>
                <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium">{program.schedule.length}</span>
                  <span>elementów</span>
                </div>
                <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Music size={14} />
                  <span className="font-medium">{program.schedule.filter(s => s.type === 'song').length}</span>
                  <span>pieśni</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const notes = window.prompt('Notatki do programu:', program.globalNotes || '');
                    if (notes !== null) setProgram({ ...program, globalNotes: notes });
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition flex items-center gap-1"
                  title={program.globalNotes ? `Notatki: ${program.globalNotes}` : 'Dodaj notatki'}
                >
                  <NoteIcon size={14} />
                  {program.globalNotes ? 'Edytuj notatki' : 'Notatki'}
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row min-h-[500px] lg:min-h-[550px]">
              {/* CENTER - Order list with tabs */}
              <div className={`flex-1 flex flex-col ${selectedScheduleItem ? 'hidden lg:flex' : 'flex'}`}>
                {/* Tabs header */}
                <div className="flex items-center justify-between px-2 py-2 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-white/80 to-gray-50/50 dark:from-gray-800/50 dark:to-gray-900/30">
                  <div className="flex items-center bg-gray-100/80 dark:bg-gray-800/80 rounded-xl p-1">
                    <button
                      onClick={() => setScheduleTab('order')}
                      className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-all ${scheduleTab === 'order' ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      📋 Plan
                    </button>
                    <button
                      onClick={() => setScheduleTab('teams')}
                      className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-all ${scheduleTab === 'teams' ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      👥 Zespoły
                    </button>
                    <button
                      onClick={() => setScheduleTab('rehearse')}
                      className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-all ${scheduleTab === 'rehearse' ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      🎵 Próba
                    </button>
                  </div>
                  <AddItemDropdown
                    onAdd={(type) => {
                      const newItem = {
                        id: Date.now(),
                        type,
                        title: type === 'header' ? 'NOWA SEKCJA' : '',
                        person: '',
                        details: '',
                        notes: '',
                        duration: type === 'header' ? 0 : 180,
                        timing: 'during',
                        songId: null,
                        songKey: null,
                        teamAssignments: {},
                      };
                      setProgram({ ...program, schedule: [...program.schedule, newItem] });
                      setSelectedScheduleItem(newItem);
                    }}
                  />
                </div>

                {/* ORDER TAB CONTENT */}
                {scheduleTab === 'order' && (
                  <>
                    {/* Column headers */}
                    <div className="hidden lg:flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <div className="w-6"></div>
                      <div className="w-14">Czas</div>
                      <div className="flex-1">Tytuł</div>
                      <div className="w-20 text-right">Długość</div>
                    </div>

                    {/* Items list */}
                    <div className="flex-1 overflow-y-auto">
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={program.schedule.map(s => s.id)} strategy={verticalListSortingStrategy}>
                          <div>
                            {program.schedule.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Type size={48} className="mb-4 opacity-30" />
                                <p className="text-sm">Brak elementów w planie</p>
                                <p className="text-xs mt-1">Użyj przycisku "Dodaj" lub skrótów klawiszowych:</p>
                                <div className="flex gap-2 mt-3 text-xs">
                                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">i - Element</span>
                                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">h - Nagłówek</span>
                                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">s - Pieśń</span>
                                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">m - Media</span>
                                </div>
                              </div>
                            ) : (
                              program.schedule.map((item, idx) => (
                                <ScheduleItem
                                  key={item.id}
                                  item={item}
                                  index={idx}
                                  isSelected={selectedScheduleItem?.id === item.id}
                                  onSelect={(item) => setSelectedScheduleItem(item)}
                                  onDelete={(id) => {
                                    setProgram({ ...program, schedule: program.schedule.filter(s => s.id !== id) });
                                    if (selectedScheduleItem?.id === id) setSelectedScheduleItem(null);
                                  }}
                                  songs={songs}
                                  onUpdateKey={(id, key) => {
                                    setProgram({
                                      ...program,
                                      schedule: program.schedule.map(s =>
                                        s.id === id ? { ...s, songKey: key } : s
                                      )
                                    });
                                  }}
                                />
                              ))
                            )}
                          </div>
                        </SortableContext>
                      </DndContext>

                      {/* Add item row at bottom */}
                      {program.schedule.length > 0 && (
                        <div className="flex items-center gap-2 px-4 py-3 border-t border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light cursor-pointer transition group"
                          onClick={() => {
                            const newItem = {
                              id: Date.now(),
                              type: 'item',
                              title: '',
                              person: '',
                              details: '',
                              notes: '',
                              duration: 180,
                              timing: 'during',
                            };
                            setProgram({ ...program, schedule: [...program.schedule, newItem] });
                            setSelectedScheduleItem(newItem);
                          }}
                        >
                          <GripVertical size={16} className="opacity-0" />
                          <span className="text-sm">Dodaj element...</span>
                        </div>
                      )}
                    </div>

                    {/* Footer with total time */}
                    <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/20 text-xs">
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500 dark:text-gray-400">
                          <span className="font-mono text-accent-primary dark:text-accent-primary-light">{formatTime(calculateTotalTime(program.schedule))}</span>
                          {' '}łączny czas
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">
                          {program.schedule.length} elementów
                        </span>
                      </div>
                      <div className="flex gap-1 text-[10px] text-gray-400">
                        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">s</span>
                        <span>pieśń</span>
                        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded ml-2">m</span>
                        <span>media</span>
                        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded ml-2">h</span>
                        <span>nagłówek</span>
                      </div>
                    </div>
                  </>
                )}

                {/* TEAMS TAB CONTENT */}
                {scheduleTab === 'teams' && (
                  <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-transparent to-gray-50/50 dark:to-gray-900/30">
                    <div className="space-y-3">
                      {/* Team positions overview */}
                      {program.schedule
                        .filter(item => item.type !== 'header')
                        .map((item, idx) => {
                          const itemType = ITEM_TYPES[item.type] || ITEM_TYPES.item;
                          const IconComponent = itemType.icon;
                          const songTitle = item.type === 'song' && item.songId
                            ? songs.find(s => s.id === item.songId)?.title || 'Nieznana pieśń'
                            : null;
                          const hasAssignments = item.person || Object.values(item.teamAssignments || {}).some(v => v);

                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                setSelectedScheduleItem(item);
                                setScheduleTab('order');
                              }}
                              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md
                                ${hasAssignments
                                  ? 'bg-white dark:bg-gray-800 border-gray-200/80 dark:border-gray-700/80'
                                  : 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200/50 dark:border-amber-700/30 border-dashed'
                                }
                              `}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[11px] font-bold text-gray-400 w-5">{idx + 1}</span>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${itemType.bg} shadow-sm`}>
                                  <IconComponent size={14} className={itemType.color} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-[13px] text-gray-800 dark:text-gray-200 truncate">
                                    {item.type === 'song' ? songTitle : (item.title || 'Nowy element')}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 justify-end max-w-[200px]">
                                {item.person && (
                                  <span className="text-[10px] bg-gradient-to-r from-accent-primary-lighter to-accent-primary-lightest dark:from-accent-primary-darkest/40 dark:to-accent-primary-darkest/20 text-accent-primary-dark dark:text-accent-primary-lighter px-2 py-1 rounded-md font-medium border border-accent-primary-lighter/50 dark:border-accent-primary-dark/50">
                                    👤 {item.person}
                                  </span>
                                )}
                                {item.teamAssignments?.audio && (
                                  <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-md font-medium">
                                    🎧 {item.teamAssignments.audio}
                                  </span>
                                )}
                                {item.teamAssignments?.visual && (
                                  <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-md font-medium">
                                    🖥️ {item.teamAssignments.visual}
                                  </span>
                                )}
                                {!hasAssignments && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                                    ⚠️ Przypisz
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                      {program.schedule.filter(item => item.type !== 'header').length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                            <User size={32} className="opacity-40" />
                          </div>
                          <p className="text-sm font-medium">Brak elementów do przypisania</p>
                          <p className="text-xs mt-1 text-gray-400">Dodaj elementy w zakładce Plan</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* REHEARSE TAB CONTENT */}
                {scheduleTab === 'rehearse' && (
                  <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-transparent to-gray-50/50 dark:to-gray-900/30">
                    <div className="space-y-5">
                      {/* Rehearsal timeline */}
                      <div className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                          <h4 className="text-[13px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <Clock size={16} className="text-accent-primary-light" />
                            Przebieg próby
                          </h4>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                          {program.schedule
                            .filter(item => item.type !== 'header')
                            .map((item) => {
                              const itemType = ITEM_TYPES[item.type] || ITEM_TYPES.item;
                              const IconComponent = itemType.icon;
                              const songTitle = item.type === 'song' && item.songId
                                ? songs.find(s => s.id === item.songId)?.title || 'Nieznana pieśń'
                                : null;
                              const cumTime = program.schedule.slice(0, program.schedule.indexOf(item)).reduce((sum, i) => sum + (i.duration || 0), 0);

                              return (
                                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                                  <div className="w-14 text-right">
                                    <span className="text-[11px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                      {formatTime(cumTime)}
                                    </span>
                                  </div>
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${itemType.bg}`}>
                                    <IconComponent size={14} className={itemType.color} />
                                  </div>
                                  <div className="flex-1 text-[13px] text-gray-700 dark:text-gray-300 font-medium">
                                    {item.type === 'song' ? songTitle : item.title || 'Element'}
                                    {item.type === 'song' && item.songKey && (
                                      <span className="ml-2 text-xs bg-accent-primary-lighter dark:bg-accent-primary-darkest/40 text-accent-primary dark:text-accent-primary-light font-bold px-1.5 py-0.5 rounded">
                                        {item.songKey}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-gray-400 font-mono">
                                    {formatTime(item.duration || 0)}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Songs for rehearsal */}
                      {program.schedule.filter(item => item.type === 'song').length > 0 && (
                        <div className="bg-gradient-to-br from-accent-primary-lightest to-accent-primary-lighter/30 dark:from-accent-primary-darkest/20 dark:to-accent-primary-darkest/5 rounded-2xl border border-accent-primary-lighter/50 dark:border-accent-primary-dark/30 overflow-hidden">
                          <div className="px-4 py-3 bg-gradient-to-r from-accent-primary-lighter/50 to-transparent dark:from-accent-primary-darkest/30 border-b border-accent-primary-lighter/30 dark:border-accent-primary-dark/20">
                            <h4 className="text-[13px] font-bold text-accent-primary-dark dark:text-accent-primary-lighter flex items-center gap-2">
                              <Music size={16} />
                              Setlista ({program.schedule.filter(item => item.type === 'song').length} pieśni)
                            </h4>
                          </div>
                          <div className="p-3 space-y-2">
                            {program.schedule
                              .filter(item => item.type === 'song')
                              .map((item, idx) => {
                                const song = songs.find(s => s.id === item.songId);
                                return (
                                  <div key={item.id} className="flex items-center gap-3 bg-white/80 dark:bg-gray-800/80 rounded-xl p-3 shadow-sm">
                                    <span className="w-7 h-7 bg-accent-primary-lighter dark:bg-accent-primary-darkest/40 text-accent-primary dark:text-accent-primary-light rounded-lg flex items-center justify-center text-xs font-bold">
                                      {idx + 1}
                                    </span>
                                    <span className="flex-1 text-[13px] font-medium text-gray-700 dark:text-gray-300">
                                      {song?.title || 'Nieznana pieśń'}
                                    </span>
                                    <span className="text-xs font-bold bg-gradient-to-r from-accent-primary-light to-accent-primary text-white px-2.5 py-1 rounded-lg shadow-sm">
                                      {item.songKey || song?.key || '?'}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {program.schedule.filter(item => item.type !== 'header').length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                            <Music size={32} className="opacity-40" />
                          </div>
                          <p className="text-sm font-medium">Brak elementów do próby</p>
                          <p className="text-xs mt-1 text-gray-400">Dodaj elementy w zakładce Plan</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT PANEL - Item editor */}
              {selectedScheduleItem && (
                <ItemEditPanel
                  item={selectedScheduleItem}
                  songs={songs}
                  worshipTeam={worshipTeam}
                  mediaTeam={mediaTeam}
                  onUpdate={(updatedItem) => {
                    setProgram({
                      ...program,
                      schedule: program.schedule.map(s => s.id === updatedItem.id ? updatedItem : s)
                    });
                    setSelectedScheduleItem(updatedItem);
                  }}
                  onClose={() => setSelectedScheduleItem(null)}
                  onDelete={(id) => {
                    setProgram({ ...program, schedule: program.schedule.filter(s => s.id !== id) });
                    setSelectedScheduleItem(null);
                  }}
                />
              )}
            </div>

            {/* Mobile: Back button when panel is open */}
            {selectedScheduleItem && (
              <div className="lg:hidden p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setSelectedScheduleItem(null)}
                  className="w-full py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light"
                >
                  ← Wróć do listy
                </button>
              </div>
            )}
          </div>

          {isSectionVisible('zespol') && (
          <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 dark:border-gray-700/50 p-4 lg:p-6 mb-4 lg:mb-6 hover:shadow-xl transition relative z-50">
            <div className="flex justify-between items-center mb-4 lg:mb-6">
              <h3 className="font-bold text-base lg:text-lg bg-gradient-to-r from-accent-primary-dark to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent">Zespół Uwielbienia</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
              {(worshipRoles.length > 0
                ? worshipRoles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
                : [{ key: 'lider', label: 'Lider Uwielbienia', roleId: null }, { key: 'piano', label: 'Piano', roleId: null }, { key: 'gitara_akustyczna', label: 'Gitara Akustyczna', roleId: null }, { key: 'gitara_elektryczna', label: 'Gitara Elektryczna', roleId: null }, { key: 'bas', label: 'Gitara Basowa', roleId: null }, { key: 'wokale', label: 'Wokale', roleId: null }, { key: 'cajon', label: 'Cajon / Perkusja', roleId: null }]
              ).map(field => {
                const getMembersForRole = (roleId) => {
                  if (!roleId || worshipMemberRoles.length === 0) {
                    return worshipTeam;
                  }
                  const assignedMemberIds = worshipMemberRoles
                    .filter(mr => mr.role_id === roleId)
                    .map(mr => String(mr.member_id));

                  if (assignedMemberIds.length === 0) {
                    return worshipTeam;
                  }

                  return worshipTeam.filter(member => assignedMemberIds.includes(String(member.id)));
                };

                return (
                  <MultiSelect
                    key={field.key}
                    label={field.label}
                    options={getMembersForRole(field.roleId)}
                    value={program.zespol?.[field.key] || ''}
                    onChange={(newValue) => setProgram(prev => ({ ...prev, zespol: { ...prev.zespol, [field.key]: newValue } }))}
                    absentMembers={absentList}
                  />
                );
              })}
            </div>
          </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 lg:mb-6 relative z-0">
            {isSectionVisible('atmosfera_team') && (
            <DynamicTeamSection
              title="Atmosfera Team"
              dataKey="atmosfera_team"
              program={program}
              setProgram={setProgram}
              roles={atmosferaRoles}
              teamMembers={atmosferaTeam}
              fallbackFields={[{ key: 'przygotowanie', label: 'Przygotowanie' }, { key: 'witanie', label: 'Witanie' }]}
              absentList={absentList}
              memberRoles={atmosferaMemberRoles}
            />
            )}
            {isSectionVisible('produkcja') && (
            <DynamicTeamSection
              title="MediaTeam"
              dataKey="produkcja"
              program={program}
              setProgram={setProgram}
              roles={mediaRoles}
              teamMembers={mediaTeam}
              fallbackFields={[{ key: 'naglosnienie', label: 'Nagłośnienie' }, { key: 'propresenter', label: 'ProPresenter' }, { key: 'social', label: 'Social Media' }, { key: 'host', label: 'Host wydarzenia' }]}
              absentList={absentList}
              memberRoles={mediaMemberRoles}
            />
            )}
          </div>

          {/* Graphics Override Section - only show for saved programs */}
          {program?.id && (
            <div className="bg-white/70 dark:bg-gray-800/40 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 dark:border-gray-700/50 p-5 mb-4 lg:mb-6">
              <GraphicsOverride
                program={program}
                seriesGraphics={seriesGraphics}
                onUpdate={(updated) => setProgram(updated)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 lg:mb-6 relative z-0">
            {isSectionVisible('scena') && (
            <DynamicScenaSection
              program={program}
              setProgram={setProgram}
              teachingSpeakers={teachingSpeakers}
              mcMembers={mcMembers}
              mcRoles={mcRoles}
              mcMemberRoles={mcMemberRoles}
            />
            )}
            {isSectionVisible('szkolka') && (
            <SzkolkaSection program={program} setProgram={setProgram} kidsGroups={kidsGroups} kidsTeachers={kidsTeachers} />
            )}
          </div>
        </div>
      </div>

      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        onClose={() => setShowUnsavedModal(false)}
        onSave={handleSaveAndProceed}
        onDiscard={handleDiscardAndProceed}
      />

      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        templates={templates}
        onLoad={handleLoadTemplate}
        onDelete={handleDeleteTemplate}
      />
    </div>
  );
}
