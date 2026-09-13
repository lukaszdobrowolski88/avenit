import React, { useState, useEffect, useRef } from 'react';
import Spinner from '../components/Spinner';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Trash2, X, Calendar, User, Users,
  Check, UserX, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, HeartHandshake, DollarSign, Tag, Upload, FileText, FolderOpen, Package
} from 'lucide-react';
import FinanceTab from './shared/FinanceTab';
import EventsTab from './shared/EventsTab';
import EventScheduleTab from './shared/ScheduleTab';
import MaterialsTab from './shared/MaterialsTab';
import EquipmentTab from './shared/EquipmentTab';
import RolesTab from '../components/RolesTab';
import CustomSelect from '../components/CustomSelect';
import ResponsiveTabs from '../components/ResponsiveTabs';
import PageHeader from '../components/PageHeader';
import { CampusBadge, useCampusBadge } from '../components/CampusBadge';
import { useUserRole } from '../hooks/useUserRole';
import { useScheduleAssignments } from '../hooks/useScheduleAssignments';
import ScheduleSendButton from '../components/ScheduleSendButton';
import { useTabAccess } from '../components/Can';
import { useCampusQuery } from '../hooks/useCampusQuery';
import { useT } from '../i18n';
import { tr } from '../i18n';
import { toast } from '../lib/toast';

