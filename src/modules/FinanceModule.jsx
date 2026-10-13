import React, { useState, useEffect, useRef, useMemo } from 'react';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import Button from '../components/Button';
import { DollarSign, TrendingUp, Receipt, Calendar, Plus, Upload, Download, Printer, Repeat, CheckCircle, XCircle, Clock, Copy, AlertTriangle, Tag, X, FileText, Trash2, Edit2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Users, Settings, Banknote, CreditCard, FolderOpen, Mail, CalendarClock, FolderKanban, Tags, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useCampusQuery } from '../hooks/useCampusQuery';
import CustomSelect from '../components/CustomSelect';
import MaterialsTab from './shared/MaterialsTab';
import ResponsiveTabs from '../components/ResponsiveTabs';
import PageHeader from '../components/PageHeader';
import { useT } from '../i18n';
import { isProtectedFileUrl, openProtectedFile } from '../lib/protectedFiles';
import { tr, appLocale } from '../i18n';
import { toast } from '../lib/toast';
import { computeRange, shiftRangeYears, MONTHS_PL, yearOptions } from './finance/reportRange';
import { buildReportModel, toCsvBlob, toXlsxBlob, reportElToPdfBlob, printReportEl, blobToBase64, download, slugForRange } from './finance/reportExport';
import { IncomeExpenseBarChart, CashFlowAreaChart, CategoryDonut, YoYBars, BucketTable } from './finance/ReportCharts';
import { usePermissions } from '../contexts/PermissionsContext';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../components/ui/DataTable';
import { DateInput } from '../components/pickers';
import { confirmDialog, promptDialog } from '../lib/dialog';
import {
  num, withNumbers, isCountedExpense, isPendingExpense, realizationFor, matchesBudgetItem, normKey,
  fmtMoney, fmtPct, fmtDate, parseLocalDate, localDateStr, nextPeriodStart, missingFields, planBudgetCopy, humanSaveError,
} from './finance/money';
import CustomDatePicker from '../components/CustomDatePicker';  // wspólne pole daty (wcześniej lokalna kopia bez ramki pola)
import TagPicker, { TagChips } from './finance/TagPicker';
import FinanceDictionaries from './finance/FinanceDictionaries';
import FinanceProjects from './finance/FinanceProjects';
import { NEW_OPTION, buildAreaOptions, projectOptions, projectById, nameTaken } from './finance/dictionaries';
import { REPORT_SECTIONS, MAIL_SECTION_KEYS, defaultSections, loadSections, saveSections, enabledKeys, NONE, EMPTY_REPORT_EXCLUDE, applyReportExclusions, hasExclusions, describeExclusions, loadExclusions, saveExclusions } from './finance/reportSections';
import ExcludePicker from './finance/ExcludePicker';
import ReportExportModal from './finance/ReportExportModal';
import BudgetExpenseTable from './finance/BudgetExpenseTable';
import { isMinistryModule } from '../lib/ministryModules';



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

// Lista służb = tylko SŁUŻBY (wbudowane zespoły + moduły własne; lib/ministryModules).
// Wcześniej czarna lista przepuszczała Ścianę modlitwy, Formularze, Kazania, Hojność itd.
// Pozostałe obszary budżetu (Administracja, Budynek…) to finance_areas.

// Zapasowa lista służb (gdyby app_modules się nie wczytało). WARTOŚĆ = team_type modułu
// (zapisany klucz — nie zmieniać), ETYKIETA = nazwa dla ludzi.
const FALLBACK_SERVICES = [
  { value: 'Grupa Uwielbienia', label: 'Zespół Uwielbienia' },
  { value: 'MediaTeam', label: 'Media Team' },
  { value: 'AtmosferaTeam', label: 'Atmosfera Team' },
  { value: 'Grupy domowe', label: 'Grupy domowe' },
  { value: 'małe Avenit', label: 'Dzieci' },
  { value: 'Mlodziezowka', label: 'Młodzieżówka' },
];

