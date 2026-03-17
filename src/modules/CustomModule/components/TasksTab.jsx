import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import {
  Plus, Trash2, X, Calendar, User, LayoutGrid, List, Save,
  Check, Paperclip, MessageSquare, Send, ChevronLeft, ChevronRight
} from 'lucide-react';
import CustomSelect from '../../../components/CustomSelect';

const STATUSES = ['Do zrobienia', 'W trakcie', 'Gotowe'];

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
          ${isOpen ? 'border-pink-500 ring-2 ring-pink-500/20 dark:border-pink-400' : 'border-gray-200/50 dark:border-gray-700/50 hover:border-pink-300 dark:hover:border-pink-600'}
        `}
      >
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={16} className="text-gray-400" />
          <span className={value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
            {value ? new Date(value).toLocaleDateString('pl-PL') : 'Wybierz datę'}
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
            {['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(d => <div key={d} className="text-[10px] font-bold text-gray-400 uppercase">{d}</div>)}
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
                    ${isSelected ? 'bg-pink-600 text-white shadow-md shadow-pink-500/30' :
                      isToday ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-pink-800' :
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

export default function TasksTab({ moduleKey, moduleName, currentUserEmail }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('kanban');
  const [filterScope, setFilterScope] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [tableExists, setTableExists] = useState(true);

  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'Do zrobienia',
    assigned_to: null,
    due_date: '',
    attachment: null
  });

  // Komentarze
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // Drag & Drop
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const tableName = `custom_${moduleKey}_tasks`;
  const membersTableName = `custom_${moduleKey}_members`;
  const commentsTableName = `custom_${moduleKey}_task_comments`;

  // Pobierz członków zespołu
  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from(membersTableName)
        .select('id, full_name, email')
        .order('full_name');

      if (!error) {
        setMembers(data || []);
      }
    } catch (err) {
      // Tabela członków może nie istnieć
      setMembers([]);
    }
  };

  // Pobierz zadania
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist') || error.code === 'PGRST204') {
          setTableExists(false);
          setTasks([]);
          setLoading(false);
          return;
        }
        throw error;
      }

      setTableExists(true);
      setTasks(data || []);
    } catch (err) {
      console.error('Błąd pobierania zadań:', err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  // Pobierz komentarze
  const fetchComments = async (taskId) => {
    if (!taskId) return;
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from(commentsTableName)
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (!error) {
        setComments(data || []);
      } else {
        setComments([]);
      }
    } catch (err) {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  // Dodaj komentarz
  const addComment = async () => {
    if (!newComment.trim() || !editingTask?.id) return;

    try {
      const authorProfile = members.find(m => m.email === currentUserEmail);
      const authorName = authorProfile ? authorProfile.full_name : (currentUserEmail || 'Nieznany');

      const { error } = await supabase
        .from(commentsTableName)
        .insert([{
          task_id: editingTask.id,
          content: newComment.trim(),
          author_email: currentUserEmail,
          author_name: authorName
        }]);

      if (!error) {
        setNewComment('');
        fetchComments(editingTask.id);
      }
    } catch (err) {
      console.error('Błąd dodawania komentarza:', err);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchMembers();
  }, [moduleKey]);

  // Filtrowanie
  const filteredTasks = tasks.filter(t => {
    if (filterScope === 'mine') {
      const myProfile = members.find(m => m.email === currentUserEmail);
      if (!myProfile || String(t.assigned_to) !== String(myProfile.id)) return false;
    }
    if (filterStatus === 'active' && t.status === 'Gotowe') return false;
    if (filterStatus === 'completed' && t.status !== 'Gotowe') return false;
    return true;
  });

  // Grupowanie po statusie dla widoku kanban
  const tasksByStatus = STATUSES.reduce((acc, status) => {
    acc[status] = filteredTasks.filter(t => t.status === status);
    return acc;
  }, {});

  // Otwórz modal
  const openTaskModal = (task) => {
    setEditingTask(task);
    setForm(task ? {
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'Do zrobienia',
      assigned_to: task.assigned_to || null,
      due_date: task.due_date || '',
      attachment: task.attachment || null
    } : {
      title: '',
      description: '',
      status: 'Do zrobienia',
      assigned_to: null,
      due_date: '',
      attachment: null
    });

    if (task?.id) {
      fetchComments(task.id);
    } else {
      setComments([]);
    }
    setShowModal(true);
  };

  // Zapisz zadanie
  const handleSave = async () => {
    if (!form.title) return;

    try {
      const taskData = {
        title: form.title.trim(),
        description: form.description?.trim() || '',
        status: form.status,
        assigned_to: form.assigned_to,
        due_date: form.due_date || null,
        attachment: form.attachment,
        module_key: moduleKey
      };

      let result;
      if (editingTask?.id) {
        result = await supabase.from(tableName).update(taskData).eq('id', editingTask.id);
      } else {
        result = await supabase.from(tableName).insert([taskData]);
      }

      if (result.error) {
        if (result.error.code === '42P01' || result.error.message?.includes('does not exist')) {
          setTableExists(false);
          setShowModal(false);
          return;
        }
        throw result.error;
      }

      setShowModal(false);
      setEditingTask(null);
      fetchTasks();
    } catch (err) {
      console.error('Błąd zapisu:', err);
      alert('Błąd zapisu zadania: ' + err.message);
    }
  };

  // Toggle status zadania (checkbox)
  const toggleTaskCompletion = async (task) => {
    const newStatus = task.status === 'Gotowe' ? 'Do zrobienia' : 'Gotowe';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

    try {
      await supabase.from(tableName).update({ status: newStatus }).eq('id', task.id);
    } catch (err) {
      fetchTasks();
    }
  };

  // Usuń zadanie
  const handleDelete = async (id) => {
    if (!confirm('Usunąć to zadanie?')) return;
    try {
      await supabase.from(tableName).delete().eq('id', id);
      setShowModal(false);
      fetchTasks();
    } catch (err) {
      console.error('Błąd usuwania:', err);
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (task) => setDraggedTask(task);
  const handleDragOver = (e, status) => { e.preventDefault(); setDragOverColumn(status); };
  const handleDragLeave = () => setDragOverColumn(null);
  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask || draggedTask.status === newStatus) { setDraggedTask(null); return; }

    try {
      await supabase.from(tableName).update({ status: newStatus }).eq('id', draggedTask.id);
      fetchTasks();
    } catch (err) {
      console.error('Błąd:', err);
    }
    setDraggedTask(null);
  };

  // Upload załącznika
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setForm({ ...form, attachment: { name: file.name, type: file.type, size: file.size, data: event.target.result.split(',')[1] } });
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mx-auto"></div>
      </div>
    );
  }

  // Jeśli tabela nie istnieje, pokaż instrukcję
  if (!tableExists) {
    const sqlScript = `-- Utwórz tabelę ${tableName}
