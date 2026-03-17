import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, TrendingUp, Receipt, Calendar, Plus, Upload, Tag, X, FileText, Trash2, Edit2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Users, Building2, Settings, Banknote, CreditCard, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createPortal } from 'react-dom';
import CustomSelect from '../components/CustomSelect';
import MaterialsTab from './shared/MaterialsTab';
import ResponsiveTabs from '../components/ResponsiveTabs';

// Hook to calculate dropdown position with smart positioning (up/down)
function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 300;
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

const FinanceModule = () => {
  const [activeTab, setActiveTab] = useState('budget');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [budgetItems, setBudgetItems] = useState([]);
  const [incomeTransactions, setIncomeTransactions] = useState([]);
  const [expenseTransactions, setExpenseTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Forms
  const [budgetForm, setBudgetForm] = useState({
    category: '',
    description: '',
    planned_amount: ''
  });

  const [incomeForm, setIncomeForm] = useState({
    date: '',
    amount: '',
    type: 'Kolekta',
    source: '',
    notes: '',
    tags: []
  });

  const [expenseForm, setExpenseForm] = useState({
    payment_date: '',
    amount: '',
    contractor: '',
    category: '',
    description: '',
    detailed_description: '',
    responsible_person: '',
    documents: [], // Array of {url: string, name: string}
    tags: []
  });

  const [uploadingFile, setUploadingFile] = useState(false);
  const [expandedBudgetItems, setExpandedBudgetItems] = useState({}); // For expandable expense lists

  const [newTag, setNewTag] = useState('');

  // Filtry dla wpływów
  const [incomeFilters, setIncomeFilters] = useState({
    type: '',
    source: '',
    tag: '',
    dateFrom: '',
    dateTo: ''
  });

  // Filtry dla wydatków
  const [expenseFilters, setExpenseFilters] = useState({
    category: '',
    contractor: '',
    responsible: '',
    tag: '',
    dateFrom: '',
    dateTo: ''
  });

  // Stan początkowy - salda kont
  const [accountBalances, setAccountBalances] = useState({
    bank_pln: 0,
    bank_currency: 0,
    cash_pln: 0,
    cash_currency: 0,
    currency_type: 'EUR'
  });
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceForm, setBalanceForm] = useState({
    bank_pln: '',
    bank_currency: '',
    cash_pln: '',
    cash_currency: '',
    currency_type: 'EUR'
  });

  // Fetch budget items
  useEffect(() => {
    if (activeTab === 'budget') {
      fetchBudgetItems();
    }
  }, [activeTab, selectedYear]);

  // Fetch income transactions
  useEffect(() => {
    if (activeTab === 'income') {
      fetchIncomeTransactions();
    }
  }, [activeTab, selectedYear]);

  // Fetch expense transactions
  useEffect(() => {
    if (activeTab === 'expenses' || activeTab === 'budget') {
      fetchExpenseTransactions();
    }
  }, [activeTab, selectedYear]);

  // Fetch all data for reports
  useEffect(() => {
    if (activeTab === 'reports') {
      fetchBudgetItems();
      fetchIncomeTransactions();
      fetchExpenseTransactions();
      fetchAccountBalances();
    }
  }, [activeTab, selectedYear]);

  // Fetch account balances on mount
  useEffect(() => {
    fetchAccountBalances();
  }, [selectedYear]);

  const fetchAccountBalances = async () => {
    try {
      const { data, error } = await supabase
        .from('finance_balances')
        .select('*')
        .eq('year', selectedYear)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching balances:', error);
        return;
      }

      if (data) {
        setAccountBalances({
          bank_pln: data.bank_pln || 0,
          bank_currency: data.bank_currency || 0,
          cash_pln: data.cash_pln || 0,
          cash_currency: data.cash_currency || 0,
          currency_type: data.currency_type || 'EUR'
        });
      }
    } catch (error) {
      console.error('Error fetching account balances:', error);
    }
  };

  const saveAccountBalances = async () => {
    try {
      const balanceData = {
        year: selectedYear,
        bank_pln: parseFloat(balanceForm.bank_pln) || 0,
        bank_currency: parseFloat(balanceForm.bank_currency) || 0,
        cash_pln: parseFloat(balanceForm.cash_pln) || 0,
        cash_currency: parseFloat(balanceForm.cash_currency) || 0,
        currency_type: balanceForm.currency_type
      };

      // Check if record exists
      const { data: existing } = await supabase
        .from('finance_balances')
        .select('id')
        .eq('year', selectedYear)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('finance_balances')
          .update(balanceData)
          .eq('year', selectedYear);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('finance_balances')
          .insert([balanceData]);
        if (error) throw error;
      }

      setAccountBalances(balanceData);
      setShowBalanceModal(false);
      alert('Stan kont zapisany pomyślnie');
    } catch (error) {
      console.error('Error saving balances:', error);
      alert('Błąd zapisywania: ' + error.message);
    }
  };

  const openBalanceModal = () => {
    setBalanceForm({
      bank_pln: accountBalances.bank_pln.toString(),
      bank_currency: accountBalances.bank_currency.toString(),
      cash_pln: accountBalances.cash_pln.toString(),
      cash_currency: accountBalances.cash_currency.toString(),
      currency_type: accountBalances.currency_type
    });
    setShowBalanceModal(true);
  };

  const fetchBudgetItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('budget_items')
        .select('*')
        .eq('year', selectedYear)
        .order('category');

      if (error) throw error;
      setBudgetItems(data || []);
    } catch (error) {
      console.error('Error fetching budget items:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchIncomeTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('income_transactions')
        .select('*')
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
        .order('date', { ascending: false });

      if (error) throw error;
      setIncomeTransactions(data || []);
    } catch (error) {
      console.error('Error fetching income transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenseTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expense_transactions')
        .select('*')
        .gte('payment_date', `${selectedYear}-01-01`)
        .lte('payment_date', `${selectedYear}-12-31`)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setExpenseTransactions(data || []);
    } catch (error) {
      console.error('Error fetching expense transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveBudgetItem = async () => {
    if (!budgetForm.category || !budgetForm.planned_amount) {
      alert('Wypełnij wymagane pola');
      return;
    }

    try {
      if (budgetForm.id) {
        // Update existing item
        const { error } = await supabase
          .from('budget_items')
          .update({
            category: budgetForm.category,
            description: budgetForm.description,
            planned_amount: parseFloat(budgetForm.planned_amount)
          })
          .eq('id', budgetForm.id);

        if (error) throw error;
      } else {
        // Insert new item
        const { error } = await supabase.from('budget_items').insert([{
          year: selectedYear,
          category: budgetForm.category,
          description: budgetForm.description,
          planned_amount: parseFloat(budgetForm.planned_amount)
        }]);

        if (error) throw error;
      }

      setShowBudgetModal(false);
      setBudgetForm({ category: '', description: '', planned_amount: '' });
      fetchBudgetItems();
    } catch (error) {
      console.error('Error saving budget item:', error);
      alert('Błąd zapisywania: ' + error.message);
    }
  };

  const deleteBudgetItem = async (id) => {
    if (!confirm('Czy na pewno chcesz usunąć tę pozycję budżetową?')) return;

    try {
      const { error } = await supabase
        .from('budget_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchBudgetItems();
    } catch (error) {
      console.error('Error deleting budget item:', error);
      alert('Błąd usuwania: ' + error.message);
    }
  };

  const saveIncome = async () => {
    if (!incomeForm.date || !incomeForm.amount || !incomeForm.source) {
      alert('Wypełnij wymagane pola');
      return;
    }

    try {
      if (incomeForm.id) {
        // Update existing income
        const { error } = await supabase
          .from('income_transactions')
          .update({
            date: incomeForm.date,
            amount: parseFloat(incomeForm.amount),
            type: incomeForm.type,
            source: incomeForm.source,
            notes: incomeForm.notes,
            tags: incomeForm.tags
          })
          .eq('id', incomeForm.id);

        if (error) throw error;
      } else {
        // Insert new income
        const { error } = await supabase.from('income_transactions').insert([{
          date: incomeForm.date,
          amount: parseFloat(incomeForm.amount),
          type: incomeForm.type,
          source: incomeForm.source,
          notes: incomeForm.notes,
          tags: incomeForm.tags
        }]);

        if (error) throw error;
      }

      setShowIncomeModal(false);
      setIncomeForm({ date: '', amount: '', type: 'Kolekta', source: '', notes: '', tags: [] });
      fetchIncomeTransactions();
    } catch (error) {
      console.error('Error saving income:', error);
      alert('Błąd zapisywania: ' + error.message);
    }
  };

  const deleteIncome = async (id) => {
    if (!confirm('Czy na pewno chcesz usunąć ten wpływ?')) return;

    try {
      const { error } = await supabase
        .from('income_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchIncomeTransactions();
    } catch (error) {
      console.error('Error deleting income:', error);
      alert('Błąd usuwania: ' + error.message);
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

        const { data: { publicUrl } } = supabase.storage
          .from('finance')
          .getPublicUrl(filePath);

        uploadedDocs.push({
          url: publicUrl,
          name: file.name
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

  const saveExpense = async () => {
    if (!expenseForm.payment_date || !expenseForm.amount || !expenseForm.contractor || !expenseForm.category || !expenseForm.description || !expenseForm.responsible_person) {
      alert('Wypełnij wymagane pola');
      return;
    }

    try {
      if (expenseForm.id) {
        // Update existing expense
        const { error } = await supabase
          .from('expense_transactions')
          .update({
            payment_date: expenseForm.payment_date,
            amount: parseFloat(expenseForm.amount),
            contractor: expenseForm.contractor,
            category: expenseForm.category,
            description: expenseForm.description,
            detailed_description: expenseForm.detailed_description,
            responsible_person: expenseForm.responsible_person,
            documents: expenseForm.documents,
            tags: expenseForm.tags
          })
          .eq('id', expenseForm.id);

        if (error) throw error;
      } else {
        // Insert new expense
        const { error } = await supabase.from('expense_transactions').insert([{
          payment_date: expenseForm.payment_date,
          amount: parseFloat(expenseForm.amount),
          contractor: expenseForm.contractor,
          category: expenseForm.category,
          description: expenseForm.description,
          detailed_description: expenseForm.detailed_description,
          responsible_person: expenseForm.responsible_person,
          documents: expenseForm.documents,
          tags: expenseForm.tags
        }]);

        if (error) throw error;
      }

      setShowExpenseModal(false);
      setExpenseForm({ payment_date: '', amount: '', contractor: '', category: '', description: '', detailed_description: '', responsible_person: '', documents: [], tags: [] });
      fetchExpenseTransactions();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Błąd zapisywania: ' + error.message);
    }
  };

  const deleteExpense = async (id) => {
    if (!confirm('Czy na pewno chcesz usunąć ten wydatek?')) return;

    try {
      const { error } = await supabase
        .from('expense_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchExpenseTransactions();
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Błąd usuwania: ' + error.message);
    }
  };

  const addTag = (form, setForm) => {
    if (newTag.trim() && !form.tags.includes(newTag.trim())) {
      setForm({ ...form, tags: [...form.tags, newTag.trim()] });
      setNewTag('');
    }
  };

  const removeTag = (tag, form, setForm) => {
    setForm({ ...form, tags: form.tags.filter(t => t !== tag) });
  };

  const calculateRealization = (category, description) => {
    const total = expenseTransactions
      .filter(exp => exp.category === category && exp.description === description)
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    return total;
  };

  const getProgressBarColor = (percentage) => {
    if (percentage < 80) return 'from-green-500 to-green-600';
    if (percentage <= 100) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  // Filtrowanie wpływów
  const filteredIncomeTransactions = incomeTransactions.filter(transaction => {
    if (incomeFilters.type && transaction.type !== incomeFilters.type) return false;
    if (incomeFilters.source && !transaction.source.toLowerCase().includes(incomeFilters.source.toLowerCase())) return false;
    if (incomeFilters.tag && (!transaction.tags || !transaction.tags.includes(incomeFilters.tag))) return false;
    if (incomeFilters.dateFrom && transaction.date < incomeFilters.dateFrom) return false;
    if (incomeFilters.dateTo && transaction.date > incomeFilters.dateTo) return false;
    return true;
  });

  // Filtrowanie wydatków
  const filteredExpenseTransactions = expenseTransactions.filter(transaction => {
    if (expenseFilters.category && transaction.category !== expenseFilters.category) return false;
    if (expenseFilters.contractor && !transaction.contractor.toLowerCase().includes(expenseFilters.contractor.toLowerCase())) return false;
    if (expenseFilters.responsible && !transaction.responsible_person.toLowerCase().includes(expenseFilters.responsible.toLowerCase())) return false;
    if (expenseFilters.tag && (!transaction.tags || !transaction.tags.includes(expenseFilters.tag))) return false;
    if (expenseFilters.dateFrom && transaction.payment_date < expenseFilters.dateFrom) return false;
    if (expenseFilters.dateTo && transaction.payment_date > expenseFilters.dateTo) return false;
    return true;
  });

  // Pobierz unikalne wartości dla filtrów
  const uniqueIncomeSources = [...new Set(incomeTransactions.map(t => t.source))];
  const uniqueIncomeTags = [...new Set(incomeTransactions.flatMap(t => t.tags || []))];
  const uniqueExpenseContractors = [...new Set(expenseTransactions.map(t => t.contractor))];
  const uniqueExpenseResponsible = [...new Set(expenseTransactions.map(t => t.responsible_person))];
  const uniqueExpenseTags = [...new Set(expenseTransactions.flatMap(t => t.tags || []))];

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);

  // Get unique categories from budget items for expense category dropdown
  const budgetCategories = [...new Set(budgetItems.map(item => item.category))].map(cat => ({ value: cat, label: cat }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent mb-2">
            Finanse
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Zarządzanie budżetem i finansami kościoła</p>
        </div>
        <div className="flex items-center gap-3">
          <CustomSelect
            value={selectedYear}
            onChange={(val) => setSelectedYear(parseInt(val))}
            options={years.map(y => ({ value: y, label: y.toString() }))}
          />
        </div>
      </div>

      <ResponsiveTabs
        tabs={[
          { id: 'budget', label: 'Budżet', icon: DollarSign },
          { id: 'income', label: 'Wpływy', icon: TrendingUp },
          { id: 'expenses', label: 'Wydatki', icon: Receipt },
          { id: 'reports', label: 'Raporty', icon: BarChart3 },
          { id: 'files', label: 'Pliki', icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'budget' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Budżet {selectedYear}
            </h2>
            <button
              onClick={() => setShowBudgetModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
            >
              <Plus size={18} />
              Dodaj pozycję budżetową
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Ładowanie...
            </div>
          ) : budgetItems.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Brak pozycji budżetowych na rok {selectedYear}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Służba</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Opis kosztu</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Plan (PLN)</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Realizacja (PLN)</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">% Realizacji</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Pozostało</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group items by category
                    const groupedItems = budgetItems.reduce((acc, item) => {
                      if (!acc[item.category]) {
                        acc[item.category] = [];
                      }
                      acc[item.category].push(item);
                      return acc;
                    }, {});

                    let grandTotalPlanned = 0;
                    let grandTotalRealization = 0;
                    let grandTotalRemaining = 0;

                    const rows = [];

                    Object.keys(groupedItems).forEach((category) => {
                      const items = groupedItems[category];
                      let categoryTotalPlanned = 0;
                      let categoryTotalRealization = 0;
                      let categoryTotalRemaining = 0;

                      // Calculate total rowspan including expanded rows
                      const totalRowSpan = items.reduce((sum, item) => {
                        return sum + 1 + (expandedBudgetItems[`${item.id}`] ? 1 : 0);
                      }, 0);

                      items.forEach((item, itemIndex) => {
                        const realization = calculateRealization(item.category, item.description);
                        const percentage = item.planned_amount > 0 ? (realization / item.planned_amount) * 100 : 0;
                        const remaining = item.planned_amount - realization;

                        categoryTotalPlanned += item.planned_amount;
                        categoryTotalRealization += realization;
                        categoryTotalRemaining += remaining;

                        rows.push(
                          <tr
                            key={item.id}
                            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition"
                          >
                            {itemIndex === 0 && (
                              <td
                                className="py-4 px-4 text-gray-900 dark:text-white font-bold"
                                rowSpan={totalRowSpan}
                              >
                                {item.category}
                              </td>
                            )}
                            <td className="py-4 px-4 text-gray-600 dark:text-gray-400">{item.description}</td>
                            <td className="py-4 px-4 text-right text-gray-900 dark:text-white font-medium">
                              {item.planned_amount.toLocaleString('pl-PL')} zł
                            </td>
                            <td
                              className="py-4 px-4 text-right text-gray-900 dark:text-white font-medium cursor-pointer hover:text-pink-600 dark:hover:text-pink-400 transition"
                              onClick={() => {
                                const key = `${item.id}`;
                                setExpandedBudgetItems(prev => ({
                                  ...prev,
                                  [key]: !prev[key]
                                }));
                              }}
                            >
                              {realization.toLocaleString('pl-PL')} zł
                              {expandedBudgetItems[`${item.id}`] ?
                                <ChevronUp size={16} className="inline ml-1" /> :
                                <ChevronDown size={16} className="inline ml-1" />
                              }
                            </td>
                            <td className="py-4 px-4">
                              <div className="space-y-2">
                                <div className="text-center font-bold text-gray-900 dark:text-white">
                                  {percentage.toFixed(1)}%
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                  <div
                                    className={`h-2.5 rounded-full bg-gradient-to-r ${getProgressBarColor(percentage)} transition-all`}
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className={`py-4 px-4 text-right font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {remaining.toLocaleString('pl-PL')} zł
                            </td>
                            <td className="py-4 px-4 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => {
                                    setBudgetForm(item);
                                    setShowBudgetModal(true);
                                  }}
                                  className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                                  title="Edytuj"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => deleteBudgetItem(item.id)}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                  title="Usuń"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );

                        // Add expandable expense list row
                        if (expandedBudgetItems[`${item.id}`]) {
                          const categoryExpenses = expenseTransactions.filter(
                            (exp) => exp.category === item.category && exp.description === item.description
                          );

                          rows.push(
                            <tr key={`expenses-${item.id}`} className="bg-gray-50 dark:bg-gray-800/50">
                              <td colSpan={7} className="py-4 px-4">
                                {categoryExpenses.length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                      Wydatki: {item.category} - {item.description}
                                    </p>
                                    <div className="space-y-1">
                                      {categoryExpenses.map((expense) => (
                                        <div
                                          key={expense.id}
                                          className="grid grid-cols-5 gap-3 text-sm py-2 px-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                                        >
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Data</span>
                                            <span className="text-gray-900 dark:text-white">
                                              {new Date(expense.payment_date).toLocaleDateString('pl-PL')}
                                            </span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Kontrahent</span>
                                            <span className="text-gray-900 dark:text-white">{expense.contractor}</span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Kwota</span>
                                            <span className="font-bold text-gray-900 dark:text-white">
                                              {expense.amount.toLocaleString('pl-PL')} zł
                                            </span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Szczegółowy opis</span>
                                            <span className="text-gray-900 dark:text-white text-xs">{expense.detailed_description || '-'}</span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Odpowiedzialny</span>
                                            <span className="text-gray-900 dark:text-white">{expense.responsible_person}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                                        Suma: {categoryExpenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString('pl-PL')} zł
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                                    Brak wydatków w tej pozycji budżetu
                                  </p>
                                )}
                              </td>
                            </tr>
                          );
                        }
                      });

                      grandTotalPlanned += categoryTotalPlanned;
                      grandTotalRealization += categoryTotalRealization;
                      grandTotalRemaining += categoryTotalRemaining;

                      const categoryPercentage = categoryTotalPlanned > 0 ? (categoryTotalRealization / categoryTotalPlanned) * 100 : 0;

                      // Subtotal row for this category
                      rows.push(
                        <tr key={`subtotal-${category}`} className="bg-pink-100 dark:bg-pink-900/40 border-b-2 border-pink-300 dark:border-pink-700 font-bold">
                          <td className="py-3 px-4 text-gray-900 dark:text-white" colSpan={2}>
                            Podsumowanie: {category}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                            {categoryTotalPlanned.toLocaleString('pl-PL')} zł
                          </td>
                          <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                            {categoryTotalRealization.toLocaleString('pl-PL')} zł
                          </td>
                          <td className="py-3 px-4 text-center text-gray-900 dark:text-white">
                            {categoryPercentage.toFixed(1)}%
                          </td>
                          <td className={`py-3 px-4 text-right ${categoryTotalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {categoryTotalRemaining.toLocaleString('pl-PL')} zł
                          </td>
                          <td className="py-3 px-4"></td>
                        </tr>
                      );
                    });

                    const grandPercentage = grandTotalPlanned > 0 ? (grandTotalRealization / grandTotalPlanned) * 100 : 0;

                    // Grand total row
                    rows.push(
                      <tr key="grand-total" className="bg-gradient-to-r from-pink-200 to-orange-200 dark:from-pink-900/60 dark:to-orange-900/60 border-t-4 border-pink-500 dark:border-pink-400 font-bold text-lg">
                        <td className="py-4 px-4 text-gray-900 dark:text-white" colSpan={2}>
                          SUMA CAŁKOWITA
                        </td>
                        <td className="py-4 px-4 text-right text-gray-900 dark:text-white">
                          {grandTotalPlanned.toLocaleString('pl-PL')} zł
                        </td>
                        <td className="py-4 px-4 text-right text-gray-900 dark:text-white">
                          {grandTotalRealization.toLocaleString('pl-PL')} zł
                        </td>
                        <td className="py-4 px-4 text-center text-gray-900 dark:text-white">
                          {grandPercentage.toFixed(1)}%
                        </td>
                        <td className={`py-4 px-4 text-right ${grandTotalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {grandTotalRemaining.toLocaleString('pl-PL')} zł
                        </td>
                        <td className="py-4 px-4"></td>
                      </tr>
                    );

                    return rows;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'income' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Wpływy {selectedYear}
            </h2>
            <button
              onClick={() => setShowIncomeModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
            >
              <Plus size={18} />
              Dodaj wpływ
            </button>
          </div>

          {/* Filtry wpływów */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase">Filtry</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <CustomSelect
                label="Typ"
                value={incomeFilters.type}
                onChange={(val) => setIncomeFilters({...incomeFilters, type: val})}
                options={[
                  { value: '', label: 'Wszystkie' },
                  { value: 'Kolekta', label: 'Kolekta' },
                  { value: 'Darowizny', label: 'Darowizny' },
                  { value: 'Inne', label: 'Inne' }
                ]}
                placeholder="Wszystkie"
              />
              <CustomSelect
                label="Źródło"
                value={incomeFilters.source}
                onChange={(val) => setIncomeFilters({...incomeFilters, source: val})}
                options={[
                  { value: '', label: 'Wszystkie' },
                  ...uniqueIncomeSources.map(s => ({ value: s, label: s }))
                ]}
                placeholder="Wszystkie"
              />
              <CustomSelect
                label="Tag"
                value={incomeFilters.tag}
                onChange={(val) => setIncomeFilters({...incomeFilters, tag: val})}
                options={[
                  { value: '', label: 'Wszystkie' },
                  ...uniqueIncomeTags.map(t => ({ value: t, label: t }))
                ]}
                placeholder="Wszystkie"
              />
              <CustomDatePicker
                label="Data od"
                value={incomeFilters.dateFrom}
                onChange={(val) => setIncomeFilters({...incomeFilters, dateFrom: val})}
              />
              <CustomDatePicker
                label="Data do"
                value={incomeFilters.dateTo}
                onChange={(val) => setIncomeFilters({...incomeFilters, dateTo: val})}
              />
            </div>
            {(incomeFilters.type || incomeFilters.source || incomeFilters.tag || incomeFilters.dateFrom || incomeFilters.dateTo) && (
              <button
                onClick={() => setIncomeFilters({ type: '', source: '', tag: '', dateFrom: '', dateTo: '' })}
                className="mt-3 text-sm text-pink-600 dark:text-pink-400 hover:underline"
              >
                Wyczyść filtry
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Ładowanie...
            </div>
          ) : filteredIncomeTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {incomeTransactions.length === 0 ? `Brak wpływów na rok ${selectedYear}` : 'Brak wpływów pasujących do filtrów'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Data</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Typ</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Źródło</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Kwota</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Notatka</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Tagi</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncomeTransactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                    >
                      <td className="py-4 px-4 text-gray-900 dark:text-white text-sm">
                        {new Date(transaction.date).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                          {transaction.type}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-900 dark:text-white text-sm">
                        {transaction.source}
                      </td>
                      <td className="py-4 px-4 text-right text-gray-900 dark:text-white font-bold">
                        {transaction.amount.toLocaleString('pl-PL')} zł
                      </td>
                      <td className="py-4 px-4 text-gray-600 dark:text-gray-400 text-sm">
                        {transaction.notes || '-'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {transaction.tags && transaction.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {transaction.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs flex items-center gap-1"
                              >
                                <Tag size={10} />
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => {
                              setIncomeForm(transaction);
                              setShowIncomeModal(true);
                            }}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                            title="Edytuj"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteIncome(transaction.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                            title="Usuń"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'expenses' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Wydatki {selectedYear}
            </h2>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
            >
              <Plus size={18} />
              Dodaj wydatek
            </button>
          </div>

          {/* Filtry wydatków */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase">Filtry</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              <CustomSelect
                label="Kategoria"
                value={expenseFilters.category}
                onChange={(val) => setExpenseFilters({...expenseFilters, category: val})}
                options={[
                  { value: '', label: 'Wszystkie' },
                  ...budgetCategories
                ]}
                placeholder="Wszystkie"
              />
              <CustomSelect
                label="Kontrahent"
                value={expenseFilters.contractor}
                onChange={(val) => setExpenseFilters({...expenseFilters, contractor: val})}
                options={[
                  { value: '', label: 'Wszystkie' },
                  ...uniqueExpenseContractors.map(c => ({ value: c, label: c }))
                ]}
                placeholder="Wszystkie"
              />
              <CustomSelect
                label="Osoba odpowiedzialna"
                value={expenseFilters.responsible}
                onChange={(val) => setExpenseFilters({...expenseFilters, responsible: val})}
                options={[
                  { value: '', label: 'Wszystkie' },
                  ...uniqueExpenseResponsible.map(r => ({ value: r, label: r }))
                ]}
                placeholder="Wszystkie"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <CustomSelect
                label="Tag"
                value={expenseFilters.tag}
                onChange={(val) => setExpenseFilters({...expenseFilters, tag: val})}
                options={[
                  { value: '', label: 'Wszystkie' },
                  ...uniqueExpenseTags.map(t => ({ value: t, label: t }))
                ]}
                placeholder="Wszystkie"
              />
              <CustomDatePicker
                label="Data od"
                value={expenseFilters.dateFrom}
                onChange={(val) => setExpenseFilters({...expenseFilters, dateFrom: val})}
              />
              <CustomDatePicker
                label="Data do"
                value={expenseFilters.dateTo}
                onChange={(val) => setExpenseFilters({...expenseFilters, dateTo: val})}
              />
            </div>
            {(expenseFilters.category || expenseFilters.contractor || expenseFilters.responsible || expenseFilters.tag || expenseFilters.dateFrom || expenseFilters.dateTo) && (
              <button
                onClick={() => setExpenseFilters({ category: '', contractor: '', responsible: '', tag: '', dateFrom: '', dateTo: '' })}
                className="mt-3 text-sm text-pink-600 dark:text-pink-400 hover:underline"
              >
                Wyczyść filtry
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Ładowanie...
            </div>
          ) : filteredExpenseTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {expenseTransactions.length === 0 ? `Brak wydatków na rok ${selectedYear}` : 'Brak wydatków pasujących do filtrów'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Data</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Kategoria</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Opis</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Kontrahent</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Kwota</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Odpowiedzialny</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Załączniki</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenseTransactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                    >
                      <td className="py-4 px-4 text-gray-900 dark:text-white text-sm">
                        {new Date(transaction.payment_date).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">
                          {transaction.category}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-900 dark:text-white text-sm">
                        {transaction.description || '-'}
                      </td>
                      <td className="py-4 px-4 text-gray-600 dark:text-gray-400 text-sm">
                        {transaction.contractor}
                      </td>
                      <td className="py-4 px-4 text-right text-gray-900 dark:text-white font-bold">
                        {transaction.amount.toLocaleString('pl-PL')} zł
                      </td>
                      <td className="py-4 px-4 text-gray-600 dark:text-gray-400 text-sm">
                        {transaction.responsible_person}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {transaction.documents && transaction.documents.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {transaction.documents.map((doc, idx) => (
                              <a
                                key={idx}
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 justify-center"
                              >
                                <FileText size={12} />
                                {doc.name}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => {
                              setExpenseForm(transaction);
                              setShowExpenseModal(true);
                            }}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                            title="Edytuj"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteExpense(transaction.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                            title="Usuń"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* REPORTS TAB */}
      {activeTab === 'reports' && (
        <section className="space-y-6">
          {/* Podsumowanie finansowe - kompaktowy widok */}
          {(() => {
            const totalIncome = incomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
            const totalExpenses = expenseTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
            const yearBalance = totalIncome - totalExpenses;
            const currentBankPln = accountBalances.bank_pln + yearBalance;
            const currentCashPln = accountBalances.cash_pln;
            const totalPln = currentBankPln + currentCashPln;
            const totalPlanned = budgetItems.reduce((sum, item) => sum + (item.planned_amount || 0), 0);
            const budgetExecution = totalPlanned > 0 ? (totalExpenses / totalPlanned) * 100 : 0;

            return (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Header z aktualnym saldem */}
                <div className="bg-gradient-to-r from-pink-600 to-orange-600 p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-pink-100 text-sm font-medium mb-1">Aktualny stan finansów • {selectedYear}</p>
                      <p className="text-4xl font-bold">{totalPln.toLocaleString('pl-PL')} zł</p>
                    </div>
                    <button
                      onClick={openBalanceModal}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition"
                      title="Edytuj stany początkowe"
                    >
                      <Settings size={20} />
                    </button>
                  </div>
                </div>

                {/* Szczegóły w gridzie */}
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Rachunek bankowy */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                        <CreditCard size={16} />
                        <span className="text-xs font-medium uppercase">Bank PLN</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{currentBankPln.toLocaleString('pl-PL')} zł</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Start: {accountBalances.bank_pln.toLocaleString('pl-PL')} zł
                      </p>
                    </div>

                    {/* Gotówka */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                        <Banknote size={16} />
                        <span className="text-xs font-medium uppercase">Gotówka</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{currentCashPln.toLocaleString('pl-PL')} zł</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Start: {accountBalances.cash_pln.toLocaleString('pl-PL')} zł
                      </p>
                    </div>

                    {/* Bilans roku */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                        {yearBalance >= 0 ? <ArrowUpRight size={16} className="text-green-500" /> : <ArrowDownRight size={16} className="text-red-500" />}
                        <span className="text-xs font-medium uppercase">Bilans {selectedYear}</span>
                      </div>
                      <p className={`text-xl font-bold ${yearBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {yearBalance >= 0 ? '+' : ''}{yearBalance.toLocaleString('pl-PL')} zł
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        +{totalIncome.toLocaleString('pl-PL')} / -{totalExpenses.toLocaleString('pl-PL')}
                      </p>
                    </div>

                    {/* Wykonanie budżetu */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                        <PieChart size={16} />
                        <span className="text-xs font-medium uppercase">Budżet</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{budgetExecution.toFixed(1)}%</p>
                      <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${budgetExecution < 80 ? 'bg-green-500' : budgetExecution <= 100 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(budgetExecution, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sekcja walutowa - tylko jeśli jest saldo */}
                  {(accountBalances.bank_currency > 0 || accountBalances.cash_currency > 0) && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">Waluta ({accountBalances.currency_type})</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                          <CreditCard size={18} className="text-amber-600 dark:text-amber-400" />
                          <div>
                            <p className="text-xs text-amber-600 dark:text-amber-400">Rachunek</p>
                            <p className="font-bold text-gray-900 dark:text-white">{accountBalances.bank_currency.toLocaleString('pl-PL')} {accountBalances.currency_type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                          <Banknote size={18} className="text-cyan-600 dark:text-cyan-400" />
                          <div>
                            <p className="text-xs text-cyan-600 dark:text-cyan-400">Gotówka</p>
                            <p className="font-bold text-gray-900 dark:text-white">{accountBalances.cash_currency.toLocaleString('pl-PL')} {accountBalances.currency_type}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}


          {/* Monthly Chart - Wpływy vs Wydatki */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart3 size={20} className="text-pink-600" />
              Wpływy vs Wydatki - miesięcznie
            </h3>
            <div className="space-y-3">
              {(() => {
                const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
                const monthlyData = months.map((name, idx) => {
                  const monthNum = String(idx + 1).padStart(2, '0');
                  const monthStart = `${selectedYear}-${monthNum}-01`;
                  const monthEnd = `${selectedYear}-${monthNum}-31`;

                  const income = incomeTransactions
                    .filter(t => t.date >= monthStart && t.date <= monthEnd)
                    .reduce((sum, t) => sum + (t.amount || 0), 0);

                  const expense = expenseTransactions
                    .filter(t => t.payment_date >= monthStart && t.payment_date <= monthEnd)
                    .reduce((sum, t) => sum + (t.amount || 0), 0);

                  return { name, income, expense };
                });

                const maxValue = Math.max(
                  ...monthlyData.map(d => Math.max(d.income, d.expense)),
                  1
                );

                return (
                  <div className="grid grid-cols-12 gap-2">
                    {monthlyData.map((data, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        <div className="h-32 w-full flex items-end justify-center gap-1">
                          <div
                            className="w-3 bg-gradient-to-t from-green-500 to-green-400 rounded-t transition-all hover:opacity-80"
                            style={{ height: `${(data.income / maxValue) * 100}%`, minHeight: data.income > 0 ? '4px' : '0' }}
                            title={`Wpływy: ${data.income.toLocaleString('pl-PL')} zł`}
                          />
                          <div
                            className="w-3 bg-gradient-to-t from-red-500 to-red-400 rounded-t transition-all hover:opacity-80"
                            style={{ height: `${(data.expense / maxValue) * 100}%`, minHeight: data.expense > 0 ? '4px' : '0' }}
                            title={`Wydatki: ${data.expense.toLocaleString('pl-PL')} zł`}
                          />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-2">{data.name}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Wpływy</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Wydatki</span>
                </div>
              </div>
            </div>
          </div>

          {/* Two columns: Categories & Top Contractors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expenses by Category */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <PieChart size={20} className="text-pink-600" />
                Wydatki wg kategorii
              </h3>
              {(() => {
                const categoryTotals = expenseTransactions.reduce((acc, t) => {
                  acc[t.category] = (acc[t.category] || 0) + (t.amount || 0);
                  return acc;
                }, {});

                const sortedCategories = Object.entries(categoryTotals)
                  .sort(([,a], [,b]) => b - a);

                const total = sortedCategories.reduce((sum, [,val]) => sum + val, 0);
                const colors = [
                  'from-pink-500 to-rose-500',
                  'from-blue-500 to-indigo-500',
                  'from-green-500 to-emerald-500',
                  'from-yellow-500 to-orange-500',
                  'from-purple-500 to-violet-500',
                  'from-cyan-500 to-teal-500'
                ];

                return sortedCategories.length > 0 ? (
                  <div className="space-y-3">
                    {sortedCategories.map(([category, amount], idx) => {
                      const percentage = total > 0 ? (amount / total) * 100 : 0;
                      return (
                        <div key={category}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">{category}</span>
                            <span className="text-gray-900 dark:text-white font-bold">{amount.toLocaleString('pl-PL')} zł</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full bg-gradient-to-r ${colors[idx % colors.length]} transition-all`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="text-right text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {percentage.toFixed(1)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">Brak danych o wydatkach</p>
                );
              })()}
            </div>

            {/* Top Contractors */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Building2 size={20} className="text-pink-600" />
                Top kontrahenci
              </h3>
              {(() => {
                const contractorTotals = expenseTransactions.reduce((acc, t) => {
                  acc[t.contractor] = (acc[t.contractor] || 0) + (t.amount || 0);
                  return acc;
                }, {});

                const sortedContractors = Object.entries(contractorTotals)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 8);

                const total = sortedContractors.reduce((sum, [,val]) => sum + val, 0);

                return sortedContractors.length > 0 ? (
                  <div className="space-y-2">
                    {sortedContractors.map(([contractor, amount], idx) => {
                      const percentage = total > 0 ? (amount / total) * 100 : 0;
                      return (
                        <div key={contractor} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white text-sm font-bold">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{contractor}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{percentage.toFixed(1)}% całości</p>
                          </div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{amount.toLocaleString('pl-PL')} zł</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">Brak danych o kontrahentach</p>
                );
              })()}
            </div>
          </div>

          {/* Budget Execution Table */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <DollarSign size={20} className="text-pink-600" />
              Realizacja budżetu wg służb
            </h3>
            {budgetItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">Służba</th>
                      <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">Planowany</th>
                      <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">Zrealizowany</th>
                      <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">Realizacja</th>
                      <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">Pozostało</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const categoryStats = {};
                      budgetItems.forEach(item => {
                        if (!categoryStats[item.category]) {
                          categoryStats[item.category] = { planned: 0, realized: 0 };
                        }
                        categoryStats[item.category].planned += item.planned_amount || 0;

                        const realized = expenseTransactions
                          .filter(exp => exp.category === item.category && exp.description === item.description)
                          .reduce((sum, exp) => sum + (exp.amount || 0), 0);
                        categoryStats[item.category].realized += realized;
                      });

                      return Object.entries(categoryStats).map(([category, stats]) => {
                        const percentage = stats.planned > 0 ? (stats.realized / stats.planned) * 100 : 0;
                        const remaining = stats.planned - stats.realized;
                        const progressColor = percentage < 80 ? 'from-green-500 to-green-600' : percentage <= 100 ? 'from-yellow-500 to-yellow-600' : 'from-red-500 to-red-600';

                        return (
                          <tr key={category} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                            <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{category}</td>
                            <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{stats.planned.toLocaleString('pl-PL')} zł</td>
                            <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{stats.realized.toLocaleString('pl-PL')} zł</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full bg-gradient-to-r ${progressColor} transition-all`}
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  />
                                </div>
                                <span className="text-sm font-bold text-gray-900 dark:text-white w-14 text-right">{percentage.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className={`py-3 px-4 text-right font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {remaining.toLocaleString('pl-PL')} zł
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">Brak pozycji budżetowych</p>
            )}
          </div>

          {/* Income by Type */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users size={20} className="text-pink-600" />
              Wpływy wg typu
            </h3>
            {(() => {
              const typeTotals = incomeTransactions.reduce((acc, t) => {
                acc[t.type] = (acc[t.type] || 0) + (t.amount || 0);
                return acc;
              }, {});

              const sortedTypes = Object.entries(typeTotals).sort(([,a], [,b]) => b - a);
              const total = sortedTypes.reduce((sum, [,val]) => sum + val, 0);

              return sortedTypes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {sortedTypes.map(([type, amount]) => {
                    const percentage = total > 0 ? (amount / total) * 100 : 0;
                    const bgColor = type === 'Kolekta' ? 'from-green-500 to-emerald-600' :
                                   type === 'Darowizny' ? 'from-blue-500 to-indigo-600' :
                                   'from-purple-500 to-violet-600';
                    return (
                      <div key={type} className={`bg-gradient-to-br ${bgColor} rounded-xl p-4 text-white`}>
                        <p className="text-white/80 text-sm font-medium">{type}</p>
                        <p className="text-2xl font-bold mt-1">{amount.toLocaleString('pl-PL')} zł</p>
                        <p className="text-white/60 text-sm mt-2">{percentage.toFixed(1)}% całości</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">Brak danych o wpływach</p>
              );
            })()}
          </div>
        </section>
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <MaterialsTab moduleKey="finance" canEdit={true} />
        </section>
      )}

      {/* MODAL: Budget Item */}
      {showBudgetModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Nowa pozycja budżetowa</h3>
              <button onClick={() => setShowBudgetModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <CustomSelect
                label="Kategoria (Służba)"
                value={budgetForm.category}
                onChange={(val) => setBudgetForm({...budgetForm, category: val})}
                options={[
                  { value: 'Grupa Uwielbienia', label: 'Grupa Uwielbienia' },
                  { value: 'MediaTeam', label: 'MediaTeam' },
                  { value: 'Grupy domowe', label: 'Grupy domowe' },
                  { value: 'małe schWro', label: 'małe schWro' },
                  { value: 'AtmosferaTeam', label: 'AtmosferaTeam' }
                ]}
                placeholder="Wybierz służbę"
              />
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Opis</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={3}
                  value={budgetForm.description}
                  onChange={(e) => setBudgetForm({...budgetForm, description: e.target.value})}
                  placeholder="Opis kosztów"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Planowana kwota (PLN)</label>
                <input
                  type="number"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={budgetForm.planned_amount}
                  onChange={(e) => setBudgetForm({...budgetForm, planned_amount: e.target.value})}
                  placeholder="0.00"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowBudgetModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  Anuluj
                </button>
                <button
                  onClick={saveBudgetItem}
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

      {/* MODAL: Income */}
      {showIncomeModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Nowy wpływ</h3>
              <button onClick={() => setShowIncomeModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <CustomDatePicker
                label="Data wpływu"
                value={incomeForm.date}
                onChange={(val) => setIncomeForm({...incomeForm, date: val})}
              />
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kwota (PLN)</label>
                <input
                  type="number"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({...incomeForm, amount: e.target.value})}
                  placeholder="0.00"
                />
              </div>
              <CustomSelect
                label="Typ wpływu"
                value={incomeForm.type}
                onChange={(val) => setIncomeForm({...incomeForm, type: val})}
                options={[
                  { value: 'Kolekta', label: 'Kolekta' },
                  { value: 'Darowizny', label: 'Darowizny' },
                  { value: 'Inne', label: 'Inne' }
                ]}
              />
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Źródło</label>
                <input
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={incomeForm.source}
                  onChange={(e) => setIncomeForm({...incomeForm, source: e.target.value})}
                  placeholder="np. Kolekta niedzielna"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Notatka</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={incomeForm.notes}
                  onChange={(e) => setIncomeForm({...incomeForm, notes: e.target.value})}
                  placeholder="Dodatkowe informacje"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Tagi</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Dodaj tag"
                    onKeyPress={(e) => e.key === 'Enter' && addTag(incomeForm, setIncomeForm)}
                  />
                  <button
                    onClick={() => addTag(incomeForm, setIncomeForm)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {incomeForm.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 rounded-lg text-xs flex items-center gap-1"
                    >
                      <Tag size={12} />
                      {tag}
                      <button onClick={() => removeTag(tag, incomeForm, setIncomeForm)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowIncomeModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  Anuluj
                </button>
                <button
                  onClick={saveIncome}
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

      {/* MODAL: Expense */}
      {showExpenseModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl p-6 border border-white/20 dark:border-gray-700 my-8">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Nowy wydatek</h3>
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

              {/* Wiersz 3: Kategoria i Opis kosztu */}
              <div className="grid grid-cols-2 gap-4">
                <CustomSelect
                  label="Kategoria (powiązana z budżetem)"
                  value={expenseForm.category}
                  onChange={(val) => setExpenseForm({...expenseForm, category: val, description: ''})}
                  options={budgetCategories.length > 0 ? budgetCategories : [{ value: '', label: 'Najpierw dodaj pozycje budżetowe' }]}
                  placeholder="Wybierz kategorię"
                />
                {expenseForm.category && (
                  <CustomSelect
                    label="Opis kosztu (z budżetu)"
                    value={expenseForm.description}
                    onChange={(val) => setExpenseForm({...expenseForm, description: val})}
                    options={budgetItems
                      .filter(item => item.category === expenseForm.category)
                      .map(item => ({ value: item.description, label: item.description }))}
                    placeholder="Wybierz opis kosztu"
                  />
                )}
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
                    onKeyPress={(e) => e.key === 'Enter' && addTag(expenseForm, setExpenseForm)}
                  />
                  <button
                    onClick={() => addTag(expenseForm, setExpenseForm)}
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
                      <button onClick={() => removeTag(tag, expenseForm, setExpenseForm)}>
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

      {/* MODAL: Account Balances */}
      {showBalanceModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Stan początkowy kont - {selectedYear}</h3>
              <button onClick={() => setShowBalanceModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-5">
              {/* PLN Section */}
              <div>
                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Złotówki (PLN)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      <CreditCard size={12} className="inline mr-1" />
                      Rachunek bankowy
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      value={balanceForm.bank_pln}
                      onChange={(e) => setBalanceForm({...balanceForm, bank_pln: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      <Banknote size={12} className="inline mr-1" />
                      Gotówka
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      value={balanceForm.cash_pln}
                      onChange={(e) => setBalanceForm({...balanceForm, cash_pln: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Currency Section */}
              <div>
                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                  Waluta obca
                </h4>
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Typ waluty</label>
                  <select
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={balanceForm.currency_type}
                    onChange={(e) => setBalanceForm({...balanceForm, currency_type: e.target.value})}
                  >
                    <option value="EUR">EUR - Euro</option>
                    <option value="USD">USD - Dolar amerykański</option>
                    <option value="GBP">GBP - Funt brytyjski</option>
                    <option value="CHF">CHF - Frank szwajcarski</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      <CreditCard size={12} className="inline mr-1" />
                      Rachunek walutowy
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      value={balanceForm.bank_currency}
                      onChange={(e) => setBalanceForm({...balanceForm, bank_currency: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      <Banknote size={12} className="inline mr-1" />
                      Gotówka walutowa
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      value={balanceForm.cash_currency}
                      onChange={(e) => setBalanceForm({...balanceForm, cash_currency: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">💡 Wskazówka</p>
                <p>Wprowadź stany kont na początek roku {selectedYear}. System automatycznie doliczy wpływy i wydatki, aby pokazać aktualny stan.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowBalanceModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  Anuluj
                </button>
                <button
                  onClick={saveAccountBalances}
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
};

export default FinanceModule;
