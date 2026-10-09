// Projekty / zakładki „Zadania”: powiadomienia o elementach tablic.
//
// 1) PRZYPISANIE do elementu. Klient zapisuje komórki elementu (board_items.cells = { columnId: wartość }),
//    a kolumna typu 'people' trzyma listę osób [{ email, name, avatar_url }]. Po zapisie (Data API
//    albo fn board-item-patch) porównujemy osoby przed i po: każda NOWO dodana osoba (nie autor zmiany,
//    nie przypisana wcześniej w żadnej kolumnie „Osoby” tego elementu) dostaje wpis w `notifications`
//    (realtime) + push.
//      prepareBoardAssignNotify(db, q) — PRZED zapisem przez /api/db: stan komórek (tylko gdy zapis
//        dotyczy board_items.cells i w nowych komórkach w ogóle są osoby; odczyt w zakresie zapisu).
//      notifyBoardAssignees({...}) — PO zapisie, fire-and-forget: różnica, adresaci, wpisy, push.
// 2) Wspólne klocki dla innych powiadomień o zadaniach (wzmianki w komentarzach — fn board-comment,
//    automatyzacje — board-automations-run, przypisanie zadania osobistego — push-hooks):
//      boardViewers(...)      — kto z podanych osób może dostać powiadomienie o elemencie tej tablicy
//                               (aktywne konto, nie autor, widzi tablicę i ma prawo czytać jej elementy),
//      deliverNotifications() — wpisy w skrzynce + realtime + push, z pominięciem duplikatów (ta sama
//                               osoba, rodzaj i link w ostatnich minutach — np. zapis powtórzony przez
//                               klienta albo ten sam zapis przez /api/db i fn board-item-patch).
// Żaden błąd nie może wywrócić zapisu użytkownika — wszystko w try/catch, błędy tylko w logu.
// Linki do zadań: jedna reguła taskItemLink (packages/shared/src/lib/taskLinks.js).
//
// Teksty po polsku jak pozostałe powiadomienia serwera (push-hooks.js, board-automations-run.js).
import { buildQuery } from './querybuilder.js';
import { canAccess } from './registry.js';
import { emitChange } from '../realtime/hub.js';
import { sendPushCore } from '../fn/send-push.js';
import { taskItemLink, taskBoardModuleKey } from '@avenit/shared/src/lib/taskLinks.js';
import { boardModuleKey } from '@avenit/shared/src/permissions/moduleScope.js';

const MAX_ROWS = 200;        // górny limit elementów analizowanych w jednym zapisie
const MAX_RECIPIENTS = 50;   // górny limit powiadomień z jednego zapisu (ochrona przed zalewem)
export const DEDUPE_MINUTES = 10; // to samo powiadomienie (osoba + rodzaj + link) najwyżej raz w tym oknie

const lower = (v) => String(v ?? '').trim().toLowerCase();

