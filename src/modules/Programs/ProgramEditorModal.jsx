import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  Save, FileText, Presentation, X, Calendar,
  ChevronDown, GripVertical, Search, Check, ChevronUp,
  User, UserX, ChevronLeft, ChevronRight,
  Mail, Music, Trash2, AlertTriangle, Type, Paperclip
} from 'lucide-react';
import { downloadPDF, savePDFToSupabase } from '../../lib/utils';
import { generatePPT } from '../../lib/ppt';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { tr, appLocale } from '../../i18n';
import { toast } from '../../lib/toast';
import Modal from '../../components/Modal';
import Button from '../../components/Button';

// --- MODAL OSTRZEŻENIA O NIEZAPISANYCH ZMIANACH ---

const UnsavedChangesModal = ({ isOpen, onClose, onSave, onDiscard }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      zIndex={110}
      size="sm"
      icon={AlertTriangle}
      title={tr('Niezapisane zmiany')}
      footer={<>
        <Button variant="secondary" onClick={onDiscard}>
          {tr('Opuść')}
        </Button>
        <Button icon={Save} onClick={onSave}>
          {tr('Zapisz')}
        </Button>
      </>}
    >
      <div className="p-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {tr('Masz niezapisane zmiany w programie. Co chcesz zrobić?')}
        </p>
      </div>
    </Modal>
  );
};

// --- MODAL POTWIERDZENIA USUNIĘCIA NABOŻEŃSTWA ---

const ConfirmDeleteModal = ({ isOpen, onClose, onConfirm, date }) => {
  const formattedDate = date ? new Date(date).toLocaleDateString(appLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      zIndex={110}
      size="sm"
      icon={AlertTriangle}
      title={tr('Usuń nabożeństwo')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>
          {tr('Anuluj')}
        </Button>
        <Button variant="danger" icon={Trash2} onClick={onConfirm}>
          {tr('Usuń')}
        </Button>
      </>}
    >
      <div className="p-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {tr('Czy na pewno chcesz usunąć nabożeństwo z dnia')} <span className="font-medium text-gray-700 dark:text-gray-300">{formattedDate}</span>? {tr('Tej operacji nie można cofnąć.')}
        </p>
      </div>
    </Modal>
  );
};

const PROGRAM_ELEMENTS = [
  'Wstęp', 'Uwielbienie', 'Modlitwa', 'Czytanie', 'Kazanie',
  'Wieczerza', 'Uwielbienie / Kolekta', 'Ogłoszenia', 'Zakończenie'
];

