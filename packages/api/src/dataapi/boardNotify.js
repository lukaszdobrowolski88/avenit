// Projekty / zakładki „Zadania”: powiadomienie o PRZYPISANIU do elementu tablicy.
//
// Klient zapisuje komórki elementu w całości (board_items.cells = { columnId: wartość }), a kolumna
// typu 'people' trzyma listę osób [{ email, name, avatar_url }]. Po zapisie przez Data API
// porównujemy osoby przed i po: każda NOWO dodana osoba (nie autor zmiany, nie przypisana wcześniej
// w żadnej kolumnie „Osoby” tego elementu) dostaje wpis w `notifications` (realtime) + push.
//
// Dwa kroki, wołane z routes.js:
//   1. prepareBoardAssignNotify(db, q) — PRZED zapisem: stan komórek (tylko gdy zapis dotyczy
//      board_items.cells i w nowych komórkach w ogóle są osoby; odczyt po kluczu, w tym samym
//      zakresie co zapis — filtry + zakres prywatnych tablic).
//   2. notifyBoardAssignees({...}) — PO zapisie, fire-and-forget: różnica, adresaci, wpisy, push.
// Żaden błąd nie może wywrócić zapisu użytkownika — wszystko w try/catch, błędy tylko w logu.
//
// Teksty po polsku jak pozostałe powiadomienia serwera (push-hooks.js, board-automations-run.js).
import { buildQuery } from './querybuilder.js';
import { canAccess } from './registry.js';
import { emitChange } from '../realtime/hub.js';
import { sendPushCore } from '../fn/send-push.js';

const MAX_ROWS = 200;        // górny limit elementów analizowanych w jednym zapisie
const MAX_RECIPIENTS = 50;   // górny limit powiadomień z jednego zapisu (ochrona przed zalewem)

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

// Tablica zakładki „Zadania” modułu (ModuleBoard) ma source_kind '<coś>_tasks':
//   media_tasks → media, home_group_tasks → homegroups, mlodziezowka_tasks → mlodziezowka,
//   custom_<key>_tasks → <key>. Zwraca klucz modułu albo null (zwykła tablica Projektów).
const TASK_SOURCE_MODULES = { media_tasks: 'media', home_group_tasks: 'homegroups', mlodziezowka_tasks: 'mlodziezowka' };
export function taskBoardModuleKey(board) {
  const sk = String(board?.source_kind || '');
  if (!sk.endsWith('_tasks')) return null;
  if (board.module_key) return String(board.module_key);
  if (TASK_SOURCE_MODULES[sk]) return TASK_SOURCE_MODULES[sk];
  const m = sk.match(/^custom_(.+)_tasks$/);
  return m ? m[1] : null;
}

// Moduł, do którego należy tablica (null = Projekty): module_key, a tablica z importu — po source_kind.
export const boardModuleKeyOf = (board) => (board?.module_key ? String(board.module_key) : taskBoardModuleKey(board));

// Czy odbiorca może czytać elementy tej tablicy — wynik canAccess(board_items, select) dla niego:
// prawo globalne (Projekty) albo „w zakresie służby” obejmujące moduł tablicy. Brak wyniku = nie.
export function accessCoversBoard(access, board) {
  if (!access?.ok) return false;
  if (!access.moduleScope) return true;
  const key = boardModuleKeyOf(board);
  return !!key && (access.moduleScope.modules || []).map(String).includes(key);
}

// Zapas, gdy app_modules nie ma ścieżki (zgodne z menu bocznym).
const FALLBACK_MODULE_PATHS = {
  media: '/media', homegroups: '/home-groups', mlodziezowka: '/mlodziezowka',
  atmosfera: '/atmosfera', worship: '/worship', kids: '/kids',
};
export function modulePath(key, paths = {}) {
  const p = paths[key];
  if (typeof p === 'string' && p.startsWith('/')) return p;
  return FALLBACK_MODULE_PATHS[key] || `/module/${encodeURIComponent(key)}`;
}

// Link do elementu: zakładka „Zadania” modułu otwiera element po ?item= (ModuleBoard), każda inna
// tablica (Projekty, tablice osadzone jako zakładka „Tablica”) — /projekty?board=…&item=….
export function itemLink(board, itemId, paths = {}) {
  const key = taskBoardModuleKey(board);
  if (key) return `${modulePath(key, paths)}?item=${encodeURIComponent(String(itemId))}`;
  return `/projekty?board=${encodeURIComponent(String(board.id))}&item=${encodeURIComponent(String(itemId))}`;
}

