import React, { useState, useEffect, useRef, useMemo } from 'react';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import Button from '../components/Button';
import { DollarSign, TrendingUp, Receipt, Calendar, Plus, Upload, Download, Printer, Repeat, CheckCircle, XCircle, Clock, Copy, AlertTriangle, Tag, X, FileText, Trash2, Edit2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Users, Settings, Banknote, CreditCard, FolderOpen, Mail, CalendarClock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useCampusQuery } from '../hooks/useCampusQuery';
import CustomSelect from '../components/CustomSelect';
import MaterialsTab from './shared/MaterialsTab';
import ResponsiveTabs from '../components/ResponsiveTabs';
import PageHeader from '../components/PageHeader';
import { useT } from '../i18n';
import { tr, appLocale } from '../i18n';
import { toast } from '../lib/toast';
import { computeRange, shiftRangeYears, MONTHS_PL, yearOptions } from './finance/reportRange';
import { buildReportModel, toCsvBlob, toXlsxBlob, reportElToPdfBlob, printReportEl, blobToBase64, download, slugForRange } from './finance/reportExport';
import { IncomeExpenseBarChart, CashFlowAreaChart, CategoryDonut, YoYBars } from './finance/ReportCharts';
import { usePermissions } from '../contexts/PermissionsContext';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../components/ui/DataTable';
import { DateInput } from '../components/pickers';
import { confirmDialog, promptDialog } from '../lib/dialog';
import {
  num, withNumbers, isCountedExpense, isPendingExpense, realizationFor, matchesBudgetItem, normKey,
  fmtMoney, fmtPct, fmtDate, parseLocalDate, localDateStr, nextPeriodStart, missingFields, planBudgetCopy, humanSaveError,
} from './finance/money';
import CustomDatePicker from '../components/CustomDatePicker';  // wspólne pole daty (wcześniej lokalna kopia bez ramki pola)



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

// Puste formularze — „Dodaj…” zawsze startuje od nich (bez id poprzednio edytowanego rekordu).
const EMPTY_BUDGET = { kind: 'expense', category: '', description: '', planned_amount: '', period_type: 'year' };
const EMPTY_INCOME = { date: '', amount: '', type: 'Kolekta', source: '', notes: '', tags: [] };
const EMPTY_EXPENSE = {
  payment_date: '', amount: '', contractor: '', category: '', cost_category: '', description: '',
  detailed_description: '', responsible_person: '', invoice_number: '', due_date: '', is_paid: true,
  submit_for_approval: false, documents: [], tags: [],
};
// Wartość „Opis kosztu” oznaczająca wydatek spoza pozycji budżetu (opis wpisywany ręcznie).
const OFF_BUDGET = '__off_budget__';

