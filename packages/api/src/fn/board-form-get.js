// Publiczny odczyt definicji formularza tablicy (WorkForms-style) po tokenie.
// Zwraca tylko bezpieczny podzbiór kolumn — bez pól obliczanych/relacyjnych/plików/osób, a gdy
// formularz ma wybraną listę pól (form_settings.fields) — tylko te. Limit zapytań per IP
// (zgadywanie tokenów); hojniejszy niż wysyłka, bo strona formularza czyta definicję przy wejściu.
import { formColumns } from './board-form-submit.js';

export const name = 'board-form-get';
export const isPublic = true; // formularz wypełniany bez logowania (tenant z Host/X-Tenant)
export const rateLimit = { max: 60, timeWindow: '10 minutes' };

export default async function handler(req, reply) {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string' || token.length > 200) return reply.code(400).send({ error: 'Brak tokenu' });

    const { rows } = await req.db.query(
      `SELECT id, name, color, form_settings FROM boards WHERE form_token = $1 AND form_enabled = true LIMIT 1`, [token]);
    const board = rows[0];
    if (!board) return reply.code(404).send({ error: 'Formularz niedostępny' });

    const { rows: cols } = await req.db.query(
      `SELECT id, name, type, settings, display_order FROM board_columns WHERE board_id = $1 ORDER BY display_order`, [board.id]);

    const settings = board.form_settings || {};
    return reply.send({
      board: { id: board.id, name: board.name, color: board.color, settings },
      columns: formColumns(cols, settings),
    });
  } catch (err) {
    req.log?.error?.({ err }, 'board-form-get');
    return reply.code(500).send({ error: 'Formularz niedostępny' });
  }
}
