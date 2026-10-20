// Komunikator — zadanie z wiadomości i zapisane wiadomości (migracja 114), strażnicy zapisu /api/db.
//
//  • board_items.source_message_id / source_conversation_id: powiązanie zadania z wiadomością czatu.
//    Ustawić je może tylko UCZESTNIK rozmowy tej wiadomości (inaczej przez id cudzej wiadomości dałoby
//    się „podpiąć” prywatną rozmowę pod zadanie). Rozmowę zawsze wyznacza serwer z wiadomości —
//    wartości od klienta nie ufamy. Odpięcie (null) wolno każdemu, kto może zmienić zadanie.
//  • saved_messages: tabela osobista (ownership.js — wiersze widzi i zmienia tylko właściciel).
//    Tu: zapis tylko wiadomości z rozmowy, w której jestem; e-mail małymi literami (unikalność
//    user_email + message_id); ponowne zapisanie tej samej wiadomości nie jest błędem (upsert);
//    zmiana — wyłącznie notatki.
import { ApiError } from './querybuilder.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SAVED_NOTE_MAX = 2000;
const SOURCE_COLS = ['source_message_id', 'source_conversation_id'];

// Wiadomości (id → conversation_id) z rozmów, w których jestem. Brak w mapie = nie istnieje albo
// nie mam do niej dostępu (bez rozróżnienia — nie zdradzamy istnienia cudzej wiadomości).
export async function accessibleMessages(db, ids, email) {
  const list = [...new Set((ids || []).filter((v) => v != null && v !== '').map(String))];
  if (!list.length) return new Map();
  if (list.some((v) => !UUID_RE.test(v))) throw new ApiError(400, 'Nieprawidłowy identyfikator wiadomości');
  const { rows } = await db.query(
    `SELECT m.id::text AS id, m.conversation_id::text AS conversation_id
       FROM messages m
      WHERE m.id::text = ANY($1::text[])
        AND EXISTS (SELECT 1 FROM conversation_participants p
                     WHERE p.conversation_id = m.conversation_id AND lower(p.user_email) = $2)`,
    [list, lower(email)]
  );
  return new Map(rows.map((r) => [r.id, r.conversation_id]));
}

// Zapis board_items: powiązanie z wiadomością tylko z rozmowy, w której jestem; rozmowa z wiadomości.
export async function enforceMessageTaskLink(q, req) {
  if (q.table !== 'board_items' || !['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  const rows = rowsOf(q);
  if (!rows.some((r) => SOURCE_COLS.some((c) => c in r))) return;
  const wanted = rows.map((r) => r.source_message_id).filter((v) => v != null && v !== '');
  const found = await accessibleMessages(req.db, wanted, req.user?.email);
  for (const r of rows) {
    if (!SOURCE_COLS.some((c) => c in r)) continue;
    const msg = r.source_message_id;
    if (msg == null || msg === '') {
      // Odpięcie (albo sama rozmowa bez wiadomości) — rozmowy bez wiadomości nie zapisujemy.
      if (q.op === 'update' && !('source_message_id' in r)) throw new ApiError(403, 'Rozmowę zadania ustawia serwer z wiadomości');
      r.source_message_id = null;
      r.source_conversation_id = null;
      continue;
    }
    const conv = found.get(String(msg));
    if (!conv) throw new ApiError(403, 'Zadanie możesz utworzyć tylko z wiadomości w rozmowie, w której jesteś');
    r.source_message_id = String(msg);
    r.source_conversation_id = conv;
  }
}

// Zapis saved_messages (przed ownership.js — ten i tak pilnuje właściciela wierszy).
export async function enforceSavedMessageWrite(q, req) {
  if (q.table !== 'saved_messages' || !['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  const me = lower(req.user?.email);
  if (!me) throw new ApiError(401, 'Brak użytkownika');
  const rows = rowsOf(q);

  if (q.op === 'update') {
    const v = rows[0] || {};
    for (const k of Object.keys(v)) {
      if (k !== 'note') throw new ApiError(403, 'W zapisanej wiadomości zmienić można tylko notatkę');
    }
    v.note = cleanNote(v.note);
    return;
  }

  const found = await accessibleMessages(req.db, rows.map((r) => r.message_id), me);
  for (const r of rows) {
    if (r.user_email != null && r.user_email !== '' && lower(r.user_email) !== me) {
      throw new ApiError(403, 'Wiadomość zapisujesz tylko dla siebie');
    }
    const msg = r.message_id == null ? '' : String(r.message_id);
    if (!msg) throw new ApiError(400, 'Wskaż wiadomość do zapisania');
    const conv = found.get(msg);
    if (!conv) throw new ApiError(403, 'Zapisać możesz tylko wiadomość z rozmowy, w której jesteś');
    const hasNote = 'note' in r;
    const note = hasNote ? cleanNote(r.note) : undefined;
    for (const k of Object.keys(r)) delete r[k];
    r.user_email = me;
    r.message_id = msg;
    r.conversation_id = conv;
    if (hasNote) r.note = note;
  }
  // Ponowne zapisanie — bez błędu, zwraca istniejący wiersz (notatka zostaje, gdy jej nie podano).
  q.op = 'upsert';
  q.onConflict = 'user_email,message_id';
  q.ignoreDuplicates = false;
  if (!q.returning) q.returning = '*';
}

function cleanNote(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, SAVED_NOTE_MAX);
}
