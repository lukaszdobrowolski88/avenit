// Kalendarz Google / Outlook (Faza 2) — KTÓRE wydarzenia trafiają do którego kalendarza.
//
// Kalendarz osobisty (selectEventsForUser) — te same zasady co kanał iCal i /api/db:
//   • „widzę” = dostęp do events (moduł / zakres służby), kampus, segmenty widoczności
//     (eventVisibilityClause — ta sama klauzula co /api/db), administrator widzi wszystko;
//   • tryb 'all'  — wszystkie widoczne wydarzenia (bez zarchiwizowanych);
//   • tryb 'mine' (domyślny) — z widocznych: moje grupy domowe / służby (kanały służb z Komunikatora +
//     home_group_id + wydarzenia skierowane do mojego audytorium), moje spotkania online, wydarzenia,
//     które organizuję; ORAZ niezależnie od widoczności (zaproszenie skierowane wprost do mnie,
//     jak kanał iCal): moje służby z grafiku (potwierdzone i oczekujące — ownerServiceRows) oraz
//     wydarzenia, na które się zapisałem.
// Kalendarz kościoła (selectChurchEvents) — wyłącznie wydarzenia widoczne dla WSZYSTKICH członków:
//   bez ograniczeń widoczności i bez kampusu, z filtrem modułów/typów.
import { canAccess } from '../dataapi/registry.js';
import { eventVisibilityClause } from '../dataapi/querybuilder.js';
import { loadVisibilityContext } from '../dataapi/eventVisibility.js';
import { isAppAdmin } from '../dataapi/komunikatorPlus.js';
import { ownerServiceRows } from '../fn/ical.js';
import { roleName } from '../fn/send-assignment-invites.js';
import { teamTableFor } from '../lib/assigneeIdentity.js';
import { BUILTIN_TEAMS, HG_PREFIX } from '../fn/chat-channels-sync.js';
import { normalizeUserPrefs, normalizeChurchPrefs } from './calendarLogic.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const MODULE_LABEL = { worship: 'Uwielbienie', media: 'Media', atmosfera: 'Atmosfera', kids: 'Dzieci', homegroups: 'Grupy Domowe', mlodziezowka: 'Młodzieżówka', tlumaczenia: 'Tłumaczenia' };

// Kolumny opcjonalne przez to_jsonb — starszy tenant bez nich nie wywraca zapytania.
export const EV_COLS = `e.id::text AS id, e.title, e.description, to_jsonb(e)->>'details_html' AS details_html,
  e.date::text AS date, to_jsonb(e)->>'time' AS time, to_jsonb(e)->>'end_time' AS end_time, to_jsonb(e)->>'end_date' AS end_date,
  e.location, to_jsonb(e)->>'format' AS format, to_jsonb(e)->>'module_key' AS module_key, to_jsonb(e)->>'event_type' AS event_type,
  to_jsonb(e)->>'campus_id' AS campus_id, e.created_by, COALESCE((to_jsonb(e)->>'is_archived')::boolean, false) AS is_archived,
  to_jsonb(e)->'visibility_segments' AS visibility_segments, to_jsonb(e)->>'home_group_id' AS home_group_id,
  to_jsonb(e)->>'updated_at' AS updated_at, to_jsonb(e)->>'external_source' AS external_source, to_jsonb(e)->>'external_id' AS external_id`;

const UNRESTRICTED = (a) => `(${a}.visibility_segments IS NULL
  OR jsonb_typeof(${a}.visibility_segments) <> 'array'
  OR jsonb_array_length(${a}.visibility_segments) = 0
  OR ${a}.visibility_segments @> '[{"type":"everyone"}]'::jsonb)`;

// Wspólne warunki: okno dat, bez zarchiwizowanych, opcjonalnie lista id.
function baseWhere(push, { from, to, eventIds }) {
  const w = [`e.date >= $${push(from)}::date`, `e.date <= $${push(to)}::date`, `COALESCE((to_jsonb(e)->>'is_archived')::boolean, false) = false`];
  if (eventIds) w.push(`e.id::text = ANY($${push(eventIds.map(String))}::text[])`);
  return w;
}

async function safeRows(db, sql, params) {
  try { return (await db.query(sql, params)).rows; } catch { return []; }
}

export async function loadUserRow(db, userId) {
  const { rows } = await db.query(
    `SELECT id, email, role, COALESCE(is_super_admin, false) AS is_super_admin, campus_id, member_id, COALESCE(is_active, true) AS is_active
       FROM app_users WHERE id::text = $1`, [String(userId)]);
  return rows[0] || null;
}

