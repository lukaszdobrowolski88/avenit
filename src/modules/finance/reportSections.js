// Sekcje raportu finansowego, które użytkownik może włączać/wyłączać.
// Ten sam wybór steruje widokiem, PDF (zrzut widoku), XLSX/CSV i treścią maila.
// `mail: true` = sekcja ma odpowiednik w mailu (lib/finance-report.js na serwerze).

export const REPORT_SECTIONS = [
  { key: 'summary', label: 'Bilans i stan kont', group: 'Podsumowanie', mail: true },
  { key: 'kpis', label: 'Wskaźniki (średnie, do zapłaty)', group: 'Podsumowanie' },
  { key: 'incomeExpense', label: 'Wykres: wpływy vs wydatki', group: 'Wykresy' },
  { key: 'cashflow', label: 'Wykres: przepływ gotówki', group: 'Wykresy' },
  { key: 'yoy', label: 'Porównanie rok do roku', group: 'Wykresy' },
  { key: 'byCostCategory', label: 'Wydatki wg kategorii', group: 'Zestawienia', mail: true },
  { key: 'byArea', label: 'Wydatki wg służby / obszaru', group: 'Zestawienia', mail: true },
  { key: 'byIncomeType', label: 'Wpływy wg kategorii', group: 'Zestawienia', mail: true },
  { key: 'byIncomeSource', label: 'Wpływy wg źródła', group: 'Zestawienia' },
  { key: 'byProject', label: 'Projekty', group: 'Zestawienia', mail: true },
  { key: 'byTag', label: 'Tagi', group: 'Zestawienia', mail: true },
  { key: 'budgetExecution', label: 'Realizacja budżetu', group: 'Wydatki i budżet', mail: true },
  { key: 'topExpenses', label: 'Największe wydatki', group: 'Wydatki i budżet', mail: true },
  { key: 'expenseStatus', label: 'Status wydatków', group: 'Wydatki i budżet' },
  { key: 'unpaid', label: 'Nieopłacone zobowiązania', group: 'Wydatki i budżet', mail: true },
  { key: 'incomeList', label: 'Lista wpływów', group: 'Listy transakcji', off: true },
  { key: 'expenseList', label: 'Lista wydatków', group: 'Listy transakcji', off: true },
];
export const SECTION_GROUPS = ['Podsumowanie', 'Wykresy', 'Zestawienia', 'Wydatki i budżet', 'Listy transakcji'];

export const MAIL_SECTION_KEYS = REPORT_SECTIONS.filter((s) => s.mail).map((s) => s.key);

// Domyślnie włączone wszystko poza długimi listami transakcji.
export const defaultSections = () =>
  Object.fromEntries(REPORT_SECTIONS.map((s) => [s.key, !s.off]));

const STORAGE_KEY = 'finance.report.sections.v1';

// Wybór sekcji zapamiętany w przeglądarce (wygoda jednej osoby, nie stan współdzielony).
export function loadSections() {
  const base = defaultSections();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    Object.keys(base).forEach((k) => { if (typeof saved?.[k] === 'boolean') base[k] = saved[k]; });
  } catch { /* prywatne okno / zablokowany storage — domyślne */ }
  return base;
}

export function saveSections(sections) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sections)); } catch { /* ignoruj */ }
}

// Lista kluczy włączonych sekcji (do maila / harmonogramu).
export const enabledKeys = (sections) => Object.keys(sections || {}).filter((k) => sections[k]);

// Wykluczenia w raporcie: domyślnie wszystko wliczone; odznaczenie wartości ją wyklucza.
// Wymiary: projekty, służby/obszary (wydatki), kategorie wydatków, kategorie wpływów, tagi.
// NONE = „bez projektu / bez kategorii / bez tagów”.
export const NONE = '__none__';
export const EXCLUDE_DIMENSIONS = ['projects', 'areas', 'costCategories', 'incomeCategories', 'tags'];
export const EMPTY_REPORT_EXCLUDE = { projects: [], areas: [], costCategories: [], incomeCategories: [], tags: [] };

export const hasExclusions = (ex) => !!ex && EXCLUDE_DIMENSIONS.some((d) => (ex[d] || []).length > 0);

const val = (v) => (v == null || v === '' ? NONE : String(v));

