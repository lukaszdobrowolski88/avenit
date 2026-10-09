import { useLocation } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import ModuleBoard, { hasItemDeepLink } from './Boards/ModuleBoard';
import {
  Plus, X, FileText, Calendar, Users, CheckSquare, DollarSign, Upload, Star, Package
} from 'lucide-react';
import FinanceTab from './shared/FinanceTab';
import EventsTab from './shared/EventsTab';
import EquipmentTab from './shared/EquipmentTab';
import RolesTab from '../components/RolesTab';
import CustomSelect from '../components/CustomSelect';
import ResponsiveTabs from '../components/ResponsiveTabs';
import PageHeader from '../components/PageHeader';
import { Sparkles } from 'lucide-react';
import { useTabAccess } from '../components/Can';
import { useCampusQuery } from '../hooks/useCampusQuery';
import { useT } from '../i18n';
import { tr, appLocale } from '../i18n';
import { toast } from '../lib/toast';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import Button from '../components/Button';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../components/ui/DataTable';
import { confirmDialog } from '../lib/dialog';
import CustomDatePicker from '../components/CustomDatePicker';  // wspólne pole daty (wcześniej lokalna kopia bez ramki pola)

// Zadania żyją na Tablicy (ModuleBoard, zakładka „Zadania”) — stary kod mlodziezowka_tasks usunięty.

