// Import starych zadań na Tablice: źródła z listy dozwolonych, osoby w kształcie PeopleCell,
// uzupełnianie tylko pustych komórek, dopasowanie wierszy do już zaimportowanych elementów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSource, pickColumns, buildLabels, rawAssignees, makeDirectory, resolveAssignees,
  isFillablePeopleCell, matchLegacyRows, calendarTeamOptions, slug,
} from '../src/fn/board-import-legacy.js';
import { itemDates, itemLink } from '../src/fn/my-board-items.js';

test('źródło: tylko stałe nazwy i custom_<key>_tasks istniejącego modułu', () => {
  assert.equal(resolveSource('media_tasks').moduleKey, 'media');
  assert.equal(resolveSource('media_tasks').comments, 'media_task_comments');
  assert.equal(resolveSource('media_tasks').capability, 'module:media');
  assert.equal(resolveSource('tasks').capability, 'module:calendar');
  assert.equal(resolveSource('tasks').calendar, true);
  assert.equal(resolveSource('home_group_tasks').capability, 'module:homegroups');
  assert.equal(resolveSource('custom_chor_tasks'), null); // moduł nie istnieje
  const c = resolveSource('custom_chor_tasks', new Set(['chor']));
  assert.equal(c.moduleKey, 'chor');
  assert.equal(c.comments, 'custom_chor_task_comments');
  assert.deepEqual(c.people, ['custom_chor_members']);
  assert.equal(c.capability, 'module:chor');
  for (const bad of ['app_users', 'boards', 'media_tasks; drop table x', '"media_tasks"', 'custom_x_members', 'Media_Tasks', '']) {
    assert.equal(resolveSource(bad, new Set(['x'])), null, bad);
  }
});

test('kolumny źródła wybierane z introspekcji', () => {
  const p = pickColumns(new Map([['id', 'uuid'], ['title', 'text'], ['assigned_to', 'uuid'], ['due_date', 'date'], ['sort_order', 'integer'], ['due_time', 'text']]));
  assert.equal(p.name, 'title');
  assert.equal(p.assignee, 'assigned_to');
  assert.equal(p.due, 'due_date');
  assert.equal(p.order, 'sort_order');
  assert.equal(p.dueTime, 'due_time');
  assert.equal(p.status, null);
});

test('statusy: kanoniczne etykiety + nieznane wartości ze źródła', () => {
  const { labels, idFor } = buildLabels(['Do zrobienia', 'W trakcie', 'Gotowe', 'pending', 'Czeka na zgodę', 'czeka na zgodę'], [
    { id: 'todo', title: 'Do zrobienia', color: '#1', re: /^(do zrobienia|pending)$/ },
    { id: 'working', title: 'W trakcie', color: '#2', re: /^w trakcie$/ },
    { id: 'done', title: 'Gotowe', color: '#3', re: /^gotowe$/ },
  ]);
  assert.equal(idFor('Gotowe'), 'done');
  assert.equal(idFor('pending'), 'todo');
  assert.equal(idFor('Czeka na zgodę'), 'czeka_na_zgode');
  assert.equal(idFor('czeka na zgodę'), 'czeka_na_zgode');
  assert.equal(labels.filter((l) => l.id === 'czeka_na_zgode').length, 1);
  assert.equal(idFor(''), null);
  assert.equal(slug('Łódź — zadanie'), 'lodz_zadanie');
});

const users = [
  { id: 'u1', email: 'Anna@Kosciol.pl', full_name: 'Anna Nowak', avatar_url: 'a.jpg' },
  { id: 'u2', email: 'jan@kosciol.pl', full_name: 'Jan Kowalski' },
  { id: 'u3', email: 'jan2@kosciol.pl', full_name: 'Jan Kowalski' }, // imiennik
];
const dir = makeDirectory(users, new Map([
  ['m-1', { email: 'anna@kosciol.pl', name: 'Anna N.' }],
  ['m-2', { email: '', name: 'Piotr Bez Konta' }],
  ['7', { email: '', name: 'Anna Nowak' }],
]));

test('osoby: UUID członka zespołu → konto (kształt PeopleCell: email z app_users, nazwa, awatar)', () => {
  assert.deepEqual(resolveAssignees('m-1', dir).people, [{ email: 'Anna@Kosciol.pl', name: 'Anna Nowak', avatar_url: 'a.jpg' }]);
  // ID liczbowe (SERIAL) bez e-maila — po unikalnym imieniu i nazwisku
  assert.equal(resolveAssignees(7, dir).people[0].email, 'Anna@Kosciol.pl');
  // bez konta i bez e-maila — pomijamy, liczymy jako nierozpoznane
  assert.deepEqual(resolveAssignees('m-2', dir), { people: [], unresolved: 1 });
  // imiennicy — nie zgadujemy
  assert.deepEqual(resolveAssignees('Jan Kowalski', dir).people, []);
});

