#!/usr/bin/env node
// =====================================================================
// Ujednolicenie: migracja istniejących tabel zadań → silnik Tablic (boards).
// =====================================================================
// BEZPIECZEŃSTWO (guardrail projektu):
//  - Źródłowe tabele NIE są modyfikowane ani usuwane — tylko czytane.
//  - Domyślnie DRY-RUN (nic nie zapisuje). Zapis dopiero z flagą --apply.
//  - Introspekcja kolumn z information_schema → działa na ŻYWEJ schemie
//    (repo ≠ produkcja), pomija kolumny, których nie ma.
//  - Idempotentne: pomija źródło, dla którego istnieje już board z tym
//    samym boards.source_kind.
//
// Użycie:
//   node packages/api/db/scripts/migrate-tasks-to-boards.mjs <db_name> [--apply]
//        [--source=mlodziezowka_tasks,media_tasks]
//   (bez --source: auto-wykrywa tabele *_tasks, pomija *_task_comments)
//
// DATABASE_URL wskazuje na instancję; ścieżkę bazy nadpisuje <db_name>.
import pg from 'pg';
const { Client } = pg;

const BASE_URL = process.env.DATABASE_URL || 'postgres://avenit:avenit@localhost:5432/avenit_platform';
const args = process.argv.slice(2);
const dbName = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const sourceArg = args.find(a => a.startsWith('--source='));
if (!dbName) { console.error('Podaj nazwę bazy tenanta: migrate-tasks-to-boards.mjs <db_name> [--apply]'); process.exit(1); }

const STATUS_COLORS = ['#c4c4c4', '#fdab3d', '#00c875', '#e2445c', '#579bfc', '#a25ddc', '#0086c0'];
const PRIO_COLOR = { low: '#579bfc', niski: '#579bfc', medium: '#5559df', średni: '#5559df', sredni: '#5559df', high: '#401694', wysoki: '#401694', critical: '#e2445c', pilne: '#e2445c' };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function columnsOf(c, table) {
  const { rows } = await c.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
  return Object.fromEntries(rows.map(r => [r.column_name, r.data_type]));
}

