// Publiczne wysłanie formularza tablicy → tworzy element (board_item).
// Walidacja po tokenie; komórki sanityzowane względem realnych kolumn (tylko dozwolone typy,
// a gdy formularz ma wybraną listę pól — form_settings.fields — tylko te pola) i przycinane do
// rozsądnych rozmiarów (tekst, liczba pozycji listy). Limit wysyłek per IP jak w publicznych
// formularzach (public-form-submit). Brak dostępu do dowolnego zapisu w DB.
import { rateLimit as publicFormRateLimit } from './public-form-submit.js';

export const name = 'board-form-submit';
export const isPublic = true;
export const rateLimit = publicFormRateLimit;

export const ALLOWED_TYPES = new Set([
  'text', 'long_text', 'number', 'date', 'timeline', 'dropdown',
  'status', 'priority', 'checkbox', 'rating', 'link', 'progress',
]);

const MAX_TEXT = 2000;
const MAX_LONG_TEXT = 10000;
const MAX_NAME = 500;
const MAX_LIST = 50;
const MAX_ID = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][0-9:.+\-Z]{0,30})?$/;
const SAFE_URL_RE = /^(https?:\/\/|mailto:)/i;

// Kolumny widoczne w formularzu: dozwolone typy, a przy form_settings.fields — tylko wybrane.
export function formColumns(cols, formSettings) {
  const fields = Array.isArray(formSettings?.fields) && formSettings.fields.length
    ? new Set(formSettings.fields.map(String)) : null;
  return (cols || []).filter((c) => ALLOWED_TYPES.has(c.type) && (!fields || fields.has(String(c.id))));
}

const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : null);
const dateStr = (v) => (typeof v === 'string' && DATE_RE.test(v.trim()) ? v.trim().slice(0, 40) : null);
const num = (v, min = -Infinity, max = Infinity) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const idsOf = (list) => new Set((Array.isArray(list) ? list : []).map((o) => String(o?.id ?? '')).filter(Boolean));

// Wartość komórki danego typu w kształcie komórek tablicy (jak FormField w webie) albo null (pomiń).
export function sanitizeFormCell(column, value) {
  if (value === undefined || value === null) return null;
  const s = column.settings || {};
  switch (column.type) {
    case 'text': return str(value, MAX_TEXT);
    case 'long_text': return str(value, MAX_LONG_TEXT);
    case 'number': return num(value);
    case 'rating': return num(value, 0, 10);
    case 'progress': return num(value, 0, 100);
    case 'checkbox': return value === true;
    case 'date': return dateStr(value);
    case 'timeline': {
      if (typeof value !== 'object' || Array.isArray(value)) return null;
      const start = dateStr(value.start);
      const end = dateStr(value.end);
      return start || end ? { start, end } : null;
    }
    case 'link': {
      const url = typeof value === 'string' ? value : value?.url;
      if (typeof url !== 'string' || !SAFE_URL_RE.test(url.trim())) return null;
      const text = typeof value === 'object' ? str(value.text ?? '', MAX_TEXT) : '';
      return { url: url.trim().slice(0, MAX_TEXT), text: text || '' };
    }
    case 'status':
    case 'priority': {
      const id = str(value, MAX_ID);
      const known = idsOf(s.labels);
      return id && (!known.size || known.has(id)) ? id : null;
    }
    case 'dropdown': {
      const known = idsOf(s.options);
      const list = (Array.isArray(value) ? value : [value])
        .map((v) => str(v, MAX_ID)).filter((v) => v && (!known.size || known.has(v)));
      const uniq = [...new Set(list)].slice(0, MAX_LIST);
      return uniq.length ? uniq : null;
    }
    default: return null;
  }
}

export function sanitizeFormCells(columns, cells) {
  const out = {};
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return out;
  const byId = new Map((columns || []).map((c) => [String(c.id), c]));
  for (const [k, v] of Object.entries(cells)) {
    const col = byId.get(String(k));
    if (!col) continue;
    const clean = sanitizeFormCell(col, v);
    if (clean !== null) out[col.id] = clean;
  }
  return out;
}

export default async function handler(req, reply) {
  try {
    const { token, name: itemName, cells = {}, respondent = {} } = req.body || {};
    if (!token || typeof token !== 'string' || token.length > 200) return reply.code(400).send({ error: 'Brak tokenu' });
    if (!itemName || !String(itemName).trim()) return reply.code(400).send({ error: 'Nazwa jest wymagana' });

    const { rows } = await req.db.query(
      `SELECT id, form_settings FROM boards WHERE form_token = $1 AND form_enabled = true LIMIT 1`, [token]);
    const board = rows[0];
    if (!board) return reply.code(404).send({ error: 'Formularz niedostępny' });
    const settings = board.form_settings || {};

    // Dozwolone kolumny tej tablicy (i tego formularza) → filtr sanityzujący cells.
    const { rows: cols } = await req.db.query(
      `SELECT id, type, settings FROM board_columns WHERE board_id = $1`, [board.id]);
    const safeCells = sanitizeFormCells(formColumns(cols, settings), cells);

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
    const respondentEmail = typeof respondent?.email === 'string' ? respondent.email.trim().slice(0, 200) : '';
    const respondentName = typeof respondent?.name === 'string' ? respondent.name.trim().slice(0, 200) : '';
    const createdBy = (!settings.anonymous && respondentEmail) ? respondentEmail : 'formularz';

    const { rows: item } = await req.db.query(
      `INSERT INTO board_items (board_id, group_id, name, cells, display_order, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING id`,
      [board.id, groupId, String(itemName).trim().slice(0, MAX_NAME), JSON.stringify(safeCells), ord[0].n, createdBy]);

    // Dziennik aktywności (utworzono przez formularz)
    await req.db.query(
      `INSERT INTO board_item_activity (item_id, board_id, actor_name, action, to_value)
       VALUES ($1,$2,$3,'created',$4::jsonb)`,
      [item[0].id, board.id, settings.anonymous ? 'Anonim' : (respondentName || 'Formularz'), JSON.stringify({ via: 'form' })]
    ).catch(() => {});

    return reply.send({ ok: true, message: settings.submitMessage || 'Dziękujemy! Zgłoszenie zostało wysłane.' });
  } catch (err) {
    req.log?.error?.({ err }, 'board-form-submit');
    return reply.code(500).send({ error: 'Nie udało się wysłać formularza' });
  }
}
