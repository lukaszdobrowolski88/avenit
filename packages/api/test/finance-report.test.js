// Raport finansowy mailem: sekcje i filtry z zakładki Raporty (lib/finance-report.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportHtml, normalizeSections, normalizeExclude, applyExclusions, MAIL_SECTIONS } from '../src/lib/finance-report.js';

const expenses = [
  { amount: '120.00', category: 'Administracja', cost_category: 'Czynsz', description: 'Czynsz', project_id: 'p1', tags: ['dach'], status: 'approved' },
  { amount: '30.00', category: 'MediaTeam', cost_category: 'Sprzęt', description: 'Kabel', project_id: null, tags: '["kable"]', status: 'paid' },
];
const income = [{ amount: '500', type: 'Darowizny', project_id: 'p1', tags: ['dach'] }];
const base = { org: 'Test', label: 'Marzec 2026', income, expenses, budget: [], projects: [{ id: 'p1', name: 'Remont dachu', budget_amount: '1000' }] };

test('normalizeSections: brak/niepoprawne = wszystkie, nieznane klucze odrzucone', () => {
  assert.equal(normalizeSections(null).size, MAIL_SECTIONS.length);
  assert.equal(normalizeSections(['x']).size, MAIL_SECTIONS.length);
  assert.deepEqual([...normalizeSections(['byTag', 'x'])], ['byTag']);
});

test('normalizeExclude: puste = null, tylko znane wymiary, przycina tekst', () => {
  assert.equal(normalizeExclude({}), null);
  assert.equal(normalizeExclude('x'), null);
  assert.equal(normalizeExclude({ hack: ['x'] }), null);
  assert.equal(normalizeExclude({ areas: ['a'.repeat(500)] }).areas[0].length, 200);
});

test('applyExclusions: jeden projekt, wszystkie projekty, obszar tylko dla wydatków, tagi', () => {
  // Wykluczony jeden projekt — reszta (także bez projektu) zostaje.
  assert.equal(applyExclusions(expenses, { projects: ['p1'] }, 'expense').length, 1);
  // Wszystkie projekty: p1 + „bez projektu”.
  assert.equal(applyExclusions(expenses, { projects: ['p1', '__none__'] }, 'expense').length, 0);
  // Tylko wydatki bez projektu wyłączone.
  assert.equal(applyExclusions(expenses, { projects: ['__none__'] }, 'expense').length, 1);
  // Obszar dotyczy wydatków — wpływy zostają.
  assert.equal(applyExclusions(expenses, { areas: ['Administracja'] }, 'expense').length, 1);
  assert.equal(applyExclusions(income, { areas: ['Administracja'] }, 'income').length, 1);
  assert.equal(applyExclusions(income, { incomeCategories: ['Darowizny'] }, 'income').length, 0);
  // Tag (także zapisany jako tekst JSON).
  assert.equal(applyExclusions(expenses, { tags: ['kable'] }, 'expense').length, 1);
  assert.equal(applyExclusions(income, null, 'income').length, 1);
});

test('HTML zawiera tylko wybrane sekcje', () => {
  const all = buildReportHtml({ ...base, sections: normalizeSections(null) });
  assert.match(all, /Projekty/);
  assert.match(all, /Remont dachu/);
  assert.match(all, /Wydatki wg służby \/ obszaru/);
  assert.match(all, /kable/);
  const only = buildReportHtml({ ...base, sections: normalizeSections(['byTag']), filterLabel: 'Projekty: Remont dachu' });
  assert.doesNotMatch(only, /Bilans/);
  assert.doesNotMatch(only, /Wydatki wg kategorii/);
  assert.match(only, /Tagi/);
  assert.match(only, /Wyłączone z raportu: Projekty: Remont dachu/);
});

test('HTML escapuje nazwy', () => {
  const html = buildReportHtml({ ...base, expenses: [{ amount: 1, category: '<b>x</b>', status: 'approved' }], sections: normalizeSections(['byArea']) });
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('buildFinanceReport: służba pod nazwą z menu, wykluczenia na wartości technicznej', async () => {
  const { buildFinanceReport } = await import('../src/lib/finance-report.js');
  const db = { query: async (sql) => {
    if (/FROM expense_transactions/.test(sql)) return { rows: [
      { amount: '100', category: 'małe Avenit', description: 'Materiały', status: 'approved' },
      { amount: '40', category: 'MediaTeam', description: 'Kabel', status: 'approved' },
    ] };
    if (/FROM app_modules/.test(sql)) return { rows: [{ key: 'kids', label: 'Małe SChWro' }, { key: 'media', label: 'MediaTeam' }] };
    return { rows: [] };
  } };
  const base = { from: '2026-01-01', to: '2026-12-31', year: 2026, label: '2026', sections: ['byArea'] };
  const r1 = await buildFinanceReport(db, base);
  assert.match(r1.html, /Małe SChWro/);
  assert.doesNotMatch(r1.html, /małe Avenit/);
  const r2 = await buildFinanceReport(db, { ...base, exclude: { areas: ['małe Avenit'] } });
  assert.doesNotMatch(r2.html, /Małe SChWro/);
  assert.match(r2.html, /MediaTeam/);
});