const FinanceModule = () => {
  const t = useT();
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const { logoUrl, can } = usePermissions();
  // Zatwierdzanie/odrzucanie/opłacanie wydatków i decyzje o propozycjach budżetu —
  // serwer odrzuca je (403) bez tego uprawnienia, więc UI ich nie proponuje.
  const canApprove = can('action:finance:approve');
  // Blokada przycisków „Zapisz” w trakcie zapisu (brak podwójnych rekordów).
  const [saving, setSaving] = useState(false);
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
  const [budgetForm, setBudgetForm] = useState(EMPTY_BUDGET);
  const [incomeForm, setIncomeForm] = useState(EMPTY_INCOME);
  // cost_category = własna kategoria kosztu (niezależna od budżetu); submit_for_approval →
  // status 'submitted' (wniosek o zwrot); documents = [{url, name}].
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE);
  // Wydatek spoza pozycji budżetu (opis wpisany ręcznie) i pola z błędem walidacji.
  const [expenseOffBudget, setExpenseOffBudget] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Otwieranie/zamykanie modali: „Dodaj” = czysty formularz, zamknięcie czyści stan edycji
  // (wcześniej „Dodaj” po anulowanej edycji robiło UPDATE starego rekordu).
  const openCreateBudget = () => { setBudgetForm(EMPTY_BUDGET); setFormErrors({}); setShowBudgetModal(true); };
  const openEditBudget = (item) => { setBudgetForm({ ...item, planned_amount: String(num(item.planned_amount)) }); setFormErrors({}); setShowBudgetModal(true); };
  const closeBudgetModal = () => { if (saving) return; setShowBudgetModal(false); setBudgetForm(EMPTY_BUDGET); setFormErrors({}); };
  const openCreateIncome = () => { setIncomeForm({ ...EMPTY_INCOME, date: localDateStr() }); setNewTag(''); setFormErrors({}); setShowIncomeModal(true); };
  const openEditIncome = (tx) => { setIncomeForm({ ...EMPTY_INCOME, ...tx, amount: String(num(tx.amount)), source: tx.source || '', notes: tx.notes || '', tags: tx.tags || [] }); setNewTag(''); setFormErrors({}); setShowIncomeModal(true); };
  const closeIncomeModal = () => { if (saving) return; setShowIncomeModal(false); setIncomeForm(EMPTY_INCOME); setFormErrors({}); };
  const openCreateExpense = () => {
    setExpenseForm({ ...EMPTY_EXPENSE, payment_date: localDateStr(), is_paid: canApprove, submit_for_approval: !canApprove });
    setExpenseOffBudget(false); setNewTag(''); setFormErrors({}); setShowExpenseModal(true);
  };
  const openEditExpense = (tx) => {
    // Opis, którego nie ma wśród pozycji budżetu tej służby = wydatek spoza budżetu.
    const linked = budgetItems.find((b) => b.kind !== 'income' && matchesBudgetItem(tx, b));
    setExpenseForm({
      ...EMPTY_EXPENSE, ...tx, amount: String(num(tx.amount)),
      contractor: tx.contractor || '', responsible_person: tx.responsible_person || '',
      description: linked ? linked.description : (tx.description || ''),
      detailed_description: tx.detailed_description || '', cost_category: tx.cost_category || '', category: linked ? linked.category : (tx.category || ''),
      invoice_number: tx.invoice_number || '', due_date: tx.due_date || '', documents: tx.documents || [], tags: tx.tags || [],
    });
    setExpenseOffBudget(!linked && !!tx.description);
    setNewTag(''); setFormErrors({}); setShowExpenseModal(true);
  };
  const closeExpenseModal = () => { if (saving) return; setShowExpenseModal(false); setExpenseForm(EMPTY_EXPENSE); setExpenseOffBudget(false); setFormErrors({}); };

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
  const tagColor = (name) => tagPalette.find((t) => String(t.name || '').toLowerCase() === String(name).toLowerCase())?.color || '#6b7280';

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
    const PALETTE = ['#8A6606', '#6b7280', '#166534', '#9a3412', '#1e40af', '#57534e', '#0f766e', '#7c2d12'];
    try {
      for (let i = 0; i < fresh.length; i++) {
        await supabase.from('finance_tags').insert([{ name: fresh[i], color: PALETTE[(tagPalette.length + i) % PALETTE.length] }]);
      }
      fetchTagPalette();
    } catch { /* kolizja nazwy = już jest, ignoruj */ }
  };

  // Menedżer kategorii (CRUD na expense_categories, rodzaj income/expense).
  const [catForm, setCatForm] = useState({ name: '', kind: 'expense', color: '#8A6606' });
  const [vendorName, setVendorName] = useState('');
  const saveCategory = async () => {
    if (!catForm.name.trim()) { toast.error(tr('Podaj nazwę kategorii')); return; }
    try {
      const { error } = await supabase.from('expense_categories').insert([{ name: catForm.name.trim(), kind: catForm.kind, color: catForm.color, is_active: true }]);
      if (error) throw error;
      toast.success(tr('Dodano kategorię „{name}”', { name: catForm.name.trim() }));
      setCatForm({ name: '', kind: catForm.kind, color: '#8A6606' });
      fetchCategories();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
  };
  const toggleCategoryActive = async (c) => {
    try {
      const { error } = await supabase.from('expense_categories').update({ is_active: !(c.is_active !== false) }).eq('id', c.id);
      if (error) throw error;
      fetchCategories();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
  };
  const deleteCategory = async (c) => {
    if (!await confirmDialog(tr('Usunąć kategorię „{name}”? Istniejące transakcje zachowają swoją nazwę kategorii.', { name: c.name }))) return;
    try {
      const { error } = await supabase.from('expense_categories').delete().eq('id', c.id);
      if (error) throw error;
      fetchCategories();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
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
    const missing = missingFields(recurringForm, [['title', tr('nazwę')], ['amount', tr('kwotę')], ['next_run_date', tr('datę pierwszego wykonania')]]);
    if (missing.length) {
      setFormErrors(Object.fromEntries([['title', !recurringForm.title.trim()], ['amount', !recurringForm.amount], ['next_run_date', !recurringForm.next_run_date]]));
      toast.error(tr('Uzupełnij: {fields}', { fields: missing.join(', ') }));
      return;
    }
    if (recurringForm.end_date && recurringForm.end_date < recurringForm.next_run_date) { toast.error(tr('Data końca jest wcześniejsza niż pierwsze wykonanie.')); return; }
    const payload = {
      kind: recurringForm.kind, title: recurringForm.title.trim(), amount: parseFloat(recurringForm.amount),
      category: recurringForm.category || null, team_type: recurringForm.team_type || null, contractor: recurringForm.contractor || null,
      frequency: recurringForm.frequency, day_of_month: recurringForm.day_of_month ? parseInt(recurringForm.day_of_month) : null,
      next_run_date: recurringForm.next_run_date || null, end_date: recurringForm.end_date || null, is_active: recurringForm.is_active,
    };
    setSaving(true);
    try {
      const { error } = recurringForm.id
        ? await supabase.from('finance_recurring').update(payload).eq('id', recurringForm.id)
        : await supabase.from('finance_recurring').insert([payload]);
      if (error) throw error;
      toast.success(recurringForm.id ? tr('Zapisano zmiany planu') : tr('Dodano plan cykliczny'));
      setShowRecurringModal(false); setRecurringForm(emptyRecurring); setFormErrors({}); fetchRecurring();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
    finally { setSaving(false); }
  };
  const toggleRecurring = async (r) => {
    try {
      const { error } = await supabase.from('finance_recurring').update({ is_active: !r.is_active }).eq('id', r.id);
      if (error) throw error;
      fetchRecurring();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
  };
  const deleteRecurring = async (r) => {
    if (!await confirmDialog(tr('Usunąć plan cykliczny „{name}”? Nowe transakcje z tego planu przestaną powstawać.', { name: r.title }))) return;
    try {
      const { error } = await supabase.from('finance_recurring').delete().eq('id', r.id);
      if (error) throw error;
      fetchRecurring();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
  };

  // ── Kontrahenci (finance_vendors) — autouzupełnianie + auto-dopis ──────────
  const [vendors, setVendors] = useState([]);
  const fetchVendors = async () => { try { const { data } = await supabase.from('finance_vendors').select('*').order('name'); setVendors(data || []); } catch { /* brak tabeli */ } };
  useEffect(() => { fetchVendors(); }, []);
  const addVendor = async (name) => {
    const n = String(name || '').trim(); if (!n) return;
    try { const { error } = await supabase.from('finance_vendors').insert([{ name: n }]); if (error) throw error; fetchVendors(); }
    catch (e) { toast.error(humanSaveError(e, tr)); }
  };
  const deleteVendor = async (v) => {
    if (!await confirmDialog(tr('Usunąć kontrahenta „{name}” z listy podpowiedzi? Wydatki zachowają jego nazwę.', { name: v.name }))) return;
    try { const { error } = await supabase.from('finance_vendors').delete().eq('id', v.id); if (error) throw error; fetchVendors(); }
    catch (e) { toast.error(humanSaveError(e, tr)); }
  };

  // Sumy poprzedniego roku (do porównania rok-do-roku w Raportach).
  const [prevYearTotals, setPrevYearTotals] = useState({ income: 0, expense: 0 });
  useEffect(() => {
    const py = selectedYear - 1, from = `${py}-01-01`, to = `${py}-12-31`;
    (async () => {
      try {
        const [inc, exp] = await Promise.all([
          supabase.from('income_transactions').select('amount').gte('date', from).lte('date', to),
          supabase.from('expense_transactions').select('amount, status').gte('payment_date', from).lte('payment_date', to),
        ]);
        setPrevYearTotals({
          income: (inc.data || []).reduce((s, r) => s + num(r.amount), 0),
          expense: (exp.data || []).filter(isCountedExpense).reduce((s, r) => s + num(r.amount), 0),
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

  const reportReqRef = useRef(0);
  const fetchReportData = async (range) => {
    const reqId = ++reportReqRef.current;
    setReportLoading(true);
    try {
      const prev = shiftRangeYears(range, 1);
      const [inc, exp, bud, bal, pinc, pexp] = await Promise.all([
        supabase.from('income_transactions').select('*').gte('date', range.from).lte('date', range.to).order('date', { ascending: false }),
        supabase.from('expense_transactions').select('*').gte('payment_date', range.from).lte('payment_date', range.to).order('payment_date', { ascending: false }),
        withCampusFilter(supabase.from('budget_items').select('*')).eq('year', range.year).order('category'),
        supabase.from('finance_balances').select('*').eq('year', range.year).maybeSingle(),
        supabase.from('income_transactions').select('amount').gte('date', prev.from).lte('date', prev.to),
        supabase.from('expense_transactions').select('amount, status').gte('payment_date', prev.from).lte('payment_date', prev.to),
      ]);
      // Odpowiedź do starszego zakresu (szybkie przełączanie Rok → Miesiąc) nie nadpisuje nowszej.
      if (reqId !== reportReqRef.current) return;
      const failed = [inc, exp, bud].find((r) => r.error);
      if (failed) toast.error(tr('Nie udało się wczytać części danych raportu. Odśwież stronę.'));
      setReportIncome(withNumbers(inc.data));
      setReportExpense(withNumbers(exp.data));
      setReportBudget(withNumbers(bud.data, ['planned_amount']));
      const b = bal.data;
      setReportBalances(b
        ? { bank_pln: num(b.bank_pln), cash_pln: num(b.cash_pln), bank_currency: num(b.bank_currency), cash_currency: num(b.cash_currency), currency_type: b.currency_type || 'EUR' }
        : { bank_pln: 0, cash_pln: 0, bank_currency: 0, cash_currency: 0, currency_type: 'EUR' });
      setReportPrev({ income: withNumbers(pinc.data), expense: withNumbers(pexp.data) });
    } catch (e) { console.error('Error fetching report data:', e); toast.error(tr('Nie udało się wczytać raportu.')); }
    finally { if (reqId === reportReqRef.current) setReportLoading(false); }
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
  useEffect(() => {
    if (!showDownloadMenu) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setShowDownloadMenu(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showDownloadMenu]);
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
  // 1. dzień następnego okresu w czasie lokalnym (toISOString dawał ostatni dzień poprzedniego).
  const nextRunFor = (cadence) => nextPeriodStart(cadence);
  const saveSchedule = async () => {
    const recipients = scheduleForm.recipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0) { toast.error(tr('Podaj adresy e-mail')); return; }
    const payload = {
      cadence: scheduleForm.cadence, recipients, include_csv: !!scheduleForm.include_csv,
      is_active: !!scheduleForm.is_active, next_run_date: nextRunFor(scheduleForm.cadence),
    };
    setSaving(true);
    try {
      const { error } = editingScheduleId
        ? await supabase.from('finance_report_schedules').update(payload).eq('id', editingScheduleId)
        : await supabase.from('finance_report_schedules').insert([{ ...payload, created_by: currentUserEmail || null }]);
      if (error) throw error;
      setShowScheduleModal(false); setScheduleForm(emptySchedule); setEditingScheduleId(null); fetchSchedules();
      toast.success(tr('Harmonogram zapisany'));
    } catch (e) { toast.error(humanSaveError(e, tr)); }
    finally { setSaving(false); }
  };
  const toggleSchedule = async (s) => {
    try { const { error } = await supabase.from('finance_report_schedules').update({ is_active: !s.is_active }).eq('id', s.id); if (error) throw error; fetchSchedules(); }
    catch (e) { toast.error(humanSaveError(e, tr)); }
  };
  const deleteSchedule = async (id) => {
    if (!await confirmDialog(tr('Usunąć ten harmonogram? Raporty przestaną być wysyłane automatycznie.'))) return;
    try { const { error } = await supabase.from('finance_report_schedules').delete().eq('id', id); if (error) throw error; fetchSchedules(); }
    catch (e) { toast.error(humanSaveError(e, tr)); }
  };
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
    const missing = missingFields(proposalForm, [['team_type', tr('służbę')], ['description', tr('opis')], ['amount', tr('kwotę')]]);
    if (missing.length) { toast.error(tr('Uzupełnij: {fields}', { fields: missing.join(', ') })); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('budget_proposals').insert([{
        year: selectedYear, kind: proposalForm.kind, team_type: proposalForm.team_type, category: proposalForm.team_type,
        description: proposalForm.description.trim(), amount: parseFloat(proposalForm.amount), note: proposalForm.note || null,
        submitted_by: currentUserEmail || null, status: 'pending',
      }]);
      if (error) throw error;
      setShowProposalModal(false); setProposalForm(emptyProposal); fetchProposals();
      toast.success(tr('Propozycja zgłoszona'));
    } catch (e) { toast.error(humanSaveError(e, tr)); }
    finally { setSaving(false); }
  };
  const [decidingProposal, setDecidingProposal] = useState(null);
  const approveProposal = async (p) => {
    if (decidingProposal) return;
    setDecidingProposal(p.id);
    try {
      const targetYear = p.year || selectedYear;   // pozycja trafia do budżetu ROKU DOCELOWEGO propozycji
      const { data, error } = await supabase.from('budget_items').insert([{
        year: targetYear, kind: p.kind || 'expense', category: p.category || p.team_type, team_type: p.team_type || p.category,
        description: p.description, planned_amount: num(p.amount), period_type: 'year', campus_id: campusIdForInsert,
      }]).select();
      // Status zmieniamy DOPIERO po udanym dodaniu pozycji — inaczej propozycja znikała bez śladu.
      if (error) throw error;
      const { error: stErr } = await supabase.from('budget_proposals').update({ status: 'approved' }).eq('id', p.id);
      if (stErr) {
        // Cofnij pozycję, żeby przy ponownej próbie nie powstał duplikat.
        if (data?.[0]?.id) await supabase.from('budget_items').delete().eq('id', data[0].id);
        throw stErr;
      }
      await logBudgetAudit('created', { id: data?.[0]?.id, kind: p.kind, category: p.category || p.team_type, description: p.description, planned_amount: num(p.amount) });
      supabase.functions.invoke('budget-proposal-notify', { body: { proposalId: p.id, event: 'decided' } }).catch(() => {});
      fetchProposals(); fetchBudgetItems();
      toast.success(tr('Zatwierdzono do budżetu {year}', { year: targetYear }));
    } catch (e) { toast.error(humanSaveError(e, tr)); }
    finally { setDecidingProposal(null); }
  };
  const rejectProposal = async (p) => {
    if (!await confirmDialog({ title: tr('Odrzucić propozycję?'), message: tr('„{name}” nie trafi do budżetu. Zgłaszający dostanie powiadomienie.', { name: p.description }), danger: true })) return;
    setDecidingProposal(p.id);
    try {
      const { error } = await supabase.from('budget_proposals').update({ status: 'rejected' }).eq('id', p.id);
      if (error) throw error;
      supabase.functions.invoke('budget-proposal-notify', { body: { proposalId: p.id, event: 'decided' } }).catch(() => {});
      fetchProposals();
      toast.success(tr('Propozycja odrzucona'));
    } catch (e) { toast.error(humanSaveError(e, tr)); }
    finally { setDecidingProposal(null); }
  };

  // ── Status wydatku (workflow akceptacji) ──────────────────────────────────
  // Decyzje (zatwierdź / odrzuć / opłacone) tylko z action:finance:approve — serwer to egzekwuje.
  const STATUS_TOAST = { approved: 'Wydatek zatwierdzony', rejected: 'Wydatek odrzucony', paid: 'Oznaczono jako opłacony', submitted: 'Wysłano do akceptacji' };
  const setExpenseStatus = async (id, status) => {
    const patch = { status };
    if (status === 'approved') { patch.approved_by = currentUserEmail; patch.approved_at = new Date().toISOString(); }
    if (status === 'paid') { patch.is_paid = true; patch.paid_date = localDateStr(); }
    try {
      const { error } = await supabase.from('expense_transactions').update(patch).eq('id', id);
      if (error) throw error;
      toast.success(tr(STATUS_TOAST[status] || 'Zapisano'));
      fetchExpenseTransactions();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
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

  // Fetch budget items (także na Wydatkach — formularz wydatku wybiera pozycję budżetu)
  useEffect(() => {
    if (activeTab === 'budget' || activeTab === 'expenses') {
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
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching balances:', error);
        return;
      }

      if (data) {
        setAccountBalances({
          bank_pln: num(data.bank_pln),
          bank_currency: num(data.bank_currency),
          cash_pln: num(data.cash_pln),
          cash_currency: num(data.cash_currency),
          currency_type: data.currency_type || 'EUR'
        });
      }
    } catch (error) {
      console.error('Error fetching account balances:', error);
    }
  };

  const saveAccountBalances = async () => {
    setSaving(true);
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
        .maybeSingle();

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
      if (activeTab === 'reports') fetchReportData(reportRange);
    } catch (error) {
      console.error('Error saving balances:', error);
      toast.error(humanSaveError(error, tr));
    } finally { setSaving(false); }
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
      setBudgetItems(withNumbers(data, ['planned_amount', 'actual_amount']));
    } catch (error) {
      console.error('Error fetching budget items:', error);
      toast.error(tr('Nie udało się wczytać budżetu. Odśwież stronę.'));
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
      setIncomeTransactions(withNumbers(data));
    } catch (error) {
      console.error('Error fetching income transactions:', error);
      toast.error(tr('Nie udało się wczytać wpływów. Odśwież stronę.'));
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
      setExpenseTransactions(withNumbers(data));
    } catch (error) {
      console.error('Error fetching expense transactions:', error);
      toast.error(tr('Nie udało się wczytać wydatków. Odśwież stronę.'));
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
      const { error } = await supabase.from('budget_versions').insert([{ year: selectedYear, label: label.trim() || tr('Wersja {date}', { date: new Date().toLocaleDateString(appLocale()) }), snapshot: budgetItems, created_by: currentUserEmail || null }]);
      if (error) throw error;
      toast.success(tr('Zapisano wersję budżetu'));
      fetchBudgetHistory();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
  };
  // Audyt ładowany od razu — żeby oznaczenia „zmieniono" były widoczne bez otwierania Historii.
  useEffect(() => { fetchBudgetHistory(); /* eslint-disable-next-line */ }, [selectedYear, budgetItems.length]);

  const saveBudgetItem = async () => {
    const isIncome = (budgetForm.kind || 'expense') === 'income';
    const missing = missingFields(budgetForm, [['category', isIncome ? tr('kategorię wpływu') : tr('służbę')], ['planned_amount', tr('planowaną kwotę')]]);
    if (missing.length) {
      setFormErrors({ category: !budgetForm.category, planned_amount: !budgetForm.planned_amount });
      toast.error(tr('Uzupełnij: {fields}', { fields: missing.join(', ') }));
      return;
    }

    setSaving(true);
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
        // Zmiana służby lub opisu pozycji przenosi przypisane wydatki (wiązanie jest po tekście) —
        // bez tego literówka poprawiona w budżecie odpinała wszystkie wydatki i realizacja spadała do 0.
        if (before && before.kind !== 'income' && (normKey(before.category) !== normKey(budgetForm.category) || normKey(before.description) !== normKey(budgetForm.description))) {
          const linked = expenseTransactions.filter((e) => matchesBudgetItem(e, before)).map((e) => e.id);
          if (linked.length) {
            const { error: moveErr } = await supabase.from('expense_transactions')
              .update({ category: budgetForm.category, description: budgetForm.description, team_type: budgetForm.category })
              .in('id', linked);
            if (moveErr) toast.error(tr('Pozycja zapisana, ale nie udało się przenieść przypisanych wydatków.'));
          }
        }
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

      toast.success(budgetForm.id ? tr('Zapisano zmiany pozycji') : tr('Dodano pozycję {amount}', { amount: fmtMoney(budgetForm.planned_amount) }));
      setShowBudgetModal(false);
      setBudgetForm(EMPTY_BUDGET);
      setFormErrors({});
      fetchBudgetItems();
      fetchExpenseTransactions();
    } catch (error) {
      console.error('Error saving budget item:', error);
      toast.error(humanSaveError(error, tr));
    } finally { setSaving(false); }
  };

  const deleteBudgetItem = async (id) => {
    const target = budgetItems.find((b) => b.id === id);
    const label = target ? [target.category, target.description].filter(Boolean).join(' — ') : '';
    if (!await confirmDialog(tr('Usunąć pozycję budżetu „{name}”? Przypisane wydatki zostaną, ale przestaną się wliczać do jej realizacji.', { name: label }))) return;

    try {
      const before = target || null;
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
  const [copyingBudget, setCopyingBudget] = useState(false);
  const copyBudgetFromLastYear = async () => {
    if (copyingBudget) return;
    const prev = selectedYear - 1;
    setCopyingBudget(true);
    try {
      // Tylko bieżący kampus i aktualny stan roku docelowego — drugi klik nie podwaja planu.
      const [{ data: prevItems, error: prevErr }, { data: currentItems, error: curErr }] = await Promise.all([
        withCampusFilter(supabase.from('budget_items').select('*')).eq('year', prev),
        withCampusFilter(supabase.from('budget_items').select('kind, category, description')).eq('year', selectedYear),
      ]);
      if (prevErr || curErr) throw (prevErr || curErr);
      if (!prevItems || prevItems.length === 0) { toast.info(tr('Brak pozycji budżetu w roku {year}', { year: prev })); return; }
      const plan = planBudgetCopy(prevItems, currentItems);
      if (plan.toCopy.length === 0) {
        toast.info(tr('Wszystkie pozycje z roku {from} są już w budżecie {to}.', { from: prev, to: selectedYear }));
        return;
      }
      const msg = plan.skipped > 0
        ? tr('Dodać {n} pozycji z roku {from} (razem {sum}) do budżetu {to}? {skipped} pozycji już jest w budżecie i zostanie pominiętych.', { n: plan.toCopy.length, from: prev, sum: fmtMoney(plan.total), to: selectedYear, skipped: plan.skipped })
        : tr('Dodać {n} pozycji z roku {from} (razem {sum}) do budżetu {to}?', { n: plan.toCopy.length, from: prev, sum: fmtMoney(plan.total), to: selectedYear });
      if (!await confirmDialog({ title: tr('Kopiuj budżet z {year}', { year: prev }), message: msg, confirmLabel: tr('Kopiuj') })) return;
      const rows = plan.toCopy.map((it) => ({
        year: selectedYear, kind: it.kind || 'expense', category: it.category, team_type: it.team_type || it.category,
        description: it.description, planned_amount: it.planned_amount,
        period_type: it.period_type || 'year', period_value: it.period_value || null,
        campus_id: campusIdForInsert,
      }));
      const { error } = await supabase.from('budget_items').insert(rows);
      if (error) throw error;
      toast.success(tr('Skopiowano {n} pozycji z {year}', { n: rows.length, year: prev }));
      fetchBudgetItems();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
    finally { setCopyingBudget(false); }
  };

  const saveIncome = async () => {
    const missing = missingFields(incomeForm, [['date', tr('datę')], ['amount', tr('kwotę')], ['source', tr('źródło')]]);
    if (missing.length) {
      setFormErrors({ date: !incomeForm.date, amount: !incomeForm.amount, source: !String(incomeForm.source || '').trim() });
      toast.error(tr('Uzupełnij: {fields}', { fields: missing.join(', ') }));
      return;
    }

    setSaving(true);
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

      toast.success(incomeForm.id ? tr('Zapisano zmiany wpływu') : tr('Dodano wpływ {amount}', { amount: fmtMoney(incomeForm.amount) }));
      setShowIncomeModal(false);
      const tags = incomeForm.tags;
      setIncomeForm(EMPTY_INCOME);
      setFormErrors({});
      fetchIncomeTransactions();
      ensureTagsInPalette(tags);
    } catch (error) {
      console.error('Error saving income:', error);
      toast.error(humanSaveError(error, tr));
    } finally { setSaving(false); }
  };

  const deleteIncome = async (id) => {
    const tx = incomeTransactions.find((i) => i.id === id);
    if (!await confirmDialog(tr('Usunąć wpływ „{name}” ({amount}) z {date}? Tego nie da się cofnąć.', { name: tx?.source || tx?.type || '', amount: fmtMoney(tx?.amount), date: fmtDate(tx?.date) }))) return;

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
    // Wymagane: data, kwota, służba i opis (z budżetu albo własny — „poza budżetem”).
    const missing = missingFields(expenseForm, [
      ['payment_date', tr('datę dokumentu')], ['amount', tr('kwotę')], ['category', tr('służbę')],
      ['description', expenseOffBudget ? tr('opis wydatku') : tr('pozycję budżetu')],
    ]);
    if (missing.length) {
      setFormErrors({ payment_date: !expenseForm.payment_date, amount: !expenseForm.amount, category: !expenseForm.category, description: !String(expenseForm.description || '').trim() });
      toast.error(tr('Uzupełnij: {fields}', { fields: missing.join(', ') }));
      return;
    }

    const base = {
      payment_date: expenseForm.payment_date,
      amount: parseFloat(expenseForm.amount),
      contractor: String(expenseForm.contractor || '').trim() || null,
      category: expenseForm.category,
      team_type: expenseForm.category,
      cost_category: expenseForm.cost_category || null,
      description: String(expenseForm.description || '').trim(),
      detailed_description: expenseForm.detailed_description,
      responsible_person: String(expenseForm.responsible_person || '').trim() || null,
      invoice_number: expenseForm.invoice_number || null,
      due_date: expenseForm.due_date || null,
      documents: expenseForm.documents,
      tags: expenseForm.tags,
    };

    setSaving(true);
    try {
      if (expenseForm.id) {
        // Bez prawa zatwierdzania nie wysyłamy pól decyzji (is_paid/status) — serwer odrzuciłby zapis.
        const patch = canApprove ? { ...base, is_paid: expenseForm.is_paid !== false } : base;
        const { error } = await supabase.from('expense_transactions').update(patch).eq('id', expenseForm.id);
        if (error) throw error;
      } else {
        // Osoba bez action:finance:approve składa WNIOSEK (status 'submitted', nieopłacony) —
        // zatwierdza go i oznacza jako opłacony ktoś z uprawnieniem.
        const asRequest = !canApprove || !!expenseForm.submit_for_approval;
        const { error } = await supabase.from('expense_transactions').insert([{
          ...base,
          is_paid: asRequest ? false : expenseForm.is_paid !== false,
          status: asRequest ? 'submitted' : 'approved',
          submitted_by: asRequest ? (currentUserEmail || null) : null,
        }]);
        if (error) throw error;
      }

      const asRequestMsg = !expenseForm.id && (!canApprove || expenseForm.submit_for_approval);
      toast.success(expenseForm.id
        ? tr('Zapisano zmiany wydatku')
        : asRequestMsg
          ? tr('Wniosek {amount} wysłany do akceptacji', { amount: fmtMoney(expenseForm.amount) })
          : tr('Dodano wydatek {amount}', { amount: fmtMoney(expenseForm.amount) }));
      const { tags, contractor } = expenseForm;
      setShowExpenseModal(false);
      setExpenseForm(EMPTY_EXPENSE);
      setExpenseOffBudget(false);
      setFormErrors({});
      fetchExpenseTransactions();
      ensureTagsInPalette(tags);
      ensureVendor(contractor);
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error(humanSaveError(error, tr));
    } finally { setSaving(false); }
  };

  const deleteExpense = async (id) => {
    const tx = expenseTransactions.find((e) => e.id === id);
    if (!await confirmDialog(tr('Usunąć wydatek „{name}” ({amount})? Tego nie da się cofnąć.', { name: tx?.description || tx?.contractor || '', amount: fmtMoney(tx?.amount) }))) return;

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

  // Realizacja pozycji = zatwierdzone/opłacone wydatki tej służby z tym opisem (bez wielkości liter/spacji).
  const calculateRealization = (category, description) => realizationFor({ category, description }, expenseTransactions);

  const getProgressBarColor = (percentage) => {
    if (percentage < 80) return 'from-green-500 to-green-600';
    if (percentage <= 100) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  // Filtrowanie wpływów
  const filteredIncomeTransactions = incomeTransactions.filter(transaction => {
    if (incomeFilters.type && transaction.type !== incomeFilters.type) return false;
    if (incomeFilters.source && !String(transaction.source || '').toLowerCase().includes(incomeFilters.source.toLowerCase())) return false;
    if (incomeFilters.tag && (!transaction.tags || !transaction.tags.includes(incomeFilters.tag))) return false;
    if (incomeFilters.dateFrom && transaction.date < incomeFilters.dateFrom) return false;
    if (incomeFilters.dateTo && transaction.date > incomeFilters.dateTo) return false;
    return true;
  });

  // Filtrowanie wydatków
  const filteredExpenseTransactions = expenseTransactions.filter(transaction => {
    if (expenseFilters.category && transaction.category !== expenseFilters.category) return false;
    if (expenseFilters.cost_category && transaction.cost_category !== expenseFilters.cost_category) return false;
    if (expenseFilters.contractor && !String(transaction.contractor || '').toLowerCase().includes(expenseFilters.contractor.toLowerCase())) return false;
    if (expenseFilters.responsible && !String(transaction.responsible_person || '').toLowerCase().includes(expenseFilters.responsible.toLowerCase())) return false;
    if (expenseFilters.tag && (!transaction.tags || !transaction.tags.includes(expenseFilters.tag))) return false;
    if (expenseFilters.dateFrom && transaction.payment_date < expenseFilters.dateFrom) return false;
    if (expenseFilters.dateTo && transaction.payment_date > expenseFilters.dateTo) return false;
    return true;
  });

  // Pobierz unikalne wartości dla filtrów
  // Wydatki z planów cyklicznych i z mobilki mogą nie mieć kontrahenta/osoby — puste pomijamy.
  const uniqueIncomeSources = [...new Set(incomeTransactions.map(t => t.source).filter(Boolean))];
  const uniqueIncomeTags = [...new Set(incomeTransactions.flatMap(t => t.tags || []).filter(Boolean))];
  const uniqueExpenseContractors = [...new Set(expenseTransactions.map(t => t.contractor).filter(Boolean))];
  const uniqueExpenseResponsible = [...new Set(expenseTransactions.map(t => t.responsible_person).filter(Boolean))];
  const uniqueExpenseTags = [...new Set(expenseTransactions.flatMap(t => t.tags || []).filter(Boolean))];
  const incomeTypeOptions = [...new Set([
    ...(incomeCategories.length ? incomeCategories.map((c) => c.name) : ['Kolekta', 'Darowizny', 'Inne']),
    ...incomeTransactions.map((t) => t.type).filter(Boolean),
  ])];
  const pendingExpenses = expenseTransactions.filter(isPendingExpense);

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);

  // Kategorie (służby) do wydatku: najpierw te z budżetu, potem pozostałe służby — wydatek
  // da się zapisać także bez pozycji budżetowej („poza budżetem”).
  const budgetCategories = [...new Set(budgetItems.filter((i) => i.kind !== 'income').map(item => item.category).filter(Boolean))].map(cat => ({ value: cat, label: cat }));
  const expenseCategoryOptions = [
    ...budgetCategories,
    ...serviceOptions.filter((o) => !budgetCategories.some((b) => b.value === o.value)),
    ...(expenseForm.category && !budgetCategories.some((b) => b.value === expenseForm.category) && !serviceOptions.some((o) => o.value === expenseForm.category)
      ? [{ value: expenseForm.category, label: expenseForm.category }] : []),
  ];
  const budgetDescriptionsFor = (category) => budgetItems
    .filter((item) => item.kind !== 'income' && normKey(item.category) === normKey(category) && item.description)
    .map((item) => ({ value: item.description, label: `${item.description} · ${fmtMoney(item.planned_amount)}` }));

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
      <PageHeader moduleKey="finance" icon={DollarSign} title={tr('Finanse')} subtitle={t('Zarządzanie budżetem i finansami kościoła')}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 dark:bg-gray-900/80 text-gray-700 dark:text-gray-200 text-sm font-medium shadow-sm hover:bg-white dark:hover:bg-gray-900 backdrop-blur-sm shrink-0"
              title={tr('Zarządzaj kategoriami')}
              aria-label={tr('Zarządzaj kategoriami')}
            >
              <Tag size={15} /> <span className="hidden sm:inline">{tr('Kategorie')}</span>
            </button>
            {/* Raporty mają własny wybór okresu — rok modułu ukrywamy, żeby nie było dwóch selektorów. */}
            {activeTab !== 'reports' && (
              <CustomSelect
                value={selectedYear}
                onChange={(val) => setSelectedYear(parseInt(val))}
                options={years.map(y => ({ value: y, label: y.toString() }))}
              />
            )}
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
              {tr('Budżet')} {selectedYear}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value)} aria-label={tr('Okres pozycji')} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                <option value="all">{tr('Wszystkie okresy')}</option>
                <option value="year">{tr('Roczny')}</option>
                <option value="quarter">{tr('Kwartalny')}</option>
                <option value="month">{tr('Miesięczny')}</option>
              </select>
              <button
                onClick={() => { fetchBudgetHistory(); setShowBudgetHistory(true); }}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Historia zmian i wersje')}
                aria-label={tr('Historia zmian i wersje')}
              >
                <Clock size={16} /> <span className="hidden sm:inline">{tr('Historia')}</span>
              </button>
              <button
                onClick={saveBudgetVersion}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Zapisz migawkę bieżącego budżetu')}
                aria-label={tr('Zapisz wersję')}
              >
                <Copy size={16} /> <span className="hidden sm:inline">{tr('Zapisz wersję')}</span>
              </button>
              <button
                onClick={copyBudgetFromLastYear}
                disabled={copyingBudget}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm disabled:opacity-60"
                title={tr('Kopiuj z zeszłego roku')}
                aria-label={tr('Kopiuj z {year}', { year: selectedYear - 1 })}
              >
                {copyingBudget ? <Spinner size={14} /> : <Copy size={16} />} <span className="hidden sm:inline">{tr('Kopiuj z {year}', { year: selectedYear - 1 })}</span>
              </button>
              <button
                onClick={() => exportToCsv(`budzet-${selectedYear}.csv`, budgetItems, [
                  { label: 'Służba', value: 'category' }, { label: 'Opis', value: 'description' },
                  { label: 'Rodzaj', value: (r) => (r.kind === 'income' ? 'przychód' : 'wydatek') },
                  { label: 'Okres', value: (r) => ({ year: 'roczny', quarter: 'kwartalny', month: 'miesięczny' }[r.period_type || 'year'] || r.period_type) },
                  { label: 'Plan', value: (r) => num(r.planned_amount) },
                  { label: 'Realizacja', value: (r) => (r.kind === 'income' ? calculateIncomeRealization(r.category) : calculateRealization(r.category, r.description)) },
                ])}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Eksport CSV')}
                aria-label={tr('Eksport CSV')}
              >
                <Download size={16} /> CSV
              </button>
              <button
                onClick={openCreateBudget}
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
              <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">{tr('Planowane przychody')}</div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">{fmtMoney(totalPlannedIncome)}</div>
            </div>
            <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 p-4">
              <div className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase">{tr('Planowane wydatki')}</div>
              <div className="text-xl sm:text-2xl font-bold text-red-700 dark:text-red-300 tabular-nums">{fmtMoney(totalPlannedExpense)}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-4">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{tr('Planowany bilans')}</div>
              <div className={`text-xl sm:text-2xl font-bold tabular-nums ${totalPlannedIncome - totalPlannedExpense >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>{fmtMoney(totalPlannedIncome - totalPlannedExpense)}</div>
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
                    <TH align="right">{tr('Plan (zł)')}</TH>
                    <TH align="right">{tr('Realizacja (zł)')}</TH>
                    <TH align="center">{tr('% Realizacji')}</TH>
                    <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
                  </tr>
                </THead>
                <tbody>
                  {incomeBudgetItems.map((it) => {
                    const planned = num(it.planned_amount);
                    const real = calculateIncomeRealization(it.category);
                    const pct = planned > 0 ? (real / planned) * 100 : 0;
                    return (
                      <TR key={it.id}>
                        <TD className="font-semibold text-gray-900 dark:text-white">{it.category}</TD>
                        <TD muted>{it.description}</TD>
                        <TD align="right" numeric className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 justify-end">
                            {fmtMoney(planned)}
                            {itemChanges(it.id).length > 0 && (
                              <button onClick={() => setChangeItem(itemChanges(it.id))} title={tr('Kwota zmieniona — pokaż historię')} aria-label={tr('Kwota zmieniona — pokaż historię')} className="text-amber-700 hover:text-amber-800 dark:text-amber-400"><Clock size={13} /></button>
                            )}
                          </span>
                        </TD>
                        <TD align="right" numeric className="text-emerald-700 dark:text-emerald-400 font-medium whitespace-nowrap">{fmtMoney(real)}</TD>
                        <TD align="center" numeric>{fmtPct(pct, 0)}</TD>
                        <TD align="right" className="whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button onClick={() => openEditBudget(it)} className="p-2 text-gray-500 hover:text-accent-primary hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg" title={tr('Edytuj')} aria-label={tr('Edytuj pozycję {name}', { name: it.category })}><Edit2 size={16} /></button>
                            <button onClick={() => deleteBudgetItem(it.id)} className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg" title={tr('Usuń')} aria-label={tr('Usuń pozycję {name}', { name: it.category })}><Trash2 size={16} /></button>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                  <TR className="bg-gray-50/70 dark:bg-gray-800/40 font-semibold">
                    <TD className="text-gray-900 dark:text-white" colSpan={2}>{tr('Suma przychodów')}</TD>
                    <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(totalPlannedIncome)}</TD>
                    <TD align="right" numeric className="text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{fmtMoney(incomeBudgetItems.reduce((s, it) => s + calculateIncomeRealization(it.category), 0))}</TD>
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
                    <li key={it.id}>{it.category} — {it.description}: {tr('plan')} {fmtMoney(it.planned_amount)}, {tr('wydano')} {fmtMoney(calculateRealization(it.category, it.description))}</li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {loading ? (
            <Spinner center />
          ) : budgetItems.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title={tr('Brak pozycji budżetowych na rok {year}', { year: selectedYear })}
              subtitle={tr('Dodaj pierwszą pozycję albo skopiuj plan z poprzedniego roku.')}
              action={<Button onClick={openCreateBudget}><Plus size={16} /> {tr('Dodaj pozycję budżetową')}</Button>}
            />
          ) : expenseBudgetItems.length === 0 ? null : (
            <>
            {/* Telefon: karty zamiast szerokiej tabeli — plan, wydano i pozostało zawsze na ekranie. */}
            <div className="sm:hidden space-y-2">
              <div className="text-sm font-bold text-red-700 dark:text-red-300 flex items-center gap-2 px-1"><ArrowDownRight size={16} /> {tr('Planowane wydatki')}</div>
              {expenseBudgetItems.map((item) => {
                const planned = num(item.planned_amount);
                const realization = calculateRealization(item.category, item.description);
                const pct = planned > 0 ? (realization / planned) * 100 : 0;
                const remaining = planned - realization;
                return (
                  <div key={item.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.category}</div>
                        {item.description && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.description}</div>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEditBudget(item)} className="p-2 text-gray-500 dark:text-gray-400 rounded-lg" aria-label={tr('Edytuj pozycję {name}', { name: item.category })}><Edit2 size={16} /></button>
                        <button onClick={() => deleteBudgetItem(item.id)} className="p-2 text-red-600 dark:text-red-400 rounded-lg" aria-label={tr('Usuń pozycję {name}', { name: item.category })}><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                      <div><div className="text-gray-500 dark:text-gray-400">{tr('Plan')}</div><div className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(planned)}</div></div>
                      <div><div className="text-gray-500 dark:text-gray-400">{tr('Wydano')}</div><div className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(realization)}</div></div>
                      <div className="text-right"><div className="text-gray-500 dark:text-gray-400">{t('Pozostało')}</div><div className={`font-semibold tabular-nums ${remaining >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{fmtMoney(remaining)}</div></div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className={`h-2 rounded-full bg-gradient-to-r ${getProgressBarColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                      <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">{fmtPct(pct)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:block rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/10 text-sm font-bold text-red-700 dark:text-red-300 flex items-center gap-2"><ArrowDownRight size={16} /> {tr('Planowane wydatki')}</div>
              <DataTable flush>
                <THead>
                  <tr>
                    <TH>{t('Służba')}</TH>
                    <TH>{t('Opis kosztu')}</TH>
                    <TH align="right">{tr('Plan (zł)')}</TH>
                    <TH align="right">{tr('Realizacja (zł)')}</TH>
                    <TH align="center">{tr('% Realizacji')}</TH>
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
                        const planned = num(item.planned_amount);
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
                                {fmtMoney(planned)}
                                {itemChanges(item.id).length > 0 && (
                                  <button onClick={() => setChangeItem(itemChanges(item.id))} title={tr('Kwota zmieniona — pokaż historię')} aria-label={tr('Kwota zmieniona — pokaż historię')} className="text-amber-700 hover:text-amber-800 dark:text-amber-400">
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
                              {fmtMoney(realization)}
                              {expandedBudgetItems[`${item.id}`] ?
                                <ChevronUp size={16} className="inline ml-1" /> :
                                <ChevronDown size={16} className="inline ml-1" />
                              }
                            </TD>
                            <TD>
                              <div className="space-y-2">
                                <div className="text-center font-semibold tabular-nums text-gray-900 dark:text-white">
                                  {fmtPct(percentage)}
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                  <div
                                    className={`h-2.5 rounded-full bg-gradient-to-r ${getProgressBarColor(percentage)} transition-all`}
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </TD>
                            <TD align="right" numeric className={`font-semibold whitespace-nowrap ${remaining >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                              {fmtMoney(remaining)}
                            </TD>
                            <TD align="center">
                              <div className="flex justify-center gap-1 opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditBudget(item)}
                                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                                  title={tr('Edytuj')}
                                  aria-label={tr('Edytuj pozycję {name}', { name: item.description || item.category })}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => deleteBudgetItem(item.id)}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                  title={tr('Usuń')}
                                  aria-label={tr('Usuń pozycję {name}', { name: item.description || item.category })}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </TD>
                          </TR>
                        );

                        // Add expandable expense list row
                        if (expandedBudgetItems[`${item.id}`]) {
                          const categoryExpenses = expenseTransactions.filter((exp) => matchesBudgetItem(exp, item));

                          rows.push(
                            <TR key={`expenses-${item.id}`} className="bg-gray-50/70 dark:bg-gray-800/40">
                              <TD colSpan={7}>
                                {categoryExpenses.length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                      {tr('Wydatki:')} {item.category} - {item.description}
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
                                              {fmtDate(expense.payment_date)}
                                            </span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Kontrahent')}</span>
                                            <span className="text-gray-900 dark:text-white">{expense.contractor}</span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Kwota')}</span>
                                            <span className="font-bold text-gray-900 dark:text-white">
                                              {fmtMoney(expense.amount)}
                                            </span>
                                            {!isCountedExpense(expense) && (
                                              <span className="text-[11px] text-gray-500 dark:text-gray-400">{tr((EXPENSE_STATUS[expense.status] || {}).label || expense.status)} · {tr('nie wliczony')}</span>
                                            )}
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
                                        {tr('Suma:')} {fmtMoney(categoryExpenses.filter(isCountedExpense).reduce((sum, exp) => sum + num(exp.amount), 0))}
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
                            {tr('Podsumowanie:')} {category}
                          </TD>
                          <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">
                            {fmtMoney(categoryTotalPlanned)}
                          </TD>
                          <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">
                            {fmtMoney(categoryTotalRealization)}
                          </TD>
                          <TD align="center" numeric className="text-gray-900 dark:text-white">
                            {fmtPct(categoryPercentage)}
                          </TD>
                          <TD align="right" numeric className={`whitespace-nowrap ${categoryTotalRemaining >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                            {fmtMoney(categoryTotalRemaining)}
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
                          {fmtMoney(grandTotalPlanned)}
                        </TD>
                        <TD align="right" numeric className="text-gray-900 dark:text-white whitespace-nowrap">
                          {fmtMoney(grandTotalRealization)}
                        </TD>
                        <TD align="center" numeric className="text-gray-900 dark:text-white">
                          {fmtPct(grandPercentage)}
                        </TD>
                        <TD align="right" numeric className={`whitespace-nowrap ${grandTotalRemaining >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                          {fmtMoney(grandTotalRemaining)}
                        </TD>
                        <TD />
                      </TR>
                    );

                    return rows;
                  })()}
                </tbody>
              </DataTable>
            </div>
            </>
          )}

          {/* Propozycje budżetu od służb */}
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><FileText size={18} /> {tr('Propozycje do budżetu')}</h3>
            </div>
            {proposals.filter((p) => p.status === 'pending').length === 0 ? (
              <EmptyState icon={FileText} title={tr('Brak oczekujących propozycji. Liderzy służb zgłaszają je z zakładki Finanse w swoim module.')} compact />
            ) : (
              <div className="space-y-2">
                {proposals.filter((p) => p.status === 'pending').map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${p.kind === 'income' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>{p.kind === 'income' ? tr('Przychód') : tr('Wydatek')}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">{p.team_type} — {p.description} <span className="text-xs font-normal text-gray-400">({tr('budżet')} {p.year})</span></div>
                      <div className="text-xs text-gray-400 truncate">{p.note ? `${p.note} · ` : ''}{tr('zgłosił')}: {p.submitted_by || '—'}</div>
                    </div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 shrink-0 tabular-nums">{fmtMoney(p.amount)}</div>
                    {canApprove && (
                      <>
                        <button onClick={() => approveProposal(p)} disabled={!!decidingProposal} className="p-2 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg shrink-0 disabled:opacity-50" title={tr('Zatwierdź do budżetu')} aria-label={tr('Zatwierdź do budżetu: {name}', { name: p.description })}>{decidingProposal === p.id ? <Spinner size={16} /> : <CheckCircle size={16} />}</button>
                        <button onClick={() => rejectProposal(p)} disabled={!!decidingProposal} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0 disabled:opacity-50" title={tr('Odrzuć')} aria-label={tr('Odrzuć propozycję: {name}', { name: p.description })}><XCircle size={16} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'income' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {tr('Wpływy')} {selectedYear}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToCsv(`wplywy-${selectedYear}.csv`, filteredIncomeTransactions, [
                  { label: 'Data', value: 'date' }, { label: 'Typ', value: 'type' }, { label: 'Źródło', value: 'source' },
                  { label: 'Kwota', value: (r) => num(r.amount) }, { label: 'Notatka', value: 'notes' },
                  { label: 'Tagi', value: (r) => (r.tags || []).join(', ') },
                ])}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Eksport CSV')}
                aria-label={tr('Eksport CSV')}
              >
                <Download size={16} /> CSV
              </button>
              <button
                data-tour="fin-income-add"
                onClick={openCreateIncome}
                className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
              >
                <Plus size={18} />
                {tr('Dodaj wpływ')}
              </button>
            </div>
          </div>

          {/* Darowizny z Hojności to osobna księga — mówimy o tym wprost, żeby nie liczyć ich dwa razy. */}
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
            <Banknote size={16} className="shrink-0 mt-0.5 text-gray-400" />
            <span>
              {tr('Darowizny online i zapisane w module Hojność nie pojawiają się tu automatycznie.')}{' '}
              {can('module:giving') && <Link to="/giving" className="font-semibold text-gray-900 dark:text-white underline underline-offset-2">{tr('Zobacz Hojność')}</Link>}
              {' · '}{tr('Wpisz je tutaj jako wpływ typu „Darowizny”, jeśli mają wejść do bilansu.')}
            </span>
          </p>

          {/* Filtry wpływów (tylko gdy jest co filtrować) */}
          {incomeTransactions.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase">{t('Filtry')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <CustomSelect
                label={tr('Typ')}
                value={incomeFilters.type}
                onChange={(val) => setIncomeFilters({...incomeFilters, type: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...incomeTypeOptions.map((v) => ({ value: v, label: tr(v) })),
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
                label={tr('Tag')}
                value={incomeFilters.tag}
                onChange={(val) => setIncomeFilters({...incomeFilters, tag: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...uniqueIncomeTags.map(t => ({ value: t, label: t }))
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomDatePicker
                label={tr('Data od')}
                value={incomeFilters.dateFrom}
                onChange={(val) => setIncomeFilters({...incomeFilters, dateFrom: val})}
              />
              <CustomDatePicker
                label={tr('Data do')}
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
          )}

          {loading ? (
            <Spinner center />
          ) : filteredIncomeTransactions.length === 0 ? (
            incomeTransactions.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title={tr('Brak wpływów na rok {year}', { year: selectedYear })}
                subtitle={tr('Zapisz kolektę, darowiznę lub inny wpływ.')}
                action={<Button onClick={openCreateIncome}><Plus size={16} /> {tr('Dodaj pierwszy wpływ')}</Button>}
              />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title={tr('Brak wpływów pasujących do filtrów')}
                action={<Button variant="secondary" onClick={() => setIncomeFilters({ type: '', source: '', tag: '', dateFrom: '', dateTo: '' })}>{tr('Wyczyść filtry')}</Button>}
              />
            )
          ) : (
            <DataTable>
                <THead>
                  <tr>
                    <TH>{tr('Data')}</TH>
                    <TH>{tr('Typ')}</TH>
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
                        {fmtDate(transaction.date)}
                      </TD>
                      <TD>
                        <StatusPill color={STATUS_COLORS.neutral}>
                          {tr(transaction.type || 'Inne')}
                        </StatusPill>
                      </TD>
                      <TD>
                        {transaction.source}
                      </TD>
                      <TD align="right" numeric className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                        {fmtMoney(transaction.amount)}
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
                        <div className="flex justify-center gap-1 opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditIncome(transaction)}
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                            title={tr('Edytuj')}
                            aria-label={tr('Edytuj wpływ {name}', { name: transaction.source || '' })}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteIncome(transaction.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                            title={tr('Usuń')}
                            aria-label={tr('Usuń wpływ {name}', { name: transaction.source || '' })}
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
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {tr('Wydatki')} {selectedYear}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToCsv(`wydatki-${selectedYear}.csv`, filteredExpenseTransactions, [
                  { label: 'Data', value: 'payment_date' }, { label: 'Kategoria', value: 'category' },
                  { label: 'Kategoria kosztu', value: 'cost_category' }, { label: 'Opis', value: 'description' },
                  { label: 'Kontrahent', value: 'contractor' }, { label: 'Kwota', value: (r) => num(r.amount) },
                  { label: 'Status', value: (r) => (EXPENSE_STATUS[r.status || 'approved'] || {}).label || r.status }, { label: 'Nr faktury', value: 'invoice_number' },
                  { label: 'Termin', value: 'due_date' }, { label: 'Opłacone', value: (r) => (r.is_paid === false ? 'nie' : 'tak') },
                  { label: 'Odpowiedzialny', value: 'responsible_person' },
                  { label: 'Tagi', value: (r) => (r.tags || []).join(', ') },
                ])}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
                title={tr('Eksport CSV')}
                aria-label={tr('Eksport CSV')}
              >
                <Download size={16} /> CSV
              </button>
              <button
                onClick={openCreateExpense}
                className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
              >
                <Plus size={18} />
                {canApprove ? tr('Dodaj wydatek') : tr('Zgłoś wydatek')}
              </button>
            </div>
          </div>

          {/* Podsumowanie: wliczone do bilansu vs czekające na decyzję */}
          {expenseTransactions.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
              <span>{tr('Wliczone do bilansu')}: <b className="text-gray-900 dark:text-white tabular-nums">{fmtMoney(expenseTransactions.filter(isCountedExpense).reduce((s2, e) => s2 + num(e.amount), 0))}</b></span>
              {pendingExpenses.length > 0 && (
                <span>{tr('Czeka na akceptację')}: <b className="text-amber-800 dark:text-amber-300 tabular-nums">{fmtMoney(pendingExpenses.reduce((s2, e) => s2 + num(e.amount), 0))}</b> ({pendingExpenses.length})</span>
              )}
            </div>
          )}

          {/* Filtry wydatków (tylko gdy jest co filtrować) */}
          {expenseTransactions.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase">{t('Filtry')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              <CustomSelect
                label={tr('Służba')}
                value={expenseFilters.category}
                onChange={(val) => setExpenseFilters({...expenseFilters, category: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...[...new Set(expenseTransactions.map((e) => e.category).filter(Boolean))].map((c) => ({ value: c, label: c })),
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label={tr('Rodzaj kosztu')}
                value={expenseFilters.cost_category}
                onChange={(val) => setExpenseFilters({...expenseFilters, cost_category: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...expenseCategories.map((c) => ({ value: c.name, label: c.name })),
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label={tr('Kontrahent')}
                value={expenseFilters.contractor}
                onChange={(val) => setExpenseFilters({...expenseFilters, contractor: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...uniqueExpenseContractors.map(c => ({ value: c, label: c }))
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label={tr('Osoba odpowiedzialna')}
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
                label={tr('Tag')}
                value={expenseFilters.tag}
                onChange={(val) => setExpenseFilters({...expenseFilters, tag: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...uniqueExpenseTags.map(t => ({ value: t, label: t }))
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomDatePicker
                label={tr('Data od')}
                value={expenseFilters.dateFrom}
                onChange={(val) => setExpenseFilters({...expenseFilters, dateFrom: val})}
              />
              <CustomDatePicker
                label={tr('Data do')}
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
          )}

          {loading ? (
            <Spinner center />
          ) : filteredExpenseTransactions.length === 0 ? (
            expenseTransactions.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={tr('Brak wydatków na rok {year}', { year: selectedYear })}
                subtitle={canApprove ? tr('Zapisz fakturę, rachunek lub inny koszt.') : tr('Zgłoś wydatek lub wniosek o zwrot — trafi do akceptacji.')}
                action={<Button onClick={openCreateExpense}><Plus size={16} /> {canApprove ? tr('Dodaj pierwszy wydatek') : tr('Zgłoś wydatek')}</Button>}
              />
            ) : (
              <EmptyState
                icon={Receipt}
                title={tr('Brak wydatków pasujących do filtrów')}
                action={<Button variant="secondary" onClick={() => setExpenseFilters({ category: '', cost_category: '', contractor: '', responsible: '', tag: '', dateFrom: '', dateTo: '' })}>{tr('Wyczyść filtry')}</Button>}
              />
            )
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
                        {fmtDate(transaction.payment_date)}
                      </TD>
                      <TD>
                        <div className="flex flex-col items-start gap-1">
                          {transaction.category && (
                            <StatusPill color={STATUS_COLORS.neutral}>
                              {transaction.category}
                            </StatusPill>
                          )}
                          {transaction.cost_category && (() => {
                            const cc = expenseCategories.find((c) => c.name === transaction.cost_category);
                            const col = cc?.color || STATUS_COLORS.neutral;
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
                        <div className={`font-semibold whitespace-nowrap ${isCountedExpense(transaction) ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`} title={isCountedExpense(transaction) ? undefined : tr('Nie wliczony do sum, dopóki nie zostanie zatwierdzony')}>{fmtMoney(transaction.amount)}</div>
                        <div className="flex flex-col items-end gap-1 mt-1">
                          {transaction.status && transaction.status !== 'approved' && (
                            <StatusPill color={(EXPENSE_STATUS[transaction.status] || EXPENSE_STATUS.approved).color}>
                              {tr((EXPENSE_STATUS[transaction.status] || {}).label || transaction.status)}
                            </StatusPill>
                          )}
                          {transaction.is_paid === false && (
                            <StatusPill color={STATUS_COLORS.warning}>
                              {tr('Do zapłaty')}{transaction.due_date ? ` · ${fmtDate(transaction.due_date)}` : ''}
                            </StatusPill>
                          )}
                          {transaction.invoice_number && (
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">{tr('FV')} {transaction.invoice_number}</span>
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
                                className="text-xs text-gray-700 dark:text-gray-200 underline underline-offset-2 hover:text-accent-primary flex items-center gap-1 justify-center"
                              >
                                <FileText size={12} />
                                {doc.name}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </TD>
                      <TD align="center">
                        <div className="flex justify-center gap-1 flex-wrap opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                          {canApprove && transaction.status === 'submitted' && (
                            <>
                              <button onClick={() => setExpenseStatus(transaction.id, 'approved')} className="p-2 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition" title={tr('Zatwierdź')} aria-label={tr('Zatwierdź wydatek {name}', { name: transaction.description || '' })}><CheckCircle size={16} /></button>
                              <button onClick={() => setExpenseStatus(transaction.id, 'rejected')} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title={tr('Odrzuć')} aria-label={tr('Odrzuć wydatek {name}', { name: transaction.description || '' })}><XCircle size={16} /></button>
                            </>
                          )}
                          {transaction.status === 'draft' && (
                            <button onClick={() => setExpenseStatus(transaction.id, 'submitted')} className="p-2 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition" title={tr('Wyślij do akceptacji')} aria-label={tr('Wyślij do akceptacji')}><Clock size={16} /></button>
                          )}
                          {canApprove && transaction.is_paid === false && (transaction.status === 'approved' || transaction.status === 'paid') && (
                            <button onClick={() => setExpenseStatus(transaction.id, 'paid')} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition" title={tr('Oznacz jako opłacone')} aria-label={tr('Oznacz jako opłacone')}><Banknote size={16} /></button>
                          )}
                          <button
                            onClick={() => openEditExpense(transaction)}
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                            title={tr('Edytuj')}
                            aria-label={tr('Edytuj wydatek {name}', { name: transaction.description || '' })}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteExpense(transaction.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                            title={tr('Usuń')}
                            aria-label={tr('Usuń wydatek {name}', { name: transaction.description || '' })}
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
              onClick={() => { setRecurringForm({ ...emptyRecurring, next_run_date: localDateStr() }); setFormErrors({}); setShowRecurringModal(true); }}
              className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
            >
              <Plus size={18} /> {tr('Nowy plan')}
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{tr('Automatycznie generowane wpływy i wydatki (np. czynsz, pensje, stałe kolekty). Codziennie rano system tworzy należne pozycje.')}</p>

          {recurringItems.length === 0 ? (
            <EmptyState icon={Repeat} title={tr('Brak planów cyklicznych')} subtitle={tr('Dodaj pierwszy plan, aby automatyzować powtarzalne transakcje.')}
              action={<Button onClick={() => { setRecurringForm({ ...emptyRecurring, next_run_date: localDateStr() }); setFormErrors({}); setShowRecurringModal(true); }}><Plus size={16} /> {tr('Nowy plan')}</Button>} />
          ) : (
            <div className="space-y-2">
              {recurringItems.map((r) => {
                const FREQ = { weekly: tr('co tydzień'), biweekly: tr('co 2 tygodnie'), monthly: tr('co miesiąc'), quarterly: tr('co kwartał'), yearly: tr('co rok') };
                return (
                  <div key={r.id} className={`flex items-center gap-3 p-4 rounded-2xl border ${r.is_active ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.kind === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                      {r.kind === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{r.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {FREQ[r.frequency] || r.frequency}
                        {r.category ? ` · ${r.category}` : ''}
                        {r.next_run_date ? ` · ${tr('następna')}: ${fmtDate(r.next_run_date)}` : ''}
                      </div>
                      {r.is_active && !r.next_run_date && (
                        <div className="text-xs font-medium text-amber-800 dark:text-amber-300 mt-0.5 flex items-center gap-1">
                          <AlertTriangle size={12} /> {tr('Brak daty wykonania — plan się nie uruchomi. Edytuj i ustaw datę.')}
                        </div>
                      )}
                    </div>
                    <div className={`font-bold shrink-0 tabular-nums ${r.kind === 'income' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                      {r.kind === 'income' ? '+' : '−'}{fmtMoney(r.amount)}
                    </div>
                    <button onClick={() => toggleRecurring(r)} className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shrink-0">
                      {r.is_active ? tr('Wstrzymaj') : tr('Wznów')}
                    </button>
                    <button onClick={() => { setRecurringForm({ ...emptyRecurring, ...r, amount: String(num(r.amount)), title: r.title || '', category: r.category || '', team_type: r.team_type || '', contractor: r.contractor || '', day_of_month: r.day_of_month || '', next_run_date: r.next_run_date || '', end_date: r.end_date || '' }); setFormErrors({}); setShowRecurringModal(true); }} className="p-2 text-gray-500 dark:text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg shrink-0" title={tr('Edytuj')} aria-label={tr('Edytuj plan {name}', { name: r.title })}><Edit2 size={16} /></button>
                    <button onClick={() => deleteRecurring(r)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0" title={tr('Usuń')} aria-label={tr('Usuń plan {name}', { name: r.title })}><Trash2 size={16} /></button>
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
                  <CustomSelect value={reportAnchor.month} onChange={(v) => setReportAnchor((a) => ({ ...a, month: parseInt(v) }))} options={MONTHS_PL.map((m, i) => ({ value: i, label: tr(m) }))} />
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
              {reportLoading && <Spinner size={16} label={tr('Ładowanie…')} />}
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
                <p className="text-gray-500 dark:text-gray-400 tabular-nums">{fmtDate(reportRange.from)} – {fmtDate(reportRange.to)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{tr('Wygenerowano')}: {new Date().toLocaleString(appLocale(), { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
            </div>
            {(() => {
              const { income: tIncome, expense: tExpense, balance: tBalance } = reportModel.totals;
              // Realizacja budżetu = wydatki vs PLAN WYDATKÓW (plan przychodów to inna wielkość).
              const totalPlanned = reportModel.kpis.plannedExpense;
              const budgetExec = totalPlanned > 0 ? (tExpense / totalPlanned) * 100 : 0;
              const signed = (n) => (n > 0 ? '+' : '') + fmtMoney(n);
              return (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="bg-gradient-to-r from-accent-primary to-accent-secondary p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white opacity-80 text-sm font-medium mb-1">{tr('Bilans okresu')} • {reportRange.label}</p>
                        <p className="text-3xl sm:text-4xl font-bold tabular-nums">{signed(tBalance)}</p>
                      </div>
                      <button onClick={openBalanceModal} className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition print:hidden pdf-exclude" title={t('Edytuj stany początkowe')} aria-label={t('Edytuj stany początkowe')}>
                        <Settings size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2"><ArrowUpRight size={16} className="text-green-600" /><span className="text-xs font-medium uppercase">{tr('Wpływy')}</span></div>
                        <p className="text-lg sm:text-xl font-bold text-green-700 dark:text-green-400 tabular-nums">{fmtMoney(tIncome)}</p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2"><ArrowDownRight size={16} className="text-red-600" /><span className="text-xs font-medium uppercase">{tr('Wydatki')}</span></div>
                        <p className="text-lg sm:text-xl font-bold text-red-700 dark:text-red-400 tabular-nums">{fmtMoney(tExpense)}</p>
                        {reportModel.kpis.pendingCount > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tr('+ {amount} czeka na akceptację', { amount: fmtMoney(reportModel.kpis.pendingTotal) })}</p>
                        )}
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">{tBalance >= 0 ? <TrendingUp size={16} className="text-green-600" /> : <ArrowDownRight size={16} className="text-red-600" />}<span className="text-xs font-medium uppercase">{tr('Bilans')}</span></div>
                        <p className={`text-lg sm:text-xl font-bold tabular-nums ${tBalance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{signed(tBalance)}</p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2"><PieChart size={16} /><span className="text-xs font-medium uppercase">{tr('Budżet wydatków {year}', { year: reportRange.year })}</span></div>
                        <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tabular-nums">{totalPlanned > 0 ? fmtPct(budgetExec) : '—'}</p>
                        {totalPlanned > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tr('z planu {amount}', { amount: fmtMoney(totalPlanned) })}</p>}
                        <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${budgetExec < 80 ? 'bg-green-500' : budgetExec <= 100 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(budgetExec, 100)}%` }} /></div>
                      </div>
                    </div>
                    {(reportBalances.bank_pln > 0 || reportBalances.cash_pln > 0 || reportBalances.bank_currency > 0 || reportBalances.cash_currency > 0) && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2 text-sm"><CreditCard size={16} className="text-gray-400" /><span className="text-gray-500 dark:text-gray-400">{tr('Bank')} ({reportRange.year}):</span><span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(reportBalances.bank_pln)}</span></div>
                        <div className="flex items-center gap-2 text-sm"><Banknote size={16} className="text-gray-400" /><span className="text-gray-500 dark:text-gray-400">{t('Gotówka')}:</span><span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(reportBalances.cash_pln)}</span></div>
                        {reportBalances.bank_currency > 0 && <div className="flex items-center gap-2 text-sm"><CreditCard size={16} className="text-gray-400" /><span className="text-gray-500 dark:text-gray-400">{tr('Bank')} {reportBalances.currency_type}:</span><span className="font-semibold text-gray-900 dark:text-white tabular-nums">{num(reportBalances.bank_currency).toLocaleString(appLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                        {reportBalances.cash_currency > 0 && <div className="flex items-center gap-2 text-sm"><Banknote size={16} className="text-gray-400" /><span className="text-gray-500 dark:text-gray-400">{t('Gotówka')} {reportBalances.currency_type}:</span><span className="font-semibold text-gray-900 dark:text-white tabular-nums">{num(reportBalances.cash_currency).toLocaleString(appLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* KPI — szybkie wskaźniki okresu */}
            {(() => {
              const k = reportModel.kpis;
              const Tile = ({ icon, label, value, sub, tone }) => (
                <div className={`rounded-2xl border p-4 ${tone === 'warn' ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1.5">{icon}<span className="text-xs font-medium uppercase">{label}</span></div>
                  <p className={`text-lg font-bold ${tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>{value}</p>
                  {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{sub}</p>}
                </div>
              );
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Tile icon={<ArrowUpRight size={15} className="text-green-600" />} label={tr('Śr. wpływ')} value={fmtMoney(k.avgIncome)} sub={tr('Liczba transakcji: {n}', { n: k.incomeCount })} />
                  <Tile icon={<ArrowDownRight size={15} className="text-red-600" />} label={tr('Śr. wydatek')} value={fmtMoney(k.avgExpense)} sub={tr('Liczba transakcji: {n}', { n: k.expenseCount })} />
                  <Tile icon={<PieChart size={15} className="text-accent-primary" />} label={tr('Największa kategoria')} value={k.topCategory ? fmtMoney(k.topCategory.amount) : '—'} sub={k.topCategory?.name || ''} />
                  <Tile icon={<AlertTriangle size={15} className={k.unpaidCount ? 'text-amber-700' : 'text-gray-400'} />} label={tr('Do zapłaty')} value={fmtMoney(k.unpaidTotal)} sub={tr('Nieopłacone: {n}', { n: k.unpaidCount })} tone={k.unpaidCount ? 'warn' : undefined} />
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
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{tr('Saldo na koniec okresu')}: <span className={`font-bold tabular-nums ${reportModel.totals.balance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{fmtMoney(reportModel.buckets.at(-1)?.cumulative)}</span></div>
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
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{e.contractor} · {e.category} · {fmtDate(e.date)}</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap tabular-nums">{fmtMoney(e.amount)}</p>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState icon={Receipt} title={t('Brak danych o wydatkach')} compact />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><CheckCircle size={20} className="text-accent-primary" />{tr('Status wydatków')}</h3>
                {reportModel.expenseStatus.length > 0 ? (
                  <div className="space-y-3">
                    {(() => {
                      const STc = { draft: ['Szkic', '#9ca3af'], submitted: ['Do akceptacji', '#eda100'], approved: ['Zatwierdzone', '#2a78d6'], rejected: ['Odrzucone', '#e34948'], paid: ['Opłacone', '#0ca30c'] };
                      const total = reportModel.expenseStatus.reduce((a, s) => a + s.amount, 0) || 1;
                      return reportModel.expenseStatus.map((s) => {
                        const [lbl, col] = STc[s.status] || [s.status, '#6b7280'];
                        const pct = (s.amount / total) * 100;
                        return (
                          <div key={s.status}>
                            <div className="flex justify-between text-sm mb-1"><span className="text-gray-700 dark:text-gray-300">{tr(lbl)} <span className="text-gray-500">({s.count})</span>{(s.status === 'submitted' || s.status === 'draft' || s.status === 'rejected') && <span className="text-xs text-gray-500"> · {tr('poza bilansem')}</span>}</span><span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(s.amount)}</span></div>
                            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: col }} /></div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : <EmptyState icon={CheckCircle} title={t('Brak danych o wydatkach')} compact />}
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
                          <TD align="right" numeric className="whitespace-nowrap">{fmtMoney(b.planned)}</TD>
                          <TD align="right" numeric className="whitespace-nowrap">{fmtMoney(b.realized)}</TD>
                          <TD><div className="flex items-center gap-2"><div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2"><div className={`h-2 rounded-full bg-gradient-to-r ${progressColor}`} style={{ width: `${Math.min(b.pct, 100)}%` }} /></div><span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white w-14 text-right">{fmtPct(b.pct, 0)}</span></div></TD>
                          <TD align="right" numeric className={`font-semibold whitespace-nowrap ${b.remaining >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{fmtMoney(b.remaining)}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </DataTable>
              ) : <EmptyState icon={DollarSign} title={tr('Brak planu wydatków na rok {year}', { year: reportRange.year })} compact />}
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
                      const overdue = e.due_date && e.due_date < localDateStr();
                      return (
                        <TR key={idx}>
                          <TD className="font-medium text-gray-900 dark:text-white">{e.contractor}</TD>
                          <TD muted className="truncate max-w-[220px]">{e.description}</TD>
                          <TD muted numeric>{e.invoice_number || ''}</TD>
                          <TD muted numeric className="whitespace-nowrap"><span className={overdue ? 'text-red-700 dark:text-red-400 font-semibold' : ''}>{fmtDate(e.due_date)}{overdue ? ` · ${tr('po terminie')}` : ''}</span></TD>
                          <TD align="right" numeric className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(e.amount)}</TD>
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
      <Modal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title={tr('Kategorie finansów')}
      >
        <div className="p-6">
          {/* Dodawanie nowej kategorii */}
          <div className="flex flex-wrap items-end gap-2 mb-5 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
            <div className="flex-1 min-w-[140px]">
              <label htmlFor="fin-cat-name" className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Nazwa')}</label>
              <input id="fin-cat-name" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') saveCategory(); }}
                placeholder={tr('np. Sprzęt, Kolekta')} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            </div>
            <div>
              <label htmlFor="fin-cat-kind" className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Rodzaj')}</label>
              <select id="fin-cat-kind" value={catForm.kind} onChange={(e) => setCatForm({ ...catForm, kind: e.target.value })}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                <option value="expense">{tr('Wydatek')}</option>
                <option value="income">{tr('Wpływ')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="fin-cat-color" className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kolor')}</label>
              <input id="fin-cat-color" type="color" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
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
                  <EmptyState icon={Tag} title={tr('Brak kategorii')} compact />
                )}
                {categories.filter((c) => c.kind === kind).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: c.color || '#6b7280' }} />
                    <span className={`text-sm flex-1 ${c.is_active === false ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>{c.name}</span>
                    <button onClick={() => toggleCategoryActive(c)} className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                      {c.is_active === false ? tr('Włącz') : tr('Wyłącz')}
                    </button>
                    <button onClick={() => deleteCategory(c)} className="text-red-600 hover:text-red-700 dark:text-red-400 p-1" title={tr('Usuń')} aria-label={tr('Usuń kategorię {name}', { name: c.name })}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Kontrahenci */}
          <div className="mt-2 pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{tr('Kontrahenci')}</div>
            <div className="flex gap-2 mb-2">
              <input value={vendorName} aria-label={tr('Kontrahenci')} onChange={(e) => setVendorName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && vendorName.trim()) { addVendor(vendorName); setVendorName(''); } }}
                placeholder={tr('np. Sklep muzyczny')} className="flex-1 min-w-0 text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-2 py-1.5 outline-none text-gray-800 dark:text-gray-100" />
              <button onClick={() => { if (vendorName.trim()) { addVendor(vendorName); setVendorName(''); } }} className="px-3 rounded-lg bg-accent-primary text-white text-sm shrink-0">{tr('Dodaj')}</button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
              {vendors.length === 0 && <EmptyState icon={Users} title={tr('Brak kontrahentów (dodają się też automatycznie z wydatków).')} compact />}
              {vendors.map((v) => (
                <div key={v.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                  <span className="text-sm flex-1 truncate text-gray-800 dark:text-gray-100">{v.name}</span>
                  <button onClick={() => deleteVendor(v)} className="text-red-600 hover:text-red-700 dark:text-red-400 p-1" title={tr('Usuń')} aria-label={tr('Usuń kontrahenta {name}', { name: v.name })}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showRecurringModal}
        onClose={() => { if (!saving) { setShowRecurringModal(false); setRecurringForm(emptyRecurring); setFormErrors({}); } }}
        title={recurringForm.id ? tr('Edytuj plan cykliczny') : tr('Nowy plan cykliczny')}
        size="sm"
        footer={<>
          <Button variant="secondary" disabled={saving} onClick={() => { setShowRecurringModal(false); setRecurringForm(emptyRecurring); setFormErrors({}); }}>{tr('Anuluj')}</Button>
          <Button onClick={saveRecurring} loading={saving}>{recurringForm.id ? tr('Zapisz zmiany') : tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {['expense', 'income'].map((k) => (
              <button key={k} onClick={() => setRecurringForm({ ...recurringForm, kind: k, category: '' })}
                className={`py-2 rounded-xl text-sm font-medium border transition ${recurringForm.kind === k ? 'border-accent-primary ring-1 ring-accent-primary bg-accent-primary/5 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300'}`}>
                {k === 'expense' ? tr('Wydatek') : tr('Wpływ')}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Nazwa')} <span className="text-red-600" aria-hidden="true">*</span></label>
            <input value={recurringForm.title} onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })} aria-invalid={!!formErrors.title} aria-required="true"
              placeholder={tr('np. Czynsz, Pensja, Stała kolekta')} className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${formErrors.title ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (zł)')} <span className="text-red-600" aria-hidden="true">*</span></label>
              <input type="number" step="0.01" min="0" inputMode="decimal" value={recurringForm.amount} onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })} aria-invalid={!!formErrors.amount} aria-required="true"
                placeholder="0,00" className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${formErrors.amount ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Następne wykonanie')} <span className="text-red-600" aria-hidden="true">*</span></label>
              <DateInput value={recurringForm.next_run_date} onChange={(e) => setRecurringForm({ ...recurringForm, next_run_date: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${formErrors.next_run_date ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Koniec (opcjonalnie)')}</label>
              <DateInput value={recurringForm.end_date} onChange={(e) => setRecurringForm({ ...recurringForm, end_date: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showProposalModal}
        onClose={() => setShowProposalModal(false)}
        title={`${tr('Propozycja do budżetu')} ${selectedYear}`}
        size="sm"
        footer={<>
          <Button variant="secondary" disabled={saving} onClick={() => setShowProposalModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveProposal} loading={saving}>{tr('Zgłoś')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (zł)')}</label>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={proposalForm.amount} onChange={(e) => setProposalForm({ ...proposalForm, amount: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Uzasadnienie (opcjonalnie)')}</label>
            <textarea rows={2} value={proposalForm.note} onChange={(e) => setProposalForm({ ...proposalForm, note: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showReportEmailModal}
        onClose={() => setShowReportEmailModal(false)}
        title={tr('Wyślij raport')}
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setShowReportEmailModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={sendReportEmail} loading={sendingReport}>{tr('Wyślij')}</Button>
        </>}
      >
        <div className="p-6">
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
        </div>
      </Modal>

      <Modal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title={tr('Harmonogram raportów')}
        icon={CalendarClock}
        footer={<>
          {editingScheduleId && <Button variant="secondary" onClick={() => { setEditingScheduleId(null); setScheduleForm(emptySchedule); }}>{tr('Nowy')}</Button>}
          <Button onClick={saveSchedule} loading={saving}>{editingScheduleId ? tr('Zapisz zmiany') : tr('Dodaj harmonogram')}</Button>
        </>}
      >
        <div className="p-6">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{tr('Automatyczna wysyłka raportu za zakończony okres na wskazane adresy — 1. dnia nowego okresu.')}</p>

          {schedules.length > 0 && (
            <div className="space-y-2 mb-5">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.cadence === 'monthly' ? tr('Co miesiąc') : s.cadence === 'quarterly' ? tr('Co kwartał') : tr('Co rok')}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{(s.recipients || []).join(', ')}</p>
                    {s.next_run_date && <p className="text-[11px] text-gray-500 dark:text-gray-400">{tr('Następna wysyłka')}: {fmtDate(s.next_run_date)}</p>}
                  </div>
                  <button onClick={() => toggleSchedule(s)} className={`text-xs px-2 py-1 rounded-lg ${s.is_active !== false ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{s.is_active !== false ? tr('Aktywny') : tr('Wstrzymany')}</button>
                  <button onClick={() => openEditSchedule(s)} className="p-1 text-gray-500 hover:text-accent-primary" aria-label={tr('Edytuj harmonogram')}><Edit2 size={16} /></button>
                  <button onClick={() => deleteSchedule(s.id)} className="p-1 text-gray-500 hover:text-red-600" aria-label={tr('Usuń harmonogram')}><Trash2 size={16} /></button>
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
          </div>
        </div>
      </Modal>

      {changeItem && (
        <Modal
          isOpen
          onClose={() => setChangeItem(null)}
          title={tr('Historia zmian kwoty')}
          icon={Clock}
          size="sm"
          zIndex={110}
        >
          <div className="p-6 space-y-2">
            {changeItem.map((a) => (
              <div key={a.id} className="px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700 text-sm">
                <div className="font-medium text-gray-800 dark:text-gray-100">
                  {fmtMoney(a.before?.planned_amount)} <span className="text-gray-400">→</span> {fmtMoney(a.after?.planned_amount)}
                </div>
                <div className="text-xs text-gray-400">{a.actor || '—'} · {new Date(a.created_at).toLocaleString(appLocale())}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <Modal
        isOpen={showBudgetHistory}
        onClose={() => setShowBudgetHistory(false)}
        title={`${tr('Historia budżetu')} ${selectedYear}`}
      >
        <div className="p-6">
          <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{tr('Zapisane wersje')}</div>
          {budgetVersions.length === 0 ? (
            <EmptyState icon={Copy} title={tr('Brak zapisanych wersji. Użyj „Zapisz wersję”, aby zrobić migawkę.')} compact />
          ) : (
            <div className="space-y-1.5 mb-5">
              {budgetVersions.map((v) => (
                <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700 text-sm">
                  <Copy size={14} className="text-gray-400 shrink-0" />
                  <span className="font-medium text-gray-800 dark:text-gray-100 flex-1 truncate">{v.label}</span>
                  <span className="text-xs text-gray-400">{Array.isArray(v.snapshot) ? v.snapshot.length : 0} {tr('poz.')} · {new Date(v.created_at).toLocaleDateString(appLocale())}</span>
                </div>
              ))}
            </div>
          )}

          <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">{tr('Ostatnie zmiany')}</div>
          {budgetAudit.length === 0 ? (
            <EmptyState icon={Clock} title={tr('Brak zapisanych zmian.')} compact />
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
                          ? `${fmtMoney(beforeAmt)} → ${fmtMoney(afterAmt)} · `
                          : (afterAmt != null ? `${fmtMoney(afterAmt)} · ` : '')}
                        {a.actor || '—'} · {new Date(a.created_at).toLocaleString(appLocale())}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showBudgetModal}
        onClose={closeBudgetModal}
        title={budgetForm.id ? tr('Edytuj pozycję budżetową') : t('Nowa pozycja budżetowa')}
        size="sm"
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" disabled={saving} onClick={closeBudgetModal}>{tr('Anuluj')}</Button>
          <Button onClick={saveBudgetItem} loading={saving}>{budgetForm.id ? tr('Zapisz zmiany') : tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
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
              label={`${tr('Kategoria wpływu')} *`}
              value={budgetForm.category}
              onChange={(val) => setBudgetForm({ ...budgetForm, category: val })}
              options={incomeCategories.length > 0
                ? incomeCategories.map((c) => ({ value: c.name, label: c.name }))
                : [{ value: 'Kolekta', label: tr('Kolekta') }, { value: 'Darowizny', label: tr('Darowizny') }, { value: 'Inne', label: tr('Inne') }]}
              placeholder={tr('Wybierz kategorię')}
            />
          ) : (
            <CustomSelect
              label={`${tr('Służba')} *`}
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
          {formErrors.category && <p className="text-xs text-red-700 dark:text-red-400 -mt-2">{tr('Wybierz z listy.')}</p>}
          {budgetForm.id && (budgetForm.kind || 'expense') !== 'income' && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Zmiana służby lub opisu przeniesie też przypisane do tej pozycji wydatki.')}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fin-budget-amount" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Planowana kwota (zł)')} <span className="text-red-600" aria-hidden="true">*</span></label>
              <input
                id="fin-budget-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                aria-required="true"
                aria-invalid={!!formErrors.planned_amount}
                className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${formErrors.planned_amount ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
                value={budgetForm.planned_amount}
                onChange={(e) => setBudgetForm({...budgetForm, planned_amount: e.target.value})}
                placeholder="0,00"
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
        </div>
      </Modal>

      {/* MODAL: Income */}
      <Modal
        isOpen={showIncomeModal}
        onClose={closeIncomeModal}
        title={incomeForm.id ? tr('Edytuj wpływ') : t('Nowy wpływ')}
        size="sm"
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" disabled={saving} onClick={closeIncomeModal}>{tr('Anuluj')}</Button>
          <Button data-tour="fin-income-save" onClick={saveIncome} loading={saving}>{incomeForm.id ? tr('Zapisz zmiany') : tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <CustomDatePicker
            label={`${tr('Data wpływu')} *`}
            value={incomeForm.date}
            onChange={(val) => setIncomeForm({...incomeForm, date: val})}
          />
          <div>
            <label htmlFor="fin-income-amount" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (zł)')} <span className="text-red-600" aria-hidden="true">*</span></label>
            <input
              id="fin-income-amount"
              data-tour="fin-income-amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              aria-required="true"
              aria-invalid={!!formErrors.amount}
              className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${formErrors.amount ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
              value={incomeForm.amount}
              onChange={(e) => setIncomeForm({...incomeForm, amount: e.target.value})}
              placeholder="0,00"
            />
          </div>
          <CustomSelect
            label={tr('Typ wpływu')}
            value={incomeForm.type}
            onChange={(val) => setIncomeForm({...incomeForm, type: val})}
            options={incomeCategories.length > 0
              ? incomeCategories.map((c) => ({ value: c.name, label: c.name }))
              : [
                { value: 'Kolekta', label: tr('Kolekta') },
                { value: 'Darowizny', label: tr('Darowizny') },
                { value: 'Inne', label: tr('Inne') },
              ]}
          />
          <div>
            <label htmlFor="fin-income-source" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Źródło')} <span className="text-red-600" aria-hidden="true">*</span></label>
            <input
              id="fin-income-source"
              data-tour="fin-income-source"
              aria-required="true"
              aria-invalid={!!formErrors.source}
              className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${formErrors.source ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
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
        </div>
      </Modal>

      {/* MODAL: Expense */}
      <Modal
        isOpen={showExpenseModal}
        onClose={closeExpenseModal}
        title={expenseForm.id ? tr('Edytuj wydatek') : canApprove ? t('Nowy wydatek') : tr('Zgłoś wydatek')}
        size="xl"
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" disabled={saving || uploadingFile} onClick={closeExpenseModal}>{tr('Anuluj')}</Button>
          <Button onClick={saveExpense} loading={saving} disabled={uploadingFile}>{expenseForm.id ? tr('Zapisz zmiany') : (!canApprove || expenseForm.submit_for_approval) ? tr('Wyślij do akceptacji') : tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          {!canApprove && !expenseForm.id && (
            <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
              {tr('Wydatek trafi do akceptacji osoby, która zatwierdza finanse. Do tego czasu nie wlicza się do sum.')}
            </p>
          )}
          {/* Wiersz 1: Data i Kwota */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CustomDatePicker
              label={`${tr('Data dokumentu')} *`}
              value={expenseForm.payment_date}
              onChange={(val) => setExpenseForm({...expenseForm, payment_date: val})}
            />
            <div>
              <label htmlFor="fin-expense-amount" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (zł)')} <span className="text-red-600" aria-hidden="true">*</span></label>
              <input
                id="fin-expense-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                aria-required="true"
                aria-invalid={!!formErrors.amount}
                className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${formErrors.amount ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Wiersz 2: Służba i pozycja budżetu (albo wydatek spoza budżetu z własnym opisem) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <CustomSelect
                label={`${tr('Służba')} *`}
                value={expenseForm.category}
                onChange={(val) => {
                  setExpenseForm({ ...expenseForm, category: val, description: '' });
                  setExpenseOffBudget(budgetDescriptionsFor(val).length === 0);
                }}
                options={expenseCategoryOptions}
                placeholder={tr('Wybierz służbę')}
              />
              {formErrors.category && <p className="text-xs text-red-700 dark:text-red-400 mt-1">{tr('Wybierz służbę.')}</p>}
            </div>
            {expenseForm.category && (
              <div>
                <CustomSelect
                  label={`${tr('Pozycja budżetu')} *`}
                  value={expenseOffBudget ? OFF_BUDGET : expenseForm.description}
                  onChange={(val) => {
                    if (val === OFF_BUDGET) { setExpenseOffBudget(true); setExpenseForm({ ...expenseForm, description: '' }); }
                    else { setExpenseOffBudget(false); setExpenseForm({ ...expenseForm, description: val }); }
                  }}
                  options={[...budgetDescriptionsFor(expenseForm.category), { value: OFF_BUDGET, label: tr('Inny wydatek (poza budżetem)') }]}
                  placeholder={tr('Wybierz pozycję')}
                />
                {formErrors.description && !expenseOffBudget && <p className="text-xs text-red-700 dark:text-red-400 mt-1">{tr('Wybierz pozycję budżetu albo „Inny wydatek”.')}</p>}
              </div>
            )}
          </div>
          {expenseForm.category && expenseOffBudget && (
            <div>
              <label htmlFor="fin-expense-desc" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Opis wydatku')} <span className="text-red-600" aria-hidden="true">*</span></label>
              <input
                id="fin-expense-desc"
                aria-required="true"
                aria-invalid={!!formErrors.description}
                className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${formErrors.description ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder={tr('np. Naprawa nagłośnienia')}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tr('Wydatek spoza budżetu — nie wliczy się do realizacji żadnej pozycji.')}</p>
            </div>
          )}

          {/* Wiersz 3: Faktura (nr / termin) + załączniki — obok kwoty, bo zwykle wpisuje się je razem */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fin-expense-invoice" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Nr faktury (opcjonalnie)')}</label>
              <input id="fin-expense-invoice" value={expenseForm.invoice_number} onChange={(e) => setExpenseForm({ ...expenseForm, invoice_number: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="FV/2026/..." />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Termin płatności')}</label>
              <DateInput value={expenseForm.due_date} onChange={(e) => setExpenseForm({ ...expenseForm, due_date: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Załączniki (opcjonalnie)')}</label>
            <div className="space-y-2">
              <label className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer hover:border-accent-primary-light dark:hover:border-accent-primary transition flex items-center gap-2">
                {uploadingFile ? <Spinner size={18} /> : <Upload size={18} className="text-gray-400" />}
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {uploadingFile ? tr('Przesyłanie...') : tr('Załącz fakturę lub paragon')}
                </span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="sr-only"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  disabled={uploadingFile}
                  multiple
                />
              </label>
              {expenseForm.documents && expenseForm.documents.length > 0 && (
                <div className="space-y-2">
                  {expenseForm.documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <span className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1 truncate">
                        <FileText size={14} />
                        {doc.name}
                      </span>
                      <button
                        onClick={() => removeDocument(idx)}
                        className="text-gray-500 hover:text-red-600 dark:text-gray-400 ml-2 flex-shrink-0"
                        aria-label={tr('Usuń załącznik {name}', { name: doc.name })}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Wiersz 4: Kontrahent i Osoba odpowiedzialna */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fin-expense-contractor" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Kontrahent')}</label>
              <input
                id="fin-expense-contractor"
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
              <label htmlFor="fin-expense-responsible" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Osoba odpowiedzialna')}</label>
              <input
                id="fin-expense-responsible"
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                value={expenseForm.responsible_person}
                onChange={(e) => setExpenseForm({...expenseForm, responsible_person: e.target.value})}
                placeholder={t('Imię i nazwisko')}
              />
            </div>
          </div>

          {/* Rodzaj kosztu (własna kategoria, niezależna od budżetu) */}
          <CustomSelect
            label={tr('Rodzaj kosztu (opcjonalnie)')}
            value={expenseForm.cost_category}
            onChange={(val) => setExpenseForm({...expenseForm, cost_category: val})}
            options={[{ value: '', label: tr('— brak —') }, ...expenseCategories.map((c) => ({ value: c.name, label: c.name }))]}
            placeholder={t('Wybierz kategorię kosztu')}
          />

          {canApprove && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4" checked={expenseForm.is_paid !== false && !expenseForm.submit_for_approval} disabled={!!expenseForm.submit_for_approval && !expenseForm.id} onChange={(e) => setExpenseForm({ ...expenseForm, is_paid: e.target.checked })} />
                {tr('Opłacone')}
              </label>
              {!expenseForm.id && (
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4" checked={!!expenseForm.submit_for_approval} onChange={(e) => setExpenseForm({ ...expenseForm, submit_for_approval: e.target.checked })} />
                  {tr('Wniosek o zwrot / wyślij do akceptacji')}
                </label>
              )}
            </div>
          )}

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
        </div>
      </Modal>

      {/* MODAL: Account Balances */}
      <Modal
        isOpen={showBalanceModal}
        onClose={() => setShowBalanceModal(false)}
        title={tr('Stan początkowy kont - {year}', { year: selectedYear })}
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" disabled={saving} onClick={() => setShowBalanceModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveAccountBalances} loading={saving}>{tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-5">
          {/* PLN Section */}
          <div>
            <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              {tr('Złotówki (PLN)')}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  <CreditCard size={12} className="inline mr-1" />
                  {tr('Rachunek bankowy')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={balanceForm.bank_pln}
                  onChange={(e) => setBalanceForm({...balanceForm, bank_pln: e.target.value})}
                  placeholder="0,00"
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
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {/* Currency Section */}
          <div>
            <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              {tr('Waluta obca')}
            </h4>
            <div className="mb-3">
              <label htmlFor="fin-currency-type" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Typ waluty')}</label>
              <select
                id="fin-currency-type"
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                value={balanceForm.currency_type}
                onChange={(e) => setBalanceForm({...balanceForm, currency_type: e.target.value})}
              >
                <option value="EUR">{tr('EUR - Euro')}</option>
                <option value="USD">{tr('USD - Dolar amerykański')}</option>
                <option value="GBP">{tr('GBP - Funt brytyjski')}</option>
                <option value="CHF">{tr('CHF - Frank szwajcarski')}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  <CreditCard size={12} className="inline mr-1" />
                  {tr('Rachunek walutowy')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={balanceForm.bank_currency}
                  onChange={(e) => setBalanceForm({...balanceForm, bank_currency: e.target.value})}
                  placeholder="0,00"
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
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">{t('💡 Wskazówka')}</p>
            <p>{tr('Wprowadź stany kont na początek roku {year}. System automatycznie doliczy wpływy i wydatki, aby pokazać aktualny stan.', { year: selectedYear })}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FinanceModule;
