// Import starych zadań (media_tasks, mlodziezowka_tasks, home_group_tasks, custom_<key>_tasks,
// tasks z Kalendarza) na Tablicę — PO STRONIE SERWERA, w jednej transakcji.
//
// Do 2026-10 robiła to przeglądarka (Boards/lib/legacyImport.js) przy pierwszym wejściu na
// zakładkę „Zadania”: z uprawnieniami odwiedzającego, bez osób przypisanych (UUID członka zespołu
// był pomijany) i bez komentarzy (*_task_comments). Tablice na produkcji powstały już z tymi
// stratami — tryb `backfill` uzupełnia je z nietkniętych tabel źródłowych.
//
// Body: { source: 'media_tasks', mode?: 'import' | 'backfill', title?: 'Zadania Media Team' }
//   import   — tworzy tablicę, gdy jej nie ma (idempotentnie po boards.source_kind, blokada
//              doradcza na czas transakcji → dwie karty naraz nie zrobią dwóch tablic).
//              → { board_id, created, imported, people, comments, unresolved_people, backfill_needed }
//   backfill — dla istniejącej tablicy: elementom dopasowanym do starych wierszy (source_id,
//              inaczej nazwa + kolejność/termin/status) uzupełnia PUSTE „Osoby” i dopisuje brakujące
//              komentarze; nic, co ktoś edytował, nie jest nadpisywane. Kończy znacznikiem
//              boards.legacy_backfill_at (klient woła raz).
//              → { board_id, changed, people_filled, comments_added, matched, unmatched, marker }
// Dostęp: odczyt modułu tabeli źródłowej (np. module:media; tasks → module:calendar).
// Źródło: wyłącznie lista dozwolonych nazw + custom_<key>_tasks dla modułu z app_modules.
// Tabele źródłowe są tylko CZYTANE.
// Tablica źródła: findSourceBoard — najpierw utworzona przez import (created_by = IMPORT_MARKER,
// bez właściciela), nigdy cudza prywatna. Worker (runForTenant) robi import/uzupełnienie raz
// dla każdego tenanta (przy starcie i codziennie) — patrz koniec pliku.
import { getTableRule, loadGrants } from '../dataapi/registry.js';
import { boardAudience } from '../dataapi/boardsScope.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { emitChange } from '../realtime/hub.js';

export const name = 'board-import-legacy';
export const method = 'POST';

const TZ = 'Europe/Warsaw';
const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const KEY_RE = /^[a-z0-9_]{1,50}$/;
const CUSTOM_RE = /^custom_([a-z0-9_]+)_tasks$/;

// Paleta aplikacji (components/ui/DataTable STATUS_COLORS) — bez kolorów Monday.
const C = { success: '#16a34a', warning: '#d97706', danger: '#dc2626', info: '#2563eb', neutral: '#6b7280', accent: '#8A6606' };
const EXTRA_COLORS = [C.info, C.accent, C.warning, C.success, C.danger, C.neutral];

// ── Źródła ────────────────────────────────────────────────────────────────
// people: tabele, do których wskazuje assigned_to (UUID/ID członka zespołu) — jak w starych kanbanach.
// title — nazwa tablicy, gdy tworzy ją worker (jak tytuły zakładek „Zadania” w webie).
const FIXED_SOURCES = {
  media_tasks: { moduleKey: 'media', comments: 'media_task_comments', people: ['media_team'], title: 'Zadania Media Team' },
  mlodziezowka_tasks: { moduleKey: 'mlodziezowka', comments: 'mlodziezowka_task_comments', people: ['mlodziezowka_leaders', 'mlodziezowka_members'], title: 'Zadania młodzieżówki' },
  home_group_tasks: { moduleKey: 'homegroups', comments: 'home_group_task_comments', people: ['home_group_leaders'], title: 'Zadania grup domowych' },
  // Kalendarz: zadania bez komentarzy; kolumny godzin/kategorii/miejsca dla widoku kalendarza.
  tasks: { moduleKey: 'calendar', comments: null, people: [], calendar: true, title: 'Zadania' },
};

// Znacznik tablicy utworzonej przez import (boards.created_by). Tablica zakładki „Zadania” jest
// wspólna dla służby — bez właściciela (owner_email NULL), więc nikt nie „przejmie” jej na prywatną.
export const IMPORT_MARKER = 'system:board-import';

// Zwraca opis źródła albo null (nieznana/niedozwolona nazwa). customKeys: Set kluczy z app_modules.
export function resolveSource(source, customKeys = new Set()) {
  const s = String(source || '');
  if (!IDENT_RE.test(s)) return null;
  const rule = getTableRule(s);
  if (FIXED_SOURCES[s]) {
    return { table: s, ...FIXED_SOURCES[s], people: [...FIXED_SOURCES[s].people], capability: rule?.resource || `module:${FIXED_SOURCES[s].moduleKey}` };
  }
  const m = CUSTOM_RE.exec(s);
  if (!m || !KEY_RE.test(m[1]) || !customKeys.has(m[1])) return null;
  const key = m[1];
  return {
    table: s, moduleKey: key, comments: `custom_${key}_task_comments`, people: [`custom_${key}_members`],
    capability: rule?.resource || `module:${key}`, title: 'Zadania',
  };
}

// ── Pomocnicze (czyste — testy w test/board-import-legacy.test.js) ──────────
export const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const pick = (cols, cands) => cands.find((c) => cols.has(c)) || null;
const str = (v) => (v == null ? '' : String(v)).trim();
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Wybór kolumn starej tabeli (introspekcja — tabele różnią się między tenantami).
export function pickColumns(cols) {
  const has = cols instanceof Map ? new Set(cols.keys()) : new Set(cols);
  return {
    id: has.has('id') ? 'id' : null,
    name: pick(has, ['title', 'name', 'task', 'content']),
    status: pick(has, ['status', 'state']),
    priority: pick(has, ['priority', 'priorytet']),
    due: pick(has, ['due_date', 'due', 'deadline', 'date']),
    description: pick(has, ['description', 'notes', 'opis']),
    assignee: pick(has, ['assigned_to', 'assigned_to_email', 'assignee', 'assignees', 'owner_email']),
    assigneeName: pick(has, ['assigned_to_name', 'assignee_name']),
    tags: pick(has, ['tags', 'labels']),
    order: pick(has, ['sort_order', 'display_order', 'position', 'order_index']),
    createdAt: pick(has, ['created_at']),
    createdBy: pick(has, ['created_by', 'created_by_email']),
    team: pick(has, ['team', 'team_type']),
    dueTime: pick(has, ['due_time', 'start_time']),
    endTime: pick(has, ['end_time']),
    location: pick(has, ['location']),
  };
}

