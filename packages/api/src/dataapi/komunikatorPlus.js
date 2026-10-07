// Komunikator+ (2026-10) — reguły serwera ponad zakres uczestnika z komunikator.js:
//  K9  polityka rozmów prywatnych (app_settings.chat_dm_policy) i ochrona niepełnoletnich
//      (app_settings.chat_protect_minors) — 403 DM_NOT_ALLOWED,
//  K10 blokowanie osób (user_blocks) — 403 BLOCKED w rozmowie 1:1; zgłoszenia (message_reports),
//  K5  @wszyscy (mentions zawiera "*") — tylko administrator rozmowy / lider / admin aplikacji,
//  K7  ankiety: zamknięcie (closes_at), jednokrotny wybór, anonimowość (redakcja e-maili).
// Funkcje czyste (bez bazy) są eksportowane do testów.
import { ApiError } from './querybuilder.js';
import { ADMIN_ROLES } from './registry.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();

// ── Ustawienia Komunikatora (app_settings) ──────────────────────────────────
export const DM_POLICIES = ['all', 'leaders', 'off'];
export const CHAT_SETTING_KEYS = ['chat_dm_policy', 'chat_protect_minors', 'chat_private_files'];

// Wartość z app_settings bywa zapisana jako JSON-string ("\"on\"") — normalizujemy.
const settingValue = (v) => String(v ?? '').trim().replace(/^"(.*)"$/, '$1').trim().toLowerCase();

export function parseChatSettings(map = {}) {
  const dm = settingValue(map.chat_dm_policy);
  return {
    dm: DM_POLICIES.includes(dm) ? dm : 'all', // domyślnie: każdy z każdym
    protectMinors: settingValue(map.chat_protect_minors) !== 'off', // domyślnie WŁĄCZONA
    privateFiles: settingValue(map.chat_private_files) === 'on', // domyślnie wyłączone (stare apki)
  };
}

// Krótki cache per pula bazy (ustawienia czytane przy każdej wiadomości 1:1).
const settingsCache = new WeakMap();
export async function loadChatSettings(db, { fresh = false } = {}) {
  const hit = db && typeof db === 'object' ? settingsCache.get(db) : null;
  if (!fresh && hit && Date.now() - hit.at < 30_000) return hit.value;
  const map = {};
  try {
    const { rows } = await db.query(`SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`, [CHAT_SETTING_KEYS]);
    for (const r of rows || []) map[r.key] = r.value;
  } catch { /* brak tabeli — domyślne */ }
  const value = parseChatSettings(map);
  if (db && typeof db === 'object') settingsCache.set(db, { value, at: Date.now() });
  return value;
}

// ── Wiek (members.birth_date) ───────────────────────────────────────────────
// Niepełnoletni = przed 18. urodzinami. Data jako Date (pg DATE → lokalna północ) albo 'YYYY-MM-DD'.
export function isMinorBirthDate(birth, now = new Date()) {
  if (!birth) return false;
  let y; let m; let d;
  if (birth instanceof Date) {
    if (Number.isNaN(birth.getTime())) return false;
    y = birth.getFullYear(); m = birth.getMonth() + 1; d = birth.getDate();
  } else {
    const mm = String(birth).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!mm) return false;
    y = Number(mm[1]); m = Number(mm[2]); d = Number(mm[3]);
  }
  if (!y || y < 1900) return false;
  return now < new Date(y + 18, m - 1, d);
}

// Kilka kartotek pod jednym e-mailem (np. rodzic i dziecko na wspólnym adresie): pierwszeństwo
// ma kartoteka powiązana z kontem (app_users.member_id); bez niej — niepełnoletni tylko wtedy,
// gdy WSZYSTKIE kartoteki z datą urodzenia wskazują na niepełnoletniego (dorosły rodzic nie
// traci możliwości pisania przez kartotekę dziecka z jego adresem).
export function resolveMinor(rows = [], now = new Date()) {
  const linked = rows.filter((r) => r && r.linked);
  const pool = (linked.length ? linked : rows).filter((r) => r && r.birth_date);
  if (!pool.length) return false;
  return pool.every((r) => isMinorBirthDate(r.birth_date, now));
}