const asRows = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((r) => r && typeof r === 'object');

// ── Krok 1: przed zapisem ──────────────────────────────────────────────────
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

async function insertInbox(db, rows) {
  if (!rows.length) return [];
  const build = (withData) => {
    const params = [];
    const values = rows.map((r) => {
      const base = [r.user_email, 'task', r.title, r.body, r.link];
      if (withData) base.push(JSON.stringify(r.data));
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

// ── Krok 2: po zapisie ─────────────────────────────────────────────────────
// deps (testy): { sendPush, emit, canAccess }.
export async function notifyBoardAssignees({ db, tenant, prep, data, rowCount, actor, log, deps = {} }) {
  const sendPush = deps.sendPush || sendPushCore;
  const emit = deps.emit || emitChange;
  const access = deps.canAccess || canAccess;
  const logErr = (err, msg) => { try { (log?.error ?? console.error).call(log ?? console, { err }, msg); } catch { /* log */ } };
  try {
    if (!prep) return { sent: 0 };
    const items = changedItems(prep, data, rowCount).filter((it) => anyNewPeople(it.oldCells, it.newCells));
    if (!items.length) return { sent: 0 };

    const boardIds = [...new Set(items.map((it) => String(it.board_id)))];
    const [{ rows: cols }, { rows: boards }] = await Promise.all([
      db.query(`SELECT id, board_id FROM board_columns WHERE type = 'people' AND board_id::text = ANY($1::text[])`, [boardIds]),
      db.query(`SELECT id, name, module_key, source_kind, visibility, owner_email, created_by, editors
                  FROM boards WHERE id::text = ANY($1::text[])`, [boardIds]),
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

    // Tylko istniejące, aktywne konta, które WIDZĄ tablicę: prywatna — właściciel/edytorzy;
    // do tego prawo odczytu elementów (Projekty: globalne; tablica służby: także „w zakresie
    // służby”) — ta sama decyzja co /api/db (registry.canAccess). Błąd sprawdzenia = bez powiadomienia.
    const emails = [...new Set(pending.map((p) => p.email))];
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
    const targets = pending
      .filter((p) => accounts.has(p.email) && boardVisibleTo(p.board, p.email) && accessCoversBoard(accessOf.get(p.email), p.board))
      .slice(0, MAX_RECIPIENTS);
    if (!targets.length) return { sent: 0 };

    // Kto przypisał + ścieżki modułów (dla linków do zakładki „Zadania”).
    const moduleKeys = [...new Set(targets.map((t) => taskBoardModuleKey(t.board)).filter(Boolean))];
    const [actorRes, modulesRes] = await Promise.all([
      db.query(
        `SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS display
           FROM app_users WHERE lower(email) = lower($1) LIMIT 1`, [actor?.email || ''],
      ).catch(() => ({ rows: [] })),
      moduleKeys.length
        ? db.query(`SELECT key, path FROM app_modules WHERE key = ANY($1::text[])`, [moduleKeys]).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
    ]);
    const actorName = actorRes.rows[0]?.display || actor?.email || 'Ktoś';
    const paths = Object.fromEntries(modulesRes.rows.map((m) => [m.key, m.path]));

    const entries = targets.map((t) => {
      const itemName = String(t.item.name || '').trim() || 'Zadanie';
      const boardName = String(t.board.name || '').trim();
      return {
        user_email: accounts.get(t.email).email,
        title: `${actorName} przypisał(a) Cię do zadania`,
        body: boardName ? `${itemName} · ${boardName}` : itemName,
        link: itemLink(t.board, t.item.id, paths),
        data: { item_id: t.item.id, board_id: t.item.board_id, column_id: t.columnId },
      };
    });

    // Wpisy w skrzynce (dzwonek) + realtime do właścicieli wpisów. Błąd skrzynki nie blokuje pushy.
    try {
      const inserted = await insertInbox(db, entries);
      if (inserted.length && tenant?.slug) emit(tenant.slug, 'notifications', 'insert', inserted);
    } catch (err) {
      logErr(err, '[board-notify] wpis powiadomienia nie powiódł się');
    }

    let sent = 0;
    for (const e of entries) {
      try {
        await sendPush(db, {
          user_email: e.user_email, title: e.title, body: e.body, link: e.link,
          data: { type: 'task', ...e.data },
        });
        sent++;
      } catch (err) {
        logErr(err, '[board-notify] push nie powiódł się');
      }
    }
    return { sent, entries };
  } catch (err) {
    logErr(err, '[board-notify] błąd');
    return { sent: 0 };
  }
}
