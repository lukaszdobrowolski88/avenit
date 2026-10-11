import { describe, it, expect } from 'vitest';
import { buildAreaOptions, projectOptions, nameTaken, renameInTags, removeFromTags, NEW_OPTION } from './dictionaries';
import { applyReportExclusions, hasExclusions, describeExclusions, defaultSections, REPORT_SECTIONS, MAIL_SECTION_KEYS, NONE, EMPTY_REPORT_EXCLUDE } from './reportSections';
import { buildReportModel, csvString } from './reportExport';

describe('obszary budżetu (służby + własne)', () => {
  const services = [{ value: 'MediaTeam', label: 'Media' }, { value: 'Grupa Uwielbienia', label: 'Uwielbienie' }];
  it('łączy służby z własnymi obszarami bez duplikatów, pomija wyłączone', () => {
    const areas = [{ name: 'Administracja' }, { name: 'mediateam' }, { name: 'Stary', is_active: false }];
    const opts = buildAreaOptions(services, areas);
    expect(opts.map((o) => o.value)).toEqual(['MediaTeam', 'Grupa Uwielbienia', 'Administracja']);
  });
  it('zachowuje bieżącą wartość spoza listy (np. wyłączony obszar w starej pozycji)', () => {
    const opts = buildAreaOptions(services, [{ name: 'Stary', is_active: false }], 'Stary');
    expect(opts.some((o) => o.value === 'Stary')).toBe(true);
  });
  it('nameTaken ignoruje wielkość liter i edytowany wpis', () => {
    const list = [{ id: 1, name: 'Wynajem budynku' }];
    expect(nameTaken(list, ' wynajem BUDYNKU ')).toBe(true);
    expect(nameTaken(list, 'Wynajem budynku', 1)).toBe(false);
  });
  it('NEW_OPTION nie koliduje z nazwą', () => {
    expect(buildAreaOptions(services, []).some((o) => o.value === NEW_OPTION)).toBe(false);
  });
});

describe('projekty i tagi', () => {
  it('projectOptions ukrywa zamknięte projekty, chyba że są wybrane', () => {
    const projects = [{ id: 'a', name: 'Remont', status: 'active' }, { id: 'b', name: 'Obóz', status: 'closed' }];
    expect(projectOptions(projects, '').map((o) => o.value)).toEqual(['', 'a']);
    expect(projectOptions(projects, 'b').map((o) => o.value)).toEqual(['', 'a', 'b']);
  });
  it('zmiana nazwy tagu nie dubluje istniejącego', () => {
    expect(renameInTags(['remont', 'dach'], 'remont', 'dach')).toEqual(['dach']);
    expect(renameInTags(['a', 'b'], 'a', 'c')).toEqual(['c', 'b']);
    expect(removeFromTags(['a', 'b'], 'a')).toEqual(['b']);
    expect(renameInTags(null, 'a', 'b')).toEqual([]);
  });
});