/**
 * Wiersze po wykluczeniach. kind: 'income' | 'expense' | 'budget'.
 * Projekt i tagi dotyczą wszystkich; służba/obszar i kategoria wydatków — wydatków (i planu
 * wydatków); kategoria wpływów — wpływów (i planu przychodów). Wiersz z wykluczonym tagiem
 * wypada (nawet gdy ma też inne tagi); bez tagów wypada, gdy wykluczono „bez tagów”.
 */
export function applyReportExclusions(rows, ex, kind) {
  if (!hasExclusions(ex)) return rows || [];
  const s = Object.fromEntries(EXCLUDE_DIMENSIONS.map((d) => [d, new Set((ex[d] || []).map(String))]));
  return (rows || []).filter((r) => {
    if (s.projects.size && s.projects.has(val(r.project_id))) return false;
    if (s.tags.size) {
      const tags = Array.isArray(r.tags) ? r.tags.filter(Boolean) : [];
      if (tags.length ? tags.some((t) => s.tags.has(String(t))) : s.tags.has(NONE)) return false;
    }
    const isIncome = kind === 'income' || (kind === 'budget' && r.kind === 'income');
    if (isIncome) {
      const cat = kind === 'income' ? r.type : r.category;
      if (s.incomeCategories.size && s.incomeCategories.has(val(cat))) return false;
    } else {
      if (s.areas.size && s.areas.has(val(r.category))) return false;
      if (s.costCategories.size && s.costCategories.has(val(r.cost_category))) return false;
    }
    return true;
  });
}

/** Opis wykluczeń (po „Wyłączone z raportu:”) do nagłówka raportu, PDF, plików i maila. */
export function describeExclusions(ex, { tr = (x) => x, projectName = (id) => id, areaName = (v) => v, totals = {} } = {}) {
  if (!hasExclusions(ex)) return '';
  const LABEL = { projects: 'Projekty', areas: 'Służby / obszary', costCategories: 'Kategorie wydatków', incomeCategories: 'Kategorie wpływów', tags: 'Tagi' };
  const NONE_LABEL = { projects: '(bez projektu)', areas: '(bez obszaru)', costCategories: '(bez kategorii)', incomeCategories: '(bez kategorii)', tags: '(bez tagów)' };
  return EXCLUDE_DIMENSIONS.filter((d) => (ex[d] || []).length).map((d) => {
    const list = ex[d];
    if (totals[d] && list.length >= totals[d]) return `${tr(LABEL[d])}: ${tr('wyłączone')}`;
    const names = list.map((v) => (v === NONE ? tr(NONE_LABEL[d]) : d === 'projects' ? projectName(v) : d === 'areas' ? areaName(v) : v));
    return `${tr(LABEL[d])}: ${names.join(', ')}`;
  }).join(' · ');
}

const EXCLUDE_KEY = 'finance.report.exclude.v1';
export function loadExclusions() {
  try {
    const raw = window.localStorage.getItem(EXCLUDE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return Object.fromEntries(EXCLUDE_DIMENSIONS.map((d) => [d, Array.isArray(saved?.[d]) ? saved[d].map(String) : []]));
  } catch { return { ...EMPTY_REPORT_EXCLUDE }; }
}
export function saveExclusions(ex) {
  try { window.localStorage.setItem(EXCLUDE_KEY, JSON.stringify(ex)); } catch { /* ignoruj */ }
}

// Ostatnie ustawienia okna „Pobierz / drukuj” (format, orientacja, sekcje) — osobno od widoku.
const EXPORT_KEY = 'finance.report.export.v1';
export const EXPORT_FORMATS = ['pdf', 'print', 'xlsx', 'csv'];
export function loadExportPrefs(viewSections) {
  const base = { format: 'pdf', orientation: 'p', sections: { ...viewSections } };
  try {
    const saved = JSON.parse(window.localStorage.getItem(EXPORT_KEY) || 'null');
    if (!saved) return base;
    const sections = { ...viewSections };
    Object.keys(sections).forEach((k) => { if (typeof saved.sections?.[k] === 'boolean') sections[k] = saved.sections[k]; });
    return {
      format: EXPORT_FORMATS.includes(saved.format) ? saved.format : 'pdf',
      orientation: saved.orientation === 'l' ? 'l' : 'p',
      sections,
    };
  } catch { return base; }
}
export function saveExportPrefs(prefs) {
  try { window.localStorage.setItem(EXPORT_KEY, JSON.stringify(prefs)); } catch { /* ignoruj */ }
}