test('osoby: e-maile (tekst, tablica, lista), id konta, podpowiedź nazwy', () => {
  assert.deepEqual(resolveAssignees(['jan@kosciol.pl', 'ANNA@kosciol.pl'], dir).people.map((p) => p.email), ['jan@kosciol.pl', 'Anna@Kosciol.pl']);
  assert.deepEqual(resolveAssignees('jan@kosciol.pl, gosc@x.pl', dir).people.map((p) => p.name), ['Jan Kowalski', 'gosc@x.pl']);
  assert.equal(resolveAssignees('u2', dir).people[0].email, 'jan@kosciol.pl');
  assert.equal(resolveAssignees(null, dir, 'Anna Nowak').people[0].email, 'Anna@Kosciol.pl');
  assert.deepEqual(resolveAssignees('["jan@kosciol.pl"]', dir).people.map((p) => p.email), ['jan@kosciol.pl']);
  assert.deepEqual(rawAssignees(''), []);
  // duplikaty (ten sam człowiek dwiema drogami) — raz
  assert.equal(resolveAssignees(['m-1', 'anna@kosciol.pl'], dir).people.length, 1);
});

test('uzupełniamy tylko pustą komórkę albo artefakt starego importu', () => {
  assert.ok(isFillablePeopleCell(undefined, 'm-1'));
  assert.ok(isFillablePeopleCell([], 'm-1'));
  // stary import wpisał surowe ID jako e-mail i nazwę
  assert.ok(isFillablePeopleCell([{ email: '12', name: '12' }], 12));
  // ktoś przypisał osobę ręcznie — nie ruszamy
  assert.ok(!isFillablePeopleCell([{ email: 'jan@kosciol.pl', name: 'Jan' }], 'm-1'));
  assert.ok(!isFillablePeopleCell([{ email: '13', name: '13' }], 12));
  // e-maile wpisane przez stary import bez nazw — nietknięte, więc wolno je uzupełnić o konta
  assert.ok(isFillablePeopleCell([{ email: 'a@x.pl', name: 'a@x.pl' }, { email: 'b@x.pl', name: 'b@x.pl' }], ['a@x.pl', 'b@x.pl']));
  // …ale ktoś usunął jedną z dwóch osób — nie przywracamy jej
  assert.ok(!isFillablePeopleCell([{ email: 'a@x.pl', name: 'a@x.pl' }], ['a@x.pl', 'b@x.pl']));
  // osoba wybrana w tablicy (z awatarem / nazwą) — nie ruszamy
  assert.ok(!isFillablePeopleCell([{ email: 'a@x.pl', name: 'a@x.pl', avatar_url: 'x.jpg' }], 'a@x.pl'));
  assert.ok(!isFillablePeopleCell({ email: 'a@x.pl' }, 'a@x.pl'));
});

test('dopasowanie: source_id, potem nazwa; duplikaty po terminie i kolejności', () => {
  const rows = [
    { id: 'a', name: 'Plakat', idx: 0, due: '2026-10-01' },
    { id: 'b', name: 'Plakat', idx: 1, due: '2026-10-20' },
    { id: 'c', name: 'Nagłośnienie', idx: 2 },
    { id: 'd', name: 'Usunięte z tablicy', idx: 3 },
    { id: 'e', name: 'Z source', idx: 4 },
  ];
  const items = [
    { id: 'i1', name: 'Plakat', display_order: 0, cells: { d: '2026-10-20' } },
    { id: 'i2', name: 'plakat ', display_order: 1, cells: { d: '2026-10-01' } },
    { id: 'i3', name: 'Nagłośnienie', display_order: 2, cells: {} },
    { id: 'i4', name: 'Zmieniona nazwa', display_order: 4, source_id: 'e', cells: {} },
  ];
  const m = matchLegacyRows(rows, items, { dueOf: (it) => it.cells.d || null });
  assert.equal(m.get('a').id, 'i2');
  assert.equal(m.get('b').id, 'i1');
  assert.equal(m.get('c').id, 'i3');
  assert.equal(m.get('e').id, 'i4');
  assert.equal(m.has('d'), false);
  assert.equal(new Set([...m.values()].map((x) => x.id)).size, m.size);
});

test('kalendarz: opcje kategorii (kalendarze zadań) + wartości spoza listy', () => {
  const opts = calendarTeamOptions(['media', 'chor', '', null]);
  assert.ok(opts.some((o) => o.id === 'groups' && o.title === 'Grupy domowe'));
  assert.equal(opts.filter((o) => o.id === 'media').length, 1);
  assert.ok(opts.some((o) => o.id === 'chor'));
});

test('przypisane mi: termin z kolumny daty / osi czasu i link do elementu', () => {
  const cols = [{ id: 'c1', type: 'status' }, { id: 'c2', type: 'date' }];
  assert.deepEqual(itemDates({ c2: '2026-10-11' }, cols), { date: '2026-10-11', end: null });
  assert.equal(itemDates({ c2: 'jutro' }, cols), null);
  assert.equal(itemDates({}, cols), null);
  assert.deepEqual(itemDates({ t: { start: '2026-10-01', end: '2026-10-03' } }, [{ id: 't', type: 'timeline' }]), { date: '2026-10-01', end: '2026-10-03' });
  assert.equal(itemLink({ id: 'i' }, { id: 'b', module_key: 'media', source_kind: 'media_tasks' }, '/media'), '/media?item=i');
  // Tablica z zakładki „Tablica” modułu (nie zadania modułu) — /projekty, jak w powiadomieniach.
  assert.equal(itemLink({ id: 'i' }, { id: 'b', module_key: 'media', source_kind: null }, '/media'), '/projekty?board=b&item=i');
  assert.equal(itemLink({ id: 'i' }, { id: 'b', module_key: null }, null), '/projekty?board=b&item=i');
  assert.equal(itemLink({ id: 'i' }, { id: 'b', module_key: 'x' }, null), '/projekty?board=b&item=i');
});