// Moduły służb i grupy domowe osoby z kanałów Komunikatora (skład utrzymuje chat-channels-sync).
async function myChannelScopes(db, email) {
  const rows = await safeRows(db,
    `SELECT c.ministry_key FROM conversations c JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.type = 'ministry' AND lower(cp.user_email) = $1 AND c.ministry_key IS NOT NULL`, [email]);
  const modules = new Set();
  const groups = new Set();
  const byChannel = new Map(BUILTIN_TEAMS.map((t) => [t.channelKey, t.moduleKey]));
  for (const { ministry_key: k } of rows) {
    if (k.startsWith(HG_PREFIX)) groups.add(k.slice(HG_PREFIX.length));
    else if (k === 'home_groups') modules.add('homegroups');
    else modules.add(byChannel.get(k) || k);
  }
  return { modules, groups };
}

// Moje służby z grafiku (jak kanał iCal): Map eventId → { roles, teams, pending }.
async function myAliases(db, user, teamTypes) {
  const emails = new Set([lower(user.email)]);
  const names = new Set();
  const nm = (v) => lower(v).replace(/\s+/g, ' ');
  const me = (await safeRows(db, `SELECT to_jsonb(u)->>'full_name' AS full_name, to_jsonb(u)->>'member_id' AS member_id FROM app_users u WHERE u.id::text = $1`, [String(user.id)]))[0];
  if (me?.full_name) names.add(nm(me.full_name));
  if (me?.member_id) {
    for (const r of await safeRows(db, `SELECT email FROM members WHERE id::text = $1`, [String(me.member_id)])) if (r.email) emails.add(lower(r.email));
  }
  for (const tt of teamTypes) {
    const table = teamTableFor(tt);
    if (!table) continue;
    for (const r of await safeRows(db, `SELECT to_jsonb(t)->>'email' AS email, to_jsonb(t)->>'full_name' AS full_name FROM "${table}" t WHERE (to_jsonb(t)->>'user_id') = $1`, [String(user.id)])) {
      if (r.email) emails.add(lower(r.email));
      if (r.full_name) names.add(nm(r.full_name));
    }
  }
  return { emails, names };
}

async function myServices(db, user, where, params) {
  const email = lower(user.email);
  const rows = await safeRows(db,
    `SELECT sa.event_id::text AS event_id, sa.team_type, sa.role_key, sa.role_label, sa.assigned_name, sa.assigned_email, sa.status
       FROM schedule_assignments sa JOIN events e ON e.id::text = sa.event_id::text
      WHERE sa.event_id IS NOT NULL AND COALESCE(sa.status, 'pending') <> 'rejected' AND ${where.join(' AND ')}
      LIMIT 5000`, params);
  if (!rows.length) return new Map();
  // Wstępny filtr (tani): tylko wiersze, które MOGĄ być moje — mój adres, adres mojej kartoteki,
  // moje wiersze zespołów (user_id) i moje imię. Dokładne sprawdzenie — ownerServiceRows (jak iCal).
  const al = await myAliases(db, user, [...new Set(rows.map((r) => r.team_type).filter(Boolean))]);
  const candidates = rows.filter((r) => al.emails.has(lower(r.assigned_email))
    || al.names.has(lower(r.assigned_name).replace(/\s+/g, ' ')));
  const mine = await ownerServiceRows(db, candidates, email);
  const labels = new Map((await safeRows(db, `SELECT key, label FROM app_modules`, [])).filter((m) => m.label).map((m) => [m.key, String(m.label).trim()]));
  const out = new Map();
  for (const r of mine) {
    const k = String(r.event_id);
    if (!out.has(k)) out.set(k, { roles: [], teams: [], pending: false });
    const g = out.get(k);
    const role = String(roleName(r.role_key, r.role_label) || '').trim();
    if (role && !g.roles.includes(role)) g.roles.push(role);
    const team = labels.get(r.team_type) || MODULE_LABEL[r.team_type] || r.team_type || '';
    if (team && !g.teams.includes(team)) g.teams.push(team);
    if (r.status !== 'accepted') g.pending = true;
  }
  return out;
}