// Gospodarstwa domowe osoby (members.household_id) — z kartoteki powiązanej z kontem, a bez niej
// ze wszystkich kartotek o tym e-mailu.
export function resolveHouseholds(rows = []) {
  const linked = rows.filter((r) => r && r.linked);
  const pool = linked.length ? linked : rows;
  return [...new Set(pool.map((r) => r?.household_id).filter((h) => h != null && h !== '').map(String))];
}

// Fakty z kartoteki członków: { e: { isMinor, households[] } } dla podanych e-maili.
export async function memberFacts(db, emails) {
  const list = [...new Set((emails || []).map(lower).filter(Boolean))];
  const byEmail = new Map(list.map((e) => [e, []]));
  if (list.length) {
    try {
      const { rows } = await db.query(
        `SELECT lower(u.email) AS e, m.birth_date, m.household_id, true AS linked
           FROM app_users u JOIN members m ON m.id = u.member_id
          WHERE lower(u.email) = ANY($1::text[])`, [list]);
      for (const r of rows || []) byEmail.get(r.e)?.push(r);
    } catch { /* brak powiązania konto↔kartoteka — tylko po e-mailu */ }
    try {
      const { rows } = await db.query(
        `SELECT lower(email) AS e, birth_date, household_id, false AS linked FROM members WHERE lower(email) = ANY($1::text[])`, [list]);
      for (const r of rows || []) byEmail.get(r.e)?.push(r);
    } catch { /* brak tabeli */ }
  }
  const out = {};
  for (const [e, rows] of byEmail) out[e] = { isMinor: resolveMinor(rows), households: resolveHouseholds(rows) };
  return out;
}

export async function minorEmails(db, emails) {
  const facts = await memberFacts(db, emails);
  return new Set(Object.entries(facts).filter(([, f]) => f.isMinor).map(([e]) => e));
}

// ── Administratorzy i liderzy ───────────────────────────────────────────────
// Admin aplikacji: is_super_admin, rola z app_roles.is_admin albo rola o pełnym dostępie.
export async function appAdminEmails(db, emails) {
  const list = [...new Set((emails || []).map(lower).filter(Boolean))];
  const out = new Set();
  if (!list.length) return out;
  let rows = [];
  try {
    ({ rows } = await db.query(
      `SELECT lower(u.email) AS e, u.is_super_admin, u.role,
              (SELECT r.is_admin FROM app_roles r WHERE r.key = u.role LIMIT 1) AS role_admin
         FROM app_users u WHERE lower(u.email) = ANY($1::text[])`, [list]));
  } catch {
    try {
      ({ rows } = await db.query(`SELECT lower(email) AS e, is_super_admin, role FROM app_users WHERE lower(email) = ANY($1::text[])`, [list]));
    } catch { rows = []; }
  }
  for (const r of rows || []) {
    if (r.is_super_admin === true || r.role_admin === true || ADMIN_ROLES.includes(r.role)) out.add(r.e);
  }
  return out;
}

export async function isAppAdmin(db, email) {
  return (await appAdminEmails(db, [email])).has(lower(email));
}

// Role konta oznaczające prowadzenie służb (oprócz ról administratora).
const LEADER_ACCOUNT_ROLES = ['koordynator', 'lider'];

