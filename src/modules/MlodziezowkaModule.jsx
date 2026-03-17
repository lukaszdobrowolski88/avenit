import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Trash2, X, FileText, Calendar, Download,
  AlertCircle, Paperclip, User, Users,
  LayoutGrid, List, CheckSquare, MessageSquare, Send,
  Check, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, DollarSign, Tag, Upload,
  MapPin, Clock, Star, Heart, Package
} from 'lucide-react';
import FinanceTab from './shared/FinanceTab';
import EquipmentTab from './shared/EquipmentTab';
import RolesTab from '../components/RolesTab';
import CustomSelect from '../components/CustomSelect';
import ResponsiveTabs from '../components/ResponsiveTabs';
import { useUserRole } from '../hooks/useUserRole';
import { hasTabAccess } from '../utils/tabPermissions';

const STATUSES = ['Do zrobienia', 'W trakcie', 'Gotowe'];

// --- WSPÓLNE FUNKCJE UI (PORTALE) ---

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
            ? 'border-pink-500 ring-2 ring-pink-500/20 dark:border-orange-400'
            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-orange-300 dark:hover:border-pink-600'
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
                        ? 'bg-pink-50 dark:bg-orange-900/20 text-pink-600 dark:text-orange-400 border border-pink-100 dark:border-pink-800'
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

