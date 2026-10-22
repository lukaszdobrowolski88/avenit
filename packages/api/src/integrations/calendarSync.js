// Kalendarz Google / Outlook w obie strony (Faza 2, migracja 119).
//
// Kalendarze docelowe (calendar_sync_targets):
//   • osobisty ('user')  — kalendarz „Avenit — <kościół>” na koncie osoby (Google: kalendarz pomocniczy
//     tworzony przez Avenit, zakres calendar.app.created; Microsoft: kalendarz w skrzynce osoby,
//     delegowane Calendars.ReadWrite). Wydarzenia wg calendarSelect.selectEventsForUser.
//   • kościoła ('church') — Microsoft: skrzynka/zasób kościoła (uprawnienie aplikacji Calendars.ReadWrite,
//     połączenie kościoła); Google: kalendarz na koncie administratora (jego połączenie osobiste
//     z zakresem church_calendar), udostępniony domenie. Tylko wydarzenia widoczne dla wszystkich.
//
// Przebieg (syncTarget; worker co minutę — runCalendarSync, „Synchronizuj teraz” — inline):
//   1. kalendarz istnieje (pełne uzgodnienie sprawdza, czy osoba go nie usunęła — wtedy od nowa),
//   2. co ~5 min: zmiany od dostawcy (Google syncToken / Graph delta; 410 → pełna lista od nowa):
//      • własny zapis (etag/changeKey = zapisany po wysłaniu) → pomijamy (bez pętli),
//      • zmiana pól (title/termin/miejsce/opis) przez osobę, która może edytować wydarzenie w Avenit
//        (canEditEvent — jak /api/db) → zapis do Avenit (+ realtime, spotkanie online, kolejka dla
//        innych kalendarzy); kto nie może → przy wysłaniu przywracamy wersję z Avenit i raz
//        powiadamiamy „Zmiany wprowadzaj w Avenit”,
//      • konflikt: last-writer-wins — zmiana w Avenit (kolejka / updated_at po naszym wysłaniu)
//        nowsza niż u dostawcy → wygrywa Avenit,
//      • usunięcie u siebie (osobisty) → „ukryj u mnie” (hidden, bez dalszej synchronizacji);
//        w kalendarzu kościoła → odtworzenie (źródłem jest Avenit), zaimportowane → archiwum w Avenit,
//      • nowe wydarzenia osoby w kalendarzu Avenit → ignorowane (zostają nietknięte); w kalendarzu
//        kościoła z włączonym importem → nowe wydarzenie Avenit (kalendarz ogólny, widoczne dla wszystkich),
//   3. wysłanie: wydarzenia z kolejki (albo wszystkie przy pełnym uzgodnieniu — co 24 h / po zmianie
//      preferencji) — idempotentny upsert po (kalendarz, wydarzenie), skrót treści pomija bez zmian;
//      wydarzenia, które przestały pasować (usunięte, zarchiwizowane, zmiana widoczności, koniec służby)
//      → usunięte u dostawcy.
// Błędy: 429/503 → backoff (Retry-After), błąd tokenu → status 'error' + JEDEN e-mail do właściciela.
import { rsvpBase } from '../fn/rsvp-send.js';
import { loadConnection, loadConnectionById, decryptToken, publicConnection, IntegrationError, msClientCredentialsToken } from './tokens.js';
import { GOOGLE, resolveIntegrationCreds } from './providers.js';
import { apiFor, RateLimitError } from './calendarApi.js';
import {
  buildPayload, diffFields, eventUpdateFrom, importedEventRow, windowBounds, normalizeUserPrefs, normalizeChurchPrefs, isEmailLike,
} from './calendarLogic.js';
import { selectEventsForUser, selectChurchEvents, loadUserRow, EV_COLS } from './calendarSelect.js';
import { enqueueCalendarSync } from './calendarQueue.js';
import { canEditEvent } from '../meetings/events.js';

export const PULL_INTERVAL_MS = 4.5 * 60_000; // worker co minutę → zmiany od dostawcy co ~5 min
export const FULL_INTERVAL_MS = 24 * 3600_000;
export const LEASE_MINUTES = 5;
export const MS_CALENDAR_ROLE = 'Calendars.ReadWrite';
// Najwyżej tyle zapisów u dostawcy na kalendarz w jednym przebiegu (limity API, czas przebiegu
// workera) — reszta w kolejnych minutach (needs_full zostaje).
export let MAX_WRITES_PER_RUN = 300;
export function setMaxWritesPerRun(n) { MAX_WRITES_PER_RUN = n; }
const writes = (stats) => stats.created + stats.updated + stats.deleted;

const lower = (v) => String(v ?? '').trim().toLowerCase();
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0] || null;

export const calendarDisplayName = (churchName) => `Avenit — ${String(churchName || '').trim() || 'kościół'}`.slice(0, 120);