// → Map eventId → { ev, reasons: Set, service: { roles, teams, pending } | null }
export async function selectEventsForUser(db, { user, prefs, dbName, eventIds = null, from, to }) {
  const out = new Map();
  if (!user || user.is_active === false || !user.email) return out;
  if (eventIds && !eventIds.length) return out;
  const P = normalizeUserPrefs(prefs);
  const me = lower(user.email);
  const add = (ev, reason, service = null) => {
    if (!ev) return;
    const cur = out.get(ev.id) || { ev, reasons: new Set(), service: null };
    cur.reasons.add(reason);
    if (service) cur.service = service;
    out.set(ev.id, cur);
  };

  // 1. Widoczne wydarzenia (jak /api/db i visibleEventFor).
  const access = await canAccess({ pool: db, dbName, table: 'events', op: 'select', user, allowModuleScope: true }).catch(() => ({ ok: false }));
  let visible = [];
  if (access.ok) {
    const admin = !!user.is_super_admin || (await isAppAdmin(db, me).catch(() => false));
    const params = [];
    const push = (v) => { params.push(v); return params.length; };
    const where = baseWhere(push, { from, to, eventIds });
    const vis = await loadVisibilityContext(db, { email: user.email, role: user.role, campus_id: user.campus_id, member_id: user.member_id });
    if (!admin) {
      if (user.campus_id != null) where.push(`((to_jsonb(e)->>'campus_id') = $${push(String(user.campus_id))} OR (to_jsonb(e)->>'campus_id') IS NULL)`);
      where.push(eventVisibilityClause(vis, 'e', push));
      if (access.moduleScope?.modules) where.push(`e.module_key = ANY($${push(access.moduleScope.modules)}::text[])`);
    }
    // „Skierowane do mnie”: wydarzenie z ograniczonym audytorium, do którego należę.
    const targeted = `(NOT ${UNRESTRICTED('e')} AND ${eventVisibilityClause(vis, 'e', push)})`;
    visible = await safeRows(db, `SELECT ${EV_COLS}, ${targeted} AS targeted FROM events e WHERE ${where.join(' AND ')} ORDER BY e.date LIMIT 3000`, params);
    if (P.mode === 'all') {
      for (const ev of visible) add(ev, 'visible');
    } else {
      const scopes = P.my_groups ? await myChannelScopes(db, me) : { modules: new Set(), groups: new Set() };
      const homeGroups = new Set([...(vis.homeGroupIds || []).map(String), ...scopes.groups]);
      const meetingEvents = P.my_meetings ? new Set((await safeRows(db,
        `SELECT DISTINCT m.event_id FROM meetings m
           JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND lower(cp.user_email) = $1
           LEFT JOIN meeting_invites i ON i.meeting_id = m.id AND i.kind = 'member' AND i.email = $1
          WHERE m.status = 'scheduled' AND m.event_id IS NOT NULL AND COALESCE(i.response, 'pending') <> 'declined'`, [me]))
        .map((r) => String(r.event_id))) : new Set();
      for (const ev of visible) {
        if (P.my_groups && (ev.targeted || (ev.home_group_id && homeGroups.has(String(ev.home_group_id)))
          || (ev.module_key && scopes.modules.has(ev.module_key)))) add(ev, 'group');
        if (P.organized && lower(ev.created_by) === me) add(ev, 'organized');
        if (P.my_meetings && meetingEvents.has(ev.id)) add(ev, 'meeting');
      }
    }
  }

  // 2. Zaproszenia wprost do mnie — niezależnie od widoczności (jak kanał iCal).
  const byId = new Map(visible.map((e) => [e.id, e]));
  const need = new Map();
  if (P.my_services) {
    const params = [];
    const push = (v) => { params.push(v); return params.length; };
    const services = await myServices(db, user, baseWhere(push, { from, to, eventIds }), params);
    for (const [id, svc] of services) need.set(id, { ...(need.get(id) || {}), service: svc });
  }
  if (P.registered) {
    const params = [];
    const push = (v) => { params.push(v); return params.length; };
    const where = baseWhere(push, { from, to, eventIds });
    const regs = await safeRows(db,
      `SELECT r.event_id::text AS id FROM event_registrations r JOIN events e ON e.id::text = r.event_id::text
        WHERE lower(r.user_email) = $${push(me)} AND COALESCE(r.status, 'going') NOT IN ('cancelled', 'not_going')
          AND ${where.join(' AND ')}`, params);
    for (const r of regs) need.set(r.id, { ...(need.get(r.id) || {}), registered: true });
  }
  const missing = [...need.keys()].filter((id) => !byId.has(id));
  if (missing.length) {
    for (const ev of await safeRows(db, `SELECT ${EV_COLS} FROM events e WHERE e.id::text = ANY($1::text[])`, [missing])) byId.set(ev.id, ev);
  }
  for (const [id, n] of need) {
    const ev = byId.get(id);
    if (n.service) add(ev, 'service', n.service);
    if (n.registered) add(ev, 'registered');
  }
  return out;
}

// Kalendarz kościoła: wydarzenia dla wszystkich (bez segmentów, bez kampusu), filtr modułów/typów.
export async function selectChurchEvents(db, { prefs, eventIds = null, from, to }) {
  const out = new Map();
  if (eventIds && !eventIds.length) return out;
  const P = normalizeChurchPrefs(prefs);
  const params = [];
  const push = (v) => { params.push(v); return params.length; };
  const where = baseWhere(push, { from, to, eventIds });
  where.push(UNRESTRICTED('e'));
  where.push(`(to_jsonb(e)->>'campus_id') IS NULL`);
  if (P.modules.length) where.push(`COALESCE(NULLIF(to_jsonb(e)->>'module_key', ''), 'general') = ANY($${push(P.modules)}::text[])`);
  if (P.event_types.length) where.push(`(to_jsonb(e)->>'event_type') = ANY($${push(P.event_types)}::text[])`);
  const rows = await safeRows(db, `SELECT ${EV_COLS} FROM events e WHERE ${where.join(' AND ')} ORDER BY e.date LIMIT 5000`, params);
  for (const ev of rows) out.set(ev.id, { ev, reasons: new Set(['church']), service: null });
  return out;
}