// Kanoniczne statusy/priorytety (jak DEFAULT_STATUS_LABELS / DEFAULT_PRIORITY_LABELS w Boards).
const STATUS_CANON = [
  { id: 'todo', title: 'Do zrobienia', color: C.neutral, re: /^(do zrobienia|todo|to do|to_do|pending|new|nowe|open|otwarte)$/ },
  { id: 'working', title: 'W trakcie', color: C.warning, re: /^(w trakcie|w toku|in progress|in_progress|doing|working|started)$/ },
  { id: 'stuck', title: 'Zablokowane', color: C.danger, re: /^(zablokowane|stuck|blocked|wstrzymane)$/ },
  { id: 'done', title: 'Gotowe', color: C.success, re: /^(gotowe|done|completed|complete|zrobione|ukonczone|ukończone|zakonczone|zakończone|finished)$/ },
];
const PRIORITY_CANON = [
  { id: 'low', title: 'Niski', color: C.neutral, re: /^(low|niski|niska)$/ },
  { id: 'medium', title: 'Średni', color: C.info, re: /^(medium|sredni|średni|normal|normalny|średnia|srednia)$/ },
  { id: 'high', title: 'Wysoki', color: C.warning, re: /^(high|wysoki|wysoka)$/ },
  { id: 'critical', title: 'Pilne', color: C.danger, re: /^(critical|pilne|pilny|urgent|krytyczny)$/ },
];

// Etykiety kolumny Status/Priorytet: kanoniczne + nieznane wartości ze źródła.
// Zwraca { labels, idFor(value) }.
export function buildLabels(values, canon) {
  const labels = canon.map(({ id, title, color }) => ({ id, title, color }));
  const byValue = new Map();
  let extra = 0;
  for (const raw of values) {
    const v = str(raw);
    if (!v || byValue.has(v)) continue;
    const hit = canon.find((c) => c.re.test(v.toLowerCase()));
    if (hit) { byValue.set(v, hit.id); continue; }
    let id = slug(v) || `l${labels.length}`;
    if (labels.some((l) => l.id === id)) {
      const same = labels.find((l) => l.id === id);
      if (same.title.toLowerCase() === v.toLowerCase()) { byValue.set(v, id); continue; }
      id = `${id}_${labels.length}`;
    }
    labels.push({ id, title: v, color: EXTRA_COLORS[extra++ % EXTRA_COLORS.length] });
    byValue.set(v, id);
  }
  return { labels, idFor: (raw) => { const v = str(raw); return v ? (byValue.get(v) ?? null) : null; } };
}

// Kalendarz: klucze „kalendarzy” zadań (CalendarModule TEAMS bez 'program').
const CALENDAR_TEAMS = [
  ['media', 'Media'], ['atmosfera', 'Atmosfera'], ['worship', 'Uwielbienie'],
  ['kids', 'Dzieci'], ['groups', 'Grupy domowe'], ['mlodziezowka', 'Młodzieżówka'],
];
export function calendarTeamOptions(values) {
  const opts = CALENDAR_TEAMS.map(([id, title], i) => ({ id, title, color: EXTRA_COLORS[i % EXTRA_COLORS.length] }));
  for (const raw of values) {
    const v = str(raw);
    if (v && !opts.some((o) => o.id === v)) opts.push({ id: v, title: v, color: C.neutral });
  }
  return opts;
}

// Surowe wartości osoby przypisanej (tekst, UUID, liczba, tablica, JSON) → lista napisów/obiektów.
export function rawAssignees(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(rawAssignees);
  if (typeof value === 'object') {
    if (value.email || value.name || value.id) return [value];
    return [];
  }
  const s = String(value).trim();
  if (!s) return [];
  if (s.startsWith('[') || s.startsWith('{')) {
    try { return rawAssignees(JSON.parse(s)); } catch { /* zwykły tekst */ }
  }
  // Lista e-maili w jednym polu („a@x.pl, b@y.pl”).
  if (s.includes('@') && /[,;]/.test(s)) return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  return [s];
}

// Katalog osób: konta (app_users) + wiersze tabel członków po id.
// users: [{ id, email, full_name, name, avatar_url, auth_user_id }]; personById: Map(idText → { email, name })
export function makeDirectory(users = [], personById = new Map()) {
  const byEmail = new Map();
  const byId = new Map();
  const byName = new Map();
  for (const u of users) {
    if (!u?.email) continue;
    byEmail.set(String(u.email).toLowerCase(), u);
    if (u.id != null) byId.set(String(u.id), u);
    if (u.auth_user_id != null) byId.set(String(u.auth_user_id), u);
    for (const n of [u.full_name, u.name]) {
      const k = str(n).toLowerCase();
      if (!k) continue;
      const list = byName.get(k) || [];
      if (!list.includes(u)) list.push(u);
      byName.set(k, list);
    }
  }
  return { byEmail, byId, byName, personById };
}

// Wartość komórki „Osoby” — dokładnie kształt PeopleCell/useBoardData: { email, name, avatar_url }.
export const personCell = (u) => ({ email: u.email, name: str(u.full_name) || str(u.name) || u.email, avatar_url: u.avatar_url || null });

// Jedna osoba (email/nazwa) → konto; bez konta zostaje sam e-mail; bez e-maila i bez konta — null.
export function resolvePerson({ email, name }, dir) {
  const e = str(email);
  if (e) {
    const u = dir.byEmail.get(e.toLowerCase());
    if (u) return personCell(u);
    if (isEmail(e)) return { email: e, name: str(name) || e, avatar_url: null };
  }
  const n = str(name);
  if (n) {
    if (isEmail(n)) return resolvePerson({ email: n }, dir);
    const list = dir.byName.get(n.toLowerCase());
    if (list && list.length === 1) return personCell(list[0]);
  }
  return null;
}