async function detectSources(c) {
  const { rows } = await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name LIKE '%_tasks' AND table_name NOT LIKE '%_task_comments'`);
  return rows.map(r => r.table_name);
}

// Wybór najlepszej kolumny z listy kandydatów obecnych w tabeli.
const pick = (cols, cands) => cands.find(x => x in cols) || null;

async function migrateSource(c, table) {
  const cols = await columnsOf(c, table);
  if (!Object.keys(cols).length) { console.log(`  · ${table}: brak (pomijam)`); return; }

  const nameCol = pick(cols, ['title', 'name', 'task', 'content']);
  if (!nameCol) { console.log(`  · ${table}: brak kolumny tytułu (pomijam)`); return; }
  const statusCol = pick(cols, ['status', 'state']);
  const prioCol = pick(cols, ['priority', 'priorytet']);
  const dueCol = pick(cols, ['due_date', 'due', 'deadline', 'date']);
  const descCol = pick(cols, ['description', 'notes', 'opis']);
  const assignCol = pick(cols, ['assigned_to', 'assigned_to_email', 'assignee', 'owner_email']);
  const assignType = assignCol ? cols[assignCol] : null;
  const tagsCol = pick(cols, ['tags', 'labels']);

  // Czy board dla tego źródła już istnieje?
  const exists = await c.query(`SELECT id FROM boards WHERE source_kind=$1 LIMIT 1`, [table]);
  if (exists.rows.length) { console.log(`  · ${table}: board już istnieje (idempotencja, pomijam)`); return; }

  const { rows: items } = await c.query(`SELECT * FROM ${table}`);
  const statuses = statusCol ? [...new Set(items.map(r => r[statusCol]).filter(Boolean))] : [];
  const statusLabels = statuses.map((s, i) => ({ id: slug(String(s)) || `s${i}`, title: String(s), color: STATUS_COLORS[i % STATUS_COLORS.length] }));
  const prios = prioCol ? [...new Set(items.map(r => r[prioCol]).filter(Boolean))] : [];
  const prioLabels = prios.map((p, i) => ({ id: slug(String(p)) || `p${i}`, title: String(p), color: PRIO_COLOR[String(p).toLowerCase()] || STATUS_COLORS[i % STATUS_COLORS.length] }));
  const tagValues = tagsCol ? [...new Set(items.flatMap(r => Array.isArray(r[tagsCol]) ? r[tagsCol] : []))] : [];
  const tagOptions = tagValues.map((t, i) => ({ id: slug(String(t)) || `t${i}`, title: String(t), color: STATUS_COLORS[i % STATUS_COLORS.length] }));

  const boardName = table.replace(/_tasks$/, '').replace(/^custom_/, '').replace(/_/g, ' ') + ' — zadania';
  console.log(`  · ${table}: ${items.length} zadań → tablica „${boardName}"`);
  console.log(`      kolumny: nazwa=${nameCol} status=${statusCol || '-'} priorytet=${prioCol || '-'} termin=${dueCol || '-'} osoby=${assignCol || '-'}(${assignType || '-'}) opis=${descCol || '-'} tagi=${tagsCol || '-'}`);
  console.log(`      grupy(status)=${statuses.length} etykiety(tagi)=${tagValues.length}`);
  if (!APPLY) { console.log('      [DRY-RUN] nic nie zapisano'); return; }

  // ── Zapis (transakcja) ──
  await c.query('BEGIN');
  try {
    const { rows: [board] } = await c.query(
      `INSERT INTO boards (name, source_kind, color, icon) VALUES ($1,$2,'#6366f1','LayoutGrid') RETURNING id`, [boardName, table]);
    const colIds = {};
    const addCol = async (name, type, settings, order) => {
      const { rows: [col] } = await c.query(
        `INSERT INTO board_columns (board_id,name,type,settings,display_order,width) VALUES ($1,$2,$3,$4::jsonb,$5,160) RETURNING id`,
        [board.id, name, type, JSON.stringify(settings || {}), order]);
      return col.id;
    };
    let ord = 0;
    if (statusCol) colIds.status = await addCol('Status', 'status', { labels: statusLabels }, ord++);
    if (assignCol) colIds.people = await addCol('Osoby', 'people', {}, ord++);
    if (dueCol) colIds.due = await addCol('Termin', 'date', {}, ord++);
    if (prioCol) colIds.prio = await addCol('Priorytet', 'priority', { labels: prioLabels }, ord++);
    if (tagsCol) colIds.tags = await addCol('Etykiety', 'dropdown', { multi: true, options: tagOptions }, ord++);
    if (descCol) colIds.desc = await addCol('Opis', 'long_text', {}, ord++);

    // Grupy = statusy (albo jedna domyślna)
    const groupIdByStatus = {};
    if (statuses.length) {
      for (let i = 0; i < statuses.length; i++) {
        const { rows: [g] } = await c.query(`INSERT INTO board_groups (board_id,name,color,display_order) VALUES ($1,$2,$3,$4) RETURNING id`,
          [board.id, String(statuses[i]), STATUS_COLORS[i % STATUS_COLORS.length], i]);
        groupIdByStatus[String(statuses[i])] = g.id;
      }
    } else {
      const { rows: [g] } = await c.query(`INSERT INTO board_groups (board_id,name,color,display_order) VALUES ($1,'Zadania','#579bfc',0) RETURNING id`, [board.id]);
      groupIdByStatus.__default = g.id;
    }
    await c.query(`INSERT INTO board_views (board_id,name,type,is_default,display_order,config) VALUES ($1,'Tabela','table',true,0,'{}'::jsonb)`, [board.id]);

    // Elementy
    const toPeople = (val) => {
      if (!val) return [];
      const arr = Array.isArray(val) ? val : [val];
      return arr.filter(Boolean).map(v => ({ email: String(v), name: String(v) }));
    };
    let n = 0;
    for (const r of items) {
      const cells = {};
      if (statusCol && r[statusCol] != null) cells[colIds.status] = slug(String(r[statusCol]));
      if (prioCol && r[prioCol] != null) cells[colIds.prio] = slug(String(r[prioCol]));
      if (dueCol && r[dueCol]) cells[colIds.due] = String(r[dueCol]).slice(0, 10);
      if (descCol && r[descCol]) cells[colIds.desc] = String(r[descCol]);
      if (tagsCol && Array.isArray(r[tagsCol])) cells[colIds.tags] = r[tagsCol].map(t => slug(String(t)));
      // Osoby tylko gdy wartość wygląda jak email/tekst (nie UUID)
      if (assignCol && assignType !== 'uuid') cells[colIds.people] = toPeople(r[assignCol]);

      const groupId = statuses.length ? (groupIdByStatus[String(r[statusCol])] || Object.values(groupIdByStatus)[0]) : groupIdByStatus.__default;
      await c.query(
        `INSERT INTO board_items (board_id,group_id,name,cells,display_order,created_by) VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
        [board.id, groupId, String(r[nameCol] || 'Zadanie'), JSON.stringify(cells), n, r.created_by || null]);
      n++;
    }
    await c.query('COMMIT');
    console.log(`      ✓ zapisano tablicę + ${n} elementów (źródło ${table} nietknięte)`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error(`      ✗ błąd (rollback): ${e.message}`);
  }
}

// ── main ──
const url = new URL(BASE_URL); url.pathname = `/${dbName}`;
const c = new Client({ connectionString: url.toString() });
await c.connect();
try {
  console.log(`Ujednolicenie zadań → Tablice | baza=${dbName} | tryb=${APPLY ? 'APPLY (zapis)' : 'DRY-RUN'}`);
  const sources = sourceArg ? sourceArg.split('=')[1].split(',') : await detectSources(c);
  console.log(`Źródła (${sources.length}): ${sources.join(', ') || '—'}\n`);
  for (const t of sources) await migrateSource(c, t);
  console.log(`\nGotowe.${APPLY ? '' : ' To był DRY-RUN — uruchom z --apply, aby zapisać.'}`);
} finally {
  await c.end();
}