// ── Kontekst ────────────────────────────────────────────────────────────────
// { tenant: { slug, subdomain, name, dbName }, log, now(), deps: { sendEmail, emit, afterEventWrite } }
export function calendarCtx({ tenantSlug, tenantSubdomain, tenantName, tenantDbName, log, deps = {}, now } = {}) {
  return {
    tenant: { slug: tenantSlug, subdomain: tenantSubdomain || tenantSlug, name: tenantName || '', dbName: tenantDbName },
    log: log || (() => {}),
    now: now || (() => Date.now()),
    deps: {
      sendEmail: deps.sendEmail || (async (m) => (await import('../lib/email.js')).sendEmail(m)),
      emit: deps.emit || ((...a) => import('../realtime/hub.js').then((h) => h.emitChange(...a)).catch(() => {})),
      afterEventWrite: deps.afterEventWrite || defaultAfterEventWrite,
    },
  };
}
export function calendarCtxFromRequest(req, deps = {}) {
  return calendarCtx({
    tenantSlug: req.tenant?.slug, tenantSubdomain: req.tenant?.subdomain || req.tenant?.slug, tenantName: req.tenant?.name,
    tenantDbName: req.tenant?.db_name, log: (...a) => req.log?.info?.(a.join(' ')), deps,
  });
}

// Spotkanie online wydarzenia (099) po zmianie terminu z kalendarza — jak po zapisie przez /api/db.
async function defaultAfterEventWrite(db, row, actor, ctx) {
  const [{ syncEventsAfterWrite }, { meetingDeps }] = await Promise.all([import('../meetings/events.js'), import('../meetings/service.js')]);
  syncEventsAfterWrite({
    db, tenantSlug: ctx.tenant.slug, tenant: { ...ctx.tenant }, log: { warn: () => {}, error: () => {}, info: () => {} }, deps: meetingDeps(),
  }, 'update', [row], actor);
}

const eventUrlOf = (ctx, id) => `${rsvpBase(ctx.tenant.subdomain || ctx.tenant.slug)}/wydarzenie/${encodeURIComponent(id)}`;

// ── Kalendarze docelowe ─────────────────────────────────────────────────────
export async function ensureUserTarget(db, conn, { userId, email }) {
  return one(db,
    `INSERT INTO calendar_sync_targets (connection_id, kind, provider, owner_user_id, owner_email, prefs)
     VALUES ($1, 'user', $2, $3, $4, $5::jsonb)
     ON CONFLICT (connection_id, kind) DO UPDATE SET enabled = true, needs_full = true, status = 'active', last_error = NULL,
       error_notified_at = NULL, backoff_until = NULL, owner_email = EXCLUDED.owner_email, updated_at = now()
     RETURNING *`,
    [conn.id, conn.provider, String(userId), lower(email) || null, JSON.stringify(normalizeUserPrefs({}))]);
}

export async function loadUserTarget(db, userId, provider) {
  return one(db,
    `SELECT t.* FROM calendar_sync_targets t JOIN integration_connections c ON c.id = t.connection_id
      WHERE t.kind = 'user' AND t.provider = $1 AND c.scope_kind = 'user' AND c.user_id::text = $2`, [provider, String(userId)]);
}
export async function loadChurchTarget(db, provider) {
  return one(db, `SELECT * FROM calendar_sync_targets WHERE kind = 'church' AND provider = $1`, [provider]);
}

export async function publicTarget(db, t) {
  if (!t) return null;
  const c = await one(db,
    `SELECT count(*) FILTER (WHERE NOT hidden AND external_id IS NOT NULL)::int AS synced, count(*) FILTER (WHERE hidden)::int AS hidden
       FROM calendar_sync_items WHERE target_id = $1`, [t.id]).catch(() => null);
  return {
    id: t.id, kind: t.kind, provider: t.provider, enabled: t.enabled, calendar_name: t.calendar_name || null,
    mailbox: t.mailbox || null, prefs: t.kind === 'user' ? normalizeUserPrefs(t.prefs) : normalizeChurchPrefs(t.prefs),
    status: t.status, last_error: t.last_error || null, last_push_at: t.last_push_at, last_pull_at: t.last_pull_at,
    last_full_at: t.last_full_at, backoff_until: t.backoff_until, owner_email: t.owner_email || null,
    synced: c?.synced ?? 0, hidden: c?.hidden ?? 0, shared_with_domain: t.stats?.shared_with_domain ?? null,
  };
}

// ── Dzierżawa przebiegu ─────────────────────────────────────────────────────
async function takeLease(db, id) {
  const r = await one(db,
    `UPDATE calendar_sync_targets SET lease_until = now() + ($2 || ' minutes')::interval
      WHERE id = $1 AND (lease_until IS NULL OR lease_until < now()) RETURNING *`, [id, String(LEASE_MINUTES)]);
  return r;
}
const releaseLease = (db, id) => db.query(`UPDATE calendar_sync_targets SET lease_until = NULL WHERE id = $1`, [id]).catch(() => {});