// Osoby przypisane do starego wiersza → [{email,name,avatar_url}] + liczba nierozpoznanych.
export function resolveAssignees(value, dir, nameHint = '') {
  const out = [];
  let unresolved = 0;
  const push = (p) => { if (p && !out.some((x) => x.email.toLowerCase() === p.email.toLowerCase())) out.push(p); };
  const raws = rawAssignees(value);
  for (const raw of raws) {
    if (raw && typeof raw === 'object') {
      const p = resolvePerson({ email: raw.email, name: raw.name || raw.full_name }, dir)
        || (raw.id != null ? fromId(String(raw.id)) : null);
      if (p) push(p); else unresolved++;
      continue;
    }
    const s = String(raw);
    let p = null;
    if (s.includes('@')) p = resolvePerson({ email: s, name: raws.length === 1 ? nameHint : '' }, dir);
    else p = fromId(s) || resolvePerson({ name: s }, dir);
    if (p) push(p); else unresolved++;
  }
  if (!raws.length && str(nameHint)) {
    const p = resolvePerson({ name: nameHint }, dir);
    if (p) push(p);
  }
  return { people: out, unresolved };

  function fromId(id) {
    const person = dir.personById.get(id);
    if (person) {
      const p = resolvePerson(person, dir);
      if (p) return p;
    }
    const u = dir.byId.get(id);
    return u ? personCell(u) : null;
  }
}

// Pusta komórka „Osoby” albo nietknięty artefakt starego importu z przeglądarki: dokładnie te same
// wartości co w starym wierszu, każda jako {email:X,name:X} (X = surowe ID członka zespołu albo
// e-mail bez nazwy). Tylko takie wolno uzupełnić — inna liczba osób albo osoba wybrana w tablicy
// (z nazwą/awatarem) = ktoś to edytował, więc zostaje.
export function isFillablePeopleCell(cell, legacyValue) {
  if (cell == null) return true;
  if (!Array.isArray(cell)) return false;
  if (!cell.length) return true;
  const raw = new Set(rawAssignees(legacyValue).filter((x) => typeof x !== 'object').map((x) => String(x)));
  const vals = new Set();
  for (const p of cell) {
    if (!p || typeof p !== 'object' || p.email == null || String(p.email) !== String(p.name) || p.avatar_url) return false;
    if (!raw.has(String(p.email))) return false;
    vals.add(String(p.email));
  }
  return vals.size === raw.size;
}

// Te same osoby (e-mail bez wielkości liter + nazwa) — wtedy nic nie zapisujemy (idempotencja).
export function samePeople(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const key = (p) => `${String(p?.email || '').toLowerCase()}|${p?.name || ''}`;
  const sa = a.map(key).sort();
  const sb = b.map(key).sort();
  return sa.every((v, i) => v === sb[i]);
}

// Dopasowanie starych wierszy do elementów tablicy (backfill).
// rows: [{ id, name, idx, due, status }] w kolejności, w jakiej czytał je stary import (fizycznej);
// items: [{ id, name, display_order, source_id, cells }]; opts.dueOf(item) / opts.statusOf(item).
// 1) source_id; 2) ta sama nazwa — przy duplikatach wygrywa zgodny termin/status, potem najbliższa
// kolejność (stary import nadawał display_order = indeks wiersza). Każdy element najwyżej raz.
export function matchLegacyRows(rows, items, opts = {}) {
  const dueOf = opts.dueOf || (() => null);
  const statusOf = opts.statusOf || (() => null);
  const result = new Map(); // legacyId → item
  const used = new Set();
  const bySource = new Map(items.filter((it) => it.source_id != null).map((it) => [String(it.source_id), it]));
  for (const r of rows) {
    const it = bySource.get(String(r.id));
    if (it && !used.has(it.id)) { result.set(String(r.id), it); used.add(it.id); }
  }
  const norm = (s) => str(s).replace(/\s+/g, ' ').toLowerCase();
  const itemsByName = new Map();
  for (const it of items) {
    if (used.has(it.id) || it.source_id != null) continue;
    const k = norm(it.name);
    if (!itemsByName.has(k)) itemsByName.set(k, []);
    itemsByName.get(k).push(it);
  }
  for (const r of rows) {
    if (result.has(String(r.id))) continue;
    const cands = (itemsByName.get(norm(r.name || 'Zadanie')) || []).filter((it) => !used.has(it.id));
    if (!cands.length) continue;
    let best = null;
    let bestScore = -Infinity;
    for (const it of cands) {
      let score = 0;
      if (r.due && dueOf(it) === r.due) score += 1000;
      if (r.status && statusOf(it) === r.status) score += 500;
      score -= Math.abs((Number(it.display_order) || 0) - (Number(r.idx) || 0));
      if (score > bestScore) { bestScore = score; best = it; }
    }
    result.set(String(r.id), best);
    used.add(best.id);
  }
  return result;
}

// ── Dostęp do bazy ─────────────────────────────────────────────────────────
async function columnsOf(db, table) {
  if (!IDENT_RE.test(table)) return new Map();
  const { rows } = await db.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table]);
  return new Map(rows.filter((r) => IDENT_RE.test(r.column_name)).map((r) => [r.column_name, r.data_type]));
}
const q = (ident) => {
  if (!IDENT_RE.test(ident)) throw new Error(`Nieprawidłowy identyfikator: ${ident}`);
  return `"${ident}"`;
};

// Wyrażenia SQL dnia ('YYYY-MM-DD') i godziny ('HH:MM') terminu — lokalnie (Europe/Warsaw),
// bez przesunięcia przez UTC (stary import ciął ISO w UTC → zadanie na północ lądowało dzień wcześniej).
function dueExprs(col, type) {
  const c = `t.${q(col)}`;
  if (type === 'timestamp with time zone') {
    return [`to_char(${c} AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`, `to_char(${c} AT TIME ZONE '${TZ}', 'HH24:MI')`];
  }
  if (type === 'timestamp without time zone') return [`to_char(${c}, 'YYYY-MM-DD')`, `to_char(${c}, 'HH24:MI')`];
  if (type === 'date') return [`to_char(${c}, 'YYYY-MM-DD')`, 'NULL'];
  return [`CASE WHEN ${c}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN left(${c}::text, 10) END`, 'NULL'];
}