CREATE TABLE ${tableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Do zrobienia',
  assigned_to UUID,
  due_date DATE,
  attachment JSONB,
  module_key TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Włącz RLS
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

-- Polityka dostępu
CREATE POLICY "${tableName}_policy" ON ${tableName}
  FOR ALL USING (true) WITH CHECK (true);

-- Uprawnienia
GRANT ALL ON ${tableName} TO authenticated;
GRANT ALL ON ${tableName} TO anon;

-- Opcjonalnie: tabela komentarzy
CREATE TABLE ${commentsTableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES ${tableName}(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_email TEXT,
  author_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ${commentsTableName} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "${commentsTableName}_policy" ON ${commentsTableName}
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON ${commentsTableName} TO authenticated;
GRANT ALL ON ${commentsTableName} TO anon;`;

    return (
      <div className="p-8 text-center">
        <div className="max-w-2xl mx-auto bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">
            Tabela nie istnieje
          </h3>
          <p className="text-yellow-700 dark:text-yellow-300 mb-4">
            Aby korzystać z zadań w tym module, utwórz tabelę w Supabase.
          </p>
          <div className="bg-gray-900 rounded-xl p-4 text-left overflow-x-auto max-h-64">
            <pre className="text-green-400 text-xs whitespace-pre">{sqlScript}</pre>
          </div>
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-4">
            Skopiuj powyższy kod i wykonaj go w Supabase SQL Editor.
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(sqlScript);
              alert('Skopiowano do schowka!');
            }}
            className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-xl hover:bg-yellow-700 transition"
          >
            Skopiuj SQL
          </button>
          <button
            onClick={fetchTasks}
            className="mt-4 ml-2 px-4 py-2 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition"
          >
            Odśwież
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          Zadania ({filteredTasks.length})
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 gap-2 items-center">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-lg transition ${viewMode === 'kanban' ? 'bg-white dark:bg-gray-700 shadow text-pink-600 dark:text-pink-300' : 'text-gray-500 dark:text-gray-400'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow text-pink-600 dark:text-pink-300' : 'text-gray-500 dark:text-gray-400'}`}
            >
              <List size={18} />
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            <div className="w-28">
              <CustomSelect
                value={filterScope}
                onChange={setFilterScope}
                options={[
                  { value: 'all', label: 'Wszyscy' },
                  { value: 'mine', label: 'Moje' }
                ]}
              />
            </div>
            <div className="w-32">
              <CustomSelect
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: 'active', label: 'Otwarte' },
                  { value: 'completed', label: 'Zakończone' },
                  { value: 'all', label: 'Wszystkie' }
                ]}
              />
            </div>
          </div>
          <button
            onClick={() => openTaskModal(null)}
            className="px-4 py-2 bg-gradient-to-r from-orange-600 to-pink-600 text-white rounded-xl font-medium flex items-center gap-2 hover:shadow-lg transition whitespace-nowrap"
          >
            <Plus size={18} />
            Dodaj zadanie
          </button>
        </div>
      </div>

      {/* Widok Kanban */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUSES.map(status => (
            <div
              key={status}
              className={`bg-gradient-to-br from-gray-50/80 to-gray-100/50 dark:from-gray-800/40 dark:to-gray-900/20 backdrop-blur-sm rounded-2xl border-2 p-4 transition-all ${dragOverColumn === status ? 'border-pink-400 dark:border-pink-500 bg-pink-50/50 dark:bg-pink-900/20 shadow-lg' : 'border-gray-200/50 dark:border-gray-700/50'}`}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{status}</h3>
                <span className="bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 px-3 py-1 rounded-full text-xs font-bold">
                  {tasksByStatus[status].length}
                </span>
              </div>
              <div className="space-y-3">
                {tasksByStatus[status].map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task)}
                    className={`bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-4 shadow-sm hover:shadow-md transition cursor-move group ${task.status === 'Gotowe' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <input
                          type="checkbox"
                          checked={task.status === 'Gotowe'}
                          onChange={() => toggleTaskCompletion(task)}
                          className="w-5 h-5 rounded border-gray-300 text-pink-600 dark:text-pink-500 cursor-pointer"
                        />
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-bold text-gray-800 dark:text-gray-100 mb-2 ${task.status === 'Gotowe' ? 'line-through text-gray-500 dark:text-gray-500' : ''}`}>
                          {task.title}
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                          {task.due_date && (
                            <div className="flex items-center gap-1">
                              <Calendar size={14} />
                              {new Date(task.due_date).toLocaleDateString('pl-PL')}
                            </div>
                          )}
                          {task.assigned_to && (
                            <div className="flex items-center gap-1">
                              <User size={14} />
                              {members.find(m => String(m.id) === String(task.assigned_to))?.full_name || 'Przypisano'}
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                          <button
                            onClick={() => openTaskModal(task)}
                            className="text-pink-600 dark:text-pink-400 text-xs font-medium"
                          >
                            Szczegóły
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {tasksByStatus[status].length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    Brak zadań
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Widok Listy */}
      {viewMode === 'list' && (
        <div className="bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gradient-to-r from-pink-50/80 to-orange-50/80 dark:from-pink-900/20 dark:to-orange-900/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
              <tr>
                <th className="p-4 w-10"></th>
                <th className="p-4">Zadanie</th>
                <th className="p-4">Termin</th>
                <th className="p-4">Przypisane</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
              {filteredTasks.length > 0 ? filteredTasks.map(task => (
                <tr key={task.id} className="hover:bg-pink-50/30 dark:hover:bg-pink-900/10 transition">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={task.status === 'Gotowe'}
                      onChange={() => toggleTaskCompletion(task)}
                      className="w-5 h-5 rounded border-gray-300 text-pink-600 dark:text-pink-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-4 font-bold text-gray-800 dark:text-gray-200">{task.title}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString('pl-PL') : '-'}
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">
                    {members.find(m => String(m.id) === String(task.assigned_to))?.full_name || '-'}
                  </td>
                  <td className="p-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {task.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => openTaskModal(task)} className="text-pink-600 dark:text-pink-400 font-medium">
                      Szczegóły
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">Brak zadań</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal zadania - identyczny jak w MediaTeam */}
      {showModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto transition-opacity">
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-4xl p-0 border border-white/20 dark:border-gray-700/50 my-8 flex overflow-hidden h-[80vh] animate-in fade-in zoom-in duration-200">

            {/* Lewa kolumna - formularz */}
            <div className="w-3/5 p-8 overflow-y-auto border-r border-gray-200/50 dark:border-gray-700/50 custom-scrollbar">
              <div className="flex justify-between mb-6">
                <h3 className="font-bold text-2xl bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
                  {editingTask?.id ? 'Edycja zadania' : 'Nowe zadanie'}
                </h3>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tytuł zadania</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                    value={form.title}
                    onChange={e => setForm({...form, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Opis</label>
                  <textarea
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm resize-none h-32 focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <CustomDatePicker
                      label="Termin"
                      value={form.due_date}
                      onChange={val => setForm({...form, due_date: val})}
                    />
                  </div>
                  <div>
                    <CustomSelect
                      label="Status"
                      value={form.status}
                      onChange={val => setForm({...form, status: val})}
                      options={STATUSES}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Przypisana osoba</label>
                  {members.length > 0 ? (
                    <CustomSelect
                      value={form.assigned_to}
                      onChange={val => setForm({...form, assigned_to: val})}
                      options={[
                        { value: null, label: 'Nie przypisano' },
                        ...members.map(m => ({ value: m.id, label: m.full_name }))
                      ]}
                      placeholder="Wybierz osobę..."
                    />
                  ) : (
                    <div className="px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 text-sm">
                      Brak członków. Dodaj członków w zakładce "Członkowie".
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Załącznik</label>
                  <input
                    type="file"
                    className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-pink-50 dark:file:bg-pink-900/30 file:text-pink-700 dark:file:text-pink-300 hover:file:bg-pink-100 dark:hover:file:bg-pink-900/50"
                    onChange={handleFileUpload}
                  />
                  {form.attachment && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                      <Paperclip size={14} />{form.attachment.name}
                    </div>
                  )}
                </div>
                <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                  {editingTask?.id && (
                    <button
                      onClick={() => handleDelete(editingTask.id)}
                      className="px-4 py-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                    >
                      Usuń zadanie
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white font-bold rounded-xl hover:shadow-lg transition"
                  >
                    Zapisz zmiany
                  </button>
                </div>
              </div>
            </div>

            {/* Prawa kolumna - komentarze */}
            <div className="w-2/5 bg-gray-50/50 dark:bg-gray-800/30 p-6 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <MessageSquare size={18}/> Komentarze
                </h4>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition">
                  <X size={20} className="text-gray-500 dark:text-gray-400"/>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
                {!editingTask?.id ? (
                  <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-10">
                    Zapisz zadanie, aby dodawać komentarze.
                  </div>
                ) : loadingComments ? (
                  <div className="text-center text-gray-400 dark:text-gray-500 text-sm">Ładowanie...</div>
                ) : comments.length === 0 ? (
                  <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-10">
                    Brak komentarzy. Bądź pierwszy!
                  </div>
                ) : comments.map(comment => (
                  <div key={comment.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-xs text-pink-700 dark:text-pink-300">{comment.author_name}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {new Date(comment.created_at).toLocaleString('pl-PL')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
              </div>
              {editingTask?.id && (
                <div className="mt-auto">
                  <div className="relative">
                    <textarea
                      className="w-full pl-4 pr-12 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:ring-2 focus:ring-pink-500/20 outline-none text-sm resize-none text-gray-800 dark:text-gray-200"
                      placeholder="Napisz komentarz..."
                      rows={2}
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          addComment();
                        }
                      }}
                    />
                    <button
                      onClick={addComment}
                      disabled={!newComment.trim()}
                      className="absolute right-2 bottom-2 p-2 bg-pink-600 dark:bg-pink-500 text-white rounded-lg hover:bg-pink-700 dark:hover:bg-pink-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