// ── Kalendarz u dostawcy ────────────────────────────────────────────────────
async function ensureCalendar(db, api, target, conn, ctx, { verify }) {
  let recreated = false;
  if (target.calendar_id && verify && !(await api.calendarExists(target.calendar_id))) {
    // Osoba usunęła kalendarz u dostawcy — tworzymy od nowa (rozłączenie jest w Avenit).
    await db.query(`DELETE FROM calendar_sync_items WHERE target_id = $1`, [target.id]);
    target.calendar_id = null;
  }
  if (!target.calendar_id) {
    const P = normalizeChurchPrefs(target.prefs);
    const cal = target.kind === 'church' && target.provider === 'microsoft' && P.calendar_mode === 'primary'
      ? await api.primaryCalendar()
      : await api.createCalendar(calendarDisplayName(ctx.tenant.name), 'Wydarzenia z Avenit — zmiany wprowadzaj w Avenit.');
    let shared = null;
    if (target.kind === 'church' && target.provider === 'google' && P.share_domain && conn.external_tenant) {
      shared = await api.shareWithDomain(cal.id, conn.external_tenant).catch(() => false);
    }
    await db.query(
      `UPDATE calendar_sync_targets SET calendar_id = $2, calendar_name = $3, sync_cursor = NULL, needs_full = true,
              stats = stats || $4::jsonb, updated_at = now() WHERE id = $1`,
      [target.id, cal.id, cal.name, JSON.stringify(shared === null ? {} : { shared_with_domain: shared })]);
    Object.assign(target, { calendar_id: cal.id, calendar_name: cal.name, sync_cursor: null });
    recreated = true;
  }
  return { recreated };
}

// ── Wybór wydarzeń ──────────────────────────────────────────────────────────
async function desiredFor(db, target, ctx, ids, win) {
  if (target.kind === 'church') return selectChurchEvents(db, { prefs: target.prefs, eventIds: ids, ...win });
  const user = target.owner_user_id ? await loadUserRow(db, target.owner_user_id) : null;
  if (!user) return new Map();
  return selectEventsForUser(db, { user, prefs: target.prefs, dbName: ctx.tenant.dbName, eventIds: ids, ...win });
}

async function loadItems(db, targetId, ids) {
  const { rows } = ids
    ? await db.query(`SELECT * FROM calendar_sync_items WHERE target_id = $1 AND event_id = ANY($2::text[])`, [targetId, ids])
    : await db.query(`SELECT * FROM calendar_sync_items WHERE target_id = $1`, [targetId]);
  return new Map(rows.map((r) => [r.event_id, r]));
}

async function saveItem(db, targetId, eventId, { externalId, etag, hash, fields, origin = 'avenit' }) {
  await db.query(
    `INSERT INTO calendar_sync_items (target_id, event_id, external_id, etag, last_pushed_hash, pushed_fields, pushed_at, origin)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), $7)
     ON CONFLICT (target_id, event_id) DO UPDATE SET external_id = EXCLUDED.external_id, etag = EXCLUDED.etag,
       last_pushed_hash = EXCLUDED.last_pushed_hash, pushed_fields = EXCLUDED.pushed_fields, pushed_at = now(),
       deleted = false, updated_at = now()`,
    [targetId, String(eventId), externalId, etag || null, hash, JSON.stringify(fields), origin]);
}

// Wydarzenia z mapowaniem, których już nie ma albo są zarchiwizowane (usunięcie z przeglądarki nie
// zwraca wiersza do hooka po zapisie — tu siatka bezpieczeństwa co minutę).
async function orphanEventIds(db, targetId) {
  const { rows } = await db.query(
    `SELECT i.event_id FROM calendar_sync_items i LEFT JOIN events e ON e.id::text = i.event_id
      WHERE i.target_id = $1 AND (e.id IS NULL OR COALESCE((to_jsonb(e)->>'is_archived')::boolean, false))
      LIMIT 500`, [targetId]);
  return rows.map((r) => r.event_id);
}

async function reconcile(db, api, target, ctx, ids, stats) {
  const win = windowBounds(ctx.now());
  const desired = await desiredFor(db, target, ctx, ids, win);
  const items = await loadItems(db, target.id, ids);
  for (const [eid, entry] of desired) {
    if (writes(stats) >= MAX_WRITES_PER_RUN) { stats.incomplete = true; return; }
    const item = items.get(eid);
    if (item?.hidden) continue;
    const url = eventUrlOf(ctx, eid);
    const online = entry.ev.format === 'online' || entry.ev.format === 'hybrid';
    const p = buildPayload(entry.ev, { service: entry.service, eventUrl: url, onlineUrl: online ? url : '' });
    if (!p) continue;
    if (item?.external_id && item.last_pushed_hash === p.hash) { stats.same++; continue; }
    const r = await api.upsertEvent(target.calendar_id, item?.external_id || null, p, { targetId: target.id, eventId: eid });
    await saveItem(db, target.id, eid, { externalId: r.externalId, etag: r.etag, hash: p.hash, fields: p.fields, origin: item?.origin || 'avenit' });
    if (item?.external_id) stats.updated++; else stats.created++;
  }
  const stale = [...items.values()].filter((i) => !desired.has(i.event_id));
  if (!stale.length) return;
  const { rows } = await db.query(
    `SELECT e.id::text AS id, e.date::text AS date, COALESCE((to_jsonb(e)->>'is_archived')::boolean, false) AS is_archived
       FROM events e WHERE e.id::text = ANY($1::text[])`, [stale.map((i) => i.event_id)]);
  const evs = new Map(rows.map((r) => [r.id, r]));
  for (const i of stale) {
    if (writes(stats) >= MAX_WRITES_PER_RUN) { stats.incomplete = true; return; }
    const ev = evs.get(i.event_id);
    // Poza oknem synchronizacji (np. minione) — zostawiamy w kalendarzu bez zmian.
    if (ev && !ev.is_archived && (ev.date < win.from || ev.date > win.to)) continue;
    if (i.external_id && !i.hidden) await api.deleteEvent(target.calendar_id, i.external_id);
    await db.query(`DELETE FROM calendar_sync_items WHERE id = $1`, [i.id]);
    stats.deleted++;
  }
}

