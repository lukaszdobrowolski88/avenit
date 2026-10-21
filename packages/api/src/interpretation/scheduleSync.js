// Grafik służby „Tłumaczenia” → kanały tłumaczenia na żywo przy wydarzeniu (migracja 117).
//
// Decyzja 2026-10-21: tłumacz z grafiku trafia do kanału swojego języka DOPIERO, gdy POTWIERDZI
// przypisanie (schedule_assignments.status = 'accepted'). Odrzucenie albo zdjęcie z grafiku go
// usuwa. Tłumacze dodani ręcznie w karcie „Tłumaczenie na żywo” (source 'manual') zostają —
// synchronizacja dotyka WYŁĄCZNIE wierszy interpretation_interpreters.source = 'schedule'.
//
// Mapowanie: rola grafiku (schedule_assignments.role_key = team_roles.field_key) → kod języka
// kanału: field_key, gdy jest kodem języka (en, uk, pt-br); inaczej ostatni człon klucza
// („tumacz_de” → de) albo nazwy roli („Tłumacz DE” → de). Brak kanału → zakładamy go (etykieta
// I.channelLabel: nazwa języka w tym języku — „English”, „Українська” — jak przy zapisie z karty),
// brak sesji → zakładamy ją.
// Osoba z grafiku ↔ konto: lib/assigneeIdentity (ten sam e-mail, user_id w składzie, kartoteka,
// jedyne konto o tym imieniu) — tylko AKTYWNE konta; bez konta pomijamy (karta pokazuje
// „bez konta w aplikacji”).
//
// Bezpieczeństwo stanu na żywo: nie usuwamy kanału, który nadaje, ani żadnego kanału w sesji
// na żywo; aktywnego tłumacza nadającego kanału nie zdejmujemy (zdejmie go następne uzgodnienie).
// Kanał usuwamy tylko, gdy założył go sync (channels.source = 'schedule') i nie ma już nikogo.
//
// Wywołania (wszystkie idempotentne; błędy logowane, nigdy nie psują zapisu grafiku):
//   • /api/db po zapisie schedule_assignments (dataapi/routes.js: prepare… przed, sync… po),
//   • odpowiedź z linku w mailu i z aplikacji (public/routes.js respondToAssignments),
//   • worker interp-sweep co 10 min dla wydarzeń od wczoraj do +14 dni (siatka bezpieczeństwa).
import { randomUUID } from 'node:crypto';
import { buildWhere } from '../dataapi/querybuilder.js';
import { loadEvent } from '../meetings/events.js';
import { activeAccounts, withTx } from '../meetings/service.js';
import { accountEmailsForAssignee } from '../lib/assigneeIdentity.js';
import { interpRoomNameFor } from '../calls/logic.js';
import * as I from './logic.js';
import { closeRoom as closeLivekitRoom } from './service.js';

export const TEAM_TYPE = 'tlumaczenia';
export const SYNC_ACTOR = 'system:grafik';
export const UPCOMING_DAYS = 14;
const lower = (v) => String(v ?? '').trim().toLowerCase();
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0] || null;

// ── Czyste reguły (testowane) ───────────────────────────────────────────────
// Kod języka z roli grafiku / Służby modułu i etykieta kanału — jedna reguła (logic.js).
export const langForRole = I.langForRole;
export const labelForLang = (code, roleName = '') => I.channelLabel(code, roleName);

// Wiersze grafiku → { desired: Map(lang → Set(e-mail konta)), labels: Map(lang → etykieta nowego
// kanału), pending, noAccount, unmapped }.
// rows: [{ role_key, assigned_name, assigned_email, status, email_sent_at?, accounts: [e-mail aktywnego konta] }]
// roles: Map(field_key → name).
// Wpis osoby: { lang_code, label (dla słuchacza), role_name (Służba — „Tłumacz EN”), name, state }.
// state jak legenda Grafiku (ScheduleTab personStatus): 'pending' (czeka na odpowiedź), 'draft'
// (jeszcze nie powiadomiono), 'noemail' (brak e-maila — bez powiadomienia), 'no_account'
// (potwierdzone, ale bez aktywnego konta w aplikacji).
export function planFromSchedule(rows, roles = new Map()) {
  const desired = new Map();
  const labels = new Map();
  const pending = [];
  const noAccount = [];
  const unmapped = [];
  for (const r of rows || []) {
    const roleName = roles.get(r.role_key) || r.role_label || '';
    const lang = langForRole(r.role_key, roleName);
    const who = {
      lang_code: lang, label: lang ? labelForLang(lang, roleName) : roleName || r.role_key,
      role_name: roleName || (lang ? `Tłumacz ${lang.toUpperCase()}` : r.role_key || ''),
      name: r.assigned_name || r.assigned_email || '',
    };
    if (!lang) { unmapped.push(who); continue; }
    if (r.status === 'pending') {
      pending.push({ ...who, state: !r.assigned_email ? 'noemail' : (r.email_sent_at || r.email_sent_at === undefined ? 'pending' : 'draft') });
      continue;
    }
    if (r.status !== 'accepted') continue;
    const acc = (r.accounts || [])[0];
    if (!acc) { noAccount.push({ ...who, state: 'no_account' }); continue; }
    if (!desired.has(lang)) desired.set(lang, new Set());
    desired.get(lang).add(lower(acc));
    if (!labels.has(lang)) labels.set(lang, who.label);
  }
  return { desired, labels, pending, noAccount, unmapped };
}