export default function MlodziezowkaModule() {
  const t = useT();
  const hasTabAccess = useTabAccess();
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
  const [activeTab, setActiveTab] = useState(() => (hasItemDeepLink() ? 'tasks' : 'events'));
  const { search: locationSearch } = useLocation();
  useEffect(() => { if (hasItemDeepLink()) setActiveTab('tasks'); }, [locationSearch]); // link z powiadomienia na tej samej stronie
  const [members, setMembers] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showLeaderModal, setShowLeaderModal] = useState(false);

  const [memberForm, setMemberForm] = useState({ id: null, full_name: '', email: '', phone: '', birth_date: '', notes: '' });
  const [leaderForm, setLeaderForm] = useState({ id: null, full_name: '', email: '', phone: '', role: '' });
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
  }, [selectedCampusId]);

  useEffect(() => {
    if (activeTab === 'finances') {
      fetchFinanceData();
    }
  }, [activeTab, selectedCampusId]);

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

  async function fetchData() {
    setLoading(true);
    setError(null);

    try {
      // Zadania żyją na Tablicy (ModuleBoard) — mlodziezowka_tasks nie jest już pobierane.
      const [membersResult, leadersResult] = await Promise.all([
        supabase.from('mlodziezowka_members').select('*').order('full_name'),
        supabase.from('mlodziezowka_leaders').select('*').order('full_name'),
      ]);

      if (membersResult.error) throw new Error(tr('Błąd członków: {msg}', { msg: membersResult.error.message }));
      if (leadersResult.error) throw new Error(tr('Błąd liderów: {msg}', { msg: leadersResult.error.message }));

      setMembers(membersResult.data || []);
      setLeaders(leadersResult.data || []);
    } catch (err) {
      console.error('Błąd pobierania danych:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Members
  const saveMember = async () => {
    try {
      if (!memberForm.full_name.trim()) {
        toast.error(tr('Imię i nazwisko jest wymagane'));
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
      toast.error(tr('Błąd: ') + err.message);
    }
  };

  const deleteMember = async (id) => {
    if (await confirmDialog(tr('Usunąć członka?'))) {
      try {
        const { error } = await supabase.from('mlodziezowka_members').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (err) {
        console.error('Błąd usuwania członka:', err);
        toast.error(tr('Błąd: ') + err.message);
      }
    }
  };

  // Leaders
  const saveLeader = async () => {
    try {
      if (!leaderForm.full_name.trim()) {
        toast.error(tr('Imię i nazwisko jest wymagane'));
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
          role: leaderForm.role
        }]);
        if (error) throw error;
      }

      setShowLeaderModal(false);
      await fetchData();
    } catch (err) {
      console.error('Błąd zapisywania lidera:', err);
      toast.error(tr('Błąd: ') + err.message);
    }
  };

  const deleteLeader = async (id) => {
    if (await confirmDialog(tr('Usunąć lidera?'))) {
      try {
        const { error } = await supabase.from('mlodziezowka_leaders').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (err) {
        console.error('Błąd usuwania lidera:', err);
        toast.error(tr('Błąd: ') + err.message);
      }
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
      toast.error(tr('Błąd przesyłania pliku: ') + error.message);
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
      toast.error(tr('Błąd zapisywania: ') + error.message);
    }
  };

  if (loading) return <Spinner center />;
  if (error) return <div className="p-10 text-red-600 dark:text-red-400">{tr('Błąd:')} {error}</div>;

  return (
    <div className="space-y-8">
      <PageHeader moduleKey="mlodziezowka" icon={Sparkles} title={t('Młodzieżówka')} />

      {/* TAB NAVIGATION */}
      <ResponsiveTabs moduleKey="mlodziezowka"
        tabs={[
          { id: 'events', label: t('Wydarzenia'), icon: Calendar },
          { id: 'tasks', label: t('Zadania'), icon: CheckSquare },
          ...(hasTabAccess('mlodziezowka', 'leaders') ? [{ id: 'leaders', label: t('Liderzy'), icon: Star }] : []),
          ...(hasTabAccess('mlodziezowka', 'members') ? [{ id: 'members', label: t('Członkowie'), icon: Users }] : []),
          ...(hasTabAccess('mlodziezowka', 'finances') ? [{ id: 'finances', label: t('Finanse'), icon: DollarSign }] : []),
          ...(hasTabAccess('mlodziezowka', 'equipment') ? [{ id: 'equipment', label: t('Wyposażenie'), icon: Package }] : []),
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* WYDARZENIA — wspólna tabela events (module_key = mlodziezowka), jak pozostałe służby */}
      {activeTab === 'events' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
          <EventsTab ministry="mlodziezowka" currentUserEmail={currentUserEmail} />
        </section>
      )}

      {/* ZADANIA — nowy silnik Tablic (Monday-style) */}
      {activeTab === 'tasks' && (
        <ModuleBoard sourceKind="mlodziezowka_tasks" moduleKey="mlodziezowka" title={tr('Zadania młodzieżówki')} />
      )}
      {activeTab === 'leaders' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{tr('Liderzy')} ({leaders.length})</h2>
            <button onClick={() => { setLeaderForm({ id: null, full_name: '', email: '', phone: '', role: '' }); setShowLeaderModal(true); }} className="bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> {tr('Dodaj lidera')}</button>
          </div>
          <DataTable tableClassName="min-w-[700px]">
            <THead>
              <tr><TH>{tr('Imię i nazwisko')}</TH><TH>{tr('Rola')}</TH><TH>{tr('Email')}</TH><TH>{tr('Telefon')}</TH><TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH></tr>
            </THead>
            <tbody>
              {leaders.map(m => (
                <TR key={m.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{m.full_name}</TD>
                  <TD>
                    {m.role && (
                      <StatusPill color={STATUS_COLORS.accent}>{m.role}</StatusPill>
                    )}
                  </TD>
                  <TD muted>{m.email}</TD>
                  <TD muted numeric>{m.phone}</TD>
                  <TD align="right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover/row:opacity-100 transition-opacity">
                      <button onClick={() => { setLeaderForm(m); setShowLeaderModal(true); }} className="text-accent-primary dark:text-accent-secondary-light font-medium">{tr('Edytuj')}</button>
                      <button onClick={() => deleteLeader(m.id)} className="text-red-500 dark:text-red-400 font-medium">{tr('Usuń')}</button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        </section>
      )}

      {/* CZŁONKOWIE */}
      {activeTab === 'members' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{tr('Członkowie')} ({members.length})</h2>
            <button onClick={() => { setMemberForm({ id: null, full_name: '', email: '', phone: '', birth_date: '', notes: '' }); setShowMemberModal(true); }} className="bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"><Plus size={18}/> {tr('Dodaj członka')}</button>
          </div>
          <DataTable tableClassName="min-w-[700px]">
            <THead>
              <tr><TH>{tr('Imię i nazwisko')}</TH><TH>{tr('Data urodzenia')}</TH><TH>{tr('Email')}</TH><TH>{tr('Telefon')}</TH><TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH></tr>
            </THead>
            <tbody>
              {members.map(m => (
                <TR key={m.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{m.full_name}</TD>
                  <TD muted numeric>{m.birth_date ? new Date(m.birth_date).toLocaleDateString(appLocale()) : ''}</TD>
                  <TD muted>{m.email}</TD>
                  <TD muted numeric>{m.phone}</TD>
                  <TD align="right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover/row:opacity-100 transition-opacity">
                      <button onClick={() => { setMemberForm(m); setShowMemberModal(true); }} className="text-accent-primary dark:text-accent-secondary-light font-medium">{tr('Edytuj')}</button>
                      <button onClick={() => deleteMember(m.id)} className="text-red-500 dark:text-red-400 font-medium">{tr('Usuń')}</button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
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
          canEdit={hasTabAccess('mlodziezowka', 'equipment')}
        />
      )}

      {/* MODAL CZŁONKA */}
      <Modal
        isOpen={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        title={memberForm.id ? tr('Edytuj członka') : tr('Nowy członek')}
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" onClick={() => setShowMemberModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveMember}>{tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Imię i nazwisko')}</label>
            <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder={t('Jan Kowalski')} value={memberForm.full_name} onChange={e => setMemberForm({...memberForm, full_name: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <CustomDatePicker
                label={tr('Data urodzenia')}
                value={memberForm.birth_date}
                onChange={val => setMemberForm({...memberForm, birth_date: val})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Telefon')}</label>
              <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="+48 123 456 789" value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Email')}</label>
            <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="jan@example.com" value={memberForm.email} onChange={e => setMemberForm({...memberForm, email: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Notatki')}</label>
            <textarea className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none" rows={2} placeholder={t('Dodatkowe informacje...')} value={memberForm.notes || ''} onChange={e => setMemberForm({...memberForm, notes: e.target.value})} />
          </div>
        </div>
      </Modal>

      {/* MODAL LIDERA */}
      <Modal
        isOpen={showLeaderModal}
        onClose={() => setShowLeaderModal(false)}
        title={leaderForm.id ? tr('Edytuj lidera') : tr('Nowy lider')}
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" onClick={() => setShowLeaderModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveLeader}>{tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Imię i nazwisko')}</label>
            <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder={t('Jan Kowalski')} value={leaderForm.full_name} onChange={e => setLeaderForm({...leaderForm, full_name: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{t('Rola / Odpowiedzialność')}</label>
            <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder={t('Główny lider, Koordynator...')} value={leaderForm.role || ''} onChange={e => setLeaderForm({...leaderForm, role: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Telefon')}</label>
              <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="+48 123 456 789" value={leaderForm.phone} onChange={e => setLeaderForm({...leaderForm, phone: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Email')}</label>
              <input className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" placeholder="jan@example.com" value={leaderForm.email} onChange={e => setLeaderForm({...leaderForm, email: e.target.value})} />
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL: Add Expense */}
      <Modal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        title={tr('Nowy wydatek - Młodzieżówka')}
        size="xl"
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" onClick={() => setShowExpenseModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveExpense}>{tr('Zapisz wydatek')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CustomDatePicker
              label={tr('Data dokumentu')}
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

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Szczegółowy opis')}</label>
            <textarea
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
              rows={2}
              value={expenseForm.detailed_description}
              onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
              placeholder={t('Dodatkowe informacje o wydatku...')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Załączniki (opcjonalnie)')}</label>
            <div className="space-y-2">
              <label className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer hover:border-accent-secondary-light dark:hover:border-accent-primary transition flex items-center gap-2">
                <Upload size={18} className="text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {uploadingFile ? tr('Przesyłanie...') : tr('Dodaj plik(i)')}
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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Tagi')}</label>
            <div className="flex gap-2 mb-2">
              <input
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder={t('Nowy tag...')}
                onKeyPress={(e) => e.key === 'Enter' && addExpenseTag()}
              />
              <button
                onClick={addExpenseTag}
                className="px-4 py-2 bg-accent-primary text-white rounded-xl hover:bg-accent-primary transition"
              >
                <Plus size={18} />
              </button>
            </div>
            {expenseForm.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {expenseForm.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-accent-primary-lightest dark:bg-accent-secondary-darkest/30 text-accent-primary dark:text-accent-secondary-light rounded-full text-xs flex items-center gap-1"
                  >
                    {tag}
                    <button onClick={() => removeExpenseTag(tag)} className="hover:text-accent-secondary-darkest">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
