import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, List, LayoutGrid, Clock, CheckCircle, Circle, Plus, X, Save, Calendar, ChevronLeft, ChevronRight, Trash2, Lock, Users, Video, User } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const STATUS_CONFIG = {
  todo: {
    label: 'Do zrobienia',
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
    icon: Circle,
  },
  in_progress: {
    label: 'W trakcie',
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300',
    icon: Clock,
  },
  done: {
    label: 'Gotowe',
    color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300',
    icon: CheckCircle,
  },
};

const SOURCE_CONFIG = {
  personal: {
    icon: User,
    color: 'text-pink-500',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',
  },
  home_group: {
    icon: Users,
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  media_team: {
    icon: Video,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
};

// ============================================
// CUSTOM DATE PICKER
// ============================================

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
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  useEffect(() => { if (value) setViewDate(new Date(value)); }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.datepicker-portal')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)} className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center gap-2 cursor-pointer hover:border-pink-400 dark:hover:border-pink-500 transition">
        <Calendar size={16} className="text-pink-600 dark:text-pink-400" />
        <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
          {value ? new Date(value).toLocaleDateString('pl-PL') : 'Wybierz datę'}
        </span>
      </div>
      {isOpen && coords.width > 0 && document.body && createPortal(
        <div className="datepicker-portal fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 animate-in fade-in zoom-in-95 duration-100 w-[280px]" style={{ ...(coords.openUpward ? { bottom: `calc(100vh - ${coords.top}px)` } : { top: coords.top }), left: coords.left }}>
           <div className="flex justify-between items-center mb-4">
             <button type="button" onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1)); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"><ChevronLeft size={18} /></button>
             <span className="text-sm font-bold capitalize text-gray-800 dark:text-white">{viewDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
             <button type="button" onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"><ChevronRight size={18} /></button>
           </div>
           <div className="grid grid-cols-7 gap-1 text-center mb-2 text-[10px] font-bold text-gray-400 uppercase">{['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(d => <div key={d}>{d}</div>)}</div>
           <div className="grid grid-cols-7 gap-1">
             {emptyDays.map((_, i) => <div key={`e-${i}`} />)}
             {daysArray.map(d => {
               const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
               return (
                 <button type="button" key={d} onClick={(e) => { e.stopPropagation(); handleDayClick(d); }} className={`h-8 w-8 rounded-lg text-xs font-medium transition ${value === dateStr ? 'bg-pink-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
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

// ============================================
// TASK MODAL
// ============================================

// Mapowanie statusów z polskiego na angielski i odwrotnie
const STATUS_MAP_TO_ENGLISH = {
  'Do zrobienia': 'todo',
  'W trakcie': 'in_progress',
  'Gotowe': 'done',
  'todo': 'todo',
  'in_progress': 'in_progress',
  'done': 'done',
};

const STATUS_MAP_TO_POLISH = {
  'todo': 'Do zrobienia',
  'in_progress': 'W trakcie',
  'done': 'Gotowe',
};

const TaskModal = ({ isOpen, onClose, onSave, onDelete, initialTask, userName, userEmail }) => {
  const [task, setTask] = useState({
    title: '',
    description: '',
    due_date: new Date().toISOString().split('T')[0],
    status: 'todo',
    is_private: false,
    source: 'personal',
    source_label: 'Osobiste'
  });
  const [saving, setSaving] = useState(false);

  // Wszystkie zadania są teraz edytowalne
  const isNewTask = !initialTask;

  useEffect(() => {
    if (initialTask) {
      setTask({
        ...initialTask,
        due_date: initialTask.due_date ? initialTask.due_date.split('T')[0] : new Date().toISOString().split('T')[0],
        description: initialTask.description || '',
        is_private: initialTask.is_private || false,
        source: initialTask.source || 'personal',
        source_label: initialTask.source_label || 'Osobiste'
      });
    } else {
      setTask({
        title: '',
        description: '',
        due_date: new Date().toISOString().split('T')[0],
        status: 'todo',
        is_private: false,
        source: 'personal',
        source_label: 'Osobiste'
      });
    }
  }, [initialTask, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!task.title.trim()) return;

    setSaving(true);
    try {
      const source = task.source || 'personal';
      const taskId = task.original_id || task.id;

      if (source === 'personal') {
        // Zadania osobiste - user_tasks
        const payload = {
          title: task.title.trim(),
          description: task.description || null,
          due_date: task.due_date || null,
          status: task.status || 'todo',
          is_private: task.is_private || false,
        };

        if (task.id) {
          const { error } = await supabase
            .from('user_tasks')
            .update(payload)
            .eq('id', task.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('user_tasks')
            .insert({ ...payload, user_email: userEmail });
          if (error) throw error;
        }
      } else if (source === 'home_group') {
        // Zadania grup domowych - home_group_tasks (używają polskich statusów)
        const payload = {
          title: task.title.trim(),
          description: task.description || null,
          due_date: task.due_date || null,
          status: STATUS_MAP_TO_POLISH[task.status] || 'Do zrobienia',
        };

        const { error } = await supabase
          .from('home_group_tasks')
          .update(payload)
          .eq('id', taskId);
        if (error) throw error;
      } else if (source === 'media_team') {
        // Zadania media team - media_tasks (używają polskich statusów)
        const payload = {
          title: task.title.trim(),
          description: task.description || null,
          due_date: task.due_date || null,
          status: STATUS_MAP_TO_POLISH[task.status] || 'Do zrobienia',
        };

        const { error } = await supabase
          .from('media_tasks')
          .update(payload)
          .eq('id', taskId);
        if (error) throw error;
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Błąd zapisu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task.id) return;
    if (!confirm('Czy na pewno chcesz usunąć to zadanie?')) return;

    try {
      const source = task.source || 'personal';
      const taskId = task.original_id || task.id;

      if (source === 'personal') {
        await supabase.from('user_tasks').delete().eq('id', task.id);
      } else if (source === 'home_group') {
        await supabase.from('home_group_tasks').delete().eq('id', taskId);
      } else if (source === 'media_team') {
        await supabase.from('media_tasks').delete().eq('id', taskId);
      }

      onDelete?.();
      onClose();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Błąd usuwania: ' + error.message);
    }
  };

  if (!isOpen) return null;

  // Konfiguracja źródła dla wyświetlania
  const sourceConfig = SOURCE_CONFIG[task.source] || SOURCE_CONFIG.personal;
  const SourceIcon = sourceConfig.icon;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 dark:border-gray-700 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
          <X size={20} className="text-gray-500 dark:text-gray-400" />
        </button>

        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              {isNewTask ? <Plus size={24} className="text-pink-600" /> : <CheckCircle size={24} className="text-pink-600" />}
              {isNewTask ? 'Nowe zadanie' : 'Edytuj zadanie'}
            </h2>
            {!isNewTask && (
              <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 text-xs font-medium rounded-full ${sourceConfig.bgColor} ${sourceConfig.color}`}>
                <SourceIcon size={12} />
                {task.source_label}
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tytuł</label>
              <input
                autoFocus
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-pink-500/20 outline-none"
                value={task.title}
                onChange={e => setTask({...task, title: e.target.value})}
                placeholder="Co jest do zrobienia?"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Termin</label>
              <CustomDatePicker value={task.due_date} onChange={v => setTask({...task, due_date: v})} />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Status</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTask({...task, status: key})}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        task.status === key
                          ? `${config.color} ring-2 ring-offset-2 ring-pink-500`
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <Icon size={16} />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Opis</label>
              <textarea
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white text-sm h-24 resize-none focus:ring-2 focus:ring-pink-500/20 outline-none"
                value={task.description || ''}
                onChange={e => setTask({...task, description: e.target.value})}
                placeholder="Szczegóły zadania..."
              />
            </div>

            {/* Prywatne - tylko dla zadań osobistych */}
            {task.source === 'personal' && (
              <div>
                <label
                  className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-pink-300 dark:hover:border-pink-600 transition"
                  onClick={() => setTask({...task, is_private: !task.is_private})}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    task.is_private
                      ? 'bg-pink-600 border-pink-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {task.is_private && <Lock size={12} className="text-white" />}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Prywatne</span>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Tylko Ty widzisz to zadanie</p>
                  </div>
                  <Lock size={18} className={task.is_private ? 'text-pink-600' : 'text-gray-400 dark:text-gray-500'} />
                </label>
              </div>
            )}

            <div className="flex justify-between items-center pt-4">
              {task.id ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"
                >
                  <Trash2 size={16} /> Usuń
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={saving || !task.title.trim()}
                  className="px-4 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white font-bold rounded-xl hover:shadow-lg shadow-pink-500/30 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={16} /> {saving ? 'Zapisywanie...' : 'Zapisz'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ============================================
// MAIN WIDGET
// ============================================

export default function MyTasksWidget({ tasks, userEmail, userName, onRefresh }) {
  const [viewMode, setViewMode] = useState('tiles');
  const [modalState, setModalState] = useState({ isOpen: false, task: null });

  const pendingTasks = tasks.filter(t => t.status !== 'done');
  const completedTasks = tasks.filter(t => t.status === 'done');

  const handleTaskClick = (task) => {
    // Otwórz modal dla wszystkich zadań (osobistych i z innych modułów)
    setModalState({ isOpen: true, task });
  };

  const handleAddClick = () => {
    setModalState({ isOpen: true, task: null });
  };

  const handleModalClose = () => {
    setModalState({ isOpen: false, task: null });
  };

  const handleSave = () => {
    onRefresh?.();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="space-y-4">
        {/* Add button */}
        <button
          onClick={handleAddClick}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-pink-300 dark:hover:border-pink-600 hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
        >
          <Plus size={18} />
          <span className="font-medium">Dodaj zadanie</span>
        </button>

        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
            <CheckSquare size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            Brak zadań
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Nie masz przypisanych zadań
          </p>
        </div>

        <TaskModal
          isOpen={modalState.isOpen}
          onClose={handleModalClose}
          onSave={handleSave}
          onDelete={handleSave}
          initialTask={modalState.task}
          userName={userName}
          userEmail={userEmail}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with add button and view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddClick}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-900/20 hover:text-pink-600 dark:hover:text-pink-400"
          >
            <Plus size={16} />
            Dodaj
          </button>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {pendingTasks.length} do zrobienia
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <button
            onClick={() => setViewMode('tiles')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'tiles'
                ? 'bg-white dark:bg-gray-600 shadow-sm'
                : 'hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <LayoutGrid size={16} className="text-gray-600 dark:text-gray-300" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'list'
                ? 'bg-white dark:bg-gray-600 shadow-sm'
                : 'hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <List size={16} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Tasks */}
      {viewMode === 'tiles' ? (
        <div className="grid grid-cols-2 gap-3">
          {pendingTasks.slice(0, 6).map(task => {
            const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
            const StatusIcon = config.icon;
            const sourceConfig = SOURCE_CONFIG[task.source] || SOURCE_CONFIG.personal;
            const SourceIcon = sourceConfig.icon;

            return (
              <div
                key={`${task.source}-${task.id}`}
                className={`p-3 rounded-xl border transition-all hover:shadow-md cursor-pointer group ${
                  isOverdue(task.due_date) && task.status !== 'done'
                    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
                onClick={() => handleTaskClick(task)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon
                      size={18}
                      className={task.status === 'done' ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}
                    />
                    {task.is_private && (
                      <Lock size={14} className="text-pink-500" />
                    )}
                  </div>
                  {task.due_date && (
                    <span className={`text-xs font-medium ${
                      isOverdue(task.due_date) && task.status !== 'done'
                        ? 'text-red-500'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
                <p className={`text-sm font-medium line-clamp-2 ${
                  task.status === 'done'
                    ? 'text-gray-400 dark:text-gray-500 line-through'
                    : 'text-gray-800 dark:text-white'
                }`}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${sourceConfig.bgColor} ${sourceConfig.color}`}>
                    <SourceIcon size={10} />
                    {task.source_label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {pendingTasks.slice(0, 8).map(task => {
            const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
            const StatusIcon = config.icon;
            const sourceConfig = SOURCE_CONFIG[task.source] || SOURCE_CONFIG.personal;
            const SourceIcon = sourceConfig.icon;

            return (
              <div
                key={`${task.source}-${task.id}`}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-md cursor-pointer group ${
                  isOverdue(task.due_date) && task.status !== 'done'
                    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
                onClick={() => handleTaskClick(task)}
              >
                <div className="flex items-center gap-1.5">
                  <StatusIcon
                    size={20}
                    className={task.status === 'done' ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}
                  />
                  {task.is_private && (
                    <Lock size={14} className="text-pink-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    task.status === 'done'
                      ? 'text-gray-400 dark:text-gray-500 line-through'
                      : 'text-gray-800 dark:text-white'
                  }`}>
                    {task.title}
                  </p>
                  <span className={`inline-flex items-center gap-1 text-[10px] ${sourceConfig.color}`}>
                    <SourceIcon size={10} />
                    {task.source_label}
                  </span>
                </div>
                {task.due_date && (
                  <span className={`text-xs font-medium shrink-0 ${
                    isOverdue(task.due_date) && task.status !== 'done'
                      ? 'text-red-500'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {formatDate(task.due_date)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Show completed count */}
      {completedTasks.length > 0 && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          {completedTasks.length} ukończonych zadań
        </p>
      )}

      {pendingTasks.length > (viewMode === 'tiles' ? 6 : 8) && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          + {pendingTasks.length - (viewMode === 'tiles' ? 6 : 8)} więcej zadań
        </p>
      )}

      {/* Modal */}
      <TaskModal
        isOpen={modalState.isOpen}
        onClose={handleModalClose}
        onSave={handleSave}
        onDelete={handleSave}
        initialTask={modalState.task}
        userName={userName}
        userEmail={userEmail}
      />
    </div>
  );
}