// Źródła „lider jakiejkolwiek służby/grupy”. Każde zapytanie osobno (brak tabeli/kolumny
// w starszym tenancie nie psuje pozostałych). $1 = tablica e-maili małymi literami.
const LEADER_SOURCES = [
  `SELECT lower(email) AS e FROM app_users WHERE lower(email) = ANY($1::text[]) AND role = ANY($2::text[])`,
  // Kanały służb/grup: synchronizacja (chat-channels-sync) nadaje liderom rolę admin.
  `SELECT lower(cp.user_email) AS e FROM conversation_participants cp JOIN conversations c ON c.id = cp.conversation_id
    WHERE c.type = 'ministry' AND cp.role = 'admin' AND lower(cp.user_email) = ANY($1::text[])`,
  `SELECT lower(email) AS e FROM home_group_leaders WHERE lower(email) = ANY($1::text[])`,
  `SELECT lower(user_email) AS e FROM home_group_leaders WHERE lower(user_email) = ANY($1::text[])`,
  `SELECT lower(email) AS e FROM home_group_members WHERE lower(email) = ANY($1::text[])
      AND (role IN ('leader', 'coordinator') OR is_leader IS TRUE)`,
  `SELECT lower(u.email) AS e FROM ministry_memberships mm JOIN app_users u ON u.id = mm.user_id
    WHERE mm.role = 'leader' AND lower(u.email) = ANY($1::text[])`,
  `SELECT lower(email) AS e FROM kids_teachers WHERE is_leader IS TRUE AND lower(email) = ANY($1::text[])`,
  `SELECT lower(email) AS e FROM atmosfera_members WHERE is_leader IS TRUE AND lower(email) = ANY($1::text[])`,
  `SELECT lower(email) AS e FROM mlodziezowka_leaders WHERE lower(email) = ANY($1::text[])`,
];

const leaderCache = new WeakMap(); // db -> Map(email -> { v, at })
export async function leaderEmails(db, emails) {
  const list = [...new Set((emails || []).map(lower).filter(Boolean))];
  const out = new Set();
  if (!list.length) return out;
  let cache = db && typeof db === 'object' ? leaderCache.get(db) : null;
  if (!cache && db && typeof db === 'object') { cache = new Map(); leaderCache.set(db, cache); }
  const todo = [];
  for (const e of list) {
    const hit = cache?.get(e);
    if (hit && Date.now() - hit.at < 60_000) { if (hit.v) out.add(e); } else todo.push(e);
  }
  if (!todo.length) return out;
  const found = await appAdminEmails(db, todo);
  for (const sql of LEADER_SOURCES) {
    const rest = todo.filter((e) => !found.has(e));
    if (!rest.length) break;
    try {
      const { rows } = await db.query(sql, sql.includes('$2') ? [rest, LEADER_ACCOUNT_ROLES] : [rest]);
      for (const r of rows || []) if (r.e) found.add(r.e);
    } catch { /* brak tabeli/kolumny — następne źródło */ }
  }
  for (const e of todo) {
    cache?.set(e, { v: found.has(e), at: Date.now() });
    if (found.has(e)) out.add(e);
  }
  return out;
}

// ── K9: decyzja o rozmowie 1:1 ──────────────────────────────────────────────
export const DM_MESSAGES = {
  off: 'Rozmowy prywatne są wyłączone w tym kościele. Napisz w rozmowie grupowej albo w kanale.',
  leaders: 'Rozmowę prywatną można prowadzić tylko z liderem albo administratorem.',
  minors: 'Ze względu na ochronę dzieci i młodzieży rozmowy prywatne między osobą niepełnoletnią a dorosłą są wyłączone. Skorzystaj z rozmowy grupowej.',
};
export const BLOCKED_MESSAGE = 'Nie możesz wysłać wiadomości do tej osoby.';

// a, b: { isLeader, isMinor, households[] }. Czysta funkcja — testowana.
// Wyjątek od ochrony niepełnoletnich: rodzina — wspólne gospodarstwo domowe w kartotece
// (rodzic ↔ dziecko), inaczej rodzic nie mógłby napisać do własnego dziecka.
export function dmDecision(settings, a, b) {
  const s = settings || {};
  if (s.dm === 'off') return { ok: false, reason: 'off' };
  if (s.dm === 'leaders' && !a?.isLeader && !b?.isLeader) return { ok: false, reason: 'leaders' };
  if (s.protectMinors && !!a?.isMinor !== !!b?.isMinor) {
    const hb = new Set((b?.households || []).map(String));
    const family = (a?.households || []).some((h) => hb.has(String(h)));
    if (!family) return { ok: false, reason: 'minors' };
  }
  return { ok: true };
}

