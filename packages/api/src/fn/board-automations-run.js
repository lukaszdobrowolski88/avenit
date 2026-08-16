// Wykonawca automatyzacji czasowych tablic (wyzwalacz `date_arrives`).
// Uruchamiany cyklicznie przez worker (packages/api/src/worker.js) per tenant.
// Wyzwalacze natychmiastowe (status/kolumna/przypisanie/utworzenie) obsługuje
// klient w useBoardAutomations — tu tylko te oparte o daty.
export const name = 'board-automations-run';
export const skipRoute = true; // brak trasy HTTP — tylko worker

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

async function peopleEmailsOfItem(pool, boardId, item) {
  const { rows: cols } = await pool.query(`SELECT id FROM board_columns WHERE board_id=$1 AND type='people'`, [boardId]);
  const emails = new Set();
  for (const c of cols) {
    const arr = item.cells?.[c.id] || [];
    for (const p of arr) if (p?.email) emails.add(p.email);
  }
  return [...emails];
}

async function runActions(pool, automation, item, ctx) {
  const boardId = automation.board_id;
  const detail = [];
  for (const action of (automation.actions || [])) {
    const p = action.params || {};
    try {
      if (action.type === 'notify') {
        let targets = [];
        if (p.targetType === 'creator') targets = item.created_by ? [item.created_by] : [];
        else if (p.targetType === 'specific') targets = p.email ? [p.email] : [];
        else targets = await peopleEmailsOfItem(pool, boardId, item);
        for (const email of targets) {
          await pool.query(
            `INSERT INTO notifications (user_email, type, title, body, link, data)
             VALUES ($1,'task',$2,$3,$4,$5::jsonb)`,
            [email, p.title || `Automatyzacja: ${automation.name || 'tablica'}`, item.name || 'Element',
             `/projekty?board=${boardId}`, JSON.stringify({ item_id: item.id, board_id: boardId, automation_id: automation.id })]
          );
        }
        detail.push(`notify:${targets.length}`);
      } else if (action.type === 'change_status' && p.columnId) {
        await pool.query(`UPDATE board_items SET cells = jsonb_set(coalesce(cells,'{}'::jsonb), $2, to_jsonb($3::text)) WHERE id=$1`,
          [item.id, `{${p.columnId}}`, p.value]);
        detail.push('change_status');
      } else if (action.type === 'set_date' && p.columnId) {
        const val = ymd(addDays(new Date(), p.offsetDays || 0));
        await pool.query(`UPDATE board_items SET cells = jsonb_set(coalesce(cells,'{}'::jsonb), $2, to_jsonb($3::text)) WHERE id=$1`,
          [item.id, `{${p.columnId}}`, val]);
        detail.push('set_date');
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

// Czy automatyzacja cykliczna (every_period) powinna wystartować teraz?
function isPeriodDue(trigger, lastRunAt) {
  const now = new Date();
  const last = lastRunAt ? new Date(lastRunAt) : null;
  if (last && last.toDateString() === now.toDateString()) return false; // maks. raz dziennie
  const period = trigger.period || 'daily';
  if (period === 'daily') return true;
  if (period === 'weekly') {
    if (trigger.dayOfWeek != null) return now.getDay() === Number(trigger.dayOfWeek);
    return !last || (now - last) >= 7 * 86400000;
  }
  if (period === 'monthly') {
    if (trigger.dayOfMonth != null) return now.getDate() === Number(trigger.dayOfMonth);
    return !last || now.getMonth() !== last.getMonth() || now.getFullYear() !== last.getFullYear();
  }
  return false;
}

async function runRecurring(pool, ctx) {
  const { rows: autos } = await pool.query(
    `SELECT * FROM board_automations WHERE enabled = true AND trigger->>'type' = 'every_period'`);
  for (const a of autos) {
    if (!isPeriodDue(a.trigger || {}, a.last_run_at)) continue;
    for (const action of (a.actions || [])) {
      if (action.type !== 'create_item') continue;
      const p = action.params || {};
      let groupId = p.groupId;
      if (!groupId) {
        const g = await pool.query(`SELECT id FROM board_groups WHERE board_id=$1 ORDER BY display_order LIMIT 1`, [a.board_id]);
        groupId = g.rows[0]?.id;
      }
      if (!groupId) continue;
      const ord = await pool.query(`SELECT COALESCE(MAX(display_order),-1)+1 AS n FROM board_items WHERE board_id=$1 AND group_id=$2`, [a.board_id, groupId]);
      const { rows: it } = await pool.query(
        `INSERT INTO board_items (board_id, group_id, name, cells, display_order, created_by)
         VALUES ($1,$2,$3,$4::jsonb,$5,'automatyzacja') RETURNING id`,
        [a.board_id, groupId, p.name || 'Zadanie cykliczne', JSON.stringify(p.cells || {}), ord.rows[0].n]);
      await pool.query(`INSERT INTO board_automation_runs (automation_id, board_id, item_id, status, detail) VALUES ($1,$2,$3,'success',$4::jsonb)`,
        [a.id, a.board_id, it[0].id, JSON.stringify({ recurring: a.trigger.period })]);
      ctx?.log?.(`cykliczna „${a.name || a.id}" → nowy element ${it[0].id}`);
    }
    await pool.query(`UPDATE board_automations SET last_run_at = now() WHERE id=$1`, [a.id]);
  }
}

export async function runForTenant(pool, ctx = {}) {
  await runRecurring(pool, ctx).catch(e => ctx?.log?.(`recurring błąd: ${e.message}`));

  const { rows: autos } = await pool.query(
    `SELECT * FROM board_automations WHERE enabled = true AND trigger->>'type' = 'date_arrives'`
  );
  if (!autos.length) return;

  for (const a of autos) {
    const colId = a.trigger?.columnId;
    if (!colId) continue;
    const { rows: colRows } = await pool.query(`SELECT type FROM board_columns WHERE id=$1`, [colId]);
    const col = colRows[0];
    if (!col) continue;

    // daysBefore>0 → wyzwól tyle dni przed datą (dopasuj cell = dziś + daysBefore)
    const target = ymd(addDays(new Date(), a.trigger?.daysBefore || 0));

    const q = col.type === 'timeline'
      ? `SELECT * FROM board_items WHERE board_id=$1 AND cells->$2->>'end' = $3`
      : `SELECT * FROM board_items WHERE board_id=$1 AND cells->>$2 = $3`;
    const { rows: items } = await pool.query(q, [a.board_id, colId, target]);

    for (const it of items) {
      const { rows: dup } = await pool.query(
        `SELECT 1 FROM board_automation_runs WHERE automation_id=$1 AND item_id=$2 AND ran_at::date = CURRENT_DATE LIMIT 1`,
        [a.id, it.id]);
      if (dup.length) continue; // już wykonano dziś dla tego elementu
      await runActions(pool, a, it, ctx);
      ctx?.log?.(`automatyzacja „${a.name || a.id}" → element ${it.id}`);
    }
    await pool.query(`UPDATE board_automations SET last_run_at = now() WHERE id=$1`, [a.id]);
  }
}