const MUSICAL_KEYS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

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
           const portal = document.getElementById('datepicker-portal-modal');
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
          {value ? new Date(value).toLocaleDateString(appLocale()) : tr('Wybierz datę')}
        </span>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
            id="datepicker-portal-modal"
            className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 w-[280px]"
            style={{
              top: coords.openUpward ? 'auto' : `${coords.top}px`,
              bottom: coords.openUpward ? `${window.innerHeight - coords.top + 4}px` : 'auto',
              left: `${coords.left}px`
            }}
        >
           <div className="flex justify-between items-center mb-4">
             <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1))); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"><ChevronLeft size={18} /></button>
             <span className="text-sm font-bold capitalize text-gray-800 dark:text-gray-200">{viewDate.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' })}</span>
             <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1))); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"><ChevronRight size={18} /></button>
           </div>
           <div className="grid grid-cols-7 gap-1 text-center mb-2 text-[10px] font-bold text-gray-400 uppercase">{[tr('Pn'), tr('Wt'), tr('Śr'), tr('Cz'), tr('Pt'), tr('So'), tr('Nd')].map(d => <div key={d}>{d}</div>)}</div>
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
             const portal = document.getElementById('element-selector-portal-modal');
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
          placeholder={tr('Wybierz lub wpisz...')}
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
            id="element-selector-portal-modal"
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
              {tr(opt)}
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
            const portal = document.getElementById(`multiselect-portal-modal-${label}`);
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
          <span className="text-gray-400 dark:text-gray-500 text-sm">{tr('Wybierz osoby...')}</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-accent-primary-lighter dark:bg-accent-primary-darkest/40 text-accent-primary-dark dark:text-accent-primary-light px-2 py-0.5 rounded-lg text-xs font-medium border border-accent-primary-lighter dark:border-accent-primary-dark flex items-center gap-1">
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
            id={`multiselect-portal-modal-${label}`}
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
                  ${isSelected && !isAbsent ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 text-accent-primary-dark dark:text-accent-primary-light font-medium' : ''}
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
          {options.length === 0 && <div className="p-3 text-center text-gray-400 text-xs">{tr('Brak członków w bazie')}</div>}
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
            const portal = document.getElementById('song-selector-portal-modal');
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
        className="w-full px-3 py-2 bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 border border-accent-primary-lighter dark:border-accent-primary-dark rounded-lg text-sm text-accent-primary-dark dark:text-accent-primary-light font-medium flex items-center justify-between cursor-pointer hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-darkest/30 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{tr('+ Wybierz pieśń...')}</span>
        <ChevronDown size={16} className="text-accent-primary-light" />
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
            id="song-selector-portal-modal"
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
                placeholder={tr('Szukaj...')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 max-h-48 custom-scrollbar">
            {filteredSongs.length === 0 ? (
              <div className="p-3 text-xs text-gray-400 text-center">{tr('Brak wyników')}</div>
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

const SortableRow = ({ row, index, program, setProgram, songs }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: transform ? 999 : 'auto',
    position: 'relative',
  };

  const currentSongs = row.selectedSongs || (row.songIds || []).map(id => {
    const s = songs.find(x => x.id === id);
    return { internalId: Math.random(), songId: id, key: s?.key || 'C' };
  });

  const updateSongs = (newSongs) => {
    const newSchedule = [...program.schedule];
    newSchedule[index].selectedSongs = newSongs;
    newSchedule[index].songIds = newSongs.map(s => s.songId);
    setProgram(prev => ({ ...prev, schedule: newSchedule }));
  };

  const handleSongDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = currentSongs.findIndex((item) => item.internalId === active.id);
      const newIndex = currentSongs.findIndex((item) => item.internalId === over.id);
      const newOrder = arrayMove(currentSongs, oldIndex, newIndex);
      updateSongs(newOrder);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const removeSong = (internalId) => {
    updateSongs(currentSongs.filter(s => s.internalId !== internalId));
  };

  const changeSongKey = (internalId, newKey) => {
    const newSongs = currentSongs.map(s => s.internalId === internalId ? { ...s, key: newKey } : s);
    updateSongs(newSongs);
  };

  return (
    <div ref={setNodeRef} style={style} className="p-3 hover:bg-accent-primary-lightest/30 dark:hover:bg-accent-primary-darkest/10 transition duration-150 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-0">
      {/* Desktop: grid layout */}
      <div className="hidden lg:grid grid-cols-12 gap-4 items-start">
        <div className="col-span-1 flex items-center justify-center pt-2 cursor-grab text-gray-300 dark:text-gray-600 hover:text-accent-primary-light active:cursor-grabbing" {...attributes} {...listeners}>
          <GripVertical size={20} />
        </div>

        <div className="col-span-3">
          <ElementSelector
            value={row.element || ''}
            options={PROGRAM_ELEMENTS}
            onChange={(newValue) => {
              const newSchedule = [...program.schedule];
              newSchedule[index].element = newValue;
              setProgram(prev => ({ ...prev, schedule: newSchedule }));
            }}
          />
        </div>

        <div className="col-span-3">
          <input
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            placeholder={tr('Jan Kowalski')}
            value={row.person || ''}
            onChange={e => {
              const newSchedule = [...program.schedule];
              newSchedule[index].person = e.target.value;
              setProgram(prev => ({ ...prev, schedule: newSchedule }));
            }}
          />
        </div>

        <div className="col-span-4">
          {(row.element || '').toLowerCase().includes('uwielbienie') ? (
            <div className="space-y-2">
              <SongSelector
                songs={songs}
                onSelect={(song) => {
                  const newSong = {
                    internalId: Date.now() + Math.random(),
                    songId: song.id,
                    key: song.key || 'C'
                  };
                  updateSongs([...currentSongs, newSong]);
                }}
              />

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSongDragEnd}>
                <SortableContext items={currentSongs.map(s => s.internalId)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1">
                    {currentSongs.map((item, idx) => {
                      const songDef = songs.find(x => x.id === item.songId);
                      if (!songDef) return null;
                      return (
                        <SortableSongItem
                          key={item.internalId}
                          item={item}
                          idx={idx}
                          songDef={songDef}
                          onRemove={removeSong}
                          onChangeKey={changeSongKey}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ) : (
            <input
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
              value={row.details || ''}
              onChange={e => {
                const newSchedule = [...program.schedule];
                newSchedule[index].details = e.target.value;
                setProgram(prev => ({ ...prev, schedule: newSchedule }));
              }}
            />
          )}
        </div>

        <div className="col-span-1 flex justify-center pt-2">
          <button
            onClick={() => {
              const newSchedule = program.schedule.filter(r => r.id !== row.id);
              setProgram(prev => ({ ...prev, schedule: newSchedule }));
            }}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded-lg transition"
          >
            <Trash2 size={18}/>
          </button>
        </div>
      </div>

      {/* Mobile: stacked layout */}
      <div className="lg:hidden space-y-3">
        <div className="flex items-center gap-2">
          <div className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-accent-primary-light active:cursor-grabbing" {...attributes} {...listeners}>
            <GripVertical size={18} />
          </div>
          <div className="flex-1">
            <ElementSelector
              value={row.element || ''}
              options={PROGRAM_ELEMENTS}
              onChange={(newValue) => {
                const newSchedule = [...program.schedule];
                newSchedule[index].element = newValue;
                setProgram(prev => ({ ...prev, schedule: newSchedule }));
              }}
            />
          </div>
          <button
            onClick={() => {
              const newSchedule = program.schedule.filter(r => r.id !== row.id);
              setProgram(prev => ({ ...prev, schedule: newSchedule }));
            }}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded-lg transition flex-shrink-0"
          >
            <Trash2 size={16}/>
          </button>
        </div>

        <div className="pl-6">
          <input
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            placeholder={tr('Osoba')}
            value={row.person || ''}
            onChange={e => {
              const newSchedule = [...program.schedule];
              newSchedule[index].person = e.target.value;
              setProgram(prev => ({ ...prev, schedule: newSchedule }));
            }}
          />
        </div>

        <div className="pl-6">
          {(row.element || '').toLowerCase().includes('uwielbienie') ? (
            <div className="space-y-2">
              <SongSelector
                songs={songs}
                onSelect={(song) => {
                  const newSong = {
                    internalId: Date.now() + Math.random(),
                    songId: song.id,
                    key: song.key || 'C'
                  };
                  updateSongs([...currentSongs, newSong]);
                }}
              />

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSongDragEnd}>
                <SortableContext items={currentSongs.map(s => s.internalId)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1">
                    {currentSongs.map((item, idx) => {
                      const songDef = songs.find(x => x.id === item.songId);
                      if (!songDef) return null;
                      return (
                        <SortableSongItem
                          key={item.internalId}
                          item={item}
                          idx={idx}
                          songDef={songDef}
                          onRemove={removeSong}
                          onChangeKey={changeSongKey}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ) : (
            <input
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
              placeholder={tr('Szczegóły / Notatki')}
              value={row.details || ''}
              onChange={e => {
                const newSchedule = [...program.schedule];
                newSchedule[index].details = e.target.value;
                setProgram(prev => ({ ...prev, schedule: newSchedule }));
              }}
            />
          )}
        </div>
      </div>
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
        <h3 className="font-bold text-lg text-gray-900 dark:text-white">{title}</h3>
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

const AbsenceMultiSelect = ({ options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const coords = useDropdownPosition(wrapperRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    const handleClick = (e) => {
      if (isOpen && wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        const portal = document.getElementById('absence-multiselect-portal-modal');
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
          <span className="text-gray-400 dark:text-gray-500 text-sm">{tr('Wybierz nieobecnych...')}</span>
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
          id="absence-multiselect-portal-modal"
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
          {options.length === 0 && <div className="p-3 text-center text-gray-400 text-xs">{tr('Brak nauczycieli w bazie')}</div>}
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
        <h3 className="font-bold text-lg text-gray-900 dark:text-white">{tr('Szkółka Niedzielna')}</h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Temat lekcji')}</label>
          <input
            className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            value={program.szkolka?.temat || ''}
            onChange={e => handleFieldChange('temat', e.target.value)}
            placeholder={tr('Temat lekcji...')}
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
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Grupa Młodsza')}</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.mlodsza || ''}
                onChange={e => handleFieldChange('mlodsza', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Grupa Średnia')}</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.srednia || ''}
                onChange={e => handleFieldChange('srednia', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Grupa Starsza')}</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.starsza || ''}
                onChange={e => handleFieldChange('starsza', e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-bold text-red-500 dark:text-red-400 uppercase mb-1 ml-1">{tr('Absencja nauczycieli')}</label>
          <AbsenceMultiSelect
            options={kidsTeachers}
            value={program.szkolka?.absencja || ''}
            onChange={(newValue) => handleFieldChange('absencja', newValue)}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Notatki')}</label>
          <input
            className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm transition text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            value={program.szkolka?.notatki || ''}
            onChange={e => handleFieldChange('notatki', e.target.value)}
            placeholder={tr('Notatki...')}
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
        { key: 'prowadzenie', label: tr('Prowadzenie'), roleId: null, source: 'mc' },
        { key: 'modlitwa', label: tr('Modlitwa'), roleId: null, source: 'mc' },
        { key: 'wieczerza', label: tr('Wieczerza'), roleId: null, source: 'mc' },
        { key: 'ogloszenia', label: tr('Ogłoszenia'), roleId: null, source: 'mc' }
      ];

  const kazanieField = { key: 'kazanie', label: tr('Kazanie'), source: 'teaching' };

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
        <h3 className="font-bold text-lg text-gray-900 dark:text-white">{tr('Scena')}</h3>
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

// --- GŁÓWNY KOMPONENT MODALA EDYTORA ---

export default function ProgramEditorModal({ programId, onClose, onSave, onDelete }) {
  const [program, setProgram] = useState(null);
  const [originalProgram, setOriginalProgram] = useState(null); // Do śledzenia zmian
  const [loading, setLoading] = useState(true);
  const [songs, setSongs] = useState([]);
  const [worshipTeam, setWorshipTeam] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Dane z modułu Małe SchWro
  const [kidsGroups, setKidsGroups] = useState([]);
  const [kidsTeachers, setKidsTeachers] = useState([]);

  // Dane służb z team_roles
  const [worshipRoles, setWorshipRoles] = useState([]);
  const [mediaRoles, setMediaRoles] = useState([]);
  const [atmosferaRoles, setAtmosferaRoles] = useState([]);
  const [mediaTeam, setMediaTeam] = useState([]);
  const [atmosferaTeam, setAtmosferaTeam] = useState([]);

  // Przypisania członków do służb
  const [worshipMemberRoles, setWorshipMemberRoles] = useState([]);
  const [mediaMemberRoles, setMediaMemberRoles] = useState([]);
  const [atmosferaMemberRoles, setAtmosferaMemberRoles] = useState([]);

  // Dane dla sekcji Scena
  const [teachingSpeakers, setTeachingSpeakers] = useState([]);
  const [mcMembers, setMcMembers] = useState([]);
  const [mcRoles, setMcRoles] = useState([]);
  const [mcMemberRoles, setMcMemberRoles] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Sprawdź czy są niezapisane zmiany
  const hasUnsavedChanges = useCallback(() => {
    if (!program || !originalProgram) return false;
    return JSON.stringify(program) !== JSON.stringify(originalProgram);
  }, [program, originalProgram]);

  // Obsługa próby zamknięcia
  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowUnsavedModal(true);
    } else {
      onClose();
    }
  };

  // Zapisz i zamknij
  const handleSaveAndClose = async () => {
    await supabase.from('programs').update(program).eq('id', program.id);
    setShowUnsavedModal(false);
    if (onSave) onSave();
    onClose();
  };

  // Odrzuć zmiany i zamknij
  const handleDiscardAndClose = () => {
    setShowUnsavedModal(false);
    onClose();
  };

  // Usuń nabożeństwo
  const handleDeleteProgram = async () => {
    try {
      await supabase.from('programs').delete().eq('id', program.id);
      setShowDeleteModal(false);
      if (onDelete) onDelete(program.id);
      onClose();
    } catch (error) {
      console.error('Błąd usuwania programu:', error);
      toast.error(tr('Wystąpił błąd podczas usuwania nabożeństwa.'));
    }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);

      // Pobierz program
      const { data: pData } = await supabase.from('programs').select('*').eq('id', programId).single();
      if (pData) {
        if (!pData.schedule) pData.schedule = [];
        ['atmosfera_team', 'produkcja', 'scena', 'szkolka', 'zespol'].forEach(key => {
          if (!pData[key]) pData[key] = {};
        });
        setProgram(pData);
        setOriginalProgram(JSON.parse(JSON.stringify(pData))); // Zapisz kopię oryginalnego stanu
      }

      // Pobierz pieśni
      const { data: songsData } = await supabase.from('songs').select('*');
      setSongs(songsData || []);

      // Pobierz zespół uwielbienia
      const { data: wData } = await supabase.from('worship_team').select('*').order('full_name');
      setWorshipTeam(wData || []);

      // Pobierz dane Kids
      const { data: groupsData } = await supabase.from('kids_groups').select('*').order('created_at');
      const { data: teachersData } = await supabase.from('kids_teachers').select('*').order('full_name');
      setKidsGroups(groupsData || []);
      setKidsTeachers(teachersData || []);

      // Pobierz role zespołów
      const { data: rolesData } = await supabase.from('team_roles').select('*').eq('is_active', true).order('display_order');
      if (rolesData) {
        setWorshipRoles(rolesData.filter(r => r.team_type === 'worship'));
        setMediaRoles(rolesData.filter(r => r.team_type === 'media'));
        setAtmosferaRoles(rolesData.filter(r => r.team_type === 'atmosfera'));
        setMcRoles(rolesData.filter(r => r.team_type === 'mc'));
      }

      // Pobierz przypisania członków do służb
      const { data: memberRolesData } = await supabase.from('team_member_roles').select('*');
      if (memberRolesData) {
        setWorshipMemberRoles(memberRolesData.filter(mr => mr.member_table === 'worship_team'));
        setMediaMemberRoles(memberRolesData.filter(mr => mr.member_table === 'media_team'));
        setAtmosferaMemberRoles(memberRolesData.filter(mr => mr.member_table === 'atmosfera_members'));
        setMcMemberRoles(memberRolesData.filter(mr => mr.member_table === 'custom_mc_members'));
      }

      // Pobierz zespoły
      const { data: media } = await supabase.from('media_team').select('*').order('full_name');
      const { data: atmosfera } = await supabase.from('atmosfera_members').select('*').order('full_name');
      setMediaTeam(media || []);
      setAtmosferaTeam(atmosfera || []);

      // Pobierz dane dla sekcji Scena
      const { data: speakers } = await supabase.from('teaching_speakers').select('*').order('name');
      setTeachingSpeakers(speakers || []);

      const { data: mcMembersData } = await supabase.from('custom_mc_members').select('*').order('full_name');
      setMcMembers(mcMembersData || []);

      setLoading(false);
    };

    fetchAllData();
  }, [programId]);

  const handleSave = async () => {
    await supabase.from('programs').update(program).eq('id', program.id);
    setOriginalProgram(JSON.parse(JSON.stringify(program))); // Zaktualizuj oryginał po zapisie
    if (onSave) onSave();
    onClose();
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setProgram((prev) => {
        const oldIndex = prev.schedule.findIndex((item) => item.id === active.id);
        const newIndex = prev.schedule.findIndex((item) => item.id === over.id);
        return { ...prev, schedule: arrayMove(prev.schedule, oldIndex, newIndex) };
      });
    }
  };

  const [showPdfMenu, setShowPdfMenu] = useState(false);
  const pdfMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target)) {
        setShowPdfMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveAndUploadPDF = async (songPagesMode = 'lyrics') => {
    if (!program || !program.date) {
      toast.info(tr('Najpierw wybierz datę programu.'));
      return;
    }

    setShowPdfMenu(false);
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

      await downloadPDF(program, freshSongsMap, teamRolesForPDF, songPagesMode);
      const result = await savePDFToSupabase(program, freshSongsMap, teamRolesForPDF, songPagesMode);

      if (result.success) {
        toast.error(tr('PDF został pobrany i zapisany w chmurze!'));
      } else {
        toast.error(tr('PDF pobrany na dysk, ale wystąpił błąd zapisu w chmurze.'));
      }
    } catch (error) {
      console.error('Critical error saving PDF:', error);
      toast.error(tr('Wystąpił błąd podczas generowania PDF.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePPT = async () => {
    try {
      const { data: songsData } = await supabase.from('songs').select('*');
      const songsMap = (songsData || []).reduce((acc, song) => {
        acc[song.id] = song;
        return acc;
      }, {});

      await generatePPT(program, songsMap);
    } catch (error) {
      console.error('Błąd generowania PPT:', error);
      toast.error(tr('Nie udało się wygenerować prezentacji.'));
    }
  };

  const absentList = program?.zespol?.absencja
    ? program.zespol.absencja.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (loading) return null;
  if (!program) return null;
  if (!document.body) return null;

  return (
    <>
    <Modal
      isOpen
      onClose={handleCloseAttempt}
      closeOnBackdrop={false}
      size="full"
      icon={Music}
      title={tr('Edycja Nabożeństwa')}
      footer={<>
            <Button
              variant="danger"
              className="mr-auto"
              icon={Trash2}
              onClick={() => setShowDeleteModal(true)}
              title={tr('Usuń nabożeństwo')}
            >
              <span className="hidden sm:inline">{tr('Usuń')}</span>
            </Button>
            <div className="relative" ref={pdfMenuRef}>
              <Button
                variant="outline"
                icon={FileText}
                loading={isLoading}
                onClick={() => setShowPdfMenu(!showPdfMenu)}
                title={tr('Generuj PDF')}
              >
                <span className="hidden sm:inline">PDF</span>
                <ChevronDown size={14} />
              </Button>
              {showPdfMenu && (
                <div className="absolute right-0 bottom-full mb-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  <button
                    onClick={() => handleSaveAndUploadPDF('lyrics')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-accent-primary-lightest dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Type size={16} className="text-accent-primary-light" />
                    {tr('Z tekstami i akordami')}
                  </button>
                  <button
                    onClick={() => handleSaveAndUploadPDF('attachments')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-accent-primary-lightest dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FileText size={16} className="text-accent-secondary-light" />
                    {tr('Z załącznikami PDF')}
                  </button>
                  <button
                    onClick={() => handleSaveAndUploadPDF('both')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-accent-primary-lightest dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FileText size={16} className="text-purple-500" />
                    {tr('Teksty + załączniki pieśni')}
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                  <button
                    onClick={() => handleSaveAndUploadPDF('custom')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-accent-primary-lightest dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Paperclip size={16} className="text-green-500" />
                    {tr('Z własnymi załącznikami')}
                  </button>
                </div>
              )}
            </div>
            <Button variant="outline" icon={Presentation} onClick={handleGeneratePPT}>
              <span className="hidden sm:inline">PPT</span>
            </Button>
            <Button variant="secondary" onClick={handleCloseAttempt}>
              {tr('Anuluj')}
            </Button>
            <Button icon={Save} onClick={handleSave}>
              {tr('Zapisz')}
            </Button>
      </>}
    >
        {/* CONTENT */}
        <div className="p-6 space-y-6 lg:space-y-8 min-h-full bg-gradient-to-br from-accent-primary-lightest/50 via-white to-accent-secondary-lightest/50 dark:from-gray-900 dark:to-gray-800">

          {/* Data nabożeństwa */}
          <div className="w-48">
            <CustomDatePicker value={program.date} onChange={v => setProgram({...program, date: v})} />
          </div>

          {/* Plan szczegółowy */}
          <div className="bg-white/70 dark:bg-gray-800/40 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 dark:border-gray-700/50 p-4 lg:p-6 min-h-[300px] lg:min-h-[500px]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
              <h3 className="font-bold text-lg lg:text-xl text-gray-800 dark:text-white flex items-center gap-2">
                <div className="w-1.5 h-5 lg:h-6 bg-accent-primary dark:bg-accent-primary-light rounded-full"></div>
                {tr('Plan szczegółowy')}
              </h3>
              <button
                onClick={() => setProgram({...program, schedule: [...program.schedule, { id: Date.now(), element: '', person: '', details: '', songIds: [], selectedSongs: [] }]})}
                className="hidden sm:block bg-gradient-to-r from-accent-primary to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light text-white text-sm px-4 py-2.5 rounded-xl font-bold hover:shadow-lg transition"
              >
                {tr('+ Dodaj Element')}
              </button>
            </div>
            <div className="bg-white/50 dark:bg-gray-900/50 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-inner overflow-hidden overflow-x-auto">
              <div className="hidden lg:grid grid-cols-12 gap-4 p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50 font-bold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[600px]">
                <div className="col-span-1"></div>
                <div className="col-span-3">{tr('Element')}</div>
                <div className="col-span-3">{tr('Osoba')}</div>
                <div className="col-span-4">{tr('Szczegóły / Notatki')}</div>
                <div className="col-span-1"></div>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={program.schedule.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div>
                    {program.schedule.map((row, idx) => (
                      <SortableRow
                        key={row.id}
                        row={row}
                        index={idx}
                        program={program}
                        setProgram={setProgram}
                        songs={songs}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            <button
              onClick={() => setProgram({...program, schedule: [...program.schedule, { id: Date.now(), element: '', person: '', details: '', songIds: [], selectedSongs: [] }]})}
              className="sm:hidden w-full mt-4 bg-gradient-to-r from-accent-primary to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light text-white text-sm px-4 py-3 rounded-xl font-bold hover:shadow-lg transition"
            >
              {tr('+ Dodaj Element')}
            </button>
          </div>

          {/* Zespół Uwielbienia */}
          <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 dark:border-gray-700/50 p-4 lg:p-6 hover:shadow-xl transition relative z-50">
            <div className="flex justify-between items-center mb-4 lg:mb-6">
              <h3 className="font-bold text-base lg:text-lg text-gray-900 dark:text-white">{tr('Zespół Uwielbienia')}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
              {(worshipRoles.length > 0
                ? worshipRoles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
                : [
                    { key: 'lider', label: tr('Lider Uwielbienia'), roleId: null },
                    { key: 'piano', label: tr('Piano'), roleId: null },
                    { key: 'gitara_akustyczna', label: tr('Gitara Akustyczna'), roleId: null },
                    { key: 'gitara_elektryczna', label: tr('Gitara Elektryczna'), roleId: null },
                    { key: 'bas', label: tr('Gitara Basowa'), roleId: null },
                    { key: 'wokale', label: tr('Wokale'), roleId: null },
                    { key: 'cajon', label: tr('Cajon / Perkusja'), roleId: null }
                  ]
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

          {/* Atmosfera i Media */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 relative z-0">
            <DynamicTeamSection
              title={tr('Atmosfera Team')}
              dataKey="atmosfera_team"
              program={program}
              setProgram={setProgram}
              roles={atmosferaRoles}
              teamMembers={atmosferaTeam}
              fallbackFields={[{ key: 'przygotowanie', label: tr('Przygotowanie') }, { key: 'witanie', label: tr('Witanie') }]}
              absentList={absentList}
              memberRoles={atmosferaMemberRoles}
            />
            <DynamicTeamSection
              title={tr('MediaTeam')}
              dataKey="produkcja"
              program={program}
              setProgram={setProgram}
              roles={mediaRoles}
              teamMembers={mediaTeam}
              fallbackFields={[{ key: 'naglosnienie', label: tr('Nagłośnienie') }, { key: 'propresenter', label: 'ProPresenter' }, { key: 'social', label: tr('Social Media') }, { key: 'host', label: tr('Host wydarzenia') }]}
              absentList={absentList}
              memberRoles={mediaMemberRoles}
            />
          </div>

          {/* Scena i Szkółka */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 relative z-0">
            <DynamicScenaSection
              program={program}
              setProgram={setProgram}
              teachingSpeakers={teachingSpeakers}
              mcMembers={mcMembers}
              mcRoles={mcRoles}
              mcMemberRoles={mcMemberRoles}
            />
            <SzkolkaSection
              program={program}
              setProgram={setProgram}
              kidsGroups={kidsGroups}
              kidsTeachers={kidsTeachers}
            />
          </div>
        </div>
    </Modal>

        <UnsavedChangesModal
          isOpen={showUnsavedModal}
          onClose={() => setShowUnsavedModal(false)}
          onSave={handleSaveAndClose}
          onDiscard={handleDiscardAndClose}
        />

        <ConfirmDeleteModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteProgram}
          date={program?.date}
        />
    </>
  );
}