// Puste formularze — „Dodaj…” zawsze startuje od nich (bez id poprzednio edytowanego rekordu).
const EMPTY_BUDGET = { kind: 'expense', category: '', description: '', planned_amount: '', period_type: 'year', cost_category: '', project_id: '', tags: [] };
const EMPTY_INCOME = { date: '', amount: '', type: 'Kolekta', source: '', notes: '', tags: [], project_id: '' };
const EMPTY_EXPENSE = {
  payment_date: '', amount: '', contractor: '', category: '', cost_category: '', description: '',
  detailed_description: '', responsible_person: '', invoice_number: '', due_date: '', is_paid: true,
  submit_for_approval: false, documents: [], tags: [], project_id: '',
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
  // Pobieranie, druk i wysyłka raportów (dane poza aplikację) — prawo eksportu; serwer egzekwuje maila i harmonogram.
  const canExport = can('action:finance:export');
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
        const { data } = await supabase.from('app_modules').select('key, label, display_order, component_name').order('display_order', { ascending: true });
        const opts = (data || [])
          .filter((m) => m.label && isMinistryModule(m))
          .map((m) => ({ value: TEAM_TYPE_BY_KEY[m.key] || m.label, label: m.label }));
        setServiceOptions(opts.length ? opts : FALLBACK_SERVICES.map((o) => ({ ...o, label: tr(o.label) })));
      } catch { setServiceOptions(FALLBACK_SERVICES.map((o) => ({ ...o, label: tr(o.label) }))); }
    })();
  }, []);
  // Nazwa służby do wyświetlenia: team_type wbudowanego zespołu („małe Avenit”) → nazwa modułu z menu.
  const areaLabel = (v) => serviceOptions.find((o) => o.value === v)?.label || v;
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
  const openEditBudget = (item) => {
    setBudgetForm({ ...EMPTY_BUDGET, ...item, planned_amount: String(num(item.planned_amount)), cost_category: item.cost_category || '', project_id: item.project_id || '', tags: Array.isArray(item.tags) ? item.tags : [], description: item.description || '' });
    setFormErrors({}); setShowBudgetModal(true);
  };
  const closeBudgetModal = () => { if (saving) return; setShowBudgetModal(false); setBudgetForm(EMPTY_BUDGET); setFormErrors({}); };
  const openCreateIncome = (projectId = '') => { setIncomeForm({ ...EMPTY_INCOME, date: localDateStr(), project_id: typeof projectId === 'string' || typeof projectId === 'number' ? projectId : '' }); setFormErrors({}); setShowIncomeModal(true); };
  const openEditIncome = (tx) => { setIncomeForm({ ...EMPTY_INCOME, ...tx, amount: String(num(tx.amount)), source: tx.source || '', notes: tx.notes || '', tags: tx.tags || [], project_id: tx.project_id || '' }); setFormErrors({}); setShowIncomeModal(true); };
  const closeIncomeModal = () => { if (saving) return; setShowIncomeModal(false); setIncomeForm(EMPTY_INCOME); setFormErrors({}); };
  const openCreateExpense = (projectId = '') => {
    setExpenseForm({ ...EMPTY_EXPENSE, payment_date: localDateStr(), is_paid: canApprove, submit_for_approval: !canApprove, project_id: typeof projectId === 'string' || typeof projectId === 'number' ? projectId : '' });
    setExpenseOffBudget(false); setFormErrors({}); setShowExpenseModal(true);
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
      project_id: tx.project_id || '',
    });
    setExpenseOffBudget(!linked && !!tx.description);
    setFormErrors({}); setShowExpenseModal(true);
  };
  const closeExpenseModal = () => { if (saving) return; setShowExpenseModal(false); setExpenseForm(EMPTY_EXPENSE); setExpenseOffBudget(false); setFormErrors({}); };

  const [uploadingFile, setUploadingFile] = useState(false);


  // Filtry dla wpływów
  const EMPTY_INCOME_FILTERS = { type: '', source: '', tag: '', project: '', dateFrom: '', dateTo: '' };
  const [incomeFilters, setIncomeFilters] = useState(EMPTY_INCOME_FILTERS);

  // Filtry dla wydatków
  const EMPTY_EXPENSE_FILTERS = { category: '', cost_category: '', contractor: '', responsible: '', tag: '', project: '', dateFrom: '', dateTo: '' };
  const [expenseFilters, setExpenseFilters] = useState(EMPTY_EXPENSE_FILTERS);

  // ── Kategorie (własne) + paleta tagów ─────────────────────────────────────
  const [categories, setCategories] = useState([]); // expense_categories: {id,name,kind,color,icon,is_active}
  const [tagPalette, setTagPalette] = useState([]); // finance_tags: {id,name,color}
  const [areas, setAreas] = useState([]);           // finance_areas: własne obszary budżetu
  const [projects, setProjects] = useState([]);     // finance_projects
  const [dataVersion, setDataVersion] = useState(0); // zmiana słowników → odśwież dane zakładek
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
  const fetchAreas = async () => {
    try { const { data } = await supabase.from('finance_areas').select('*').order('sort_order').order('name'); setAreas(data || []); }
    catch { setAreas([]); /* tenant przed migracją 101 */ }
  };
  const fetchProjects = async () => {
    try { const { data } = await supabase.from('finance_projects').select('*').order('name'); setProjects(data || []); }
    catch { setProjects([]); }
  };
  useEffect(() => { fetchCategories(); fetchTagPalette(); fetchAreas(); fetchProjects(); }, []);
  const projectColor = (id) => projectById(projects, id)?.color || '#6b7280';
  const categoryColor = (name, kind = 'expense') => categories.find((c) => c.kind === kind && c.name === name)?.color || STATUS_COLORS.neutral;

  // „+ Dodaj nowy…” prosto z listy wyboru: pyta o nazwę, zapisuje w słowniku i zwraca ją.
  const createArea = async () => {
    const name = String(await promptDialog(tr('Nazwa nowego obszaru (np. Administracja, Wynajem budynku)')) || '').trim();
    if (!name) return null;
    const existing = [...serviceOptions.map((o) => ({ name: o.value })), ...areas].find((a) => nameTaken([a], name));
    if (existing) return existing.name;
    const { error } = await supabase.from('finance_areas').insert([{ name, is_active: true, sort_order: areas.length }]);
    if (error) { toast.error(humanSaveError(error, tr)); return null; }
    toast.success(tr('Dodano obszar „{name}”', { name }));
    fetchAreas();
    return name;
  };
  const createCategory = async (kind) => {
    const name = String(await promptDialog(kind === 'income' ? tr('Nazwa nowej kategorii wpływów') : tr('Nazwa nowej kategorii wydatków')) || '').trim();
    if (!name) return null;
    const existing = categories.find((c) => c.kind === kind && nameTaken([c], name));
    if (existing) return existing.name;
    const PALETTE = ['#8A6606', '#166534', '#1e40af', '#9a3412', '#0f766e', '#7c2d12', '#57534e', '#6b21a8'];
    const { error } = await supabase.from('expense_categories').insert([{ name, kind, color: PALETTE[categories.length % PALETTE.length], is_active: true }]);
    if (error) { toast.error(humanSaveError(error, tr)); return null; }
    toast.success(tr('Dodano kategorię „{name}”', { name }));
    fetchCategories();
    return name;
  };
  // onChange listy z opcją „+ Dodaj nowy…”: zwykła wartość od razu, nowa — po utworzeniu.
  const pickOrCreate = (create, apply) => async (val) => {
    if (val !== NEW_OPTION) { apply(val); return; }
    const name = await create();
    if (name) apply(name);
  };

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

  // E-mail zalogowanego (do audytu akceptacji/zgłoszeń).
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrentUserEmail(data?.user?.email || '')).catch(() => {}); }, []);

  // ── Transakcje cykliczne (finance_recurring) ──────────────────────────────
  const [recurringItems, setRecurringItems] = useState([]);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const emptyRecurring = { kind: 'expense', title: '', amount: '', category: '', team_type: '', contractor: '', frequency: 'monthly', day_of_month: '', next_run_date: '', end_date: '', is_active: true, cost_category: '', project_id: '', tags: [] };
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
      cost_category: recurringForm.kind === 'expense' ? (recurringForm.cost_category || null) : null,
      project_id: recurringForm.project_id || null, tags: recurringForm.tags || [],
    };
    setSaving(true);
    try {
      const { error } = recurringForm.id
        ? await supabase.from('finance_recurring').update(payload).eq('id', recurringForm.id)
        : await supabase.from('finance_recurring').insert([payload]);
      if (error) throw error;
      toast.success(recurringForm.id ? tr('Zapisano zmiany planu') : tr('Dodano plan cykliczny'));
      setShowRecurringModal(false); setRecurringForm(emptyRecurring); setFormErrors({}); fetchRecurring(); ensureTagsInPalette(payload.tags);
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

  // Sekcje raportu (co ma się w nim znaleźć) — zapamiętane w przeglądarce, steruje też eksportem i mailem.
  const [reportSections, setReportSections] = useState(loadSections);
  const [showSectionsMenu, setShowSectionsMenu] = useState(false);
  const setSection = (key, on) => setReportSections((prev) => { const next = { ...prev, [key]: on }; saveSections(next); return next; });
  const setAllSections = (next) => { setReportSections(next); saveSections(next); };
  // Sekcje na czas generowania PDF/druku (okno „Pobierz / drukuj”) — inaczej te z widoku.
  const [exportSections, setExportSections] = useState(null);
  const activeSections = exportSections || reportSections;
  const sec = (key) => activeSections[key] !== false;
  // Co wliczyć do raportu: odznaczone projekty / obszary / kategorie / tagi są wykluczane
  // (np. wszystkie projekty albo jeden, reszta zostaje). Zapamiętane w przeglądarce.
  const [reportExclude, setReportExcludeState] = useState(loadExclusions);
  const setReportExclude = (next) => { setReportExcludeState(next); saveExclusions(next); };
  const setExcluded = (dim, list) => setReportExclude({ ...reportExclude, [dim]: list });
  // Listy wartości: słowniki + to, co faktycznie jest w danych zakresu (także stare nazwy).
  const reportExcludeOptions = useMemo(() => {
    const uniq = (arr) => [...new Set(arr.filter((v) => v != null && v !== '').map(String))];
    const none = (label) => ({ value: NONE, label: tr(label), muted: true });
    const expRows = [...reportExpense, ...reportBudget.filter((b) => b.kind !== 'income')];
    const incRows = [...reportIncome.map((i) => ({ category: i.type })), ...reportBudget.filter((b) => b.kind === 'income')];
    const allRows = [...reportIncome, ...reportExpense, ...reportBudget];
    const projIds = uniq([...projects.map((p) => p.id), ...allRows.map((r) => r.project_id)]);
    return {
      projects: [...projIds.map((id) => ({ value: id, label: projectById(projects, id)?.name || '—', color: projectById(projects, id)?.color })), none('(bez projektu)')],
      areas: uniq([...buildAreaOptions(serviceOptions, areas).map((o) => o.value), ...expRows.map((r) => r.category)]).map((v) => ({ value: v, label: areaLabel(v) })),
      costCategories: [...uniq([...expenseCategories.map((c) => c.name), ...expRows.map((r) => r.cost_category)]).map((v) => ({ value: v, label: v, color: categoryColor(v) })), none('(bez kategorii)')],
      incomeCategories: [...uniq([...incomeCategories.map((c) => c.name), ...incRows.map((r) => r.category)]).map((v) => ({ value: v, label: tr(v), color: categoryColor(v, 'income') })), none('(bez kategorii)')],
      tags: [...uniq([...tagPalette.map((t) => t.name), ...allRows.flatMap((r) => (Array.isArray(r.tags) ? r.tags : []))]).map((v) => ({ value: v, label: v, color: tagColor(v) })), none('(bez tagów)')],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportIncome, reportExpense, reportBudget, projects, areas, serviceOptions, categories, tagPalette]);
  const reportFilterLabel = describeExclusions(reportExclude, {
    tr, projectName: (id) => projectById(projects, id)?.name || '—', areaName: areaLabel,
    totals: Object.fromEntries(Object.entries(reportExcludeOptions).map(([d, o]) => [d, o.length])),
  });

  const reportModel = useMemo(() => {
    const m = buildReportModel({
      range: reportRange,
      income: applyReportExclusions(reportIncome, reportExclude, 'income'),
      expense: applyReportExclusions(reportExpense, reportExclude, 'expense'),
      budget: applyReportExclusions(reportBudget, reportExclude, 'budget'),
      expenseCategories, projects,
      areaLabel,
      // Wszystkie kategorie wpływów (także wyłączone) — po nich raport rozpoznaje organizacje.
      incomeCategories: categories.filter((c) => c.kind === 'income'),
      // Porównanie r/r ma sens tylko dla całości (bez wykluczeń).
      prevIncome: hasExclusions(reportExclude) ? null : reportPrev.income,
      prevExpense: hasExclusions(reportExclude) ? null : reportPrev.expense,
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportRange, reportIncome, reportExpense, reportBudget, categories, projects, reportPrev, reportExclude, serviceOptions]);

  // ── Pobieranie / druk raportu (okno: format, orientacja, sekcje) ─────────
  // PDF i druk to zrzut widoku, więc na czas generowania podmieniamy sekcje na wybrane
  // w oknie (exportSections), a potem wracamy do tego, co jest na ekranie.
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Poziomy PDF: na czas zrzutu raport układa się szerzej (wykresy przeliczają szerokość),
  // inaczej bloki skalowane do szerokiej strony robią się wysokie i strony są w połowie puste.
  const [exportWidth, setExportWidth] = useState(null);
  const doExport = async ({ format, orientation, sections }) => {
    const base = `raport-finansowy-${slugForRange(reportRange)}`;
    setExporting(true);
    try {
      if (format === 'csv') download(toCsvBlob(reportModel, sections), `${base}.csv`);
      else if (format === 'xlsx') download(await toXlsxBlob(reportModel, sections), `${base}.xlsx`);
      else {
        setExportSections(sections);
        if (orientation === 'l') setExportWidth(1800);
        // Dwie klatki + chwila na przeliczenie rozmiarów wykresów (ResponsiveContainer).
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => setTimeout(r, 350));
        if (!reportSectionRef.current) return;
        if (format === 'print') await printReportEl(reportSectionRef.current, `${base}.pdf`, { orientation });
        else download(await reportElToPdfBlob(reportSectionRef.current, { orientation }), `${base}.pdf`);
      }
      setShowExportModal(false);
    } catch (e) { toast.error(tr('Błąd eksportu: ') + (e.message || e)); }
    finally { setExportSections(null); setExportWidth(null); setExporting(false); }
  };

  // ── Raport finansowy mailem (na żądanie) ──────────────────────────────────
  const [showReportEmailModal, setShowReportEmailModal] = useState(false);
  const [reportRecipients, setReportRecipients] = useState('');
  const [reportAttachments, setReportAttachments] = useState({ pdf: true, xlsx: true, csv: false });
  const [sendingReport, setSendingReport] = useState(false);
  const sendReportEmail = async () => {
    const list = reportRecipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error(tr('Podaj adresy e-mail')); return; }
    if (!MAIL_SECTION_KEYS.some((k) => sec(k))) { toast.error(tr('Wybierz co najmniej jedną sekcję raportu.')); return; }
    setSendingReport(true);
    try {
      const slug = slugForRange(reportRange);
      const attachments = [];
      if (reportAttachments.pdf && reportSectionRef.current) {
        const pdf = await reportElToPdfBlob(reportSectionRef.current);
        attachments.push({ filename: `raport-${slug}.pdf`, contentBase64: await blobToBase64(pdf), type: 'application/pdf' });
      }
      if (reportAttachments.xlsx) {
        attachments.push({ filename: `raport-${slug}.xlsx`, contentBase64: await blobToBase64(await toXlsxBlob(reportModel, reportSections)), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
      if (reportAttachments.csv) {
        attachments.push({ filename: `raport-${slug}.csv`, contentBase64: await blobToBase64(toCsvBlob(reportModel, reportSections)), type: 'text/csv' });
      }
      const { data, error } = await supabase.functions.invoke('finance-report-email', {
        body: {
          from: reportRange.from, to: reportRange.to, periodLabel: reportRange.label, recipients: list, attachments,
          // Treść maila = te same sekcje i filtry co na ekranie.
          sections: enabledKeys(reportSections).filter((k) => MAIL_SECTION_KEYS.includes(k)),
          exclude: hasExclusions(reportExclude) ? reportExclude : null,
        },
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
  const emptySchedule = { cadence: 'monthly', recipients: '', include_csv: true, is_active: true, sections: MAIL_SECTION_KEYS };
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
      // Wszystkie sekcje = NULL (nowe sekcje w przyszłości też trafią do maila).
      sections: MAIL_SECTION_KEYS.every((k) => scheduleForm.sections.includes(k)) ? null : scheduleForm.sections,
    };
    if (payload.sections && payload.sections.length === 0) { toast.error(tr('Wybierz co najmniej jedną sekcję raportu.')); return; }
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
    setScheduleForm({ cadence: s.cadence || 'monthly', recipients: (s.recipients || []).join(', '), include_csv: s.include_csv !== false, is_active: s.is_active !== false,
      sections: Array.isArray(s.sections) ? s.sections.filter((k) => MAIL_SECTION_KEYS.includes(k)) : MAIL_SECTION_KEYS });
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
    if (activeTab === 'budget' || activeTab === 'expenses' || activeTab === 'projects') {
      fetchBudgetItems();
    }
  }, [activeTab, selectedYear, selectedCampusId]);

  // Wpływy — także na Budżecie: realizacja planowanych przychodów liczy się z wpływów
  // (wcześniej na Budżecie lista była pusta i realizacja przychodów zawsze 0 zł).
  useEffect(() => {
    if (activeTab === 'income' || activeTab === 'budget') {
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
    const missing = missingFields(budgetForm, [['category', isIncome ? tr('kategorię wpływu') : tr('służbę lub obszar')], ['planned_amount', tr('planowaną kwotę')]]);
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
            period_type: budgetForm.period_type || 'year',
            cost_category: isIncome ? null : (budgetForm.cost_category || null),
            project_id: budgetForm.project_id || null,
            tags: budgetForm.tags || [],
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
          cost_category: isIncome ? null : (budgetForm.cost_category || null),
          project_id: budgetForm.project_id || null,
          tags: budgetForm.tags || [],
          campus_id: campusIdForInsert
        }]).select();

        if (error) throw error;
      }

      toast.success(budgetForm.id ? tr('Zapisano zmiany pozycji') : tr('Dodano pozycję {amount}', { amount: fmtMoney(budgetForm.planned_amount) }));
      ensureTagsInPalette(budgetForm.tags);
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
      // Ślad usunięcia w historii budżetu zapisuje serwer.
      const { error } = await supabase
        .from('budget_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
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
        cost_category: it.cost_category || null, project_id: it.project_id || null, tags: Array.isArray(it.tags) ? it.tags : [],
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
            tags: incomeForm.tags,
            project_id: incomeForm.project_id || null,
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
          tags: incomeForm.tags,
          project_id: incomeForm.project_id || null,
        }]);

        if (error) throw error;
      }

      toast.success(incomeForm.id ? tr('Zapisano zmiany wpływu') : tr('Dodano wpływ {amount}', { amount: fmtMoney(incomeForm.amount) }));
      setShowIncomeModal(false);
      const tags = incomeForm.tags;
      setIncomeForm(EMPTY_INCOME);
      setFormErrors({});
      fetchIncomeTransactions();
      setDataVersion((v) => v + 1);
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
      ['payment_date', tr('datę dokumentu')], ['amount', tr('kwotę')], ['category', tr('służbę lub obszar')],
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
      project_id: expenseForm.project_id || null,
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
      setDataVersion((v) => v + 1);
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

  // Realizacja pozycji = zatwierdzone/opłacone wydatki tej służby z tym opisem (bez wielkości liter/spacji).
  const calculateRealization = (category, description) => realizationFor({ category, description }, expenseTransactions);


  // Filtrowanie wpływów
  const filteredIncomeTransactions = incomeTransactions.filter(transaction => {
    if (incomeFilters.type && transaction.type !== incomeFilters.type) return false;
    if (incomeFilters.source && !String(transaction.source || '').toLowerCase().includes(incomeFilters.source.toLowerCase())) return false;
    if (incomeFilters.tag && (!transaction.tags || !transaction.tags.includes(incomeFilters.tag))) return false;
    if (incomeFilters.project && String(transaction.project_id || '') !== String(incomeFilters.project)) return false;
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
    if (expenseFilters.project && String(transaction.project_id || '') !== String(expenseFilters.project)) return false;
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
  // Etykieta przez areaLabel: zapisany team_type („MediaTeam”, „małe Avenit”) → nazwa modułu z menu.
  const budgetCategories = [...new Set(budgetItems.filter((i) => i.kind !== 'income').map(item => item.category).filter(Boolean))].map(cat => ({ value: cat, label: areaLabel(cat) }));
  const expenseCategoryOptions = [
    ...buildAreaOptions([...budgetCategories, ...serviceOptions], areas, expenseForm.category),
    { value: NEW_OPTION, label: tr('+ Dodaj nowy obszar…') },
  ];
  // Listy wyboru z opcją „+ Dodaj nowy…” (obszar budżetu / kategoria).
  const areaSelectOptions = (current) => [...buildAreaOptions(serviceOptions, areas, current), { value: NEW_OPTION, label: tr('+ Dodaj nowy obszar…') }];
  const categorySelectOptions = (kind, current, withEmpty = true) => {
    const list = kind === 'income' ? incomeCategories : expenseCategories;
    const opts = list.map((c) => ({ value: c.name, label: c.name }));
    if (kind === 'income' && opts.length === 0) ['Kolekta', 'Darowizny', 'Inne'].forEach((v) => opts.push({ value: v, label: tr(v) }));
    if (current && !opts.some((o) => o.value === current)) opts.push({ value: current, label: current });
    return [...(withEmpty ? [{ value: '', label: tr('— brak —') }] : []), ...opts, { value: NEW_OPTION, label: tr('+ Dodaj nową kategorię…') }];
  };
  const budgetDescriptionsFor = (category) => budgetItems
    .filter((item) => item.kind !== 'income' && normKey(item.category) === normKey(category) && item.description)
    .map((item) => ({ value: item.description, label: `${item.description} · ${fmtMoney(item.planned_amount)}` }));

  // Budżet dzieli się na planowane WYDATKI i PRZYCHODY (kolumna kind).
  const [budgetPeriod, setBudgetPeriod] = useState('all'); // filtr okresu: all|year|quarter|month
  const inPeriod = (i) => budgetPeriod === 'all' || (i.period_type || 'year') === budgetPeriod;
  // Grupowanie planu wydatków: wg służby/obszaru (domyślnie), kategorii albo projektu.
  const [budgetGroupBy, setBudgetGroupBy] = useState('area');
  const budgetGroupKey = (i) => {
    if (budgetGroupBy === 'cost_category') return i.cost_category || tr('Bez kategorii');
    if (budgetGroupBy === 'project') return projectById(projects, i.project_id)?.name || tr('Bez projektu');
    return i.category;
  };
  const budgetGroupLabel = { area: tr('Służba / obszar'), cost_category: tr('Kategoria'), project: tr('Projekt') }[budgetGroupBy];
  // Metadane pozycji (kategoria / projekt / tagi; pomija wymiar, po którym grupujemy).
  const itemMeta = (item, showArea = false) => {
    const proj = projectById(projects, item.project_id);
    const hasAny = (showArea && item.category) || (item.cost_category && budgetGroupBy !== 'cost_category') || (proj && budgetGroupBy !== 'project') || (item.tags || []).length;
    if (!hasAny) return null;
    return (
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {showArea && item.category && <StatusPill color={STATUS_COLORS.neutral}>{areaLabel(item.category)}</StatusPill>}
        {item.cost_category && budgetGroupBy !== 'cost_category' && <StatusPill color={categoryColor(item.cost_category)}>{item.cost_category}</StatusPill>}
        {proj && budgetGroupBy !== 'project' && <span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1" style={{ background: `${proj.color || '#6b7280'}22`, color: proj.color || '#6b7280' }}><FolderKanban size={10} />{proj.name}</span>}
        <TagChips tags={item.tags} colorOf={tagColor} />
      </div>
    );
  };
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
              onClick={() => setActiveTab('dictionaries')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 dark:bg-gray-900/80 text-gray-700 dark:text-gray-200 text-sm font-medium shadow-sm hover:bg-white dark:hover:bg-gray-900 backdrop-blur-sm shrink-0"
              title={tr('Kategorie, obszary i tagi')}
              aria-label={tr('Kategorie, obszary i tagi')}
            >
              <Tags size={15} /> <span className="hidden sm:inline">{tr('Kategorie i tagi')}</span>
            </button>
            {/* Raporty mają własny wybór okresu — rok modułu ukrywamy, żeby nie było dwóch selektorów. */}
            {!['reports', 'projects', 'dictionaries'].includes(activeTab) && (
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
          { id: 'projects', label: tr('Projekty'), icon: FolderKanban },
          { id: 'recurring', label: tr('Cykliczne'), icon: Repeat },
          { id: 'reports', label: t('Raporty'), icon: BarChart3 },
          { id: 'dictionaries', label: tr('Kategorie i tagi'), icon: Tags },
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
              <select value={budgetGroupBy} onChange={(e) => setBudgetGroupBy(e.target.value)} aria-label={tr('Grupuj wydatki wg')} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                <option value="area">{tr('Grupuj: służba / obszar')}</option>
                <option value="cost_category">{tr('Grupuj: kategoria')}</option>
                <option value="project">{tr('Grupuj: projekt')}</option>
              </select>
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
                  { label: 'Służba / obszar', value: 'category' }, { label: 'Opis', value: 'description' },
                  { label: 'Rodzaj', value: (r) => (r.kind === 'income' ? 'przychód' : 'wydatek') },
                  { label: 'Kategoria', value: (r) => r.cost_category || '' },
                  { label: 'Projekt', value: (r) => projectById(projects, r.project_id)?.name || '' },
                  { label: 'Tagi', value: (r) => (r.tags || []).join(', ') },
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
                        <TD muted>{it.description}{itemMeta({ ...it, cost_category: null })}</TD>
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
                    <li key={it.id}>{areaLabel(it.category)} — {it.description}: {tr('plan')} {fmtMoney(it.planned_amount)}, {tr('wydano')} {fmtMoney(calculateRealization(it.category, it.description))}</li>
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
            <BudgetExpenseTable
              items={expenseBudgetItems}
              groupKey={budgetGroupKey}
              groupLabel={(k) => (budgetGroupBy === 'area' ? areaLabel(k) : k)}
              columnLabel={budgetGroupLabel}
              realizationOf={(it) => calculateRealization(it.category, it.description)}
              expensesOf={(it) => expenseTransactions.filter((exp) => matchesBudgetItem(exp, it))}
              renderMeta={(it) => itemMeta(it, budgetGroupBy !== 'area')}
              onEdit={openEditBudget}
              onDelete={deleteBudgetItem}
              changesOf={itemChanges}
              onShowChanges={setChangeItem}
              statusLabel={(e) => tr((EXPENSE_STATUS[e.status] || {}).label || e.status)}
            />
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
                  { label: 'Data', value: 'date' }, { label: 'Kategoria', value: 'type' }, { label: 'Źródło', value: 'source' },
                  { label: 'Kwota', value: (r) => num(r.amount) }, { label: 'Notatka', value: 'notes' },
                  { label: 'Projekt', value: (r) => projectById(projects, r.project_id)?.name || '' },
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
                onClick={() => openCreateIncome()}
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
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <CustomSelect
                label={tr('Kategoria')}
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
              <CustomSelect
                label={tr('Projekt')}
                value={incomeFilters.project}
                onChange={(val) => setIncomeFilters({ ...incomeFilters, project: val })}
                options={[{ value: '', label: tr('Wszystkie') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
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
            {(incomeFilters.type || incomeFilters.source || incomeFilters.tag || incomeFilters.project || incomeFilters.dateFrom || incomeFilters.dateTo) && (
              <button
                onClick={() => setIncomeFilters(EMPTY_INCOME_FILTERS)}
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
                action={<Button onClick={() => openCreateIncome()}><Plus size={16} /> {tr('Dodaj pierwszy wpływ')}</Button>}
              />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title={tr('Brak wpływów pasujących do filtrów')}
                action={<Button variant="secondary" onClick={() => setIncomeFilters(EMPTY_INCOME_FILTERS)}>{tr('Wyczyść filtry')}</Button>}
              />
            )
          ) : (
            <DataTable>
                <THead>
                  <tr>
                    <TH>{tr('Data')}</TH>
                    <TH>{tr('Kategoria')}</TH>
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
                        <StatusPill color={categoryColor(transaction.type, 'income')}>
                          {tr(transaction.type || 'Inne')}
                        </StatusPill>
                      </TD>
                      <TD>
                        {transaction.source}
                        {projectById(projects, transaction.project_id) && (
                          <div className="mt-1"><span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1" style={{ background: `${projectColor(transaction.project_id)}22`, color: projectColor(transaction.project_id) }}><FolderKanban size={10} />{projectById(projects, transaction.project_id).name}</span></div>
                        )}
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
                  { label: 'Data', value: 'payment_date' }, { label: 'Służba / obszar', value: 'category' },
                  { label: 'Kategoria', value: 'cost_category' }, { label: 'Opis', value: 'description' },
                  { label: 'Projekt', value: (r) => projectById(projects, r.project_id)?.name || '' },
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
                onClick={() => openCreateExpense()}
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
                label={tr('Służba / obszar')}
                value={expenseFilters.category}
                onChange={(val) => setExpenseFilters({...expenseFilters, category: val})}
                options={[
                  { value: '', label: tr('Wszystkie') },
                  ...[...new Set(expenseTransactions.map((e) => e.category).filter(Boolean))].map((c) => ({ value: c, label: areaLabel(c) })),
                ]}
                placeholder={t('Wszystkie')}
              />
              <CustomSelect
                label={tr('Kategoria')}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
              <CustomSelect
                label={tr('Projekt')}
                value={expenseFilters.project}
                onChange={(val) => setExpenseFilters({ ...expenseFilters, project: val })}
                options={[{ value: '', label: tr('Wszystkie') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
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
            {(expenseFilters.category || expenseFilters.cost_category || expenseFilters.contractor || expenseFilters.responsible || expenseFilters.tag || expenseFilters.project || expenseFilters.dateFrom || expenseFilters.dateTo) && (
              <button
                onClick={() => setExpenseFilters(EMPTY_EXPENSE_FILTERS)}
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
                action={<Button onClick={() => openCreateExpense()}><Plus size={16} /> {canApprove ? tr('Dodaj pierwszy wydatek') : tr('Zgłoś wydatek')}</Button>}
              />
            ) : (
              <EmptyState
                icon={Receipt}
                title={tr('Brak wydatków pasujących do filtrów')}
                action={<Button variant="secondary" onClick={() => setExpenseFilters(EMPTY_EXPENSE_FILTERS)}>{tr('Wyczyść filtry')}</Button>}
              />
            )
          ) : (
            <DataTable minWidth={900}>
                <THead>
                  <tr>
                    <TH>{tr('Data')}</TH>
                    <TH>{tr('Służba / kategoria')}</TH>
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
                              {areaLabel(transaction.category)}
                            </StatusPill>
                          )}
                          {transaction.cost_category && (
                            <StatusPill color={categoryColor(transaction.cost_category)}>
                              {transaction.cost_category}
                            </StatusPill>
                          )}
                        </div>
                      </TD>
                      <TD>
                        {transaction.description || ''}
                        {projectById(projects, transaction.project_id) && (
                          <div className="mt-1"><span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1" style={{ background: `${projectColor(transaction.project_id)}22`, color: projectColor(transaction.project_id) }}><FolderKanban size={10} />{projectById(projects, transaction.project_id).name}</span></div>
                        )}
                        <TagChips tags={transaction.tags} colorOf={tagColor} className="mt-1" />
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
                                // Faktury czytane tylko przez podpisany, wygasający link (bucket finance).
                                onClick={(e) => { if (isProtectedFileUrl(doc.url)) { e.preventDefault(); openProtectedFile(doc.url); } }}
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
                        {r.category ? ` · ${r.kind === 'income' ? r.category : areaLabel(r.category)}` : ''}
                        {r.cost_category ? ` · ${r.cost_category}` : ''}
                        {projectById(projects, r.project_id) ? ` · ${projectById(projects, r.project_id).name}` : ''}
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
                    <button onClick={() => { setRecurringForm({ ...emptyRecurring, ...r, amount: String(num(r.amount)), title: r.title || '', category: r.category || '', team_type: r.team_type || '', contractor: r.contractor || '', day_of_month: r.day_of_month || '', next_run_date: r.next_run_date || '', end_date: r.end_date || '', cost_category: r.cost_category || '', project_id: r.project_id || '', tags: Array.isArray(r.tags) ? r.tags : [] }); setFormErrors({}); setShowRecurringModal(true); }} className="p-2 text-gray-500 dark:text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg shrink-0" title={tr('Edytuj')} aria-label={tr('Edytuj plan {name}', { name: r.title })}><Edit2 size={16} /></button>
                    <button onClick={() => deleteRecurring(r)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0" title={tr('Usuń')} aria-label={tr('Usuń plan {name}', { name: r.title })}><Trash2 size={16} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* PROJECTS TAB */}
      {activeTab === 'projects' && (
        <FinanceProjects
          projects={projects}
          reloadProjects={fetchProjects}
          tagColor={tagColor}
          dataVersion={dataVersion}
          currentUserEmail={currentUserEmail}
          onAddExpense={(id) => openCreateExpense(id)}
          onAddIncome={(id) => openCreateIncome(id)}
        />
      )}

      {/* DICTIONARIES TAB — obszary, kategorie, tagi, kontrahenci */}
      {activeTab === 'dictionaries' && (
        <FinanceDictionaries
          serviceOptions={serviceOptions}
          areas={areas}
          categories={categories}
          tagPalette={tagPalette}
          vendors={vendors}
          reload={{
            areas: fetchAreas, categories: fetchCategories, tags: fetchTagPalette, vendors: fetchVendors,
            data: () => { fetchRecurring(); setDataVersion((v) => v + 1); },
          }}
        />
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
                <button onClick={() => setShowSectionsMenu((v) => !v)} aria-expanded={showSectionsMenu} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm" title={tr('Wybierz, co ma się znaleźć w raporcie')}>
                  <SlidersHorizontal size={16} /> {tr('Sekcje')} <span className="text-xs text-gray-400 tabular-nums">{enabledKeys(reportSections).length}/{REPORT_SECTIONS.length}</span>
                </button>
                {showSectionsMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSectionsMenu(false)} />
                    <div className="absolute right-0 mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 p-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{tr('Elementy raportu')}</div>
                      <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                        {REPORT_SECTIONS.map((sct) => (
                          <label key={sct.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer py-1 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                            <input type="checkbox" checked={sec(sct.key)} onChange={(e) => setSection(sct.key, e.target.checked)} className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary" />
                            {tr(sct.label)}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <button onClick={() => setAllSections(Object.fromEntries(REPORT_SECTIONS.map((x) => [x.key, true])))} className="text-xs text-accent-primary hover:underline">{tr('Zaznacz wszystko')}</button>
                        <button onClick={() => setAllSections(defaultSections())} className="text-xs text-gray-500 hover:underline">{tr('Domyślne')}</button>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-2">{tr('Wybór dotyczy widoku, PDF, Excela, CSV i treści maila.')}</p>
                    </div>
                  </>
                )}
              </div>
              {canExport && (<>
              <button onClick={() => setShowExportModal(true)} disabled={exporting} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm disabled:opacity-60" title={tr('PDF, druk, Excel lub CSV — z wyborem, co ma się znaleźć w raporcie')}>
                {exporting ? <Spinner size={14} /> : <Download size={16} />} {exporting ? tr('Generowanie…') : tr('Pobierz / drukuj')}
              </button>
              <button onClick={() => setShowReportEmailModal(true)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm" title={tr('Wyślij raport mailem')}>
                <Mail size={16} /> {tr('Wyślij raport')}
              </button>
              <button onClick={() => { setEditingScheduleId(null); setScheduleForm(emptySchedule); setShowScheduleModal(true); }} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm" title={tr('Automatyczna wysyłka')}>
                <CalendarClock size={16} /> {tr('Harmonogram')}{schedules.filter((s) => s.is_active !== false).length > 0 ? ` (${schedules.filter((s) => s.is_active !== false).length})` : ''}
              </button>
              </>)}
            </div>
          </div>

          {/* Co wliczyć: odznaczenie wyklucza (wszystkie projekty, jeden projekt, kategorię, tag…) */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 print:hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <ExcludePicker label={tr('Projekty')} options={reportExcludeOptions.projects} excluded={reportExclude.projects} onChange={(l) => setExcluded('projects', l)} />
              <ExcludePicker label={tr('Służby / obszary')} options={reportExcludeOptions.areas} excluded={reportExclude.areas} onChange={(l) => setExcluded('areas', l)} />
              <ExcludePicker label={tr('Kategorie wydatków')} options={reportExcludeOptions.costCategories} excluded={reportExclude.costCategories} onChange={(l) => setExcluded('costCategories', l)} />
              <ExcludePicker label={tr('Kategorie wpływów')} options={reportExcludeOptions.incomeCategories} excluded={reportExclude.incomeCategories} onChange={(l) => setExcluded('incomeCategories', l)} />
              <ExcludePicker label={tr('Tagi')} options={reportExcludeOptions.tags} excluded={reportExclude.tags} onChange={(l) => setExcluded('tags', l)} />
            </div>
            {hasExclusions(reportExclude) ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-gray-600 dark:text-gray-300">{tr('Wyłączone z raportu')}: {reportFilterLabel}</span>
                <button onClick={() => setReportExclude(EMPTY_REPORT_EXCLUDE)} className="text-accent-primary dark:text-accent-primary-light hover:underline">{tr('Uwzględnij wszystko')}</button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{tr('Raport obejmuje wszystko. Odznacz w listach to, czego ma nie uwzględniać.')}</p>
            )}
          </div>

          {/* Treść raportu (źródło PDF) */}
          <div ref={reportSectionRef} className="space-y-6 bg-gray-50 dark:bg-gray-950 rounded-2xl p-1" style={exportWidth ? { width: exportWidth, maxWidth: 'none' } : undefined}>
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
            {sec('summary') && (() => {
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
            {sec('kpis') && (() => {
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
            {sec('incomeExpense') && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-accent-primary" />{tr('Wpływy vs Wydatki')}</h3>
              <IncomeExpenseBarChart buckets={reportModel.buckets} tr={tr} />
              <BucketTable buckets={reportModel.buckets} tr={tr} />
            </div>
            )}

            {/* Przepływ gotówki */}
            {sec('cashflow') && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-accent-primary" />{tr('Przepływ gotówki (skumulowany)')}</h3>
              <CashFlowAreaChart buckets={reportModel.buckets} tr={tr} />
              {/* Tabela okresów pokazujemy raz — pod wykresem wpływów/wydatków albo tu, gdy tamten wyłączony. */}
              {!sec('incomeExpense') && <BucketTable buckets={reportModel.buckets} tr={tr} />}
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{tr('Saldo na koniec okresu')}: <span className={`font-bold tabular-nums ${reportModel.totals.balance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{fmtMoney(reportModel.buckets.at(-1)?.cumulative)}</span></div>
            </div>
            )}

            {/* Sekcje w parach (dwie kolumny na szerokim ekranie); wyłączona sekcja znika, druga zajmuje całą szerokość. */}
            {(() => {
              const card = (key, icon, title, body) => (sec(key) ? (
                <div key={key} className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">{icon}{title}</h3>
                  {body}
                </div>
              ) : null);
              const pair = (id, a, b) => {
                const items = [a, b].filter(Boolean);
                if (!items.length) return null;
                return <div key={id} className={`grid grid-cols-1 ${items.length === 2 ? 'lg:grid-cols-2' : ''} gap-6`}>{items}</div>;
              };
              return [
                pair('p-exp',
                  card('byCostCategory', <PieChart size={20} className="text-accent-primary" />, tr('Wydatki wg kategorii'), <CategoryDonut data={reportModel.byCostCategory} tr={tr} />),
                  card('byArea', <PieChart size={20} className="text-accent-primary" />, tr('Wydatki wg służby / obszaru'), <CategoryDonut data={reportModel.byServiceCategory} tr={tr} />)),
                pair('p-inc',
                  card('byIncomeType', <Users size={20} className="text-accent-primary" />, tr('Wpływy wg kategorii'), <CategoryDonut data={reportModel.byIncomeType} tr={tr} />),
                  card('byIncomeSource', <TrendingUp size={20} className="text-accent-primary" />, tr('Wpływy wg źródła'), <CategoryDonut data={reportModel.byIncomeSource} tr={tr} />)),
                card('byProject', <FolderKanban size={20} className="text-accent-primary" />, tr('Projekty'),
                  reportModel.byProject.length > 0 ? (
                    <DataTable>
                      <THead>
                        <tr>
                          <TH>{tr('Projekt')}</TH>
                          <TH align="right">{tr('Plan')}</TH>
                          <TH align="right">{tr('Wydano')}</TH>
                          <TH align="center">{tr('Realizacja')}</TH>
                          <TH align="right">{tr('Zebrano')}</TH>
                          <TH align="right">{tr('Bilans')}</TH>
                        </tr>
                      </THead>
                      <tbody>
                        {reportModel.byProject.map((p) => (
                          <TR key={p.id}>
                            <TD className="font-medium text-gray-900 dark:text-white"><span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color || '#6b7280' }} />{p.name}</span></TD>
                            <TD align="right" numeric className="whitespace-nowrap">{p.planned > 0 ? fmtMoney(p.planned) : '—'}</TD>
                            <TD align="right" numeric className="whitespace-nowrap">{fmtMoney(p.spent)}</TD>
                            <TD align="center" numeric>{p.planned > 0 ? fmtPct(p.pct, 0) : '—'}</TD>
                            <TD align="right" numeric className="whitespace-nowrap text-emerald-700 dark:text-emerald-400">{fmtMoney(p.raised)}</TD>
                            <TD align="right" numeric className={`font-semibold whitespace-nowrap ${p.balance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{fmtMoney(p.balance)}</TD>
                          </TR>
                        ))}
                      </tbody>
                    </DataTable>
                  ) : <EmptyState icon={FolderKanban} title={tr('Brak transakcji przypisanych do projektów w tym okresie')} compact />),
                card('byTag', <Tags size={20} className="text-accent-primary" />, tr('Tagi'),
                  reportModel.byTag.length > 0 ? (
                    <>
                      <DataTable>
                        <THead>
                          <tr>
                            <TH>{tr('Tag')}</TH>
                            <TH align="right">{tr('Wydatki')}</TH>
                            <TH align="right">{tr('Wpływy')}</TH>
                            <TH align="right">{tr('Transakcje')}</TH>
                          </tr>
                        </THead>
                        <tbody>
                          {reportModel.byTag.map((tg) => (
                            <TR key={tg.name}>
                              <TD><TagChips tags={[tg.name]} colorOf={tagColor} /></TD>
                              <TD align="right" numeric className="whitespace-nowrap">{fmtMoney(tg.expense)}</TD>
                              <TD align="right" numeric className="whitespace-nowrap text-emerald-700 dark:text-emerald-400">{fmtMoney(tg.income)}</TD>
                              <TD align="right" numeric>{tg.count}</TD>
                            </TR>
                          ))}
                        </tbody>
                      </DataTable>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{tr('Transakcja z kilkoma tagami liczy się w każdym z nich.')}</p>
                    </>
                  ) : <EmptyState icon={Tags} title={tr('Brak otagowanych transakcji w tym okresie')} compact />),
                pair('p-top',
                  card('topExpenses', <Receipt size={20} className="text-accent-primary" />, tr('Największe wydatki'), (
                reportModel.topExpenses.length > 0 ? (
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
                ) : <EmptyState icon={Receipt} title={t('Brak danych o wydatkach')} compact />
                  )),
                  card('expenseStatus', <CheckCircle size={20} className="text-accent-primary" />, tr('Status wydatków'), (
                reportModel.expenseStatus.length > 0 ? (
                  <div className="space-y-3">
                    {(() => {
                      const STc = { draft: ['Szkic', '#9ca3af'], submitted: ['Do akceptacji', '#eda100'], approved: ['Zatwierdzone', '#2a78d6'], rejected: ['Odrzucone', '#e34948'], paid: ['Opłacone', '#0ca30c'] };
                      const total = reportModel.expenseStatus.reduce((a, s) => a + s.amount, 0) || 1;
                      return reportModel.expenseStatus.map((s) => {
                        const [lbl, col] = STc[s.status] || [s.status, '#6b7280'];
                        const pct = (s.amount / total) * 100;
                        return (
                          <div key={s.status}>
                            <div className="flex justify-between text-sm mb-2"><span className="text-gray-700 dark:text-gray-300">{tr(lbl)} <span className="text-gray-500">({s.count})</span>{(s.status === 'submitted' || s.status === 'draft' || s.status === 'rejected') && <span className="text-xs text-gray-500"> · {tr('poza bilansem')}</span>}</span><span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(s.amount)}</span></div>
                            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: col }} /></div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : <EmptyState icon={CheckCircle} title={t('Brak danych o wydatkach')} compact />
                  ))),
              ];
            })()}

            {/* Realizacja budżetu */}
            {sec('budgetExecution') && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><DollarSign size={20} className="text-accent-primary" />{tr('Realizacja budżetu wg służb i obszarów')} ({reportRange.year})</h3>
              {reportModel.budgetExecution.length > 0 ? (
                <DataTable>
                  <THead>
                    <tr>
                      <TH>{tr('Służba / obszar')}</TH>
                      <TH align="right">{t('Planowany')}</TH>
                      <TH align="right">{t('Zrealizowany')}</TH>
                      <TH align="center">{t('Realizacja')}</TH>
                      <TH align="right">{t('Pozostało')}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {reportModel.budgetExecution.map((b) => {
                      // Pełny kolor zamiast gradientu Tailwinda (zmienne CSS) — html2canvas nie rysuje takiego gradientu w PDF.
                      const progressColor = b.pct < 80 ? 'bg-green-500' : b.pct <= 100 ? 'bg-yellow-500' : 'bg-red-500';
                      return (
                        <TR key={b.category}>
                          <TD className="font-medium text-gray-900 dark:text-white">{b.category}</TD>
                          <TD align="right" numeric className="whitespace-nowrap">{fmtMoney(b.planned)}</TD>
                          <TD align="right" numeric className="whitespace-nowrap">{fmtMoney(b.realized)}</TD>
                          <TD><div className="flex items-center gap-2"><div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2"><div className={`h-2 rounded-full ${progressColor}`} style={{ width: `${Math.min(b.pct, 100)}%` }} /></div><span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white w-14 text-right">{fmtPct(b.pct, 0)}</span></div></TD>
                          <TD align="right" numeric className={`font-semibold whitespace-nowrap ${b.remaining >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{fmtMoney(b.remaining)}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </DataTable>
              ) : <EmptyState icon={DollarSign} title={tr('Brak planu wydatków na rok {year}', { year: reportRange.year })} compact />}
            </div>
            )}

            {/* Nieopłacone zobowiązania / faktury */}
            {sec('unpaid') && reportModel.unpaidInvoices.length > 0 && (
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
            {sec('yoy') && reportModel.yoy && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-accent-primary" />{tr('Porównanie rok do roku')} ({reportRange.year - 1} → {reportRange.year})</h3>
                <YoYBars yoy={reportModel.yoy} prevLabel={reportRange.year - 1} nowLabel={reportRange.year} tr={tr} />
              </div>
            )}

            {/* Listy transakcji (domyślnie wyłączone — do wydruku szczegółowego) */}
            {sec('incomeList') && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><ArrowUpRight size={20} className="text-green-600" />{tr('Lista wpływów')} <span className="text-sm font-normal text-gray-400">({reportModel.raw.income.length})</span></h3>
                {reportModel.raw.income.length === 0 ? <EmptyState icon={TrendingUp} title={tr('Brak wpływów w tym okresie')} compact /> : (
                  <DataTable>
                    <THead><tr><TH>{tr('Data')}</TH><TH>{tr('Kategoria')}</TH><TH>{tr('Źródło')}</TH><TH>{tr('Projekt')}</TH><TH align="right">{tr('Kwota')}</TH></tr></THead>
                    <tbody>
                      {reportModel.raw.income.map((r) => (
                        <TR key={r.id}>
                          <TD numeric className="whitespace-nowrap">{fmtDate(r.date)}</TD>
                          <TD>{tr(r.type || 'Inne')}</TD>
                          <TD muted>{tr(r.source)}<TagChips tags={r.tags} colorOf={tagColor} className="mt-1" /></TD>
                          <TD muted>{projectById(projects, r.project_id)?.name || ''}</TD>
                          <TD align="right" numeric className="font-semibold whitespace-nowrap">{fmtMoney(r.amount)}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </div>
            )}
            {sec('expenseList') && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><ArrowDownRight size={20} className="text-red-600" />{tr('Lista wydatków')} <span className="text-sm font-normal text-gray-400">({reportModel.raw.expense.length})</span></h3>
                {reportModel.raw.expense.length === 0 ? <EmptyState icon={Receipt} title={tr('Brak wydatków w tym okresie')} compact /> : (
                  <DataTable>
                    <THead><tr><TH>{tr('Data')}</TH><TH>{tr('Służba / kategoria')}</TH><TH>{tr('Opis')}</TH><TH>{tr('Projekt')}</TH><TH align="right">{tr('Kwota')}</TH></tr></THead>
                    <tbody>
                      {reportModel.raw.expense.map((r) => (
                        <TR key={r.id}>
                          <TD numeric className="whitespace-nowrap">{fmtDate(r.payment_date)}</TD>
                          <TD muted>{[r.category, r.cost_category].filter(Boolean).join(' · ')}</TD>
                          <TD>{r.description || r.contractor}<TagChips tags={r.tags} colorOf={tagColor} className="mt-1" /></TD>
                          <TD muted>{projectById(projects, r.project_id)?.name || ''}</TD>
                          <TD align="right" numeric className={`font-semibold whitespace-nowrap ${isCountedExpense(r) ? '' : 'text-gray-400'}`}>{fmtMoney(r.amount)}{!isCountedExpense(r) && <div className="text-[11px] font-normal">{tr((EXPENSE_STATUS[r.status] || {}).label || r.status)}</div>}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </div>
            )}
            {enabledKeys(activeSections).length === 0 && (
              <EmptyState icon={SlidersHorizontal} title={tr('Wszystkie sekcje raportu są wyłączone')} subtitle={tr('Włącz je przyciskiem „Sekcje”.')} />
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
          {recurringForm.kind === 'income' ? (
            <CustomSelect
              label={tr('Kategoria wpływu')}
              value={recurringForm.category}
              onChange={pickOrCreate(() => createCategory('income'), (val) => setRecurringForm((f) => ({ ...f, category: val })))}
              options={categorySelectOptions('income', recurringForm.category)}
              placeholder={tr('Wybierz')}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CustomSelect
                label={tr('Służba / obszar')}
                value={recurringForm.category}
                onChange={pickOrCreate(createArea, (val) => setRecurringForm((f) => ({ ...f, category: val, team_type: val })))}
                options={[{ value: '', label: tr('— brak —') }, ...areaSelectOptions(recurringForm.category)]}
                placeholder={tr('Wybierz')}
              />
              <CustomSelect
                label={tr('Kategoria')}
                value={recurringForm.cost_category}
                onChange={pickOrCreate(() => createCategory('expense'), (val) => setRecurringForm((f) => ({ ...f, cost_category: val })))}
                options={categorySelectOptions('expense', recurringForm.cost_category)}
                placeholder={tr('Wybierz')}
              />
            </div>
          )}
          {projects.length > 0 && (
            <CustomSelect
              label={tr('Projekt')}
              value={recurringForm.project_id}
              onChange={(val) => setRecurringForm({ ...recurringForm, project_id: val })}
              options={projectOptions(projects, recurringForm.project_id, tr)}
            />
          )}
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
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Tagi')}</label>
            <TagPicker value={recurringForm.tags} onChange={(tags) => setRecurringForm((f) => ({ ...f, tags }))} palette={tagPalette} colorOf={tagColor} />
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
            label={tr('Służba / obszar')}
            value={proposalForm.team_type}
            onChange={(val) => setProposalForm({ ...proposalForm, team_type: val })}
            options={buildAreaOptions(serviceOptions, areas, proposalForm.team_type)}
            placeholder={tr('Wybierz służbę lub obszar')}
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

      <ReportExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        viewSections={reportSections}
        rangeLabel={reportRange.label}
        busy={exporting}
        onGenerate={doExport}
      />

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
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{tr('Raport z wybranymi sekcjami trafi na wskazane adresy.')}</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {REPORT_SECTIONS.filter((x) => x.mail && sec(x.key)).map((x) => (
              <span key={x.key} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{tr(x.label)}</span>
            ))}
            <button type="button" onClick={() => { setShowReportEmailModal(false); setShowSectionsMenu(true); }} className="text-xs text-accent-primary hover:underline">{tr('Zmień sekcje')}</button>
          </div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Adresy e-mail')}</label>
          <textarea
            rows={3}
            value={reportRecipients}
            onChange={(e) => setReportRecipients(e.target.value)}
            placeholder={tr('jan@nasz-kosciol.pl, skarbnik@nasz-kosciol.pl (oddziel przecinkiem lub enterem)')}
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
                    {Array.isArray(s.sections) && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{tr('Sekcje')}: {s.sections.map((k) => tr(REPORT_SECTIONS.find((x) => x.key === k)?.label || k)).join(', ')}</p>}
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
              <textarea rows={2} value={scheduleForm.recipients} onChange={(e) => setScheduleForm((f) => ({ ...f, recipients: e.target.value }))} placeholder={tr('skarbnik@nasz-kosciol.pl, zarzad@nasz-kosciol.pl')} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Sekcje w mailu')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {REPORT_SECTIONS.filter((x) => x.mail).map((x) => (
                  <label key={x.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={scheduleForm.sections.includes(x.key)}
                      onChange={(e) => setScheduleForm((f) => ({ ...f, sections: e.target.checked ? [...f.sections, x.key] : f.sections.filter((k) => k !== x.key) }))}
                      className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary" />
                    {tr(x.label)}
                  </label>
                ))}
              </div>
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
                      <div className="text-gray-800 dark:text-gray-100 truncate">{a.category ? areaLabel(a.category) : a.category}{a.description ? ` — ${a.description}` : ''}</div>
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
              onChange={pickOrCreate(() => createCategory('income'), (val) => setBudgetForm((f) => ({ ...f, category: val })))}
              options={categorySelectOptions('income', budgetForm.category, false)}
              placeholder={tr('Wybierz kategorię')}
            />
          ) : (
            <div>
              <CustomSelect
                label={`${tr('Służba / obszar')} *`}
                value={budgetForm.category}
                onChange={pickOrCreate(createArea, (val) => setBudgetForm((f) => ({ ...f, category: val })))}
                options={areaSelectOptions(budgetForm.category)}
                placeholder={tr('Wybierz służbę lub obszar')}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tr('Nie ma na liście? Wybierz „+ Dodaj nowy obszar…” — np. Administracja, Wynajem budynku.')}</p>
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(budgetForm.kind || 'expense') !== 'income' && (
              <CustomSelect
                label={tr('Kategoria')}
                value={budgetForm.cost_category || ''}
                onChange={pickOrCreate(() => createCategory('expense'), (val) => setBudgetForm((f) => ({ ...f, cost_category: val })))}
                options={categorySelectOptions('expense', budgetForm.cost_category)}
                placeholder={tr('Wybierz kategorię')}
              />
            )}
            <CustomSelect
              label={tr('Projekt')}
              value={budgetForm.project_id || ''}
              onChange={(val) => setBudgetForm({ ...budgetForm, project_id: val })}
              options={projectOptions(projects, budgetForm.project_id, tr)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Tagi')}</label>
            <TagPicker value={budgetForm.tags || []} onChange={(tags) => setBudgetForm((f) => ({ ...f, tags }))} palette={tagPalette} colorOf={tagColor} />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CustomSelect
              label={tr('Kategoria wpływu')}
              value={incomeForm.type}
              onChange={pickOrCreate(() => createCategory('income'), (val) => setIncomeForm((f) => ({ ...f, type: val })))}
              options={categorySelectOptions('income', incomeForm.type, false)}
            />
            <CustomSelect
              label={tr('Projekt')}
              value={incomeForm.project_id || ''}
              onChange={(val) => setIncomeForm({ ...incomeForm, project_id: val })}
              options={projectOptions(projects, incomeForm.project_id, tr)}
            />
          </div>
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
            <TagPicker value={incomeForm.tags} onChange={(tags) => setIncomeForm((f) => ({ ...f, tags }))} palette={tagPalette} colorOf={tagColor} />
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
                label={`${tr('Służba / obszar')} *`}
                value={expenseForm.category}
                onChange={pickOrCreate(createArea, (val) => {
                  setExpenseForm((f) => ({ ...f, category: val, description: '' }));
                  setExpenseOffBudget(budgetDescriptionsFor(val).length === 0);
                })}
                options={expenseCategoryOptions}
                placeholder={tr('Wybierz służbę lub obszar')}
              />
              {formErrors.category && <p className="text-xs text-red-700 dark:text-red-400 mt-1">{tr('Wybierz służbę lub obszar.')}</p>}
            </div>
            {expenseForm.category && (
              <div>
                <CustomSelect
                  label={`${tr('Pozycja budżetu')} *`}
                  value={expenseOffBudget ? OFF_BUDGET : expenseForm.description}
                  onChange={(val) => {
                    if (val === OFF_BUDGET) { setExpenseOffBudget(true); setExpenseForm({ ...expenseForm, description: '' }); }
                    else {
                      // Kategoria, projekt i tagi z pozycji budżetu — o ile nie wybrano ich już ręcznie.
                      const bi = budgetItems.find((b) => b.kind !== 'income' && normKey(b.category) === normKey(expenseForm.category) && b.description === val);
                      setExpenseOffBudget(false);
                      setExpenseForm({
                        ...expenseForm, description: val,
                        cost_category: expenseForm.cost_category || bi?.cost_category || '',
                        project_id: expenseForm.project_id || bi?.project_id || '',
                        tags: expenseForm.tags?.length ? expenseForm.tags : (Array.isArray(bi?.tags) ? bi.tags : []),
                      });
                    }
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

          {/* Kategoria (rodzaj kosztu, niezależny od służby) + projekt */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CustomSelect
              label={tr('Kategoria (opcjonalnie)')}
              value={expenseForm.cost_category}
              onChange={pickOrCreate(() => createCategory('expense'), (val) => setExpenseForm((f) => ({ ...f, cost_category: val })))}
              options={categorySelectOptions('expense', expenseForm.cost_category)}
              placeholder={tr('Wybierz kategorię')}
            />
            <CustomSelect
              label={tr('Projekt (opcjonalnie)')}
              value={expenseForm.project_id || ''}
              onChange={(val) => setExpenseForm({ ...expenseForm, project_id: val })}
              options={projectOptions(projects, expenseForm.project_id, tr)}
            />
          </div>

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
            <TagPicker value={expenseForm.tags} onChange={(tags) => setExpenseForm((f) => ({ ...f, tags }))} palette={tagPalette} colorOf={tagColor} />
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
