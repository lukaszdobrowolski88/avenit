// Wykonawca automatyzacji czasowych tablic (wyzwalacze `date_arrives` i `every_period`).
// Uruchamiany cyklicznie przez worker (packages/api/src/worker.js) per tenant.
// Wyzwalacze natychmiastowe (status/kolumna/przypisanie/utworzenie) obsługuje
// klient w useBoardAutomations — tu tylko te oparte o daty.
//
// Powiadomienia (akcja `notify`): tylko aktywne konta, które WIDZĄ tablicę i mogą czytać jej elementy
// (boardNotify.boardViewers — ta sama reguła co /api/db), e-maile małymi literami, bez śmieciowych
// „twórców” ('formularz', 'automatyzacja', znacznik importu); link — taskItemLink; wpis w skrzynce +
// realtime + push (boardNotify.deliverNotifications).
// Daty liczone w strefie Europe/Warsaw (kontener workera działa w UTC).
// Bez zapytań per element: kolumny, tablice i ścieżki modułów wczytywane raz na przebieg.
import { boardViewers, deliverNotifications, modulePathsFor, parseCells, peopleEmails, hasPeopleLike, notifyBoardAssignees } from '../dataapi/boardNotify.js';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';

export const name = 'board-automations-run';
export const skipRoute = true; // brak trasy HTTP — tylko worker

const TZ = 'Europe/Warsaw';
const TODAY_SQL = `(now() AT TIME ZONE '${TZ}')::date`;

// Bieżąca data w Warszawie → { ymd, dow (0=niedz.), dom, month, year }.
export function warsawNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, dow, dom: Number(parts.day), month: Number(parts.month), year: Number(parts.year) };
}
const ymdOf = (d) => warsawNow(d).ymd;
export const addDaysYmd = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + (Number(n) || 0)));
  return t.toISOString().slice(0, 10);
};

