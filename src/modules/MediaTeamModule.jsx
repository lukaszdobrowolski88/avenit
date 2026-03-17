import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Trash2, X, FileText, Music, Calendar, Download,
  AlertCircle, Paperclip, GripVertical, User, Users,
  LayoutGrid, List, CheckSquare, Filter, MessageSquare, Send,
  Check, UserX, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, DollarSign, Tag, Upload, FolderOpen, Package
} from 'lucide-react';
import FinanceTab from './shared/FinanceTab';
import EventsTab from './shared/EventsTab';
import MaterialsTab from './shared/MaterialsTab';
import EquipmentTab from './shared/EquipmentTab';
import RolesTab from '../components/RolesTab';
import CustomSelect from '../components/CustomSelect';
import ResponsiveTabs from '../components/ResponsiveTabs';
import { useUserRole } from '../hooks/useUserRole';
import { hasTabAccess } from '../utils/tabPermissions';

const STATUSES = ['Do zrobienia', 'W trakcie', 'Gotowe'];

// --- WSPÓLNE FUNKCJE UI (PORTALE) ---

// Hook do obliczania pozycji dropdowna (przyklejony do elementu, ale w body)
function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240; // max-h-60 = 15rem = 240px
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Otwórz w górę jeśli nie ma miejsca na dole, ale jest na górze
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        setCoords({
          top: openUpward
            ? rect.top + window.scrollY - 4
            : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
          openUpward
        });
      };

      updatePosition();
      // Aktualizuj pozycję przy scrollowaniu i zmianie rozmiaru okna
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

// --- KOMPONENTY GŁÓWNE UI ---