// Stan osób do decyzji (zapytania tylko te, których wymaga polityka).
export async function dmParties(db, settings, emails) {
  const list = [...new Set((emails || []).map(lower).filter(Boolean))];
  const leaders = settings.dm === 'leaders' ? await leaderEmails(db, list) : new Set();
  const facts = settings.protectMinors ? await memberFacts(db, list) : {};
  return Object.fromEntries(list.map((e) => [e, {
    isLeader: leaders.has(e),
    isMinor: !!facts[e]?.isMinor,
    households: facts[e]?.households || [],
  }]));
}

export async function checkDirectPair(db, a, b, settings) {
  const s = settings || (await loadChatSettings(db));
  if (s.dm === 'all' && !s.protectMinors) return { ok: true };
  if (s.dm === 'off') return { ok: false, reason: 'off' };
  const parties = await dmParties(db, s, [a, b]);
  return dmDecision(s, parties[lower(a)], parties[lower(b)]);
}

// Czy `blocker` zablokował `blocked` (brak tabeli przed migracją 088 = nie).
export async function hasBlocked(db, blocker, blocked) {
  try {
    const { rows } = await db.query(
      `SELECT 1 FROM user_blocks WHERE lower(blocker_email) = $1 AND lower(blocked_email) = $2 LIMIT 1`,
      [lower(blocker), lower(blocked)]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// Rozmowa 1:1 me ↔ other: blokada (other zablokował mnie) i polityka. Rzuca 403.
export async function assertDirectAllowed(db, me, other, { onReject } = {}) {
  if (!other || lower(other) === lower(me)) return;
  if (await hasBlocked(db, other, me)) {
    if (onReject) await onReject();
    throw new ApiError(403, BLOCKED_MESSAGE, 'BLOCKED');
  }
  const decision = await checkDirectPair(db, me, other);
  if (!decision.ok) {
    if (onReject) await onReject();
    throw new ApiError(403, DM_MESSAGES[decision.reason] || DM_MESSAGES.off, 'DM_NOT_ALLOWED');
  }
}

// ── K5: @wszyscy ────────────────────────────────────────────────────────────
export const MENTION_ALL = '*';
export function parseMentions(m) {
  if (!m) return [];
  let list = m;
  if (typeof m === 'string') {
    try { list = JSON.parse(m); } catch { return []; }
  }
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
}
export const mentionsAll = (m) => parseMentions(m).includes(MENTION_ALL);
export const MENTION_ALL_MESSAGE = 'Wzmiankę @wszyscy może dodać tylko administrator rozmowy.';

// role — moja rola w rozmowie; w kanałach służb/grup także admin aplikacji (lider = admin kanału).
export async function canMentionAll(db, conv, role, me) {
  if (role === 'admin') return true;
  if (conv?.type === 'ministry') return isAppAdmin(db, me);
  return false;
}

// ── K7: ankiety ─────────────────────────────────────────────────────────────
// Kontrakt: metadata.poll = {question, options[], multiple, anonymous, closes_at}. Starsze
// ankiety mają te pola płasko w metadata — czytamy oba kształty.
export function pollOf(metadata) {
  let m = metadata;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { return null; }
  }
  if (!m || typeof m !== 'object') return null;
  const p = m.poll && typeof m.poll === 'object' ? { ...m, ...m.poll } : m;
  return {
    multiple: p.multiple === true,
    anonymous: p.anonymous === true,
    closesAt: p.closes_at || null,
    options: Array.isArray(p.options) ? p.options : [],
  };
}

export function pollClosed(poll, now = Date.now()) {
  if (!poll?.closesAt) return false;
  const t = Date.parse(poll.closesAt);
  return Number.isFinite(t) && t <= now;
}

export const POLL_CLOSED_MESSAGE = 'Ankieta jest już zamknięta.';

// Redakcja głosów: w ankiecie anonimowej e-mail widzi tylko głosujący. Wiersz bez message_id
// (nie wiadomo, z której ankiety) — e-mail tylko własny (bezpiecznie).
export function redactVotes(rows, anonymousIds, me) {
  const mine = lower(me);
  return (rows || []).map((r) => {
    if (!r || typeof r !== 'object' || !('user_email' in r) || r.user_email == null) return r;
    if (lower(r.user_email) === mine) return r;
    const anon = r.message_id == null ? true : anonymousIds.has(String(r.message_id));
    return anon ? { ...r, user_email: null } : r;
  });
}

export async function anonymousPollIds(db, messageIds) {
  const ids = [...new Set((messageIds || []).filter((x) => x != null).map(String))];
  const out = new Set();
  if (!ids.length) return out;
  try {
    const { rows } = await db.query(`SELECT id::text AS id, metadata FROM messages WHERE id::text = ANY($1::text[])`, [ids]);
    for (const r of rows || []) if (pollOf(r.metadata)?.anonymous) out.add(String(r.id));
  } catch { /* brak — bez redakcji anonimowości (i tak redagujemy wiersze bez message_id) */ }
  return out;
}

// Odczyt głosów nie może filtrować po cudzym e-mailu (inaczej filtr zdradzałby, kto jak
// głosował w ankiecie anonimowej, mimo wymazanej kolumny). Własny e-mail (eq/ilike) — tak.
const unescapeLike = (v) => String(v ?? '').replace(/\\(.)/g, '$1');
export function assertVoteFilters(filters, me) {
  const mine = lower(me);
  const walk = (f) => {
    if (!f) return;
    if (f.type === 'or' && /user_email/i.test(String(f.value ?? ''))) {
      throw new ApiError(403, 'Głosy można filtrować tylko po własnym adresie e-mail');
    }
    if (f.column !== 'user_email') return;
    const ok = (f.type === 'eq' || f.type === 'ilike' || f.type === 'like') && lower(unescapeLike(f.value)) === mine;
    if (!ok) throw new ApiError(403, 'Głosy można filtrować tylko po własnym adresie e-mail');
  };
  for (const f of filters || []) walk(f);
}

// ── K10: zgłoszenia wiadomości ──────────────────────────────────────────────
export const MODERATE_CAPABILITY = 'action:komunikator:moderate';
export const REPORT_STATUSES = ['open', 'resolved'];

// Zakres wierszy: moderator widzi i rozstrzyga wszystko; reszta — tylko własne zgłoszenia.
export function reportScope(user, moderator) {
  const email = lower(user?.email);
  const own = (a, push) => `lower(${a}."reporter_email") = $${push(email)}`;
  if (moderator) return null;
  return { select: own, update: () => 'FALSE', delete: () => 'FALSE', upsertGuard: () => 'FALSE' };
}

const clip = (v, n) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

// Walidacja zapisu zgłoszeń (mutuje q.values). Zgłasza uczestnik rozmowy wiadomości; serwer
// uzupełnia rozmowę, nadawcę i treść (moderator nie jest uczestnikiem — inaczej nie zobaczyłby
// zgłoszonej treści). Rozstrzyga (status) tylko moderator.
export async function enforceReportWrite(q, req, moderator) {
  if (q.table !== 'message_reports' || q.op === 'select') return;
  const db = req.db;
  const me = lower(req.user.email);
  const rows = (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);

  if (q.op === 'delete') {
    if (!moderator) throw new ApiError(403, 'Zgłoszenia usuwa tylko moderator');
    return;
  }
  if (q.op === 'update' || (q.op === 'upsert' && moderator)) {
    if (!moderator) throw new ApiError(403, 'Zgłoszenia rozpatruje tylko moderator');
    const allowed = new Set(['status', 'resolved_by', 'resolved_at', 'resolution_note']);
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!allowed.has(k) && q.op === 'update') throw new ApiError(403, 'W zgłoszeniu można zmienić tylko jego status');
      }
      if ('status' in r) {
        if (!REPORT_STATUSES.includes(r.status)) throw new ApiError(400, 'Nieprawidłowy status zgłoszenia');
        if (r.status === 'resolved') {
          r.resolved_by = req.user.email;
          r.resolved_at = new Date().toISOString();
        } else {
          r.resolved_by = null;
          r.resolved_at = null;
        }
      } else {
        delete r.resolved_by; delete r.resolved_at;
      }
    }
    return;
  }
  if (q.op === 'upsert') throw new ApiError(403, 'Zgłoszenie można tylko dodać');

  // insert
  for (const r of rows) {
    if (!r.message_id) throw new ApiError(400, 'Wskaż wiadomość do zgłoszenia');
    const { rows: m } = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_email, m.content, m.message_type,
              EXISTS (SELECT 1 FROM conversation_participants cp
                       WHERE cp.conversation_id = m.conversation_id AND lower(cp.user_email) = $2) AS member
         FROM messages m WHERE m.id::text = $1`,
      [String(r.message_id), me]);
    const msg = m[0];
    if (!msg || !msg.member) throw new ApiError(403, 'Zgłosić można tylko wiadomość z własnej rozmowy');
    if (lower(msg.sender_email) === me) throw new ApiError(400, 'Nie można zgłosić własnej wiadomości');
    const { rows: dup } = await db.query(
      `SELECT 1 FROM message_reports WHERE message_id::text = $1 AND lower(reporter_email) = $2 AND status = 'open' LIMIT 1`,
      [String(r.message_id), me]).catch(() => ({ rows: [] }));
    if (dup.length) throw new ApiError(409, 'Ta wiadomość została już przez Ciebie zgłoszona', 'ALREADY_REPORTED');
    for (const k of Object.keys(r)) {
      if (!['message_id', 'reason', 'conversation_id', 'reporter_email'].includes(k)) delete r[k];
    }
    if (r.reporter_email && lower(r.reporter_email) !== me) throw new ApiError(403, 'Zgłoszenie wysyłasz pod własnym kontem');
    r.reporter_email = req.user.email;
    r.conversation_id = msg.conversation_id;
    r.reason = clip(r.reason, 1000) || null;
    r.status = 'open';
    r.message_sender_email = msg.sender_email || null;
    r.message_content = clip(msg.content, 4000) || null;
  }
}

// Odbiorcy realtime zgłoszeń: zgłaszający + moderatorzy (admini aplikacji i osoby z uprawnieniem).
export async function reportAudience(db, rows, isModerator) {
  const out = new Set();
  for (const r of rows || []) if (r?.reporter_email) out.add(lower(r.reporter_email));
  try {
    const { rows: users } = await db.query(
      `SELECT id, email, role, is_super_admin FROM app_users WHERE email IS NOT NULL AND is_active IS NOT FALSE`);
    for (const u of users || []) if (await isModerator(u)) out.add(lower(u.email));
  } catch { /* tylko zgłaszający */ }
  return out;
}

// ── K10: blokowanie ─────────────────────────────────────────────────────────
// Normalizacja zapisu user_blocks przed ownership.js (właściciel = blocker_email).
export function normalizeBlockWrite(q, user) {
  if (q.table !== 'user_blocks' || !['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  if (q.op === 'update') throw new ApiError(403, 'Blokadę można tylko dodać albo usunąć');
  const rows = (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
  const me = lower(user.email);
  for (const r of rows) {
    const blocked = lower(r.blocked_email);
    if (!blocked || !blocked.includes('@')) throw new ApiError(400, 'Wskaż osobę do zablokowania');
    if (blocked === me) throw new ApiError(400, 'Nie możesz zablokować samego siebie');
    if (r.blocker_email != null && r.blocker_email !== '' && lower(r.blocker_email) !== me) {
      throw new ApiError(403, 'Blokadę dodajesz tylko dla siebie');
    }
    for (const k of Object.keys(r)) if (!['blocker_email', 'blocked_email', 'created_at'].includes(k)) delete r[k];
    r.blocker_email = me;
    r.blocked_email = blocked;
    r.created_at = new Date().toISOString();
  }
  // Ponowne zablokowanie tej samej osoby nie jest błędem (zwraca istniejący wiersz).
  q.op = 'upsert';
  q.onConflict = 'blocker_email,blocked_email';
  q.ignoreDuplicates = false;
}
