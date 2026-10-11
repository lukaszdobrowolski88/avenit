// Raport finansowy mailem: sekcje i filtry z zakładki Raporty (lib/finance-report.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportHtml, normalizeSections, normalizeFilters, applyFilters, MAIL_SECTIONS } from '../src/lib/finance-report.js';

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

test('normalizeFilters: puste = null, przycina tekst', () => {
  assert.equal(normalizeFilters({}), null);
  assert.equal(normalizeFilters('x'), null);
  assert.equal(normalizeFilters({ area: 'a'.repeat(500) }).area.length, 200);
});

test('applyFilters: projekt/tag na obu, obszar tylko wydatki (wpływy wypadają)', () => {
  assert.equal(applyFilters(expenses, { projectId: 'p1' }, 'expense').length, 1);
  assert.equal(applyFilters(expenses, { tag: 'kable' }, 'expense').length, 1); // tagi jako tekst JSON
  assert.equal(applyFilters(income, { area: 'Administracja' }, 'income').length, 0);
  assert.equal(applyFilters(income, null, 'income').length, 1);
});

test('HTML zawiera tylko wybrane sekcje', () => {
  const all = buildReportHtml({ ...base, sections: normalizeSections(null) });
  assert.match(all, /Projekty/);
  assert.match(all, /Remont dachu/);
  assert.match(all, /Wydatki wg służby \/ obszaru/);
  assert.match(all, /kable/);
  const only = buildReportHtml({ ...base, sections: normalizeSections(['byTag']), filterLabel: 'Projekt: Remont dachu' });
  assert.doesNotMatch(only, /Bilans/);
  assert.doesNotMatch(only, /Wydatki wg kategorii/);
  assert.match(only, /Tagi/);
  assert.match(only, /Filtr: Projekt: Remont dachu/);
});

test('HTML escapuje nazwy', () => {
  const html = buildReportHtml({ ...base, expenses: [{ amount: 1, category: '<b>x</b>', status: 'approved' }], sections: normalizeSections(['byArea']) });
  assert.doesNotMatch(html, /<b>x<\/b>/);
});
