// Komunikator — prywatność rozmów po stronie serwera.
//
// Do audytu 2026-10 tabele Komunikatora miały tylko kontrolę MODUŁU (module:komunikator):
// każdy członek z dostępem do Komunikatora mógł przez /api/db czytać dowolną rozmowę (także
// prywatne 1:1), dostawał przez realtime każdą wiadomość w kościele i mógł wysłać wiadomość
// z cudzym nadawcą albo pisać w kanale ogłoszeń mimo „tylko administratorzy”.
// Tu: wiersze widzi i zmienia tylko UCZESTNIK rozmowy (conversation_participants), nadawca to
// zawsze zalogowany, a kanał ogłoszeń przyjmuje wiadomości tylko od administratorów rozmowy.
// Dotyczy każdego, także admina aplikacji — to prywatna korespondencja (jak tabele osobiste).
import { ApiError, buildWhere } from './querybuilder.js';

// Rodzaj powiązania wiersza z rozmową.
const CONV_TABLES = {
  conversations: 'self',
  conversation_participants: 'conv',
  messages: 'conv',
  pinned_messages: 'conv',
  typing_status: 'conv',
  message_reactions: 'msg',
  message_read_receipts: 'msg',
  poll_votes: 'msg',
  prayer_responses: 'msg',
};
export const isConversationTable = (table) => table in CONV_TABLES;

// Kanały służb (jak useMinistryChannels w webie): przynależność = wpis w tabeli zespołu.
const MINISTRY_TABLES = {
  worship_team: 'worship_team',
  media_team: 'media_team',
  atmosfera_team: 'atmosfera_members',
  kids_ministry: 'kids_teachers',
  home_groups: 'home_group_leaders',
};

const lower = (v) => String(v ?? '').toLowerCase();
const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);

function convExpr(table, alias) {
  const kind = CONV_TABLES[table];
  if (kind === 'self') return `${alias}."id"`;
  if (kind === 'conv') return `${alias}."conversation_id"`;
  return `(SELECT m_."conversation_id" FROM messages m_ WHERE m_."id" = ${alias}."message_id")`;
}
const memberOf = (conv, p) =>
  `EXISTS (SELECT 1 FROM conversation_participants cp_ WHERE cp_."conversation_id" = ${conv} AND lower(cp_."user_email") = $${p})`;
const adminOf = (conv, p) =>
  `EXISTS (SELECT 1 FROM conversation_participants cp_ WHERE cp_."conversation_id" = ${conv} AND lower(cp_."user_email") = $${p} AND cp_."role" = 'admin')`;

// Zakres wierszy (select / update / delete / upsertGuard) — dokładany do SQL w querybuilder.
export function conversationScope(table, user) {
  const email = lower(user.email);
  const member = (alias, push) => memberOf(convExpr(table, alias), push(email));

  if (table === 'conversations') {
    // Kanały służb są widoczne (nazwa/id) także przed dołączeniem — synchronizacja składu
    // z modułu ich szuka; treść rozmowy (messages) i tak tylko dla uczestników.
    return {
      select: (a, push) => `(${member(a, push)} OR ${a}."type" = 'ministry')`,
      update: member,
      delete: (a, push) => adminOf(`${a}."id"`, push(email)),
      upsertGuard: member,
    };
  }
  if (table === 'conversation_participants') {
    // Mój wiersz (przeczytane, wyciszenie, archiwum) albo administrator rozmowy.
    const ownOrAdmin = (a, push) => {
      const p = push(email);
      return `(lower(${a}."user_email") = $${p} OR ${adminOf(`${a}."conversation_id"`, p)})`;
    };
    return { select: member, update: ownOrAdmin, delete: ownOrAdmin, upsertGuard: ownOrAdmin };
  }
  if (table === 'messages') {
    // Edycja/usunięcie: autor albo administrator rozmowy (moderacja).
    const authorOrAdmin = (a, push) => {
      const p = push(email);
      return `(lower(${a}."sender_email") = $${p} OR ${adminOf(`${a}."conversation_id"`, p)})`;
    };
    return { select: member, update: authorOrAdmin, delete: authorOrAdmin, upsertGuard: authorOrAdmin };
  }
  if (table === 'pinned_messages') {
    return { select: member, update: member, delete: member, upsertGuard: member };
  }
  // typing_status, reakcje, potwierdzenia, głosy, „modlę się” — widzą uczestnicy, zmienia właściciel.
  const own = (a, push) => `lower(${a}."user_email") = $${push(email)}`;
  return { select: member, update: own, delete: own, upsertGuard: own };
}

// Uczestnik rozmowy → { role } albo null. Starsze rozmowy (sprzed ról) mają role = NULL —
// to nadal uczestnik („member”); bez tego wysyłka w starych rozmowach była odrzucana.
async function isMember(db, convId, email) {
  const { rows } = await db.query(
    `SELECT role FROM conversation_participants WHERE conversation_id::text = $1 AND lower(user_email) = $2 LIMIT 1`,
    [String(convId), email]
  );
  return rows[0] ? { role: rows[0].role || 'member' } : null;
}