// Czyta stary wiersze + komentarze + katalog osób. Zwraca null, gdy tabeli nie ma.
async function readLegacy(db, src) {
  const cols = await columnsOf(db, src.table);
  if (!cols.size || !cols.has('id')) return null;
  const p = pickColumns(cols);
  const sel = [];
  const want = ['id', p.name, p.status, p.priority, p.description, p.assignee, p.assigneeName, p.tags, p.order,
    p.createdAt, p.createdBy, p.team, p.dueTime, p.endTime, p.location].filter(Boolean);
  for (const c of [...new Set(want)]) sel.push(`t.${q(c)}`);
  if (p.due) {
    const [ymd, hm] = dueExprs(p.due, cols.get(p.due));
    sel.push(`${ymd} AS "__due_ymd"`, `${hm} AS "__due_hm"`);
  }
  // Bez ORDER BY — kolejność fizyczna = kolejność, w której czytał stary import (dopasowanie backfillu).
  const { rows } = await db.query(`SELECT ${sel.join(', ')} FROM ${q(src.table)} t`);
  rows.forEach((r, i) => { r.__idx = i; });

  // Komentarze
  const commentsByTask = new Map();
  if (src.comments) {
    const cc = await columnsOf(db, src.comments);
    const taskCol = pick(cc, ['task_id', 'item_id']);
    const bodyCol = pick(cc, ['content', 'body', 'text', 'comment', 'message']);
    if (cc.size && cc.has('id') && taskCol && bodyCol) {
      const cs = ['id', taskCol, bodyCol, pick(cc, ['author_email', 'user_email', 'email']), pick(cc, ['author_name', 'user_name']),
        pick(cc, ['author_id', 'user_id', 'member_id']), pick(cc, ['created_at'])].filter(Boolean);
      const { rows: comments } = await db.query(
        `SELECT ${[...new Set(cs)].map((c) => `c.${q(c)}`).join(', ')} FROM ${q(src.comments)} c`
        + (cc.has('created_at') ? ' ORDER BY c."created_at" ASC NULLS FIRST' : ''));
      const ae = pick(cc, ['author_email', 'user_email', 'email']);
      const an = pick(cc, ['author_name', 'user_name']);
      const ai = pick(cc, ['author_id', 'user_id', 'member_id']);
      for (const c of comments) {
        const body = str(c[bodyCol]);
        if (!body || c[taskCol] == null) continue;
        const k = String(c[taskCol]);
        if (!commentsByTask.has(k)) commentsByTask.set(k, []);
        commentsByTask.get(k).push({
          id: String(c.id), body, created_at: c.created_at || null,
          email: ae ? str(c[ae]) : '', name: an ? str(c[an]) : '', authorId: ai && c[ai] != null ? String(c[ai]) : '',
        });
      }
    }
  }

  // Katalog osób: konta + członkowie zespołu, do których wskazują ID.
  const uc = await columnsOf(db, 'app_users');
  const ucols = ['id', 'email', 'full_name', 'name', 'avatar_url', 'auth_user_id'].filter((c) => uc.has(c));
  const { rows: users } = await db.query(`SELECT ${ucols.map(q).join(', ')} FROM app_users WHERE email IS NOT NULL`);
  const ids = new Set();
  for (const r of rows) {
    for (const v of rawAssignees(p.assignee ? r[p.assignee] : null)) {
      if (typeof v === 'object') { if (v.id != null) ids.add(String(v.id)); } else if (!String(v).includes('@')) ids.add(String(v));
    }
    if (p.createdBy && r[p.createdBy] != null && !String(r[p.createdBy]).includes('@')) ids.add(String(r[p.createdBy]));
  }
  for (const list of commentsByTask.values()) for (const c of list) if (c.authorId) ids.add(c.authorId);
  const personById = new Map();
  if (ids.size) {
    const memberIds = new Set();
    for (const t of [...src.people, 'members']) {
      const tc = await columnsOf(db, t);
      if (!tc.size || !tc.has('id')) continue;
      const pc = ['id', 'email', 'user_email', 'full_name', 'name', 'user_name', 'first_name', 'last_name', 'member_id'].filter((c) => tc.has(c));
      const { rows: found } = await db.query(
        `SELECT ${pc.map(q).join(', ')} FROM ${q(t)} WHERE id::text = ANY($1::text[])`, [[...ids]]);
      for (const f of found) {
        const id = String(f.id);
        if (personById.has(id)) continue;
        const fullName = str(f.full_name) || str(f.name) || str(f.user_name) || [str(f.first_name), str(f.last_name)].filter(Boolean).join(' ');
        const person = { email: str(f.email) || str(f.user_email), name: fullName, memberId: f.member_id != null ? String(f.member_id) : null };
        personById.set(id, person);
        if (!person.email && person.memberId) memberIds.add(person.memberId);
      }
    }
    // Członek zespołu bez e-maila → jego wpis w members (member_id).
    if (memberIds.size) {
      const mc = await columnsOf(db, 'members');
      if (mc.has('id') && mc.has('email')) {
        const { rows: ms } = await db.query(`SELECT id, email FROM members WHERE id::text = ANY($1::text[])`, [[...memberIds]]);
        const em = new Map(ms.map((m) => [String(m.id), str(m.email)]));
        for (const person of personById.values()) if (!person.email && person.memberId) person.email = em.get(person.memberId) || '';
      }
    }
  }
  const dir = makeDirectory(users, personById);
  return { cols, p, rows, commentsByTask, dir };
}

// Autor komentarza → { author_email, author_name }.
function commentAuthor(c, dir) {
  const p = resolvePerson({ email: c.email, name: c.name }, dir)
    || (c.authorId && dir.personById.get(c.authorId) ? resolvePerson(dir.personById.get(c.authorId), dir) : null)
    || (c.authorId && dir.byId.get(c.authorId) ? personCell(dir.byId.get(c.authorId)) : null);
  if (p) return { author_email: p.email, author_name: p.name };
  return { author_email: isEmail(c.email) ? c.email : null, author_name: c.name || c.email || null };
}