describe('filtry i sekcje raportu', () => {
  const expense = [
    { id: 1, amount: 100, category: 'Administracja', cost_category: 'Czynsz', project_id: 'p1', tags: ['dach'], payment_date: '2026-03-01', status: 'approved' },
    { id: 2, amount: 50, category: 'MediaTeam', cost_category: 'Sprzęt', project_id: null, tags: [], payment_date: '2026-03-02', status: 'approved' },
  ];
  const income = [{ id: 3, amount: 300, type: 'Darowizny', project_id: 'p1', tags: ['dach'], date: '2026-03-03' }];

  const ex = (o) => ({ ...EMPTY_REPORT_EXCLUDE, ...o });
  it('wyłączenie jednego projektu zostawia resztę; wszystkie projekty = także „bez projektu”', () => {
    expect(applyReportExclusions(expense, ex({ projects: ['p1'] }), 'expense').map((r) => r.id)).toEqual([2]);
    expect(applyReportExclusions(income, ex({ projects: ['p1'] }), 'income')).toEqual([]);
    expect(applyReportExclusions(expense, ex({ projects: ['p1', NONE] }), 'expense')).toEqual([]);
    expect(applyReportExclusions(expense, ex({ projects: [NONE] }), 'expense').map((r) => r.id)).toEqual([1]);
  });
  it('obszar i kategoria wydatków nie ruszają wpływów; kategoria wpływów — tylko wpływy', () => {
    expect(applyReportExclusions(expense, ex({ areas: ['Administracja'] }), 'expense').map((r) => r.id)).toEqual([2]);
    expect(applyReportExclusions(income, ex({ areas: ['Administracja'], costCategories: ['Czynsz'] }), 'income').map((r) => r.id)).toEqual([3]);
    expect(applyReportExclusions(income, ex({ incomeCategories: ['Darowizny'] }), 'income')).toEqual([]);
    expect(applyReportExclusions(expense, ex({ incomeCategories: ['Darowizny'] }), 'expense')).toHaveLength(2);
  });
  it('tag: wyklucza transakcje z tym tagiem; „bez tagów” — nieotagowane', () => {
    expect(applyReportExclusions(expense, ex({ tags: ['dach'] }), 'expense').map((r) => r.id)).toEqual([2]);
    expect(applyReportExclusions(expense, ex({ tags: [NONE] }), 'expense').map((r) => r.id)).toEqual([1]);
  });
  it('plan budżetu: wydatkowy wg obszaru, przychodowy wg kategorii wpływów', () => {
    const budget = [{ id: 'b1', kind: 'expense', category: 'Administracja' }, { id: 'b2', kind: 'income', category: 'Darowizny' }];
    expect(applyReportExclusions(budget, ex({ areas: ['Administracja'] }), 'budget').map((r) => r.id)).toEqual(['b2']);
    expect(applyReportExclusions(budget, ex({ incomeCategories: ['Darowizny'] }), 'budget').map((r) => r.id)).toEqual(['b1']);
  });
  it('opis wykluczeń', () => {
    expect(hasExclusions(EMPTY_REPORT_EXCLUDE)).toBe(false);
    const d = describeExclusions(ex({ projects: ['p1'], tags: [NONE] }), { projectName: () => 'Remont dachu' });
    expect(d).toBe('Projekty: Remont dachu · Tagi: (bez tagów)');
    expect(describeExclusions(ex({ projects: ['p1', NONE] }), { totals: { projects: 2 } })).toBe('Projekty: wyłączone');
  });
  it('domyślnie listy transakcji są wyłączone, reszta włączona', () => {
    const d = defaultSections();
    expect(d.incomeList).toBe(false);
    expect(d.summary).toBe(true);
    expect(Object.keys(d)).toHaveLength(REPORT_SECTIONS.length);
    expect(MAIL_SECTION_KEYS).toContain('byProject');
  });

  it('model raportu liczy projekty (plan z kwoty projektu) i tagi', () => {
    const projects = [{ id: 'p1', name: 'Remont dachu', budget_amount: '1000' }];
    const range = { from: '2026-03-01', to: '2026-03-31', year: 2026, label: 'Marzec 2026' };
    const m = buildReportModel({ range, income, expense, budget: [], projects });
    expect(m.byProject).toEqual([expect.objectContaining({ name: 'Remont dachu', planned: 1000, spent: 100, raised: 300, balance: 200 })]);
    expect(m.byTag).toEqual([expect.objectContaining({ name: 'dach', expense: 100, income: 300, count: 2 })]);
    expect(m.projectNames.p1).toBe('Remont dachu');
  });
  it('CSV pomija wyłączone sekcje', () => {
    const range = { from: '2026-03-01', to: '2026-03-31', year: 2026, label: 'Marzec 2026' };
    const m = buildReportModel({ range, income, expense, budget: [], projects: [{ id: 'p1', name: 'Remont dachu' }] });
    const all = csvString(m);
    expect(all).toContain('Projekty');
    expect(all).toContain('Tagi');
    const some = csvString(m, { ...defaultSections(), byProject: false, byTag: false, summary: false });
    expect(some).not.toContain('Remont dachu');
    expect(some).not.toContain('Podsumowanie;Kwota');
    expect(csvString(m, { ...defaultSections(), expenseList: true })).toContain('Remont dachu');
  });

  it('raport bez nazwisk: osoby razem jako „Darczyńcy indywidualni”, organizacje z kategorią osobno, bez notatek', () => {
    const range = { from: '2026-03-01', to: '2026-03-31', year: 2026, label: 'Marzec 2026' };
    const inc = [
      { id: 'a', amount: 100, type: 'Ofiara', source: 'Jan Kowalski', notes: 'Darowizna: Jan Kowalski', date: '2026-03-01' },
      { id: 'b', amount: 50, type: 'Ofiara', source: 'Anna Nowak', notes: 'x', date: '2026-03-02' },
      { id: 'c', amount: 300, type: 'Wasilla Bible Church', source: 'wasilla bible church', date: '2026-03-03' },
    ];
    const m = buildReportModel({ range, income: inc, expense: [], budget: [], incomeCategories: [{ name: 'Ofiara' }, { name: 'Wasilla Bible Church' }] });
    expect(m.byIncomeSource.map((x) => [x.name, x.amount])).toEqual([['Wasilla Bible Church', 300], ['Darczyńcy indywidualni', 150]]);
    expect(JSON.stringify(m.raw.income)).not.toMatch(/Kowalski|Nowak/);
    expect(m.raw.income.every((r) => !('notes' in r))).toBe(true);
    const csv = csvString(m, { ...defaultSections(), incomeList: true });
    expect(csv).not.toMatch(/Kowalski|Nowak/);
  });
});