// ── Odczyt grafiku ──────────────────────────────────────────────────────────
async function roleNames(db) {
  try {
    const { rows } = await db.query(`SELECT field_key, name FROM team_roles WHERE team_type = $1`, [TEAM_TYPE]);
    return new Map(rows.filter((r) => r.field_key).map((r) => [r.field_key, r.name || '']));
  } catch { return new Map(); }
}

// Wiersze grafiku tłumaczy wydarzenia z kontami (aktywne; ten sam e-mail z grafiku — pierwszy).
export async function scheduleRowsOf(db, eventId) {
  let rows;
  try {
    ({ rows } = await db.query(
      `SELECT role_key, role_label, assigned_name, assigned_email, status, email_sent_at FROM schedule_assignments
        WHERE event_id::text = $1 AND team_type = $2 ORDER BY created_at NULLS LAST, assigned_name`,
      [String(eventId), TEAM_TYPE]));
  } catch (err) {
    // Starszy schemat (bez role_label / email_sent_at): bez stanu „nie powiadomiono” (= czeka).
    if (err?.code === '42703') ({ rows } = await db.query(
      `SELECT role_key, NULL AS role_label, assigned_name, assigned_email, status FROM schedule_assignments
        WHERE event_id::text = $1 AND team_type = $2`, [String(eventId), TEAM_TYPE]));
    else throw err;
  }
  const out = [];
  for (const r of rows) {
    let accounts = [];
    if (r.status === 'accepted') {
      const candidates = await accountEmailsForAssignee(db, { email: r.assigned_email, name: r.assigned_name, teamType: TEAM_TYPE });
      const active = await activeAccounts(db, candidates);
      // Kolejność z accountEmailsForAssignee (najpierw e-mail z grafiku).
      accounts = candidates.map(lower).filter((e) => active.has(e));
    }
    out.push({ ...r, accounts });
  }
  return out;
}

// Stan grafiku do karty (zarządzający/tłumacze): oczekujący i potwierdzeni bez konta.
export async function scheduleStatusOf(db, eventId) {
  const rows = await scheduleRowsOf(db, eventId);
  const plan = planFromSchedule(rows, await roleNames(db));
  return { pending: plan.pending, no_account: plan.noAccount };
}