// ── Zmiany od dostawcy ──────────────────────────────────────────────────────
let updatedAtCache = new WeakMap();
async function eventsHasUpdatedAt(db) {
  if (updatedAtCache.has(db)) return updatedAtCache.get(db);
  const r = await one(db, `SELECT 1 AS x FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'updated_at' LIMIT 1`).catch(() => null);
  updatedAtCache.set(db, !!r);
  return !!r;
}
export function resetCalendarCaches() { updatedAtCache = new WeakMap(); }

const EVENT_COLS_WRITABLE = { title: '', location: '', description: '', date: '::date', time: '', end_time: '', end_date: '::date' };

async function applyEventUpdate(db, eventId, set, ctx, actor) {
  const cols = Object.keys(set).filter((c) => c in EVENT_COLS_WRITABLE);
  if (!cols.length) return null;
  const params = [String(eventId)];
  const sets = cols.map((c) => { params.push(set[c]); return `${c} = $${params.length}${EVENT_COLS_WRITABLE[c]}`; });
  if (await eventsHasUpdatedAt(db)) sets.push('updated_at = now()');
  const row = await one(db, `UPDATE events SET ${sets.join(', ')} WHERE id::text = $1 RETURNING *`, params);
  if (row) {
    try { ctx.deps.emit(ctx.tenant.slug, 'events', 'update', [row]); } catch { /* realtime nieobowiązkowy */ }
    await Promise.resolve(ctx.deps.afterEventWrite(db, row, actor, ctx)).catch(() => {});
  }
  return row;
}

async function importExternal(db, target, ch, ctx, owner) {
  const set = importedEventRow(ch.fields);
  if (!set) return null;
  const row = await one(db,
    `INSERT INTO events (title, description, location, date, time, end_time, end_date, module_key, created_by, external_source, external_id)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7::date, 'general', $8, $9, $10) RETURNING *`,
    [set.title, set.description ?? null, set.location ?? null, set.date, set.time ?? null, set.end_time ?? null, set.end_date ?? null,
      owner?.email || null, target.provider, ch.externalId]);
  if (!row) return null;
  // Mapowanie od razu (bez duplikatu przy wysłaniu); pusty skrót → wysłanie dopisze link do Avenit.
  await saveItem(db, target.id, String(row.id), { externalId: ch.externalId, etag: ch.etag, hash: null, fields: ch.fields, origin: 'external' });
  try { ctx.deps.emit(ctx.tenant.slug, 'events', 'insert', [row]); } catch { /* */ }
  await enqueueCalendarSync(db, [row.id], 'import');
  return row;
}

