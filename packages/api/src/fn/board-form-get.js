// Publiczny odczyt definicji formularza tablicy (WorkForms-style) po tokenie.
// Zwraca tylko bezpieczny podzbiór kolumn — bez pól obliczanych/relacyjnych/plików/osób.
export const name = 'board-form-get';
export const isPublic = true; // formularz wypełniany bez logowania (tenant z Host/X-Tenant)

const ALLOWED_TYPES = new Set([
  'text', 'long_text', 'number', 'date', 'timeline', 'dropdown',
  'status', 'priority', 'checkbox', 'rating', 'link', 'progress',
]);

export default async function handler(req, reply) {
  try {
    const { token } = req.body || {};
    if (!token) return reply.code(400).send({ error: 'Brak tokenu' });

    const { rows } = await req.db.query(
      `SELECT id, name, color, form_settings FROM boards WHERE form_token = $1 AND form_enabled = true LIMIT 1`, [token]);
    const board = rows[0];
    if (!board) return reply.code(404).send({ error: 'Formularz niedostępny' });

    const { rows: cols } = await req.db.query(
      `SELECT id, name, type, settings, display_order FROM board_columns WHERE board_id = $1 ORDER BY display_order`, [board.id]);

    const settings = board.form_settings || {};
    const pickList = Array.isArray(settings.fields) && settings.fields.length ? new Set(settings.fields) : null;
    const columns = cols
      .filter(c => ALLOWED_TYPES.has(c.type))
      .filter(c => !pickList || pickList.has(c.id));

    return reply.send({
      board: { id: board.id, name: board.name, color: board.color, settings },
      columns,
    });
  } catch (err) {
    req.log?.error?.({ err }, 'board-form-get');
    return reply.code(500).send({ error: err.message });
  }
}
