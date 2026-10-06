import React, { useState, useEffect, useRef, useMemo } from 'react';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { DollarSign, TrendingUp, Receipt, Calendar, Plus, Upload, Download, Printer, Repeat, CheckCircle, XCircle, Clock, Copy, AlertTriangle, Tag, X, FileText, Trash2, Edit2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Users, Settings, Banknote, CreditCard, FolderOpen, Mail, CalendarClock } from 'lucide-react';
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
import { computeRange, shiftRangeYears, MONTHS_PL, yearOptions } from './finance/reportRange';
import { buildReportModel, toCsvBlob, toXlsxBlob, reportElToPdfBlob, printReportEl, blobToBase64, download, slugForRange } from './finance/reportExport';
import { IncomeExpenseBarChart, CashFlowAreaChart, CategoryDonut, YoYBars } from './finance/ReportCharts';
import { usePermissions } from '../contexts/PermissionsContext';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../components/ui/DataTable';
import { DateInput } from '../components/pickers';
import { confirmDialog, promptDialog } from '../lib/dialog';

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
  draft: { label: 'Szkic', color: STATUS_COLORS.neutral },
  submitted: { label: 'Do akceptacji', color: STATUS_COLORS.warning },
  approved: { label: 'Zaakceptowany', color: STATUS_COLORS.success },
  rejected: { label: 'Odrzucony', color: STATUS_COLORS.danger },
  paid: { label: 'Opłacony', color: STATUS_COLORS.info },
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
  const { logoUrl } = usePermissions();
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
    if (!await confirmDialog(tr('Usunąć tę kategorię? Istniejące transakcje zachowają swoją nazwę kategorii.'))) return;
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
  const deleteRecurring = async (id) => { if (!await confirmDialog(tr('Usunąć ten plan cykliczny?'))) return; try { await supabase.from('finance_recurring').delete().eq('id', id); fetchRecurring(); } catch (e) { toast.error(e.message); } };

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

  // ── Zakres raportu (miesiąc / kwartał / rok / dowolny zakres) ─────────────
  const reportSectionRef = useRef(null);
  const [orgName, setOrgName] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('key, value').in('key', ['org_name', 'organization_name', 'church_name', 'app_name']);
        const found = (data || []).find((s) => s.value);
        if (found) setOrgName(found.value);
      } catch { /* brak nazwy — pominie */ }
    })();
  }, []);
  const now0 = new Date();
  const [reportMode, setReportMode] = useState('year');
  const [reportAnchor, setReportAnchor] = useState({
    year: now0.getFullYear(), month: now0.getMonth(),
    quarter: Math.floor(now0.getMonth() / 3) + 1, from: '', to: '',
  });
  const reportRange = useMemo(() => computeRange(reportMode, reportAnchor), [reportMode, reportAnchor]);
  const [reportIncome, setReportIncome] = useState([]);
  const [reportExpense, setReportExpense] = useState([]);
  const [reportBudget, setReportBudget] = useState([]);
  const [reportBalances, setReportBalances] = useState({ bank_pln: 0, cash_pln: 0, bank_currency: 0, cash_currency: 0, currency_type: 'EUR' });
  const [reportPrev, setReportPrev] = useState({ income: [], expense: [] });
  const [reportLoading, setReportLoading] = useState(false);

  const fetchReportData = async (range) => {
    setReportLoading(true);
    try {
      const prev = shiftRangeYears(range, 1);
      const [inc, exp, bud, bal, pinc, pexp] = await Promise.all([
        supabase.from('income_transactions').select('*').gte('date', range.from).lte('date', range.to).order('date', { ascending: false }),
        supabase.from('expense_transactions').select('*').gte('payment_date', range.from).lte('payment_date', range.to).order('payment_date', { ascending: false }),
        withCampusFilter(supabase.from('budget_items').select('*')).eq('year', range.year).order('category'),
        supabase.from('finance_balances').select('*').eq('year', range.year).maybeSingle(),
        supabase.from('income_transactions').select('amount').gte('date', prev.from).lte('date', prev.to),
        supabase.from('expense_transactions').select('amount').gte('payment_date', prev.from).lte('payment_date', prev.to),
      ]);
      setReportIncome(inc.data || []);
      setReportExpense(exp.data || []);
      setReportBudget(bud.data || []);
      const b = bal.data;
      setReportBalances(b
        ? { bank_pln: b.bank_pln || 0, cash_pln: b.cash_pln || 0, bank_currency: b.bank_currency || 0, cash_currency: b.cash_currency || 0, currency_type: b.currency_type || 'EUR' }
        : { bank_pln: 0, cash_pln: 0, bank_currency: 0, cash_currency: 0, currency_type: 'EUR' });
      setReportPrev({ income: pinc.data || [], expense: pexp.data || [] });
    } catch (e) { console.error('Error fetching report data:', e); }
    finally { setReportLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'reports') fetchReportData(reportRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reportRange.from, reportRange.to, reportRange.year, selectedCampusId]);

  const reportModel = useMemo(() => buildReportModel({
    range: reportRange, income: reportIncome, expense: reportExpense,
    budget: reportBudget, expenseCategories,
    prevIncome: reportPrev.income, prevExpense: reportPrev.expense,
  }), [reportRange, reportIncome, reportExpense, reportBudget, expenseCategories, reportPrev]);

  // ── Pobieranie raportu (CSV / XLSX / PDF) ────────────────────────────────
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const doDownload = async (fmt) => {
    setShowDownloadMenu(false);
    const base = `raport-finansowy-${slugForRange(reportRange)}`;
    try {
      if (fmt === 'csv') download(toCsvBlob(reportModel), `${base}.csv`);
      else if (fmt === 'xlsx') download(await toXlsxBlob(reportModel), `${base}.xlsx`);
      else if (fmt === 'pdf') {
        if (!reportSectionRef.current) return;
        setDownloadingPdf(true);
        download(await reportElToPdfBlob(reportSectionRef.current), `${base}.pdf`);
      }
    } catch (e) { toast.error(tr('Błąd eksportu: ') + (e.message || e)); }
    finally { setDownloadingPdf(false); }
  };
  const [printing, setPrinting] = useState(false);
  const doPrint = async () => {
    if (!reportSectionRef.current) return;
    setPrinting(true);
    try { await printReportEl(reportSectionRef.current, `raport-finansowy-${slugForRange(reportRange)}.pdf`); }
    catch (e) { toast.error(tr('Błąd druku: ') + (e.message || e)); }
    finally { setPrinting(false); }
  };

  // ── Raport finansowy mailem (na żądanie) ──────────────────────────────────
  const [showReportEmailModal, setShowReportEmailModal] = useState(false);
  const [reportRecipients, setReportRecipients] = useState('');
  const [reportAttachments, setReportAttachments] = useState({ pdf: true, xlsx: true, csv: false });
  const [sendingReport, setSendingReport] = useState(false);
  const sendReportEmail = async () => {
    const list = reportRecipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error(tr('Podaj adresy e-mail')); return; }
    setSendingReport(true);
    try {
      const slug = slugForRange(reportRange);
      const attachments = [];
      if (reportAttachments.pdf && reportSectionRef.current) {
        const pdf = await reportElToPdfBlob(reportSectionRef.current);
        attachments.push({ filename: `raport-${slug}.pdf`, contentBase64: await blobToBase64(pdf), type: 'application/pdf' });
      }
      if (reportAttachments.xlsx) {
        attachments.push({ filename: `raport-${slug}.xlsx`, contentBase64: await blobToBase64(await toXlsxBlob(reportModel)), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
      if (reportAttachments.csv) {
        attachments.push({ filename: `raport-${slug}.csv`, contentBase64: await blobToBase64(toCsvBlob(reportModel)), type: 'text/csv' });
      }
      const { data, error } = await supabase.functions.invoke('finance-report-email', {
        body: { from: reportRange.from, to: reportRange.to, periodLabel: reportRange.label, recipients: list, attachments },
      });
      if (error) throw error;
      toast.success(tr('Raport wysłany') + ` (${data?.sent || list.length})`);
      setShowReportEmailModal(false); setReportRecipients('');
    } catch (e) { toast.error(tr('Błąd wysyłki: ') + (e.message || e)); }
    finally { setSendingReport(false); }
  };

  // ── Harmonogram automatycznych raportów (finance_report_schedules) ─────────
  const [schedules, setSchedules] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const emptySchedule = { cadence: 'monthly', recipients: '', include_csv: true, is_active: true };
  const [scheduleForm, setScheduleForm] = useState(emptySchedule);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const fetchSchedules = async () => {
    try { const { data } = await supabase.from('finance_report_schedules').select('*').order('created_at', { ascending: false }); setSchedules(data || []); }
    catch { setSchedules([]); }
  };
  useEffect(() => { fetchSchedules(); /* eslint-disable-next-line */ }, []);
  const nextRunFor = (cadence) => {
    const d = new Date();
    if (cadence === 'monthly') return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
    if (cadence === 'quarterly') { const q = Math.floor(d.getMonth() / 3) + 1; return new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10); }
    return new Date(d.getFullYear() + 1, 0, 1).toISOString().slice(0, 10);
  };
  const saveSchedule = async () => {
    const recipients = scheduleForm.recipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0) { toast.error(tr('Podaj adresy e-mail')); return; }
    const payload = {
      cadence: scheduleForm.cadence, recipients, include_csv: !!scheduleForm.include_csv,
      is_active: !!scheduleForm.is_active, next_run_date: nextRunFor(scheduleForm.cadence),
    };
    try {
      if (editingScheduleId) await supabase.from('finance_report_schedules').update(payload).eq('id', editingScheduleId);
      else await supabase.from('finance_report_schedules').insert([{ ...payload, created_by: currentUserEmail || null }]);
      setShowScheduleModal(false); setScheduleForm(emptySchedule); setEditingScheduleId(null); fetchSchedules();
      toast.success(tr('Harmonogram zapisany'));
    } catch (e) { toast.error(tr('Błąd: ') + (e.message || e)); }
  };
  const toggleSchedule = async (s) => { try { await supabase.from('finance_report_schedules').update({ is_active: !s.is_active }).eq('id', s.id); fetchSchedules(); } catch (e) { toast.error(e.message); } };
  const deleteSchedule = async (id) => { if (!await confirmDialog(tr('Usunąć ten harmonogram?'))) return; try { await supabase.from('finance_report_schedules').delete().eq('id', id); fetchSchedules(); } catch (e) { toast.error(e.message); } };
  const openEditSchedule = (s) => {
    setEditingScheduleId(s.id);
    setScheduleForm({ cadence: s.cadence || 'monthly', recipients: (s.recipients || []).join(', '), include_csv: s.include_csv !== false, is_active: s.is_active !== false });
    setShowScheduleModal(true);
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
    const label = await promptDialog(tr('Nazwa wersji (np. „Projekt zarządu", „Zatwierdzony")'));
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
    if (!await confirmDialog(tr('Czy na pewno chcesz usunąć tę pozycję budżetową?'))) return;

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
    if (!await confirmDialog(tr(`Skopiować pozycje budżetu z roku ${prev} do ${selectedYear}?`))) return;
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
    if (!await confirmDialog(tr('Czy na pewno chcesz usunąć ten wpływ?'))) return;

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
    if (!await confirmDialog(tr('Czy na pewno chcesz usunąć ten wydatek?'))) return;

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
              <DataTable flush>
                <THead>
                  <tr>
                    <TH>{tr('Kategoria')}</TH>
                    <TH>{tr('Opis')}</TH>
                    <TH align="right">{tr('Plan (PLN)')}</TH>
                    <TH align="right">{tr('Realizacja (PLN)')}</TH>
                    <TH align="center">{tr('% Realizacji')}</TH>
                    <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
                  </tr>
                </THead>
                <tbody>
                  {incomeBudgetItems.map((it) => {
                    const planned = Number(it.planned_amount || 0);
                    const real = calculateIncomeRealization(it.category);
                    const pct = planned > 0 ? Math.round((real / planned) * 100) : 0;
                    return (
                      <TR key={it.id}>
                        <TD className="font-semibold text-gray-900 dark:text-white">{it.category}</TD>
                        <TD muted>{it.description}</TD>
                        <TD align="right" numeric className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 justify-end">
                            {planned.toLocaleString('pl-PL')} zł
                            {itemChanges(it.id).length > 0 && (
                              <button onClick={() => setChangeItem(itemChanges(it.id))} title={tr('Kwota zmieniona — pokaż historię')} className="text-amber-500 hover:text-amber-600"><Clock size={13} /></button>
                            )}
                          </span>
                        </TD>
                        <TD align="right" numeric className="text-emerald-600 font-medium whitespace-nowrap">{real.toLocaleString('pl-PL')} zł</TD>
                        <TD align="center" numeric>{pct}%</TD>
                        <TD align="right" className="whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
                            <button onClick={() => { setBudgetForm({ ...it, planned_amount: String(it.planned_amount) }); setShowBudgetModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title={tr('Edytuj')}><Edit2 size={16} /></button>
                            <button onClick={() => deleteBudgetItem(it.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title={tr('Usuń')}><Trash2 size={16} /></button>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                  <TR className="bg-gray-50/70 dark:bg-gray-800/40 font-semibold">
                    <TD className="text-gray-900 dark:text-white" colSpan={2}>{tr('Suma przychodów')}</TD>
                    <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">{totalPlannedIncome.toLocaleString('pl-PL')} zł</TD>
                    <TD align="right" numeric className="text-emerald-600 whitespace-nowrap">{incomeBudgetItems.reduce((s, it) => s + calculateIncomeRealization(it.category), 0).toLocaleString('pl-PL')} zł</TD>
                    <TD />
                    <TD />
                  </TR>
                </tbody>
              </DataTable>
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
              <DataTable flush>
                <THead>
                  <tr>
                    <TH>{t('Służba')}</TH>
                    <TH>{t('Opis kosztu')}</TH>
                    <TH align="right">Plan (PLN)</TH>
                    <TH align="right">Realizacja (PLN)</TH>
                    <TH align="center">% Realizacji</TH>
                    <TH align="right">{t('Pozostało')}</TH>
                    <TH align="center"><span className="sr-only">{t('Akcje')}</span></TH>
                  </tr>
                </THead>
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
                          <TR key={item.id}>
                            {itemIndex === 0 && (
                              <TD
                                className="font-semibold text-gray-900 dark:text-white"
                                rowSpan={totalRowSpan}
                              >
                                {item.category}
                              </TD>
                            )}
                            <TD muted>{item.description}</TD>
                            <TD align="right" numeric className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 justify-end">
                                {Number(item.planned_amount || 0).toLocaleString('pl-PL')} zł
                                {itemChanges(item.id).length > 0 && (
                                  <button onClick={() => setChangeItem(itemChanges(item.id))} title={tr('Kwota zmieniona — pokaż historię')} className="text-amber-500 hover:text-amber-600">
                                    <Clock size={13} />
                                  </button>
                                )}
                              </span>
                            </TD>
                            <TD
                              align="right"
                              numeric
                              className="font-medium text-gray-900 dark:text-white whitespace-nowrap cursor-pointer hover:text-accent-primary dark:hover:text-accent-primary-light transition"
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
                            </TD>
                            <TD>
                              <div className="space-y-2">
                                <div className="text-center font-semibold tabular-nums text-gray-900 dark:text-white">
                                  {percentage.toFixed(1)}%
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                  <div
                                    className={`h-2.5 rounded-full bg-gradient-to-r ${getProgressBarColor(percentage)} transition-all`}
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </TD>
                            <TD align="right" numeric className={`font-semibold whitespace-nowrap ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {remaining.toLocaleString('pl-PL')} zł
                            </TD>
                            <TD align="center">
                              <div className="flex justify-center gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
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
                            </TD>
                          </TR>
                        );

                        // Add expandable expense list row
                        if (expandedBudgetItems[`${item.id}`]) {
                          const categoryExpenses = expenseTransactions.filter(
                            (exp) => exp.category === item.category && exp.description === item.description
                          );

                          rows.push(
                            <TR key={`expenses-${item.id}`} className="bg-gray-50/70 dark:bg-gray-800/40">
                              <TD colSpan={7}>
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
                              </TD>
                            </TR>
                          );
                        }
                      });

                      grandTotalPlanned += categoryTotalPlanned;
                      grandTotalRealization += categoryTotalRealization;
                      grandTotalRemaining += categoryTotalRemaining;

                      const categoryPercentage = categoryTotalPlanned > 0 ? (categoryTotalRealization / categoryTotalPlanned) * 100 : 0;

                      // Subtotal row for this category
                      rows.push(
                        <TR key={`subtotal-${category}`} className="bg-gray-50/70 dark:bg-gray-800/40 font-semibold">
                          <TD className="text-gray-900 dark:text-white" colSpan={2}>
                            Podsumowanie: {category}
                          </TD>
                          <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">
                            {categoryTotalPlanned.toLocaleString('pl-PL')} zł
                          </TD>
                          <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">
                            {categoryTotalRealization.toLocaleString('pl-PL')} zł
                          </TD>
                          <TD align="center" numeric className="text-gray-900 dark:text-white">
                            {categoryPercentage.toFixed(1)}%
                          </TD>
                          <TD align="right" numeric className={`whitespace-nowrap ${categoryTotalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {categoryTotalRemaining.toLocaleString('pl-PL')} zł
                          </TD>
                          <TD />
                        </TR>
                      );
                    });

                    const grandPercentage = grandTotalPlanned > 0 ? (grandTotalRealization / grandTotalPlanned) * 100 : 0;

                    // Grand total row
                    rows.push(
                      <TR key="grand-total" className="bg-gray-100/70 dark:bg-gray-700/40 font-bold">
                        <TD className="text-gray-900 dark:text-white" colSpan={2}>
                          {tr('SUMA CAŁKOWITA')}
                        </TD>
                        <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">
                          {grandTotalPlanned.toLocaleString('pl-PL')} zł
                        </TD>
                        <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">
                          {grandTotalRealization.toLocaleString('pl-PL')} zł
                        </TD>
                        <TD align="center" numeric className="text-gray-900 dark:text-white">
                          {grandPercentage.toFixed(1)}%
                        </TD>
                        <TD align="right" numeric className={`whitespace-nowrap ${grandTotalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {grandTotalRemaining.toLocaleString('pl-PL')} zł
                        </TD>
                        <TD />
                      </TR>
                    );

                    return rows;
                  })()}
                </tbody>
              </DataTable>
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
            <DataTable>
                <THead>
                  <tr>
                    <TH>{tr('Data')}</TH>
                    <TH>Typ</TH>
                    <TH>{t('Źródło')}</TH>
                    <TH align="right">{t('Kwota')}</TH>
                    <TH>{t('Notatka')}</TH>
                    <TH align="center">{t('Tagi')}</TH>
                    <TH align="center"><span className="sr-only">{t('Akcje')}</span></TH>
                  </tr>
                </THead>
                <tbody>
                  {filteredIncomeTransactions.map((transaction) => (
                    <TR key={transaction.id}>
                      <TD numeric className="whitespace-nowrap">
                        {new Date(transaction.date).toLocaleDateString('pl-PL')}
                      </TD>
                      <TD>
                        <StatusPill color={STATUS_COLORS.success}>
                          {transaction.type}
                        </StatusPill>
                      </TD>
                      <TD>
                        {transaction.source}
                      </TD>
                      <TD align="right" numeric className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                        {transaction.amount.toLocaleString('pl-PL')} zł
                      </TD>
                      <TD muted>
                        {transaction.notes || ''}
                      </TD>
                      <TD align="center">
                        {transaction.tags && transaction.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {transaction.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1 font-medium"
                                style={{ background: `${tagColor(tag)}22`, color: tagColor(tag) }}
                              >
                                <Tag size={10} />
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </TD>
                      <TD align="center">
                        <div className="flex justify-center gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
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
                      </TD>
                    </TR>
                  ))}
                </tbody>
            </DataTable>
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
            <DataTable minWidth={900}>
                <THead>
                  <tr>
                    <TH>{tr('Data')}</TH>
                    <TH>{tr('Kategoria')}</TH>
                    <TH>{tr('Opis')}</TH>
                    <TH>{t('Kontrahent')}</TH>
                    <TH align="right">{t('Kwota')}</TH>
                    <TH>{t('Odpowiedzialny')}</TH>
                    <TH align="center">{t('Załączniki')}</TH>
                    <TH align="center"><span className="sr-only">{t('Akcje')}</span></TH>
                  </tr>
                </THead>
                <tbody>
                  {filteredExpenseTransactions.map((transaction) => (
                    <TR key={transaction.id}>
                      <TD numeric className="whitespace-nowrap">
                        {new Date(transaction.payment_date).toLocaleDateString('pl-PL')}
                      </TD>
                      <TD>
                        <div className="flex flex-col items-start gap-1">
                          <StatusPill color={STATUS_COLORS.danger}>
                            {transaction.category}
                          </StatusPill>
                          {transaction.cost_category && (() => {
                            const cc = expenseCategories.find((c) => c.name === transaction.cost_category);
                            const col = cc?.color || '#6366f1';
                            return (
                              <StatusPill color={col}>
                                {transaction.cost_category}
                              </StatusPill>
                            );
                          })()}
                        </div>
                      </TD>
                      <TD>
                        {transaction.description || ''}
                      </TD>
                      <TD muted>
                        {transaction.contractor}
                      </TD>
                      <TD align="right" numeric>
                        <div className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{transaction.amount.toLocaleString('pl-PL')} zł</div>
                        <div className="flex flex-col items-end gap-1 mt-1">
                          {transaction.status && transaction.status !== 'approved' && (
                            <StatusPill color={(EXPENSE_STATUS[transaction.status] || EXPENSE_STATUS.approved).color}>
                              {tr((EXPENSE_STATUS[transaction.status] || {}).label || transaction.status)}
                            </StatusPill>
                          )}
                          {transaction.is_paid === false && (
                            <StatusPill color={STATUS_COLORS.warning}>
                              {tr('Do zapłaty')}{transaction.due_date ? ` · ${transaction.due_date}` : ''}
                            </StatusPill>
                          )}
                          {transaction.invoice_number && (
                            <span className="text-[10px] text-gray-400">FV {transaction.invoice_number}</span>
                          )}
                        </div>
                      </TD>
                      <TD muted>
                        {transaction.responsible_person}
                      </TD>
                      <TD align="center">
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
                        ) : null}
                      </TD>
                      <TD align="center">
                        <div className="flex justify-center gap-1 flex-wrap opacity-60 group-hover/row:opacity-100 transition-opacity">
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
                      </TD>
                    </TR>
                  ))}
                </tbody>
            </DataTable>
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
          {/* Pasek: zakres raportu + akcje */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                {[['month', tr('Miesiąc')], ['quarter', tr('Kwartał')], ['year', tr('Rok')], ['custom', tr('Zakres')]].map(([m, lbl]) => (
                  <button key={m} onClick={() => setReportMode(m)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${reportMode === m ? 'bg-white dark:bg-gray-900 shadow text-accent-primary' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>{lbl}</button>
                ))}
              </div>
              {reportMode === 'month' && (
                <>
                  <CustomSelect value={reportAnchor.month} onChange={(v) => setReportAnchor((a) => ({ ...a, month: parseInt(v) }))} options={MONTHS_PL.map((m, i) => ({ value: i, label: m }))} />
                  <CustomSelect value={reportAnchor.year} onChange={(v) => setReportAnchor((a) => ({ ...a, year: parseInt(v) }))} options={yearOptions().map((y) => ({ value: y, label: String(y) }))} />
                </>
              )}
              {reportMode === 'quarter' && (
                <>
                  <CustomSelect value={reportAnchor.quarter} onChange={(v) => setReportAnchor((a) => ({ ...a, quarter: parseInt(v) }))} options={[1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q}` }))} />
                  <CustomSelect value={reportAnchor.year} onChange={(v) => setReportAnchor((a) => ({ ...a, year: parseInt(v) }))} options={yearOptions().map((y) => ({ value: y, label: String(y) }))} />
                </>
              )}
              {reportMode === 'year' && (
                <CustomSelect value={reportAnchor.year} onChange={(v) => setReportAnchor((a) => ({ ...a, year: parseInt(v) }))} options={yearOptions().map((y) => ({ value: y, label: String(y) }))} />
              )}
              {reportMode === 'custom' && (
                <div className="flex items-center gap-2">
                  <DateInput value={reportAnchor.from || reportRange.from} onChange={(e) => setReportAnchor((a) => ({ ...a, from: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
                  <span className="text-gray-400">–</span>
                  <DateInput value={reportAnchor.to || reportRange.to} onChange={(e) => setReportAnchor((a) => ({ ...a, to: e.target.value }))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200" />
                </div>
              )}
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 ml-1">{reportRange.label}</span>
              {reportLoading && <span className="text-xs text-gray-400">{tr('Ładowanie…')}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <button onClick={() => setShowDownloadMenu((v) => !v)} disabled={downloadingPdf} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm disabled:opacity-60">
                  <Download size={16} /> {downloadingPdf ? tr('Generowanie…') : tr('Pobierz')} <ChevronDown size={14} />
                </button>
                {showDownloadMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDownloadMenu(false)} />
                    <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 py-1">
                      <button onClick={() => doDownload('pdf')} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">PDF</button>
                      <button onClick={() => doDownload('xlsx')} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Excel (.xlsx)</button>
                      <button onClick={() => doDownload('csv')} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">CSV</button>
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setShowReportEmailModal(true)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm" title={tr('Wyślij raport mailem')}>
                <Mail size={16} /> {tr('Wyślij raport')}
              </button>
              <button onClick={() => { setEditingScheduleId(null); setScheduleForm(emptySchedule); setShowScheduleModal(true); }} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm" title={tr('Automatyczna wysyłka')}>
                <CalendarClock size={16} /> {tr('Harmonogram')}{schedules.filter((s) => s.is_active !== false).length > 0 ? ` (${schedules.filter((s) => s.is_active !== false).length})` : ''}
              </button>
              <button onClick={doPrint} disabled={printing} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm disabled:opacity-60" title={tr('Drukuj / zapisz PDF')}>
                <Printer size={16} /> {printing ? tr('Przygotowuję…') : tr('Drukuj')}
              </button>
            </div>
          </div>

          {/* Treść raportu (źródło PDF) */}
          <div ref={reportSectionRef} className="space-y-6 bg-gray-50 dark:bg-gray-950 rounded-2xl p-1">
            {/* Nagłówek raportu — tytuł, organizacja, logo, zakres, data wygenerowania */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 px-6 py-5">
              <div className="flex items-center gap-4">
                {logoUrl && <img src={logoUrl} alt="" className="h-14 w-auto shrink-0" />}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{tr('Raport finansowy')}</h2>
                  {orgName && <p className="text-sm text-gray-500 dark:text-gray-400">{orgName}</p>}
                </div>
              </div>
              <div className="sm:text-right text-sm">
                <p className="font-semibold text-gray-900 dark:text-white">{reportRange.label}</p>
                <p className="text-gray-500 dark:text-gray-400 tabular-nums">{reportRange.from} – {reportRange.to}</p>
                <p className="text-xs text-gray-400 mt-0.5">{tr('Wygenerowano')}: {new Date().toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
            </div>
            {(() => {
              const fmt = (n) => Number(n || 0).toLocaleString('pl-PL');
              const { income: tIncome, expense: tExpense, balance: tBalance } = reportModel.totals;
              const totalPlanned = reportBudget.reduce((s, i) => s + (i.planned_amount || 0), 0);
              const budgetExec = totalPlanned > 0 ? (tExpense / totalPlanned) * 100 : 0;
              return (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="bg-gradient-to-r from-accent-primary to-accent-secondary p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-accent-primary-lighter text-sm font-medium mb-1">{tr('Bilans okresu')} • {reportRange.label}</p>
                        <p className="text-4xl font-bold">{tBalance >= 0 ? '+' : ''}{fmt(tBalance)} zł</p>
                      </div>
                      <button onClick={openBalanceModal} className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition print:hidden pdf-exclude" title={t('Edytuj stany początkowe')}>
                        <Settings size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2"><ArrowUpRight size={16} className="text-green-500" /><span className="text-xs font-medium uppercase">{tr('Wpływy')}</span></div>
                        <p className="text-xl font-bold text-green-600 dark:text-green-400">{fmt(tIncome)} zł</p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2"><ArrowDownRight size={16} className="text-red-500" /><span className="text-xs font-medium uppercase">{tr('Wydatki')}</span></div>
                        <p className="text-xl font-bold text-red-600 dark:text-red-400">{fmt(tExpense)} zł</p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">{tBalance >= 0 ? <TrendingUp size={16} className="text-green-500" /> : <ArrowDownRight size={16} className="text-red-500" />}<span className="text-xs font-medium uppercase">{tr('Bilans')}</span></div>
                        <p className={`text-xl font-bold ${tBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{tBalance >= 0 ? '+' : ''}{fmt(tBalance)} zł</p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2"><PieChart size={16} /><span className="text-xs font-medium uppercase">{t('Budżet')} {reportRange.year}</span></div>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{budgetExec.toFixed(1)}%</p>
                        <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${budgetExec < 80 ? 'bg-green-500' : budgetExec <= 100 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(budgetExec, 100)}%` }} /></div>
                      </div>
                    </div>
                    {(reportBalances.bank_pln > 0 || reportBalances.cash_pln > 0 || reportBalances.bank_currency > 0 || reportBalances.cash_currency > 0) && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2 text-sm"><CreditCard size={16} className="text-gray-400" /><span className="text-gray-500 dark:text-gray-400">{tr('Bank')} ({reportRange.year}):</span><span className="font-semibold text-gray-900 dark:text-white">{fmt(reportBalances.bank_pln)} zł</span></div>
                        <div className="flex items-center gap-2 text-sm"><Banknote size={16} className="text-gray-400" /><span className="text-gray-500 dark:text-gray-400">{t('Gotówka')}:</span><span className="font-semibold text-gray-900 dark:text-white">{fmt(reportBalances.cash_pln)} zł</span></div>
                        {reportBalances.bank_currency > 0 && <div className="flex items-center gap-2 text-sm"><CreditCard size={16} className="text-amber-500" /><span className="text-gray-500 dark:text-gray-400">{tr('Bank')} {reportBalances.currency_type}:</span><span className="font-semibold text-gray-900 dark:text-white">{fmt(reportBalances.bank_currency)}</span></div>}
                        {reportBalances.cash_currency > 0 && <div className="flex items-center gap-2 text-sm"><Banknote size={16} className="text-cyan-500" /><span className="text-gray-500 dark:text-gray-400">{t('Gotówka')} {reportBalances.currency_type}:</span><span className="font-semibold text-gray-900 dark:text-white">{fmt(reportBalances.cash_currency)}</span></div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* KPI — szybkie wskaźniki okresu */}
            {(() => {
              const k = reportModel.kpis;
              const fmt = (n) => Number(n || 0).toLocaleString('pl-PL');
              const Tile = ({ icon, label, value, sub, tone }) => (
                <div className={`rounded-2xl border p-4 ${tone === 'warn' ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1.5">{icon}<span className="text-xs font-medium uppercase">{label}</span></div>
                  <p className={`text-lg font-bold ${tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>{value}</p>
                  {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{sub}</p>}
                </div>
              );
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Tile icon={<ArrowUpRight size={15} className="text-green-500" />} label={tr('Śr. wpływ')} value={`${fmt(Math.round(k.avgIncome))} zł`} sub={`${k.incomeCount} ${tr('transakcji')}`} />
                  <Tile icon={<ArrowDownRight size={15} className="text-red-500" />} label={tr('Śr. wydatek')} value={`${fmt(Math.round(k.avgExpense))} zł`} sub={`${k.expenseCount} ${tr('transakcji')}`} />
                  <Tile icon={<PieChart size={15} className="text-accent-primary" />} label={tr('Największa kategoria')} value={k.topCategory ? `${fmt(Math.round(k.topCategory.amount))} zł` : '—'} sub={k.topCategory?.name || ''} />
                  <Tile icon={<AlertTriangle size={15} className={k.unpaidCount ? 'text-amber-500' : 'text-gray-400'} />} label={tr('Do zapłaty')} value={`${fmt(k.unpaidTotal)} zł`} sub={`${k.unpaidCount} ${tr('nieopłaconych')}`} tone={k.unpaidCount ? 'warn' : undefined} />
                </div>
              );
            })()}

            {/* Wpływy vs Wydatki */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-accent-primary" />{tr('Wpływy vs Wydatki')}</h3>
              <IncomeExpenseBarChart buckets={reportModel.buckets} tr={tr} />
            </div>

            {/* Przepływ gotówki */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-accent-primary" />{tr('Przepływ gotówki (skumulowany)')}</h3>
              <CashFlowAreaChart buckets={reportModel.buckets} tr={tr} />
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{tr('Saldo na koniec okresu')}: <span className={`font-bold ${reportModel.totals.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(reportModel.buckets.at(-1)?.cumulative || 0).toLocaleString('pl-PL')} zł</span></div>
            </div>

            {/* Donuty kategorii */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><PieChart size={20} className="text-accent-primary" />{tr('Wydatki wg kategorii kosztu')}</h3>
                <CategoryDonut data={reportModel.byCostCategory} tr={tr} />
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><PieChart size={20} className="text-accent-primary" />{tr('Wydatki wg służby')}</h3>
                <CategoryDonut data={reportModel.byServiceCategory} tr={tr} />
              </div>
            </div>

            {/* Wpływy wg typu + Wpływy wg źródła */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Users size={20} className="text-accent-primary" />{tr('Wpływy wg typu')}</h3>
                <CategoryDonut data={reportModel.byIncomeType} tr={tr} />
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-accent-primary" />{tr('Wpływy wg źródła')}</h3>
                <CategoryDonut data={reportModel.byIncomeSource} tr={tr} />
              </div>
            </div>

            {/* Największe wydatki + Status wydatków */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Receipt size={20} className="text-accent-primary" />{tr('Największe wydatki')}</h3>
                {reportModel.topExpenses.length > 0 ? (
                  <div className="space-y-1.5">
                    {reportModel.topExpenses.map((e, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition">
                        <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{e.description || e.contractor}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{e.contractor} · {e.category} · {e.date}</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">{Number(e.amount).toLocaleString('pl-PL')} zł</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('Brak danych o wydatkach')}</p>}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><CheckCircle size={20} className="text-accent-primary" />{tr('Status wydatków')}</h3>
                {reportModel.expenseStatus.length > 0 ? (
                  <div className="space-y-3">
                    {(() => {
                      const STc = { draft: ['Szkic', '#9ca3af'], submitted: ['Do akceptacji', '#eda100'], approved: ['Zatwierdzone', '#2a78d6'], rejected: ['Odrzucone', '#e34948'], paid: ['Opłacone', '#0ca30c'] };
                      const total = reportModel.expenseStatus.reduce((a, s) => a + s.amount, 0) || 1;
                      return reportModel.expenseStatus.map((s) => {
                        const [lbl, col] = STc[s.status] || [s.status, '#6366f1'];
                        const pct = (s.amount / total) * 100;
                        return (
                          <div key={s.status}>
                            <div className="flex justify-between text-sm mb-1"><span className="text-gray-700 dark:text-gray-300">{tr(lbl)} <span className="text-gray-400">({s.count})</span></span><span className="font-semibold text-gray-900 dark:text-white">{Number(s.amount).toLocaleString('pl-PL')} zł</span></div>
                            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: col }} /></div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('Brak danych o wydatkach')}</p>}
              </div>
            </div>

            {/* Realizacja budżetu */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><DollarSign size={20} className="text-accent-primary" />{tr('Realizacja budżetu wg służb')} ({reportRange.year})</h3>
              {reportModel.budgetExecution.length > 0 ? (
                <DataTable>
                  <THead>
                    <tr>
                      <TH>{t('Służba')}</TH>
                      <TH align="right">{t('Planowany')}</TH>
                      <TH align="right">{t('Zrealizowany')}</TH>
                      <TH align="center">{t('Realizacja')}</TH>
                      <TH align="right">{t('Pozostało')}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {reportModel.budgetExecution.map((b) => {
                      const progressColor = b.pct < 80 ? 'from-green-500 to-green-600' : b.pct <= 100 ? 'from-yellow-500 to-yellow-600' : 'from-red-500 to-red-600';
                      return (
                        <TR key={b.category}>
                          <TD className="font-medium text-gray-900 dark:text-white">{b.category}</TD>
                          <TD align="right" numeric className="whitespace-nowrap">{Number(b.planned).toLocaleString('pl-PL')} zł</TD>
                          <TD align="right" numeric className="whitespace-nowrap">{Number(b.realized).toLocaleString('pl-PL')} zł</TD>
                          <TD><div className="flex items-center gap-2"><div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2"><div className={`h-2 rounded-full bg-gradient-to-r ${progressColor}`} style={{ width: `${Math.min(b.pct, 100)}%` }} /></div><span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white w-14 text-right">{b.pct.toFixed(0)}%</span></div></TD>
                          <TD align="right" numeric className={`font-semibold whitespace-nowrap ${b.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(b.remaining).toLocaleString('pl-PL')} zł</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </DataTable>
              ) : <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('Brak pozycji budżetowych')}</p>}
            </div>

            {/* Nieopłacone zobowiązania / faktury */}
            {reportModel.unpaidInvoices.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><AlertTriangle size={20} className="text-amber-500" />{tr('Nieopłacone zobowiązania')} <span className="text-sm font-normal text-gray-400">({reportModel.unpaidInvoices.length})</span></h3>
                <DataTable>
                  <THead>
                    <tr>
                      <TH>{tr('Kontrahent')}</TH>
                      <TH>{tr('Opis')}</TH>
                      <TH>{tr('Nr faktury')}</TH>
                      <TH>{tr('Termin')}</TH>
                      <TH align="right">{tr('Kwota')}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {reportModel.unpaidInvoices.map((e, idx) => {
                      const overdue = e.due_date && e.due_date < new Date().toISOString().slice(0, 10);
                      return (
                        <TR key={idx}>
                          <TD className="font-medium text-gray-900 dark:text-white">{e.contractor}</TD>
                          <TD muted className="truncate max-w-[220px]">{e.description}</TD>
                          <TD muted numeric>{e.invoice_number || ''}</TD>
                          <TD muted numeric className="whitespace-nowrap"><span className={overdue ? 'text-red-600 font-semibold' : ''}>{e.due_date || ''}{overdue ? ' ⚠' : ''}</span></TD>
                          <TD align="right" numeric className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{Number(e.amount).toLocaleString('pl-PL')} zł</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </DataTable>
              </div>
            )}

            {/* Porównanie rok do roku */}
            {reportModel.yoy && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-accent-primary" />{tr('Porównanie rok do roku')} ({reportRange.year - 1} → {reportRange.year})</h3>
                <YoYBars yoy={reportModel.yoy} prevLabel={reportRange.year - 1} nowLabel={reportRange.year} tr={tr} />
              </div>
            )}
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
                  <DateInput value={recurringForm.next_run_date} onChange={(e) => setRecurringForm({ ...recurringForm, next_run_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Koniec (opcjonalnie)')}</label>
                  <DateInput value={recurringForm.end_date} onChange={(e) => setRecurringForm({ ...recurringForm, end_date: e.target.value })}
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
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{tr('Wyślij raport')}</h3>
              <button onClick={() => setShowReportEmailModal(false)} className="text-gray-500 dark:text-gray-400"><X size={24} /></button>
            </div>
            <div className="mb-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"><Calendar size={15} /> {tr('Zakres')}: <span className="font-semibold text-gray-900 dark:text-white">{reportRange.label}</span></div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{tr('Podsumowanie okresu (przychody, wydatki, bilans, wykresy, kategorie) trafi na wskazane adresy.')}</p>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Adresy e-mail')}</label>
            <textarea
              rows={3}
              value={reportRecipients}
              onChange={(e) => setReportRecipients(e.target.value)}
              placeholder={tr('jan@parafia.pl, skarbnik@parafia.pl (oddziel przecinkiem lub enterem)')}
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
            />
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mt-4 mb-2">{tr('Załączniki')}</label>
            <div className="flex flex-wrap gap-4">
              {[['pdf', 'PDF'], ['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV']].map(([k, lbl]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={!!reportAttachments[k]} onChange={(e) => setReportAttachments((a) => ({ ...a, [k]: e.target.checked }))} className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary" />
                  {lbl}
                </label>
              ))}
            </div>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setShowReportEmailModal(false)} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition">{tr('Anuluj')}</button>
              <button onClick={sendReportEmail} disabled={sendingReport} className="flex-1 px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium disabled:opacity-60">{sendingReport ? tr('Wysyłanie…') : tr('Wyślij')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showScheduleModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setShowScheduleModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-gray-200 dark:border-gray-700 max-h-[85vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white flex items-center gap-2"><CalendarClock size={20} /> {tr('Harmonogram raportów')}</h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-gray-500 dark:text-gray-400"><X size={24} /></button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{tr('Automatyczna wysyłka raportu za zakończony okres na wskazane adresy — 1. dnia nowego okresu.')}</p>

            {schedules.length > 0 && (
              <div className="space-y-2 mb-5">
                {schedules.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.cadence === 'monthly' ? tr('Co miesiąc') : s.cadence === 'quarterly' ? tr('Co kwartał') : tr('Co rok')}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{(s.recipients || []).join(', ')}</p>
                      {s.next_run_date && <p className="text-[11px] text-gray-400">{tr('Następna wysyłka')}: {s.next_run_date}</p>}
                    </div>
                    <button onClick={() => toggleSchedule(s)} className={`text-xs px-2 py-1 rounded-lg ${s.is_active !== false ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}>{s.is_active !== false ? tr('Aktywny') : tr('Wstrzymany')}</button>
                    <button onClick={() => openEditSchedule(s)} className="text-gray-400 hover:text-accent-primary"><Edit2 size={16} /></button>
                    <button onClick={() => deleteSchedule(s.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200">{editingScheduleId ? tr('Edytuj harmonogram') : tr('Nowy harmonogram')}</h4>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Częstotliwość')}</label>
                <CustomSelect value={scheduleForm.cadence} onChange={(v) => setScheduleForm((f) => ({ ...f, cadence: v }))} options={[{ value: 'monthly', label: tr('Co miesiąc') }, { value: 'quarterly', label: tr('Co kwartał') }, { value: 'yearly', label: tr('Co rok') }]} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Adresy e-mail')}</label>
                <textarea rows={2} value={scheduleForm.recipients} onChange={(e) => setScheduleForm((f) => ({ ...f, recipients: e.target.value }))} placeholder={tr('skarbnik@parafia.pl, zarzad@parafia.pl')} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"><input type="checkbox" checked={!!scheduleForm.include_csv} onChange={(e) => setScheduleForm((f) => ({ ...f, include_csv: e.target.checked }))} className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary" /> {tr('Załącz CSV')}</label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"><input type="checkbox" checked={!!scheduleForm.is_active} onChange={(e) => setScheduleForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary" /> {tr('Aktywny')}</label>
              </div>
              <div className="flex gap-3 pt-2">
                {editingScheduleId && <button onClick={() => { setEditingScheduleId(null); setScheduleForm(emptySchedule); }} className="px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm">{tr('Nowy')}</button>}
                <button onClick={saveSchedule} className="flex-1 px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium">{editingScheduleId ? tr('Zapisz zmiany') : tr('Dodaj harmonogram')}</button>
              </div>
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
                  <DateInput value={expenseForm.due_date} onChange={(e) => setExpenseForm({ ...expenseForm, due_date: e.target.value })}
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