async function pullTarget(db, api, target, ctx, dirty, stats) {
  const win = windowBounds(ctx.now());
  let res = await api.listChanges(target.calendar_id, target.sync_cursor, win);
  if (res.reset) { stats.resynced = true; res = await api.listChanges(target.calendar_id, null, win); }
  const { rows: all } = await db.query(`SELECT * FROM calendar_sync_items WHERE target_id = $1`, [target.id]);
  const byExt = new Map(all.filter((i) => i.external_id).map((i) => [i.external_id, i]));
  const repush = new Set();
  const owner = target.owner_user_id ? await loadUserRow(db, target.owner_user_id) : null;
  const church = target.kind === 'church' ? normalizeChurchPrefs(target.prefs) : null;
  const meetCtx = { db, tenant: { dbName: ctx.tenant.dbName }, log: { warn: () => {} } };
  const markRepush = (item, etag) => db.query(
    `UPDATE calendar_sync_items SET last_pushed_hash = NULL, etag = COALESCE($2, etag), updated_at = now() WHERE id = $1`, [item.id, etag || null]);

  for (const ch of res.items) {
    const item = byExt.get(ch.externalId);
    if (!item) {
      // Nowe wydarzenie u dostawcy: osobisty — ignorujemy (zostaje nietknięte); kościoła — import (opcja).
      if (!ch.removed && church?.import_new && !ch.avenitEventId && !ch.recurring && ch.fields) {
        if (await importExternal(db, target, ch, ctx, owner)) stats.imported++;
      }
      continue;
    }
    if (ch.removed) {
      if (target.kind === 'user') {
        await db.query(`UPDATE calendar_sync_items SET hidden = true, external_id = NULL, etag = NULL, last_pushed_hash = NULL, updated_at = now() WHERE id = $1`, [item.id]);
        stats.hidden++;
      } else if (item.origin === 'external') {
        const row = await one(db, `UPDATE events SET is_archived = true WHERE id::text = $1 RETURNING *`, [item.event_id]).catch(() => null);
        await db.query(`DELETE FROM calendar_sync_items WHERE id = $1`, [item.id]);
        if (row) { try { ctx.deps.emit(ctx.tenant.slug, 'events', 'update', [row]); } catch { /* */ } }
        await enqueueCalendarSync(db, [item.event_id], 'external-delete');
      } else {
        await db.query(`UPDATE calendar_sync_items SET external_id = NULL, etag = NULL, last_pushed_hash = NULL, updated_at = now() WHERE id = $1`, [item.id]);
        repush.add(item.event_id);
      }
      continue;
    }
    if (ch.etag && item.etag && ch.etag === item.etag) continue; // nasz własny zapis wraca deltą
    const ev = await one(db, `SELECT ${EV_COLS} FROM events e WHERE e.id::text = $1`, [item.event_id]);
    if (!ev || ev.is_archived || !ch.fields) continue; // wysłanie usunie
    const changed = diffFields(item.pushed_fields, ch.fields, { online: ev.format === 'online' });
    if (!changed.length) {
      await db.query(`UPDATE calendar_sync_items SET etag = $2, updated_at = now() WHERE id = $1`, [item.id, ch.etag]);
      continue;
    }
    if (ch.recurring) { await markRepush(item, ch.etag); repush.add(item.event_id); stats.reverted++; continue; }
    // Konflikt (last-writer-wins): zmiana w Avenit po naszym wysłaniu i nowsza niż zmiana u dostawcy.
    const extAt = ch.updated ? Date.parse(ch.updated) : null;
    const avenitAt = Math.max(
      dirty.get(item.event_id) || 0,
      ev.updated_at && item.pushed_at && Date.parse(ev.updated_at) > Date.parse(item.pushed_at) ? Date.parse(ev.updated_at) : 0);
    if (avenitAt && (!extAt || extAt <= avenitAt)) { await markRepush(item, ch.etag); repush.add(item.event_id); continue; }

    const allowed = !!owner && owner.is_active !== false && owner.email
      && await canEditEvent(meetCtx, { email: owner.email }, item.event_id).catch(() => false);
    const set = allowed ? eventUpdateFrom(ch.fields, changed) : null;
    if (allowed && set && Object.keys(set).length) {
      await applyEventUpdate(db, item.event_id, set, ctx, owner.email);
      await db.query(`UPDATE calendar_sync_items SET etag = $2, last_pushed_hash = NULL, updated_at = now() WHERE id = $1`, [item.id, ch.etag]);
      await enqueueCalendarSync(db, [item.event_id], 'inbound');
      repush.add(item.event_id);
      stats.applied++;
    } else {
      await markRepush(item, ch.etag);
      repush.add(item.event_id);
      stats.reverted++;
      await notifyRevertOnce(db, target, ctx);
    }
  }
  await db.query(`UPDATE calendar_sync_targets SET sync_cursor = $2, last_pull_at = now() WHERE id = $1`, [target.id, res.cursor]);
  target.sync_cursor = res.cursor;
  return { repush };
}

// ── Powiadomienia ───────────────────────────────────────────────────────────
async function insertNotification(db, { email, title, body, link }) {
  if (!email) return;
  await db.query(`INSERT INTO notifications (user_email, type, title, body, link) VALUES ($1, 'calendar_sync', $2, $3, $4)`, [email, title, body, link])
    .catch(() => {});
}
const settingsPath = (target) => (target.kind === 'church' ? '/settings?tab=integrations' : '/profile');

async function notifyRevertOnce(db, target, ctx) {
  if (target.revert_notified_at) return;
  const claimed = await one(db,
    `UPDATE calendar_sync_targets SET revert_notified_at = now() WHERE id = $1 AND revert_notified_at IS NULL RETURNING id`, [target.id]);
  target.revert_notified_at = new Date().toISOString();
  if (!claimed || !target.owner_email) return;
  const name = target.calendar_name || calendarDisplayName(ctx.tenant.name);
  const title = 'Zmiany wprowadzaj w Avenit';
  const body = `Zmieniono wydarzenie w kalendarzu „${name}”, którego nie możesz edytować w Avenit — przywróciliśmy wersję z Avenit. Zmiany wydarzeń wprowadzaj w Avenit (kalendarz synchronizuje się automatycznie).`;
  await insertNotification(db, { email: target.owner_email, title, body, link: '/wydarzenia' });
  await Promise.resolve(ctx.deps.sendEmail({ to: target.owner_email, subject: `Avenit: ${title}`, text: body })).catch(() => {});
}

