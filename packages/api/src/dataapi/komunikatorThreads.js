// Komunikator — wątki (odpowiedzi w wątku, migracja 112).
//
// • Główna oś rozmowy = wiadomości bez thread_root_id. Zapytanie o wiadomości, które nie pyta
//   wprost o wątek (thread_root_id) ani o konkretne wiadomości (id), dostaje thread_root_id IS NULL —
//   także starsze wersje aplikacji (lista, liczniki nieprzeczytanych, ostatnia wiadomość rozmowy).
// • Zapis odpowiedzi: wiadomość główna musi istnieć w tej samej rozmowie (odpowiedź na odpowiedź
//   jest spłaszczana do korzenia); pozostałe zasady (uczestnik, kanał „tylko administratorzy”,
//   blokady, @wszyscy) — jak zwykła wiadomość (komunikator.js). Liczniki wątku liczy tylko trigger.
// • Obserwujący (message_thread_followers): wpis tylko własny, rozmowa z wiadomości głównej.
// • Realtime: po odpowiedzi (dodanie/usunięcie) wiadomość główna z nowymi licznikami idzie do
//   uczestników rozmowy jako UPDATE — klienci odświeżają „N odpowiedzi”.
import { ApiError } from './querybuilder.js';

export const THREAD_FOLLOWERS = 'message_thread_followers';
const COUNTERS = ['thread_reply_count', 'thread_last_reply_at'];
const lower = (v) => String(v ?? '').toLowerCase();
const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);

// Czy filtr wskazuje wątek albo konkretne wiadomości (wtedy bez domyślnego zawężenia).
const THREAD_OR_ID = /(^|,)\s*(thread_root_id|id)\./;
function targetsThreadOrIds(f) {
  if (!f) return false;
  if (f.column === 'thread_root_id' || f.column === 'id') return true;
  if (f.type === 'or') return THREAD_OR_ID.test(String(f.value ?? ''));
  if (f.type === 'match') return Object.keys(f.value || {}).some((k) => k === 'id' || k === 'thread_root_id');
  return false;
}

// Odczyt wiadomości: domyślnie tylko główna oś rozmowy (mutuje q.filters).
export function applyMainFeedDefault(q) {
  if (q?.table !== 'messages' || q.op !== 'select') return;
  if ((q.filters || []).some(targetsThreadOrIds)) return;
  q.filters = [...(q.filters || []), { type: 'is', column: 'thread_root_id', value: null }];
}

async function rootOf(db, id) {
  const { rows } = await db.query(
    `SELECT id, conversation_id, thread_root_id, deleted_at FROM messages WHERE id::text = $1`,
    [String(id)]
  );
  return rows[0] || null;
}