// „Twórca” elementu, któremu nie da się wysłać powiadomienia (formularz publiczny, automatyzacja,
// import ze starych tabel) — wszystko, co nie wygląda na e-mail.
const JUNK_CREATORS = new Set(['formularz', 'automatyzacja', 'system:board-import']);
export function notifyTargets(action, item, peopleColumnIds) {
  const p = action?.params || {};
  let raw = [];
  if (p.targetType === 'creator') raw = item.created_by ? [item.created_by] : [];
  else if (p.targetType === 'specific') raw = p.email ? [p.email] : [];
  else {
    const cells = parseCells(item.cells);
    for (const id of peopleColumnIds || []) for (const e of peopleEmails(cells[id])) raw.push(e);
  }
  const out = new Set();
  for (const r of raw) {
    const e = String(r ?? '').trim().toLowerCase();
    if (!e || JUNK_CREATORS.has(e) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
    out.add(e);
  }
  return [...out];
}

// Czy automatyzacja cykliczna (every_period) powinna wystartować teraz? (maks. raz dziennie, czas Warszawy)
export function isPeriodDue(trigger, lastRunAt, now = new Date()) {
  const cur = warsawNow(now);
  const last = lastRunAt ? warsawNow(new Date(lastRunAt)) : null;
  if (last && last.ymd === cur.ymd) return false;
  const period = trigger?.period || 'daily';
  if (period === 'daily') return true;
  if (period === 'weekly') {
    if (trigger.dayOfWeek != null) return cur.dow === Number(trigger.dayOfWeek);
    return !last || (now - new Date(lastRunAt)) >= 7 * 86400000;
  }
  if (period === 'monthly') {
    if (trigger.dayOfMonth != null) return cur.dom === Number(trigger.dayOfMonth);
    return !last || cur.month !== last.month || cur.year !== last.year;
  }
  return false;
}


// Komórki nowego elementu (akcja create_item): cells z akcji (tylko kolumny tej tablicy) + termin
// dueColumnId = dziś + dueOffsetDays (czas Warszawy). colType: Map(idKolumny → typ) — kolumny tablicy.
export function createItemCells(p, today, boardColumns = null) {
  const src = p?.cells && typeof p.cells === 'object' && !Array.isArray(p.cells) ? p.cells : {};
  const cells = {};
  for (const [k, v] of Object.entries(src)) if (!boardColumns || boardColumns.has(String(k))) cells[k] = v;
  if (p?.dueColumnId && (!boardColumns || boardColumns.has(String(p.dueColumnId)))) {
    cells[String(p.dueColumnId)] = addDaysYmd(today, Number(p.dueOffsetDays) || 0);
  }
  return cells;
}

// Kontekst przebiegu: tablice, kolumny, grupy i ścieżki modułów dla wszystkich automatyzacji naraz.
async function loadContext(pool, autos) {
  const boardIds = [...new Set(autos.map((a) => String(a.board_id)).filter(Boolean))];
  const run = { boards: new Map(), people: new Map(), colType: new Map(), columnsOf: new Map(), groupsOf: new Map(), paths: {} };
  if (!boardIds.length) return run;
  const [{ rows: boards }, { rows: cols }, { rows: groups }] = await Promise.all([
    pool.query(`SELECT id, name, module_key, source_kind, visibility, owner_email, created_by, editors
                  FROM boards WHERE id = ANY($1::uuid[])`, [boardIds]),
    pool.query(`SELECT id, board_id, type FROM board_columns WHERE board_id = ANY($1::uuid[])`, [boardIds]),
    pool.query(`SELECT id, board_id FROM board_groups WHERE board_id = ANY($1::uuid[])
                 ORDER BY board_id, display_order NULLS LAST, created_at NULLS LAST, id`, [boardIds]),
  ]);
  for (const c of cols) {
    const k = String(c.board_id);
    run.colType.set(String(c.id), c.type);
    if (!run.columnsOf.has(k)) run.columnsOf.set(k, new Set());
    run.columnsOf.get(k).add(String(c.id));
    if (c.type !== 'people') continue;
    if (!run.people.has(k)) run.people.set(k, []);
    run.people.get(k).push(String(c.id));
  }
  for (const g of groups) {
    const k = String(g.board_id);
    if (!run.groupsOf.has(k)) run.groupsOf.set(k, []);
    run.groupsOf.get(k).push(String(g.id));
  }
  for (const b of boards) run.boards.set(String(b.id), b);
  run.paths = await modulePathsFor(pool, boards);
  return run;
}

const tenantOf = (ctx) => ({ slug: ctx.tenantSlug, db_name: ctx.tenantDbName || `slug:${ctx.tenantSlug || ''}` });

async function notifyAction(pool, ctx, run, automation, item, action) {
  const board = run.boards.get(String(automation.board_id));
  if (!board) return 0;
  const emails = notifyTargets(action, item, run.people.get(String(automation.board_id)));
  if (!emails.length) return 0;
  const tenant = tenantOf(ctx);
  const viewers = await boardViewers({ db: pool, tenant, pairs: emails.map((email) => ({ email, board })), deps: ctx.deps || {} });
  if (!viewers.length) return 0;
  const p = action.params || {};
  const data = { item_id: item.id, board_id: automation.board_id, automation_id: automation.id };
  const entries = viewers.map((v) => ({
    user_email: v.account.email,
    type: 'task',
    title: p.title || `Automatyzacja: ${automation.name || 'tablica'}`,
    body: String(item.name || '').trim() || 'Element',
    link: taskItemLink(board, item.id, run.paths),
    data,
    push: { type: 'task', ...data },
  }));
  // Bez okna duplikatów — o powtórzeniach decyduje dziennik board_automation_runs (raz dziennie na element).
  const res = await deliverNotifications({ db: pool, tenant, entries, deps: ctx.deps || {}, dedupeMinutes: 0 });
  return res.entries.length;
}

// Nowy element na tablicy automatyzacji (grupa z akcji albo pierwsza grupa tablicy). Osoby z komórek
// dostają powiadomienie o przypisaniu (jak przy dodaniu elementu w aplikacji). → wiersz albo null.
async function createItem(pool, ctx, run, automation, p, fallbackName) {
  const boardKey = String(automation.board_id);
  const groups = run.groupsOf.get(boardKey) || [];
  const groupId = p.groupId && groups.includes(String(p.groupId)) ? String(p.groupId) : groups[0];
  if (!groupId) return null;
  const cells = createItemCells(p, ymdOf(new Date()), run.columnsOf.get(boardKey) || new Set());
  const { rows: [row] } = await pool.query(
    `INSERT INTO board_items (board_id, group_id, name, cells, display_order, created_by)
     SELECT $1, $2, $3, $4::jsonb, COALESCE(MAX(display_order), -1) + 1, 'automatyzacja'
       FROM board_items WHERE board_id = $1 AND group_id = $2
     RETURNING *`,
    [automation.board_id, groupId, String(p.name || '').trim() || fallbackName, JSON.stringify(cells)]);
  if (row && hasPeopleLike(row.cells)) {
    await notifyBoardAssignees({
      db: pool, tenant: tenantOf(ctx), prep: { op: 'insert', values: [{ cells }], before: new Map() },
      data: [row], rowCount: 1, actor: { name: 'Automatyzacja' }, deps: ctx.deps || {},
    });
  }
  return row || null;
}

// Dopisanie osoby do kolumny „Osoby” (bez duplikatu, bez względu na wielkość liter) na aktualnym stanie
// komórek; nowo przypisany dostaje powiadomienie. → wiersz po zmianie albo null (nic nie zmieniono).
async function assignPerson(pool, ctx, run, automation, item, p) {
  const email = String(p.email || '').trim();
  if (!p.columnId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (run.colType.get(String(p.columnId)) !== 'people' || !(run.columnsOf.get(String(automation.board_id)) || new Set()).has(String(p.columnId))) return null;
  const person = { email, name: String(p.name || '').trim() || email };
  const { rows: [prev] } = await pool.query(`SELECT id, board_id, name, cells FROM board_items WHERE id = $1`, [item.id]);
  if (!prev) return null;
  const { rows: [row] } = await pool.query(
    `UPDATE board_items
        SET cells = jsonb_set(coalesce(cells, '{}'::jsonb), ARRAY[$2::text],
              (CASE WHEN jsonb_typeof(cells -> $2) = 'array' THEN cells -> $2 ELSE '[]'::jsonb END) || jsonb_build_array($3::jsonb))
      WHERE id = $1
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cells -> $2) = 'array' THEN cells -> $2 ELSE '[]'::jsonb END) x
                         WHERE lower(CASE jsonb_typeof(x) WHEN 'object' THEN x ->> 'email' ELSE x #>> '{}' END) = lower($4))
      RETURNING *`,
    [item.id, String(p.columnId), JSON.stringify(person), email]);
  if (!row) return null;
  await notifyBoardAssignees({
    db: pool, tenant: tenantOf(ctx),
    prep: { op: 'update', values: [{ cells: row.cells }], before: new Map([[String(prev.id), prev]]) },
    data: [row], rowCount: 1, actor: { name: 'Automatyzacja' }, deps: ctx.deps || {},
  });
  return row;
}

// Akcje po kolei na AKTUALNYM stanie elementu (np. „przypisz osobę”, potem „powiadom przypisanych”).
async function runActions(pool, ctx, run, automation, firstItem) {
  const boardId = automation.board_id;
  const detail = [];
  let item = firstItem;
  const setCell = async (columnId, value) => {
    const { rows: [row] } = await pool.query(
      `UPDATE board_items SET cells = jsonb_set(coalesce(cells,'{}'::jsonb), $2, to_jsonb($3::text)) WHERE id=$1 RETURNING *`,
      [item.id, `{${columnId}}`, value]);
    if (row) item = row;
  };
  for (const action of (automation.actions || [])) {
    const p = action.params || {};
    try {
      if (action.type === 'notify') {
        detail.push(`notify:${await notifyAction(pool, ctx, run, automation, item, action)}`);
      } else if (action.type === 'change_status' && p.columnId) {
        await setCell(p.columnId, p.value);
        detail.push('change_status');
      } else if (action.type === 'set_date' && p.columnId) {
        await setCell(p.columnId, addDaysYmd(ymdOf(new Date()), p.offsetDays || 0));
        detail.push('set_date');
      } else if (action.type === 'assign_person') {
        const row = await assignPerson(pool, ctx, run, automation, item, p);
        if (row) item = row;
        detail.push(row ? 'assign_person' : 'assign_person:0');
      } else if (action.type === 'create_item') {
        const row = await createItem(pool, ctx, run, automation, p, 'Nowe zadanie');
        detail.push(row ? `create_item:${row.id}` : 'create_item:0');
      } else if (action.type === 'create_update') {
        await pool.query(
          `INSERT INTO board_item_updates (item_id, board_id, author_name, body, mentions, likes)
           VALUES ($1,$2,'Automatyzacja',$3,'{}','{}')`,
          [item.id, boardId, p.text || '']);
        detail.push('create_update');
      }
    } catch (e) {
      detail.push(`err:${action.type}`);
      ctx?.log?.(`akcja ${action.type} błąd: ${e.message}`);
    }
  }
  await pool.query(
    `INSERT INTO board_automation_runs (automation_id, board_id, item_id, status, detail) VALUES ($1,$2,$3,'success',$4::jsonb)`,
    [automation.id, boardId, item.id, JSON.stringify({ actions: detail, trigger: 'date_arrives' })]
  );
}

// Cykliczne „utwórz element”: groupId + cells z akcji, opcjonalnie termin (dueColumnId, dueOffsetDays).
async function runRecurring(pool, ctx, run, due) {
  for (const a of due) {
    for (const action of (a.actions || [])) {
      if (action.type !== 'create_item') continue;
      try {
        const row = await createItem(pool, ctx, run, a, action.params || {}, 'Zadanie cykliczne');
        if (!row) continue;
        await pool.query(`INSERT INTO board_automation_runs (automation_id, board_id, item_id, status, detail) VALUES ($1,$2,$3,'success',$4::jsonb)`,
          [a.id, a.board_id, row.id, JSON.stringify({ recurring: a.trigger?.period })]);
        ctx?.log?.(`cykliczna „${a.name || a.id}" → nowy element ${row.id}`);
      } catch (e) {
        ctx?.log?.(`cykliczna „${a.name || a.id}" błąd: ${e.message}`);
      }
    }
    await pool.query(`UPDATE board_automations SET last_run_at = now() WHERE id=$1`, [a.id]);
  }
}

export async function runForTenant(pool, ctx = {}) {
  const { rows: autos } = await pool.query(
    `SELECT * FROM board_automations WHERE enabled = true AND trigger->>'type' IN ('date_arrives', 'every_period')`);
  if (!autos.length) return;
  const recurring = autos.filter((a) => a.trigger?.type === 'every_period' && isPeriodDue(a.trigger || {}, a.last_run_at));
  const dated = autos.filter((a) => a.trigger?.type === 'date_arrives' && a.trigger?.columnId);
  if (!recurring.length && !dated.length) return;
  const run = await loadContext(pool, [...recurring, ...dated]);

  await runRecurring(pool, ctx, run, recurring).catch((e) => ctx?.log?.(`recurring błąd: ${e.message}`));

  for (const a of dated) {
    const colId = String(a.trigger.columnId);
    const type = run.colType.get(colId);
    if (!type) continue; // kolumna usunięta
    // daysBefore: dodatnie — tyle dni PRZED datą, ujemne — tyle dni PO dacie (komórka = dziś + daysBefore,
    // czas Warszawy). Elementy, dla których automatyzacja już dziś zadziałała, odpadają w tym samym zapytaniu.
    const cell = type === 'timeline' ? `i.cells -> $2 ->> 'end'` : `i.cells ->> $2`;
    const { rows: items } = await pool.query(
      `SELECT i.* FROM board_items i
        WHERE i.board_id = $1 AND ${cell} = to_char(${TODAY_SQL} + $3::int, 'YYYY-MM-DD')
          AND NOT EXISTS (SELECT 1 FROM board_automation_runs r
                           WHERE r.automation_id = $4 AND r.item_id = i.id
                             AND (r.ran_at AT TIME ZONE '${TZ}')::date = ${TODAY_SQL})`,
      [a.board_id, colId, Math.round(Number(a.trigger?.daysBefore) || 0), a.id]);
    for (const it of items) {
      await runActions(pool, ctx, run, a, it);
      ctx?.log?.(`automatyzacja „${a.name || a.id}" → element ${it.id}`);
    }
    await pool.query(`UPDATE board_automations SET last_run_at = now() WHERE id=$1`, [a.id]);
  }
}