// cells bywa obiektem albo (rzadko) zserializowanym JSON-em.
export function parseCells(v) {
  if (!v) return {};
  if (typeof v === 'string') {
    try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
  }
  return typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// Wartość komórki „Osoby” → zbiór e-maili (małymi literami). Kształt kanoniczny: [{ email, name }];
// tolerujemy też gołe e-maile (stare dane).
export function peopleEmails(value) {
  const out = new Set();
  if (!Array.isArray(value)) return out;
  for (const p of value) {
    const e = typeof p === 'string' ? p : p?.email;
    const l = lower(e);
    if (l && l.includes('@')) out.add(l);
  }
  return out;
}

// Szybki filtr bez zapytań: czy w komórkach jest choć jedna lista wyglądająca na osoby.
// Zmiana statusu/tekstu w elemencie bez przypisanych osób nie kosztuje żadnego zapytania.
export function hasPeopleLike(cells) {
  for (const v of Object.values(parseCells(cells))) {
    if (peopleEmails(v).size) return true;
  }
  return false;
}

// Szybki filtr bez zapytań: czy po zapisie w JAKIEJKOLWIEK komórce jest e-mail, którego wcześniej
// w żadnej komórce nie było (kolumny „Osoby” są podzbiorem komórek). Zmiana statusu elementu
// z przypisanymi osobami — false, więc bez zapytań o kolumny.
export function anyNewPeople(oldCells, newCells) {
  const had = new Set();
  for (const v of Object.values(parseCells(oldCells))) for (const e of peopleEmails(v)) had.add(e);
  for (const v of Object.values(parseCells(newCells))) for (const e of peopleEmails(v)) if (!had.has(e)) return true;
  return false;
}

// Nowo przypisani w jednym elemencie: (osoby po zapisie) − (osoby przed zapisem) − autor.
// Porównanie po sumie WSZYSTKICH kolumn „Osoby” — przeniesienie osoby między kolumnami
// to nie nowe przypisanie. Zwraca [{ email, columnId }] (kolumna pierwszego wystąpienia).
export function newAssignees({ oldCells, newCells, peopleColumnIds, actorEmail }) {
  const before = parseCells(oldCells);
  const after = parseCells(newCells);
  const had = new Set();
  for (const id of peopleColumnIds) for (const e of peopleEmails(before[id])) had.add(e);
  const actor = lower(actorEmail);
  const seen = new Set();
  const out = [];
  for (const id of peopleColumnIds) {
    for (const e of peopleEmails(after[id])) {
      if (had.has(e) || seen.has(e) || e === actor) continue;
      seen.add(e);
      out.push({ email: e, columnId: id });
    }
  }
  return out;
}

// Prywatna tablica: tylko właściciel (awaryjnie twórca) i edytorzy — jak boardsScope.visibleBoard.
export function boardVisibleTo(board, email) {
  if (!board) return false;
  if ((board.visibility || 'workspace') !== 'private') return true;
  const e = lower(email);
  if (!e) return false;
  if (lower(board.owner_email || board.created_by) === e) return true;
  return (Array.isArray(board.editors) ? board.editors : []).some((x) => lower(x) === e);
}

// Czy odbiorca może czytać elementy tej tablicy — wynik canAccess(board_items, select) dla niego:
// prawo globalne (Projekty) albo „w zakresie służby” obejmujące moduł tablicy (module_key, a tablica
// z importu — po source_kind, także Kalendarz: 'tasks'). Brak wyniku = nie.
export function accessCoversBoard(access, board) {
  if (!access?.ok) return false;
  if (!access.moduleScope) return true;
  const key = boardModuleKey(board);
  return !!key && (access.moduleScope.modules || []).map(String).includes(String(key));
}

// Ścieżki modułów z app_modules (dla linków do zakładki „Zadania”) — tylko potrzebne klucze.
export async function modulePathsFor(db, boards) {
  const keys = [...new Set((boards || []).map((b) => taskBoardModuleKey(b)).filter(Boolean))];
  if (!keys.length) return {};
  const { rows } = await db.query(`SELECT key, path FROM app_modules WHERE key = ANY($1::text[])`, [keys]).catch(() => ({ rows: [] }));
  return Object.fromEntries(rows.map((m) => [m.key, m.path]));
}

// Nazwa wyświetlana autora (pełne imię albo e-mail).
export async function displayNameOf(db, email) {
  if (!email) return 'Ktoś';
  const { rows } = await db.query(
    `SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS display
       FROM app_users WHERE lower(email) = lower($1) LIMIT 1`, [email],
  ).catch(() => ({ rows: [] }));
  return rows[0]?.display || email;
}

// Kto z par { email, board } może dostać powiadomienie o elemencie tablicy: istniejące, aktywne konto,
// nie autor (bez względu na wielkość liter), widzi tablicę (prywatna — właściciel/edytorzy) i ma prawo
// czytać jej elementy (Projekty: globalne; tablica służby: także „w zakresie służby”) — ta sama decyzja
// co /api/db (registry.canAccess). Błąd sprawdzenia = bez powiadomienia.
// → [{ ...para, account: { id, email, role } }] (email konta w kanonicznej pisowni).
export async function boardViewers({ db, tenant, pairs, actorEmail = '', deps = {} }) {
  const access = deps.canAccess || canAccess;
  const actor = lower(actorEmail);
  const wanted = (pairs || []).map((p) => ({ ...p, email: lower(p.email) })).filter((p) => p.email && p.email !== actor && p.board);
  if (!wanted.length) return [];
  const emails = [...new Set(wanted.map((p) => p.email))];
  const { rows: users } = await db.query(
    `SELECT id, email, role, is_super_admin FROM app_users
      WHERE lower(email) = ANY($1::text[]) AND COALESCE(is_active, true)`, [emails],
  );
  const accounts = new Map(users.map((u) => [lower(u.email), u]));
  const accessOf = new Map();
  await Promise.all([...accounts.entries()].map(async ([e, u]) => {
    try {
      accessOf.set(e, await access({ pool: db, dbName: tenant?.db_name, table: 'board_items', op: 'select', user: u, allowModuleScope: true }));
    } catch { accessOf.set(e, null); }
  }));
  return wanted
    .filter((p) => accounts.has(p.email) && boardVisibleTo(p.board, p.email) && accessCoversBoard(accessOf.get(p.email), p.board))
    .map((p) => ({ ...p, account: accounts.get(p.email) }));
}

const asRows = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((r) => r && typeof r === 'object');

// ── Przypisanie, krok 1: przed zapisem przez /api/db ───────────────────────
// Zwraca null (nic do zrobienia) albo { op, values, before: Map(id → {id, board_id, name, cells}) }.
export async function prepareBoardAssignNotify(db, q) {
  try {
    if (q?.table !== 'board_items' || !q.values) return null;
    if (!['insert', 'update', 'upsert'].includes(q.op)) return null;
    const rows = asRows(q.values);
    if (!rows.length || rows.length > MAX_ROWS) return null;
    if (!rows.some((r) => 'cells' in r && hasPeopleLike(r.cells))) return null;

    const prep = { op: q.op, values: rows, before: new Map() };
    if (q.op === 'insert') return prep; // nowy element — wcześniej nikt nie był przypisany

    // Stan sprzed zapisu w tym samym zakresie co zapis (filtry + zakres tablic/kampusu).
    const filters = q.op === 'update'
      ? q.filters
      : [{ type: 'in', column: 'id', value: rows.map((r) => r.id).filter((v) => v != null) }];
    if (!filters?.length) return null;
    const built = buildQuery({
      table: 'board_items', op: 'select', select: 'id,board_id,name,cells',
      filters, limit: MAX_ROWS,
      __ownerScope: q.__ownerScope, __campusScope: q.__campusScope,
    });
    const { rows: found } = await db.query(built.sql, built.params);
    for (const r of found) prep.before.set(String(r.id), r);
    return prep;
  } catch {
    return null; // brak powiadomienia, ale zapis idzie dalej
  }
}

// Elementy po zapisie: zwrócone wiersze (RETURNING) mają pierwszeństwo; bez nich (update bez
// .select()) — stan sprzed zapisu + zapisane wartości. Insert bez RETURNING (kopiowanie tablicy,
// szablony) pomijamy — to nie jest przypisanie przez człowieka, a bez id nie ma linku.
export function changedItems(prep, data, rowCount) {
  const returned = asRows(data).filter((r) => r.id != null && r.board_id != null);
  const out = [];
  if (prep.op === 'insert') {
    for (const r of returned) out.push({ id: r.id, board_id: r.board_id, name: r.name, oldCells: {}, newCells: r.cells });
    return out;
  }
  if (returned.length) {
    for (const r of returned) {
      const prev = prep.before.get(String(r.id));
      if (!prev) continue;
      out.push({ id: r.id, board_id: r.board_id, name: r.name ?? prev.name, oldCells: prev.cells, newCells: r.cells });
    }
    return out;
  }
  if (!rowCount) return out; // nic nie zapisano (np. brak dostępu do wiersza)
  if (prep.op === 'update') {
    const v = prep.values[0] || {};
    if (!('cells' in v)) return out;
    for (const prev of prep.before.values()) {
      out.push({ id: prev.id, board_id: prev.board_id, name: v.name ?? prev.name, oldCells: prev.cells, newCells: v.cells });
    }
  } else {
    for (const v of prep.values) {
      const prev = v.id != null ? prep.before.get(String(v.id)) : null;
      if (!prev || !('cells' in v)) continue;
      out.push({ id: prev.id, board_id: prev.board_id, name: v.name ?? prev.name, oldCells: prev.cells, newCells: v.cells });
    }
  }
  return out;
}

// ── Doręczenie ─────────────────────────────────────────────────────────────
async function insertInbox(db, rows) {
  if (!rows.length) return [];
  const build = (withData) => {
    const params = [];
    const values = rows.map((r) => {
      const base = [r.user_email, r.type || 'task', r.title, r.body, r.link];
      if (withData) base.push(JSON.stringify(r.data || {}));
      const ph = base.map((v) => { params.push(v); return `$${params.length}`; });
      if (withData) ph[ph.length - 1] += '::jsonb';
      return `(${ph.join(', ')})`;
    });
    const cols = withData ? 'user_email, type, title, body, link, data' : 'user_email, type, title, body, link';
    return { sql: `INSERT INTO notifications (${cols}) VALUES ${values.join(', ')} RETURNING *`, params };
  };
  try {
    const { sql, params } = build(true);
    return (await db.query(sql, params)).rows;
  } catch {
    // Starszy schemat bez kolumny data — wpis bez dodatkowych danych.
    const { sql, params } = build(false);
    return (await db.query(sql, params)).rows;
  }
}

const dedupeKey = (e) => `${lower(e.user_email)}\u0000${e.type || 'task'}\u0000${e.link || ''}`;

// Wpisy, które ta sama osoba dostała niedawno (ten sam rodzaj i link) — do pominięcia.
async function recentlyNotified(db, entries, minutes) {
  if (!minutes || !entries.length) return new Set();
  try {
    const { rows } = await db.query(
      `SELECT lower(user_email) AS user_email, type, link FROM notifications
        WHERE lower(user_email) = ANY($1::text[]) AND link = ANY($2::text[])
          AND created_at > now() - ($3::int * interval '1 minute')`,
      [[...new Set(entries.map((e) => lower(e.user_email)))], [...new Set(entries.map((e) => e.link || ''))], minutes],
    );
    return new Set(rows.map(dedupeKey));
  } catch {
    return new Set(); // brak tabeli/kolumny — bez pomijania
  }
}

// entries: [{ user_email, type ('task'|'mention'…), title, body, link, data, push? }]
//   push — dodatkowe pola pusha (data.type itp.); domyślnie { type: entry.type, ...entry.data }.
// Wpisy w skrzynce (dzwonek) + realtime do właścicieli wpisów; potem push do każdego.
// Błąd skrzynki nie blokuje pushy. → { sent, entries } (entries = faktycznie doręczone).
export async function deliverNotifications({ db, tenant, entries, deps = {}, log, dedupeMinutes = DEDUPE_MINUTES }) {
  const sendPush = deps.sendPush || sendPushCore;
  const emit = deps.emit || emitChange;
  const logErr = (err, msg) => { try { (log?.error ?? console.error).call(log ?? console, { err }, msg); } catch { /* log */ } };
  const seen = new Set();
  let list = (entries || []).filter((e) => {
    if (!e?.user_email || !e.title) return false;
    const k = dedupeKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const recent = await recentlyNotified(db, list, dedupeMinutes);
  list = list.filter((e) => !recent.has(dedupeKey(e)));
  if (!list.length) return { sent: 0, entries: [] };

  try {
    const inserted = await insertInbox(db, list);
    if (inserted.length && tenant?.slug) emit(tenant.slug, 'notifications', 'insert', inserted);
  } catch (err) {
    logErr(err, '[board-notify] wpis powiadomienia nie powiódł się');
  }

  let sent = 0;
  for (const e of list) {
    try {
      await sendPush(db, {
        user_email: e.user_email, title: e.title, body: e.body || e.title, link: e.link,
        data: e.push || { type: e.type || 'task', ...(e.data || {}) },
      });
      sent++;
    } catch (err) {
      logErr(err, '[board-notify] push nie powiódł się');
    }
  }
  return { sent, entries: list };
}

// ── Przypisanie, krok 2: po zapisie ────────────────────────────────────────
// deps (testy): { sendPush, emit, canAccess }.
export async function notifyBoardAssignees({ db, tenant, prep, data, rowCount, actor, log, deps = {} }) {
  const logErr = (err, msg) => { try { (log?.error ?? console.error).call(log ?? console, { err }, msg); } catch { /* log */ } };
  try {
    if (!prep) return { sent: 0 };
    const items = changedItems(prep, data, rowCount).filter((it) => anyNewPeople(it.oldCells, it.newCells));
    if (!items.length) return { sent: 0 };

    const boardIds = [...new Set(items.map((it) => String(it.board_id)))];
    const [{ rows: cols }, { rows: boards }] = await Promise.all([
      db.query(`SELECT id, board_id FROM board_columns WHERE type = 'people' AND board_id = ANY($1::uuid[])`, [boardIds]),
      db.query(`SELECT id, name, module_key, source_kind, visibility, owner_email, created_by, editors
                  FROM boards WHERE id = ANY($1::uuid[])`, [boardIds]),
    ]);
    const peopleCols = new Map();
    for (const c of cols) {
      const k = String(c.board_id);
      if (!peopleCols.has(k)) peopleCols.set(k, []);
      peopleCols.get(k).push(String(c.id));
    }
    const boardById = new Map(boards.map((b) => [String(b.id), b]));

    // Różnica per element.
    const pending = []; // { item, board, email, columnId }
    for (const it of items) {
      const board = boardById.get(String(it.board_id));
      const colIds = peopleCols.get(String(it.board_id)) || [];
      if (!board || !colIds.length) continue;
      for (const a of newAssignees({ oldCells: it.oldCells, newCells: it.newCells, peopleColumnIds: colIds, actorEmail: actor?.email })) {
        pending.push({ item: it, board, ...a });
      }
    }
    if (!pending.length) return { sent: 0 };

    const targets = (await boardViewers({ db, tenant, pairs: pending, actorEmail: actor?.email, deps })).slice(0, MAX_RECIPIENTS);
    if (!targets.length) return { sent: 0 };

    // Kto przypisał + ścieżki modułów (dla linków do zakładki „Zadania”).
    // Bez e-maila autora (worker: automatyzacje) — podana nazwa, np. „Automatyzacja”.
    const [actorName, paths] = await Promise.all([
      actor?.email ? displayNameOf(db, actor.email) : Promise.resolve(actor?.name || 'Ktoś'),
      modulePathsFor(db, targets.map((t) => t.board)),
    ]);

    const entries = targets.map((t) => {
      const itemName = String(t.item.name || '').trim() || 'Zadanie';
      const boardName = String(t.board.name || '').trim();
      const data = { item_id: t.item.id, board_id: t.item.board_id, column_id: t.columnId };
      return {
        user_email: t.account.email,
        type: 'task',
        title: `${actorName} przypisał(a) Cię do zadania`,
        body: boardName ? `${itemName} · ${boardName}` : itemName,
        link: taskItemLink(t.board, t.item.id, paths),
        data,
        push: { type: 'task', ...data },
      };
    });
    return await deliverNotifications({ db, tenant, entries, deps, log });
  } catch (err) {
    logErr(err, '[board-notify] błąd');
    return { sent: 0 };
  }
}
