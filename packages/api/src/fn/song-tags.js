// Słownik tagów pieśni (Baza pieśni) — wspólny dla wszystkich liderów, zamiast localStorage
// jednej przeglądarki. Trzymany w app_settings pod kluczem `song_tags` (tablica tekstów JSON).
// Odczyt robi klient wprost (app_settings czyta każdy zalogowany), ZAPIS idzie tędy, bo zapis
// do app_settings wymaga uprawnień administratora, a tag dodaje lider zespołu uwielbienia.
//
// Body: { action: 'add' | 'remove' | 'rename' | 'merge', tag?, to?, tags? }
//   add    — dodaj `tag` (bez duplikatów, bez wielkości liter),
//   remove — usuń `tag`,
//   rename — zmień `tag` na `to`,
//   merge  — dopisz wiele `tags` naraz (np. przeniesienie starych tagów z przeglądarki).
// Odpowiedź: { tags: [...] } — aktualny słownik.
// Dostęp: kto może edytować pieśni (canAccess update na songs). Brak wpisu w FN_CAPABILITY.
import { canAccess } from '../dataapi/registry.js';

export const name = 'song-tags';
export const method = 'POST';

export const SETTINGS_KEY = 'song_tags';
const MAX_TAGS = 500;
const MAX_LEN = 60;

export const cleanTag = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
const same = (a, b) => a.toLocaleLowerCase('pl') === b.toLocaleLowerCase('pl');

// Odczyt wartości app_settings (text albo jsonb, także podwójnie zakodowany JSON) → tablica.
export function parseTags(value) {
  let v = value;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try { v = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v) ? v.map(cleanTag).filter(Boolean) : [];
}

// Czysta operacja na liście (testowana). Zwraca { tags } albo { error }.
export function applyTagOp(list, body = {}) {
  const tags = [];
  for (const t of list || []) { const c = cleanTag(t); if (c && !tags.some((x) => same(x, c))) tags.push(c); }
  const action = String(body.action || '');
  const tag = cleanTag(body.tag);
  if (action === 'add') {
    if (!tag) return { error: 'Podaj nazwę tagu' };
    if (!tags.some((x) => same(x, tag))) tags.push(tag);
  } else if (action === 'remove') {
    if (!tag) return { error: 'Podaj nazwę tagu' };
    return { tags: sortTags(tags.filter((x) => !same(x, tag))) };
  } else if (action === 'rename') {
    const to = cleanTag(body.to);
    if (!tag || !to) return { error: 'Podaj starą i nową nazwę tagu' };
    const out = [];
    for (const x of tags) { const v = same(x, tag) ? to : x; if (!out.some((y) => same(y, v))) out.push(v); }
    if (!out.some((y) => same(y, to))) out.push(to);
    return { tags: sortTags(out) };
  } else if (action === 'merge') {
    for (const t of Array.isArray(body.tags) ? body.tags : []) { const c = cleanTag(t); if (c && !tags.some((x) => same(x, c))) tags.push(c); }
  } else {
    return { error: 'Nieznana operacja' };
  }
  if (tags.length > MAX_TAGS) return { error: 'Za dużo tagów' };
  return { tags: sortTags(tags) };
}

const sortTags = (arr) => [...arr].sort((a, b) => a.localeCompare(b, 'pl'));

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });

  const { rows: me } = await req.db.query('SELECT id, role, is_super_admin, campus_id FROM app_users WHERE id = $1', [req.user.id]);
  if (!me[0]) return reply.code(403).send({ error: 'Brak konta' });
  const access = await canAccess({ pool: req.db, dbName: req.tenant.db_name, table: 'songs', op: 'update', user: { ...req.user, ...me[0] } });
  if (!access.ok) return reply.code(403).send({ error: 'Tagi pieśni może zmieniać osoba, która edytuje Bazę pieśni' });

  const client = await req.db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, value::text AS value FROM app_settings WHERE key = $1 FOR UPDATE', [SETTINGS_KEY]);
    const result = applyTagOp(parseTags(rows[0]?.value), req.body || {});
    if (result.error) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: result.error });
    }
    const json = JSON.stringify(result.tags);
    if (rows[0]) await client.query('UPDATE app_settings SET value = $2 WHERE id = $1', [rows[0].id, json]);
    else await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [SETTINGS_KEY, json]);
    await client.query('COMMIT');
    return { tags: result.tags };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    req.log?.error?.(err, '[song-tags]');
    return reply.code(500).send({ error: 'Nie udało się zapisać tagów' });
  } finally {
    client.release();
  }
}