async function notifyErrorOnce(db, target, ctx, message) {
  if (target.error_notified_at || !target.owner_email) return;
  const claimed = await one(db,
    `UPDATE calendar_sync_targets SET error_notified_at = now() WHERE id = $1 AND error_notified_at IS NULL RETURNING id`, [target.id]);
  if (!claimed) return;
  const where = target.kind === 'church' ? 'Ustawienia → Integracje' : 'Mój profil → Kalendarz Google / Outlook';
  const base = rsvpBase(ctx.tenant.subdomain || ctx.tenant.slug);
  const text = `Synchronizacja kalendarza „${target.calendar_name || calendarDisplayName(ctx.tenant.name)}” została zatrzymana: ${message}\n\nPołącz konto ponownie w Avenit: ${where} (${base}${settingsPath(target)}).`;
  await insertNotification(db, { email: target.owner_email, title: 'Synchronizacja kalendarza zatrzymana', body: text.split('\n')[0], link: settingsPath(target) });
  await Promise.resolve(ctx.deps.sendEmail({ to: target.owner_email, subject: 'Avenit: synchronizacja kalendarza zatrzymana', text })).catch(() => {});
}

async function handleTargetError(db, target, e, ctx) {
  if (e instanceof RateLimitError) {
    await db.query(
      `UPDATE calendar_sync_targets SET backoff_until = now() + ($2 || ' seconds')::interval, needs_full = true, updated_at = now() WHERE id = $1`,
      [target.id, String(e.retryAfterSec)]);
    ctx.log(`calendar-sync ${target.provider}/${target.kind}: ${e.message}`);
    return;
  }
  const tokenProblem = e instanceof IntegrationError || e.code === 'unauthorized' || e.status === 401 || e.status === 403;
  const msg = String(e.message || 'błąd synchronizacji').slice(0, 500);
  await db.query(
    `UPDATE calendar_sync_targets SET status = 'error', last_error = $2, needs_full = true, updated_at = now() WHERE id = $1`, [target.id, msg]);
  ctx.log(`calendar-sync ${target.provider}/${target.kind}: błąd: ${msg}`);
  if (tokenProblem) await notifyErrorOnce(db, target, ctx, msg);
}

// ── Przebieg jednego kalendarza ─────────────────────────────────────────────
// dirty: Map eventId → ms (z kolejki); forceFull/forcePull: „Synchronizuj teraz”, zmiana preferencji.
export async function syncTarget(db, targetIn, ctx, { dirty = new Map(), forceFull = false, forcePull = false } = {}) {
  if (!targetIn?.enabled) return { skipped: 'disabled' };
  const now = ctx.now();
  if (targetIn.backoff_until && Date.parse(targetIn.backoff_until) > now) return { skipped: 'backoff' };
  const target = await takeLease(db, targetIn.id);
  if (!target) return { skipped: 'busy' };
  const stats = { created: 0, updated: 0, deleted: 0, same: 0, applied: 0, reverted: 0, hidden: 0, imported: 0 };
  try {
    const conn = await loadConnectionById(db, target.connection_id);
    if (!conn) return { skipped: 'no_connection' };
    if (target.kind === 'church' && target.provider === 'microsoft' && !(conn.scopes || []).includes(MS_CALENDAR_ROLE)) {
      throw new IntegrationError(`Brak uprawnienia aplikacji ${MS_CALENDAR_ROLE} — dodaj je w rejestracji aplikacji i połącz Microsoft 365 ponownie (zgoda administratora).`, { code: 'missing_role', status: 409 });
    }
    const api = apiFor(db, conn, target);
    let full = forceFull || target.needs_full || !target.last_full_at || now - Date.parse(target.last_full_at) >= FULL_INTERVAL_MS;
    const { recreated } = await ensureCalendar(db, api, target, conn, ctx, { verify: full && !!target.last_full_at });
    if (recreated) full = true;
    const doPull = forcePull || full || !target.last_pull_at || now - Date.parse(target.last_pull_at) >= PULL_INTERVAL_MS;
    const ids = new Set(full ? [] : dirty.keys());
    if (doPull) {
      const { repush } = await pullTarget(db, api, target, ctx, dirty, stats);
      for (const id of repush) ids.add(id);
    }
    if (full) await reconcile(db, api, target, ctx, null, stats);
    else {
      for (const id of await orphanEventIds(db, target.id)) ids.add(id);
      if (ids.size) await reconcile(db, api, target, ctx, [...ids], stats);
    }
    // Limit zapisów w przebiegu — dokończymy pełnym uzgodnieniem w następnej minucie.
    const done = full && !stats.incomplete;
    if (stats.incomplete) await db.query(`UPDATE calendar_sync_targets SET needs_full = true WHERE id = $1`, [target.id]);
    await db.query(
      `UPDATE calendar_sync_targets SET status = 'active', last_error = NULL, error_notified_at = NULL, backoff_until = NULL,
              needs_full = CASE WHEN $2 THEN false ELSE needs_full END, last_full_at = CASE WHEN $2 THEN now() ELSE last_full_at END,
              last_push_at = now(), stats = stats || $3::jsonb, updated_at = now()
        WHERE id = $1`,
      [target.id, done, JSON.stringify({ last: stats })]);
    return { ...stats, full, pulled: doPull };
  } catch (e) {
    await handleTargetError(db, target, e, ctx);
    return { ...stats, error: e.message };
  } finally {
    await releaseLease(db, target.id);
  }
}