function createdByEmail(r, legacy) {
  const col = legacy.p.createdBy;
  if (!col || r[col] == null) return null;
  const v = String(r[col]);
  if (v.includes('@')) return v;
  const person = legacy.dir.personById.get(v);
  const p = person ? resolvePerson(person, legacy.dir) : null;
  if (p) return p.email;
  const u = legacy.dir.byId.get(v);
  return u ? u.email : null;
}

// Kolejność jak w starym kanbanie: sort_order rosnąco, potem najnowsze najpierw.
function sortForImport(rows, p) {
  const ts = (r) => (p.createdAt && r[p.createdAt] ? new Date(r[p.createdAt]).getTime() : 0);
  return [...rows].sort((a, b) => {
    if (p.order) {
      const oa = a[p.order] == null ? Infinity : Number(a[p.order]);
      const ob = b[p.order] == null ? Infinity : Number(b[p.order]);
      if (oa !== ob) return oa - ob;
    }
    return ts(b) - ts(a) || a.__idx - b.__idx;
  });
}

async function insertComment(client, { itemId, boardId, c, dir, hasSource }) {
  const a = commentAuthor(c, dir);
  const cols = ['item_id', 'board_id', 'author_email', 'author_name', 'body'];
  const vals = [itemId, boardId, a.author_email, a.author_name, c.body];
  if (c.created_at) { cols.push('created_at'); vals.push(c.created_at); }
  if (hasSource) { cols.push('source_id'); vals.push(c.id); }
  await client.query(
    `INSERT INTO board_item_updates (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
}

// ── Import ─────────────────────────────────────────────────────────────────
async function importBoard(client, { src, title, user, schema }) {
  const legacy = await readLegacy(client, src);
  const rows = legacy ? sortForImport(legacy.rows, legacy.p) : [];
  const p = legacy?.p || pickColumns([]);
  const vals = (col) => (col ? rows.map((r) => r[col]) : []);

  // Bez właściciela, ze znacznikiem importu (IMPORT_MARKER) — patrz findSourceBoard.
  const boardCols = ['name', 'source_kind', 'module_key', 'color', 'icon', 'owner_email', 'created_by'];
  const boardVals = [title, src.table, src.moduleKey, C.accent, 'ListTodo', null, IMPORT_MARKER];
  if (schema.boardMarker) { boardCols.push('legacy_backfill_at'); boardVals.push(new Date()); }
  const { rows: [board] } = await client.query(
    `INSERT INTO boards (${boardCols.join(', ')}) VALUES (${boardVals.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, boardVals);

  let ord = 0;
  const addCol = async (colName, type, settings = {}) => {
    const { rows: [c] } = await client.query(
      `INSERT INTO board_columns (board_id, name, type, settings, display_order, width) VALUES ($1, $2, $3, $4::jsonb, $5, 160) RETURNING id`,
      [board.id, colName, type, JSON.stringify(settings), ord++]);
    return c.id;
  };
  const status = buildLabels(vals(p.status), STATUS_CANON);
  const prio = buildLabels(vals(p.priority), PRIORITY_CANON);
  const tagValues = [...new Set(rows.flatMap((r) => (Array.isArray(r[p.tags]) ? r[p.tags] : [])).map(str).filter(Boolean))];
  const tagId = new Map();
  const tagOptions = tagValues.map((t, i) => {
    let id = slug(t) || `t${i}`;
    if ([...tagId.values()].includes(id)) id = `${id}_${i}`;
    tagId.set(t, id);
    return { id, title: t, color: EXTRA_COLORS[i % EXTRA_COLORS.length] };
  });

  const col = {};
  col.status = await addCol('Status', 'status', { labels: status.labels });
  col.people = await addCol('Osoby', 'people', {});
  col.due = await addCol('Termin', 'date', { role: 'due' });
  if (src.calendar) {
    col.start = await addCol('Od', 'text', { role: 'start_time' });
    col.end = await addCol('Do', 'text', { role: 'end_time' });
    col.team = await addCol('Kategoria', 'dropdown', { multi: false, role: 'team', options: calendarTeamOptions(vals(p.team)) });
    col.location = await addCol('Miejsce', 'location', { role: 'location' });
  }
  if (p.priority) col.prio = await addCol('Priorytet', 'priority', { labels: prio.labels });
  if (p.tags && tagOptions.length) col.tags = await addCol('Etykiety', 'dropdown', { multi: true, options: tagOptions });
  // Opis: natywne pole elementu (ItemPanel „Opis”); bez kolumny description w bazie — kolumna tekstowa.
  if (p.description && !schema.itemDescription) col.desc = await addCol('Opis', 'long_text', {});

  const { rows: [group] } = await client.query(
    `INSERT INTO board_groups (board_id, name, color, display_order) VALUES ($1, 'Zadania', $2, 0) RETURNING id`, [board.id, C.info]);
  await client.query(
    `INSERT INTO board_views (board_id, name, type, is_default, display_order, config) VALUES ($1, 'Tabela', 'table', true, 0, '{}'::jsonb)`, [board.id]);

  let people = 0;
  let comments = 0;
  let unresolved = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cells = {};
    const st = p.status ? status.idFor(r[p.status]) : null;
    cells[col.status] = st || 'todo';
    if (r.__due_ymd) cells[col.due] = r.__due_ymd;
    if (p.priority && col.prio) { const v = prio.idFor(r[p.priority]); if (v) cells[col.prio] = v; }
    if (col.tags && Array.isArray(r[p.tags])) cells[col.tags] = r[p.tags].map(str).filter(Boolean).map((t) => tagId.get(t)).filter(Boolean);
    if (col.desc && str(r[p.description])) cells[col.desc] = String(r[p.description]);
    if (p.assignee || p.assigneeName) {
      const res = resolveAssignees(p.assignee ? r[p.assignee] : null, legacy.dir, p.assigneeName ? str(r[p.assigneeName]) : '');
      unresolved += res.unresolved;
      if (res.people.length) { cells[col.people] = res.people; people++; }
    }
    if (src.calendar) {
      const start = str(p.dueTime ? r[p.dueTime] : '').slice(0, 5) || (r.__due_hm && r.__due_hm !== '00:00' ? r.__due_hm : '');
      if (start) cells[col.start] = start;
      const end = str(p.endTime ? r[p.endTime] : '').slice(0, 5);
      if (end) cells[col.end] = end;
      const team = str(p.team ? r[p.team] : '');
      if (team) cells[col.team] = [team];
      const loc = str(p.location ? r[p.location] : '');
      if (loc) cells[col.location] = loc;
    }
    const itemCols = ['board_id', 'group_id', 'name', 'cells', 'display_order', 'created_by'];
    const itemVals = [board.id, group.id, str(r[p.name]) || 'Zadanie', JSON.stringify(cells), i, createdByEmail(r, legacy) || user?.email || null];
    if (schema.itemDescription && p.description && str(r[p.description])) { itemCols.push('description'); itemVals.push(String(r[p.description])); }
    if (p.createdAt && r[p.createdAt]) { itemCols.push('created_at'); itemVals.push(r[p.createdAt]); }
    if (schema.itemSource) { itemCols.push('source_id'); itemVals.push(String(r.id)); }
    const { rows: [item] } = await client.query(
      `INSERT INTO board_items (${itemCols.join(', ')}) VALUES (${itemVals.map((_, k) => (itemCols[k] === 'cells' ? `$${k + 1}::jsonb` : `$${k + 1}`)).join(', ')}) RETURNING id`,
      itemVals);
    for (const c of legacy.commentsByTask.get(String(r.id)) || []) {
      await insertComment(client, { itemId: item.id, boardId: board.id, c, dir: legacy.dir, hasSource: schema.updateSource });
      comments++;
    }
  }
  return { board, imported: rows.length, people, comments, unresolved };
}

// ── Backfill ───────────────────────────────────────────────────────────────
async function backfillBoard(client, { board, src, schema }) {
  const stats = { people_filled: 0, comments_added: 0, matched: 0, unmatched: 0, unresolved_people: 0 };
  const legacy = await readLegacy(client, src);
  if (!legacy || !legacy.rows.length) return stats;
  const { p, rows, dir } = legacy;

  const { rows: cols } = await client.query(
    `SELECT id, name, type, settings, display_order FROM board_columns WHERE board_id = $1 ORDER BY display_order`, [board.id]);
  const dateCol = cols.find((c) => c.type === 'date');
  const statusCol = cols.find((c) => c.type === 'status');
  let peopleCol = cols.find((c) => c.type === 'people' && /osoby/i.test(c.name)) || cols.find((c) => c.type === 'people');

  const itemSel = ['id', 'name', 'cells', 'display_order'].concat(schema.itemSource ? ['source_id'] : []);
  const { rows: items } = await client.query(
    `SELECT ${itemSel.join(', ')} FROM board_items WHERE board_id = $1 AND parent_item_id IS NULL ORDER BY display_order, created_at FOR UPDATE`,
    [board.id]);
  const labelTitle = (id) => (statusCol?.settings?.labels || []).find((l) => l.id === id)?.title || null;
  const legacyRows = rows.map((r) => ({
    id: String(r.id), name: str(r[p.name]) || 'Zadanie', idx: r.__idx,
    due: r.__due_ymd || null, status: p.status ? str(r[p.status]).toLowerCase() || null : null,
  }));
  const matches = matchLegacyRows(legacyRows, items, {
    dueOf: (it) => (dateCol ? String(it.cells?.[dateCol.id] ?? '').slice(0, 10) || null : null),
    statusOf: (it) => (statusCol ? (labelTitle(it.cells?.[statusCol.id]) || String(it.cells?.[statusCol.id] ?? '')).toLowerCase() || null : null),
  });
  stats.matched = matches.size;
  stats.unmatched = rows.length - matches.size;

  // Komentarze już przeniesione (source_id) — idempotencja niezależna od dopasowania elementu.
  const existing = new Set();
  if (schema.updateSource) {
    const { rows: done } = await client.query(
      `SELECT source_id FROM board_item_updates WHERE board_id = $1 AND source_id IS NOT NULL`, [board.id]);
    for (const d of done) existing.add(String(d.source_id));
  }

  const changedItems = [];
  for (const r of rows) {
    const item = matches.get(String(r.id));
    if (!item) continue;
    // Osoby: tylko gdy komórka pusta (albo to artefakt starego importu).
    if (p.assignee || p.assigneeName) {
      const legacyValue = p.assignee ? r[p.assignee] : null;
      const res = resolveAssignees(legacyValue, dir, p.assigneeName ? str(r[p.assigneeName]) : '');
      stats.unresolved_people += res.unresolved;
      if (res.people.length) {
        if (!peopleCol) {
          const order = cols.reduce((m, c) => Math.max(m, Number(c.display_order) || 0), -1) + 1;
          const { rows: [c] } = await client.query(
            `INSERT INTO board_columns (board_id, name, type, settings, display_order, width) VALUES ($1, 'Osoby', 'people', '{}'::jsonb, $2, 160) RETURNING id, name, type, settings, display_order`,
            [board.id, order]);
          peopleCol = c;
          cols.push(c);
        }
        const current = item.cells?.[peopleCol.id];
        if (isFillablePeopleCell(current, legacyValue) && !samePeople(current, res.people)) {
          const sets = [`cells = coalesce(cells, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)`];
          const params = [item.id, peopleCol.id, JSON.stringify(res.people)];
          if (schema.itemSource && item.source_id == null) { sets.push(`source_id = $4`); params.push(String(r.id)); }
          const { rows: [upd] } = await client.query(`UPDATE board_items SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
          if (upd) changedItems.push(upd);
          stats.people_filled++;
        }
      }
    }
    // Komentarze: brakujące (po source_id; bez kolumny — po treści i dacie w tym elemencie).
    for (const c of legacy.commentsByTask.get(String(r.id)) || []) {
      if (schema.updateSource) {
        if (existing.has(c.id)) continue;
      } else {
        const { rows: dup } = await client.query(
          `SELECT 1 FROM board_item_updates WHERE item_id = $1 AND body = $2 AND created_at IS NOT DISTINCT FROM $3 LIMIT 1`,
          [item.id, c.body, c.created_at]);
        if (dup.length) continue;
      }
      await insertComment(client, { itemId: item.id, boardId: board.id, c, dir, hasSource: schema.updateSource });
      existing.add(c.id);
      stats.comments_added++;
    }
  }
  stats.changedItems = changedItems;
  return stats;
}

// ── Dostęp ─────────────────────────────────────────────────────────────────
// Kontekst wołającego: konto + can(capability) tym samym resolverem co /api/db.
export async function callerAccess(req) {
  const { rows } = await req.db.query('SELECT id, email, role, is_super_admin FROM app_users WHERE id = $1', [req.user.id]);
  const me = rows[0];
  if (!me) return null;
  const { isAdmin, can } = await accessFor(req.db, req.tenant.db_name, me);
  return { me: { ...me, email: me.email || req.user.email }, isAdmin, can };
}

// can(capability) dla konta { id, role, is_super_admin } — bez zapytania o konto (worker liczy
// to dla wielu osób naraz; granty z pamięci podręcznej loadGrants per baza).
export async function accessFor(db, dbName, me) {
  const { grants, adminRoles, legacy } = await loadGrants(db, dbName);
  const isAdmin = !!me.is_super_admin || adminRoles.has(me.role);
  const resolver = !isAdmin && grants !== null ? makeResolver(grants, { role: me.role, userId: me.id, isAdmin: false }) : null;
  const can = (cap) => {
    if (isAdmin) return true;
    if (grants === null) return !!(legacy || []).find((x) => x.role === me.role && x.resource === cap)?.can_read;
    return resolver.can(cap);
  };
  return { isAdmin, can };
}


export async function schemaFlags(db) {
  const [b, i, u] = await Promise.all([columnsOf(db, 'boards'), columnsOf(db, 'board_items'), columnsOf(db, 'board_item_updates')]);
  return { boardMarker: b.has('legacy_backfill_at'), itemSource: i.has('source_id'), itemDescription: i.has('description'), updateSource: u.has('source_id') };
}

// Tablica źródła. Kandydatki: nie-szablony z tym source_kind, które są wspólne (nie prywatne) albo
// utworzone przez import. Pierwszeństwo: utworzona przez import (IMPORT_MARKER), z modułem źródła
// (albo bez modułu), nie-archiwalna, najstarsza. Dzięki temu tablica założona wcześniej ręcznie
// z tym samym source_kind — zwłaszcza prywatna — nie „przejmuje” zadań służby (i ich osób/komentarzy).
export function sourceBoardSql() {
  return `SELECT * FROM boards
     WHERE source_kind = $1
       AND coalesce(is_template, false) = false
       AND (created_by = $2 OR coalesce(visibility, 'workspace') <> 'private')
     ORDER BY (created_by = $2) DESC NULLS LAST,
              (module_key IS NULL OR module_key = $3) DESC,
              coalesce(is_archived, false) ASC,
              created_at ASC NULLS LAST, id
     LIMIT 1`;
}
export async function findSourceBoard(db, src) {
  const { rows } = await db.query(sourceBoardSql(), [src.table, IMPORT_MARKER, src.moduleKey || null]);
  return rows[0] || null;
}

// Import / uzupełnienie jednego źródła w jednej transakcji z blokadą doradczą per źródło (ta sama
// w HTTP i w workerze — równoległe wywołania czekają na siebie, druga widzi już tablicę).
// actor: konto wołającego (twórca elementów bez autora w starym wierszu) albo null (worker).
// → { status, body, changedItems }
export async function runLegacy(db, { src, mode = 'import', title = '', actor = null, schema = null }) {
  const flags = schema || await schemaFlags(db);
  const client = await db.connect();
  let out;
  let changedItems = [];
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board-import-legacy:${src.table}`]);
    const board = await findSourceBoard(client, src);
    if (mode === 'import') {
      if (board) {
        out = { board_id: board.id, created: false, backfill_needed: !flags.boardMarker || !board.legacy_backfill_at };
      } else {
        const res = await importBoard(client, { src, title: str(title).slice(0, 120) || src.title || 'Zadania', user: actor, schema: flags });
        out = {
          board_id: res.board.id, created: true, imported: res.imported, people: res.people,
          comments: res.comments, unresolved_people: res.unresolved, backfill_needed: false,
        };
      }
    } else if (!board) {
      await client.query('ROLLBACK');
      return { status: 404, body: { error: 'Nie ma jeszcze tablicy dla tych zadań' }, changedItems };
    } else if (flags.boardMarker && board.legacy_backfill_at) {
      out = { board_id: board.id, changed: false, already: true, marker: true };
    } else {
      const s = await backfillBoard(client, { board, src, schema: flags });
      changedItems = s.changedItems || [];
      if (flags.boardMarker) await client.query('UPDATE boards SET legacy_backfill_at = now() WHERE id = $1', [board.id]);
      out = {
        board_id: board.id, changed: s.people_filled + s.comments_added > 0, people_filled: s.people_filled,
        comments_added: s.comments_added, matched: s.matched, unmatched: s.unmatched,
        unresolved_people: s.unresolved_people, marker: flags.boardMarker,
      };
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release?.();
  }
  return { status: 200, body: out, changedItems };
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });
  const mode = req.body?.mode === 'backfill' ? 'backfill' : 'import';
  const source = String(req.body?.source || '');
  const title = str(req.body?.title).slice(0, 120) || 'Zadania';

  let customKeys = new Set();
  const cm = CUSTOM_RE.exec(source);
  if (cm && KEY_RE.test(cm[1])) {
    const { rows } = await req.db.query('SELECT key FROM app_modules WHERE key = $1', [cm[1]]);
    customKeys = new Set(rows.map((r) => r.key));
  }
  const src = resolveSource(source, customKeys);
  if (!src) return reply.code(400).send({ error: 'Nieznane źródło zadań' });

  const access = await callerAccess(req);
  if (!access) return reply.code(403).send({ error: 'Brak konta' });
  if (!access.can(src.capability)) return reply.code(403).send({ error: `Brak dostępu do ${src.capability}` });

  let res;
  try {
    res = await runLegacy(req.db, { src, mode, title, actor: access.me });
  } catch (err) {
    req.log?.error?.(err, '[board-import-legacy]');
    return reply.code(500).send({ error: 'Nie udało się przenieść zadań' });
  }
  if (res.status !== 200) return reply.code(res.status).send(res.body);

  // Realtime: inne otwarte karty tej tablicy dostają uzupełnione osoby (prywatne tablice — tylko uprawnieni).
  if (res.changedItems.length) {
    try {
      const audience = await boardAudience(req.db, 'board_items', res.changedItems).catch(() => new Set());
      emitChange(req.tenant.slug, 'board_items', 'update', res.changedItems, audience ? { audience } : {});
    } catch { /* realtime nieobowiązkowy */ }
  }
  return res.body;
}

// ── Worker: jednorazowe przeniesienie dla każdego tenanta ─────────────────────
// Przy starcie workera i raz dziennie (worker.js): dla każdego źródła, które ma wiersze, tablica
// powstaje bez czekania, aż ktoś otworzy zakładkę „Zadania” (stare tabele są już tylko do odczytu),
// a tablica zaimportowana dawniej w przeglądarce jest uzupełniana (legacy_backfill_at IS NULL).
// Idempotentne (blokada + wybór tablicy jak w HTTP), bezpieczne równolegle z webem.

// Źródła tenanta: stałe + custom_<key>_tasks modułów z app_modules (tylko istniejące tabele).
export async function legacySources(db) {
  let mods = [];
  try {
    ({ rows: mods } = await db.query('SELECT key, label FROM app_modules'));
  } catch { mods = []; }
  const keys = new Set(mods.map((m) => m.key).filter((k) => typeof k === 'string' && KEY_RE.test(k)));
  const labelOf = new Map(mods.map((m) => [m.key, str(m.label)]));
  const names = [...Object.keys(FIXED_SOURCES), ...[...keys].map((k) => `custom_${k}_tasks`)];
  const out = [];
  for (const n of names) {
    const src = resolveSource(n, keys);
    if (!src) continue;
    if (!FIXED_SOURCES[n]) {
      const label = labelOf.get(src.moduleKey);
      src.title = label ? `Zadania — ${label}` : 'Zadania';
    }
    out.push(src);
  }
  const { rows: existing } = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [out.map((s) => s.table)]);
  const have = new Set(existing.map((r) => r.table_name));
  return out.filter((s) => have.has(s.table));
}

async function hasRows(db, table) {
  const { rows } = await db.query(`SELECT EXISTS (SELECT 1 FROM ${q(table)}) AS any`);
  return !!rows[0]?.any;
}

// Licznik do linii kontrolnej: wiersze starej tabeli vs elementy tablicy z source_id (null = nie wiadomo).
async function countOrNull(db, sql, params = []) {
  try {
    const { rows } = await db.query(sql, params);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}

// Stan jednego źródła do linii kontrolnej (po imporcie/uzupełnieniu).
async function verifySource(db, src, boardId, schema) {
  const legacy = await countOrNull(db, `SELECT count(*)::int AS n FROM ${q(src.table)}`);
  const items = boardId && schema.itemSource
    ? await countOrNull(db, 'SELECT count(*)::int AS n FROM board_items WHERE board_id = $1 AND source_id IS NOT NULL', [boardId])
    : null;
  let backfill = 'backfill n/a (no marker column)';
  if (boardId && schema.boardMarker) {
    const { rows } = await db.query('SELECT legacy_backfill_at FROM boards WHERE id = $1', [boardId]).catch(() => ({ rows: [] }));
    backfill = rows[0]?.legacy_backfill_at ? 'backfill done' : 'backfill pending';
  }
  return { legacy, items, backfill };
}

// Jedna linia na tenanta (docker logs workera) — operator sprawdza, czy wszystko przeszło, np.:
// „board-import-legacy: media_tasks: board <id> (imported 0, backfill done) legacy 12 / items 12 ok; tasks: empty”
export function summaryLine(entries) {
  if (!entries.length) return 'board-import-legacy: no legacy task tables';
  const part = (e) => {
    if (e.state === 'empty') return `${e.table}: empty`;
    if (e.state === 'error') return `${e.table}: ERROR (${e.error})`;
    const n = (v) => (v == null ? '?' : v);
    const check = e.legacy == null || e.items == null ? 'unverified' : e.items >= e.legacy ? 'ok' : `MISSING ${e.legacy - e.items}`;
    return `${e.table}: board ${e.boardId} (imported ${e.imported}${e.created ? ', new board' : ''}, ${e.backfill}) legacy ${n(e.legacy)} / items ${n(e.items)} ${check}`;
  };
  return `board-import-legacy: ${entries.map(part).join('; ')}`;
}

export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  const result = { created: 0, backfilled: 0, skipped: 0, failed: 0, sources: [] };
  let sources = [];
  let schema;
  try {
    schema = await schemaFlags(pool);
    sources = await legacySources(pool);
  } catch (err) {
    log(`board-import-legacy: pominięte (${err.message})`);
    return result;
  }
  for (const src of sources) {
    try {
      if (!(await hasRows(pool, src.table))) {
        result.skipped++;
        result.sources.push({ table: src.table, state: 'empty' });
        continue;
      }
      const imp = await runLegacy(pool, { src, mode: 'import', schema });
      const entry = { table: src.table, state: 'ok', boardId: imp.body.board_id, created: !!imp.body.created, imported: imp.body.created ? (imp.body.imported || 0) : 0 };
      if (imp.body.created) {
        result.created++;
        log(`board-import-legacy: ${src.table} → nowa tablica ${imp.body.board_id} (zadań ${imp.body.imported}, osób ${imp.body.people}, komentarzy ${imp.body.comments})`);
      } else if (imp.body.backfill_needed && schema.boardMarker) {
        // Bez kolumny znacznika (przed migracją 092) uzupełnienie nie zapamiętałoby wykonania — pomijamy.
        const bf = await runLegacy(pool, { src, mode: 'backfill', schema });
        if (bf.status === 200 && !bf.body.already) {
          result.backfilled++;
          log(`board-import-legacy: ${src.table} → uzupełniono tablicę ${bf.body.board_id} (osób ${bf.body.people_filled}, komentarzy ${bf.body.comments_added})`);
        }
      } else {
        result.skipped++;
      }
      Object.assign(entry, await verifySource(pool, src, imp.body.board_id, schema));
      result.sources.push(entry);
    } catch (err) {
      result.failed++;
      result.sources.push({ table: src.table, state: 'error', error: err.message });
      log(`board-import-legacy: ${src.table} błąd: ${err.message}`);
    }
  }
  log(summaryLine(result.sources));
  return result;
}
