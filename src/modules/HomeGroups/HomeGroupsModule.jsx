import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import CustomSelect from '../../components/CustomSelect';
import CustomDatePicker from '../../components/CustomDatePicker';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import {
  Plus, Search, Trash2, X, Users, MapPin, Calendar,
  UserPlus, BookOpen, Upload, Link as LinkIcon,
  LayoutGrid, List, CheckSquare, MessageSquare, Send,
  User, FileText, DollarSign, FolderOpen, Package
} from 'lucide-react';
import FinanceTab from '../shared/FinanceTab';
import EventsTab from '../shared/EventsTab';
import MaterialsTab from '../shared/MaterialsTab';
import EquipmentTab from '../shared/EquipmentTab';
import { useUserRole } from '../../hooks/useUserRole';
import { hasTabAccess } from '../../utils/tabPermissions';

const STATUSES = ['Do zrobienia', 'W trakcie', 'Gotowe'];

export default function HomeGroupsModule() {
  const { userRole, loading: roleLoading } = useUserRole();
  const [activeTab, setActiveTab] = useState('groups');
  const [groups, setGroups] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('group');
  const [editingItem, setEditingItem] = useState(null);
  const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [currentGroup, setCurrentGroup] = useState(null);

  // Tasks
  const [viewMode, setViewMode] = useState('kanban');
  const [filterScope, setFilterScope] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Forms
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    leader_id: '',
    meeting_day: '',
    meeting_time: '',
    location: '',
    address: '',
    phone: '',
    email: '',
    materials: []
  });

  const [personForm, setPersonForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    group_id: ''
  });

  const [taskForm, setTaskForm] = useState({
    id: null,
    title: '',
    description: '',
    due_date: '',
    assigned_to: null,
    status: 'Do zrobienia',
    attachment: null,
    group_id: null
  });

  const [materialForm, setMaterialForm] = useState({
    title: '',
    type: 'Dokument',
    attachment: null
  });

  const [attachMemberId, setAttachMemberId] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Comments
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // Finance data
  const [budgetItems, setBudgetItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    payment_date: '',
    amount: '',
    contractor: '',
    category: 'Grupy domowe',
    description: '',
    detailed_description: '',
    responsible_person: '',
    documents: [],
    tags: [],
    ministry: 'Grupy domowe'
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
    const ministryName = 'Grupy domowe';

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [groupsRes, leadersRes, membersRes, tasksRes] = await Promise.all([
        supabase.from('home_groups').select('*, home_group_leaders(full_name)').order('name'),
        supabase.from('home_group_leaders').select('*').order('full_name'),
        supabase.from('home_group_members').select('*, home_groups(name)').order('full_name'),
        supabase.from('home_group_tasks').select('*').order('due_date')
      ]);

      if (groupsRes.data) setGroups(groupsRes.data);
      if (leadersRes.data) setLeaders(leadersRes.data);
      if (membersRes.data) setMembers(membersRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Błąd pobierania danych: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name?.trim()) {
      alert('Podaj nazwę grupy');
      return;
    }

    try {
      const payload = {
        name: groupForm.name,
        description: groupForm.description || null,
        leader_id: groupForm.leader_id || null,
        meeting_day: groupForm.meeting_day || null,
        meeting_time: groupForm.meeting_time || null,
        location: groupForm.location || null,
        address: groupForm.address || null,
        phone: groupForm.phone || null,
        email: groupForm.email || null,
        materials: groupForm.materials || []
      };

      if (editingItem) {
        const { error } = await supabase
          .from('home_groups')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('home_groups')
          .insert([payload]);
        if (error) throw error;
      }

      fetchData();
      closeModal();
    } catch (error) {
      console.error('Error saving group:', error);
      alert('Błąd zapisywania grupy: ' + error.message);
    }
  };

  const handleSavePerson = async (type) => {
    if (!personForm.full_name?.trim()) {
      alert('Podaj imię i nazwisko');
      return;
    }

    try {
      const payload = {
        full_name: personForm.full_name,
        email: personForm.email || null,
        phone: personForm.phone || null
      };

      if (type === 'member') {
        payload.group_id = personForm.group_id || null;
      }

      const table = type === 'leader' ? 'home_group_leaders' : 'home_group_members';

      if (editingItem) {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(table)
          .insert([payload]);
        if (error) throw error;
      }

      fetchData();
      closeModal();
    } catch (error) {
      console.error('Error saving person:', error);
      alert('Błąd zapisywania: ' + error.message);
    }
  };

  const handleDelete = async (id, type) => {
    if (!confirm('Czy na pewno chcesz usunąć?')) return;

    try {
      const table = type === 'group' ? 'home_groups'
        : type === 'leader' ? 'home_group_leaders'
        : 'home_group_members';

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Błąd usuwania: ' + error.message);
    }
  };

  const openModal = (type, item = null) => {
    setModalType(type);
    setEditingItem(item);

    if (type === 'group') {
      setGroupForm(item ? {
        name: item.name || '',
        description: item.description || '',
        leader_id: item.leader_id || '',
        meeting_day: item.meeting_day || '',
        meeting_time: item.meeting_time || '',
        location: item.location || '',
        address: item.address || '',
        phone: item.phone || '',
        email: item.email || '',
        materials: item.materials || []
      } : {
        name: '',
        description: '',
        leader_id: '',
        meeting_day: '',
        meeting_time: '',
        location: '',
        address: '',
        phone: '',
        email: '',
        materials: []
      });
    } else {
      setPersonForm(item ? {
        full_name: item.full_name || '',
        email: item.email || '',
        phone: item.phone || '',
        group_id: item.group_id || ''
      } : {
        full_name: '',
        email: '',
        phone: '',
        group_id: ''
      });
    }

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  // Task functions
  const openTaskModal = (task = null) => {
    if (task) {
      setTaskForm(task);
      if (task.id) {
        fetchTaskComments(task.id);
      }
    } else {
      setTaskForm({
        id: null,
        title: '',
        description: '',
        due_date: '',
        assigned_to: null,
        status: 'Do zrobienia',
        attachment: null,
        group_id: null
      });
      setComments([]);
    }
    setShowTaskModal(true);
  };

  const saveTask = async () => {
    if (!taskForm.title?.trim()) {
      alert('Tytuł zadania jest wymagany');
      return;
    }

    try {
      const taskData = {
        title: taskForm.title,
        description: taskForm.description || null,
        status: taskForm.status || 'Do zrobienia',
        due_date: taskForm.due_date || null,
        assigned_to: taskForm.assigned_to || null,
        attachment: taskForm.attachment || null,
        group_id: taskForm.group_id || null
      };

      if (taskForm.id) {
        const { error } = await supabase.from('home_group_tasks').update(taskData).eq('id', taskForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('home_group_tasks').insert([taskData]).select();
        if (error) throw error;
        if (data && data[0]) {
          setTaskForm({...taskForm, id: data[0].id});
        }
      }

      fetchData();
    } catch (err) {
      console.error('Błąd zapisywania zadania:', err);
      alert('Błąd zapisywania zadania: ' + err.message);
    }
  };

  const deleteTask = async (id) => {
    if (!confirm('Czy na pewno chcesz usunąć to zadanie?')) return;

    try {
      const { error } = await supabase.from('home_group_tasks').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Błąd usuwania zadania:', err);
      alert('Błąd usuwania zadania: ' + err.message);
    }
  };

  const toggleTaskCompletion = async (task) => {
    const newStatus = task.status === 'Gotowe' ? 'Do zrobienia' : 'Gotowe';
    const updatedTasks = tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t);
    setTasks(updatedTasks);

    try {
      const { error } = await supabase
        .from('home_group_tasks')
        .update({ status: newStatus })
        .eq('id', task.id);

      if (error) throw error;
    } catch (err) {
      console.error('Błąd aktualizacji zadania:', err);
      fetchData();
    }
  };

  const handleDragStart = (task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e, status) => {
    e.preventDefault();
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTask || draggedTask.status === newStatus) {
      setDraggedTask(null);
      return;
    }

    try {
      const { error } = await supabase.from('home_group_tasks').update({ status: newStatus }).eq('id', draggedTask.id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Błąd aktualizacji zadania:', err);
    }

    setDraggedTask(null);
  };

  const fetchTaskComments = async (taskId) => {
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from('home_group_task_comments')
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
      const { error } = await supabase.from('home_group_task_comments').insert([{
        task_id: taskForm.id,
        content: newComment,
        author_name: currentUserEmail || 'Użytkownik'
      }]);

      if (error) throw error;

      setNewComment('');
      fetchTaskComments(taskForm.id);
    } catch (err) {
      console.error('Błąd dodawania komentarza:', err);
      alert('Błąd dodawania komentarza: ' + err.message);
    }
  };

  const getFilteredTasks = () => {
    return tasks.filter(task => {
      if (filterScope === 'mine' && task.assigned_to !== currentUserEmail) return false;
      if (filterStatus === 'active' && task.status === 'Gotowe') return false;
      if (filterStatus === 'completed' && task.status !== 'Gotowe') return false;
      return true;
    });
  };

  const filteredTasks = getFilteredTasks();

  // Members modal functions
  const attachMemberToGroup = async () => {
    if (!attachMemberId) {
      alert('Wybierz członka');
      return;
    }

    try {
      const { error } = await supabase
        .from('home_group_members')
        .update({ group_id: currentGroup.id })
        .eq('id', attachMemberId);

      if (error) throw error;
      setAttachMemberId(null);
      fetchData();
    } catch (err) {
      console.error('Błąd dodawania członka:', err);
      alert('Błąd dodawania członka: ' + err.message);
    }
  };

  const detachMemberFromGroup = async (memberId) => {
    if (!confirm('Czy na pewno chcesz odłączyć członka od tej grupy?')) return;

    try {
      const { error } = await supabase
        .from('home_group_members')
        .update({ group_id: null })
        .eq('id', memberId);

      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Błąd odłączania członka:', err);
      alert('Błąd odłączania członka: ' + err.message);
    }
  };

  // Materials functions
  const addMaterial = async () => {
    if (!materialForm.title?.trim()) {
      alert('Podaj nazwę materiału');
      return;
    }

    setUploading(true);
    try {
      let attachmentUrl = null;

      if (materialForm.attachment) {
        const fileName = `${Date.now()}_${materialForm.attachment.name}`;
        const { error: uploadError } = await supabase.storage
          .from('kids-materials')
          .upload(fileName, materialForm.attachment);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('kids-materials')
          .getPublicUrl(fileName);

        attachmentUrl = urlData.publicUrl;
      }

      const newMaterial = {
        id: Date.now().toString(),
        title: materialForm.title,
        type: materialForm.type,
        attachmentUrl
      };

      const updatedMaterials = [...(currentGroup.materials || []), newMaterial];

      const { error } = await supabase
        .from('home_groups')
        .update({ materials: updatedMaterials })
        .eq('id', currentGroup.id);

      if (error) throw error;

      setMaterialForm({ title: '', type: 'Dokument', attachment: null });
      fetchData();
    } catch (err) {
      console.error('Błąd dodawania materiału:', err);
      alert('Błąd dodawania materiału: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteMaterial = async (materialId) => {
    if (!confirm('Czy na pewno chcesz usunąć ten materiał?')) return;

    try {
      const updatedMaterials = (currentGroup.materials || []).filter(m => m.id !== materialId);

      const { error } = await supabase
        .from('home_groups')
        .update({ materials: updatedMaterials })
        .eq('id', currentGroup.id);

      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Błąd usuwania materiału:', err);
      alert('Błąd usuwania materiału: ' + err.message);
    }
  };

  // Filtered data
  const filteredGroups = groups.filter(g =>
    g.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLeaders = leaders.filter(l =>
    l.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMembers = members.filter(m =>
    m.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupMembers = members.filter(m => m.group_id === currentGroup?.id);
  const availableMembers = members.filter(m => !m.group_id);

  const materialTypeOptions = [
    { value: 'Dokument', label: 'Dokument' },
    { value: 'Video', label: 'Video' },
    { value: 'Audio', label: 'Audio' },
    { value: 'Prezentacja', label: 'Prezentacja' },
    { value: 'Inne', label: 'Inne' }
  ];

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          Grupy Domowe
        </h1>
      </div>

      {/* Tabs */}
      <ResponsiveTabs
        tabs={[
          { id: 'groups', label: 'Grupy', icon: Users },
          { id: 'tasks', label: 'Zadania', icon: CheckSquare },
          { id: 'leaders', label: 'Liderzy', icon: UserPlus },
          ...(hasTabAccess('homegroups', 'members', userRole) ? [{ id: 'members', label: 'Członkowie', icon: Users }] : []),
          ...(hasTabAccess('homegroups', 'finances', userRole) ? [{ id: 'finances', label: 'Finanse', icon: DollarSign }] : []),
          { id: 'events', label: 'Wydarzenia', icon: Calendar },
          ...(hasTabAccess('homegroups', 'equipment', userRole) ? [{ id: 'equipment', label: 'Wyposażenie', icon: Package }] : []),
          { id: 'files', label: 'Pliki', icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* GROUPS TAB */}
      {activeTab === 'groups' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
              Grupy Domowe ({filteredGroups.length})
            </h2>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Szukaj..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                />
              </div>
              <button
                onClick={() => openModal('group')}
                className="bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"
              >
                <Plus size={18} />
                Dodaj Grupę
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group) => {
              const memberCount = members.filter(m => m.group_id === group.id).length;
              const leader = leaders.find(l => l.id === group.leader_id);

              return (
                <div key={group.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 hover:shadow-lg transition">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{group.name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openModal('group', group)}
                        className="p-1.5 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-gray-800 rounded-lg"
                      >
                        <FileText size={16}/>
                      </button>
                      <button
                        onClick={() => handleDelete(group.id, 'group')}
                        className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-800 rounded-lg"
                      >
                        <Trash2 size={16}/>
                      </button>
                    </div>
                  </div>

                  {group.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{group.description}</p>
                  )}

                  <div className="space-y-2 mb-4">
                    {leader && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <UserPlus size={14} />
                        <span>{leader.full_name}</span>
                      </div>
                    )}
                    {group.meeting_day && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Calendar size={14} />
                        <span>{group.meeting_day} {group.meeting_time && `o ${group.meeting_time}`}</span>
                      </div>
                    )}
                    {group.location && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <MapPin size={14} />
                        <span>{group.location}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 border-t border-gray-100 dark:border-gray-700 pt-3 mt-2">
                    <button
                      onClick={() => { setCurrentGroup(group); setShowGroupMembersModal(true); }}
                      className="flex-1 bg-pink-50 dark:bg-gray-800 text-pink-700 dark:text-pink-300 text-xs font-bold py-2 rounded-xl hover:bg-pink-100 dark:hover:bg-gray-700 transition flex items-center justify-center gap-1"
                    >
                      <Users size={14}/> Członkowie ({memberCount})
                    </button>
                    <button
                      onClick={() => { setCurrentGroup(group); setShowMaterialsModal(true); }}
                      className="flex-1 bg-orange-50 dark:bg-gray-800 text-orange-700 dark:text-orange-300 text-xs font-bold py-2 rounded-xl hover:bg-orange-100 dark:hover:bg-gray-700 transition flex items-center justify-center gap-1"
                    >
                      <BookOpen size={14}/> Materiały ({group.materials?.length || 0})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TASKS TAB */}
      {activeTab === 'tasks' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-4 lg:p-6 transition-colors">
          {/* Mobile: 2 rows, Desktop: 1 row */}
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
            {/* Row 1: Title + Add button (mobile) / Title (desktop) */}
            <div className="flex justify-between items-center">
              <h2 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
                Zadania ({filteredTasks.length})
              </h2>
              {/* Mobile only: Add button */}
              <button onClick={() => openTaskModal(null)} className="lg:hidden bg-gradient-to-r from-orange-600 to-pink-600 text-white p-2.5 rounded-xl font-medium hover:shadow-lg transition"><Plus size={20}/></button>
            </div>

            {/* Row 2: Filters (mobile) / Filters + Add button (desktop) */}
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 gap-1 lg:gap-2 items-center flex-1 lg:flex-none">
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
              <button
                onClick={() => openTaskModal(null)}
                className="hidden lg:flex bg-gradient-to-r from-orange-600 to-pink-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition items-center gap-2 whitespace-nowrap"
              >
                <Plus size={18}/> Dodaj zadanie
              </button>
            </div>
          </div>

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
                      {filteredTasks.filter(t => t.status === status).length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {filteredTasks.filter(t => t.status === status).map(task => (
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
                                  {leaders.find(m => m.id === task.assigned_to)?.full_name}
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
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'list' && (
            <div className="bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[700px]">
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
                  {filteredTasks.map(task => (
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
                        {leaders.find(m => m.id === task.assigned_to)?.full_name || '-'}
                      </td>
                      <td className="p-4">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {task.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => openTaskModal(task)}
                          className="text-pink-600 dark:text-pink-400 font-medium"
                        >
                          Szczegóły
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* LEADERS TAB */}
      {activeTab === 'leaders' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Liderzy ({filteredLeaders.length})
            </h2>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Szukaj..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                />
              </div>
              <button
                onClick={() => openModal('leader')}
                className="bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"
              >
                <Plus size={18} />
                Dodaj Lidera
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead className="text-gray-700 dark:text-gray-400 font-bold border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="p-4">Imię i nazwisko</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Telefon</th>
                  <th className="p-4 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredLeaders.map((leader) => (
                  <tr key={leader.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                    <td className="p-4 font-medium text-gray-800 dark:text-gray-200">{leader.full_name}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{leader.email || '-'}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{leader.phone || '-'}</td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button
                        onClick={() => openModal('leader', leader)}
                        className="text-pink-600 dark:text-pink-400 font-medium hover:underline"
                      >
                        Edytuj
                      </button>
                      <button
                        onClick={() => handleDelete(leader.id, 'leader')}
                        className="text-red-500 dark:text-red-400 font-medium hover:underline"
                      >
                        Usuń
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredLeaders.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-6 text-center text-gray-400 dark:text-gray-500">
                      Brak liderów
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Członkowie ({filteredMembers.length})
            </h2>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Szukaj..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                />
              </div>
              <button
                onClick={() => openModal('member')}
                className="bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"
              >
                <Plus size={18} />
                Dodaj Członka
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[700px]">
              <thead className="text-gray-700 dark:text-gray-400 font-bold border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="p-4">Imię i nazwisko</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Telefon</th>
                  <th className="p-4">Grupa</th>
                  <th className="p-4 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                    <td className="p-4 font-medium text-gray-800 dark:text-gray-200">{member.full_name}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{member.email || '-'}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{member.phone || '-'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${member.group_id ? 'bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                        {groups.find(g => g.id === member.group_id)?.name || '-'}
                      </span>
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button
                        onClick={() => openModal('member', member)}
                        className="text-pink-600 dark:text-pink-400 font-medium hover:underline"
                      >
                        Edytuj
                      </button>
                      <button
                        onClick={() => handleDelete(member.id, 'member')}
                        className="text-red-500 dark:text-red-400 font-medium hover:underline"
                      >
                        Usuń
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-gray-400 dark:text-gray-500">
                      Brak członków
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* FINANCES TAB */}
      {activeTab === 'finances' && (
        <FinanceTab
          ministry="Grupy domowe"
          budgetItems={budgetItems}
          expenses={expenses}
          onAddExpense={() => setShowExpenseModal(true)}
          onRefresh={fetchFinanceData}
        />
      )}

      {/* EVENTS TAB */}
      {activeTab === 'events' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 relative z-[50] transition-colors">
          <EventsTab ministry="homegroups" currentUserEmail={currentUserEmail} />
        </section>
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden transition-colors">
          <MaterialsTab moduleKey="homegroups" canEdit={true} />
        </section>
      )}

      {/* EQUIPMENT TAB */}
      {activeTab === 'equipment' && (
        <EquipmentTab
          ministryKey="homegroups"
          currentUserEmail={currentUserEmail}
          canEdit={hasTabAccess('homegroups', 'equipment', userRole)}
        />
      )}

      {/* MODAL: Group/Leader/Member */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-white/20 dark:border-gray-700 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-2xl bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
                {editingItem ? 'Edytuj' : 'Dodaj'} {modalType === 'group' ? 'Grupę' : modalType === 'leader' ? 'Lidera' : 'Członka'}
              </h3>
              <button onClick={closeModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {modalType === 'group' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nazwa grupy</label>
                    <input
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                      value={groupForm.name}
                      onChange={(e) => setGroupForm({...groupForm, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Opis</label>
                    <textarea
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none resize-none"
                      rows={3}
                      value={groupForm.description}
                      onChange={(e) => setGroupForm({...groupForm, description: e.target.value})}
                    />
                  </div>
                  <div>
                    <CustomSelect
                      label="Lider"
                      value={groupForm.leader_id}
                      onChange={(val) => setGroupForm({...groupForm, leader_id: val})}
                      options={[
                        { value: '', label: 'Brak' },
                        ...leaders.map(l => ({ value: l.id, label: l.full_name }))
                      ]}
                      placeholder="Wybierz lidera..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Dzień spotkania</label>
                      <input
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                        value={groupForm.meeting_day}
                        onChange={(e) => setGroupForm({...groupForm, meeting_day: e.target.value})}
                        placeholder="np. Poniedziałek"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Godzina</label>
                      <input
                        type="time"
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                        value={groupForm.meeting_time}
                        onChange={(e) => setGroupForm({...groupForm, meeting_time: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Lokalizacja</label>
                    <input
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                      value={groupForm.location}
                      onChange={(e) => setGroupForm({...groupForm, location: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Adres</label>
                    <input
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                      value={groupForm.address}
                      onChange={(e) => setGroupForm({...groupForm, address: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Telefon</label>
                      <input
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                        value={groupForm.phone}
                        onChange={(e) => setGroupForm({...groupForm, phone: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Email</label>
                      <input
                        type="email"
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                        value={groupForm.email}
                        onChange={(e) => setGroupForm({...groupForm, email: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Imię i nazwisko</label>
                    <input
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                      value={personForm.full_name}
                      onChange={(e) => setPersonForm({...personForm, full_name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                      value={personForm.email}
                      onChange={(e) => setPersonForm({...personForm, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Telefon</label>
                    <input
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none"
                      value={personForm.phone}
                      onChange={(e) => setPersonForm({...personForm, phone: e.target.value})}
                    />
                  </div>
                  {modalType === 'member' && (
                    <div>
                      <CustomSelect
                        label="Grupa"
                        value={personForm.group_id}
                        onChange={(val) => setPersonForm({...personForm, group_id: val})}
                        options={[
                          { value: '', label: 'Brak' },
                          ...groups.map(g => ({ value: g.id, label: g.name }))
                        ]}
                        placeholder="Wybierz grupę..."
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium rounded-xl transition"
              >
                Anuluj
              </button>
              <button
                onClick={() => modalType === 'group' ? handleSaveGroup() : handleSavePerson(modalType)}
                className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white font-bold rounded-xl hover:shadow-lg transition"
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Group Members */}
      {showGroupMembersModal && currentGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-3xl border border-white/20 dark:border-gray-700 flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">
                Członkowie: {currentGroup.name}
              </h3>
              <button onClick={() => setShowGroupMembersModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-pink-50 dark:bg-gray-800 p-4 rounded-xl mb-4 flex gap-3 items-end">
                <div className="flex-1">
                  <CustomSelect
                    label="Dodaj członka"
                    value={attachMemberId}
                    onChange={setAttachMemberId}
                    options={[
                      { value: null, label: 'Wybierz...' },
                      ...availableMembers.map(m => ({ value: m.id, label: m.full_name }))
                    ]}
                    placeholder="Wybierz..."
                  />
                </div>
                <button
                  onClick={attachMemberToGroup}
                  className="bg-pink-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-pink-700 h-[46px]"
                >
                  Dodaj
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="p-3">Imię</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Telefon</th>
                      <th className="p-3">Akcja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {groupMembers.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200">
                        <td className="p-3 font-medium">{m.full_name}</td>
                        <td className="p-3">{m.email || '-'}</td>
                        <td className="p-3">{m.phone || '-'}</td>
                        <td className="p-3">
                          <button
                            onClick={() => detachMemberFromGroup(m.id)}
                            className="text-red-500 dark:text-red-400 hover:underline text-xs uppercase font-bold"
                          >
                            Odłącz
                          </button>
                        </td>
                      </tr>
                    ))}
                    {groupMembers.length === 0 && (
                      <tr>
                        <td colSpan="4" className="p-6 text-center text-gray-400 dark:text-gray-500">
                          Brak członków w tej grupie
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Materials */}
      {showMaterialsModal && currentGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-white/20 dark:border-gray-700 flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Materiały: {currentGroup.name}</h3>
              <button onClick={() => setShowMaterialsModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-orange-50 dark:bg-gray-800 p-4 rounded-xl mb-4 space-y-2">
                <input
                  className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                  placeholder="Nazwa"
                  value={materialForm.title}
                  onChange={(e) => setMaterialForm({...materialForm, title: e.target.value})}
                />
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <CustomSelect
                      value={materialForm.type}
                      onChange={(val) => setMaterialForm({...materialForm, type: val})}
                      options={materialTypeOptions}
                    />
                  </div>
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={(e) => setMaterialForm({...materialForm, attachment: e.target.files[0]})}
                  />
                  <button
                    onClick={() => document.getElementById('file-upload').click()}
                    className={`border px-4 rounded-xl flex items-center gap-2 h-[46px] transition ${materialForm.attachment ? 'bg-orange-100 border-orange-300 text-orange-700' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-500 text-gray-600 dark:text-gray-300'}`}
                  >
                    <Upload size={16}/> {materialForm.attachment ? 'Plik wybrany' : 'Plik'}
                  </button>
                  <button
                    onClick={addMaterial}
                    disabled={uploading}
                    className="bg-orange-600 text-white px-6 rounded-xl font-bold hover:bg-orange-700 h-[46px] disabled:opacity-50"
                  >
                    {uploading ? '...' : 'Dodaj'}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {(currentGroup.materials || []).map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-100 dark:bg-orange-900/40 p-2 rounded-lg text-orange-600 dark:text-orange-300">
                        <BookOpen size={18}/>
                      </div>
                      <div>
                        <div className="font-bold text-gray-800 dark:text-gray-200">{m.title}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{m.type}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {m.attachmentUrl && (
                        <a
                          href={m.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-orange-600 hover:bg-orange-50 p-2 rounded-lg"
                        >
                          <LinkIcon size={18}/>
                        </a>
                      )}
                      <button
                        onClick={() => deleteMaterial(m.id)}
                        className="text-red-400 hover:bg-red-50 p-2 rounded-lg"
                      >
                        <Trash2 size={18}/>
                      </button>
                    </div>
                  </div>
                ))}
                {(!currentGroup.materials || currentGroup.materials.length === 0) && (
                  <div className="text-center text-gray-400 dark:text-gray-500 py-8">
                    Brak materiałów
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Task */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto transition-opacity">
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-4xl p-0 border border-white/20 dark:border-gray-700/50 my-8 flex overflow-hidden h-[80vh] animate-in fade-in zoom-in duration-200">

            <div className="w-3/5 p-8 overflow-y-auto border-r border-gray-200/50 dark:border-gray-700/50 custom-scrollbar">
              <div className="flex justify-between mb-6">
                <h3 className="font-bold text-2xl bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
                  {taskForm.id ? 'Edycja zadania' : 'Nowe zadanie'}
                </h3>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tytuł zadania</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({...taskForm, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Opis</label>
                  <textarea
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm resize-none h-32 focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({...taskForm, description: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <CustomDatePicker
                      label="Termin"
                      value={taskForm.due_date}
                      onChange={(val) => setTaskForm({...taskForm, due_date: val})}
                    />
                  </div>
                  <div>
                    <CustomSelect
                      label="Status"
                      value={taskForm.status}
                      onChange={(val) => setTaskForm({...taskForm, status: val})}
                      options={STATUSES}
                    />
                  </div>
                </div>
                <div>
                  <CustomSelect
                    label="Przypisana osoba"
                    value={taskForm.assigned_to}
                    onChange={(val) => setTaskForm({...taskForm, assigned_to: val})}
                    options={[
                      { value: null, label: 'Nie przypisano' },
                      ...leaders.map(m => ({ value: m.id, label: m.full_name }))
                    ]}
                    placeholder="Wybierz osobę..."
                  />
                </div>
                <div>
                  <CustomSelect
                    label="Grupa"
                    value={taskForm.group_id}
                    onChange={(val) => setTaskForm({...taskForm, group_id: val})}
                    options={[
                      { value: null, label: 'Brak' },
                      ...groups.map(g => ({ value: g.id, label: g.name }))
                    ]}
                    placeholder="Wybierz grupę..."
                  />
                </div>
                <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                  {taskForm.id && (
                    <button
                      onClick={() => { deleteTask(taskForm.id); setShowTaskModal(false); }}
                      className="px-4 py-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                    >
                      Usuń zadanie
                    </button>
                  )}
                  <button
                    onClick={saveTask}
                    className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white font-bold rounded-xl hover:shadow-lg transition"
                  >
                    Zapisz zmiany
                  </button>
                </div>
              </div>
            </div>

            <div className="w-2/5 bg-gray-50/50 dark:bg-gray-800/30 p-6 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <MessageSquare size={18}/> Komentarze
                </h4>
                <button onClick={() => setShowTaskModal(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition">
                  <X size={20} className="text-gray-500 dark:text-gray-400"/>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
                {!taskForm.id ? (
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
              {taskForm.id && (
                <div className="mt-auto">
                  <div className="relative">
                    <textarea
                      className="w-full pl-4 pr-12 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:ring-2 focus:ring-pink-500/20 outline-none text-sm resize-none text-gray-800 dark:text-gray-200"
                      placeholder="Napisz komentarz..."
                      rows={2}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); }}}
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
        </div>
      )}

      {/* MODAL: Add Expense */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">
                Dodaj wydatek - {expenseForm.ministry}
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Data</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={expenseForm.payment_date}
                  onChange={(e) => setExpenseForm({...expenseForm, payment_date: e.target.value})}
                />
              </div>
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
              <CustomSelect
                label="Pozycja budżetowa"
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
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Szczegółowy opis</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={expenseForm.detailed_description}
                  onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
                  placeholder="Dodatkowe informacje..."
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
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowExpenseModal(false)}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Anuluj
              </button>
              <button
                onClick={saveExpense}
                className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition"
              >
                Zapisz wydatek
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