// Worker (co minutę): kolejka → wszystkie włączone kalendarze. Błąd jednego nie blokuje pozostałych.
export async function runCalendarSync(db, ctx) {
  let targets;
  try {
    targets = (await db.query(`SELECT * FROM calendar_sync_targets WHERE enabled ORDER BY created_at`)).rows;
  } catch { return { skipped: 'no_tables' }; }
  const { rows: queue } = await db.query(`DELETE FROM calendar_sync_queue RETURNING event_id, target_id, created_at`);
  const dirty = new Map();
  const fullFor = new Set();
  for (const q of queue) {
    if (q.event_id) dirty.set(String(q.event_id), Math.max(dirty.get(String(q.event_id)) || 0, Date.parse(q.created_at) || 0));
    else if (q.target_id) fullFor.add(String(q.target_id));
  }
  const out = [];
  for (const t of targets) {
    const r = await syncTarget(db, t, ctx, { dirty, forceFull: fullFor.has(String(t.id)) }).catch((e) => ({ error: e.message }));
    // Pominięty (trwa „Synchronizuj teraz”) — zmiany z kolejki nie mogą przepaść: pełne uzgodnienie.
    if (r.skipped === 'busy' && dirty.size) {
      await db.query(`UPDATE calendar_sync_targets SET needs_full = true WHERE id = $1`, [t.id]).catch(() => {});
    }
    out.push({ id: t.id, ...r });
  }
  return { targets: out, queued: queue.length };
}

// ── Akcje osoby (fn calendar-sync) ──────────────────────────────────────────
export async function userCalendarStatus(db, userId) {
  const out = {};
  for (const provider of ['google', 'microsoft']) {
    const creds = await resolveIntegrationCreds(db, provider);
    const conn = await loadConnection(db, provider, { scopeKind: 'user', userId }).catch(() => null);
    const target = conn ? await loadUserTarget(db, userId, provider) : null;
    out[provider] = { available: !!(creds.clientId && creds.clientSecret), connection: publicConnection(conn), target: await publicTarget(db, target) };
  }
  return out;
}

export async function saveUserPrefs(db, userId, provider, prefs) {
  const target = await loadUserTarget(db, userId, provider);
  if (!target) throw new IntegrationError('Najpierw połącz kalendarz.', { status: 409, code: 'not_connected' });
  const next = normalizeUserPrefs({ ...normalizeUserPrefs(target.prefs), ...(prefs || {}) });
  await db.query(`UPDATE calendar_sync_targets SET prefs = $2::jsonb, needs_full = true, updated_at = now() WHERE id = $1`, [target.id, JSON.stringify(next)]);
  return next;
}

export async function setTargetEnabled(db, target, enabled) {
  await db.query(`UPDATE calendar_sync_targets SET enabled = $2, needs_full = true, updated_at = now() WHERE id = $1`, [target.id, !!enabled]);
}