const CustomDatePicker = ({ label, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  useEffect(() => {
    if (value) setViewDate(new Date(value));
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        if (!event.target.closest('.portal-datepicker')) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDayClick = (day) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const d = String(newDate.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${d}`);
    setIsOpen(false);
  };

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const startDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startDay }, (_, i) => i);

  const monthName = viewDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const displayValue = value ? new Date(value).toLocaleDateString('pl-PL') : '';

  return (
    <div className="relative w-full">
      {label && <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>}
      <div 
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm cursor-pointer flex justify-between items-center transition-all
          ${isOpen 
            ? 'border-pink-500 ring-2 ring-pink-500/20 dark:border-pink-400' 
            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-pink-300 dark:hover:border-pink-600'
          }
        `}
      >
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={16} className="text-gray-400" />
          <span className={displayValue ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
            {displayValue || 'Wybierz datę'}
          </span>
        </div>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="portal-datepicker fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left,
            width: '280px'
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronLeft size={18}/></button>
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">{monthName}</span>
            <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronRight size={18}/></button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {blanks.map(b => <div key={`blank-${b}`} />)}
            {days.map(day => {
              const currentDayStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isSelected = value === currentDayStr;
              const isToday = new Date().toDateString() === new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString();
              
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`h-8 w-8 rounded-lg text-xs font-medium transition flex items-center justify-center
                    ${isSelected 
                      ? 'bg-pink-600 text-white shadow-md shadow-pink-500/30' 
                      : isToday 
                        ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-pink-800'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
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


// --- KOMPONENTY TABELI (TERAZ TEŻ Z PORTALAMI) ---

const TableMultiSelect = ({ options, value, onChange, absentMembers = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        if (!event.target.closest('.portal-table-multiselect')) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

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
    <div className="relative w-full">
      <div 
        ref={triggerRef}
        className="w-full min-h-[32px] px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs cursor-pointer flex flex-wrap gap-1 items-center hover:border-pink-300 dark:hover:border-pink-500 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-[10px] italic">Wybierz...</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-1.5 py-0.5 rounded text-[10px] border border-pink-100 dark:border-pink-800 whitespace-nowrap">
              {item}
            </span>
          ))
        )}
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="portal-table-multiselect fixed z-[9999] w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left
          }}
        >
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            const isAbsent = absentMembers.includes(person.full_name);

            return (
              <div 
                key={person.id}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between transition 
                  ${isAbsent ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-pink-50 dark:hover:bg-pink-900/20 text-gray-700 dark:text-gray-300'}
                  ${isSelected ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 font-medium' : ''}
                `}
                onClick={() => toggleSelection(person.full_name, isAbsent)}
              >
                <span className={isAbsent ? 'line-through decoration-gray-400 dark:decoration-gray-600' : ''}>
                  {person.full_name}
                </span>
                {isSelected && !isAbsent && <Check size={12} />}
                {isAbsent && <UserX size={12} className="text-red-300 dark:text-red-400" />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

const AbsenceMultiSelect = ({ options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        if (!event.target.closest('.portal-absence-multiselect')) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const toggleSelection = (name) => {
    let newSelection;
    if (selectedItems.includes(name)) {
      newSelection = selectedItems.filter(i => i !== name);
    } else {
      newSelection = [...selectedItems, name];
    }
    onChange(newSelection.join(', '));
  };

  return (
    <div className="relative w-full">
      <div 
        ref={triggerRef}
        className="w-full min-h-[32px] px-2 py-1 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 rounded-lg text-xs cursor-pointer flex flex-wrap gap-1 items-center hover:border-red-300 dark:hover:border-red-700 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-[10px] italic">Wybierz...</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded text-[10px] border border-red-100 dark:border-red-800 whitespace-nowrap flex items-center gap-1">
              {item}
            </span>
          ))
        )}
      </div>

      {isOpen && document.body && createPortal(
        <div
          className="portal-absence-multiselect fixed z-[9999] w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left
          }}
        >
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            return (
              <div 
                key={person.id}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-900/20 transition ${isSelected ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                onClick={() => toggleSelection(person.full_name)}
              >
                <span>{person.full_name}</span>
                {isSelected && <UserX size={12} />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

const ScheduleTable = ({ programs, mediaTeam, onUpdateProgram, roles, memberRoles = [] }) => {
  const [expandedMonths, setExpandedMonths] = useState({});

  const groupedPrograms = programs.reduce((acc, prog) => {
    if (!prog.date) return acc;
    const date = new Date(prog.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(prog);
    return acc;
  }, {});

  const sortedMonths = Object.keys(groupedPrograms).sort().reverse();

  useEffect(() => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    setExpandedMonths(prev => ({ ...prev, [currentMonthKey]: true }));
  }, []);

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const formatMonthName = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  };

  const formatDateShort = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const updateRole = async (programId, field, value) => {
    const programToUpdate = programs.find(p => p.id === programId);
    if (!programToUpdate) return;
    const currentProdukcja = programToUpdate.produkcja || {};
    const updatedProdukcja = { ...currentProdukcja, [field]: value };
    await onUpdateProgram(programId, { produkcja: updatedProdukcja });
  };

  const updateNotes = async (programId, value) => {
     const programToUpdate = programs.find(p => p.id === programId);
     if (!programToUpdate) return;
     const currentProdukcja = programToUpdate.produkcja || {};
     const updatedProdukcja = { ...currentProdukcja, notatki: value };
     await onUpdateProgram(programId, { produkcja: updatedProdukcja });
  };

  const updateAbsence = async (programId, value) => {
    const programToUpdate = programs.find(p => p.id === programId);
    if (!programToUpdate) return;
    const currentProdukcja = programToUpdate.produkcja || {};
    const updatedProdukcja = { ...currentProdukcja, absencja: value };
    await onUpdateProgram(programId, { produkcja: updatedProdukcja });
  };

  // Dynamiczne kolumny z zakładki Służby lub fallback do statycznych
  const columns = roles && roles.length > 0
    ? roles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
    : [
        { key: 'propresenter', label: 'Prezentacja', roleId: null },
        { key: 'social', label: 'SocialMedia', roleId: null },
        { key: 'video', label: 'Video', roleId: null },
        { key: 'foto', label: 'Foto', roleId: null },
        { key: 'naglosnienie', label: 'Nagłośnienie', roleId: null },
      ];

  // Funkcja do filtrowania członków zespołu według przypisania do służby
  const getMembersForRole = (roleId) => {
    if (!roleId || memberRoles.length === 0) {
      return mediaTeam;
    }
    const assignedMemberIds = memberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => String(mr.member_id));

    if (assignedMemberIds.length === 0) {
      return mediaTeam;
    }

    return mediaTeam.filter(member => assignedMemberIds.includes(String(member.id)));
  };

  return (
    <div className="space-y-4">
      {sortedMonths.map(monthKey => {
        const isExpanded = expandedMonths[monthKey];
        
        return (
          <div 
            key={monthKey} 
            className={`bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm relative z-0 transition-all duration-300 ${isExpanded ? 'mb-8' : 'mb-0'}`}
          >
            <button 
              onClick={() => toggleMonth(monthKey)}
              className={`w-full px-6 py-4 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-800/80 flex justify-between items-center transition border-b border-gray-100 dark:border-gray-700 ${isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
            >
              <span className="font-bold text-gray-800 dark:text-gray-200 text-sm uppercase tracking-wider">{formatMonthName(monthKey)}</span>
              {isExpanded ? <ChevronUp size={18} className="text-gray-500 dark:text-gray-400"/> : <ChevronDown size={18} className="text-gray-500 dark:text-gray-400"/>}
            </button>
            
            {isExpanded && (
              <div className="overflow-x-auto pb-4">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
                      <th className="p-3 font-semibold w-24 min-w-[90px]">Data</th>
                      {columns.map(col => (
                        <th key={col.key} className="p-3 font-semibold min-w-[130px]">{col.label}</th>
                      ))}
                      <th className="p-3 font-semibold min-w-[130px] text-red-500 dark:text-red-400">Absencja</th>
                      <th className="p-3 font-semibold min-w-[150px]">Notatki</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700 relative">
                    {groupedPrograms[monthKey]
                      .sort((a, b) => new Date(a.date) - new Date(b.date))
                      .map((prog, idx) => {
                        const absentList = prog.produkcja?.absencja 
                          ? prog.produkcja.absencja.split(',').map(s => s.trim()).filter(Boolean) 
                          : [];

                        return (
                          <tr key={prog.id} className="hover:bg-white/60 dark:hover:bg-gray-700/30 transition relative">
                            <td className="p-3 font-medium text-gray-700 dark:text-gray-300 font-mono text-xs">
                              {formatDateShort(prog.date)}
                            </td>
                            {columns.map(col => (
                              <td key={col.key} className="p-2 relative">
                                <TableMultiSelect
                                  options={getMembersForRole(col.roleId)}
                                  value={prog.produkcja?.[col.key] || ''}
                                  onChange={(val) => updateRole(prog.id, col.key, val)}
                                  absentMembers={absentList}
                                />
                              </td>
                            ))}
                            <td className="p-2 relative">
                              <AbsenceMultiSelect 
                                options={mediaTeam}
                                value={prog.produkcja?.absencja || ''}
                                onChange={(val) => updateAbsence(prog.id, val)}
                              />
                            </td>
                            <td className="p-2">
                              <input 
                                className="w-full bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-pink-500 dark:focus:border-pink-400 text-xs p-1 outline-none transition placeholder-gray-300 dark:placeholder-gray-600 text-gray-700 dark:text-gray-300"
                                placeholder="Wpisz..."
                                defaultValue={prog.produkcja?.notatki || ''}
                                onBlur={(e) => updateNotes(prog.id, e.target.value)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default function MediaTeamModule() {
  const { userRole } = useUserRole();
  const [activeTab, setActiveTab] = useState('schedule');
  const [team, setTeam] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  const [viewMode, setViewMode] = useState('kanban');
  const [filterScope, setFilterScope] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  
  const [memberForm, setMemberForm] = useState({ id: null, full_name: '', role: '', email: '', phone: '' });
  const [selectedMemberRoles, setSelectedMemberRoles] = useState([]);
  const [taskForm, setTaskForm] = useState({
    id: null,
    title: '',
    description: '',
    due_date: '',
    assigned_to: null,
    status: 'Do zrobienia',
    attachment: null
  });

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Służby z team_roles
  const [mediaRoles, setMediaRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);

  // Finance data
  const [budgetItems, setBudgetItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    payment_date: '',
    amount: '',
    contractor: '',
    category: 'MediaTeam',
    description: '',
    detailed_description: '',
    responsible_person: '',
    documents: [],
    tags: [],
    ministry: 'MediaTeam'
  });

  useEffect(() => {
    fetchData();
    getCurrentUser();
    fetchMediaRoles();
  }, []);

  useEffect(() => {
    if (activeTab === 'finances') {
      fetchFinanceData();
    }
  }, [activeTab]);

  const fetchMediaRoles = async () => {
    try {
      const { data: rolesData } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', 'media')
        .eq('is_active', true)
        .order('display_order');
      setMediaRoles(rolesData || []);

      // Pobierz przypisania członków do służb
      const { data: memberRolesData } = await supabase
        .from('team_member_roles')
        .select('*')
        .eq('member_table', 'media_team');
      setMemberRoles(memberRolesData || []);
    } catch (err) {
      console.error('Błąd pobierania służb:', err);
    }
  };

  async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      setCurrentUserEmail(data.user.email);
    }
  }

  const fetchFinanceData = async () => {
    const currentYear = new Date().getFullYear();
    const ministryName = 'MediaTeam';

    try {
      const { data: budget, error: budgetError } = await supabase
        .from('budget_items')
        .select('*')
        .eq('ministry', ministryName)
        .eq('year', currentYear)
        .order('id', { ascending: true });

      if (budgetError) throw budgetError;
      setBudgetItems(budget || []);

      const { data: exp, error: expError } = await supabase
        .from('expense_transactions')
        .select('*')
        .eq('ministry', ministryName)
        .gte('payment_date', `${currentYear}-01-01`)
        .lte('payment_date', `${currentYear}-12-31`)
        .order('payment_date', { ascending: false });

      if (expError) throw expError;
      setExpenses(exp || []);
    } catch (error) {
      console.error('Error fetching finance data:', error);
    }
  };

  const handleExpenseFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingFile(true);
    try {
      const uploadedDocs = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `expense_documents/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('finance')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('finance').getPublicUrl(filePath);

        uploadedDocs.push({
          name: file.name,
          url: data.publicUrl,
          uploadedAt: new Date().toISOString()
        });
      }

      setExpenseForm({
        ...expenseForm,
        documents: [...expenseForm.documents, ...uploadedDocs]
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Błąd przesyłania pliku: ' + error.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const removeExpenseDocument = (index) => {
    setExpenseForm({
      ...expenseForm,
      documents: expenseForm.documents.filter((_, i) => i !== index)
    });
  };

  const addExpenseTag = () => {
    if (newTag.trim() && !expenseForm.tags.includes(newTag.trim())) {
      setExpenseForm({ ...expenseForm, tags: [...expenseForm.tags, newTag.trim()] });
      setNewTag('');
    }
  };

  const removeExpenseTag = (tag) => {
    setExpenseForm({ ...expenseForm, tags: expenseForm.tags.filter(t => t !== tag) });
  };

  const saveExpense = async () => {
    if (!expenseForm.payment_date || !expenseForm.amount || !expenseForm.contractor || !expenseForm.description || !expenseForm.responsible_person) {
      alert('Wypełnij wymagane pola');
      return;
    }

    try {
      const { error } = await supabase.from('expense_transactions').insert([{
        payment_date: expenseForm.payment_date,
        amount: parseFloat(expenseForm.amount),
        contractor: expenseForm.contractor,
        category: expenseForm.category,
        description: expenseForm.description,
        detailed_description: expenseForm.detailed_description,
        responsible_person: expenseForm.responsible_person,
        documents: expenseForm.documents,
        tags: expenseForm.tags,
        ministry: expenseForm.ministry
      }]);

      if (error) throw error;

      setShowExpenseModal(false);
      const ministryName = expenseForm.ministry;
      setExpenseForm({
        payment_date: '',
        amount: '',
        contractor: '',
        category: ministryName,
        description: '',
        detailed_description: '',
        responsible_person: '',
        documents: [],
        tags: [],
        ministry: ministryName
      });
      fetchFinanceData();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Błąd zapisywania: ' + error.message);
    }
  };

  async function fetchData() {
    setLoading(true);
    setError(null);

    try {
      // Pobierz programy tylko z ostatnich 6 miesięcy dla wydajności
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const dateFrom = sixMonthsAgo.toISOString().split('T')[0];

      // Wykonaj wszystkie zapytania równolegle
      const [teamResult, tasksResult, progResult] = await Promise.all([
        supabase.from('media_team').select('id, full_name, role, email, phone').order('full_name'),
        supabase.from('media_tasks').select('*').order('due_date'),
        supabase.from('programs').select('id, date, produkcja').gte('date', dateFrom).order('date', { ascending: false })
      ]);

      if (teamResult.error) throw new Error(`Błąd zespołu: ${teamResult.error.message}`);
      if (tasksResult.error) throw new Error(`Błąd zadań: ${tasksResult.error.message}`);
      if (progResult.error) throw new Error(`Błąd programów: ${progResult.error.message}`);

      setTeam(teamResult.data || []);
      setTasks(tasksResult.data || []);
      setPrograms(progResult.data || []);
    } catch (err) {
      console.error('❌ Błąd pobierania danych:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleProgramUpdate = async (id, updates) => {
    setPrograms(prev => prev.map(p => {
      if (p.id === id) {
        if (updates.produkcja) {
          return { ...p, ...updates, produkcja: { ...p.produkcja, ...updates.produkcja } };
        }
        return { ...p, ...updates };
      }
      return p;
    }));
    
    await supabase.from('programs').update(updates).eq('id', id);
  };

  const fetchComments = async (taskId) => {
    if (!taskId) return;
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from('media_task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(data || []);
    } catch (err) {
      console.error('Błąd pobierania komentarzy:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim() || !taskForm.id) return;

    try {
      const authorProfile = team.find(m => m.email === currentUserEmail);
      const authorName = authorProfile ? authorProfile.full_name : (currentUserEmail || 'Nieznany');

      const commentData = {
        task_id: taskForm.id,
        content: newComment.trim(),
        author_email: currentUserEmail,
        author_name: authorName
      };

      const { error } = await supabase
        .from('media_task_comments')
        .insert([commentData]);

      if (error) throw error;

      setNewComment('');
      fetchComments(taskForm.id);
    } catch (err) {
      console.error('Błąd dodawania komentarza:', err);
      alert('Nie udało się dodać komentarza');
    }
  };

  const openTaskModal = (task) => {
    setTaskForm(task || {
      id: null,
      title: '',
      description: '',
      due_date: '',
      assigned_to: null,
      status: 'Do zrobienia',
      attachment: null
    });
    
    if (task && task.id) {
      fetchComments(task.id);
    } else {
      setComments([]);
    }
    
    setShowTaskModal(true);
  };

  const getFilteredTasks = () => {
    return tasks.filter(task => {
      if (filterScope === 'mine') {
        const myMemberProfile = team.find(m => m.email === currentUserEmail);
        if (!myMemberProfile || task.assigned_to !== myMemberProfile.id) {
          return false;
        }
      }
      if (filterStatus === 'active') {
        if (task.status === 'Gotowe') return false;
      } else if (filterStatus === 'completed') {
        if (task.status !== 'Gotowe') return false;
      }
      return true;
    });
  };

  const filteredTasks = getFilteredTasks();

  const toggleTaskCompletion = async (task) => {
    const newStatus = task.status === 'Gotowe' ? 'Do zrobienia' : 'Gotowe';
    const updatedTasks = tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t);
    setTasks(updatedTasks);

    try {
      const { error } = await supabase
        .from('media_tasks')
        .update({ status: newStatus })
        .eq('id', task.id);
      if (error) throw error;
    } catch (err) {
      console.error('Błąd zmiany statusu:', err);
      fetchData();
    }
  };

  const saveMember = async () => {
    try {
      if (!memberForm.full_name.trim()) {
        alert('Imię i nazwisko jest wymagane');
        return;
      }
      let memberId = memberForm.id;

      if (memberForm.id) {
        const { error } = await supabase.from('media_team').update({
          full_name: memberForm.full_name,
          role: memberForm.role,
          email: memberForm.email,
          phone: memberForm.phone
        }).eq('id', memberForm.id);
        if (error) throw error;
      } else {
        const { data: newMember, error } = await supabase.from('media_team').insert([{
          full_name: memberForm.full_name,
          role: memberForm.role,
          email: memberForm.email,
          phone: memberForm.phone
        }]).select().single();
        if (error) throw error;
        memberId = newMember.id;
      }

      // Zapisz przypisania do służb
      if (memberId) {
        // Usuń obecne przypisania
        await supabase
          .from('team_member_roles')
          .delete()
          .eq('member_id', String(memberId))
          .eq('member_table', 'media_team');

        // Dodaj nowe przypisania
        if (selectedMemberRoles.length > 0) {
          const assignments = selectedMemberRoles.map(roleId => ({
            member_id: String(memberId),
            member_table: 'media_team',
            role_id: roleId
          }));
          await supabase.from('team_member_roles').insert(assignments);
        }
      }

      setShowMemberModal(false);
      setSelectedMemberRoles([]);
      await fetchData();
      await fetchMediaRoles();
    } catch (err) {
      console.error('Błąd zapisywania członka:', err);
      alert('Błąd: ' + err.message);
    }
  };

  const loadMemberRoles = (memberId) => {
    const roles = memberRoles
      .filter(mr => String(mr.member_id) === String(memberId))
      .map(mr => mr.role_id);
    setSelectedMemberRoles(roles);
  };

  const getMemberRoleNames = (memberId) => {
    const roleIds = memberRoles
      .filter(mr => String(mr.member_id) === String(memberId))
      .map(mr => mr.role_id);
    return mediaRoles
      .filter(r => roleIds.includes(r.id))
      .map(r => r.name);
  };

  const deleteMember = async (id) => {
    if (confirm('Usunąć członka zespołu?')) {
      try {
        const { error } = await supabase.from('media_team').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (err) {
        console.error('Błąd usuwania członka:', err);
        alert('Błąd: ' + err.message);
      }
    }
  };

  const saveTask = async () => {
    try {
      if (!taskForm.title.trim()) {
        alert('Tytuł zadania jest wymagany');
        return;
      }
      const taskData = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        due_date: taskForm.due_date || null,
        assigned_to: taskForm.assigned_to || null,
        status: taskForm.status,
        attachment: taskForm.attachment
      };

      let savedTaskId = taskForm.id;

      if (taskForm.id) {
        const { error } = await supabase.from('media_tasks').update(taskData).eq('id', taskForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('media_tasks').insert([taskData]).select();
        if (error) throw error;
        if (data && data[0]) savedTaskId = data[0].id;
      }
      
      setShowTaskModal(false);
      await fetchData();
    } catch (err) {
      console.error('Błąd zapisywania zadania:', err);
      alert('Błąd: ' + err.message);
    }
  };

  const deleteTask = async (id) => {
    if (confirm('Usunąć zadanie?')) {
      try {
        const { error } = await supabase.from('media_tasks').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (err) {
        console.error('Błąd usuwania zadania:', err);
        alert('Błąd: ' + err.message);
      }
    }
  };

  const handleDragStart = (task) => setDraggedTask(task);
  const handleDragOver = (e, status) => { e.preventDefault(); setDragOverColumn(status); };
  const handleDragLeave = () => setDragOverColumn(null);
  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask || draggedTask.status === newStatus) { setDraggedTask(null); return; }
    try {
      const { error } = await supabase.from('media_tasks').update({ status: newStatus }).eq('id', draggedTask.id);
      if (error) throw error;
      await fetchData();
    } catch (err) { console.error('Błąd:', err); }
    setDraggedTask(null);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setTaskForm({ ...taskForm, attachment: { name: file.name, type: file.type, size: file.size, data: event.target.result.split(',')[1] } });
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) return <div className="p-10 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 dark:border-pink-400 mx-auto"></div></div>;
  if (error) return <div className="p-10 text-red-600 dark:text-red-400">Błąd: {error}</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Zespół Medialny</h1>
      </div>

      {/* TAB NAVIGATION */}
      <ResponsiveTabs
        tabs={[
          { id: 'events', label: 'Wydarzenia', icon: Calendar },
          { id: 'schedule', label: 'Grafik', icon: Calendar },
          { id: 'tasks', label: 'Zadania', icon: CheckSquare },
          ...(hasTabAccess('media', 'members', userRole) ? [{ id: 'members', label: 'Członkowie', icon: User }] : []),
          ...(hasTabAccess('media', 'finances', userRole) ? [{ id: 'finances', label: 'Finanse', icon: DollarSign }] : []),
          ...(hasTabAccess('media', 'members', userRole) ? [{ id: 'roles', label: 'Służby', icon: Users }] : []),
          ...(hasTabAccess('media', 'equipment', userRole) ? [{ id: 'equipment', label: 'Wyposażenie', icon: Package }] : []),
          { id: 'files', label: 'Pliki', icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* SEKCJA: WYDARZENIA */}
      {activeTab === 'events' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 relative z-[50] transition-colors duration-300">
          <EventsTab ministry="media" currentUserEmail={currentUserEmail} />
        </section>
      )}

      {/* SEKCJA 1: GRAFIK MEDIA TEAM */}
      {activeTab === 'schedule' && (
      <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 relative z-[50] transition-colors duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Grafik Media Team</h2>
        </div>
        <ScheduleTable
          programs={programs}
          mediaTeam={team}
          onUpdateProgram={handleProgramUpdate}
          roles={mediaRoles}
          memberRoles={memberRoles}
        />
      </section>
      )}

      {/* SEKCJA 2: ZADANIA */}
      {activeTab === 'tasks' && (
      <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-4 lg:p-6 relative z-[40] transition-colors duration-300">
        {/* Mobile: 2 rows, Desktop: 1 row */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
          {/* Row 1: Title + Add button (mobile) / Title (desktop) */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Zadania ({filteredTasks.length})</h2>
            {/* Mobile only: Add button */}
            <button onClick={() => openTaskModal(null)} className="lg:hidden bg-gradient-to-r from-orange-600 to-pink-600 text-white p-2.5 rounded-xl font-medium hover:shadow-lg transition"><Plus size={20}/></button>
          </div>

          {/* Row 2: Filters (mobile) / Filters + Add button (desktop) */}
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 gap-1 lg:gap-2 items-center flex-1 lg:flex-none">
              <button onClick={() => setViewMode('kanban')} className={`p-2 rounded-lg transition ${viewMode === 'kanban' ? 'bg-white dark:bg-gray-700 shadow text-pink-600 dark:text-pink-300' : 'text-gray-500 dark:text-gray-400'}`}><LayoutGrid size={18} /></button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow text-pink-600 dark:text-pink-300' : 'text-gray-500 dark:text-gray-400'}`}><List size={18} /></button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1 hidden lg:block"></div>

              {/* CUSTOM DROPDOWN: SCOPE */}
              <div className="w-24 lg:w-32">
                <CustomSelect
                  value={filterScope}
                  onChange={setFilterScope}
                  options={[
                    { value: 'all', label: 'Wszyscy' },
                    { value: 'mine', label: 'Moje' }
                  ]}
                  placeholder="Zakres"
                />
              </div>

              {/* CUSTOM DROPDOWN: STATUS */}
              <div className="w-24 lg:w-32">
                <CustomSelect
                  value={filterStatus}
                  onChange={setFilterStatus}
                  options={[
                    { value: 'active', label: 'Otwarte' },
                    { value: 'completed', label: 'Zakończone' },
                    { value: 'all', label: 'Wszystkie' }
                  ]}
                  placeholder="Status"
                />
              </div>
            </div>
            {/* Desktop only: Add button with text */}
            <button onClick={() => openTaskModal(null)} className="hidden lg:flex bg-gradient-to-r from-orange-600 to-pink-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition items-center gap-2 whitespace-nowrap"><Plus size={18}/> Dodaj zadanie</button>
          </div>
        </div>

        {viewMode === 'kanban' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUSES.map(status => (
              <div key={status} className={`bg-gradient-to-br from-gray-50/80 to-gray-100/50 dark:from-gray-800/40 dark:to-gray-900/20 backdrop-blur-sm rounded-2xl border-2 p-4 transition-all ${dragOverColumn === status ? 'border-pink-400 dark:border-pink-500 bg-pink-50/50 dark:bg-pink-900/20 shadow-lg' : 'border-gray-200/50 dark:border-gray-700/50'}`}
                onDragOver={(e) => handleDragOver(e, status)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, status)}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{status}</h3>
                  <span className="bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 px-3 py-1 rounded-full text-xs font-bold">{filteredTasks.filter(t => t.status === status).length}</span>
                </div>
                <div className="space-y-3">
                  {filteredTasks.filter(t => t.status === status).map(task => (
                    <div key={task.id} draggable onDragStart={() => handleDragStart(task)} className={`bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-4 shadow-sm hover:shadow-md transition cursor-move group ${task.status === 'Gotowe' ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="mt-1"><input type="checkbox" checked={task.status === 'Gotowe'} onChange={() => toggleTaskCompletion(task)} className="w-5 h-5 rounded border-gray-300 text-pink-600 dark:text-pink-500 cursor-pointer" /></div>
                        <div className="flex-1">
                          <h4 className={`font-bold text-gray-800 dark:text-gray-100 mb-2 ${task.status === 'Gotowe' ? 'line-through text-gray-500 dark:text-gray-500' : ''}`}>{task.title}</h4>
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                            {task.due_date && <div className="flex items-center gap-1"><Calendar size={14} />{new Date(task.due_date).toLocaleDateString('pl-PL')}</div>}
                            {task.assigned_to && <div className="flex items-center gap-1"><User size={14} />{team.find(m => m.id === task.assigned_to)?.full_name}</div>}
                          </div>
                          <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <button onClick={() => openTaskModal(task)} className="text-pink-600 dark:text-pink-400 text-xs font-medium">Szczegóły</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gradient-to-r from-pink-50/80 to-orange-50/80 dark:from-pink-900/20 dark:to-orange-900/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
                <tr><th className="p-4 w-10"></th><th className="p-4">Zadanie</th><th className="p-4">Termin</th><th className="p-4">Przypisane</th><th className="p-4">Status</th><th className="p-4 text-right">Akcje</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
                {filteredTasks.map(task => (
                  <tr key={task.id} className="hover:bg-pink-50/30 dark:hover:bg-pink-900/10 transition">
                    <td className="p-4"><input type="checkbox" checked={task.status === 'Gotowe'} onChange={() => toggleTaskCompletion(task)} className="w-5 h-5 rounded border-gray-300 text-pink-600 dark:text-pink-500 cursor-pointer" /></td>
                    <td className="p-4 font-bold text-gray-800 dark:text-gray-200">{task.title}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{task.due_date ? new Date(task.due_date).toLocaleDateString('pl-PL') : '-'}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{team.find(m => m.id === task.assigned_to)?.full_name || '-'}</td>
                    <td className="p-4"><span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{task.status}</span></td>
                    <td className="p-4 text-right"><button onClick={() => openTaskModal(task)} className="text-pink-600 dark:text-pink-400 font-medium">Szczegóły</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* SEKCJA 3: CZŁONKOWIE */}
      {activeTab === 'members' && (
      <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 relative z-[30] transition-colors duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Członkowie ({team.length})</h2>
          <button onClick={() => { setMemberForm({ id: null, full_name: '', role: '', email: '', phone: '' }); setSelectedMemberRoles([]); setShowMemberModal(true); }} className="bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> Dodaj członka</button>
        </div>
        <div className="bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[700px]">
            <thead className="bg-gradient-to-r from-pink-50/80 to-orange-50/80 dark:from-pink-900/20 dark:to-orange-900/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
              <tr><th className="p-4">Imię i nazwisko</th><th className="p-4">Służby</th><th className="p-4">Email</th><th className="p-4">Telefon</th><th className="p-4 text-right">Akcje</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
              {team.map(m => {
                const roleNames = getMemberRoleNames(m.id);
                return (
                  <tr key={m.id} className="hover:bg-pink-50/30 dark:hover:bg-pink-900/10 transition text-gray-700 dark:text-gray-300">
                    <td className="p-4 font-medium">{m.full_name}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {roleNames.length > 0 ? (
                          roleNames.map((name, idx) => (
                            <span key={idx} className="bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded-lg text-xs font-medium border border-pink-100 dark:border-pink-800">
                              {name}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs italic">Brak przypisanych</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">{m.email}</td>
                    <td className="p-4">{m.phone}</td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button onClick={() => { setMemberForm(m); loadMemberRoles(m.id); setShowMemberModal(true); }} className="text-pink-600 dark:text-pink-400 font-medium">Edytuj</button>
                      <button onClick={() => deleteMember(m.id)} className="text-red-500 dark:text-red-400 font-medium">Usuń</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </section>
      )}

      {/* FINANCES TAB */}
      {activeTab === 'finances' && (
        <FinanceTab
          ministry="MediaTeam"
          budgetItems={budgetItems}
          expenses={expenses}
          onAddExpense={() => setShowExpenseModal(true)}
          onRefresh={fetchFinanceData}
        />
      )}

      {/* ROLES TAB */}
      {activeTab === 'roles' && (
        <RolesTab
          teamType="media"
          teamMembers={team}
          memberTable="media_team"
          onUpdate={fetchMediaRoles}
        />
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden transition-colors duration-300">
          <MaterialsTab moduleKey="media" canEdit={true} />
        </section>
      )}

      {/* EQUIPMENT TAB */}
      {activeTab === 'equipment' && (
        <EquipmentTab
          ministryKey="media"
          currentUserEmail={currentUserEmail}
          canEdit={hasTabAccess('media', 'equipment', userRole)}
        />
      )}

      {/* MODAL ZADANIA */}
      {showTaskModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto transition-opacity">
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-4xl p-0 border border-white/20 dark:border-gray-700/50 my-8 flex overflow-hidden h-[80vh] animate-in fade-in zoom-in duration-200">
            
            <div className="w-3/5 p-8 overflow-y-auto border-r border-gray-200/50 dark:border-gray-700/50 custom-scrollbar">
              <div className="flex justify-between mb-6">
                <h3 className="font-bold text-2xl bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">{taskForm.id ? 'Edycja zadania' : 'Nowe zadanie'}</h3>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tytuł zadania</label>
                  <input className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100" value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Opis</label>
                  <textarea className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm resize-none h-32 focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100" value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <CustomDatePicker 
                      label="Termin"
                      value={taskForm.due_date}
                      onChange={val => setTaskForm({...taskForm, due_date: val})}
                    />
                  </div>
                  <div>
                    <CustomSelect 
                      label="Status"
                      value={taskForm.status}
                      onChange={val => setTaskForm({...taskForm, status: val})}
                      options={STATUSES}
                    />
                  </div>
                </div>
                <div>
                  <CustomSelect 
                    label="Przypisana osoba"
                    value={taskForm.assigned_to}
                    onChange={val => setTaskForm({...taskForm, assigned_to: val})}
                    options={[
                      { value: null, label: 'Nie przypisano' },
                      ...team.map(m => ({ value: m.id, label: m.full_name }))
                    ]}
                    placeholder="Wybierz osobę..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Załącznik</label>
                  <input type="file" className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-pink-50 dark:file:bg-pink-900/30 file:text-pink-700 dark:file:text-pink-300 hover:file:bg-pink-100 dark:hover:file:bg-pink-900/50" onChange={handleFileUpload} />
                  {taskForm.attachment && <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg"><Paperclip size={14} />{taskForm.attachment.name}</div>}
                </div>
                <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                  {taskForm.id && <button onClick={() => { deleteTask(taskForm.id); setShowTaskModal(false); }} className="px-4 py-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition">Usuń zadanie</button>}
                  <button onClick={saveTask} className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white font-bold rounded-xl hover:shadow-lg transition">Zapisz zmiany</button>
                </div>
              </div>
            </div>

            <div className="w-2/5 bg-gray-50/50 dark:bg-gray-800/30 p-6 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2"><MessageSquare size={18}/> Komentarze</h4>
                <button onClick={() => setShowTaskModal(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"><X size={20} className="text-gray-500 dark:text-gray-400"/></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
                {!taskForm.id ? <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-10">Zapisz zadanie, aby dodawać komentarze.</div> : loadingComments ? <div className="text-center text-gray-400 dark:text-gray-500 text-sm">Ładowanie...</div> : comments.length === 0 ? <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-10">Brak komentarzy. Bądź pierwszy!</div> : comments.map(comment => (
                  <div key={comment.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-xs text-pink-700 dark:text-pink-300">{comment.author_name}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(comment.created_at).toLocaleString('pl-PL')}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
              </div>
              {taskForm.id && <div className="mt-auto"><div className="relative"><textarea className="w-full pl-4 pr-12 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:ring-2 focus:ring-pink-500/20 outline-none text-sm resize-none text-gray-800 dark:text-gray-200" placeholder="Napisz komentarz..." rows={2} value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); }}} /><button onClick={addComment} disabled={!newComment.trim()} className="absolute right-2 bottom-2 p-2 bg-pink-600 dark:bg-pink-500 text-white rounded-lg hover:bg-pink-700 dark:hover:bg-pink-600 transition disabled:opacity-50 disabled:cursor-not-allowed"><Send size={16} /></button></div></div>}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL CZŁONKA */}
      {showMemberModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{memberForm.id ? 'Edytuj członka' : 'Nowy członek'}</h3>
              <button onClick={() => setShowMemberModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Imię i nazwisko</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="Jan Kowalski" value={memberForm.full_name} onChange={e => setMemberForm({...memberForm, full_name: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Służby</label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
                  <div className="flex flex-wrap gap-2">
                    {mediaRoles.map(role => {
                      const isSelected = selectedMemberRoles.includes(role.id);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedMemberRoles(prev => prev.filter(id => id !== role.id));
                            } else {
                              setSelectedMemberRoles(prev => [...prev, role.id]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isSelected && <Check size={14} />}
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                  {mediaRoles.length === 0 && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-2">Brak zdefiniowanych służb. Dodaj je w zakładce "Służby".</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Telefon</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="+48 123 456 789" value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Email</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="jan@example.com" value={memberForm.email} onChange={e => setMemberForm({...memberForm, email: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowMemberModal(false)} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Anuluj</button>
                <button onClick={saveMember} className="px-5 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/50 transition font-medium">Zapisz</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Add Expense */}
      {showExpenseModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl p-6 border border-white/20 dark:border-gray-700 my-8">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Nowy wydatek - {expenseForm.ministry}</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              {/* Wiersz 1: Data i Kwota */}
              <div className="grid grid-cols-2 gap-4">
                <CustomDatePicker
                  label="Data dokumentu"
                  value={expenseForm.payment_date}
                  onChange={(val) => setExpenseForm({...expenseForm, payment_date: val})}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kwota (PLN)</label>
                  <input
                    type="number"
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Wiersz 2: Kontrahent i Osoba odpowiedzialna */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kontrahent</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.contractor}
                    onChange={(e) => setExpenseForm({...expenseForm, contractor: e.target.value})}
                    placeholder="Nazwa firmy/osoby"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Osoba odpowiedzialna</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.responsible_person}
                    onChange={(e) => setExpenseForm({...expenseForm, responsible_person: e.target.value})}
                    placeholder="Imię i nazwisko"
                  />
                </div>
              </div>

              {/* Wiersz 3: Pozycja budżetowa (pełna szerokość) */}
              <div>
                <CustomSelect
                  label="Pozycja budżetowa (opis kosztu)"
                  value={expenseForm.description}
                  onChange={(value) => setExpenseForm({...expenseForm, description: value})}
                  options={[
                    { value: '', label: 'Wybierz pozycję' },
                    ...budgetItems.map(item => ({
                      value: item.description,
                      label: item.description
                    }))
                  ]}
                  placeholder="Wybierz pozycję"
                />
              </div>

              {/* Wiersz 4: Szczegółowy opis (pełna szerokość) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Szczegółowy opis</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={expenseForm.detailed_description}
                  onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
                  placeholder="Dodatkowe informacje o wydatku..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Załączniki (opcjonalnie)</label>
                <div className="space-y-2">
                  <label className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer hover:border-pink-300 dark:hover:border-pink-600 transition flex items-center gap-2">
                    <Upload size={18} className="text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {uploadingFile ? 'Przesyłanie...' : 'Dodaj plik(i)'}
                    </span>
                    <input
                      type="file"
                      onChange={handleExpenseFileUpload}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      disabled={uploadingFile}
                      multiple
                    />
                  </label>
                  {expenseForm.documents && expenseForm.documents.length > 0 && (
                    <div className="space-y-2">
                      {expenseForm.documents.map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                          <span className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1 truncate">
                            <FileText size={14} />
                            {doc.name}
                          </span>
                          <button
                            onClick={() => removeExpenseDocument(idx)}
                            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 ml-2 flex-shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tagi</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Dodaj tag"
                    onKeyPress={(e) => e.key === 'Enter' && addExpenseTag()}
                  />
                  <button
                    onClick={addExpenseTag}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {expenseForm.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 rounded-lg text-xs flex items-center gap-1"
                    >
                      <Tag size={12} />
                      {tag}
                      <button onClick={() => removeExpenseTag(tag)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  Anuluj
                </button>
                <button
                  onClick={saveExpense}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition font-medium"
                >
                  Zapisz
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