// --- UI COMPONENTS (PORTALS) ---

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
          ${isOpen ? 'border-accent-primary-light ring-2 ring-accent-primary-light/20 dark:border-accent-primary-light' : 'border-gray-200/50 dark:border-gray-700/50 hover:border-accent-primary-light dark:hover:border-accent-primary'}
        `}
      >
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={16} className="text-gray-400" />
          <span className={value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
            {value ? new Date(value).toLocaleDateString('pl-PL') : tr('Wybierz datę')}
          </span>
        </div>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="portal-datepicker fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 animate-in fade-in zoom-in-95 duration-100 w-[280px]"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1))); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><ChevronLeft size={18} className="text-gray-600 dark:text-gray-400"/></button>
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">{monthName}</span>
            <button onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1))); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><ChevronRight size={18} className="text-gray-600 dark:text-gray-400"/></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {[tr('Pn'), tr('Wt'), tr('Śr'), tr('Cz'), tr('Pt'), tr('So'), tr('Nd')].map(d => <div key={d} className="text-[10px] font-bold text-gray-400 uppercase">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isSelected = value === dateStr;
              return (
                <button
                  key={day}
                  onClick={(e) => { e.stopPropagation(); handleDayClick(day); }}
                  className={`h-8 w-8 rounded-lg text-xs font-medium transition ${isSelected ? 'bg-accent-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
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

// --- MAIN MODULE ---

export default function AtmosferaTeamModule() {
  const t = useT();
  const { userRole } = useUserRole();
  const hasTabAccess = useTabAccess();
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const [activeTab, setActiveTab] = useState('schedule');
  const [team, setTeam] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  // Powiadomienia grafiku (ten sam silnik co Grupa Uwielbienia): mail + push + akceptacja.
  const { assignments: schedAssignments, fetchAssignmentsForPrograms, createAssignment, removeAssignment, sendInvitesForProgram } = useScheduleAssignments();
  useEffect(() => {
    const ids = programs.map((p) => p.id).filter(Boolean);
    if (ids.length) fetchAssignmentsForPrograms(ids);
  }, [programs, fetchAssignmentsForPrograms]);

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ id: null, full_name: '', role: 'Atmosfera', email: '', phone: '' });
  const [selectedMemberRoles, setSelectedMemberRoles] = useState([]);

  // Służby z team_roles
  const [atmosferaRoles, setAtmosferaRoles] = useState([]);
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
    category: 'AtmosferaTeam',
    description: '',
    detailed_description: '',
    responsible_person: '',
    documents: [],
    tags: [],
    ministry: 'AtmosferaTeam'
  });

  useEffect(() => {
    fetchData();
    fetchAtmosferaRoles();
    getCurrentUser();
  }, [selectedCampusId]);

  async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      setCurrentUserEmail(data.user.email);
    }
  }

  useEffect(() => {
    if (activeTab === 'finances') {
      fetchFinanceData();
    }
  }, [activeTab, selectedCampusId]);

  const fetchAtmosferaRoles = async () => {
    try {
      const { data: rolesData } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', 'atmosfera')
        .eq('is_active', true)
        .order('display_order');
      setAtmosferaRoles(rolesData || []);

      // Pobierz przypisania członków do służb
      const { data: memberRolesData } = await supabase
        .from('team_member_roles')
        .select('*')
        .eq('member_table', 'atmosfera_members');
      setMemberRoles(memberRolesData || []);
    } catch (err) {
      console.error('Błąd pobierania służb:', err);
    }
  };

  const fetchFinanceData = async () => {
    const currentYear = new Date().getFullYear();
    const ministryName = 'AtmosferaTeam';

    try {
      const { data: budget, error: budgetError } = await withCampusFilter(supabase
        .from('budget_items')
        .select('*'))
        .eq('team_type', ministryName)
        .eq('year', currentYear)
        .order('id', { ascending: true });

      if (budgetError) throw budgetError;
      setBudgetItems(budget || []);

      const { data: exp, error: expError } = await supabase
        .from('expense_transactions')
        .select('*')
        .eq('team_type', ministryName)
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
      toast.error(tr('Błąd przesyłania pliku: ') + error.message);
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
      toast.error(tr('Wypełnij wymagane pola'));
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
        team_type: expenseForm.ministry
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
      toast.error(tr('Błąd zapisywania: ') + error.message);
    }
  };

  async function fetchData() {
    setLoading(true);
    try {
      // Zakładam, że używamy tej samej tabeli media_team lub nowej atmosfera_team. 
      // Jeśli nowej, trzeba zmienić nazwę tabeli. Tutaj używam 'atmosfera_team_members' (nowa tabela) lub 'media_team' z filtrowaniem?
      // Zróbmy nową tabelę 'atmosfera_team_members' dla porządku, albo użyjmy 'media_team' jeśli to jedna pula ludzi.
      // W Twoim opisie nie ma info o bazie, więc założę tabelę 'atmosfera_members'.
      
      let { data: teamData, error: teamError } = await supabase.from('atmosfera_members').select('*').order('full_name');
      
      // Fallback: jeśli tabela nie istnieje, spróbujmy pobrać pustą listę żeby nie wywalić błędu
      if (teamError && teamError.code === '42P01') { // undefined table
         console.warn("Tabela atmosfera_members nie istnieje. Używam pustej listy.");
         teamData = [];
      } else if (teamError) throw teamError;

      const { data: progData, error: progError } = await withCampusFilter(supabase
        .from('programs')
        .select('*'))
        .order('date', { ascending: false });

      if (progError) throw progError;
      
      setTeam(teamData || []);
      setPrograms(progData || []);
    } catch (err) {
      console.error('Błąd:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleProgramUpdate = async (id, updates) => {
    setPrograms(prev => prev.map(p => {
      if (p.id === id) {
        if (updates.atmosfera_team) {
          return { ...p, ...updates, atmosfera_team: { ...p.atmosfera_team, ...updates.atmosfera_team } };
        }
        return { ...p, ...updates };
      }
      return p;
    }));
    await supabase.from('programs').update(updates).eq('id', id);
  };

  const saveMember = async () => {
    try {
      if (!memberForm.full_name.trim()) return toast.error(tr('Imię wymagane'));
      let memberId = memberForm.id;

      if (memberForm.id) {
        const { error } = await supabase.from('atmosfera_members').update({
          full_name: memberForm.full_name,
          role: memberForm.role,
          email: memberForm.email,
          phone: memberForm.phone
        }).eq('id', memberForm.id);
        if (error) throw error;
      } else {
        const { data: newMember, error } = await supabase.from('atmosfera_members').insert([{
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
        await supabase
          .from('team_member_roles')
          .delete()
          .eq('member_id', String(memberId))
          .eq('member_table', 'atmosfera_members');

        if (selectedMemberRoles.length > 0) {
          const assignments = selectedMemberRoles.map(roleId => ({
            member_id: String(memberId),
            member_table: 'atmosfera_members',
            role_id: roleId
          }));
          await supabase.from('team_member_roles').insert(assignments);
        }
      }

      setShowMemberModal(false);
      setSelectedMemberRoles([]);
      fetchData();
      fetchAtmosferaRoles();
    } catch (err) {
      toast.error(tr('Błąd zapisu: ') + err.message);
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
    return atmosferaRoles
      .filter(r => roleIds.includes(r.id))
      .map(r => r.name);
  };

  const deleteMember = async (id) => {
    if (!confirm(tr('Usunąć?'))) return;
    try {
      const { error } = await supabase.from('atmosfera_members').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      toast.error(tr('Błąd: ') + err.message);
    }
  };

  if (loading) return <div className="p-10 text-center"><Spinner size={48} className="mx-auto" /></div>;

  return (
    <div className="space-y-8">
      <PageHeader moduleKey="atmosfera" icon={HeartHandshake} title="Atmosfera Team" />

      {/* TAB NAVIGATION */}
      <ResponsiveTabs moduleKey="atmosfera"
        tabs={[
          { id: 'events', label: t('Wydarzenia'), icon: Calendar },
          { id: 'schedule', label: t('Grafik'), icon: Calendar },
          ...(hasTabAccess('atmosfera', 'members') ? [{ id: 'members', label: t('Członkowie'), icon: User }] : []),
          ...(hasTabAccess('atmosfera', 'finances') ? [{ id: 'finances', label: t('Finanse'), icon: DollarSign }] : []),
          ...(hasTabAccess('atmosfera', 'members') ? [{ id: 'roles', label: t('Służby'), icon: Users }] : []),
          ...(hasTabAccess('atmosfera', 'equipment') ? [{ id: 'equipment', label: t('Wyposażenie'), icon: Package }] : []),
          { id: 'files', label: t('Pliki'), icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* WYDARZENIA */}
      {activeTab === 'events' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 relative z-[50] transition-colors duration-300">
          <EventsTab ministry="atmosfera" currentUserEmail={currentUserEmail} />
        </section>
      )}

      {/* GRAFIK — nad wydarzeniami (twardy switch z programów) */}
      {activeTab === 'schedule' && (
      <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 relative z-[50] transition-colors duration-300">
        <EventScheduleTab moduleKey="atmosfera" />
      </section>
      )}

      {/* CZŁONKOWIE */}
      {activeTab === 'members' && (
      <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 relative z-[30] transition-colors duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Członkowie ({team.length})</h2>
          <button onClick={() => { setMemberForm({ id: null, full_name: '', role: 'Atmosfera', email: '', phone: '' }); setSelectedMemberRoles([]); setShowMemberModal(true); }} className="bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> Dodaj</button>
        </div>
        <div className="bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[700px]">
            <thead className="bg-gradient-to-r from-accent-primary-lightest/80 to-accent-secondary-lightest/80 dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
              <tr><th className="p-4">{tr('Imię i nazwisko')}</th><th className="p-4">{t('Służby')}</th><th className="p-4">{tr('Email')}</th><th className="p-4">{tr('Telefon')}</th><th className="p-4 text-right">{tr('Akcje')}</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
              {team.map(m => {
                const roleNames = getMemberRoleNames(m.id);
                return (
                  <tr key={m.id} className="hover:bg-accent-primary-lightest/30 dark:hover:bg-accent-primary-darkest/10 transition text-gray-700 dark:text-gray-300">
                    <td className="p-4 font-medium">{m.full_name}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {roleNames.length > 0 ? (
                          roleNames.map((name, idx) => (
                            <span key={idx} className="bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light px-2 py-0.5 rounded-lg text-xs font-medium border border-accent-primary-lighter dark:border-accent-primary-dark">
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
                      <button onClick={() => { setMemberForm(m); loadMemberRoles(m.id); setShowMemberModal(true); }} className="text-accent-primary dark:text-accent-primary-light font-medium">{tr('Edytuj')}</button>
                      <button onClick={() => deleteMember(m.id)} className="text-red-500 dark:text-red-400 font-medium">{tr('Usuń')}</button>
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
          ministry="AtmosferaTeam"
          budgetItems={budgetItems}
          expenses={expenses}
          onAddExpense={() => setShowExpenseModal(true)}
          onRefresh={fetchFinanceData}
        />
      )}

      {/* ROLES TAB */}
      {activeTab === 'roles' && (
        <RolesTab
          teamType="atmosfera"
          teamMembers={team}
          memberTable="atmosfera_members"
          onUpdate={fetchAtmosferaRoles}
        />
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-300">
          <MaterialsTab moduleKey="atmosfera" canEdit={true} />
        </section>
      )}

      {/* EQUIPMENT TAB */}
      {activeTab === 'equipment' && (
        <EquipmentTab
          ministryKey="atmosfera"
          currentUserEmail={currentUserEmail}
          canEdit={hasTabAccess('atmosfera', 'equipment')}
        />
      )}

      {/* MODAL CZŁONKA */}
      {showMemberModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{memberForm.id ? tr('Edytuj członka') : tr('Nowy członek')}</h3>
              <button onClick={() => setShowMemberModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Imię i nazwisko')}</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder={t('Jan Kowalski')} value={memberForm.full_name} onChange={e => setMemberForm({...memberForm, full_name: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Służby')}</label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
                  <div className="flex flex-wrap gap-2">
                    {atmosferaRoles.map(role => {
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
                              ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-md'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isSelected && <Check size={14} />}
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                  {atmosferaRoles.length === 0 && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-2">{t('Brak zdefiniowanych służb. Dodaj je w zakładce "Służby".')}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Telefon')}</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="+48 123 456 789" value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Email')}</label>
                  <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="jan@example.com" value={memberForm.email} onChange={e => setMemberForm({...memberForm, email: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowMemberModal(false)} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">{tr('Anuluj')}</button>
                <button onClick={saveMember} className="px-5 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg hover:shadow-accent-primary-light/50 transition font-medium">{tr('Zapisz')}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Add Expense */}
      {showExpenseModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl p-6 border border-gray-200 dark:border-gray-700 my-8">
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
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (PLN)')}</label>
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
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kontrahent')}</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.contractor}
                    onChange={(e) => setExpenseForm({...expenseForm, contractor: e.target.value})}
                    placeholder={t('Nazwa firmy/osoby')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Osoba odpowiedzialna')}</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.responsible_person}
                    onChange={(e) => setExpenseForm({...expenseForm, responsible_person: e.target.value})}
                    placeholder={t('Imię i nazwisko')}
                  />
                </div>
              </div>

              {/* Wiersz 3: Pozycja budżetowa (pełna szerokość) */}
              <div>
                <CustomSelect
                  label={tr('Pozycja budżetowa (opis kosztu)')}
                  value={expenseForm.description}
                  onChange={(value) => setExpenseForm({...expenseForm, description: value})}
                  options={[
                    { value: '', label: t('Wybierz pozycję') },
                    ...budgetItems.map(item => ({
                      value: item.description,
                      label: item.description
                    }))
                  ]}
                  placeholder={tr('Wybierz pozycję')}
                />
              </div>

              {/* Wiersz 4: Szczegółowy opis (pełna szerokość) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Szczegółowy opis')}</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={expenseForm.detailed_description}
                  onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
                  placeholder={tr('Dodatkowe informacje o wydatku...')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Załączniki (opcjonalnie)')}</label>
                <div className="space-y-2">
                  <label className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer hover:border-accent-primary-light dark:hover:border-accent-primary transition flex items-center gap-2">
                    <Upload size={18} className="text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {uploadingFile ? tr('Przesyłanie...') : 'Dodaj plik(i)'}
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
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Tagi')}</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder={tr('Dodaj tag')}
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
                      className="px-2 py-1 bg-accent-primary-lighter dark:bg-accent-primary-darkest text-accent-primary dark:text-accent-primary-light rounded-lg text-xs flex items-center gap-1"
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
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium"
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