// Walidacja zapisu messages / message_thread_followers — mutuje wiersze (wołane z
// enforceConversationWrite, PRZED sprawdzeniem uczestnika rozmowy).
export async function normalizeThreadWrite(q, req) {
  if (!q?.values || !['insert', 'upsert', 'update'].includes(q.op)) return;
  const db = req.db;
  const rows = rowsOf(q);

  if (q.table === 'messages') {
    if (q.op === 'update') {
      for (const r of rows) {
        if ('thread_root_id' in r) throw new ApiError(403, 'Nie można przenieść wiadomości do innego wątku');
        if (COUNTERS.some((c) => c in r)) throw new ApiError(403, 'Liczniki wątku liczy serwer');
      }
      return;
    }
    for (const r of rows) {
      for (const c of COUNTERS) delete r[c];
      if (r.thread_root_id == null || r.thread_root_id === '') { delete r.thread_root_id; continue; }
      let root = await rootOf(db, r.thread_root_id);
      if (root?.thread_root_id) root = await rootOf(db, root.thread_root_id); // spłaszczenie do korzenia
      if (!root) throw new ApiError(404, 'Nie znaleziono wątku', 'THREAD_NOT_FOUND');
      if (root.deleted_at) throw new ApiError(409, 'Ta wiadomość została usunięta', 'THREAD_ROOT_DELETED');
      if (r.conversation_id == null) r.conversation_id = root.conversation_id;
      if (String(r.conversation_id) !== String(root.conversation_id)) {
        throw new ApiError(403, 'Odpowiedź w wątku musi być w tej samej rozmowie', 'THREAD_OTHER_CONVERSATION');
      }
      r.thread_root_id = root.id;
      // „Ważne — potwierdź przeczytanie” (115) tylko na głównej osi rozmowy — tam jest pasek
      // „Rozumiem” i lista potwierdzeń; odpowiedź w wątku wychodzi jako zwykła.
      delete r.requires_ack;
    }
    return;
  }

  if (q.table === THREAD_FOLLOWERS) {
    const me = lower(req.user.email);
    for (const r of rows) {
      if (q.op === 'update') {
        if ('root_id' in r || 'conversation_id' in r) throw new ApiError(403, 'Nie można przenieść obserwowania');
        continue;
      }
      if (r.user_email && lower(r.user_email) !== me) throw new ApiError(403, 'Obserwujesz wątek pod własnym kontem');
      const root = r.root_id != null ? await rootOf(db, r.root_id) : null;
      if (!root) throw new ApiError(404, 'Nie znaleziono wątku', 'THREAD_NOT_FOUND');
      if (root.thread_root_id) throw new ApiError(400, 'Obserwować można tylko wiadomość główną wątku');
      // Rozmowa zawsze z wiadomości głównej — członkostwo sprawdza dalej komunikator.js.
      r.conversation_id = root.conversation_id;
      r.user_email = me;
    }
    // Ponowne „obserwuj” po „nie obserwuj” — zmiana istniejącego wpisu zamiast błędu duplikatu.
    if (q.op === 'insert') { q.op = 'upsert'; q.onConflict = 'root_id,user_email'; }
  }
}

// Id wiadomości głównych, których liczniki mogła zmienić ta zmiana (dodanie/usunięcie odpowiedzi).
export function threadRootsTouched(table, op, rows) {
  if (table !== 'messages' || op === 'select') return [];
  const out = new Set();
  for (const r of rows || []) if (r?.thread_root_id) out.add(String(r.thread_root_id));
  return [...out];
}

// Po zapisie: aktualne wiadomości główne (liczniki z triggera) do realtime. deps (testy): { emit, audienceOf }.
export async function emitThreadRoots({ db, tenantSlug, table, op, rows, emit, audienceOf }) {
  if (table !== 'messages' || op === 'select' || !tenantSlug) return [];
  const ids = threadRootsTouched(table, op, rows);
  // Zapis z wąskim RETURNING (np. usunięcie: „id, conversation_id, deleted_at”) — wątek z bazy.
  const unknown = op === 'update' ? (rows || []).filter((r) => r?.id && !('thread_root_id' in r)).map((r) => String(r.id)) : [];
  if (unknown.length) {
    const { rows: found } = await db.query(
      `SELECT DISTINCT thread_root_id FROM messages WHERE id::text = ANY($1::text[]) AND thread_root_id IS NOT NULL`, [unknown]);
    for (const f of found) if (!ids.includes(String(f.thread_root_id))) ids.push(String(f.thread_root_id));
  }
  if (!ids.length) return [];
  const { rows: roots } = await db.query(`SELECT * FROM messages WHERE id::text = ANY($1::text[])`, [ids]);
  if (!roots.length) return [];
  const audience = await audienceOf(db, 'messages', roots);
  emit(tenantSlug, 'messages', 'update', roots, { audience });
  return roots;
}

// Obserwujący wątek (e-maile małymi literami) — do pushy o odpowiedziach. Przed migracją 112 — pusto.
export async function threadFollowerEmails(pool, rootId) {
  try {
    const { rows } = await pool.query(
      `SELECT lower(user_email) AS e FROM message_thread_followers WHERE root_id::text = $1 AND following`,
      [String(rootId)]
    );
    return new Set(rows.map((r) => r.e));
  } catch {
    return new Set();
  }
}

// Kto dostaje push o odpowiedzi w wątku: obserwujący oraz wspomniani (osobiście albo @wszyscy).
export function threadPushAllowed(email, { followers, mentioned, mentionsAll }) {
  const e = lower(email);
  return mentionsAll || mentioned.has(e) || followers.has(e);
}