async function conversationOf(db, convId) {
  const { rows } = await db.query(
    `SELECT id, type, ministry_key, posting_policy, created_by,
            (SELECT count(*)::int FROM conversation_participants p WHERE p.conversation_id = c.id) AS n
       FROM conversations c WHERE id::text = $1`,
    [String(convId)]
  );
  return rows[0] || null;
}

// Strażnik duplikatów rozmów 1:1: druga rozmowa „direct” tej samej pary osób nie powstaje.
// Dawniej każde kliknięcie „Nowa rozmowa” zakładało kolejną (pustą) rozmowę z tą samą osobą —
// wiadomości rozjeżdżały się między duplikaty. Klienci najpierw szukają istniejącej rozmowy;
// to zabezpieczenie na wyścigi i starsze wersje aplikacji. Świeżo założona pusta rozmowa
// (bez uczestników, niewidoczna dla nikogo) jest sprzątana, a klient dostaje 409 DIRECT_EXISTS.
async function assertNoOtherDirect(db, convId, emails) {
  const pair = [...new Set(emails.map(lower).filter(Boolean))];
  if (pair.length !== 2) return;
  const { rows } = await db.query(
    `SELECT d.id FROM conversations d
      WHERE d.type = 'direct' AND d.id::text <> $1
        AND (SELECT count(DISTINCT lower(p.user_email)) FROM conversation_participants p
              WHERE p.conversation_id = d.id AND lower(p.user_email) = ANY($2::text[])) = 2
      LIMIT 1`,
    [String(convId), pair]
  );
  if (!rows[0]) return;
  await db.query(
    `DELETE FROM conversations e
      WHERE e.id::text = $1 AND e.type = 'direct'
        AND NOT EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = e.id)
        AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = e.id)`,
    [String(convId)]
  ).catch(() => undefined);
  throw new ApiError(409, 'Rozmowa z tą osobą już istnieje', 'DIRECT_EXISTS');
}

async function inMinistry(db, ministryKey, emails) {
  const table = MINISTRY_TABLES[ministryKey];
  if (!table || !emails.length) return false;
  const { rows } = await db.query(
    `SELECT count(DISTINCT lower(email))::int AS n FROM ${table} WHERE lower(email) = ANY($1::text[])`,
    [emails]
  );
  return rows[0].n === new Set(emails).size;
}

