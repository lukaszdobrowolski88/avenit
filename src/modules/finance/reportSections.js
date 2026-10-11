// Sekcje raportu finansowego, które użytkownik może włączać/wyłączać.
// Ten sam wybór steruje widokiem, PDF (zrzut widoku), XLSX/CSV i treścią maila.
// `mail: true` = sekcja ma odpowiednik w mailu (lib/finance-report.js na serwerze).

export const REPORT_SECTIONS = [
  { key: 'summary', label: 'Bilans i stan kont', mail: true },
  { key: 'kpis', label: 'Wskaźniki (średnie, do zapłaty)' },
  { key: 'incomeExpense', label: 'Wykres: wpływy vs wydatki' },
  { key: 'cashflow', label: 'Wykres: przepływ gotówki' },
  { key: 'byCostCategory', label: 'Wydatki wg kategorii', mail: true },
  { key: 'byArea', label: 'Wydatki wg służby / obszaru', mail: true },
  { key: 'byIncomeType', label: 'Wpływy wg kategorii', mail: true },
  { key: 'byIncomeSource', label: 'Wpływy wg źródła' },
  { key: 'byProject', label: 'Projekty', mail: true },
  { key: 'byTag', label: 'Tagi', mail: true },
  { key: 'topExpenses', label: 'Największe wydatki', mail: true },
  { key: 'expenseStatus', label: 'Status wydatków' },
  { key: 'budgetExecution', label: 'Realizacja budżetu', mail: true },
  { key: 'unpaid', label: 'Nieopłacone zobowiązania', mail: true },
  { key: 'yoy', label: 'Porównanie rok do roku' },
  { key: 'incomeList', label: 'Lista wpływów', off: true },
  { key: 'expenseList', label: 'Lista wydatków', off: true },
];

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

// Filtry raportu (projekt / obszar / kategoria / tag) nakładane na transakcje przed budową modelu.
export const EMPTY_REPORT_FILTERS = { projectId: '', area: '', costCategory: '', tag: '' };

export function applyReportFilters(rows, filters, kind) {
  const f = filters || EMPTY_REPORT_FILTERS;
  return (rows || []).filter((r) => {
    if (f.projectId && String(r.project_id || '') !== String(f.projectId)) return false;
    if (f.tag && !(Array.isArray(r.tags) && r.tags.includes(f.tag))) return false;
    if (kind === 'expense') {
      if (f.area && r.category !== f.area) return false;
      if (f.costCategory && r.cost_category !== f.costCategory) return false;
    } else if (kind === 'income') {
      // Wpływy nie mają obszaru wydatków; kategoria kosztu → kategoria wpływu nie ma sensu.
      if (f.area || f.costCategory) return false;
    } else if (kind === 'budget') {
      if (f.area && r.category !== f.area) return false;
      if (f.costCategory && r.cost_category !== f.costCategory) return false;
    }
    return true;
  });
}

export const hasReportFilters = (f) => !!(f && (f.projectId || f.area || f.costCategory || f.tag));
