import { supabase } from '../../../lib/supabase';
import { STATUS_COLORS } from './constants';

// Klient-owy import starej tabeli zadań → nowa Tablica (silnik boards).
// Odpowiednik packages/api/db/scripts/migrate-tasks-to-boards.mjs, uruchamiany
// w aplikacji przy podmianie kanbanów. ŹRÓDŁO TYLKO CZYTANE (bez modyfikacji).
// Idempotentny: caller sprawdza istnienie boardu po source_kind.

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const pick = (keys, cands) => cands.find(c => keys.includes(c)) || null;
const PRIO_COLOR = { low: '#579bfc', niski: '#579bfc', medium: '#5559df', średni: '#5559df', sredni: '#5559df', high: '#401694', wysoki: '#401694', critical: '#e2445c', pilne: '#e2445c' };

export async function importLegacyTasks({ sourceKind, moduleKey = null, title, userEmail = null }) {
  // Idempotencja
  const { data: existing } = await supabase.from('boards').select('id').eq('source_kind', sourceKind).limit(1);
  if (existing && existing.length) return { boardId: existing[0].id, created: false };

  // Czytaj źródło (może nie istnieć / być puste)
  let rows = [];
  try {
    const { data, error } = await supabase.from(sourceKind).select('*');
    if (!error) rows = data || [];
  } catch { rows = []; }

  const keys = rows.length ? Object.keys(rows[0]) : [];
  const nameCol = pick(keys, ['title', 'name', 'task', 'content']) || 'title';
  const statusCol = pick(keys, ['status', 'state']);
  const prioCol = pick(keys, ['priority', 'priorytet']);
  const dueCol = pick(keys, ['due_date', 'due', 'deadline', 'date']);
  const descCol = pick(keys, ['description', 'notes', 'opis']);
  const assignCol = pick(keys, ['assigned_to', 'assigned_to_email', 'assignee', 'owner_email']);
  const tagsCol = pick(keys, ['tags', 'labels']);

  const statuses = statusCol ? [...new Set(rows.map(r => r[statusCol]).filter(Boolean).map(String))] : [];
  const prios = prioCol ? [...new Set(rows.map(r => r[prioCol]).filter(Boolean).map(String))] : [];
  const tagVals = tagsCol ? [...new Set(rows.flatMap(r => Array.isArray(r[tagsCol]) ? r[tagsCol].map(String) : []))] : [];

  // Utwórz tablicę
  const { data: board, error: bErr } = await supabase.from('boards').insert({
    name: title || sourceKind, source_kind: sourceKind, module_key: moduleKey, color: '#6366f1',
    icon: 'LayoutGrid', owner_email: userEmail, created_by: userEmail,
  }).select().single();
  if (bErr) throw bErr;

  // Kolumny
  const colIds = {};
  let ord = 0;
  const addCol = async (name, type, settings) => {
    const { data } = await supabase.from('board_columns').insert({
      board_id: board.id, name, type, settings: settings || {}, display_order: ord++, width: 160,
    }).select().single();
    return data?.id;
  };
  if (statusCol) colIds.status = await addCol('Status', 'status', { labels: statuses.map((s, i) => ({ id: slug(s) || `s${i}`, title: s, color: STATUS_COLORS[i % STATUS_COLORS.length] })) });
  if (assignCol) colIds.people = await addCol('Osoby', 'people', {});
  if (dueCol) colIds.due = await addCol('Termin', 'date', {});
  if (prioCol) colIds.prio = await addCol('Priorytet', 'priority', { labels: prios.map((p, i) => ({ id: slug(p) || `p${i}`, title: p, color: PRIO_COLOR[p.toLowerCase()] || STATUS_COLORS[i % STATUS_COLORS.length] })) });
  if (tagsCol) colIds.tags = await addCol('Etykiety', 'dropdown', { multi: true, options: tagVals.map((t, i) => ({ id: slug(t) || `t${i}`, title: t, color: STATUS_COLORS[i % STATUS_COLORS.length] })) });
  if (descCol) colIds.desc = await addCol('Opis', 'long_text', {});

  // Gdy źródło nie ma ŻADNYCH pól strukturalnych — dodaj domyślny zestaw, by tablica
  // była od razu użyteczna (inaczej 0 kolumn: pusta „Kolumny", Kalendarz bez daty).
  if (Object.keys(colIds).length === 0) {
    colIds.status = await addCol('Status', 'status', { labels: [
      { id: 'todo', title: 'Do zrobienia', color: '#579bfc' },
      { id: 'doing', title: 'W toku', color: '#fdab3d' },
      { id: 'done', title: 'Gotowe', color: '#00c875' },
    ] });
    colIds.people = await addCol('Osoby', 'people', {});
    colIds.due = await addCol('Termin', 'date', {});
  }

  // Grupy = statusy (lub jedna domyślna)
  const groupByStatus = {};
  if (statuses.length) {
    for (let i = 0; i < statuses.length; i++) {
      const { data: g } = await supabase.from('board_groups').insert({ board_id: board.id, name: statuses[i], color: STATUS_COLORS[i % STATUS_COLORS.length], display_order: i }).select().single();
      groupByStatus[statuses[i]] = g?.id;
    }
  } else {
    const { data: g } = await supabase.from('board_groups').insert({ board_id: board.id, name: 'Zadania', color: '#579bfc', display_order: 0 }).select().single();
    groupByStatus.__default = g?.id;
  }
  await supabase.from('board_views').insert({ board_id: board.id, name: 'Tabela', type: 'table', is_default: true, display_order: 0, config: {} });

  // Elementy
  const toPeople = (v) => {
    if (!v) return [];
    const arr = Array.isArray(v) ? v : [v];
    return arr.filter(Boolean).map(x => ({ email: String(x), name: String(x) }));
  };
  const isUuid = (v) => typeof v === 'string' && /^[0-9a-f-]{32,36}$/i.test(v);
  let i = 0;
  for (const r of rows) {
    const cells = {};
    if (statusCol && r[statusCol] != null) cells[colIds.status] = slug(String(r[statusCol]));
    if (prioCol && r[prioCol] != null) cells[colIds.prio] = slug(String(r[prioCol]));
    if (dueCol && r[dueCol]) cells[colIds.due] = String(r[dueCol]).slice(0, 10);
    if (descCol && r[descCol]) cells[colIds.desc] = String(r[descCol]);
    if (tagsCol && Array.isArray(r[tagsCol])) cells[colIds.tags] = r[tagsCol].map(t => slug(String(t)));
    // Osoby tylko gdy nie UUID (UUID = referencja, której nie rozwiniemy tutaj)
    if (assignCol && !isUuid(r[assignCol])) cells[colIds.people] = toPeople(r[assignCol]);

    const groupId = statuses.length ? (groupByStatus[String(r[statusCol])] || Object.values(groupByStatus)[0]) : groupByStatus.__default;
    await supabase.from('board_items').insert({
      board_id: board.id, group_id: groupId, name: String(r[nameCol] || 'Zadanie'),
      cells, display_order: i++, created_by: r.created_by || userEmail || null,
    });
  }

  return { boardId: board.id, created: true, imported: rows.length };
}
