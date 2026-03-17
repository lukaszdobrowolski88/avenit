import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import {
  Plus, Save, FileText, Presentation, Copy, Trash2, Calendar,
  ChevronDown, GripVertical, Search, X, Check, ChevronUp,
  History, ArrowUpDown, UserX, ChevronLeft, ChevronRight,
  Mail, Loader2, AlertTriangle
} from 'lucide-react';
import { downloadPDF, savePDFToSupabase } from '../../lib/utils';
import { generatePPT } from '../../lib/ppt';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

        // Tylko aktualizuj jeśli pozycja się zmieniła (optymalizacja)
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

      // Ciągłe śledzenie pozycji za pomocą requestAnimationFrame
      const tick = () => {
        updatePosition();
        rafId = requestAnimationFrame(tick);
      };

      // Uruchom ciągłe śledzenie
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

  // Zespół Uwielbienia (z MultiSelecta)
  if (program.zespol) {
    Object.values(program.zespol).forEach(value => {
      if (typeof value === 'string') {
        const names = value.split(',').map(s => s.trim()).filter(Boolean);
        names.forEach(name => {
           // Szukamy e-maila w pobranej liście członków zespołu
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
        className="flex items-center gap-2 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-gray-200/50 dark:border-gray-700/50 cursor-pointer hover:border-pink-400 transition"
      >
        <Calendar size={16} className="text-pink-600 dark:text-pink-400" />
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
                      ${isSelected ? 'bg-pink-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
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

const SectionCard = ({ title, dataKey, fields, program, setProgram }) => (
  <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 dark:border-gray-700/50 p-6 h-full hover:shadow-xl transition relative z-0">
    <div className="flex justify-between items-center mb-4">
      <h3 className="font-bold text-lg bg-gradient-to-r from-pink-700 to-orange-700 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">{title}</h3>
    </div>
    <div className="space-y-4">
      {fields.map(field => (
        <div key={field.key}>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{field.label}</label>
          <input 
            className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            value={program[dataKey]?.[field.key] || ''}
            onChange={e => setProgram(prev => ({
              ...prev,
              [dataKey]: { ...prev[dataKey], [field.key]: e.target.value }
            }))}
          />
        </div>
      ))}
    </div>
  </div>
);

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
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-pink-500/20 outline-none placeholder:text-gray-400 dark:placeholder-gray-600"
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
              className="px-4 py-2 hover:bg-pink-50 dark:hover:bg-pink-900/20 cursor-pointer text-sm text-gray-700 dark:text-gray-300 border-b border-gray-50 dark:border-gray-800 last:border-0"
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
        className="w-full min-h-[42px] px-4 py-2 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus-within:ring-2 focus-within:ring-pink-500/20 cursor-pointer flex flex-wrap gap-2 items-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-sm">Wybierz osoby...</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded-lg text-xs font-medium border border-pink-200 dark:border-pink-800 flex items-center gap-1">
              {item}
              <span 
                onClick={(e) => { e.stopPropagation(); toggleSelection(item); }}
                className="hover:bg-pink-200 dark:hover:bg-pink-800 rounded-full p-0.5 cursor-pointer"
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
                  ${isAbsent ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-pink-50 dark:hover:bg-pink-900/20 text-gray-700 dark:text-gray-300'}
                  ${isSelected && !isAbsent ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 font-medium' : ''}
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
        className="w-full px-3 py-2 bg-pink-50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-800 rounded-lg text-sm text-pink-800 dark:text-pink-300 font-medium flex items-center justify-between cursor-pointer hover:bg-pink-100 dark:hover:bg-pink-900/30 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>+ Wybierz pieśń...</span>
        <ChevronDown size={16} className="text-pink-400" />
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
                  className="px-4 py-2 hover:bg-pink-50 dark:hover:bg-pink-900/20 cursor-pointer text-sm text-gray-700 dark:text-gray-300 flex justify-between items-center border-b border-gray-50 dark:border-gray-800 last:border-0"
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
    <div ref={setNodeRef} style={style} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-pink-100 dark:border-pink-900/30 rounded-lg shadow-sm group">
      <div {...attributes} {...listeners} className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-pink-600 active:cursor-grabbing">
        <GripVertical size={14} />
      </div>

      <div className="flex items-center gap-2 flex-1">
        <span className="text-pink-700 dark:text-pink-400 font-medium text-xs">{idx + 1}.</span>
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
    <div ref={setNodeRef} style={style} className="p-3 hover:bg-pink-50/30 dark:hover:bg-pink-900/10 transition duration-150 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-0">
      {/* Desktop: grid layout */}
      <div className="hidden lg:grid grid-cols-12 gap-4 items-start">
        <div className="col-span-1 flex items-center justify-center pt-2 cursor-grab text-gray-300 dark:text-gray-600 hover:text-pink-500 active:cursor-grabbing" {...attributes} {...listeners}>
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
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            placeholder="Jan Kowalski"
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
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
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
          <div className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-pink-500 active:cursor-grabbing" {...attributes} {...listeners}>
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
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            placeholder="Osoba"
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
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
              placeholder="Szczegóły / Notatki"
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

  // Funkcja filtrująca członków zespołu na podstawie przypisanych służb
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
        <h3 className="font-bold text-lg bg-gradient-to-r from-pink-700 to-orange-700 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">{title}</h3>
      </div>
      <div className="space-y-4">
        {teamMembers.length > 0 ? (
          // Użyj MultiSelect gdy mamy członków zespołu
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
          // Fallback do zwykłych pól tekstowych
          fields.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{field.label}</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
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
        <h3 className="font-bold text-lg bg-gradient-to-r from-pink-700 to-orange-700 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Szkółka Niedzielna</h3>
      </div>
      <div className="space-y-4">
        {/* Temat lekcji */}
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Temat lekcji</label>
          <input
            className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            value={program.szkolka?.temat || ''}
            onChange={e => handleFieldChange('temat', e.target.value)}
            placeholder="Temat lekcji..."
          />
        </div>

        {/* Dynamiczne grupy z Kids module */}
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
          // Fallback do statycznych pól gdy brak grup w bazie
          <>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Grupa Młodsza</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.mlodsza || ''}
                onChange={e => handleFieldChange('mlodsza', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Grupa Średnia</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.srednia || ''}
                onChange={e => handleFieldChange('srednia', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Grupa Starsza</label>
              <input
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                value={program.szkolka?.starsza || ''}
                onChange={e => handleFieldChange('starsza', e.target.value)}
              />
            </div>
          </>
        )}

        {/* Absencja nauczycieli */}
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

        {/* Notatki */}
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Notatki</label>
          <input
            className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
            value={program.szkolka?.notatki || ''}
            onChange={e => handleFieldChange('notatki', e.target.value)}
            placeholder="Notatki..."
          />
        </div>
      </div>
    </div>
  );
};

// --- Komponent absencji dla Dashboard ---

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

// --- DYNAMICZNA SEKCJA SCENA ---

const DynamicScenaSection = ({
  program,
  setProgram,
  teachingSpeakers,
  mcMembers,
  mcRoles,
  mcMemberRoles
}) => {
  // Buduj pola dynamicznie na podstawie służb MC
  const mcFields = mcRoles.length > 0
    ? mcRoles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id, source: 'mc' }))
    : [
        { key: 'prowadzenie', label: 'Prowadzenie', roleId: null, source: 'mc' },
        { key: 'modlitwa', label: 'Modlitwa', roleId: null, source: 'mc' },
        { key: 'wieczerza', label: 'Wieczerza', roleId: null, source: 'mc' },
        { key: 'ogloszenia', label: 'Ogłoszenia', roleId: null, source: 'mc' }
      ];

  // Pole kazania - zawsze pobierane z Nauczanie (teaching_speakers)
  const kazanieField = { key: 'kazanie', label: 'Kazanie', source: 'teaching' };

  // Połącz pola: pola MC + kazanie
  // Znajdź gdzie wstawić kazanie (po prowadzeniu/modlitwie, przed wieczerzą)
  const allFields = [];
  let kazanieAdded = false;

  for (const field of mcFields) {
    allFields.push(field);
    // Dodaj kazanie po modlitwie lub prowadzeniu (jeśli modlitwa nie istnieje)
    if (!kazanieAdded && (field.key === 'modlitwa' || field.key === 'prowadzenie')) {
      // Sprawdź czy następne pole to nie kazanie
      const nextIdx = mcFields.indexOf(field) + 1;
      if (nextIdx >= mcFields.length || mcFields[nextIdx].key !== 'kazanie') {
        allFields.push(kazanieField);
        kazanieAdded = true;
      }
    }
  }

  // Jeśli kazanie nie zostało dodane, dodaj na końcu
  if (!kazanieAdded) {
    allFields.push(kazanieField);
  }

  // Filtrowanie członków MC według służby
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

  // Zmiana w sekcji Scena synchronizuje się z grafikami MC i Nauczanie
  const handleChange = (fieldKey, newValue, source) => {
    if (source === 'teaching') {
      // Zapisz do teaching - znajdź speaker_id po nazwie
      const speaker = teachingSpeakers.find(s => s.name === newValue);
      setProgram(prev => ({
        ...prev,
        teaching: {
          ...prev.teaching,
          speaker_id: speaker?.id || null,
          speaker_name: newValue // Dodatkowe pole dla wyświetlania
        }
      }));
    } else {
      // Zapisz do custom_mc_schedule
      setProgram(prev => ({
        ...prev,
        [mcScheduleKey]: {
          ...prev[mcScheduleKey],
          [fieldKey]: newValue
        }
      }));
    }
  };

  // Pobierz wartość z grafiku Nauczanie
  const getSpeakerFromTeaching = () => {
    // Najpierw sprawdź czy jest speaker_name (nowe pole)
    if (program.teaching?.speaker_name) {
      return program.teaching.speaker_name;
    }
    // Fallback na speaker_id
    if (program.teaching?.speaker_id) {
      const speaker = teachingSpeakers.find(s => s.id === program.teaching.speaker_id);
      return speaker?.name || '';
    }
    return '';
  };

  // Pobierz wartość z grafiku MC
  const getMcValueFromSchedule = (fieldKey) => {
    if (program[mcScheduleKey]?.[fieldKey]) {
      return program[mcScheduleKey][fieldKey];
    }
    return '';
  };

  // Konwertuj mówców na format zgodny z MultiSelect (full_name)
  const speakersAsMembers = teachingSpeakers.map(s => ({ id: s.id, full_name: s.name }));

  return (
    <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 dark:border-gray-700/50 p-6 h-full hover:shadow-xl transition relative z-0">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg bg-gradient-to-r from-pink-700 to-orange-700 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Scena</h3>
      </div>
      <div className="space-y-4">
        {allFields.map(field => {
          // Dla kazania - używaj mówców z Nauczanie
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
                  className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
                  value={displayValue}
                  onChange={e => handleChange(field.key, e.target.value, 'teaching')}
                />
              </div>
            );
          }

          // Dla pól MC - używaj członków MC, wartość bezpośrednio z grafiku MC
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
                className="w-full px-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm transition text-gray-700 dark:text-gray-200"
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
          <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={24} className="text-orange-600 dark:text-orange-400" />
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
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-pink-500/30 transition flex items-center justify-center gap-2"
          >
            <Save size={16} /> Zapisz
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- GŁÓWNY KOMPONENT ---

export default function Dashboard() {
  const navigate = useNavigate();
  const { setHasUnsavedChanges: setGlobalUnsavedChanges, setOnSaveCallback } = useUnsavedChanges();

  const [programs, setPrograms] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('');
  const [program, setProgram] = useState(getEmptyProgram());
  const [originalProgram, setOriginalProgram] = useState(null); // Do śledzenia zmian
  const [songs, setSongs] = useState([]);
  const [worshipTeam, setWorshipTeam] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sortOrder, setSortOrder] = useState('asc');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Stan dla modala niezapisanych zmian
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'selectProgram' | 'navigate', payload: any }

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

  // Dane dla sekcji Scena - synchronizacja z Nauczanie i MC
  const [teachingSpeakers, setTeachingSpeakers] = useState([]);
  const [mcMembers, setMcMembers] = useState([]);
  const [mcRoles, setMcRoles] = useState([]);
  const [mcMemberRoles, setMcMemberRoles] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchPrograms();
    fetchSongs();
    fetchWorshipTeam();
    fetchKidsData();
    fetchTeamRoles();
    fetchAllTeams();
    fetchScenaData();
  }, []);

  const fetchKidsData = async () => {
    try {
      const { data: groupsData } = await supabase.from('kids_groups').select('*').order('created_at');
      const { data: teachersData } = await supabase.from('kids_teachers').select('*').order('full_name');
      setKidsGroups(groupsData || []);
      setKidsTeachers(teachersData || []);
    } catch (err) {
      console.error('Błąd pobierania danych Kids:', err);
    }
  };

  useEffect(() => {
    if (selectedId) {
      const p = programs.find(p => p.id === selectedId);
      if (p) {
        setProgram(p);
        setOriginalProgram(JSON.parse(JSON.stringify(p))); // Kopia do porównywania zmian
      }
    } else {
      const empty = getEmptyProgram();
      setProgram(empty);
      setOriginalProgram(JSON.parse(JSON.stringify(empty)));
    }
  }, [selectedId, programs]);

  // Sprawdź czy są niezapisane zmiany
  const hasUnsavedChanges = useCallback(() => {
    if (!program || !originalProgram) return false;
    return JSON.stringify(program) !== JSON.stringify(originalProgram);
  }, [program, originalProgram]);

  // Synchronizuj stan niezapisanych zmian z globalnym kontekstem
  useEffect(() => {
    const unsaved = hasUnsavedChanges();
    setGlobalUnsavedChanges(unsaved);
  }, [hasUnsavedChanges, setGlobalUnsavedChanges]);

  // Ustaw callback do zapisu dla globalnego kontekstu
  useEffect(() => {
    setOnSaveCallback(() => handleSave);
    return () => setOnSaveCallback(null);
  }, [setOnSaveCallback, program]);

  // Wyczyść stan niezapisanych zmian przy odmontowaniu komponentu
  useEffect(() => {
    return () => {
      setGlobalUnsavedChanges(false);
    };
  }, [setGlobalUnsavedChanges]);

  function getEmptyProgram() {
    return {
      date: new Date().toISOString().split('T')[0],
      schedule: [],
      atmosfera_team: { przygotowanie: '', witanie: '' },
      produkcja: { naglosnienie: '', propresenter: '', social: '', host: '' },
      scena: { prowadzenie: '', czytanie: '', kazanie: '', modlitwa: '', wieczerza: '', ogloszenia: '' },
      szkolka: { mlodsza: '', srednia: '', starsza: '' },
      zespol: { lider: '', piano: '', gitara_akustyczna: '', gitara_elektryczna: '', bas: '', wokale: '', cajon: '', notatki: '', absencja: '' }
    };
  }

  const fetchPrograms = async () => {
    const { data } = await supabase.from('programs').select('*').order('date', { ascending: false });
    setPrograms(data || []);
  };

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

      // Pobierz przypisania członków do służb
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

  // Pobieranie danych dla dynamicznej sekcji Scena
  const fetchScenaData = async () => {
    try {
      // Pobierz mówców z modułu Nauczanie
      const { data: speakers } = await supabase.from('teaching_speakers').select('*').order('name');
      setTeachingSpeakers(speakers || []);

      // Pobierz członków MC (custom module)
      const { data: mcMembersData, error: mcError } = await supabase
        .from('custom_mc_members')
        .select('*')
        .order('full_name');

      if (!mcError) {
        setMcMembers(mcMembersData || []);
      }

      // Pobierz służby dla MC
      const { data: mcRolesData } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', 'mc')
        .eq('is_active', true)
        .order('display_order');

      setMcRoles(mcRolesData || []);

      // Pobierz przypisania członków MC do służb
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
    if (program.id) {
      await supabase.from('programs').update(program).eq('id', program.id);
    } else {
      await supabase.from('programs').insert([program]);
    }
    fetchPrograms();
    setOriginalProgram(JSON.parse(JSON.stringify(program))); // Zaktualizuj oryginał po zapisie
    alert('Zapisano!');
  };

  
  // --- FUNKCJA ZAPISU PDF NA DYSK I DO SUPABASE ---
  const handleSaveAndUploadPDF = async () => {
    if (!program || !program.date) {
      alert('Najpierw wybierz lub utwórz program.');
      return;
    }

    setIsLoading(true);

    try {
      // Pobieramy piosenki "na świeżo" z bazy
      const { data: allSongsData } = await supabase
        .from('songs')
        .select('*');

      const freshSongsMap = {};
      (allSongsData || []).forEach(s => { freshSongsMap[s.id] = s; });

      // Przygotuj obiekt z dynamicznymi rolami zespołów
      const teamRolesForPDF = {
        worship: worshipRoles,
        media: mediaRoles,
        atmosfera: atmosferaRoles,
        kidsGroups: kidsGroups,
        mc: mcRoles,
        teachingSpeakers: teachingSpeakers
      };

      // 1. Pobierz PDF na dysk lokalny
      await downloadPDF(program, freshSongsMap, teamRolesForPDF);

      // 2. Wyślij PDF do Supabase Storage
      const result = await savePDFToSupabase(program, freshSongsMap, teamRolesForPDF);

      if (result.success) {
        alert('PDF został pobrany i zapisany w chmurze!');
        console.log('PDF URL:', result.url);
      } else {
        alert('PDF pobrany na dysk, ale wystąpił błąd zapisu w chmurze.');
        console.error('Upload error:', result.error);
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
      // Pobieramy piosenki "na świeżo" z bazy
      const { data: songsData, error } = await supabase
        .from('songs')
        .select('*');

      if (error) throw error;

      // Tworzymy mapę
      const songsMap = (songsData || []).reduce((acc, song) => {
        acc[song.id] = song;
        return acc;
      }, {});

      if (type === 'pdf') {
        await generatePDFBase64(program, songsMap);
      } else {
        await generatePPT(program, songsMap);
      }

    } catch (error) {
      console.error('Błąd generowania dokumentu:', error);
      alert('Nie udało się wygenerować dokumentu (błąd pobierania piosenek).');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Na pewno usunąć?')) {
      await supabase.from('programs').delete().eq('id', id);
      fetchPrograms();
      if (selectedId === id) setSelectedId(null);
    }
  };

  const handleDuplicate = async (p) => {
    const { id, created_at, ...rest } = p;
    await supabase.from('programs').insert([rest]);
    fetchPrograms();
  };

  // Funkcja generująca HTML emaila z programem
  const generateEmailHTML = (program, songsMap) => {
    const formatDateFull = (dateString) => {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const date = new Date(dateString);
      const formatted = date.toLocaleDateString('pl-PL', options);
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    };

    const renderScheduleRows = () => {
      return program.schedule?.map((row) => {
        let detailsHTML = '';

        if ((row.element || '').toLowerCase().includes('uwielbienie') && row.selectedSongs?.length > 0) {
          // Renderuj pieśni jako listę (jedna pod drugą)
          const songsHTML = row.selectedSongs.map((s, idx) => {
            const song = songsMap[s.songId];
            if (!song) return '';
            return `
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: ${idx < row.selectedSongs.length - 1 ? '6px' : '0'};">
                <span style="display: inline-block; width: 20px; height: 20px; background: linear-gradient(135deg, #db2777, #ea580c); color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 10px; font-weight: 700;">${idx + 1}</span>
                <span style="color: #374151; font-weight: 500;">${song.title}</span>
                <span style="background: #fce7f3; color: #db2777; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid #fbcfe8;">${s.key}</span>
              </div>
            `;
          }).filter(Boolean).join('');
          detailsHTML = songsHTML;
        } else {
          detailsHTML = `<span style="color: #6b7280;">${row.details || '-'}</span>`;
        }

        return `
          <tr style="border-bottom: 1px solid #fecdd3;">
            <td style="padding: 12px; font-weight: 600; color: #be123c; vertical-align: top;">${row.element || '-'}</td>
            <td style="padding: 12px; color: #4b5563; vertical-align: top;">${row.person || '-'}</td>
            <td style="padding: 12px; font-size: 14px; vertical-align: top;">${detailsHTML}</td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #9ca3af;">Brak elementów</td></tr>';
    };

    return `
      <!DOCTYPE html>
      <html lang="pl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Program Nabożeństwa</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #fce7f3 0%, #fed7aa 100%); min-height: 100vh;">

        <!-- Container -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fce7f3 0%, #fed7aa 100%); padding: 40px 20px;">
          <tr>
            <td align="center">

              <!-- Main Content Card -->
              <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); overflow: hidden; max-width: 100%;">

                <!-- Header with Gradient -->
                <tr>
                  <td style="background: linear-gradient(135deg, #db2777 0%, #ea580c 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0 0 8px 0; color: white; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">Program Nabożeństwa</h1>
                    <div style="display: inline-block; background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); padding: 8px 20px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.3);">
                      <p style="margin: 0; color: white; font-size: 16px; font-weight: 700;">${formatDateFull(program.date)}</p>
                    </div>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">

                    <!-- Greeting -->
                    <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                      Cześć! 👋
                    </p>
                    <p style="margin: 0 0 32px 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                      Poniżej znajduje się szczegółowy program nabożeństwa. Pełna wersja PDF jest dostępna w załączniku.
                    </p>

                    <!-- Schedule Title -->
                    <div style="margin-bottom: 20px; padding-bottom: 12px; border-bottom: 3px solid #db2777;">
                      <h2 style="margin: 0; color: #1f2937; font-size: 22px; font-weight: 700;">📋 Plan Szczegółowy</h2>
                    </div>

                    <!-- Schedule Table -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #fecdd3; border-radius: 12px; overflow: hidden; margin-bottom: 32px;">
                      <thead>
                        <tr style="background: linear-gradient(135deg, #fce7f3 0%, #fed7aa 50%, #fce7f3 100%);">
                          <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 700; color: #be123c; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #fda4af;">Element</th>
                          <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 700; color: #be123c; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #fda4af;">Osoba</th>
                          <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 700; color: #be123c; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #fda4af;">Szczegóły</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${renderScheduleRows()}
                      </tbody>
                    </table>

                    <!-- Attachment Info -->
                    <div style="background: linear-gradient(135deg, #fef3c7 0%, #fce7f3 100%); border-left: 4px solid #f59e0b; padding: 16px 20px; border-radius: 12px; margin-bottom: 32px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">
                        📎 <strong>Pełny program w załączniku PDF</strong>
                      </p>
                      <p style="margin: 8px 0 0 0; color: #b45309; font-size: 13px;">
                        Szczegółowe informacje, pieśni z akordami oraz podział zespołów znajdziesz w załączonym pliku PDF.
                      </p>
                    </div>

                    <!-- Footer Message -->
                    <p style="margin: 0 0 8px 0; color: #374151; font-size: 15px;">
                      Pozdrawiam ciepło,
                    </p>
                    <p style="margin: 0; color: #db2777; font-size: 16px; font-weight: 700;">
                      Liderzy SchWro
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background: #f9fafb; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 4px 0; color: #9ca3af; font-size: 12px;">
                      Wygenerowano w <strong style="background: linear-gradient(135deg, #db2777, #ea580c); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">App SchWro</strong>
                    </p>
                    <p style="margin: 0; color: #d1d5db; font-size: 11px;">
                      IT Excellence • SchWro Południe
                    </p>
                  </td>
                </tr>

              </table>

            </td>
          </tr>
        </table>

      </body>
      </html>
    `;
  };

  // OBSŁUGA WYSYŁKI MAILA (SUPABASE EDGE FUNCTION)
  const handleSendEmail = async () => {
    if (!program || !program.id) {
      alert('Najpierw zapisz program przed wysłaniem maila.');
      return;
    }

    if (!confirm('Czy na pewno chcesz wysłać program do wszystkich osób z listy?')) return;

    setIsSending(true);

    try {
      const emails = getAllRecipients(program, worshipTeam);

      if (emails.length === 0) {
        alert('Brak adresów e-mail przypisanych do osób w programie. Upewnij się, że członkowie zespołu mają wpisane adresy e-mail w bazie.');
        setIsSending(false);
        return;
      }

      // Pobierz świeże dane piosenek z bazy
      const { data: allSongsData } = await supabase.from('songs').select('*');
      const songsMap = {};
      (allSongsData || []).forEach(s => { songsMap[s.id] = s; });

      // Pobierz PDF z Supabase Storage
      const dateStr = program.date.split('T')[0];
      const fileName = `Program-${dateStr}.pdf`;
      const filePath = `${program.id}/${fileName}`;

      // Sprawdź czy plik istnieje
      const { data: fileExists } = await supabase
        .storage
        .from('programs')
        .list(program.id.toString(), { search: fileName });

      if (!fileExists || fileExists.length === 0) {
        alert('Nie znaleziono PDF w bazie. Najpierw wygeneruj PDF używając przycisku "PDF".');
        setIsSending(false);
        return;
      }

      // Generuj HTML emaila z programem
      const htmlBody = generateEmailHTML(program, songsMap);

      console.log('Wysyłanie maila z załącznikiem:', filePath);

      const { data, error } = await supabase.functions.invoke('send-program-email', {
        body: {
          emailTo: emails,
          subject: `📅 Program Nabożeństwa: ${new Date(program.date).toLocaleDateString('pl-PL')}`,
          htmlBody: htmlBody,
          filePath: filePath,
          filename: fileName
        }
      });

      if (error) throw error;

      alert(`✅ Wysłano e-mail do ${emails.length} osób!`);

    } catch (error) {
      console.error('Błąd wysyłki:', error);
      alert('Wystąpił błąd podczas wysyłania e-maila. Sprawdź konsolę.');
    } finally {
      setIsSending(false);
    }
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

  const filteredPrograms = programs.filter(p => {
    const search = filter.toLowerCase();
    return (
      (p.date || '').toLowerCase().includes(search) ||
      (p.title || '').toLowerCase().includes(search)
    );
  });

  const today = new Date().toISOString().split('T')[0];
  
  const sortPrograms = (list) => {
    return list.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  };

  const upcomingPrograms = sortPrograms(filteredPrograms.filter(p => p.date >= today));
  const pastPrograms = sortPrograms(filteredPrograms.filter(p => p.date < today));

  const formatDateFull = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateString);
    const formatted = date.toLocaleDateString('pl-PL', options);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  const absentList = program.zespol?.absencja 
    ? program.zespol.absencja.split(',').map(s => s.trim()).filter(Boolean) 
    : [];

  // Stan widoku mobile: 'list' lub 'edit'
  const [mobileView, setMobileView] = useState('list');

  // Faktyczna zmiana programu (bez sprawdzania zmian)
  const doSelectProgram = (id) => {
    setSelectedId(id);
    if (window.innerWidth < 1024) {
      setMobileView('edit');
    }
  };

  // Na mobile, gdy wybierzemy program, przełącz na widok edycji
  const handleSelectProgram = (id) => {
    // Jeśli klikamy na ten sam program, nic nie rób
    if (id === selectedId) return;

    // Sprawdź czy są niezapisane zmiany
    if (hasUnsavedChanges()) {
      setPendingAction({ type: 'selectProgram', payload: id });
      setShowUnsavedModal(true);
    } else {
      doSelectProgram(id);
    }
  };

  // Obsługa nowego programu
  const handleNewProgram = () => {
    if (hasUnsavedChanges()) {
      setPendingAction({ type: 'newProgram', payload: null });
      setShowUnsavedModal(true);
    } else {
      setSelectedId(null);
      if (window.innerWidth < 1024) setMobileView('edit');
    }
  };

  // Zapisz i wykonaj oczekującą akcję
  const handleSaveAndProceed = async () => {
    await handleSave();
    setShowUnsavedModal(false);
    executePendingAction();
  };

  // Odrzuć zmiany i wykonaj oczekującą akcję
  const handleDiscardAndProceed = () => {
    setShowUnsavedModal(false);
    executePendingAction();
  };

  // Wykonaj oczekującą akcję
  const executePendingAction = () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'selectProgram') {
      doSelectProgram(pendingAction.payload);
    } else if (pendingAction.type === 'newProgram') {
      setSelectedId(null);
      if (window.innerWidth < 1024) setMobileView('edit');
    } else if (pendingAction.type === 'navigate') {
      navigate(pendingAction.payload);
    } else if (pendingAction.type === 'backToList') {
      setMobileView('list');
    }

    setPendingAction(null);
  };

  // Wróć do listy na mobile
  const handleBackToList = () => {
    if (hasUnsavedChanges()) {
      setPendingAction({ type: 'backToList', payload: null });
      setShowUnsavedModal(true);
    } else {
      setMobileView('list');
    }
  };

  // Zaktualizowany ProgramItem z nowym handlerem
  const ProgramItemWithHandler = ({ p }) => (
    <div
      key={p.id}
      onClick={() => handleSelectProgram(p.id)}
      className={`p-3 rounded-xl border cursor-pointer transition group relative overflow-hidden mb-2 ${
        selectedId === p.id
          ? 'bg-white dark:bg-gray-800 border-pink-200 dark:border-pink-700 shadow-md ring-1 ring-pink-100 dark:ring-pink-900'
          : 'bg-white/40 dark:bg-gray-800/40 border-white/60 dark:border-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-800/80 hover:shadow-sm'
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className={`font-bold text-sm mb-0.5 ${selectedId === p.id ? 'text-pink-700 dark:text-pink-400' : 'text-gray-700 dark:text-gray-200'}`}>
            {p.date ? formatDateFull(p.date) : 'Brak daty'}
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium bg-gray-100/50 dark:bg-gray-700/50 px-1.5 py-0.5 rounded inline-block">
            {p.schedule?.length || 0} elem.
          </div>
        </div>
      </div>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition duration-200">
        <button onClick={(e) => { e.stopPropagation(); handleDuplicate(p); }} className="p-1 bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded hover:bg-pink-100 dark:hover:bg-pink-900/50" title="Duplikuj"><Copy size={14} /></button>
        <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="p-1 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900/50" title="Usuń"><Trash2 size={14} /></button>
      </div>
      {selectedId === p.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-pink-500"></div>}
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-full bg-gradient-to-br from-pink-50 via-orange-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-gray-800 dark:text-gray-200">
      {/* LEWA KOLUMNA - LISTA */}
      <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} lg:flex w-full lg:w-80 bg-white/40 dark:bg-gray-900/40 backdrop-blur-xl border-b lg:border-b-0 lg:border-r border-white/40 dark:border-gray-700/50 flex-col h-full`}>
        <div className="p-4 lg:p-6 border-b border-white/40 dark:border-gray-700/50">
          <h2 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent mb-4">Lista programów</h2>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <input
                placeholder="Szukaj..."
                className="w-full px-4 py-2 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm transition"
              title="Sortuj"
            >
              <ArrowUpDown size={18} />
            </button>
          </div>
          <button onClick={handleNewProgram} className="w-full bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white py-2.5 rounded-xl font-bold shadow-lg hover:shadow-pink-500/30 transition transform hover:-translate-y-0.5 text-sm flex items-center justify-center gap-2"><Plus size={16} /> Nowy Program</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="mb-4">
            <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 ml-1">Nadchodzące</h3>
            {upcomingPrograms.length === 0 ? <div className="text-xs text-gray-400 dark:text-gray-500 italic ml-1">Brak planów</div> : upcomingPrograms.map(p => <ProgramItemWithHandler key={p.id} p={p} />)}
          </div>
          <div>
            <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 ml-1 hover:text-pink-600 dark:hover:text-pink-400 transition w-full text-left"><History size={12} /> Historia {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>
            {showHistory && <div className="animate-in fade-in slide-in-from-top-2 duration-200">{pastPrograms.map(p => <ProgramItemWithHandler key={p.id} p={p} />)}</div>}
          </div>
        </div>
      </div>

      {/* PRAWA KOLUMNA - EDYCJA */}
      <div className={`${mobileView === 'edit' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-y-auto p-2 sm:p-4 lg:p-8 custom-scrollbar`}>
        <div className="w-full lg:max-w-7xl lg:mx-auto space-y-8">
          
          {/* EDYCJA PROGRAMU */}
          <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-2xl rounded-2xl lg:rounded-3xl shadow-2xl border border-white/40 dark:border-gray-700/50 p-4 lg:p-8">
            {/* Przycisk wróć - tylko mobile */}
            <button
              onClick={handleBackToList}
              className="lg:hidden flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-4 hover:text-pink-600 dark:hover:text-pink-400 transition"
            >
              <ChevronLeft size={20} />
              <span className="font-medium">Wróć do listy</span>
            </button>

            <div className="flex flex-col lg:flex-row justify-between items-start gap-4 mb-6 lg:mb-8 pb-4 lg:pb-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <div>
                <h1 className="text-xl lg:text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-2">Program Nabożeństwa</h1>
                <CustomDatePicker
                  value={program.date}
                  onChange={(v) => setProgram({...program, date: v})}
                />
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
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2.5 text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-lg transition-colors border border-pink-200 font-medium text-sm disabled:opacity-50"
                title="Zapisz PDF na dysku i w chmurze Supabase"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                onClick={() => generateDocuments('ppt')}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2.5 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors border border-orange-200 font-medium text-sm"
              >
                <Presentation size={18} />
                <span className="hidden sm:inline">PPT</span>
              </button>

              <button
                onClick={handleSave}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-2.5 bg-gradient-to-r from-pink-600 to-orange-500 hover:from-pink-700 hover:to-orange-600 text-white rounded-lg shadow-lg shadow-pink-500/20 hover:shadow-pink-500/30 transition-all font-medium text-sm"
              >
                <Save size={18} />
                <span className="hidden sm:inline">Zapisz</span>
              </button>
            </div>

            </div>

            <div className="bg-white/70 dark:bg-gray-800/40 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 dark:border-gray-700/50 p-4 lg:p-6 mb-6 lg:mb-8 min-h-[300px] lg:min-h-[500px]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
                <h3 className="font-bold text-lg lg:text-xl text-gray-800 dark:text-white flex items-center gap-2"><div className="w-1.5 h-5 lg:h-6 bg-pink-600 dark:bg-pink-500 rounded-full"></div>Plan szczegółowy</h3>
                <button onClick={() => setProgram({...program, schedule: [...program.schedule, { id: Date.now(), element: '', person: '', details: '', songIds: [], selectedSongs: [] }]})} className="hidden sm:block bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white text-sm px-4 py-2.5 rounded-xl font-bold hover:shadow-lg transition">+ Dodaj Element</button>
              </div>
              <div className="bg-white/50 dark:bg-gray-900/50 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-inner overflow-hidden overflow-x-auto">
                <div className="hidden lg:grid grid-cols-12 gap-4 p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50 font-bold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[600px]"><div className="col-span-1"></div><div className="col-span-3">Element</div><div className="col-span-3">Osoba</div><div className="col-span-4">Szczegóły / Notatki</div><div className="col-span-1"></div></div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={program.schedule.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    <div>{program.schedule.map((row, idx) => <SortableRow key={row.id} row={row} index={idx} program={program} setProgram={setProgram} songs={songs} />)}</div>
                  </SortableContext>
                </DndContext>
              </div>
              {/* Przycisk Dodaj Element - tylko mobile, na dole */}
              <button onClick={() => setProgram({...program, schedule: [...program.schedule, { id: Date.now(), element: '', person: '', details: '', songIds: [], selectedSongs: [] }]})} className="sm:hidden w-full mt-4 bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white text-sm px-4 py-3 rounded-xl font-bold hover:shadow-lg transition">+ Dodaj Element</button>
            </div>

            <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 dark:border-gray-700/50 p-4 lg:p-6 mb-4 lg:mb-6 hover:shadow-xl transition relative z-50">
              <div className="flex justify-between items-center mb-4 lg:mb-6">
                <h3 className="font-bold text-base lg:text-lg bg-gradient-to-r from-pink-700 to-orange-700 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Zespół Uwielbienia</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                {(worshipRoles.length > 0
                  ? worshipRoles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
                  : [{ key: 'lider', label: 'Lider Uwielbienia', roleId: null }, { key: 'piano', label: 'Piano', roleId: null }, { key: 'gitara_akustyczna', label: 'Gitara Akustyczna', roleId: null }, { key: 'gitara_elektryczna', label: 'Gitara Elektryczna', roleId: null }, { key: 'bas', label: 'Gitara Basowa', roleId: null }, { key: 'wokale', label: 'Wokale', roleId: null }, { key: 'cajon', label: 'Cajon / Perkusja', roleId: null }]
                ).map(field => {
                  // Filtrowanie członków zespołu na podstawie przypisanych służb
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 lg:mb-6 relative z-0">
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
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 lg:mb-6 relative z-0">
              <DynamicScenaSection
                program={program}
                setProgram={setProgram}
                teachingSpeakers={teachingSpeakers}
                mcMembers={mcMembers}
                mcRoles={mcRoles}
                mcMemberRoles={mcMemberRoles}
              />
              <SzkolkaSection program={program} setProgram={setProgram} kidsGroups={kidsGroups} kidsTeachers={kidsTeachers} />
            </div>
          </div>
        </div>
      </div>

      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        onClose={() => setShowUnsavedModal(false)}
        onSave={handleSaveAndProceed}
        onDiscard={handleDiscardAndProceed}
      />
    </div>
  );
}