// ── Uzgodnienie jednego wydarzenia ──────────────────────────────────────────
// ctx: { db, tenantSlug, log, deps } (jak interpretation/service.js). → podsumowanie zmian.
export async function reconcileInterpretersFromSchedule(ctx, eventId, { closeRoom = closeLivekitRoom } = {}) {
  const { db } = ctx;
  const summary = { event_id: String(eventId), session_created: false, channels_added: 0, channels_removed: 0, added: 0, removed: 0, skipped: null };
  const ev = await loadEvent(db, eventId).catch(() => null);
  if (!ev) { summary.skipped = 'no_event'; return summary; }
  if (ev.is_archived) { summary.skipped = 'archived'; return summary; }
  const rows = await scheduleRowsOf(db, ev.id);
  const plan = planFromSchedule(rows, await roleNames(db));
  summary.pending = plan.pending.length;
  summary.no_account = plan.noAccount.length;

  const closed = [];
  await withTx(db, async (tx) => {
    // Jedno uzgodnienie wydarzenia naraz (hak zapisu + worker + odpowiedź z maila).
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`avenit:interp-schedule:${ev.id}`]);
    let session = await one(tx, `SELECT * FROM interpretation_sessions WHERE event_id = $1`, [String(ev.id)]);
    if (!session) {
      if (!plan.desired.size) return;
      if (!ctx.tenantSlug) { summary.skipped = 'no_tenant'; return; }
      const id = randomUUID();
      session = await one(tx,
        `INSERT INTO interpretation_sessions (id, event_id, public_token, original_room_name, created_by)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING RETURNING *`,
        [id, String(ev.id), I.newPublicToken(), interpRoomNameFor(ctx.tenantSlug, id), SYNC_ACTOR])
        || await one(tx, `SELECT * FROM interpretation_sessions WHERE event_id = $1`, [String(ev.id)]);
      summary.session_created = true;
    }
    const sessionLive = session.status === 'live';
    let channels = (await tx.query(`SELECT * FROM interpretation_channels WHERE session_id = $1 ORDER BY sort, created_at`, [session.id])).rows;

    // Brakujące kanały (limit kanałów jak w karcie).
    let sort = channels.reduce((m, c) => Math.max(m, Number(c.sort) || 0), -1);
    for (const lang of plan.desired.keys()) {
      if (channels.some((c) => c.lang_code === lang)) continue;
      if (channels.length >= I.MAX_CHANNELS) break;
      if (!ctx.tenantSlug) { summary.skipped = 'no_tenant'; break; }
      const id = randomUUID();
      const row = await one(tx,
        `INSERT INTO interpretation_channels (id, session_id, lang_code, label, sort, room_name, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'schedule') ON CONFLICT (session_id, lang_code) DO NOTHING RETURNING *`,
        [id, session.id, lang, plan.labels.get(lang) || labelForLang(lang), ++sort, interpRoomNameFor(ctx.tenantSlug, id)]);
      if (row) { channels.push(row); summary.channels_added++; }
    }

    const { rows: assigned } = await tx.query(
      `SELECT channel_id, lower(user_email) AS e, source FROM interpretation_interpreters
        WHERE channel_id = ANY($1::uuid[])`, [channels.map((c) => c.id)]);
    for (const c of channels) {
      const want = plan.desired.get(c.lang_code) || new Set();
      const mine = assigned.filter((a) => a.channel_id === c.id);
      const has = new Set(mine.map((a) => a.e));
      for (const e of want) {
        if (has.has(e)) continue; // także ręczny — zostaje ręczny
        const ins = await tx.query(
          `INSERT INTO interpretation_interpreters (channel_id, user_email, source) VALUES ($1, $2, 'schedule')
           ON CONFLICT (channel_id, user_email) DO NOTHING`, [c.id, e]);
        if (ins.rowCount) summary.added++;
      }
      const active = c.status === 'live' && c.active_interpreter_email ? lower(c.active_interpreter_email) : null;
      const drop = mine.filter((a) => a.source === 'schedule' && !want.has(a.e) && a.e !== active).map((a) => a.e);
      if (drop.length) {
        const del = await tx.query(
          `DELETE FROM interpretation_interpreters WHERE channel_id = $1 AND source = 'schedule' AND lower(user_email) = ANY($2::text[])`,
          [c.id, drop]);
        summary.removed += del.rowCount || 0;
      }
    }

    // Puste kanały z grafiku (bez nikogo, nie nadają, sesja nie na żywo) — usuwamy.
    if (!sessionLive) {
      const { rows: empty } = await tx.query(
        `DELETE FROM interpretation_channels c
          WHERE c.session_id = $1 AND c.source = 'schedule' AND c.status <> 'live'
            AND NOT EXISTS (SELECT 1 FROM interpretation_interpreters i WHERE i.channel_id = c.id)
          RETURNING c.room_name`, [session.id]);
      summary.channels_removed = empty.length;
      closed.push(...empty.map((r) => r.room_name));
    }
    if (summary.added || summary.removed || summary.channels_added || summary.channels_removed) {
      await tx.query(`UPDATE interpretation_sessions SET updated_at = now() WHERE id = $1`, [session.id]);
    }
  });
  if (typeof closeRoom === 'function') for (const room of closed) await closeRoom(ctx, room);
  return summary;
}

// Kilka wydarzeń po kolei; błąd jednego nie zatrzymuje reszty. eventIds — dowolne (dedup).
export async function reconcileEvents(ctx, eventIds, opts = {}) {
  const out = [];
  for (const id of [...new Set((eventIds || []).filter((v) => v !== null && v !== undefined && v !== '').map(String))]) {
    try {
      out.push(await reconcileInterpretersFromSchedule(ctx, id, opts));
    } catch (err) {
      if (err?.code === '42P01' || err?.code === '42703') return out; // tenant bez migracji 116/117
      ctx.log?.warn?.({ err }, `interpretation: synchronizacja grafiku (wydarzenie ${id})`);
    }
  }
  return out;
}

