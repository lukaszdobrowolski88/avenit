import React, { useState, useEffect, useRef } from 'react';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { DollarSign, TrendingUp, Receipt, Calendar, Plus, Upload, Download, Printer, Repeat, CheckCircle, XCircle, Clock, Copy, AlertTriangle, Tag, X, FileText, Trash2, Edit2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Users, Building2, Settings, Banknote, CreditCard, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createPortal } from 'react-dom';
import { useCampusQuery } from '../hooks/useCampusQuery';
import CustomSelect from '../components/CustomSelect';
import MaterialsTab from './shared/MaterialsTab';
import ResponsiveTabs from '../components/ResponsiveTabs';
import PageHeader from '../components/PageHeader';
import { useT } from '../i18n';
import { tr } from '../i18n';
import { toast } from '../lib/toast';

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
            ? 'border-accent-primary-light ring-2 ring-accent-primary-light/20 dark:border-accent-primary-light'
            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-accent-primary-light dark:hover:border-accent-primary'
          }
        `}
      >
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={16} className="text-gray-400" />
          <span className={displayValue ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
            {displayValue || tr('Wybierz datę')}
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
            {[tr('Pn'), tr('Wt'), tr('Śr'), tr('Cz'), tr('Pt'), tr('So'), tr('Nd')].map(d => (
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
                      ? 'bg-accent-primary text-white shadow-md shadow-accent-primary-light/30'
                      : isToday
                        ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 text-accent-primary dark:text-accent-primary-light border border-accent-primary-lighter dark:border-accent-primary-dark'
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

// Statusy wydatku (workflow akceptacji).
const EXPENSE_STATUS = {
  draft: { label: 'Szkic', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  submitted: { label: 'Do akceptacji', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  approved: { label: 'Zaakceptowany', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  rejected: { label: 'Odrzucony', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  paid: { label: 'Opłacony', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
};

// Eksport tablicy obiektów do pliku CSV (średnik = separator PL/Excel; BOM dla polskich znaków).
function exportToCsv(filename, rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(';')).join('\n');
  const csv = '﻿' + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Klucz team_type dla WBUDOWANYCH modułów zespołów — musi zgadzać się z tym, czym
// filtrują ich zakładki Finanse (ministryName w Worship/Media/Atmosfera/Kids/
// HomeGroups/Mlodziezowka; bywa inny niż etykieta w menu). Dla pozostałych i WŁASNYCH
// modułów wartością jest po prostu etykieta.
const TEAM_TYPE_BY_KEY = {
  worship: 'Grupa Uwielbienia',
  media: 'MediaTeam',
  atmosfera: 'AtmosferaTeam',
  kids: 'małe Avenit',
  homegroups: 'Grupy domowe',
  mlodziezowka: 'Mlodziezowka',
};

// Moduły SYSTEMOWE/techniczne — pomijane na liście „Kategoria (Służba)" budżetu.
// Denylista (a nie allowlista) — dzięki temu WŁASNE moduły użytkownika zawsze się pokażą.
const SYSTEM_MODULE_KEYS = new Set([
  'dashboard', 'settings', 'analytics', 'automation', 'ai', 'members',
  'calendar', 'komunikator', 'mail', 'mailing', 'push_campaigns', 'sms_campaigns',
  'programs', 'boards', 'rooms', 'attendance', 'rsvp', 'finance', 'care',
]);

const FinanceModule = () => {
  const t = useT();
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const [activeTab, setActiveTab] = useState('budget');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [budgetItems, setBudgetItems] = useState([]);
  // Lista służb do przypisania budżetu = WSZYSTKIE moduły (dynamicznie z app_modules,
  // w tym własne). Wartość = team_type wbudowanych zespołów lub etykieta modułu.
  const [serviceOptions, setServiceOptions] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('app_modules').select('key, label, display_order').order('display_order', { ascending: true });
        const opts = (data || [])
          .filter((m) => m.label && !SYSTEM_MODULE_KEYS.has(m.key))
          .map((m) => ({ value: TEAM_TYPE_BY_KEY[m.key] || m.label, label: m.label }));
        setServiceOptions(opts);
      } catch { /* zostaje fallback w dropdownie */ }
    })();
  }, []);
  const [incomeTransactions, setIncomeTransactions] = useState([]);
  const [expenseTransactions, setExpenseTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Forms
  const [budgetForm, setBudgetForm] = useState({
    kind: 'expense',
    category: '',
    description: '',
    planned_amount: '',
    period_type: 'year'
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
    cost_category: '',   // własna kategoria kosztu (niezależna od powiązania z budżetem)
    description: '',
    detailed_description: '',
    responsible_person: '',
    invoice_number: '',
    due_date: '',
    is_paid: true,
    submit_for_approval: false, // wniosek o zwrot / do akceptacji → status 'submitted'
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
    cost_category: '',
    contractor: '',
    responsible: '',
    tag: '',
    dateFrom: '',
    dateTo: ''
  });

  // ── Kategorie (własne) + paleta tagów ─────────────────────────────────────
  const [categories, setCategories] = useState([]); // expense_categories: {id,name,kind,color,icon,is_active}
  const [tagPalette, setTagPalette] = useState([]); // finance_tags: {id,name,color}
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const incomeCategories = categories.filter((c) => c.kind === 'income' && c.is_active !== false);
  const expenseCategories = categories.filter((c) => c.kind === 'expense' && c.is_active !== false);
  const tagColor = (name) => tagPalette.find((t) => t.name.toLowerCase() === String(name).toLowerCase())?.color || '#6366f1';

  const fetchCategories = async () => {
    try {
      const { data } = await supabase.from('expense_categories').select('*').order('name');
      setCategories(data || []);
    } catch { /* pusto → fallback w dropdownach */ }
  };
  const fetchTagPalette = async () => {
    try {
      const { data } = await supabase.from('finance_tags').select('*').order('name');
      setTagPalette(data || []);
    } catch { /* brak palety → domyślny kolor */ }
  };
  useEffect(() => { fetchCategories(); fetchTagPalette(); }, []);

  // Dodaje nowe tagi do palety (żeby dostały kolor i podpowiadały się później).
  const ensureTagsInPalette = async (tags) => {
    const known = new Set(tagPalette.map((t) => t.name.toLowerCase()));
    const fresh = (tags || []).filter((t) => t && !known.has(String(t).toLowerCase()));
    if (!fresh.length) return;
    const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#14b8a6', '#ec4899'];
    try {
      for (let i = 0; i < fresh.length; i++) {
        await supabase.from('finance_tags').insert([{ name: fresh[i], color: PALETTE[(tagPalette.length + i) % PALETTE.length] }]);
      }
      fetchTagPalette();
    } catch { /* kolizja nazwy = już jest, ignoruj */ }
  };

  // Menedżer kategorii (CRUD na expense_categories, rodzaj income/expense).
  const [catForm, setCatForm] = useState({ name: '', kind: 'expense', color: '#6366f1' });
  const [vendorName, setVendorName] = useState('');
  const saveCategory = async () => {
    if (!catForm.name.trim()) { toast.error(tr('Podaj nazwę kategorii')); return; }
    try {
      await supabase.from('expense_categories').insert([{ name: catForm.name.trim(), kind: catForm.kind, color: catForm.color, is_active: true }]);
      setCatForm({ name: '', kind: catForm.kind, color: '#6366f1' });
      fetchCategories();
    } catch (e) { toast.error(tr('Błąd zapisywania: ') + e.message); }
  };
  const toggleCategoryActive = async (c) => {
    try { await supabase.from('expense_categories').update({ is_active: !(c.is_active !== false) }).eq('id', c.id); fetchCategories(); } catch (e) { toast.error(e.message); }
  };
  const deleteCategory = async (id) => {
    if (!confirm(tr('Usunąć tę kategorię? Istniejące transakcje zachowają swoją nazwę kategorii.'))) return;
    try { await supabase.from('expense_categories').delete().eq('id', id); fetchCategories(); } catch (e) { toast.error(tr('Błąd usuwania: ') + e.message); }
  };

  // E-mail zalogowanego (do audytu akceptacji/zgłoszeń).
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrentUserEmail(data?.user?.email || '')).catch(() => {}); }, []);

  // ── Transakcje cykliczne (finance_recurring) ──────────────────────────────
  const [recurringItems, setRecurringItems] = useState([]);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const emptyRecurring = { kind: 'expense', title: '', amount: '', category: '', team_type: '', contractor: '', frequency: 'monthly', day_of_month: '', next_run_date: '', end_date: '', is_active: true };
  const [recurringForm, setRecurringForm] = useState(emptyRecurring);
  const fetchRecurring = async () => {
    try { const { data } = await supabase.from('finance_recurring').select('*').order('next_run_date', { ascending: true }); setRecurringItems(data || []); } catch { /* brak tabeli przed migracją */ }
  };
  useEffect(() => { fetchRecurring(); }, []);
  const saveRecurring = async () => {
    if (!recurringForm.title.trim() || !recurringForm.amount) { toast.error(tr('Podaj nazwę i kwotę')); return; }
    const payload = {
      kind: recurringForm.kind, title: recurringForm.title.trim(), amount: parseFloat(recurringForm.amount),
      category: recurringForm.category || null, team_type: recurringForm.team_type || null, contractor: recurringForm.contractor || null,
      frequency: recurringForm.frequency, day_of_month: recurringForm.day_of_month ? parseInt(recurringForm.day_of_month) : null,
      next_run_date: recurringForm.next_run_date || null, end_date: recurringForm.end_date || null, is_active: recurringForm.is_active,
    };
    try {
      if (recurringForm.id) await supabase.from('finance_recurring').update(payload).eq('id', recurringForm.id);
      else await supabase.from('finance_recurring').insert([payload]);
      setShowRecurringModal(false); setRecurringForm(emptyRecurring); fetchRecurring();
    } catch (e) { toast.error(tr('Błąd zapisywania: ') + e.message); }
  };
  const toggleRecurring = async (r) => { try { await supabase.from('finance_recurring').update({ is_active: !r.is_active }).eq('id', r.id); fetchRecurring(); } catch (e) { toast.error(e.message); } };
  const deleteRecurring = async (id) => { if (!confirm(tr('Usunąć ten plan cykliczny?'))) return; try { await supabase.from('finance_recurring').delete().eq('id', id); fetchRecurring(); } catch (e) { toast.error(e.message); } };

  // ── Kontrahenci (finance_vendors) — autouzupełnianie + auto-dopis ──────────
  const [vendors, setVendors] = useState([]);
  const fetchVendors = async () => { try { const { data } = await supabase.from('finance_vendors').select('*').order('name'); setVendors(data || []); } catch { /* brak tabeli */ } };
  useEffect(() => { fetchVendors(); }, []);
  const addVendor = async (name) => { const n = String(name || '').trim(); if (!n) return; try { await supabase.from('finance_vendors').insert([{ name: n }]); fetchVendors(); } catch (e) { toast.error(e.message); } };
  const deleteVendor = async (id) => { try { await supabase.from('finance_vendors').delete().eq('id', id); fetchVendors(); } catch (e) { toast.error(e.message); } };

  // Sumy poprzedniego roku (do porównania rok-do-roku w Raportach).
  const [prevYearTotals, setPrevYearTotals] = useState({ income: 0, expense: 0 });
  useEffect(() => {
    const py = selectedYear - 1, from = `${py}-01-01`, to = `${py}-12-31`;
    (async () => {
      try {
        const [inc, exp] = await Promise.all([
          supabase.from('income_transactions').select('amount').gte('date', from).lte('date', to),
          supabase.from('expense_transactions').select('amount').gte('payment_date', from).lte('payment_date', to),
        ]);
        setPrevYearTotals({
          income: (inc.data || []).reduce((s, r) => s + Number(r.amount || 0), 0),
          expense: (exp.data || []).reduce((s, r) => s + Number(r.amount || 0), 0),
        });
      } catch { setPrevYearTotals({ income: 0, expense: 0 }); }
    })();
  }, [selectedYear]);
  const ensureVendor = async (name) => {
    const n = String(name || '').trim();
    if (!n || vendors.some((v) => v.name.toLowerCase() === n.toLowerCase())) return;
    try { await supabase.from('finance_vendors').insert([{ name: n }]); fetchVendors(); } catch { /* kolizja = już jest */ }
  };

  // ── Raport finansowy mailem (na żądanie) ──────────────────────────────────
  const [showReportEmailModal, setShowReportEmailModal] = useState(false);
  const [reportRecipients, setReportRecipients] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const sendReportEmail = async () => {
    const list = reportRecipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error(tr('Podaj adresy e-mail')); return; }
    setSendingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke('finance-report-email', { body: { year: selectedYear, recipients: list } });
      if (error) throw error;
      toast.success(tr('Raport wysłany') + ` (${data?.sent || list.length})`);
      setShowReportEmailModal(false); setReportRecipients('');
    } catch (e) { toast.error(tr('Błąd wysyłki: ') + (e.message || e)); }
    finally { setSendingReport(false); }
  };

  // ── Propozycje budżetu od służb ───────────────────────────────────────────
  const [proposals, setProposals] = useState([]);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const emptyProposal = { kind: 'expense', team_type: '', description: '', amount: '', note: '' };
  const [proposalForm, setProposalForm] = useState(emptyProposal);
  const fetchProposals = async () => {
    // Wszystkie oczekujące (dowolny rok docelowy) + ostatnie rozpatrzone — żeby nic nie zginęło.
    try { const { data } = await supabase.from('budget_proposals').select('*').order('created_at', { ascending: false }).limit(100); setProposals(data || []); } catch { setProposals([]); }
  };
  useEffect(() => { fetchProposals(); /* eslint-disable-next-line */ }, []);
  const saveProposal = async () => {
    if (!proposalForm.team_type || !proposalForm.description.trim() || !proposalForm.amount) { toast.error(tr('Wypełnij pola')); return; }
    try {
      await supabase.from('budget_proposals').insert([{
        year: selectedYear, kind: proposalForm.kind, team_type: proposalForm.team_type, category: proposalForm.team_type,
        description: proposalForm.description.trim(), amount: parseFloat(proposalForm.amount), note: proposalForm.note || null,
        submitted_by: currentUserEmail || null, status: 'pending',
      }]);
      setShowProposalModal(false); setProposalForm(emptyProposal); fetchProposals();
      toast.success(tr('Propozycja zgłoszona'));
    } catch (e) { toast.error(tr('Błąd: ') + e.message); }
  };
  const approveProposal = async (p) => {
    try {
      const targetYear = p.year || selectedYear;   // pozycja trafia do budżetu ROKU DOCELOWEGO propozycji
      const { data } = await supabase.from('budget_items').insert([{
        year: targetYear, kind: p.kind || 'expense', category: p.category || p.team_type, team_type: p.team_type || p.category,
        description: p.description, planned_amount: p.amount, period_type: 'year', campus_id: campusIdForInsert,
      }]).select();
      await supabase.from('budget_proposals').update({ status: 'approved' }).eq('id', p.id);
      await logBudgetAudit('created', { id: data?.[0]?.id, kind: p.kind, category: p.category || p.team_type, description: p.description, planned_amount: p.amount });
      supabase.functions.invoke('budget-proposal-notify', { body: { proposalId: p.id, event: 'decided' } }).catch(() => {});
      fetchProposals(); fetchBudgetItems();
      toast.success(tr('Zatwierdzono do budżetu') + ` (${targetYear})`);
    } catch (e) { toast.error(tr('Błąd: ') + e.message); }
  };
  const rejectProposal = async (id) => {
    try {
      await supabase.from('budget_proposals').update({ status: 'rejected' }).eq('id', id);
      supabase.functions.invoke('budget-proposal-notify', { body: { proposalId: id, event: 'decided' } }).catch(() => {});
      fetchProposals();
    } catch (e) { toast.error(e.message); }
  };

  // ── Status wydatku (workflow akceptacji) ──────────────────────────────────
  const setExpenseStatus = async (id, status) => {
    const patch = { status };
    if (status === 'approved') { patch.approved_by = currentUserEmail; patch.approved_at = new Date().toISOString(); }
    if (status === 'paid') { patch.is_paid = true; patch.paid_date = new Date().toISOString().slice(0, 10); }
    try { await supabase.from('expense_transactions').update(patch).eq('id', id); fetchExpenseTransactions(); } catch (e) { toast.error(e.message); }
  };

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
  }, [activeTab, selectedYear, selectedCampusId]);

  // Fetch income transactions
  useEffect(() => {
    if (activeTab === 'income') {
      fetchIncomeTransactions();
    }
  }, [activeTab, selectedYear, selectedCampusId]);

  // Fetch expense transactions
  useEffect(() => {
    if (activeTab === 'expenses' || activeTab === 'budget') {
      fetchExpenseTransactions();
    }
  }, [activeTab, selectedYear, selectedCampusId]);

  // Fetch all data for reports
  useEffect(() => {
    if (activeTab === 'reports') {
      fetchBudgetItems();
      fetchIncomeTransactions();
      fetchExpenseTransactions();
      fetchAccountBalances();
    }
  }, [activeTab, selectedYear, selectedCampusId]);

  // Fetch account balances on mount
  useEffect(() => {
    fetchAccountBalances();
  }, [selectedYear, selectedCampusId]);

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
      toast.success(tr('Stan kont zapisany pomyślnie'));
    } catch (error) {
      console.error('Error saving balances:', error);
      toast.error(tr('Błąd zapisywania: ') + error.message);
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
      const { data, error } = await withCampusFilter(supabase
        .from('budget_items')
        .select('*'))
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

  // Log zmian budżetu (kto/kiedy/co) — best-effort, nie blokuje zapisu przy braku tabeli.
  const [budgetAudit, setBudgetAudit] = useState([]);
  const [budgetVersions, setBudgetVersions] = useState([]);
  const [showBudgetHistory, setShowBudgetHistory] = useState(false);
  const [changeItem, setChangeItem] = useState(null); // [zmiany] pojedynczej pozycji do podglądu
  // Zmiany kwoty danej pozycji (do oznaczenia „zmieniono" w tabeli).
  const itemChanges = (id) => budgetAudit.filter((a) => a.item_id === id && a.action === 'updated'
    && a.before && a.after && Number(a.before.planned_amount) !== Number(a.after.planned_amount));
  const logBudgetAudit = async (action, item, before) => {
    try {
      await supabase.from('budget_audit').insert([{
        year: selectedYear, item_id: item.id || null, action,
        category: item.category || null, description: item.description || null,
        before: before || null, after: action === 'deleted' ? null : item, actor: currentUserEmail || null,
      }]);
    } catch { /* brak tabeli/uprawnień — pomiń */ }
  };
  const fetchBudgetHistory = async () => {
    try { const { data } = await supabase.from('budget_audit').select('*').eq('year', selectedYear).order('created_at', { ascending: false }).limit(50); setBudgetAudit(data || []); } catch { setBudgetAudit([]); }
    try { const { data } = await supabase.from('budget_versions').select('id, label, created_by, created_at, snapshot').eq('year', selectedYear).order('created_at', { ascending: false }); setBudgetVersions(data || []); } catch { setBudgetVersions([]); }
  };
  const saveBudgetVersion = async () => {
    const label = prompt(tr('Nazwa wersji (np. „Projekt zarządu", „Zatwierdzony")'));
    if (label === null) return;
    try {
      await supabase.from('budget_versions').insert([{ year: selectedYear, label: label.trim() || `Wersja ${new Date().toLocaleDateString('pl-PL')}`, snapshot: budgetItems, created_by: currentUserEmail || null }]);
      toast.success(tr('Zapisano wersję budżetu'));
      fetchBudgetHistory();
    } catch (e) { toast.error(tr('Błąd zapisu wersji: ') + e.message); }
  };
  // Audyt ładowany od razu — żeby oznaczenia „zmieniono" były widoczne bez otwierania Historii.
  useEffect(() => { fetchBudgetHistory(); /* eslint-disable-next-line */ }, [selectedYear, budgetItems.length]);

  const saveBudgetItem = async () => {
    if (!budgetForm.category || !budgetForm.planned_amount) {
      toast.error(tr('Wypełnij wymagane pola'));
      return;
    }

    try {
      if (budgetForm.id) {
        const before = budgetItems.find((b) => b.id === budgetForm.id) || null;
        // Update existing item
        const { error } = await supabase
          .from('budget_items')
          .update({
            kind: budgetForm.kind || 'expense',
            category: budgetForm.category,
            team_type: budgetForm.category,
            description: budgetForm.description,
            planned_amount: parseFloat(budgetForm.planned_amount),
            period_type: budgetForm.period_type || 'year'
          })
          .eq('id', budgetForm.id);

        if (error) throw error;
        await logBudgetAudit('updated', { id: budgetForm.id, kind: budgetForm.kind, category: budgetForm.category, description: budgetForm.description, planned_amount: parseFloat(budgetForm.planned_amount) }, before);
      } else {
        // Insert new item
        const { data, error } = await supabase.from('budget_items').insert([{
          year: selectedYear,
          kind: budgetForm.kind || 'expense',
          category: budgetForm.category,
          // team_type = ten sam klucz służby, którym filtrują moduły zespołów
          // (WorshipModule itd. czytają budget_items po team_type). Bez tego pozycja
          // dodana w module Finanse nie pokazywała się w zakładce Finanse zespołu.
          team_type: budgetForm.category,
          description: budgetForm.description,
          planned_amount: parseFloat(budgetForm.planned_amount),
          period_type: budgetForm.period_type || 'year',
          campus_id: campusIdForInsert
        }]).select();

        if (error) throw error;
        await logBudgetAudit('created', { id: data?.[0]?.id, kind: budgetForm.kind, category: budgetForm.category, description: budgetForm.description, planned_amount: parseFloat(budgetForm.planned_amount) });
      }

      setShowBudgetModal(false);
      setBudgetForm({ kind: 'expense', category: '', description: '', planned_amount: '', period_type: 'year' });
      fetchBudgetItems();
    } catch (error) {
      console.error('Error saving budget item:', error);
      toast.error(tr('Błąd zapisywania: ') + error.message);
    }
  };

  const deleteBudgetItem = async (id) => {
    if (!confirm(tr('Czy na pewno chcesz usunąć tę pozycję budżetową?'))) return;

    try {
      const before = budgetItems.find((b) => b.id === id) || null;
      const { error } = await supabase
        .from('budget_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      if (before) await logBudgetAudit('deleted', before, before);
      fetchBudgetItems();
    } catch (error) {
      console.error('Error deleting budget item:', error);
      toast.error(tr('Błąd usuwania: ') + error.message);
    }
  };

  // Kopiuje pozycje budżetowe z poprzedniego roku do bieżącego (plan, bez realizacji).
  const copyBudgetFromLastYear = async () => {
    const prev = selectedYear - 1;
    if (!confirm(tr(`Skopiować pozycje budżetu z roku ${prev} do ${selectedYear}?`))) return;
    try {
      const { data: prevItems } = await supabase.from('budget_items').select('*').eq('year', prev);
      if (!prevItems || prevItems.length === 0) { toast.error(tr(`Brak pozycji budżetu w roku ${prev}`)); return; }
      const rows = prevItems.map((it) => ({
        year: selectedYear, kind: it.kind || 'expense', category: it.category, team_type: it.team_type || it.category,
        description: it.description, planned_amount: it.planned_amount,
        period_type: it.period_type || 'year', period_value: it.period_value || null,
        campus_id: campusIdForInsert,
      }));
      const { error } = await supabase.from('budget_items').insert(rows);
      if (error) throw error;
      toast.success(tr(`Skopiowano ${rows.length} pozycji z ${prev}`));
      fetchBudgetItems();
    } catch (e) { toast.error(tr('Błąd kopiowania: ') + e.message); }
  };

  const saveIncome = async () => {
    if (!incomeForm.date || !incomeForm.amount || !incomeForm.source) {
      toast.error(tr('Wypełnij wymagane pola'));
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

      await ensureTagsInPalette(incomeForm.tags);
      setShowIncomeModal(false);
      setIncomeForm({ date: '', amount: '', type: 'Kolekta', source: '', notes: '', tags: [] });
      fetchIncomeTransactions();
    } catch (error) {
      console.error('Error saving income:', error);
      toast.error(tr('Błąd zapisywania: ') + error.message);
    }
  };

  const deleteIncome = async (id) => {
    if (!confirm(tr('Czy na pewno chcesz usunąć ten wpływ?'))) return;

    try {
      const { error } = await supabase
        .from('income_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchIncomeTransactions();
    } catch (error) {
      console.error('Error deleting income:', error);
      toast.error(tr('Błąd usuwania: ') + error.message);
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

  const saveExpense = async () => {
    if (!expenseForm.payment_date || !expenseForm.amount || !expenseForm.contractor || !expenseForm.category || !expenseForm.description || !expenseForm.responsible_person) {
      toast.error(tr('Wypełnij wymagane pola'));
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
            cost_category: expenseForm.cost_category || null,
            description: expenseForm.description,
            detailed_description: expenseForm.detailed_description,
            responsible_person: expenseForm.responsible_person,
            invoice_number: expenseForm.invoice_number || null,
            due_date: expenseForm.due_date || null,
            is_paid: expenseForm.is_paid !== false,
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
          cost_category: expenseForm.cost_category || null,
          description: expenseForm.description,
          detailed_description: expenseForm.detailed_description,
          responsible_person: expenseForm.responsible_person,
          invoice_number: expenseForm.invoice_number || null,
          due_date: expenseForm.due_date || null,
          is_paid: expenseForm.is_paid !== false,
          status: expenseForm.submit_for_approval ? 'submitted' : 'approved',
          submitted_by: expenseForm.submit_for_approval ? currentUserEmail : null,
          documents: expenseForm.documents,
          tags: expenseForm.tags
        }]);

        if (error) throw error;
      }

      await ensureTagsInPalette(expenseForm.tags);
      await ensureVendor(expenseForm.contractor);
      setShowExpenseModal(false);
      setExpenseForm({ payment_date: '', amount: '', contractor: '', category: '', cost_category: '', description: '', detailed_description: '', responsible_person: '', invoice_number: '', due_date: '', is_paid: true, submit_for_approval: false, documents: [], tags: [] });
      fetchExpenseTransactions();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error(tr('Błąd zapisywania: ') + error.message);
    }
  };

  const deleteExpense = async (id) => {
    if (!confirm(tr('Czy na pewno chcesz usunąć ten wydatek?'))) return;

    try {
      const { error } = await supabase
        .from('expense_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchExpenseTransactions();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error(tr('Błąd usuwania: ') + error.message);
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
    if (expenseFilters.cost_category && transaction.cost_category !== expenseFilters.cost_category) return false;
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

  // Budżet dzieli się na planowane WYDATKI i PRZYCHODY (kolumna kind).
  const [budgetPeriod, setBudgetPeriod] = useState('all'); // filtr okresu: all|year|quarter|month
  const inPeriod = (i) => budgetPeriod === 'all' || (i.period_type || 'year') === budgetPeriod;
  const expenseBudgetItems = budgetItems.filter((i) => i.kind !== 'income' && inPeriod(i));
  const incomeBudgetItems = budgetItems.filter((i) => i.kind === 'income' && inPeriod(i));
  const totalPlannedIncome = incomeBudgetItems.reduce((s, i) => s + Number(i.planned_amount || 0), 0);
  const totalPlannedExpense = expenseBudgetItems.reduce((s, i) => s + Number(i.planned_amount || 0), 0);
  // Realizacja przychodu z budżetu = suma wpływów pasujących służbą (team_type) lub typem.
  const calculateIncomeRealization = (category) => incomeTransactions
    .filter((t) => t.team_type === category || t.type === category)
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  return (
    <div className="space-y-8">
      <PageHeader moduleKey="finance" icon={DollarSign} title="Finanse" subtitle={t('Zarządzanie budżetem i finansami kościoła')}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 dark:bg-gray-900/80 text-gray-700 dark:text-gray-200 text-sm font-medium shadow-sm hover:bg-white dark:hover:bg-gray-900 backdrop-blur-sm shrink-0"
              title={tr('Zarządzaj kategoriami')}
            >
              <Tag size={15} /> {tr('Kategorie')}
            </button>
            <CustomSelect
              value={selectedYear}
              onChange={(val) => setSelectedYear(parseInt(val))}
              options={years.map(y => ({ value: y, label: y.toString() }))}
            />
          </div>
        } />

      <ResponsiveTabs moduleKey="finance"
        tabs={[
          { id: 'budget', label: t('Budżet'), icon: DollarSign },
          { id: 'income', label: t('Wpływy'), icon: TrendingUp, tour: 'fin-income-tab' },
          { id: 'expenses', label: t('Wydatki'), icon: Receipt },
          { id: 'recurring', label: tr('Cykliczne'), icon: Repeat },
          { id: 'reports', label: t('Raporty'), icon: BarChart3 },
          { id: 'files', label: t('Pliki'), icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'budget' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Budżet {selectedYear}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                <option value="all">{tr('Wszystkie okresy')}</option>
                <option value="year">{tr('Roczny')}</option>
                <option value="quarter">{tr('Kwartalny')}</option>
                <option value="month">{tr('Miesięczny')}</option>
              </select>
              <button
                onClick={() => { fetchBudgetHistory(); setShowBudgetHistory(true); }}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Historia zmian i wersje')}
              >
                <Clock size={16} /> {tr('Historia')}
              </button>
              <button
                onClick={saveBudgetVersion}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Zapisz migawkę bieżącego budżetu')}
              >
                <Copy size={16} /> {tr('Zapisz wersję')}
              </button>
              <button
                onClick={copyBudgetFromLastYear}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Kopiuj z zeszłego roku')}
              >
                <Copy size={16} /> {tr('Kopiuj z')} {selectedYear - 1}
              </button>
              <button
                onClick={() => exportToCsv(`budzet-${selectedYear}.csv`, budgetItems, [
                  { label: 'Służba', value: 'category' }, { label: 'Opis', value: 'description' },
                  { label: 'Plan', value: 'planned_amount' },
                  { label: 'Realizacja', value: (r) => calculateRealization(r.category, r.description) },
                ])}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Eksport CSV')}
              >
                <Download size={16} /> CSV
              </button>
              <button
                onClick={() => setShowBudgetModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
              >
                <Plus size={18} />
                {tr('Dodaj pozycję budżetową')}
              </button>
            </div>
          </div>

          {/* Podsumowanie planu: przychody vs wydatki */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-900/10 p-4">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase">{tr('Planowane przychody')}</div>
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{totalPlannedIncome.toLocaleString('pl-PL')} zł</div>
            </div>
            <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 p-4">
              <div className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase">{tr('Planowane wydatki')}</div>
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">{totalPlannedExpense.toLocaleString('pl-PL')} zł</div>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-4">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{tr('Planowany bilans')}</div>
              <div className={`text-2xl font-bold ${totalPlannedIncome - totalPlannedExpense >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(totalPlannedIncome - totalPlannedExpense).toLocaleString('pl-PL')} zł</div>
            </div>
          </div>

          {/* Planowane PRZYCHODY (kind='income') — ten sam układ kolumn co wydatki */}
          {incomeBudgetItems.length > 0 && (
            <div className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/10 text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2"><ArrowUpRight size={16} /> {tr('Planowane przychody')}</div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
                      <th className="text-left py-3 px-4 font-medium">{tr('Kategoria')}</th>
                      <th className="text-left py-3 px-4 font-medium">{tr('Opis')}</th>
                      <th className="text-right py-3 px-4 font-medium">{tr('Plan (PLN)')}</th>
                      <th className="text-right py-3 px-4 font-medium">{tr('Realizacja (PLN)')}</th>
                      <th className="text-center py-3 px-4 font-medium">{tr('% Realizacji')}</th>
                      <th className="text-right py-3 px-4 font-medium">{tr('Akcje')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeBudgetItems.map((it) => {
                      const planned = Number(it.planned_amount || 0);
                      const real = calculateIncomeRealization(it.category);
                      const pct = planned > 0 ? Math.round((real / planned) * 100) : 0;
                      return (
                        <tr key={it.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                          <td className="py-4 px-4 font-bold text-gray-900 dark:text-white">{it.category}</td>
                          <td className="py-4 px-4 text-gray-600 dark:text-gray-400">{it.description}</td>
                          <td className="py-4 px-4 text-right text-gray-900 dark:text-white font-medium">
                            <span className="inline-flex items-center gap-1.5 justify-end">
                              {planned.toLocaleString('pl-PL')} zł
                              {itemChanges(it.id).length > 0 && (
                                <button onClick={() => setChangeItem(itemChanges(it.id))} title={tr('Kwota zmieniona — pokaż historię')} className="text-amber-500 hover:text-amber-600"><Clock size={13} /></button>
                              )}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right text-emerald-600 font-medium">{real.toLocaleString('pl-PL')} zł</td>
                          <td className="py-4 px-4 text-center text-gray-900 dark:text-white">{pct}%</td>
                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            <button onClick={() => { setBudgetForm({ ...it, planned_amount: String(it.planned_amount) }); setShowBudgetModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title={tr('Edytuj')}><Edit2 size={16} /></button>
                            <button onClick={() => deleteBudgetItem(it.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title={tr('Usuń')}><Trash2 size={16} /></button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-emerald-50/60 dark:bg-emerald-900/10 border-t-2 border-emerald-200 dark:border-emerald-900/40 font-bold">
                      <td className="py-3 px-4 text-gray-900 dark:text-white" colSpan={2}>{tr('Suma przychodów')}</td>
                      <td className="py-3 px-4 text-right text-gray-900 dark:text-white">{totalPlannedIncome.toLocaleString('pl-PL')} zł</td>
                      <td className="py-3 px-4 text-right text-emerald-600">{incomeBudgetItems.reduce((s, it) => s + calculateIncomeRealization(it.category), 0).toLocaleString('pl-PL')} zł</td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alert przekroczenia budżetu */}
          {(() => {
            const over = expenseBudgetItems.filter((it) => calculateRealization(it.category, it.description) > Number(it.planned_amount || 0));
            if (over.length === 0) return null;
            return (
              <div className="mb-5 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-red-900/10 p-4">
                <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300 mb-1"><AlertTriangle size={18} /> {tr('Przekroczony budżet')} ({over.length})</div>
                <ul className="text-sm text-red-700/90 dark:text-red-300/90 list-disc pl-6">
                  {over.slice(0, 6).map((it) => (
                    <li key={it.id}>{it.category} — {it.description}: {tr('plan')} {Number(it.planned_amount).toLocaleString('pl-PL')} zł, {tr('wydano')} {calculateRealization(it.category, it.description).toLocaleString('pl-PL')} zł</li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {loading ? (
            <Spinner center />
          ) : budgetItems.length === 0 ? (
            <EmptyState title={`Brak pozycji budżetowych na rok ${selectedYear}`} />
          ) : expenseBudgetItems.length === 0 ? null : (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/10 text-sm font-bold text-red-700 dark:text-red-300 flex items-center gap-2"><ArrowDownRight size={16} /> {tr('Planowane wydatki')}</div>
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Służba')}</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Opis kosztu')}</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Plan (PLN)</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Realizacja (PLN)</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">% Realizacji</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Pozostało')}</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Akcje')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group items by category
                    const groupedItems = expenseBudgetItems.reduce((acc, item) => {
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
                        const planned = Number(item.planned_amount || 0);
                        const realization = calculateRealization(item.category, item.description);
                        const percentage = planned > 0 ? (realization / planned) * 100 : 0;
                        const remaining = planned - realization;

                        categoryTotalPlanned += planned;
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
                              <span className="inline-flex items-center gap-1.5 justify-end">
                                {Number(item.planned_amount || 0).toLocaleString('pl-PL')} zł
                                {itemChanges(item.id).length > 0 && (
                                  <button onClick={() => setChangeItem(itemChanges(item.id))} title={tr('Kwota zmieniona — pokaż historię')} className="text-amber-500 hover:text-amber-600">
                                    <Clock size={13} />
                                  </button>
                                )}
                              </span>
                            </td>
                            <td
                              className="py-4 px-4 text-right text-gray-900 dark:text-white font-medium cursor-pointer hover:text-accent-primary dark:hover:text-accent-primary-light transition"
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
                                  title={tr('Edytuj')}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => deleteBudgetItem(item.id)}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                  title={tr('Usuń')}
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
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{tr('Data')}</span>
                                            <span className="text-gray-900 dark:text-white">
                                              {new Date(expense.payment_date).toLocaleDateString('pl-PL')}
                                            </span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Kontrahent')}</span>
                                            <span className="text-gray-900 dark:text-white">{expense.contractor}</span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Kwota')}</span>
                                            <span className="font-bold text-gray-900 dark:text-white">
                                              {expense.amount.toLocaleString('pl-PL')} zł
                                            </span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Szczegółowy opis')}</span>
                                            <span className="text-gray-900 dark:text-white text-xs">{expense.detailed_description || '-'}</span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Odpowiedzialny')}</span>
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
                                    {tr('Brak wydatków w tej pozycji budżetu')}
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
                        <tr key={`subtotal-${category}`} className="bg-accent-primary-lighter dark:bg-accent-primary-darkest/40 border-b-2 border-accent-primary-light dark:border-accent-primary font-bold">
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
                      <tr key="grand-total" className="bg-gradient-to-r from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/60 dark:to-accent-secondary-darkest/60 border-t-4 border-accent-primary-light dark:border-accent-primary-light font-bold text-lg">
                        <td className="py-4 px-4 text-gray-900 dark:text-white" colSpan={2}>
                          {tr('SUMA CAŁKOWITA')}
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
            </div>
          )}

          {/* Propozycje budżetu od służb */}
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><FileText size={18} /> {tr('Propozycje do budżetu')}</h3>
            </div>
            {proposals.filter((p) => p.status === 'pending').length === 0 ? (
              <p className="text-sm text-gray-400">{tr('Brak oczekujących propozycji. Liderzy służb zgłaszają je z zakładki Finanse w swoim module.')}</p>
            ) : (
              <div className="space-y-2">
                {proposals.filter((p) => p.status === 'pending').map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${p.kind === 'income' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>{p.kind === 'income' ? tr('Przychód') : tr('Wydatek')}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">{p.team_type} — {p.description} <span className="text-xs font-normal text-gray-400">({tr('budżet')} {p.year})</span></div>
                      <div className="text-xs text-gray-400 truncate">{p.note ? `${p.note} · ` : ''}{tr('zgłosił')}: {p.submitted_by || '—'}</div>
                    </div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 shrink-0">{Number(p.amount).toLocaleString('pl-PL')} zł</div>
                    <button onClick={() => approveProposal(p)} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg shrink-0" title={tr('Zatwierdź do budżetu')}><CheckCircle size={16} /></button>
                    <button onClick={() => rejectProposal(p.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0" title={tr('Odrzuć')}><XCircle size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'income' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Wpływy {selectedYear}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToCsv(`wplywy-${selectedYear}.csv`, filteredIncomeTransactions, [
                  { label: 'Data', value: 'date' }, { label: 'Typ', value: 'type' }, { label: 'Źródło', value: 'source' },
                  { label: 'Kwota', value: 'amount' }, { label: 'Notatka', value: 'notes' },
                  { label: 'Tagi', value: (r) => (r.tags || []).join(', ') },
                ])}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Eksport CSV')}
              >
                <Download size={16} /> CSV
              </button>
              <button
                data-tour="fin-income-add"
                onClick={() => setShowIncomeModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
              >
                <Plus size={18} />
                {tr('Dodaj wpływ')}
              </button>
            </div>
          </div>

          {/* Filtry wpływów */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase">{t('Filtry')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <CustomSelect
                label="Typ"
                value={incomeFilters.type}
                onChange={(val) => setIncomeFilters({...incomeFilters, type: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  { value: 'Kolekta', label: 'Kolekta' },
                  { value: 'Darowizny', label: 'Darowizny' },
                  { value: 'Inne', label: tr('Inne') }
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label={tr('Źródło')}
                value={incomeFilters.source}
                onChange={(val) => setIncomeFilters({...incomeFilters, source: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...uniqueIncomeSources.map(s => ({ value: s, label: s }))
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label="Tag"
                value={incomeFilters.tag}
                onChange={(val) => setIncomeFilters({...incomeFilters, tag: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...uniqueIncomeTags.map(t => ({ value: t, label: t }))
                ]}
                placeholder={t('Wszystkie')}
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
                className="mt-3 text-sm text-accent-primary dark:text-accent-primary-light hover:underline"
              >
                {tr('Wyczyść filtry')}
              </button>
            )}
          </div>

          {loading ? (
            <Spinner center />
          ) : filteredIncomeTransactions.length === 0 ? (
            <EmptyState title={incomeTransactions.length === 0 ? `Brak wpływów na rok ${selectedYear}` : tr('Brak wpływów pasujących do filtrów')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{tr('Data')}</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Typ</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Źródło')}</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Kwota')}</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Notatka')}</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Tagi')}</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Akcje')}</th>
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
                                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 font-medium"
                                style={{ background: `${tagColor(tag)}22`, color: tagColor(tag) }}
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
                            title={tr('Edytuj')}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteIncome(transaction.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                            title={tr('Usuń')}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToCsv(`wydatki-${selectedYear}.csv`, filteredExpenseTransactions, [
                  { label: 'Data', value: 'payment_date' }, { label: 'Kategoria', value: 'category' },
                  { label: 'Kategoria kosztu', value: 'cost_category' }, { label: 'Opis', value: 'description' },
                  { label: 'Kontrahent', value: 'contractor' }, { label: 'Kwota', value: 'amount' },
                  { label: 'Status', value: 'status' }, { label: 'Nr faktury', value: 'invoice_number' },
                  { label: 'Termin', value: 'due_date' }, { label: 'Opłacone', value: (r) => (r.is_paid === false ? 'nie' : 'tak') },
                  { label: 'Odpowiedzialny', value: 'responsible_person' },
                  { label: 'Tagi', value: (r) => (r.tags || []).join(', ') },
                ])}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Eksport CSV')}
              >
                <Download size={16} /> CSV
              </button>
              <button
                onClick={() => setShowExpenseModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
              >
                <Plus size={18} />
                Dodaj wydatek
              </button>
            </div>
          </div>

          {/* Filtry wydatków */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase">{t('Filtry')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              <CustomSelect
                label="Kategoria"
                value={expenseFilters.category}
                onChange={(val) => setExpenseFilters({...expenseFilters, category: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...budgetCategories
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label={tr('Kategoria kosztu')}
                value={expenseFilters.cost_category}
                onChange={(val) => setExpenseFilters({...expenseFilters, cost_category: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...expenseCategories.map((c) => ({ value: c.name, label: c.name })),
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label="Kontrahent"
                value={expenseFilters.contractor}
                onChange={(val) => setExpenseFilters({...expenseFilters, contractor: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...uniqueExpenseContractors.map(c => ({ value: c, label: c }))
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label="Osoba odpowiedzialna"
                value={expenseFilters.responsible}
                onChange={(val) => setExpenseFilters({...expenseFilters, responsible: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...uniqueExpenseResponsible.map(r => ({ value: r, label: r }))
                ]}
                placeholder={t('Wszystkie')}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <CustomSelect
                label="Tag"
                value={expenseFilters.tag}
                onChange={(val) => setExpenseFilters({...expenseFilters, tag: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...uniqueExpenseTags.map(t => ({ value: t, label: t }))
                ]}
                placeholder={t('Wszystkie')}
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
            {(expenseFilters.category || expenseFilters.cost_category || expenseFilters.contractor || expenseFilters.responsible || expenseFilters.tag || expenseFilters.dateFrom || expenseFilters.dateTo) && (
              <button
                onClick={() => setExpenseFilters({ category: '', cost_category: '', contractor: '', responsible: '', tag: '', dateFrom: '', dateTo: '' })}
                className="mt-3 text-sm text-accent-primary dark:text-accent-primary-light hover:underline"
              >
                {tr('Wyczyść filtry')}
              </button>
            )}
          </div>

          {loading ? (
            <Spinner center />
          ) : filteredExpenseTransactions.length === 0 ? (
            <EmptyState title={expenseTransactions.length === 0 ? `Brak wydatków na rok ${selectedYear}` : tr('Brak wydatków pasujących do filtrów')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{tr('Data')}</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{tr('Kategoria')}</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{tr('Opis')}</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Kontrahent')}</th>
                    <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Kwota')}</th>
                    <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Odpowiedzialny')}</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Załączniki')}</th>
                    <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Akcje')}</th>
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
                        <div className="flex flex-col items-start gap-1">
                          <span className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">
                            {transaction.category}
                          </span>
                          {transaction.cost_category && (() => {
                            const cc = expenseCategories.find((c) => c.name === transaction.cost_category);
                            const col = cc?.color || '#6366f1';
                            return (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: `${col}22`, color: col }}>
                                {transaction.cost_category}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-gray-900 dark:text-white text-sm">
                        {transaction.description || '-'}
                      </td>
                      <td className="py-4 px-4 text-gray-600 dark:text-gray-400 text-sm">
                        {transaction.contractor}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="text-gray-900 dark:text-white font-bold">{transaction.amount.toLocaleString('pl-PL')} zł</div>
                        <div className="flex flex-col items-end gap-1 mt-1">
                          {transaction.status && transaction.status !== 'approved' && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(EXPENSE_STATUS[transaction.status] || EXPENSE_STATUS.approved).cls}`}>
                              {tr((EXPENSE_STATUS[transaction.status] || {}).label || transaction.status)}
                            </span>
                          )}
                          {transaction.is_paid === false && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                              {tr('Do zapłaty')}{transaction.due_date ? ` · ${transaction.due_date}` : ''}
                            </span>
                          )}
                          {transaction.invoice_number && (
                            <span className="text-[10px] text-gray-400">FV {transaction.invoice_number}</span>
                          )}
                        </div>
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
                        <div className="flex justify-center gap-1 flex-wrap">
                          {transaction.status === 'submitted' && (
                            <>
                              <button onClick={() => setExpenseStatus(transaction.id, 'approved')} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition" title={tr('Zatwierdź')}><CheckCircle size={16} /></button>
                              <button onClick={() => setExpenseStatus(transaction.id, 'rejected')} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title={tr('Odrzuć')}><XCircle size={16} /></button>
                            </>
                          )}
                          {transaction.status === 'draft' && (
                            <button onClick={() => setExpenseStatus(transaction.id, 'submitted')} className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition" title={tr('Wyślij do akceptacji')}><Clock size={16} /></button>
                          )}
                          {transaction.is_paid === false && (transaction.status === 'approved' || transaction.status === 'paid') && (
                            <button onClick={() => setExpenseStatus(transaction.id, 'paid')} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition" title={tr('Oznacz jako opłacone')}><Banknote size={16} /></button>
                          )}
                          <button
                            onClick={() => {
                              setExpenseForm(transaction);
                              setShowExpenseModal(true);
                            }}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                            title={tr('Edytuj')}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteExpense(transaction.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                            title={tr('Usuń')}
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

      {/* RECURRING TAB */}
      {activeTab === 'recurring' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{tr('Transakcje cykliczne')}</h2>
            <button
              onClick={() => { setRecurringForm(emptyRecurring); setShowRecurringModal(true); }}
              className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
            >
              <Plus size={18} /> {tr('Nowy plan')}
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{tr('Automatycznie generowane wpływy i wydatki (np. czynsz, pensje, stałe kolekty). Codziennie rano system tworzy należne pozycje.')}</p>

          {recurringItems.length === 0 ? (
            <EmptyState icon={Repeat} title={tr('Brak planów cyklicznych')} description={tr('Dodaj pierwszy plan, aby automatyzować powtarzalne transakcje.')} />
          ) : (
            <div className="space-y-2">
              {recurringItems.map((r) => {
                const FREQ = { weekly: tr('co tydzień'), biweekly: tr('co 2 tygodnie'), monthly: tr('co miesiąc'), quarterly: tr('co kwartał'), yearly: tr('co rok') };
                return (
                  <div key={r.id} className={`flex items-center gap-3 p-4 rounded-2xl border ${r.is_active ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.kind === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                      {r.kind === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{r.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {FREQ[r.frequency] || r.frequency}
                        {r.category ? ` · ${r.category}` : ''}
                        {r.next_run_date ? ` · ${tr('następna')}: ${r.next_run_date}` : ''}
                      </div>
                    </div>
                    <div className={`font-bold shrink-0 ${r.kind === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {r.kind === 'income' ? '+' : '−'}{Number(r.amount).toLocaleString('pl-PL')} zł
                    </div>
                    <button onClick={() => toggleRecurring(r)} className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shrink-0">
                      {r.is_active ? tr('Wstrzymaj') : tr('Wznów')}
                    </button>
                    <button onClick={() => { setRecurringForm({ ...emptyRecurring, ...r, amount: String(r.amount), day_of_month: r.day_of_month || '', next_run_date: r.next_run_date || '', end_date: r.end_date || '' }); setShowRecurringModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg shrink-0" title={tr('Edytuj')}><Edit2 size={16} /></button>
                    <button onClick={() => deleteRecurring(r.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0" title={tr('Usuń')}><Trash2 size={16} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* REPORTS TAB */}
      {activeTab === 'reports' && (
        <section className="space-y-6">
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowReportEmailModal(true)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm" title={tr('Wyślij raport mailem')}>
              <FileText size={16} /> {tr('Wyślij raport')}
            </button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm" title={tr('Drukuj / zapisz PDF')}>
              <Printer size={16} /> {tr('Drukuj / PDF')}
            </button>
          </div>
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
                <div className="bg-gradient-to-r from-accent-primary to-accent-secondary p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-accent-primary-lighter text-sm font-medium mb-1">Aktualny stan finansów • {selectedYear}</p>
                      <p className="text-4xl font-bold">{totalPln.toLocaleString('pl-PL')} zł</p>
                    </div>
                    <button
                      onClick={openBalanceModal}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition"
                      title={t('Edytuj stany początkowe')}
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
                        <span className="text-xs font-medium uppercase">{t('Gotówka')}</span>
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
                        <span className="text-xs font-medium uppercase">{t('Budżet')}</span>
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
                            <p className="text-xs text-amber-600 dark:text-amber-400">{t('Rachunek')}</p>
                            <p className="font-bold text-gray-900 dark:text-white">{accountBalances.bank_currency.toLocaleString('pl-PL')} {accountBalances.currency_type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                          <Banknote size={18} className="text-cyan-600 dark:text-cyan-400" />
                          <div>
                            <p className="text-xs text-cyan-600 dark:text-cyan-400">{t('Gotówka')}</p>
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
              <BarChart3 size={20} className="text-accent-primary" />
              {tr('Wpływy vs Wydatki - miesięcznie')}
            </h3>
            <div className="space-y-3">
              {(() => {
                const months = [tr('Sty'), tr('Lut'), tr('Mar'), tr('Kwi'), tr('Maj'), tr('Cze'), tr('Lip'), tr('Sie'), tr('Wrz'), tr('Paź'), tr('Lis'), tr('Gru')];
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
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('Wpływy')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('Wydatki')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cash-flow: skumulowany bilans w czasie */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-accent-primary" />
              {tr('Przepływ gotówki (skumulowany)')}
            </h3>
            {(() => {
              const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
              let run = 0;
              const pts = months.map((m, idx) => {
                const mn = String(idx + 1).padStart(2, '0');
                const s = `${selectedYear}-${mn}-01`, e = `${selectedYear}-${mn}-31`;
                const inc = incomeTransactions.filter(t => t.date >= s && t.date <= e).reduce((a, t) => a + (t.amount || 0), 0);
                const exp = expenseTransactions.filter(t => t.payment_date >= s && t.payment_date <= e).reduce((a, t) => a + (t.amount || 0), 0);
                run += inc - exp;
                return { m, val: run };
              });
              const vals = pts.map(p => p.val);
              const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
              const range = (max - min) || 1;
              const W = 640, H = 160, pad = 10;
              const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
              const y = (v) => H - pad - ((v - min) / range) * (H - 2 * pad);
              const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.val).toFixed(1)}`).join(' ');
              const last = vals[vals.length - 1];
              return (
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full min-w-[520px]" style={{ height: H }}>
                    <line x1={pad} y1={y(0)} x2={W - pad} y2={y(0)} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="1" />
                    <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2.5" />
                    {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.val)} r="3" fill="#6366f1" />)}
                  </svg>
                  <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                    {pts.map((p, i) => <span key={i}>{tr(p.m)}</span>)}
                  </div>
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {tr('Bilans na koniec roku')}: <span className={`font-bold ${last >= 0 ? 'text-green-600' : 'text-red-600'}`}>{last.toLocaleString('pl-PL')} zł</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Two columns: Categories & Top Contractors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expenses by Category */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <PieChart size={20} className="text-accent-primary" />
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
                  'from-accent-primary-light to-rose-500',
                  'from-blue-500 to-indigo-500',
                  'from-green-500 to-emerald-500',
                  'from-accent-primary to-accent-secondary-light',
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
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('Brak danych o wydatkach')}</p>
                );
              })()}
            </div>

            {/* Top Contractors */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Building2 size={20} className="text-accent-primary" />
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
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center text-white text-sm font-bold">
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
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('Brak danych o kontrahentach')}</p>
                );
              })()}
            </div>
          </div>

          {/* Budget Execution Table */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <DollarSign size={20} className="text-accent-primary" />
              {tr('Realizacja budżetu wg służb')}
            </h3>
            {budgetItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">{t('Służba')}</th>
                      <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">{t('Planowany')}</th>
                      <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">{t('Zrealizowany')}</th>
                      <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">{t('Realizacja')}</th>
                      <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium text-sm">{t('Pozostało')}</th>
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
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('Brak pozycji budżetowych')}</p>
            )}
          </div>

          {/* Income by Type */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users size={20} className="text-accent-primary" />
              {tr('Wpływy wg typu')}
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
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('Brak danych o wpływach')}</p>
              );
            })()}
          </div>
          {/* Wydatki wg kategorii kosztu (własnej) */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><PieChart size={20} className="text-accent-primary" /> {tr('Wydatki wg kategorii kosztu')}</h3>
            {(() => {
              const totals = expenseTransactions.reduce((acc, t) => { const k = t.cost_category || tr('Bez kategorii'); acc[k] = (acc[k] || 0) + Number(t.amount || 0); return acc; }, {});
              const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
              const total = sorted.reduce((s, [, v]) => s + v, 0);
              if (sorted.length === 0) return <p className="text-center text-gray-400 py-6">{tr('Brak wydatków')}</p>;
              return (
                <div className="space-y-2">
                  {sorted.map(([k, v]) => {
                    const pct = total > 0 ? (v / total) * 100 : 0;
                    const col = expenseCategories.find((c) => c.name === k)?.color || '#6366f1';
                    return (
                      <div key={k}>
                        <div className="flex justify-between text-sm mb-1"><span className="text-gray-700 dark:text-gray-300">{k}</span><span className="font-semibold text-gray-900 dark:text-white">{v.toLocaleString('pl-PL')} zł · {pct.toFixed(0)}%</span></div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: col }} /></div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Porównanie rok do roku */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-accent-primary" /> {tr('Porównanie rok do roku')} ({selectedYear - 1} → {selectedYear})</h3>
            {(() => {
              const inNow = incomeTransactions.reduce((s, t) => s + Number(t.amount || 0), 0);
              const exNow = expenseTransactions.reduce((s, t) => s + Number(t.amount || 0), 0);
              const chg = (now, prev) => prev > 0 ? ((now - prev) / prev) * 100 : (now > 0 ? 100 : 0);
              const Row = ({ label, now, prev, good }) => {
                const c = chg(now, prev); const up = c >= 0;
                return (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-400">{prev.toLocaleString('pl-PL')} → </span>
                      <span className="font-bold text-gray-900 dark:text-white">{now.toLocaleString('pl-PL')} zł</span>
                      <span className={`text-xs font-semibold ${((up && good) || (!up && !good)) ? 'text-green-600' : 'text-red-600'}`}>{up ? '▲' : '▼'} {Math.abs(c).toFixed(0)}%</span>
                    </div>
                  </div>
                );
              };
              return (<div>
                <Row label={tr('Przychody')} now={inNow} prev={prevYearTotals.income} good />
                <Row label={tr('Wydatki')} now={exNow} prev={prevYearTotals.expense} good={false} />
                <Row label={tr('Bilans')} now={inNow - exNow} prev={prevYearTotals.income - prevYearTotals.expense} good />
              </div>);
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
      {showCategoryModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setShowCategoryModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-gray-200 dark:border-gray-700 max-h-[85vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-5">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{tr('Kategorie finansów')}</h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-500 dark:text-gray-400"><X size={24} /></button>
            </div>

            {/* Dodawanie nowej kategorii */}
            <div className="flex flex-wrap items-end gap-2 mb-5 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Nazwa')}</label>
                <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveCategory(); }}
                  placeholder={tr('np. Sprzęt, Kolekta')} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Rodzaj')}</label>
                <select value={catForm.kind} onChange={(e) => setCatForm({ ...catForm, kind: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                  <option value="expense">{tr('Wydatek')}</option>
                  <option value="income">{tr('Wpływ')}</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kolor')}</label>
                <input type="color" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                  className="w-10 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent cursor-pointer p-0.5" />
              </div>
              <button onClick={saveCategory} className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm font-medium shrink-0">{tr('Dodaj')}</button>
            </div>

            {/* Listy kategorii */}
            {['income', 'expense'].map((kind) => (
              <div key={kind} className="mb-4">
                <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{kind === 'income' ? tr('Kategorie wpływów') : tr('Kategorie wydatków')}</div>
                <div className="space-y-1.5">
                  {categories.filter((c) => c.kind === kind).length === 0 && (
                    <div className="text-sm text-gray-400 py-1">{tr('Brak kategorii')}</div>
                  )}
                  {categories.filter((c) => c.kind === kind).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: c.color || '#6366f1' }} />
                      <span className={`text-sm flex-1 ${c.is_active === false ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>{c.name}</span>
                      <button onClick={() => toggleCategoryActive(c)} className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                        {c.is_active === false ? tr('Włącz') : tr('Wyłącz')}
                      </button>
                      <button onClick={() => deleteCategory(c.id)} className="text-red-500 hover:text-red-600 p-1" title={tr('Usuń')}><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Kontrahenci */}
            <div className="mt-2 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{tr('Kontrahenci')}</div>
              <div className="flex gap-2 mb-2">
                <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && vendorName.trim()) { addVendor(vendorName); setVendorName(''); } }}
                  placeholder={tr('np. Sklep muzyczny')} className="flex-1 min-w-0 text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-2 py-1.5 outline-none text-gray-800 dark:text-gray-100" />
                <button onClick={() => { if (vendorName.trim()) { addVendor(vendorName); setVendorName(''); } }} className="px-3 rounded-lg bg-accent-primary text-white text-sm shrink-0">{tr('Dodaj')}</button>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                {vendors.length === 0 && <div className="text-sm text-gray-400">{tr('Brak kontrahentów (dodają się też automatycznie z wydatków).')}</div>}
                {vendors.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                    <span className="text-sm flex-1 truncate text-gray-800 dark:text-gray-100">{v.name}</span>
                    <button onClick={() => deleteVendor(v.id)} className="text-red-500 hover:text-red-600 p-1" title={tr('Usuń')}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showRecurringModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setShowRecurringModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700 max-h-[88vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-5">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{recurringForm.id ? tr('Edytuj plan cykliczny') : tr('Nowy plan cykliczny')}</h3>
              <button onClick={() => setShowRecurringModal(false)} className="text-gray-500 dark:text-gray-400"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {['expense', 'income'].map((k) => (
                  <button key={k} onClick={() => setRecurringForm({ ...recurringForm, kind: k, category: '' })}
                    className={`py-2 rounded-xl text-sm font-medium border transition ${recurringForm.kind === k ? 'border-accent-primary ring-1 ring-accent-primary bg-accent-primary/5 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300'}`}>
                    {k === 'expense' ? tr('Wydatek') : tr('Wpływ')}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Nazwa')}</label>
                <input value={recurringForm.title} onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })}
                  placeholder={tr('np. Czynsz, Pensja, Stała kolekta')} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (PLN)')}</label>
                  <input type="number" value={recurringForm.amount} onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <CustomSelect
                  label={tr('Częstotliwość')}
                  value={recurringForm.frequency}
                  onChange={(val) => setRecurringForm({ ...recurringForm, frequency: val })}
                  options={[
                    { value: 'weekly', label: tr('co tydzień') }, { value: 'biweekly', label: tr('co 2 tygodnie') },
                    { value: 'monthly', label: tr('co miesiąc') }, { value: 'quarterly', label: tr('co kwartał') },
                    { value: 'yearly', label: tr('co rok') },
                  ]}
                />
              </div>
              <CustomSelect
                label={recurringForm.kind === 'income' ? tr('Typ wpływu') : tr('Służba (budżet)')}
                value={recurringForm.category}
                onChange={(val) => setRecurringForm({ ...recurringForm, category: val, team_type: recurringForm.kind === 'expense' ? val : recurringForm.team_type })}
                options={[{ value: '', label: tr('— brak —') },
                  ...(recurringForm.kind === 'income'
                    ? incomeCategories.map((c) => ({ value: c.name, label: c.name }))
                    : (serviceOptions.length ? serviceOptions : []))]}
                placeholder={tr('Wybierz')}
              />
              {recurringForm.kind === 'expense' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kontrahent')}</label>
                  <input value={recurringForm.contractor} onChange={(e) => setRecurringForm({ ...recurringForm, contractor: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Następne wykonanie')}</label>
                  <input type="date" value={recurringForm.next_run_date} onChange={(e) => setRecurringForm({ ...recurringForm, next_run_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Koniec (opcjonalnie)')}</label>
                  <input type="date" value={recurringForm.end_date} onChange={(e) => setRecurringForm({ ...recurringForm, end_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowRecurringModal(false)} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition">{tr('Anuluj')}</button>
                <button onClick={saveRecurring} className="flex-1 px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium">{tr('Zapisz')}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showProposalModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setShowProposalModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700 max-h-[88vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-5">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{tr('Propozycja do budżetu')} {selectedYear}</h3>
              <button onClick={() => setShowProposalModal(false)} className="text-gray-500 dark:text-gray-400"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[{ k: 'expense', l: tr('Wydatek') }, { k: 'income', l: tr('Przychód') }].map(({ k, l }) => (
                  <button key={k} type="button" onClick={() => setProposalForm({ ...proposalForm, kind: k })}
                    className={`py-2 rounded-xl text-sm font-medium border transition ${proposalForm.kind === k ? 'border-accent-primary ring-1 ring-accent-primary bg-accent-primary/5 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <CustomSelect
                label={tr('Służba')}
                value={proposalForm.team_type}
                onChange={(val) => setProposalForm({ ...proposalForm, team_type: val })}
                options={serviceOptions.length ? serviceOptions : []}
                placeholder={tr('Wybierz służbę')}
              />
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Opis')}</label>
                <input value={proposalForm.description} onChange={(e) => setProposalForm({ ...proposalForm, description: e.target.value })}
                  placeholder={tr('np. Nowy mikrofon, wyjazd')} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (PLN)')}</label>
                <input type="number" value={proposalForm.amount} onChange={(e) => setProposalForm({ ...proposalForm, amount: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Uzasadnienie (opcjonalnie)')}</label>
                <textarea rows={2} value={proposalForm.note} onChange={(e) => setProposalForm({ ...proposalForm, note: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowProposalModal(false)} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition">{tr('Anuluj')}</button>
                <button onClick={saveProposal} className="flex-1 px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium">{tr('Zgłoś')}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showReportEmailModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setShowReportEmailModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{tr('Wyślij raport')} {selectedYear}</h3>
              <button onClick={() => setShowReportEmailModal(false)} className="text-gray-500 dark:text-gray-400"><X size={24} /></button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{tr('Podsumowanie roku (przychody, wydatki, bilans, budżet, kategorie) trafi na wskazane adresy — z załącznikiem CSV.')}</p>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Adresy e-mail')}</label>
            <textarea
              rows={3}
              value={reportRecipients}
              onChange={(e) => setReportRecipients(e.target.value)}
              placeholder={tr('jan@parafia.pl, skarbnik@parafia.pl (oddziel przecinkiem lub enterem)')}
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
            />
            <div className="flex gap-3 pt-4">
              <button onClick={() => setShowReportEmailModal(false)} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition">{tr('Anuluj')}</button>
              <button onClick={sendReportEmail} disabled={sendingReport} className="flex-1 px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium disabled:opacity-60">{sendingReport ? tr('Wysyłanie…') : tr('Wyślij')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {changeItem && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[110]" onClick={() => setChangeItem(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700 max-h-[80vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2"><Clock size={18} /> {tr('Historia zmian kwoty')}</h3>
              <button onClick={() => setChangeItem(null)} className="text-gray-500 dark:text-gray-400"><X size={22} /></button>
            </div>
            <div className="space-y-2">
              {changeItem.map((a) => (
                <div key={a.id} className="px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700 text-sm">
                  <div className="font-medium text-gray-800 dark:text-gray-100">
                    {Number(a.before?.planned_amount || 0).toLocaleString('pl-PL')} zł <span className="text-gray-400">→</span> {Number(a.after?.planned_amount || 0).toLocaleString('pl-PL')} zł
                  </div>
                  <div className="text-xs text-gray-400">{a.actor || '—'} · {new Date(a.created_at).toLocaleString('pl-PL')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBudgetHistory && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setShowBudgetHistory(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-gray-200 dark:border-gray-700 max-h-[85vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-5">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{tr('Historia budżetu')} {selectedYear}</h3>
              <button onClick={() => setShowBudgetHistory(false)} className="text-gray-500 dark:text-gray-400"><X size={24} /></button>
            </div>

            <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{tr('Zapisane wersje')}</div>
            {budgetVersions.length === 0 ? (
              <div className="text-sm text-gray-400 mb-4">{tr('Brak zapisanych wersji. Użyj „Zapisz wersję”, aby zrobić migawkę.')}</div>
            ) : (
              <div className="space-y-1.5 mb-5">
                {budgetVersions.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700 text-sm">
                    <Copy size={14} className="text-gray-400 shrink-0" />
                    <span className="font-medium text-gray-800 dark:text-gray-100 flex-1 truncate">{v.label}</span>
                    <span className="text-xs text-gray-400">{Array.isArray(v.snapshot) ? v.snapshot.length : 0} {tr('poz.')} · {new Date(v.created_at).toLocaleDateString('pl-PL')}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{tr('Ostatnie zmiany')}</div>
            {budgetAudit.length === 0 ? (
              <div className="text-sm text-gray-400">{tr('Brak zapisanych zmian.')}</div>
            ) : (
              <div className="space-y-1.5">
                {budgetAudit.map((a) => {
                  const AL = { created: tr('Dodano'), updated: tr('Zmieniono'), deleted: tr('Usunięto') };
                  const beforeAmt = a.before?.planned_amount, afterAmt = a.after?.planned_amount;
                  return (
                    <div key={a.id} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${a.action === 'deleted' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : a.action === 'created' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{AL[a.action] || a.action}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-800 dark:text-gray-100 truncate">{a.category}{a.description ? ` — ${a.description}` : ''}</div>
                        <div className="text-xs text-gray-400">
                          {a.action === 'updated' && beforeAmt != null && afterAmt != null && beforeAmt !== afterAmt
                            ? `${Number(beforeAmt).toLocaleString('pl-PL')} → ${Number(afterAmt).toLocaleString('pl-PL')} zł · `
                            : (afterAmt != null ? `${Number(afterAmt).toLocaleString('pl-PL')} zł · ` : '')}
                          {a.actor || '—'} · {new Date(a.created_at).toLocaleString('pl-PL')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {showBudgetModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{t('Nowa pozycja budżetowa')}</h3>
              <button onClick={() => setShowBudgetModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[{ k: 'expense', l: tr('Wydatek') }, { k: 'income', l: tr('Przychód') }].map(({ k, l }) => (
                  <button key={k} type="button" onClick={() => setBudgetForm({ ...budgetForm, kind: k })}
                    className={`py-2 rounded-xl text-sm font-medium border transition ${(budgetForm.kind || 'expense') === k ? 'border-accent-primary ring-1 ring-accent-primary bg-accent-primary/5 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {(budgetForm.kind || 'expense') === 'income' ? (
                <CustomSelect
                  label={tr('Kategoria wpływu')}
                  value={budgetForm.category}
                  onChange={(val) => setBudgetForm({ ...budgetForm, category: val })}
                  options={incomeCategories.length > 0
                    ? incomeCategories.map((c) => ({ value: c.name, label: c.name }))
                    : [{ value: 'Kolekta', label: 'Kolekta' }, { value: 'Darowizny', label: 'Darowizny' }, { value: 'Inne', label: tr('Inne') }]}
                  placeholder={tr('Wybierz kategorię')}
                />
              ) : (
                <CustomSelect
                  label={tr('Kategoria (Służba)')}
                  value={budgetForm.category}
                  onChange={(val) => setBudgetForm({...budgetForm, category: val})}
                  options={serviceOptions.length > 0 ? serviceOptions : [
                    // Fallback (gdyby app_modules się nie wczytało). WARTOŚĆ = team_type modułu.
                    { value: 'Grupa Uwielbienia', label: tr('Grupa Uwielbienia') },
                    { value: 'MediaTeam', label: tr('MediaTeam') },
                    { value: 'AtmosferaTeam', label: 'AtmosferaTeam' },
                    { value: 'Grupy domowe', label: tr('Grupy domowe') },
                    { value: 'małe Avenit', label: tr('małe Avenit') },
                    { value: 'Mlodziezowka', label: tr('Młodzieżówka') }
                  ]}
                  placeholder={t('Wybierz służbę')}
                />
              )}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Opis')}</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={3}
                  value={budgetForm.description}
                  onChange={(e) => setBudgetForm({...budgetForm, description: e.target.value})}
                  placeholder={t('Opis kosztów')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <CustomSelect
                  label={tr('Okres')}
                  value={budgetForm.period_type || 'year'}
                  onChange={(val) => setBudgetForm({ ...budgetForm, period_type: val })}
                  options={[
                    { value: 'year', label: tr('Roczny') },
                    { value: 'quarter', label: tr('Kwartalny') },
                    { value: 'month', label: tr('Miesięczny') },
                  ]}
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

      {/* MODAL: Income */}
      {showIncomeModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{t('Nowy wpływ')}</h3>
              <button onClick={() => setShowIncomeModal(false)} className="text-gray-500 dark:text-gray-400">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <CustomDatePicker
                label={tr('Data wpływu')}
                value={incomeForm.date}
                onChange={(val) => setIncomeForm({...incomeForm, date: val})}
              />
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (PLN)')}</label>
                <input
                  data-tour="fin-income-amount"
                  type="number"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({...incomeForm, amount: e.target.value})}
                  placeholder="0.00"
                />
              </div>
              <CustomSelect
                label={tr('Typ wpływu')}
                value={incomeForm.type}
                onChange={(val) => setIncomeForm({...incomeForm, type: val})}
                options={incomeCategories.length > 0
                  ? incomeCategories.map((c) => ({ value: c.name, label: c.name }))
                  : [
                    { value: 'Kolekta', label: 'Kolekta' },
                    { value: 'Darowizny', label: 'Darowizny' },
                    { value: 'Inne', label: tr('Inne') },
                  ]}
              />
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Źródło')}</label>
                <input
                  data-tour="fin-income-source"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={incomeForm.source}
                  onChange={(e) => setIncomeForm({...incomeForm, source: e.target.value})}
                  placeholder={t('np. Kolekta niedzielna')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Notatka')}</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={incomeForm.notes}
                  onChange={(e) => setIncomeForm({...incomeForm, notes: e.target.value})}
                  placeholder={t('Dodatkowe informacje')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Tagi')}</label>
                <div className="flex gap-2 mb-2">
                  <input
                    list="fin-tags"
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder={t('Dodaj tag')}
                    onKeyPress={(e) => e.key === 'Enter' && addTag(incomeForm, setIncomeForm)}
                  />
                  <datalist id="fin-tags">
                    {tagPalette.map((tg) => <option key={tg.id} value={tg.name} />)}
                  </datalist>
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
                      className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 font-medium"
                      style={{ background: `${tagColor(tag)}22`, color: tagColor(tag) }}
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
                  data-tour="fin-income-save"
                  onClick={saveIncome}
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

      {/* MODAL: Expense */}
      {showExpenseModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl p-6 border border-gray-200 dark:border-gray-700 my-8">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{t('Nowy wydatek')}</h3>
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
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Kontrahent')}</label>
                  <input
                    list="fin-vendors"
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.contractor}
                    onChange={(e) => setExpenseForm({...expenseForm, contractor: e.target.value})}
                    placeholder={t('Nazwa firmy/osoby')}
                  />
                  <datalist id="fin-vendors">
                    {vendors.map((v) => <option key={v.id} value={v.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Osoba odpowiedzialna')}</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={expenseForm.responsible_person}
                    onChange={(e) => setExpenseForm({...expenseForm, responsible_person: e.target.value})}
                    placeholder={t('Imię i nazwisko')}
                  />
                </div>
              </div>

              {/* Wiersz 3: Kategoria i Opis kosztu */}
              <div className="grid grid-cols-2 gap-4">
                <CustomSelect
                  label={tr('Kategoria (powiązana z budżetem)')}
                  value={expenseForm.category}
                  onChange={(val) => setExpenseForm({...expenseForm, category: val, description: ''})}
                  options={budgetCategories.length > 0 ? budgetCategories : [{ value: '', label: tr('Najpierw dodaj pozycje budżetowe') }]}
                  placeholder={t('Wybierz kategorię')}
                />
                {expenseForm.category && (
                  <CustomSelect
                    label={tr('Opis kosztu (z budżetu)')}
                    value={expenseForm.description}
                    onChange={(val) => setExpenseForm({...expenseForm, description: val})}
                    options={budgetItems
                      .filter(item => item.category === expenseForm.category)
                      .map(item => ({ value: item.description, label: item.description }))}
                    placeholder={t('Wybierz opis kosztu')}
                  />
                )}
              </div>

              {/* Wiersz 3b: Kategoria kosztu (własna, niezależna od budżetu) */}
              <div className="grid grid-cols-1">
                <CustomSelect
                  label={tr('Kategoria kosztu (własna)')}
                  value={expenseForm.cost_category}
                  onChange={(val) => setExpenseForm({...expenseForm, cost_category: val})}
                  options={[{ value: '', label: tr('— brak —') }, ...expenseCategories.map((c) => ({ value: c.name, label: c.name }))]}
                  placeholder={t('Wybierz kategorię kosztu')}
                />
              </div>

              {/* Wiersz 3c: Faktura (nr / termin / opłacone) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Nr faktury (opcjonalnie)')}</label>
                  <input value={expenseForm.invoice_number} onChange={(e) => setExpenseForm({ ...expenseForm, invoice_number: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="FV/2026/..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Termin płatności')}</label>
                  <input type="date" value={expenseForm.due_date} onChange={(e) => setExpenseForm({ ...expenseForm, due_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4" checked={expenseForm.is_paid !== false} onChange={(e) => setExpenseForm({ ...expenseForm, is_paid: e.target.checked })} />
                  {tr('Opłacone')}
                </label>
                {!expenseForm.id && (
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                    <input type="checkbox" className="w-4 h-4" checked={!!expenseForm.submit_for_approval} onChange={(e) => setExpenseForm({ ...expenseForm, submit_for_approval: e.target.checked })} />
                    {tr('Wniosek o zwrot / wyślij do akceptacji')}
                  </label>
                )}
              </div>

              {/* Wiersz 4: Szczegółowy opis (pełna szerokość) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Szczegółowy opis')}</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={expenseForm.detailed_description}
                  onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
                  placeholder={t('Dodatkowe informacje o wydatku...')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Załączniki (opcjonalnie)')}</label>
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
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Tagi')}</label>
                <div className="flex gap-2 mb-2">
                  <input
                    list="fin-tags"
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder={t('Dodaj tag')}
                    onKeyPress={(e) => e.key === 'Enter' && addTag(expenseForm, setExpenseForm)}
                  />
                  <datalist id="fin-tags">
                    {tagPalette.map((tg) => <option key={tg.id} value={tg.name} />)}
                  </datalist>
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
                      className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 font-medium"
                      style={{ background: `${tagColor(tag)}22`, color: tagColor(tag) }}
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

      {/* MODAL: Account Balances */}
      {showBalanceModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-gray-200 dark:border-gray-700">
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
                      {tr('Gotówka')}
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
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Typ waluty')}</label>
                  <select
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={balanceForm.currency_type}
                    onChange={(e) => setBalanceForm({...balanceForm, currency_type: e.target.value})}
                  >
                    <option value="EUR">EUR - Euro</option>
                    <option value="USD">{tr('USD - Dolar amerykański')}</option>
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
                      {tr('Gotówka walutowa')}
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
                <p className="font-medium mb-1">{t('💡 Wskazówka')}</p>
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
};

export default FinanceModule;