export default function MlodziezowkaModule() {
  const { userRole } = useUserRole();
  const [activeTab, setActiveTab] = useState('events');
  const [members, setMembers] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  const [viewMode, setViewMode] = useState('kanban');
  const [filterScope, setFilterScope] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showLeaderModal, setShowLeaderModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);

  const [memberForm, setMemberForm] = useState({ id: null, full_name: '', email: '', phone: '', birth_date: '', notes: '' });
  const [leaderForm, setLeaderForm] = useState({ id: null, full_name: '', email: '', phone: '', role: '' });
  const [taskForm, setTaskForm] = useState({
    id: null,
    title: '',
    description: '',
    due_date: '',
    assigned_to: null,
    status: 'Do zrobienia',
    attachment: null
  });
  const [eventForm, setEventForm] = useState({
    id: null,
    title: '',
    description: '',
    start_date: '',
    event_time: '',
    location: '',
    max_participants: '',
    event_type: 'spotkanie'
  });

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

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
    category: 'Mlodziezowka',
    description: '',
    detailed_description: '',
    responsible_person: '',
    documents: [],
    tags: [],
    ministry: 'Mlodziezowka'
  });

  useEffect(() => {
    fetchData();
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (activeTab === 'finances') {
      fetchFinanceData();
    }
  }, [activeTab]);

  async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      setCurrentUserEmail(data.user.email);
    }
  }

  const fetchFinanceData = async () => {
    const currentYear = new Date().getFullYear();
    const ministryName = 'Mlodziezowka';

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

  async function fetchData() {
    setLoading(true);
    setError(null);

    try {
      const [membersResult, leadersResult, tasksResult, eventsResult] = await Promise.all([
        supabase.from('mlodziezowka_members').select('*').order('full_name'),
        supabase.from('mlodziezowka_leaders').select('*').order('full_name'),
        supabase.from('mlodziezowka_tasks').select('*').order('due_date'),
        supabase.from('mlodziezowka_events').select('*').order('start_date', { ascending: false })
      ]);

      if (membersResult.error) throw new Error(`Błąd członków: ${membersResult.error.message}`);
      if (leadersResult.error) throw new Error(`Błąd liderów: ${leadersResult.error.message}`);
      if (tasksResult.error) throw new Error(`Błąd zadań: ${tasksResult.error.message}`);
      if (eventsResult.error) throw new Error(`Błąd wydarzeń: ${eventsResult.error.message}`);

      setMembers(membersResult.data || []);
      setLeaders(leadersResult.data || []);
      setTasks(tasksResult.data || []);
      setEvents(eventsResult.data || []);
    } catch (err) {
      console.error('Błąd pobierania danych:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fetchComments = async (taskId) => {
    if (!taskId) return;
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from('mlodziezowka_task_comments')
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
      const authorProfile = leaders.find(m => m.email === currentUserEmail);
      const authorName = authorProfile ? authorProfile.full_name : (currentUserEmail || 'Nieznany');

      const commentData = {
        task_id: taskForm.id,
        content: newComment.trim(),
        author_email: currentUserEmail,
        author_name: authorName
      };

      const { error } = await supabase
        .from('mlodziezowka_task_comments')
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
        const myProfile = leaders.find(m => m.email === currentUserEmail);
        if (!myProfile || task.assigned_to !== myProfile.id) {
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
        .from('mlodziezowka_tasks')
        .update({ status: newStatus })
        .eq('id', task.id);
      if (error) throw error;
    } catch (err) {
      console.error('Błąd zmiany statusu:', err);
      fetchData();
    }
  };

  // Members
  const saveMember = async () => {
    try {
      if (!memberForm.full_name.trim()) {
        alert('Imię i nazwisko jest wymagane');
        return;
      }

      if (memberForm.id) {
        const { error } = await supabase.from('mlodziezowka_members').update({
          full_name: memberForm.full_name,
          email: memberForm.email,
          phone: memberForm.phone,
          birth_date: memberForm.birth_date || null,
          notes: memberForm.notes
        }).eq('id', memberForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mlodziezowka_members').insert([{
          full_name: memberForm.full_name,
          email: memberForm.email,
          phone: memberForm.phone,
          birth_date: memberForm.birth_date || null,
          notes: memberForm.notes,
          created_by: currentUserEmail
        }]);
        if (error) throw error;
      }

      setShowMemberModal(false);
      await fetchData();
    } catch (err) {
      console.error('Błąd zapisywania członka:', err);
      alert('Błąd: ' + err.message);
    }
  };

  const deleteMember = async (id) => {
    if (confirm('Usunąć członka?')) {
      try {
        const { error } = await supabase.from('mlodziezowka_members').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (err) {
        console.error('Błąd usuwania członka:', err);
        alert('Błąd: ' + err.message);
      }
    }
  };

  // Leaders
  const saveLeader = async () => {
    try {
      if (!leaderForm.full_name.trim()) {
        alert('Imię i nazwisko jest wymagane');
        return;
      }

      if (leaderForm.id) {
        const { error } = await supabase.from('mlodziezowka_leaders').update({
          full_name: leaderForm.full_name,
          email: leaderForm.email,
          phone: leaderForm.phone,
          role: leaderForm.role
        }).eq('id', leaderForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mlodziezowka_leaders').insert([{
          full_name: leaderForm.full_name,
          email: leaderForm.email,
          phone: leaderForm.phone,
          role: leaderForm.role,
          created_by: currentUserEmail
        }]);
        if (error) throw error;
      }

      setShowLeaderModal(false);
      await fetchData();
    } catch (err) {
      console.error('Błąd zapisywania lidera:', err);
      alert('Błąd: ' + err.message);
    }
  };

  const deleteLeader = async (id) => {
    if (confirm('Usunąć lidera?')) {
      try {
        const { error } = await supabase.from('mlodziezowka_leaders').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (err) {
        console.error('Błąd usuwania lidera:', err);
        alert('Błąd: ' + err.message);
      }
    }
  };

  // Tasks
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

      if (taskForm.id) {
        const { error } = await supabase.from('mlodziezowka_tasks').update(taskData).eq('id', taskForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mlodziezowka_tasks').insert([{ ...taskData, created_by: currentUserEmail }]);
        if (error) throw error;
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
        const { error } = await supabase.from('mlodziezowka_tasks').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (err) {
        console.error('Błąd usuwania zadania:', err);
        alert('Błąd: ' + err.message);
      }
    }
  };

  // Events
  const saveEvent = async () => {
    try {
      if (!eventForm.title.trim()) {
        alert('Tytuł wydarzenia jest wymagany');
        return;
      }
      const eventData = {
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        start_date: eventForm.start_date ? new Date(eventForm.start_date + (eventForm.event_time ? 'T' + eventForm.event_time : 'T00:00:00')).toISOString() : null,
        location: eventForm.location,
        max_participants: eventForm.max_participants ? parseInt(eventForm.max_participants) : null,
        event_type: eventForm.event_type || 'spotkanie',
        created_by: currentUserEmail
      };

      if (eventForm.id) {
        const { error } = await supabase.from('mlodziezowka_events').update(eventData).eq('id', eventForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mlodziezowka_events').insert([eventData]);
        if (error) throw error;
      }

      setShowEventModal(false);
      await fetchData();
    } catch (err) {
      console.error('Błąd zapisywania wydarzenia:', err);
      alert('Błąd: ' + err.message);
    }
  };

  const deleteEvent = async (id) => {
    if (confirm('Usunąć wydarzenie?')) {
      try {
        const { error } = await supabase.from('mlodziezowka_events').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (err) {
        console.error('Błąd usuwania wydarzenia:', err);
        alert('Błąd: ' + err.message);
      }
    }
  };

  // Drag & Drop for tasks
  const handleDragStart = (task) => setDraggedTask(task);
  const handleDragOver = (e, status) => { e.preventDefault(); setDragOverColumn(status); };
  const handleDragLeave = () => setDragOverColumn(null);
  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask || draggedTask.status === newStatus) { setDraggedTask(null); return; }
    try {
      const { error } = await supabase.from('mlodziezowka_tasks').update({ status: newStatus }).eq('id', draggedTask.id);
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

  // Finance expense handlers
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
      setExpenseForm({
        payment_date: '',
        amount: '',
        contractor: '',
        category: 'Mlodziezowka',
        description: '',
        detailed_description: '',
        responsible_person: '',
        documents: [],
        tags: [],
        ministry: 'Mlodziezowka'
      });
      fetchFinanceData();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Błąd zapisywania: ' + error.message);
    }
  };

  if (loading) return <div className="p-10 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 dark:border-orange-400 mx-auto"></div></div>;
  if (error) return <div className="p-10 text-red-600 dark:text-red-400">Błąd: {error}</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-500 to-orange-500 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Młodzieżówka</h1>
      </div>

      {/* TAB NAVIGATION */}
      <ResponsiveTabs
        tabs={[
          { id: 'events', label: 'Wydarzenia', icon: Calendar },
          { id: 'tasks', label: 'Zadania', icon: CheckSquare },
          ...(hasTabAccess('mlodziezowka', 'leaders', userRole) ? [{ id: 'leaders', label: 'Liderzy', icon: Star }] : []),
          ...(hasTabAccess('mlodziezowka', 'members', userRole) ? [{ id: 'members', label: 'Członkowie', icon: Users }] : []),
          ...(hasTabAccess('mlodziezowka', 'finances', userRole) ? [{ id: 'finances', label: 'Finanse', icon: DollarSign }] : []),
          ...(hasTabAccess('mlodziezowka', 'equipment', userRole) ? [{ id: 'equipment', label: 'Wyposażenie', icon: Package }] : []),
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* WYDARZENIA */}
      {activeTab === 'events' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 transition-colors duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-orange-500 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Wydarzenia ({events.length})</h2>
            <button onClick={() => { setEventForm({ id: null, title: '', description: '', start_date: '', event_time: '', location: '', max_participants: '', event_type: 'spotkanie' }); setShowEventModal(true); }} className="bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> Dodaj wydarzenie</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(event => (
              <div key={event.id} className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-gray-800 dark:text-gray-100">{event.title}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    event.event_type === 'wyjazd' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                    event.event_type === 'integracja' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                    event.event_type === 'inne' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' :
                    'bg-pink-100 dark:bg-orange-900/30 text-pink-700 dark:text-orange-300'
                  }`}>
                    {event.event_type === 'wyjazd' ? 'Wyjazd' : event.event_type === 'integracja' ? 'Integracja' : event.event_type === 'inne' ? 'Inne' : 'Spotkanie'}
                  </span>
                </div>
                {event.description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{event.description}</p>}
                <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                  {event.start_date && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} />
                      {new Date(event.start_date).toLocaleDateString('pl-PL')}
                      {event.start_date && new Date(event.start_date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) !== '00:00' &&
                        ` o ${new Date(event.start_date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  )}
                  {event.location && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} />
                      {event.location}
                    </div>
                  )}
                  {event.max_participants && (
                    <div className="flex items-center gap-2">
                      <Users size={14} />
                      Max. {event.max_participants} uczestników
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={() => { setEventForm(event); setShowEventModal(true); }} className="text-pink-600 dark:text-orange-400 text-xs font-medium">Edytuj</button>
                  <button onClick={() => deleteEvent(event.id)} className="text-red-500 dark:text-red-400 text-xs font-medium">Usuń</button>
                </div>
              </div>
            ))}
          </div>

          {events.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <Calendar size={48} className="mx-auto mb-4 opacity-50" />
              <p>Brak wydarzeń</p>
              <p className="text-sm mt-1">Dodaj pierwsze wydarzenie</p>
            </div>
          )}
        </section>
      )}

      {/* ZADANIA */}
      {activeTab === 'tasks' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-4 lg:p-6 transition-colors duration-300">
          {/* Mobile: 2 rows, Desktop: 1 row */}
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
            {/* Row 1: Title + Add button (mobile) / Title (desktop) */}
            <div className="flex justify-between items-center">
              <h2 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-pink-500 to-orange-500 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Zadania ({filteredTasks.length})</h2>
              {/* Mobile only: Add button */}
              <button onClick={() => openTaskModal(null)} className="lg:hidden bg-gradient-to-r from-pink-500 to-orange-500 text-white p-2.5 rounded-xl font-medium hover:shadow-lg transition"><Plus size={20}/></button>
            </div>

            {/* Row 2: Filters (mobile) / Filters + Add button (desktop) */}
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 gap-1 lg:gap-2 items-center flex-1 lg:flex-none">
                <button onClick={() => setViewMode('kanban')} className={`p-2 rounded-lg transition ${viewMode === 'kanban' ? 'bg-white dark:bg-gray-700 shadow text-pink-600 dark:text-orange-300' : 'text-gray-500 dark:text-gray-400'}`}><LayoutGrid size={18} /></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow text-pink-600 dark:text-orange-300' : 'text-gray-500 dark:text-gray-400'}`}><List size={18} /></button>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1 hidden lg:block"></div>

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
              <button onClick={() => openTaskModal(null)} className="hidden lg:flex bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition items-center gap-2 whitespace-nowrap"><Plus size={18}/> Dodaj zadanie</button>
            </div>
          </div>

          {viewMode === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {STATUSES.map(status => (
                <div key={status} className={`bg-gradient-to-br from-gray-50/80 to-gray-100/50 dark:from-gray-800/40 dark:to-gray-900/20 backdrop-blur-sm rounded-2xl border-2 p-4 transition-all ${dragOverColumn === status ? 'border-orange-400 dark:border-pink-500 bg-pink-50/50 dark:bg-orange-900/20 shadow-lg' : 'border-gray-200/50 dark:border-gray-700/50'}`}
                  onDragOver={(e) => handleDragOver(e, status)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, status)}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{status}</h3>
                    <span className="bg-pink-100 dark:bg-orange-900/40 text-pink-700 dark:text-orange-300 px-3 py-1 rounded-full text-xs font-bold">{filteredTasks.filter(t => t.status === status).length}</span>
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
                              {task.assigned_to && <div className="flex items-center gap-1"><User size={14} />{leaders.find(m => m.id === task.assigned_to)?.full_name}</div>}
                            </div>
                            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                              <button onClick={() => openTaskModal(task)} className="text-pink-600 dark:text-orange-400 text-xs font-medium">Szczegóły</button>
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
                <thead className="bg-gradient-to-r from-pink-50/80 to-pink-50/80 dark:from-orange-900/20 dark:to-pink-900/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
                  <tr><th className="p-4 w-10"></th><th className="p-4">Zadanie</th><th className="p-4">Termin</th><th className="p-4">Przypisane</th><th className="p-4">Status</th><th className="p-4 text-right">Akcje</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
                  {filteredTasks.map(task => (
                    <tr key={task.id} className="hover:bg-pink-50/30 dark:hover:bg-orange-900/10 transition">
                      <td className="p-4"><input type="checkbox" checked={task.status === 'Gotowe'} onChange={() => toggleTaskCompletion(task)} className="w-5 h-5 rounded border-gray-300 text-pink-600 dark:text-pink-500 cursor-pointer" /></td>
                      <td className="p-4 font-bold text-gray-800 dark:text-gray-200">{task.title}</td>
                      <td className="p-4 text-gray-600 dark:text-gray-400">{task.due_date ? new Date(task.due_date).toLocaleDateString('pl-PL') : '-'}</td>
                      <td className="p-4 text-gray-600 dark:text-gray-400">{leaders.find(m => m.id === task.assigned_to)?.full_name || '-'}</td>
                      <td className="p-4"><span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{task.status}</span></td>
                      <td className="p-4 text-right"><button onClick={() => openTaskModal(task)} className="text-pink-600 dark:text-orange-400 font-medium">Szczegóły</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* LIDERZY */}
      {activeTab === 'leaders' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 transition-colors duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-orange-500 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Liderzy ({leaders.length})</h2>
            <button onClick={() => { setLeaderForm({ id: null, full_name: '', email: '', phone: '', role: '' }); setShowLeaderModal(true); }} className="bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> Dodaj lidera</button>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[700px]">
              <thead className="bg-gradient-to-r from-pink-50/80 to-pink-50/80 dark:from-orange-900/20 dark:to-pink-900/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
                <tr><th className="p-4">Imię i nazwisko</th><th className="p-4">Rola</th><th className="p-4">Email</th><th className="p-4">Telefon</th><th className="p-4 text-right">Akcje</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
                {leaders.map(m => (
                  <tr key={m.id} className="hover:bg-pink-50/30 dark:hover:bg-orange-900/10 transition text-gray-700 dark:text-gray-300">
                    <td className="p-4 font-medium">{m.full_name}</td>
                    <td className="p-4">
                      {m.role && (
                        <span className="bg-pink-50 dark:bg-orange-900/30 text-pink-700 dark:text-orange-300 px-2 py-0.5 rounded-lg text-xs font-medium border border-pink-100 dark:border-pink-800">
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td className="p-4">{m.email}</td>
                    <td className="p-4">{m.phone}</td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button onClick={() => { setLeaderForm(m); setShowLeaderModal(true); }} className="text-pink-600 dark:text-orange-400 font-medium">Edytuj</button>
                      <button onClick={() => deleteLeader(m.id)} className="text-red-500 dark:text-red-400 font-medium">Usuń</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* CZŁONKOWIE */}
      {activeTab === 'members' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 transition-colors duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-orange-500 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Członkowie ({members.length})</h2>
            <button onClick={() => { setMemberForm({ id: null, full_name: '', email: '', phone: '', birth_date: '', notes: '' }); setShowMemberModal(true); }} className="bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> Dodaj członka</button>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[700px]">
              <thead className="bg-gradient-to-r from-pink-50/80 to-pink-50/80 dark:from-orange-900/20 dark:to-pink-900/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
                <tr><th className="p-4">Imię i nazwisko</th><th className="p-4">Data urodzenia</th><th className="p-4">Email</th><th className="p-4">Telefon</th><th className="p-4 text-right">Akcje</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
                {members.map(m => (
                  <tr key={m.id} className="hover:bg-pink-50/30 dark:hover:bg-orange-900/10 transition text-gray-700 dark:text-gray-300">
                    <td className="p-4 font-medium">{m.full_name}</td>
                    <td className="p-4">{m.birth_date ? new Date(m.birth_date).toLocaleDateString('pl-PL') : '-'}</td>
                    <td className="p-4">{m.email}</td>
                    <td className="p-4">{m.phone}</td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button onClick={() => { setMemberForm(m); setShowMemberModal(true); }} className="text-pink-600 dark:text-orange-400 font-medium">Edytuj</button>
                      <button onClick={() => deleteMember(m.id)} className="text-red-500 dark:text-red-400 font-medium">Usuń</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* FINANCES TAB */}
      {activeTab === 'finances' && (
        <FinanceTab
          ministry="Mlodziezowka"
          budgetItems={budgetItems}
          expenses={expenses}
          onAddExpense={() => setShowExpenseModal(true)}
          onRefresh={fetchFinanceData}
        />
      )}

      {/* EQUIPMENT TAB */}
      {activeTab === 'equipment' && (
        <EquipmentTab
          ministryKey="mlodziezowka"
          currentUserEmail={currentUserEmail}
          canEdit={hasTabAccess('mlodziezowka', 'equipment', userRole)}
        />
      )}

      {/* MODAL ZADANIA */}
      {showTaskModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto transition-opacity">
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-4xl p-0 border border-white/20 dark:border-gray-700/50 my-8 flex overflow-hidden h-[80vh] animate-in fade-in zoom-in duration-200">

            <div className="w-3/5 p-8 overflow-y-auto border-r border-gray-200/50 dark:border-gray-700/50 custom-scrollbar">
              <div className="flex justify-between mb-6">
                <h3 className="font-bold text-2xl bg-gradient-to-r from-pink-500 to-orange-500 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">{taskForm.id ? 'Edycja zadania' : 'Nowe zadanie'}</h3>
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
                    label="Przypisana osoba (lider)"
                    value={taskForm.assigned_to}
                    onChange={val => setTaskForm({...taskForm, assigned_to: val})}
                    options={[
                      { value: null, label: 'Nie przypisano' },
                      ...leaders.map(m => ({ value: m.id, label: m.full_name }))
                    ]}
                    placeholder="Wybierz osobę..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Załącznik</label>
                  <input type="file" className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-pink-50 dark:file:bg-orange-900/30 file:text-pink-700 dark:file:text-orange-300 hover:file:bg-pink-100 dark:hover:file:bg-orange-900/50" onChange={handleFileUpload} />
                  {taskForm.attachment && <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg"><Paperclip size={14} />{taskForm.attachment.name}</div>}
                </div>
                <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                  {taskForm.id && <button onClick={() => { deleteTask(taskForm.id); setShowTaskModal(false); }} className="px-4 py-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition">Usuń zadanie</button>}
                  <button onClick={saveTask} className="px-6 py-3 bg-gradient-to-r from-pink-500 to-orange-500 dark:from-pink-500 dark:to-orange-500 text-white font-bold rounded-xl hover:shadow-lg transition">Zapisz zmiany</button>
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
                      <span className="font-bold text-xs text-pink-700 dark:text-orange-300">{comment.author_name}</span>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <CustomDatePicker
                    label="Data urodzenia"
                    value={memberForm.birth_date}
                    onChange={val => setMemberForm({...memberForm, birth_date: val})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Telefon</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="+48 123 456 789" value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Email</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="jan@example.com" value={memberForm.email} onChange={e => setMemberForm({...memberForm, email: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Notatki</label>
                <textarea className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none" rows={2} placeholder="Dodatkowe informacje..." value={memberForm.notes || ''} onChange={e => setMemberForm({...memberForm, notes: e.target.value})} />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowMemberModal(false)} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Anuluj</button>
                <button onClick={saveMember} className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/50 transition font-medium">Zapisz</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL LIDERA */}
      {showLeaderModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{leaderForm.id ? 'Edytuj lidera' : 'Nowy lider'}</h3>
              <button onClick={() => setShowLeaderModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Imię i nazwisko</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="Jan Kowalski" value={leaderForm.full_name} onChange={e => setLeaderForm({...leaderForm, full_name: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Rola / Odpowiedzialność</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="Główny lider, Koordynator..." value={leaderForm.role || ''} onChange={e => setLeaderForm({...leaderForm, role: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Telefon</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="+48 123 456 789" value={leaderForm.phone} onChange={e => setLeaderForm({...leaderForm, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Email</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="jan@example.com" value={leaderForm.email} onChange={e => setLeaderForm({...leaderForm, email: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowLeaderModal(false)} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Anuluj</button>
                <button onClick={saveLeader} className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/50 transition font-medium">Zapisz</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL WYDARZENIA */}
      {showEventModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{eventForm.id ? 'Edytuj wydarzenie' : 'Nowe wydarzenie'}</h3>
              <button onClick={() => setShowEventModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Tytuł wydarzenia</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="Spotkanie młodzieżowe" value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Opis</label>
                <textarea className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none" rows={3} placeholder="Szczegóły wydarzenia..." value={eventForm.description || ''} onChange={e => setEventForm({...eventForm, description: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <CustomDatePicker
                    label="Data"
                    value={eventForm.start_date}
                    onChange={val => setEventForm({...eventForm, start_date: val})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Godzina</label>
                  <input type="time" className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white" value={eventForm.event_time || ''} onChange={e => setEventForm({...eventForm, event_time: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Lokalizacja</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="Sala główna, Kościół..." value={eventForm.location || ''} onChange={e => setEventForm({...eventForm, location: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Max. uczestników</label>
                  <input type="number" className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="30" value={eventForm.max_participants || ''} onChange={e => setEventForm({...eventForm, max_participants: e.target.value})} />
                </div>
                <div>
                  <CustomSelect
                    label="Typ wydarzenia"
                    value={eventForm.event_type}
                    onChange={val => setEventForm({...eventForm, event_type: val})}
                    options={[
                      { value: 'spotkanie', label: 'Spotkanie' },
                      { value: 'wyjazd', label: 'Wyjazd' },
                      { value: 'integracja', label: 'Integracja' },
                      { value: 'inne', label: 'Inne' }
                    ]}
                    placeholder="Typ"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowEventModal(false)} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Anuluj</button>
                <button onClick={saveEvent} className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/50 transition font-medium">Zapisz</button>
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
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Nowy wydatek - Młodzieżówka</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
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
                  <label className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer hover:border-orange-300 dark:hover:border-pink-600 transition flex items-center gap-2">
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
                    placeholder="Nowy tag..."
                    onKeyPress={(e) => e.key === 'Enter' && addExpenseTag()}
                  />
                  <button
                    onClick={addExpenseTag}
                    className="px-4 py-2 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {expenseForm.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {expenseForm.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-pink-50 dark:bg-orange-900/30 text-pink-700 dark:text-orange-300 rounded-full text-xs flex items-center gap-1"
                      >
                        {tag}
                        <button onClick={() => removeExpenseTag(tag)} className="hover:text-orange-900">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Anuluj
                </button>
                <button
                  onClick={saveExpense}
                  className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl hover:shadow-lg transition font-medium"
                >
                  Zapisz wydatek
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