// ── Haki zapisu /api/db (dataapi/routes.js) ─────────────────────────────────
// Przed update/delete: wydarzenia wierszy grafiku tłumaczy, których dotyczy zapis (te same
// filtry co zapytanie). Usunięcie z przeglądarki nie zwraca wierszy — dlatego odczyt PRZED.
export async function prepareScheduleSync(db, q) {
  if (q?.table !== 'schedule_assignments' || (q.op !== 'update' && q.op !== 'delete')) return null;
  if (!q.filters?.length) return null;
  try {
    const params = [];
    const where = buildWhere(q.filters, params, 't', []);
    params.push(TEAM_TYPE);
    const { rows } = await db.query(
      `SELECT DISTINCT t.event_id FROM schedule_assignments t${where} AND t.team_type = $${params.length} AND t.event_id IS NOT NULL`, params);
    return rows.map((r) => String(r.event_id));
  } catch {
    return null;
  }
}

// Wydarzenia do uzgodnienia po zapisie: odczyt przed + zwrócone wiersze + wstawiane wartości.
export function eventsAfterWrite(q, prep, rows) {
  if (q?.table !== 'schedule_assignments' || q.op === 'select') return [];
  const ids = new Set(prep || []);
  const add = (r) => { if (r && r.team_type === TEAM_TYPE && r.event_id != null) ids.add(String(r.event_id)); };
  (rows || []).forEach(add);
  if (q.op === 'insert' || q.op === 'upsert') (Array.isArray(q.values) ? q.values : [q.values]).forEach(add);
  return [...ids];
}

// Fire-and-forget po zapisie (nie blokuje odpowiedzi).
export function syncScheduleAfterWrite(ctx, q, prep, rows, opts = {}) {
  const ids = eventsAfterWrite(q, prep, rows);
  if (!ids.length) return Promise.resolve([]);
  return reconcileEvents(ctx, ids, opts).catch((err) => { ctx.log?.warn?.({ err }, 'interpretation: sync grafiku'); return []; });
}

// Odpowiedź na zaproszenie (mail/aplikacja): wiersze zmienione przez respondToAssignments.
export function syncAfterResponse(ctx, rows, opts = {}) {
  const ids = (rows || []).filter((r) => r?.team_type === TEAM_TYPE && r.event_id != null).map((r) => String(r.event_id));
  if (!ids.length) return Promise.resolve([]);
  return reconcileEvents(ctx, ids, opts).catch((err) => { ctx.log?.warn?.({ err }, 'interpretation: sync odpowiedzi'); return []; });
}

// ── Worker: nadchodzące wydarzenia ──────────────────────────────────────────
// Wydarzenia od wczoraj do +days z grafikiem tłumaczy albo z tłumaczami z grafiku (zdjęcie osoby
// z grafiku usuwa wiersz schedule_assignments — sesję też trzeba uzgodnić).
export async function upcomingEventIds(db, { days = UPCOMING_DAYS } = {}) {
  const { rows } = await db.query(
    `SELECT DISTINCT e.id::text AS id FROM events e
      WHERE e.date >= (CURRENT_DATE - 1) AND e.date <= (CURRENT_DATE + $2::int)
        AND (EXISTS (SELECT 1 FROM schedule_assignments sa WHERE sa.event_id::text = e.id::text AND sa.team_type = $1)
          OR EXISTS (SELECT 1 FROM interpretation_sessions s
                       JOIN interpretation_channels c ON c.session_id = s.id
                       JOIN interpretation_interpreters i ON i.channel_id = c.id
                      WHERE s.event_id = e.id::text AND (i.source = 'schedule' OR c.source = 'schedule')))
      LIMIT 500`, [TEAM_TYPE, days]);
  return rows.map((r) => r.id);
}

const lastRun = new Map(); // tenant → czas ostatniego uzgodnienia (worker co minutę, uzgodnienie co 10 min)
export const RECONCILE_EVERY_MS = 10 * 60 * 1000;
export async function reconcileUpcoming(ctx, { now = Date.now(), force = false, ...opts } = {}) {
  const key = ctx.tenant?.dbName || ctx.tenantSlug || 'default';
  if (!force && now - (lastRun.get(key) || 0) < RECONCILE_EVERY_MS) return null;
  lastRun.set(key, now);
  const ids = await upcomingEventIds(ctx.db, opts);
  return reconcileEvents(ctx, ids, opts);
}