// Walidacja zapisu (insert/upsert/update) — mutuje q.values (nadawca/właściciel = ja).
export async function enforceConversationWrite(q, req) {
  if (!isConversationTable(q.table) || !['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  const db = req.db;
  const me = lower(req.user.email);
  const rows = rowsOf(q);

  if (q.table === 'conversations') {
    if (q.op === 'update') {
      // Zwykły uczestnik aktualizuje tylko podgląd ostatniej wiadomości; reszta — administrator.
      const cols = Object.keys(rows[0] || {});
      const meta = ['last_message_preview', 'last_message_at', 'updated_at'];
      if (!cols.every((c) => meta.includes(c))) {
        const f = (q.filters || []).find((x) => x.type === 'eq' && x.column === 'id');
        const role = f ? (await isMember(db, f.value, me))?.role : null;
        if (role !== 'admin') throw new ApiError(403, 'Ustawienia rozmowy zmienia jej administrator');
      }
      return;
    }
    for (const r of rows) r.created_by = req.user.email; // twórca = ja
    return;
  }

  if (q.table === 'conversation_participants') {
    if (q.op === 'update') {
      for (const r of rows) {
        if ('conversation_id' in r || 'user_email' in r) throw new ApiError(403, 'Nie można przenieść uczestnika');
      }
      // Zmiana roli (np. nadanie administratora) — tylko administrator rozmowy; własny wiersz
      // („przeczytane”, wyciszenie, archiwum) może zmieniać każdy uczestnik.
      if (rows.some((r) => 'role' in r)) {
        const adminOnly = (a, push) => adminOf(`${a}."conversation_id"`, push(me));
        q.__ownerScope = { ...(q.__ownerScope || {}), update: adminOnly, upsertGuard: adminOnly };
      }
      return; // zakres (mój wiersz / administrator) pilnuje SQL
    }
    const byConv = new Map();
    for (const r of rows) {
      const k = String(r.conversation_id ?? '');
      if (!byConv.has(k)) byConv.set(k, []);
      byConv.get(k).push(lower(r.user_email));
    }
    for (const [convId, emails] of byConv) {
      const conv = await conversationOf(db, convId);
      if (!conv) throw new ApiError(404, 'Nie znaleziono rozmowy');
      const role = (await isMember(db, convId, me))?.role;
      if (role === 'admin') continue;
      // Nowa rozmowa (0 uczestników) — pierwszy skład dodaje wyłącznie jej twórca.
      // Rozmowa 1:1: tylko jeśli z tą osobą nie ma już innej rozmowy (bez duplikatów).
      if (conv.n === 0 && lower(conv.created_by) === me) {
        if (conv.type === 'direct') await assertNoOtherDirect(db, convId, [...emails, me]);
        continue;
      }
      if (conv.type === 'ministry' && (await inMinistry(db, conv.ministry_key, [...emails, me]))) {
        // Synchronizacja kanału służby: dopisujemy wyłącznie członków tego zespołu, bez ról admina.
        for (const r of rows) if (String(r.conversation_id) === convId) r.role = 'member';
        continue;
      }
      throw new ApiError(403, 'Uczestników dodaje administrator rozmowy');
    }
    // Duplikaty (ktoś już jest w kanale) pomijamy zamiast wywracać cały zapis.
    if (q.op === 'insert') { q.op = 'upsert'; q.onConflict = 'conversation_id,user_email'; q.ignoreDuplicates = true; }
    return;
  }

  if (q.table === 'messages') {
    if (q.op === 'update') {
      for (const r of rows) {
        if ('sender_email' in r && lower(r.sender_email) !== me) throw new ApiError(403, 'Nie można zmienić nadawcy');
        if ('conversation_id' in r) throw new ApiError(403, 'Nie można przenieść wiadomości');
      }
      return;
    }
    for (const r of rows) {
      const conv = await conversationOf(db, r.conversation_id);
      const role = conv ? (await isMember(db, r.conversation_id, me))?.role : null;
      if (!conv || !role) throw new ApiError(403, 'Wiadomość można wysłać tylko w swojej rozmowie');
      if (conv.posting_policy === 'admins' && role !== 'admin') {
        throw new ApiError(403, 'W tym kanale piszą tylko administratorzy');
      }
      if (r.sender_email && lower(r.sender_email) !== me) throw new ApiError(403, 'Wiadomość wysyłasz pod własnym kontem');
      r.sender_email = req.user.email;
    }
    return;
  }

  // Pozostałe: wiersz w mojej rozmowie, właściciel = ja.
  for (const r of rows) {
    if (q.op === 'update') {
      if ('user_email' in r && lower(r.user_email) !== me) throw new ApiError(403, 'Nie można przepisać wpisu na inną osobę');
      continue;
    }
    let convId = r.conversation_id;
    if (CONV_TABLES[q.table] === 'msg') {
      const { rows: m } = await db.query(`SELECT conversation_id FROM messages WHERE id::text = $1`, [String(r.message_id)]);
      convId = m[0]?.conversation_id;
    }
    if (!convId || !(await isMember(db, convId, me))) throw new ApiError(403, 'Brak dostępu do tej rozmowy');
    if (q.table === 'pinned_messages') { r.pinned_by = r.pinned_by ?? req.user.email; continue; }
    if (r.user_email && lower(r.user_email) !== me) throw new ApiError(403, 'Wpis dodajesz pod własnym kontem');
    r.user_email = req.user.email;
  }
}

// Realtime: komu wysłać zmianę (e-maile uczestników rozmowy). null = brak ograniczenia.
export async function conversationAudience(db, table, rows) {
  if (!isConversationTable(table)) return null;
  const convIds = new Set();
  for (const r of rows || []) {
    if (!r) continue;
    const kind = CONV_TABLES[table];
    if (kind === 'self' && r.id) convIds.add(String(r.id));
    else if (kind === 'conv' && r.conversation_id) convIds.add(String(r.conversation_id));
    else if (kind === 'msg' && r.message_id) {
      const { rows: m } = await db.query(`SELECT conversation_id FROM messages WHERE id::text = $1`, [String(r.message_id)]);
      if (m[0]) convIds.add(String(m[0].conversation_id));
    }
  }
  if (!convIds.size) return new Set();
  const { rows: ps } = await db.query(
    `SELECT DISTINCT lower(user_email) AS e FROM conversation_participants WHERE conversation_id::text = ANY($1::text[])`,
    [[...convIds]]
  );
  return new Set(ps.map((p) => p.e));
}

// Odbiorcy usunięcia rozmowy liczeni PRZED zapisem — kaskada kasuje skład, zanim realtime
// zdąży go odczytać (druga osoba nie dowiadywała się o usunięciu).
export async function conversationDeleteAudience(db, q) {
  if (q.table !== 'conversations' || q.op !== 'delete') return null;
  const f = (q.filters || []).find((x) => x.column === 'id' && (x.type === 'eq' || x.type === 'in'));
  if (!f) return null;
  const ids = (Array.isArray(f.value) ? f.value : [f.value]).map(String);
  const { rows } = await db.query(
    `SELECT DISTINCT lower(user_email) AS e FROM conversation_participants WHERE conversation_id::text = ANY($1::text[])`, [ids]
  );
  return new Set(rows.map((r) => r.e));
}

// Masowe update/delete bez filtrów w Komunikatorze — odrzucamy (zakres i tak by zawęził, ale
// klient nigdy tego nie robi, więc to raczej błąd albo nadużycie).
export function assertConversationFilters(q) {
  if (isConversationTable(q.table) && (q.op === 'update' || q.op === 'delete') && !q.filters?.length) {
    throw new ApiError(400, 'Zmiana wymaga wskazania konkretnych wierszy');
  }
}
export { buildWhere };