async function revokeAndDelete(db, conn) {
  if (conn.provider === 'google' && conn.refresh_token_enc) {
    try {
      const token = await decryptToken(conn.refresh_token_enc);
      await globalThis.fetch(`${GOOGLE.revokeUrl}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
    } catch { /* best-effort */ }
  }
  await db.query(`DELETE FROM integration_connections WHERE id = $1`, [conn.id]);
}

// Rozłączenie kalendarza osobistego: usunięcie kalendarza Avenit u dostawcy (best-effort), kalendarza
// docelowego (mapowania kaskadą) i połączenia osoby — chyba że to samo połączenie obsługuje kalendarz kościoła.
export async function removeUserCalendar(db, userId, provider, { removeRemote = true } = {}) {
  const conn = await loadConnection(db, provider, { scopeKind: 'user', userId });
  if (!conn) return false;
  const target = await loadUserTarget(db, userId, provider);
  if (target?.calendar_id && removeRemote && conn.status !== 'revoked') {
    await apiFor(db, conn, target).deleteCalendar(target.calendar_id).catch(() => {});
  }
  if (target) await db.query(`DELETE FROM calendar_sync_targets WHERE id = $1`, [target.id]);
  const other = await one(db, `SELECT 1 AS x FROM calendar_sync_targets WHERE connection_id = $1 LIMIT 1`, [conn.id]);
  if (!other) await revokeAndDelete(db, conn);
  return true;
}

// ── Kalendarz kościoła (fn workspace-integration) ───────────────────────────
export async function churchCalendarStatus(db, provider, callerId) {
  const target = await loadChurchTarget(db, provider).catch(() => null);
  const tenantConn = provider === 'microsoft' ? await loadConnection(db, 'microsoft').catch(() => null) : null;
  const adminConn = provider === 'google' ? await loadConnection(db, 'google', { scopeKind: 'user', userId: callerId }).catch(() => null) : null;
  return {
    target: await publicTarget(db, target),
    // Microsoft: uprawnienie aplikacji na połączeniu kościoła; Google: połączenie administratora z zakresem kalendarza.
    app_role_ok: provider === 'microsoft' ? !!tenantConn && (tenantConn.scopes || []).includes(MS_CALENDAR_ROLE) : null,
    tenant_connected: provider === 'microsoft' ? !!tenantConn : null,
    admin_connection: provider === 'google' ? publicConnection(adminConn) : null,
    admin_has_scope: provider === 'google' ? !!adminConn && (adminConn.scopes || []).some((s) => /calendar\.app\.created$/.test(s)) : null,
  };
}

export async function saveChurchCalendar(db, provider, body, caller) {
  const s = body || {};
  const current = await loadChurchTarget(db, provider);
  const prefs = normalizeChurchPrefs({ ...normalizeChurchPrefs(current?.prefs), ...(s.prefs || {}) });
  let connId = current?.connection_id || null;
  let mailbox = current?.mailbox || null;
  // Właściciel = osoba, której uprawnieniami oceniamy zmiany z kalendarza (Microsoft: kto skonfigurował;
  // Google: właściciel połączenia).
  let owner = { id: caller.id, email: caller.email };
  if (provider === 'microsoft') {
    const conn = await loadConnection(db, 'microsoft');
    if (!conn) throw new IntegrationError('Najpierw połącz Microsoft 365 (karta powyżej).', { status: 409, code: 'not_connected' });
    if (!(conn.scopes || []).includes(MS_CALENDAR_ROLE)) {
      // Rola mogła dojść po ponownej zgodzie — sprawdź świeżym tokenem aplikacji.
      const creds = await resolveIntegrationCreds(db, 'microsoft');
      const tok = await msClientCredentialsToken(creds, conn.external_tenant).catch(() => null);
      if (!tok?.roles?.includes(MS_CALENDAR_ROLE)) {
        throw new IntegrationError(`Aplikacja nie ma uprawnienia ${MS_CALENDAR_ROLE} w Twojej organizacji — dodaj je w rejestracji aplikacji i kliknij „Połącz ponownie” (zgoda administratora).`, { status: 409, code: 'missing_role' });
      }
      await db.query(`UPDATE integration_connections SET scopes = $2::text[], updated_at = now() WHERE id = $1`, [conn.id, tok.roles]);
    }
    if ('mailbox' in s) {
      const mb = lower(s.mailbox);
      if (!isEmailLike(mb)) throw new IntegrationError('Podaj adres skrzynki kalendarza kościoła (np. kalendarz@kosciol.pl).', { status: 400 });
      mailbox = mb;
    }
    if (!mailbox) throw new IntegrationError('Podaj adres skrzynki kalendarza kościoła.', { status: 400 });
    connId = conn.id;
  } else {
    const conn = await loadConnection(db, 'google', { scopeKind: 'user', userId: caller.id });
    const own = current && conn && current.connection_id === conn.id;
    if (!current || s.use_my_account) {
      if (!conn || !(conn.scopes || []).some((x) => /calendar\.app\.created$/.test(x))) {
        throw new IntegrationError('Najpierw połącz swoje konto Google z dostępem do kalendarza („Połącz konto Google”).', { status: 409, code: 'not_connected' });
      }
      connId = conn.id;
    } else if (!own) {
      // Kalendarz na koncie innego administratora: zmiany z Google ocenia się jego uprawnieniami.
      owner = { id: current.owner_user_id, email: current.owner_email };
    }
  }
  const changedSource = current && (current.connection_id !== connId || (current.mailbox || null) !== mailbox
    || normalizeChurchPrefs(current.prefs).calendar_mode !== prefs.calendar_mode);
  const enabled = 'enabled' in s ? !!s.enabled : (current ? current.enabled : true);
  if (current && changedSource) {
    // Inna skrzynka / konto / tryb — nowy kalendarz od zera (stare mapowania nieaktualne).
    await db.query(`DELETE FROM calendar_sync_items WHERE target_id = $1`, [current.id]);
    await db.query(
      `UPDATE calendar_sync_targets SET connection_id = $2, mailbox = $3, prefs = $4::jsonb, enabled = $5, owner_user_id = $6, owner_email = $7,
              calendar_id = NULL, calendar_name = NULL, sync_cursor = NULL, needs_full = true, status = 'active', last_error = NULL,
              error_notified_at = NULL, updated_at = now() WHERE id = $1`,
      [current.id, connId, mailbox, JSON.stringify(prefs), enabled, String(owner.id), lower(owner.email)]);
  } else if (current) {
    await db.query(
      `UPDATE calendar_sync_targets SET prefs = $2::jsonb, enabled = $3, needs_full = true, owner_user_id = $4, owner_email = $5,
              updated_at = now() WHERE id = $1`,
      [current.id, JSON.stringify(prefs), enabled, String(owner.id), lower(owner.email)]);
  } else {
    await db.query(
      `INSERT INTO calendar_sync_targets (connection_id, kind, provider, owner_user_id, owner_email, mailbox, prefs, enabled)
       VALUES ($1, 'church', $2, $3, $4, $5, $6::jsonb, $7)`,
      [connId, provider, String(owner.id), lower(owner.email), mailbox, JSON.stringify(prefs), enabled]);
  }
  return publicTarget(db, await loadChurchTarget(db, provider));
}

// Usunięcie kalendarza kościoła z Avenit — kalendarz u dostawcy ZOSTAJE (to wspólny zasób kościoła).
export async function removeChurchCalendar(db, provider) {
  const t = await loadChurchTarget(db, provider);
  if (!t) return false;
  await db.query(`DELETE FROM calendar_sync_targets WHERE id = $1`, [t.id]);
  return true;
}
