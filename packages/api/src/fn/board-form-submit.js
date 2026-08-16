// Publiczne wysłanie formularza tablicy → tworzy element (board_item).
// Walidacja po tokenie; komórki sanityzowane względem realnych kolumn (tylko
// dozwolone typy) — brak dostępu do dowolnego zapisu w DB.
export const name = 'board-form-submit';
export const isPublic = true;

const ALLOWED_TYPES = new Set([
  'text', 'long_text', 'number', 'date', 'timeline', 'dropdown',
  'status', 'priority', 'checkbox', 'rating', 'link', 'progress',
]);

export default async function handler(req, reply) {
  try {
    const { token, name: itemName, cells = {}, respondent = {} } = req.body || {};
    if (!token) return reply.code(400).send({ error: 'Brak tokenu' });
    if (!itemName || !String(itemName).trim()) return reply.code(400).send({ error: 'Nazwa jest wymagana' });

    const { rows } = await req.db.query(
      `SELECT id, form_settings FROM boards WHERE form_token = $1 AND form_enabled = true LIMIT 1`, [token]);
    const board = rows[0];
    if (!board) return reply.code(404).send({ error: 'Formularz niedostępny' });

    // Dozwolone kolumny tej tablicy → filtr sanityzujący cells.
    const { rows: cols } = await req.db.query(
      `SELECT id, type FROM board_columns WHERE board_id = $1`, [board.id]);
    const allowed = new Map(cols.filter(c => ALLOWED_TYPES.has(c.type)).map(c => [c.id, c.type]));
    const safeCells = {};
    for (const [k, v] of Object.entries(cells || {})) if (allowed.has(k)) safeCells[k] = v;

    // Pierwsza grupa (albo utwórz „Zgłoszenia")
    let { rows: grp } = await req.db.query(
      `SELECT id FROM board_groups WHERE board_id = $1 ORDER BY display_order LIMIT 1`, [board.id]);
    let groupId = grp[0]?.id;
    if (!groupId) {
      const { rows: g } = await req.db.query(
        `INSERT INTO board_groups (board_id, name, color, display_order) VALUES ($1,'Zgłoszenia','#579bfc',0) RETURNING id`, [board.id]);
      groupId = g[0].id;
    }

    const { rows: ord } = await req.db.query(
      `SELECT COALESCE(MAX(display_order),-1)+1 AS n FROM board_items WHERE board_id=$1 AND group_id=$2`, [board.id, groupId]);
    const settings = board.form_settings || {};
    const createdBy = (!settings.anonymous && respondent?.email) ? String(respondent.email).slice(0, 200) : 'formularz';

    const { rows: item } = await req.db.query(
      `INSERT INTO board_items (board_id, group_id, name, cells, display_order, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING id`,
      [board.id, groupId, String(itemName).slice(0, 500), JSON.stringify(safeCells), ord[0].n, createdBy]);

    // Dziennik aktywności (utworzono przez formularz)
    await req.db.query(
      `INSERT INTO board_item_activity (item_id, board_id, actor_name, action, to_value)
       VALUES ($1,$2,$3,'created',$4::jsonb)`,
      [item[0].id, board.id, settings.anonymous ? 'Anonim' : (respondent?.name || 'Formularz'), JSON.stringify({ via: 'form' })]
    ).catch(() => {});

    return reply.send({ ok: true, message: settings.submitMessage || 'Dziękujemy! Zgłoszenie zostało wysłane.' });
  } catch (err) {
    req.log?.error?.({ err }, 'board-form-submit');
    return reply.code(500).send({ error: err.message });
  }
}
