import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  Plus, Search, Trash2, X, FileText, Calendar, Check, UserX,
  ChevronUp, ChevronDown, Users, BookOpen, GraduationCap,
  MapPin, Baby, Upload, UserPlus, Link as LinkIcon, DollarSign, ChevronLeft, ChevronRight, Tag, FolderOpen, Package, UserCheck, Home
} from 'lucide-react';
import FinanceTab from '../shared/FinanceTab';
import EventsTab from '../shared/EventsTab';
import MaterialsTab from '../shared/MaterialsTab';
import EquipmentTab from '../shared/EquipmentTab';
import CheckinTab from './checkin/CheckinTab';
import HouseholdManager from './components/HouseholdManager';
import CustomSelect from '../../components/CustomSelect';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import { useUserRole } from '../../hooks/useUserRole';
import { hasTabAccess } from '../../utils/tabPermissions';

// Hook to calculate dropdown position with smart positioning (up/down)
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
          top: openUpward
            ? rect.top + window.scrollY - 4
            : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
          openUpward
        });
      };

      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, triggerRef]);

  return coords;
}

// Custom Date Picker Component
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

// --- POMOCNICZE KOMPONENTY (BEZ ZMIAN) ---
const TeacherMultiSelect = ({ teachers, selectedIds, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  useEffect(() => { function h(e){if(wrapperRef.current && !wrapperRef.current.contains(e.target))setIsOpen(false);} document.addEventListener("mousedown", h); return ()=>document.removeEventListener("mousedown", h); }, []);
  const toggleTeacher = (id) => { const n = selectedIds.includes(id) ? selectedIds.filter(tid => tid !== id) : [...selectedIds, id]; onChange(n); };
  return (
    <div ref={wrapperRef} className="relative">
      <div onClick={() => setIsOpen(!isOpen)} className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 cursor-pointer min-h-[50px] flex flex-wrap gap-2 hover:border-pink-400 transition">
        {selectedIds.length === 0 && <span className="text-gray-400 dark:text-gray-500 text-sm pt-1">Wybierz nauczycieli...</span>}
        {selectedIds.map(id => { const t = teachers.find(x => x.id === id); return t ? <span key={id} className="bg-pink-50 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-pink-100 dark:border-pink-800">{t.full_name} <X size={12} className="cursor-pointer hover:text-pink-900" onClick={(e) => { e.stopPropagation(); toggleTeacher(id); }}/></span> : null; })}
      </div>
      {isOpen && <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar">{teachers.map(t => <div key={t.id} onClick={() => toggleTeacher(t.id)} className={`p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex justify-between items-center ${selectedIds.includes(t.id) ? 'bg-pink-50 dark:bg-gray-800 text-pink-700 dark:text-pink-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}><span>{t.full_name}</span>{selectedIds.includes(t.id) && <Check size={16}/>}</div>)}</div>}
    </div>
  );
};

const TableMultiSelect = ({ options, value, onChange, absentMembers = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  useEffect(() => { function h(e){if(wrapperRef.current && !wrapperRef.current.contains(e.target))setIsOpen(false);} document.addEventListener("mousedown", h); return ()=>document.removeEventListener("mousedown", h); }, []);
  const t = (n, a) => { if(a)return; const s=selectedItems.includes(n)?selectedItems.filter(i=>i!==n):[...selectedItems,n]; onChange(s.join(', ')); };
  return (
    <div ref={wrapperRef} className="relative w-full h-full">
      <div className="w-full h-full min-h-[36px] px-2 py-1.5 text-xs cursor-pointer flex flex-wrap gap-1 items-center hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition" onClick={()=>setIsOpen(!isOpen)}>
        {selectedItems.length===0 ? <span className="text-gray-400 dark:text-gray-500 text-[10px] italic">Wybierz...</span> : selectedItems.map((i,x)=><span key={x} className="bg-pink-50 dark:bg-pink-900/60 text-pink-700 dark:text-pink-200 px-1.5 py-0.5 rounded text-[10px] border border-pink-100 dark:border-pink-800 whitespace-nowrap">{i}</span>)}
      </div>
      {isOpen && <div className="absolute z-[9999] left-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar">{options.map(p=><div key={p.id} className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between transition ${absentMembers.includes(p.full_name)?'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed':'hover:bg-pink-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'} ${selectedItems.includes(p.full_name)?'bg-pink-50 dark:bg-gray-800 text-pink-700 dark:text-pink-300 font-medium':''}`} onClick={()=>t(p.full_name, absentMembers.includes(p.full_name))}><span className={absentMembers.includes(p.full_name)?'line-through':''}>{p.full_name}</span>{selectedItems.includes(p.full_name)&&!absentMembers.includes(p.full_name)&&<Check size={12}/>}</div>)}</div>}
    </div>
  );
};

const AbsenceMultiSelect = ({ options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  useEffect(() => { function h(e){if(wrapperRef.current && !wrapperRef.current.contains(e.target))setIsOpen(false);} document.addEventListener("mousedown", h); return ()=>document.removeEventListener("mousedown", h); }, []);
  const t = (n) => { const s=selectedItems.includes(n)?selectedItems.filter(i=>i!==n):[...selectedItems,n]; onChange(s.join(', ')); };
  return (
    <div ref={wrapperRef} className="relative w-full h-full">
      <div className="w-full h-full min-h-[36px] px-2 py-1.5 text-xs cursor-pointer flex flex-wrap gap-1 items-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition" onClick={()=>setIsOpen(!isOpen)}>
        {selectedItems.length===0 ? <span className="text-gray-400 dark:text-gray-500 text-[10px] italic">Wybierz...</span> : selectedItems.map((i,x)=><span key={x} className="bg-red-50 dark:bg-red-900/60 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded text-[10px] border border-red-100 dark:border-red-800 whitespace-nowrap flex items-center gap-1">{i}</span>)}
      </div>
      {isOpen && <div className="absolute z-[9999] left-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar">{options.map(p=><div key={p.id} className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-900/30 transition ${selectedItems.includes(p.full_name)?'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium':'text-gray-700 dark:text-gray-300'}`} onClick={()=>t(p.full_name)}><span>{p.full_name}</span>{selectedItems.includes(p.full_name)&&<UserX size={12}/>}</div>)}</div>}
    </div>
  );
};

// --- TABELA GRAFIKU ---
const ScheduleTable = ({ programs, teachers, groups, onUpdateProgram }) => {
  const [expandedMonths, setExpandedMonths] = useState({});
  const groupedPrograms = programs.reduce((acc, prog) => { if (!prog.date) return acc; const d = new Date(prog.date); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; if (!acc[k]) acc[k] = []; acc[k].push(prog); return acc; }, {});
  const sortedMonths = Object.keys(groupedPrograms).sort().reverse();
  useEffect(() => { setExpandedMonths(prev => ({ ...prev, [new Date().toISOString().slice(0, 7)]: true })); }, []);
  const dynamicColumns = groups.map(g => ({ id: g.id, label: g.name }));
  const updateRole = async (pid, gid, val) => { const p = programs.find(x => x.id === pid); if(!p) return; const u = { ...p.szkolka, [gid]: val }; await onUpdateProgram(pid, { szkolka: u }); };
  const updateField = async (pid, f, val) => { const p = programs.find(x => x.id === pid); if(!p) return; const u = { ...p.szkolka, [f]: val }; await onUpdateProgram(pid, { szkolka: u }); };

  return (
    <div className="space-y-6">
      {sortedMonths.map(monthKey => {
        const isExpanded = expandedMonths[monthKey];
        return (
          <div key={monthKey} className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden transition-all duration-300 ${isExpanded ? 'mb-8' : 'mb-0'}`}>
            <button onClick={() => setExpandedMonths(p => ({...p, [monthKey]: !p[monthKey]}))} className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 flex justify-between items-center transition border-b border-gray-200 dark:border-gray-700">
              <span className="font-bold text-gray-800 dark:text-gray-100 text-sm uppercase tracking-wider">{new Date(monthKey).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
              {isExpanded ? <ChevronUp size={18} className="text-gray-500 dark:text-gray-400"/> : <ChevronDown size={18} className="text-gray-500 dark:text-gray-400"/>}
            </button>
            {isExpanded && (
              <div className="overflow-x-auto bg-white dark:bg-gray-900 p-0">
                <table className="w-full text-left border-collapse min-w-max">
                  {/* USUNIĘTO STYLE BACKGROUND BLACK - TERAZ JEST CZYSTA KLASA */}
                  <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="p-4 font-semibold w-24 min-w-[90px]">Data</th>
                      <th className="p-4 font-semibold min-w-[150px] text-pink-600 dark:text-pink-400">Temat lekcji</th>
                      {dynamicColumns.map(c => <th key={c.id} className="p-4 font-semibold min-w-[130px]">{c.label}</th>)}
                      <th className="p-4 font-semibold min-w-[130px] text-red-500 dark:text-red-400">Absencja</th>
                      <th className="p-4 font-semibold min-w-[150px]">Notatki</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-200 dark:divide-gray-800">
                    {groupedPrograms[monthKey].sort((a, b) => new Date(a.date) - new Date(b.date)).map(prog => {
                      const abs = prog.szkolka?.absencja ? prog.szkolka.absencja.split(',').map(s=>s.trim()).filter(Boolean) : [];
                      return (
                        <tr key={prog.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                          <td className="p-4 font-medium text-gray-700 dark:text-gray-300 font-mono text-xs border-r border-gray-100 dark:border-gray-800">{new Date(prog.date).toLocaleDateString('pl-PL', {day:'2-digit', month:'2-digit', year:'numeric'})}</td>
                          <td className="p-2 border-r border-gray-100 dark:border-gray-800"><input className="w-full bg-transparent rounded px-2 py-1.5 text-xs outline-none font-semibold text-pink-700 dark:text-pink-300 placeholder-pink-200 dark:placeholder-gray-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 focus:bg-pink-50 dark:focus:bg-pink-900/20 transition" placeholder="Temat..." defaultValue={prog.szkolka?.temat || ''} onBlur={e => updateField(prog.id, 'temat', e.target.value)} /></td>
                          {dynamicColumns.map(c => (<td key={c.id} className="p-2 border-r border-gray-100 dark:border-gray-800 relative"><TableMultiSelect options={teachers} value={prog.szkolka?.[c.id] || ''} onChange={v => updateRole(prog.id, c.id, v)} absentMembers={abs} /></td>))}
                          <td className="p-2 border-r border-gray-100 dark:border-gray-800 relative"><AbsenceMultiSelect options={teachers} value={prog.szkolka?.absencja || ''} onChange={v => updateField(prog.id, 'absencja', v)} /></td>
                          <td className="p-2"><input className="w-full bg-transparent rounded px-2 py-1.5 text-xs outline-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 focus:bg-gray-50 dark:focus:bg-gray-800 transition" placeholder="Notatki..." defaultValue={prog.szkolka?.notatki || ''} onBlur={e => updateField(prog.id, 'notatki', e.target.value)} /></td>
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

// --- GŁÓWNY MODUŁ ---

export default function KidsModule() {
  const { userRole } = useUserRole();
  const [activeTab, setActiveTab] = useState('schedule');
  const [teachers, setTeachers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState({ email: '', name: '' });
  const [uploading, setUploading] = useState(false);
  const [studentFilter, setStudentFilter] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showGroupStudentsModal, setShowGroupStudentsModal] = useState(false);
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [showGlobalStudentModal, setShowGlobalStudentModal] = useState(false);
  const [teacherForm, setTeacherForm] = useState({ id: null, full_name: '', role: 'Nauczyciel', email: '', phone: '' });
  const [groupForm, setGroupForm] = useState({ id: null, name: '', teacher_ids: [], room: '', age_range: '' });
  const [globalStudentForm, setGlobalStudentForm] = useState({ id: null, full_name: '', birth_year: '', parent_info: '', notes: '', group_id: null, household_id: null });
  const [households, setHouseholds] = useState([]);
  const [materialForm, setMaterialForm] = useState({ title: '', type: 'Lekcja', attachment: null });
  const [currentGroup, setCurrentGroup] = useState(null);
  const [attachStudentId, setAddStudentId] = useState('');

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
    category: 'małe schWro',
    description: '',
    detailed_description: '',
    responsible_person: '',
    documents: [],
    tags: [],
    ministry: 'małe schWro'
  });

  useEffect(() => {
    fetchData();
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUser({ email: user.email, name: user.user_metadata?.full_name || user.email });
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (activeTab === 'finances') {
      fetchFinanceData();
    }
  }, [activeTab]);

  const fetchFinanceData = async () => {
    const currentYear = new Date().getFullYear();
    const ministryName = 'małe schWro';

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

  const handleFileUpload = async (e) => {
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

  const removeDocument = (index) => {
    setExpenseForm({
      ...expenseForm,
      documents: expenseForm.documents.filter((_, i) => i !== index)
    });
  };

  const addTag = () => {
    if (newTag.trim() && !expenseForm.tags.includes(newTag.trim())) {
      setExpenseForm({ ...expenseForm, tags: [...expenseForm.tags, newTag.trim()] });
      setNewTag('');
    }
  };

  const removeTag = (tag) => {
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
    try {
      const { data: t } = await supabase.from('kids_teachers').select('*').order('full_name');
      const { data: g } = await supabase.from('kids_groups').select('*').order('created_at');
      const { data: s } = await supabase.from('kids_students').select('*').order('full_name');
      const { data: p } = await supabase.from('programs').select('*').order('date', { ascending: false });
      const { data: h } = await supabase.from('households').select('*').order('family_name');
      setTeachers(t || []); setGroups(g || []); setStudents(s || []); setPrograms(p || []); setHouseholds(h || []);
    } catch (err) { console.error('Błąd:', err); }
    setLoading(false);
  }

  const saveTeacher = async () => {
    if (!teacherForm.full_name) return alert('Podaj imię');
    try {
      if (teacherForm.id) {
        const { error } = await supabase.from('kids_teachers').update({
          full_name: teacherForm.full_name,
          role: teacherForm.role,
          email: teacherForm.email,
          phone: teacherForm.phone
        }).eq('id', teacherForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('kids_teachers').insert([{
          full_name: teacherForm.full_name,
          role: teacherForm.role || 'Nauczyciel',
          email: teacherForm.email,
          phone: teacherForm.phone
        }]);
        if (error) throw error;
      }
      setShowTeacherModal(false);
      fetchData();
    } catch (err) {
      console.error('Błąd zapisywania nauczyciela:', err);
      alert('Błąd zapisywania: ' + err.message);
    }
  };
  const deleteTeacher = async (id) => { if (confirm('Usunąć?')) { await supabase.from('kids_teachers').delete().eq('id', id); fetchData(); } };
  const saveGroup = async () => { if (!groupForm.name) return alert('Podaj nazwę'); const payload = { name: groupForm.name, room: groupForm.room, age_range: groupForm.age_range, teacher_ids: groupForm.teacher_ids }; try { if (groupForm.id) await supabase.from('kids_groups').update(payload).eq('id', groupForm.id); else await supabase.from('kids_groups').insert([{ ...payload, materials: [] }]); setShowGroupModal(false); fetchData(); } catch (err) { alert(err.message); } };
  const deleteGroup = async (id) => { if (confirm('Usunąć?')) { await supabase.from('kids_groups').delete().eq('id', id); fetchData(); } };
  const saveGlobalStudent = async () => { if (!globalStudentForm.full_name) return alert('Podaj imię'); const payload = { full_name: globalStudentForm.full_name, birth_year: globalStudentForm.birth_year, parent_info: globalStudentForm.parent_info, notes: globalStudentForm.notes, group_id: globalStudentForm.group_id ? parseInt(globalStudentForm.group_id) : null, household_id: globalStudentForm.household_id || null }; try { if (globalStudentForm.id) await supabase.from('kids_students').update(payload).eq('id', globalStudentForm.id); else await supabase.from('kids_students').insert([payload]); setShowGlobalStudentModal(false); fetchData(); } catch (err) { alert(err.message); } };
  const deleteStudent = async (id) => { if(confirm('Usunąć?')) { await supabase.from('kids_students').delete().eq('id', id); fetchData(); } };
  const openEditStudent = (s) => { setGlobalStudentForm({ id: s.id, full_name: s.full_name, birth_year: s.birth_year, parent_info: s.parent_info, notes: s.notes, group_id: s.group_id, household_id: s.household_id }); setShowGlobalStudentModal(true); };
  const attachStudentToGroup = async () => { if (!attachStudentId) return alert('Wybierz ucznia'); await supabase.from('kids_students').update({ group_id: currentGroup.id }).eq('id', attachStudentId); setAddStudentId(''); fetchData(); };
  const detachStudentFromGroup = async (studentId) => { await supabase.from('kids_students').update({ group_id: null }).eq('id', studentId); fetchData(); };
  const handleMaterialFileUpload = async (file) => { if (!file) return null; const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${file.name.split('.').pop()}`; const { error } = await supabase.storage.from('kids-materials').upload(fileName, file); if (error) throw error; const { data } = supabase.storage.from('kids-materials').getPublicUrl(fileName); return { url: data.publicUrl, name: file.name }; };
  const addMaterial = async () => { if (!materialForm.title) return alert('Podaj nazwę'); setUploading(true); try { let attachmentData = null; if (materialForm.attachment) attachmentData = await handleMaterialFileUpload(materialForm.attachment); const newMaterial = { id: Date.now(), title: materialForm.title, type: materialForm.type, date: new Date().toISOString(), attachmentUrl: attachmentData?.url || null, attachmentName: attachmentData?.name || null }; const updatedMaterials = [...(currentGroup.materials || []), newMaterial]; await supabase.from('kids_groups').update({ materials: updatedMaterials }).eq('id', currentGroup.id); setMaterialForm({ title: '', type: 'Lekcja', attachment: null }); fetchData(); } catch (err) { alert(err.message); } finally { setUploading(false); } };
  const deleteMaterial = async (mid) => { if(!confirm('Usunąć?')) return; const um = currentGroup.materials.filter(m => m.id !== mid); await supabase.from('kids_groups').update({ materials: um }).eq('id', currentGroup.id); fetchData(); };
  const handleProgramUpdate = async (id, updates) => { setPrograms(prev => prev.map(p => p.id === id ? { ...p, ...updates, szkolka: { ...p.szkolka, ...updates.szkolka } } : p)); await supabase.from('programs').update(updates).eq('id', id); };
  const filteredStudents = students.filter(s => s.full_name.toLowerCase().includes(studentFilter.toLowerCase()));
  const groupStudents = currentGroup ? students.filter(s => s.group_id === currentGroup.id) : [];
  const availableStudents = students.filter(s => s.group_id !== (currentGroup?.id || -1));
  const groupOptions = groups.map(g => ({ value: g.id, label: g.name }));
  const householdOptions = households.map(h => ({ value: h.id, label: `${h.family_name}${h.phone_last_four ? ` (tel. ...${h.phone_last_four})` : ''}` }));
  const availableStudentOptions = availableStudents.map(s => ({ value: s.id, label: s.full_name }));
  const materialTypeOptions = ['Lekcja', 'Kolorowanka', 'Gra', 'Film', 'Książka', 'Inne'].map(t => ({ value: t, label: t }));

  if (loading) return <div className="p-10 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div></div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Małe SchWro</h1>
      </div>

      {/* TABS */}
      <ResponsiveTabs
        tabs={[
          { id: 'checkin', label: 'Check-in', icon: UserCheck },
          { id: 'events', label: 'Wydarzenia', icon: Calendar },
          { id: 'schedule', label: 'Grafik', icon: Calendar },
          { id: 'groups', label: 'Grupy', icon: Users },
          ...(hasTabAccess('kids', 'teachers', userRole) ? [{ id: 'teachers', label: 'Nauczyciele', icon: GraduationCap }] : []),
          { id: 'students', label: 'Uczniowie', icon: Baby },
          { id: 'households', label: 'Rodziny', icon: Home },
          ...(hasTabAccess('kids', 'finances', userRole) ? [{ id: 'finances', label: 'Finanse', icon: DollarSign }] : []),
          ...(hasTabAccess('kids', 'equipment', userRole) ? [{ id: 'equipment', label: 'Wyposażenie', icon: Package }] : []),
          { id: 'files', label: 'Pliki', icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* CHECK-IN TAB */}
      {activeTab === 'checkin' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors" style={{ minHeight: '600px' }}>
          <CheckinTab />
        </section>
      )}

      {/* WYDARZENIA TAB */}
      {activeTab === 'events' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <EventsTab ministry="kids" currentUserEmail={currentUser.email} />
        </section>
      )}

      {/* GRAFIK TAB */}
      {activeTab === 'schedule' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Grafik Nauczycieli</h2></div>
          <ScheduleTable programs={programs} teachers={teachers} groups={groups} onUpdateProgram={handleProgramUpdate} />
        </section>
      )}

      {/* GRUPY TAB */}
      {activeTab === 'groups' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Grupy Wiekowe</h2>
          <button onClick={() => { setGroupForm({ id: null, name: '', teacher_ids: [], room: '', age_range: '' }); setShowGroupModal(true); }} className="bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> Dodaj grupę</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map(group => {
            const teacherNames = (group.teacher_ids || []).map(tid => teachers.find(t => t.id === tid)?.full_name).filter(Boolean).join(', ');
            const studentCount = students.filter(s => s.group_id === group.id).length;
            return (
              <div key={group.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 hover:shadow-lg transition">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{group.name}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => { setGroupForm(group); setShowGroupModal(true); }} className="p-1.5 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-gray-800 rounded-lg"><FileText size={16}/></button>
                    <button onClick={() => deleteGroup(group.id)} className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-800 rounded-lg"><Trash2 size={16}/></button>
                  </div>
                </div>
                <div className="space-y-2 mb-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="flex items-center gap-2"><GraduationCap size={16} className="text-pink-500"/> <span className="font-medium">Nauczyciele:</span> {teacherNames || 'Brak'}</div>
                  <div className="flex items-center gap-2"><MapPin size={16} className="text-orange-500"/> <span className="font-medium">Sala:</span> {group.room || '-'}</div>
                  <div className="flex items-center gap-2"><Baby size={16} className="text-green-500"/> <span className="font-medium">Wiek:</span> {group.age_range || '-'}</div>
                </div>
                <div className="flex gap-2 border-t border-gray-100 dark:border-gray-700 pt-3 mt-2">
                  <button onClick={() => { setCurrentGroup(group); setShowGroupStudentsModal(true); }} className="flex-1 bg-pink-50 dark:bg-gray-800 text-pink-700 dark:text-pink-300 text-xs font-bold py-2 rounded-xl hover:bg-pink-100 dark:hover:bg-gray-700 transition flex items-center justify-center gap-1"><Users size={14}/> Uczniowie ({studentCount})</button>
                  <button onClick={() => { setCurrentGroup(group); setShowMaterialsModal(true); }} className="flex-1 bg-orange-50 dark:bg-gray-800 text-orange-700 dark:text-orange-300 text-xs font-bold py-2 rounded-xl hover:bg-orange-100 dark:hover:bg-gray-700 transition flex items-center justify-center gap-1"><BookOpen size={14}/> Materiały ({group.materials?.length || 0})</button>
                </div>
              </div>
            );
          })}
        </div>
        </section>
      )}

      {/* NAUCZYCIELE TAB */}
      {activeTab === 'teachers' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Nauczyciele ({teachers.length})</h2>
            <button onClick={() => { setTeacherForm({ id: null, full_name: '', role: 'Nauczyciel', email: '', phone: '' }); setShowTeacherModal(true); }} className="bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> Dodaj nauczyciela</button>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[600px]">
              {/* USUNIĘTO STYLE BACKGROUND BLACK - TERAZ JEST CZYSTA KLASA */}
              <thead className="text-gray-700 dark:text-gray-400 font-bold border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <tr><th className="p-4">Imię i nazwisko</th><th className="p-4">Rola</th><th className="p-4">Email</th><th className="p-4 text-right">Akcje</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {teachers.map(t => (
                  <tr key={t.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                    <td className="p-4 font-medium text-gray-800 dark:text-gray-200">{t.full_name}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{t.role}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{t.email}</td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button onClick={() => { setTeacherForm(t); setShowTeacherModal(true); }} className="text-pink-600 dark:text-pink-400 font-medium">Edytuj</button>
                      <button onClick={() => deleteTeacher(t.id)} className="text-red-500 dark:text-red-400 font-medium">Usuń</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* UCZNIOWIE TAB */}
      {activeTab === 'students' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Wszyscy Uczniowie ({filteredStudents.length})</h2>
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 w-64">
              <Search size={16} className="text-gray-400 dark:text-gray-500"/>
              <input className="bg-transparent text-sm outline-none w-full text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Szukaj ucznia..." value={studentFilter} onChange={e => setStudentFilter(e.target.value)}/>
            </div>
            <button onClick={() => { setGlobalStudentForm({ id: null, full_name: '', birth_year: '', parent_info: '', notes: '', group_id: null, household_id: null }); setShowGlobalStudentModal(true); }} className="bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm px-4 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><UserPlus size={18}/> Nowy uczeń</button>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[700px]">
             {/* USUNIĘTO STYLE BACKGROUND BLACK - TERAZ JEST CZYSTA KLASA */}
            <thead className="text-gray-700 dark:text-gray-400 font-bold border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <tr><th className="p-4">Imię i nazwisko</th><th className="p-4">Wiek/Rocznik</th><th className="p-4">Rodzina</th><th className="p-4">Grupa</th><th className="p-4 text-right">Akcje</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {filteredStudents.map((s) => {
                const household = households.find(h => h.id === s.household_id);
                return (
                <tr key={s.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                  <td className="p-4 font-medium text-gray-800 dark:text-gray-200">{s.full_name}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{s.birth_year || '-'}</td>
                  <td className="p-4">
                    {household ? (
                      <span className="px-2 py-1 rounded-lg text-xs font-bold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                        {household.family_name}
                        {household.phone_last_four && <span className="text-blue-500 dark:text-blue-400 ml-1">(...{household.phone_last_four})</span>}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="p-4"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${s.group_id ? 'bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>{groups.find(g => g.id === s.group_id)?.name || '-'}</span></td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    <button onClick={() => openEditStudent(s)} className="text-pink-600 dark:text-pink-400 font-medium hover:underline">Edytuj</button>
                    <button onClick={() => deleteStudent(s.id)} className="text-red-500 dark:text-red-400 font-medium hover:underline">Usuń</button>
                  </td>
                </tr>
              );})}
              {filteredStudents.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-gray-400 dark:text-gray-500">Brak uczniów</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
        </section>
      )}

      {/* HOUSEHOLDS (FAMILIES) TAB */}
      {activeTab === 'households' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <HouseholdManager />
        </section>
      )}

      {/* FINANCES TAB */}
      {activeTab === 'finances' && (
        <FinanceTab
          ministry="małe schWro"
          budgetItems={budgetItems}
          expenses={expenses}
          onAddExpense={() => setShowExpenseModal(true)}
          onRefresh={fetchFinanceData}
        />
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <MaterialsTab moduleKey="kids" canEdit={true} />
        </section>
      )}

      {/* EQUIPMENT TAB */}
      {activeTab === 'equipment' && (
        <EquipmentTab
          ministryKey="kids"
          currentUserEmail={currentUser.email}
          canEdit={hasTabAccess('kids', 'equipment', userRole)}
        />
      )}

      {/* MODALE - BEZ ZMIAN */}
      {showGroupModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6"><h3 className="font-bold text-xl text-gray-800 dark:text-white">Grupa Wiekowa</h3><button onClick={() => setShowGroupModal(false)} className="text-gray-500 dark:text-gray-400"><X/></button></div>
            <div className="space-y-4">
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Nazwa grupy" value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} />
              <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nauczyciele</label><TeacherMultiSelect teachers={teachers} selectedIds={groupForm.teacher_ids || []} onChange={ids => setGroupForm({...groupForm, teacher_ids: ids})} /></div>
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Numer sali" value={groupForm.room} onChange={e => setGroupForm({...groupForm, room: e.target.value})} />
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Przedział wiekowy" value={groupForm.age_range} onChange={e => setGroupForm({...groupForm, age_range: e.target.value})} />
              <button onClick={saveGroup} className="w-full py-3 bg-pink-600 text-white rounded-xl font-bold mt-4">Zapisz</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showGlobalStudentModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6"><h3 className="font-bold text-xl text-gray-800 dark:text-white">Uczeń</h3><button onClick={() => setShowGlobalStudentModal(false)} className="text-gray-500 dark:text-gray-400"><X/></button></div>
            <div className="space-y-4">
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Imię i nazwisko" value={globalStudentForm.full_name} onChange={e => setGlobalStudentForm({...globalStudentForm, full_name: e.target.value})} />
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Rocznik" value={globalStudentForm.birth_year} onChange={e => setGlobalStudentForm({...globalStudentForm, birth_year: e.target.value})} />
              <CustomSelect options={householdOptions} value={globalStudentForm.household_id} onChange={v => setGlobalStudentForm({...globalStudentForm, household_id: v})} placeholder="Przypisz do rodziny..." icon={Home} label="Rodzina" />
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Kontakt do rodzica (opcjonalnie)" value={globalStudentForm.parent_info} onChange={e => setGlobalStudentForm({...globalStudentForm, parent_info: e.target.value})} />
              <CustomSelect options={groupOptions} value={globalStudentForm.group_id} onChange={v => setGlobalStudentForm({...globalStudentForm, group_id: v})} placeholder="Przypisz do grupy..." icon={Users} />
              <textarea className="w-full p-3 rounded-xl border resize-none dark:bg-gray-900 dark:border-gray-600 dark:text-white" rows={3} placeholder="Uwagi" value={globalStudentForm.notes} onChange={e => setGlobalStudentForm({...globalStudentForm, notes: e.target.value})} />
              <button onClick={saveGlobalStudent} className="w-full py-3 bg-pink-600 text-white rounded-xl font-bold mt-2">Zapisz</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showTeacherModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6"><h3 className="font-bold text-xl text-gray-800 dark:text-white">Nauczyciel</h3><button onClick={() => setShowTeacherModal(false)} className="text-gray-500 dark:text-gray-400"><X/></button></div>
            <div className="space-y-4">
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Imię i nazwisko" value={teacherForm.full_name} onChange={e => setTeacherForm({...teacherForm, full_name: e.target.value})} />
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Rola" value={teacherForm.role} onChange={e => setTeacherForm({...teacherForm, role: e.target.value})} />
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Telefon" value={teacherForm.phone} onChange={e => setTeacherForm({...teacherForm, phone: e.target.value})} />
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Email" value={teacherForm.email} onChange={e => setTeacherForm({...teacherForm, email: e.target.value})} />
              <button onClick={saveTeacher} className="w-full py-3 bg-pink-600 text-white rounded-xl font-bold mt-4">Zapisz</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showGroupStudentsModal && currentGroup && document.body && createPortal(
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-3xl p-6 border border-white/20 dark:border-gray-700 flex flex-col max-h-[80vh]">
            <div className="flex justify-between mb-4 pb-4 border-b dark:border-gray-700"><h3 className="font-bold text-xl text-gray-800 dark:text-white">Uczniowie: {currentGroup.name}</h3><button onClick={() => setShowGroupStudentsModal(false)} className="text-gray-500 dark:text-gray-400"><X/></button></div>
            <div className="bg-pink-50 dark:bg-gray-800 p-4 rounded-xl mb-4 flex gap-3 items-end">
              <div className="flex-1"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Dodaj ucznia</label><CustomSelect options={availableStudentOptions} value={attachStudentId} onChange={setAddStudentId} placeholder="Wybierz..." icon={UserPlus} /></div>
              <button onClick={attachStudentToGroup} className="bg-pink-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-pink-700 h-[46px]">Dodaj</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"><tr><th className="p-3">Imię</th><th className="p-3">Wiek</th><th className="p-3">Kontakt</th><th className="p-3">Akcja</th></tr></thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {groupStudents.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200">
                      <td className="p-3 font-medium">{s.full_name}</td><td className="p-3">{s.birth_year}</td><td className="p-3">{s.parent_info}</td>
                      <td className="p-3"><button onClick={() => detachStudentFromGroup(s.id)} className="text-red-500 dark:text-red-400 hover:underline text-xs uppercase font-bold">Odłącz</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showMaterialsModal && currentGroup && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl p-6 border border-white/20 dark:border-gray-700 flex flex-col max-h-[80vh]">
            <div className="flex justify-between mb-4 pb-4 border-b dark:border-gray-700"><h3 className="font-bold text-xl text-gray-800 dark:text-white">Materiały</h3><button onClick={() => setShowMaterialsModal(false)} className="text-gray-500 dark:text-gray-400"><X/></button></div>
            <div className="bg-orange-50 dark:bg-gray-800 p-4 rounded-xl mb-4 space-y-2">
              <input className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white" placeholder="Nazwa" value={materialForm.title} onChange={e => setMaterialForm({...materialForm, title: e.target.value})} />
              <div className="flex gap-2 items-center">
                <div className="flex-1"><CustomSelect options={materialTypeOptions} value={materialForm.type} onChange={val => setMaterialForm({...materialForm, type: val})} icon={BookOpen}/></div>
                <input type="file" id="file-upload" className="hidden" onChange={e => setMaterialForm({...materialForm, attachment: e.target.files[0]})} />
                <button onClick={() => document.getElementById('file-upload').click()} className={`border px-4 rounded-xl flex items-center gap-2 h-[46px] transition ${materialForm.attachment ? 'bg-orange-100 border-orange-300 text-orange-700' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-500 text-gray-600 dark:text-gray-300'}`}><Upload size={16}/> {materialForm.attachment ? 'Plik wybrany' : 'Plik'}</button>
                <button onClick={addMaterial} disabled={uploading} className="bg-orange-600 text-white px-6 rounded-xl font-bold hover:bg-orange-700 h-[46px]">{uploading ? '...' : 'Dodaj'}</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {(currentGroup.materials || []).map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl">
                  <div className="flex items-center gap-3"><div className="bg-orange-100 dark:bg-orange-900/40 p-2 rounded-lg text-orange-600 dark:text-orange-300"><BookOpen size={18}/></div><div><div className="font-bold text-gray-800 dark:text-gray-200">{m.title}</div><div className="text-xs text-gray-500 dark:text-gray-400">{m.type}</div></div></div>
                  <div className="flex gap-2">{m.attachmentUrl && <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="text-orange-600 hover:bg-orange-50 p-2 rounded-lg"><LinkIcon size={18}/></a>}<button onClick={() => deleteMaterial(m.id)} className="text-red-400 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18}/></button></div>
                </div>
              ))}
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
                      onChange={handleFileUpload}
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
                            onClick={() => removeDocument(idx)}
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
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                  />
                  <button
                    onClick={addTag}
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
                      <button onClick={() => removeTag(tag)}>
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
