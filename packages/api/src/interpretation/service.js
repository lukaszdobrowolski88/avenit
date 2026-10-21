// Tłumaczenie na żywo przy wydarzeniu (migracja 116) — logika serwera fn interp-*, webhook LiveKit
// (pokoje avi_*) i sprzątanie w workerze.
//
// Model: wydarzenie → sesja (publiczny token linku/QR, stan idle/live/ended) → kanały językowe
// (pokój LiveKit na kanał, aktywny tłumacz) → przypisani tłumacze (konta). Opcjonalny kanał
// „Oryginał”: nadawanie z miksera (stół akustyka), tłumacze słyszą go w konsoli. Bez nagrywania.
//
// Kto co może:
//   • zarządza (kanały, tłumacze, link, zakończenie): action:calendar:manage_interpretation albo
//     administrator — i musi WIDZIEĆ wydarzenie (visibleEventFor, jak /api/db);
//   • konsola tłumacza / przejęcie mikrofonu: przypisany tłumacz kanału (albo zarządzający);
//   • nadawanie „Oryginału”: zarządzający albo tłumacz którejkolwiek sesji wydarzenia;
//   • słucha: każdy z publicznym linkiem (bez konta) albo zalogowany, który widzi wydarzenie.
// Słuchacz: tożsamość listener:<hex>, ukryty (hidden), bez publikowania i kanału danych, token 4 h.
// Pokoje zakładamy JAWNIE (createRoom, 500 osób) przed wydaniem tokenu — globalny limit LiveKit
// (max_participants 40) dotyczy pokoi zakładanych samym wejściem uczestnika.
//
// ── API funkcji (web i mobilka; POST /api/fn/<nazwa>, JSON) ─────────────────────────────────────
// Z logowaniem:
//   interp-session-get    { event_id }
//     → { event: { id, title, date, time, end_time, end_date }, can_manage, my_channels: [channel_id],
//         session: null | {
//           id, status: 'idle'|'live'|'ended', original_enabled, original_status: 'idle'|'live',
//           channels: [{ id, lang_code, label, sort, status: 'idle'|'live', mine,
//                        active_interpreter_email?, active_interpreter_name?, interpreters?: [{ email, name }] }],
//           public_token?, public_path?, public_url? },          // ? — tylko zarządzający (tłumacze: osoby)
//         presets?: [{ lang_code, label }], people?: [{ email, name }], church_name? }   // tylko zarządzający
//   interp-session-upsert { event_id, enable?, remove?, channels?: [{ id?, lang_code, label, interpreters: [email] }],
//                           original_enabled?, regenerate_token?, end?, reopen? }  → jak interp-session-get
//   interp-interpreter-join { channel_id }
//     → { url, token, identity, channel: { id, lang_code, label, status, active_interpreter_email, active_interpreter_name },
//         partners: [{ email, name }], original: null | { token }, session_status }
//   interp-take-over      { channel_id }               → { channel, muted: email|null }
//   interp-release        { channel_id, force? }       → { channel }
//   interp-stats          { event_id }
//     → { status, total_listeners, original: { enabled, status, publishing },
//         channels: [{ id, status, active_interpreter_email, active_interpreter_name, listeners: number|null, publishing }] }
//   interp-original-join  { event_id }                 → { url, token, identity }
//   interp-member-listen  { event_id, channel_id }     → { url, token, channel: { id, lang_code, label, live } }
// Publiczne (strona /tlumaczenie/<token>, tenant z Host, limit per IP — duży: cała sala za jednym NAT):
//   interp-public-info    { token }
//     → { church_name, event: { title, date, time, end_time, starts_at, ends_at }, status,
//         channels: [{ id, lang_code, label, live }] }
//   interp-listen         { token, channel_id }        → { url, token, channel: { id, lang_code, label, live } }
// Błędy: { error, code } — 404 INTERP_NOT_FOUND / CHANNEL_NOT_FOUND / NOT_FOUND, 403 INTERP_FORBIDDEN /
// NOT_INTERPRETER, 409 CHANNEL_NOT_LIVE (słuchacz: odpytuj info co 10 s i połącz, gdy live) /
// ORIGINAL_DISABLED, 410 INTERP_ENDED / INTERP_UNAVAILABLE, 503 calls_disabled / LIVEKIT_UNAVAILABLE.
// Konsola: metadane pokoju kanału = {"active": "<e-mail aktywnego tłumacza>"|null} (RoomMetadataChanged).
import { randomUUID } from 'node:crypto';
import { ApiError } from '../dataapi/querybuilder.js';
import { loadGrants } from '../dataapi/registry.js';
import { isAppAdmin } from '../dataapi/komunikatorPlus.js';
import { can } from '@avenit/shared/src/permissions/resolve.js';
import { visibleEventFor, loadEvent } from '../meetings/events.js';
import { activeAccounts, namesOf, withTx } from '../meetings/service.js';
import { eventTimes } from '../meetings/logic.js';
import { churchName } from '../calls/guests.js';
import { getLivekit, CALLS_DISABLED } from '../calls/livekit.js';
import { interpRoomNameFor } from '../calls/logic.js';
import { rsvpBase } from '../fn/rsvp-send.js';
import * as I from './logic.js';

export const MANAGE_CAPABILITY = 'action:calendar:manage_interpretation';
const lower = (v) => String(v ?? '').trim().toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0] || null;
const warn = (ctx, err, msg) => ctx.log?.warn?.({ err }, `interpretation: ${msg}`);

export const MESSAGES = {
  notFound: 'Ten link do tłumaczenia nie istnieje.',
  ended: 'Tłumaczenie zostało zakończone.',
  unavailable: 'Tłumaczenie nie jest teraz dostępne.',
  notLive: 'Tłumaczenie na ten język jeszcze się nie zaczęło.',
  forbidden: 'Tłumaczeniem zarządza osoba z uprawnieniem „Zarządzaj tłumaczeniem na żywo”.',
  notInterpreter: 'Do konsoli tego kanału wchodzi przypisany tłumacz.',
  livekit: 'Serwer połączeń nie odpowiada. Spróbuj za chwilę.',
};

// ── Zależności i kontekst ───────────────────────────────────────────────────
let overrides = null;
export function setInterpDeps(o) { overrides = o; } // testy (null = przywróć)
export function interpDeps(extra = {}) {
  return { livekit: getLivekit(), ...(overrides || {}), ...extra };
}

export function interpCtxFromRequest(req) {
  return {
    db: req.db,
    tenantSlug: req.tenant?.slug,
    tenant: {
      name: req.tenant?.name || '', slug: req.tenant?.slug, subdomain: req.tenant?.subdomain || req.tenant?.slug,
      dbName: req.tenant?.db_name, blocked: !!req.tenantBlocked,
    },
    log: req.log,
    deps: interpDeps(),
  };
}

function sendError(reply, err) {
  return reply.code(err.status).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
}

// Handler fn z logowaniem: wynik albo { error, code }.
export async function runInterpFn(req, reply, action) {
  try {
    return reply.send(await action(interpCtxFromRequest(req), req.user, req.body || {}));
  } catch (err) {
    if (err instanceof ApiError || (err && Number.isInteger(err.status))) return sendError(reply, err);
    if (err?.code === '42P01') return reply.code(503).send({ error: 'Tłumaczenie na żywo nie jest jeszcze dostępne na tym serwerze.', code: 'INTERP_UNAVAILABLE' });
    req.log?.error?.({ err }, 'interpretation: błąd');
    return reply.code(500).send({ error: 'Nie udało się obsłużyć tłumaczenia. Spróbuj ponownie.' });
  }
}

// Publiczne fn (bez logowania): bez szczegółów serwera.
export async function runPublicInterpFn(req, reply, action) {
  try {
    if (!req.db) return reply.code(404).send({ error: MESSAGES.notFound, code: 'INTERP_NOT_FOUND' });
    return reply.send(await action(interpCtxFromRequest(req), req.body || {}));
  } catch (err) {
    if (err instanceof ApiError || (err && Number.isInteger(err.status))) return sendError(reply, err);
    if (err?.code === '42P01') return reply.code(404).send({ error: MESSAGES.notFound, code: 'INTERP_NOT_FOUND' });
    req.log?.error?.({ err }, 'interpretation: błąd (publiczne)');
    return reply.code(500).send({ error: 'Coś poszło nie tak. Spróbuj ponownie za chwilę.' });
  }
}

function assertEnabled(ctx) {
  if (!ctx.deps?.livekit?.enabled) throw new ApiError(503, CALLS_DISABLED.error, CALLS_DISABLED.code);
}

// ── Odczyt ──────────────────────────────────────────────────────────────────
export async function sessionOfEvent(db, eventId) {
  return one(db, `SELECT * FROM interpretation_sessions WHERE event_id = $1`, [String(eventId)]);
}
async function sessionById(db, id) {
  return one(db, `SELECT * FROM interpretation_sessions WHERE id = $1`, [String(id)]);
}
async function sessionByToken(db, token) {
  if (!I.isPublicToken(token)) return null;
  return one(db, `SELECT * FROM interpretation_sessions WHERE public_token = $1`, [String(token)]);
}
export async function channelsOf(db, sessionId) {
  return (await db.query(`SELECT * FROM interpretation_channels WHERE session_id = $1 ORDER BY sort, created_at`, [sessionId])).rows;
}
async function channelById(db, id) {
  if (!UUID_RE.test(String(id ?? ''))) return null;
  return one(db, `SELECT * FROM interpretation_channels WHERE id = $1`, [String(id)]);
}
async function interpretersOf(db, channelIds) {
  const out = new Map(channelIds.map((id) => [id, []]));
  if (!channelIds.length) return out;
  const { rows } = await db.query(
    `SELECT channel_id, lower(user_email) AS e FROM interpretation_interpreters WHERE channel_id = ANY($1::uuid[]) ORDER BY created_at`, [channelIds]);
  for (const r of rows) out.get(r.channel_id)?.push(r.e);
  return out;
}
async function myChannelIds(db, sessionId, me) {
  if (!sessionId || !me) return new Set();
  const { rows } = await db.query(
    `SELECT c.id FROM interpretation_interpreters i JOIN interpretation_channels c ON c.id = i.channel_id
      WHERE c.session_id = $1 AND lower(i.user_email) = $2`, [sessionId, me]);
  return new Set(rows.map((r) => r.id));
}
async function isInterpreterOf(db, channelId, me) {
  return !!(await one(db, `SELECT 1 FROM interpretation_interpreters WHERE channel_id = $1 AND lower(user_email) = $2`, [channelId, me]));
}

async function peopleOf(db) {
  const { rows } = await db.query(
    `SELECT lower(email) AS email, COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS name
       FROM app_users WHERE COALESCE(is_active, true) = true AND email IS NOT NULL AND email <> ''
      ORDER BY 2 LIMIT 3000`);
  const seen = new Set();
  return rows.filter((r) => !seen.has(r.email) && seen.add(r.email));
}

// ── Uprawnienia ─────────────────────────────────────────────────────────────
// Zarządzanie: superadmin / rola administratora albo capability. Tryb legacy (bez grantów) —
// tylko administrator (nie każdy zalogowany, jak przy requireCapability).
export async function canManageInterpretation(ctx, email) {
  const me = lower(email);
  const u = await one(ctx.db, `SELECT id, role, is_super_admin, is_active FROM app_users WHERE lower(email) = $1 LIMIT 1`, [me]);
  if (!u || u.is_active === false) return false;
  if (u.is_super_admin) return true;
  const { grants, adminRoles } = await loadGrants(ctx.db, ctx.tenant?.dbName);
  if (adminRoles?.has?.(u.role) || (await isAppAdmin(ctx.db, me))) return true;
  if (grants === null) return false;
  return can(grants, { role: u.role, userId: String(u.id) }, MANAGE_CAPABILITY);
}

// Dostęp do tłumaczenia wydarzenia: widzi wydarzenie albo jest tłumaczem jego sesji.
async function eventAccess(ctx, user, eventId) {
  const { db } = ctx;
  const me = lower(user?.email);
  if (!me) throw new ApiError(401, 'Brak autoryzacji', 'UNAUTHORIZED');
  if (eventId === undefined || eventId === null || String(eventId).trim() === '') throw new ApiError(400, 'Brak wydarzenia', 'BAD_REQUEST');
  let ev = null;
  try {
    ({ ev } = await visibleEventFor(ctx, user, eventId));
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }
  const session = await sessionOfEvent(db, ev?.id ?? eventId);
  const mine = session ? await myChannelIds(db, session.id, me) : new Set();
  if (!ev && !mine.size) throw new ApiError(404, 'Nie znaleziono wydarzenia', 'NOT_FOUND');
  const visible = !!ev;
  if (!ev) ev = await loadEvent(db, eventId);
  if (!ev) throw new ApiError(404, 'Nie znaleziono wydarzenia', 'NOT_FOUND');
  const manage = visible && (await canManageInterpretation(ctx, me));
  return { me, ev, session, mine, manage, visible };
}

async function assertManager(ctx, user, eventId) {
  const a = await eventAccess(ctx, user, eventId);
  if (!a.manage) throw new ApiError(403, MESSAGES.forbidden, 'INTERP_FORBIDDEN');
  return a;
}

// Konsola kanału: przypisany tłumacz albo zarządzający (widzący wydarzenie).
async function channelAccess(ctx, user, channelId) {
  const { db } = ctx;
  const me = lower(user?.email);
  const ch = await channelById(db, channelId);
  if (!ch) throw new ApiError(404, 'Nie znaleziono kanału tłumaczenia', 'CHANNEL_NOT_FOUND');
  const session = await sessionById(db, ch.session_id);
  if (!session) throw new ApiError(404, 'Nie znaleziono kanału tłumaczenia', 'CHANNEL_NOT_FOUND');
  const interpreter = await isInterpreterOf(db, ch.id, me);
  let manage = false;
  if (!interpreter) {
    try {
      await visibleEventFor(ctx, user, session.event_id);
      manage = await canManageInterpretation(ctx, me);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
    if (!manage) throw new ApiError(403, MESSAGES.notInterpreter, 'NOT_INTERPRETER');
  }
  return { me, ch, session, interpreter, manage };
}

// ── Widoki ──────────────────────────────────────────────────────────────────
const eventSummary = (ev) => ({
  id: String(ev.id), title: ev.title || '', date: ev.date || null, time: ev.time || null,
  end_time: ev.end_time || null, end_date: ev.end_date || null,
});
export const publicChannel = (c) => ({ id: c.id, lang_code: c.lang_code, label: c.label, live: c.status === 'live' });
const publicUrl = (ctx, token) => `${rsvpBase(ctx.tenant?.subdomain || ctx.tenantSlug)}${I.publicPath(token)}`;

function channelOut(c, names) {
  const e = c.active_interpreter_email ? lower(c.active_interpreter_email) : null;
  return {
    id: c.id, lang_code: c.lang_code, label: c.label, status: c.status,
    active_interpreter_email: e, active_interpreter_name: e ? names.get(e) || e : null,
  };
}

async function sessionView(ctx, { ev, session, manage, mine }) {
  const { db } = ctx;
  const out = { event: eventSummary(ev), can_manage: !!manage, my_channels: [...mine], session: null };
  if (manage) {
    out.presets = I.LANGUAGE_PRESETS;
    out.people = await peopleOf(db);
    out.church_name = await churchName(db, ctx.tenant?.name); // plakat do druku
  }
  if (!session) return out;
  const channels = await channelsOf(db, session.id);
  const showPeople = !!manage || mine.size > 0;
  const interp = showPeople ? await interpretersOf(db, channels.map((c) => c.id)) : new Map();
  const names = showPeople
    ? await namesOf(db, [...[...interp.values()].flat(), ...channels.map((c) => c.active_interpreter_email)])
    : new Map();
  out.session = {
    id: session.id,
    status: session.status,
    original_enabled: !!session.original_enabled,
    original_status: session.original_status,
    channels: channels.map((c) => ({
      ...(showPeople ? channelOut(c, names) : { id: c.id, lang_code: c.lang_code, label: c.label, status: c.status }),
      sort: c.sort,
      mine: mine.has(c.id),
      ...(showPeople ? { interpreters: (interp.get(c.id) || []).map((e) => ({ email: e, name: names.get(e) || e })) } : {}),
    })),
  };
  if (manage) {
    out.session.public_token = session.public_token;
    out.session.public_path = I.publicPath(session.public_token);
    out.session.public_url = publicUrl(ctx, session.public_token);
  }
  return out;
}

// ── LiveKit: pokoje ─────────────────────────────────────────────────────────
const ensured = new Map(); // pokój → czas założenia (krótko — pokój mógł się zamknąć)
const ENSURE_CACHE_MS = 5_000; // createRoom NIE zmienia limitu już istniejącego pokoju — zakładamy go zawsze przed wejściem
export function forgetRoom(room) { ensured.delete(room); }

async function ensureRoom(ctx, room, metadata) {
  const t = ensured.get(room);
  if (t && Date.now() - t < ENSURE_CACHE_MS) return;
  const lk = ctx.deps?.livekit;
  if (typeof lk?.createRoom !== 'function') return;
  const ok = await lk.createRoom({
    name: room,
    maxParticipants: I.ROOM_MAX_PARTICIPANTS,
    emptyTimeout: I.ROOM_EMPTY_TIMEOUT,
    departureTimeout: I.ROOM_DEPARTURE_TIMEOUT,
    ...(metadata !== undefined ? { metadata } : {}),
  });
  if (ok === false) throw new ApiError(503, MESSAGES.livekit, 'LIVEKIT_UNAVAILABLE');
  ensured.set(room, Date.now());
}

async function closeRoom(ctx, room) {
  forgetRoom(room);
  try { await ctx.deps?.livekit?.deleteRoom?.(room); } catch (err) { warn(ctx, err, `zamknięcie pokoju ${room}`); }
}

const partsCache = new Map(); // pokój → { at, parts } — licznik odpytywany co 10 s przez kilka konsol
async function participantsOf(ctx, room, { fresh = false } = {}) {
  const lk = ctx.deps?.livekit;
  if (!lk?.enabled || typeof lk.listParticipants !== 'function') return null;
  const c = partsCache.get(room);
  if (!fresh && c && Date.now() - c.at < 5_000) return c.parts;
  const parts = await lk.listParticipants(room);
  if (parts) partsCache.set(room, { at: Date.now(), parts });
  return parts;
}

async function setMetadata(ctx, ch) {
  try { await ctx.deps?.livekit?.updateRoomMetadata?.(ch.room_name, I.roomMetadata(ch)); } catch (err) { warn(ctx, err, 'metadane pokoju'); }
}

// Wycisza mikrofon osoby w pokoju (zmiana tłumacza). Zwraca liczbę wyciszonych ścieżek.
async function muteMic(ctx, room, identity) {
  const parts = await participantsOf(ctx, room, { fresh: true });
  let n = 0;
  for (const t of I.micTracksOf(parts, identity)) {
    if (await ctx.deps.livekit.mutePublishedTrack?.(room, lower(identity), t.sid, true)) n++;
  }
  return n;
}

// ── Sesja: odczyt i zarządzanie ─────────────────────────────────────────────
// interp-session-get { event_id }
export async function getSession(ctx, user, body = {}) {
  const a = await eventAccess(ctx, user, body.event_id);
  return sessionView(ctx, a);
}

async function createSession(ctx, ev, me) {
  const id = randomUUID();
  const row = await one(ctx.db,
    `INSERT INTO interpretation_sessions (id, event_id, public_token, original_room_name, created_by)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING RETURNING *`,
    [id, String(ev.id), I.newPublicToken(), interpRoomNameFor(ctx.tenantSlug, id), me]);
  return row || sessionOfEvent(ctx.db, ev.id);
}

// Koniec sesji: stan ended, kanały wyłączone, pokoje zamknięte (rozłącza słuchaczy i tłumaczy).
export async function endSession(ctx, session) {
  const ended = await one(ctx.db,
    `UPDATE interpretation_sessions SET status = 'ended', ended_at = now(), original_status = 'idle', updated_at = now()
      WHERE id = $1 AND status <> 'ended' RETURNING *`, [session.id]);
  const channels = await channelsOf(ctx.db, session.id);
  await ctx.db.query(
    `UPDATE interpretation_channels SET status = 'idle', active_interpreter_email = NULL, updated_at = now() WHERE session_id = $1`, [session.id]);
  for (const c of channels) await closeRoom(ctx, c.room_name);
  await closeRoom(ctx, session.original_room_name);
  return !!ended;
}

async function replaceChannels(ctx, session, input) {
  const { db } = ctx;
  let list;
  try {
    list = I.normalizeChannels(input);
  } catch (err) {
    throw new ApiError(400, err.message, err.code || 'BAD_CHANNELS');
  }
  const wanted = [...new Set(list.flatMap((c) => c.interpreters))];
  const accounts = await activeAccounts(db, wanted);
  const unknown = wanted.find((e) => !accounts.has(e));
  if (unknown) throw new ApiError(400, `Tłumaczem może być tylko osoba z aktywnym kontem w aplikacji: ${unknown}`, 'UNKNOWN_INTERPRETER');

  const existing = await channelsOf(db, session.id);
  const used = new Set();
  const pairs = list.map((c) => {
    const match = existing.find((e) => !used.has(e.id) && c.id && e.id === c.id)
      || existing.find((e) => !used.has(e.id) && e.lang_code === c.lang_code);
    if (match) used.add(match.id);
    return { c, match };
  });
  const removed = existing.filter((e) => !used.has(e.id));
  const cleared = [];
  await withTx(db, async (tx) => {
    if (removed.length) await tx.query(`DELETE FROM interpretation_channels WHERE id = ANY($1::uuid[])`, [removed.map((r) => r.id)]);
    // Zamiana kodów między kanałami (np. en↔uk) nie może naruszyć UNIQUE (session_id, lang_code).
    for (const { c, match } of pairs) {
      if (match && match.lang_code !== c.lang_code) {
        await tx.query(`UPDATE interpretation_channels SET lang_code = $2 WHERE id = $1`, [match.id, `~${match.id}`]);
      }
    }
    for (const { c, match } of pairs) {
      let id = match?.id;
      if (match) {
        const active = match.active_interpreter_email && !c.interpreters.includes(lower(match.active_interpreter_email));
        const row = await one(tx,
          `UPDATE interpretation_channels SET lang_code = $2, label = $3, sort = $4, updated_at = now(),
                  active_interpreter_email = CASE WHEN $5 THEN NULL ELSE active_interpreter_email END
            WHERE id = $1 RETURNING *`, [match.id, c.lang_code, c.label, c.sort, !!active]);
        if (active) cleared.push(row);
      } else {
        id = randomUUID();
        await tx.query(
          `INSERT INTO interpretation_channels (id, session_id, lang_code, label, sort, room_name) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, session.id, c.lang_code, c.label, c.sort, interpRoomNameFor(ctx.tenantSlug, id)]);
      }
      await tx.query(
        `DELETE FROM interpretation_interpreters WHERE channel_id = $1 AND NOT (lower(user_email) = ANY($2::text[]))`, [id, c.interpreters]);
      for (const e of c.interpreters) {
        await tx.query(
          `INSERT INTO interpretation_interpreters (channel_id, user_email) VALUES ($1, $2) ON CONFLICT (channel_id, user_email) DO NOTHING`, [id, e]);
      }
    }
    await tx.query(`UPDATE interpretation_sessions SET updated_at = now() WHERE id = $1`, [session.id]);
  });
  for (const r of removed) await closeRoom(ctx, r.room_name);
  for (const ch of cleared) await setMetadata(ctx, ch);
}

// interp-session-upsert — patrz komentarz na górze pliku.
export async function upsertSession(ctx, user, body = {}) {
  const { db } = ctx;
  const a = await assertManager(ctx, user, body.event_id);
  let session = a.session;
  if (body.remove === true) {
    if (session) {
      await endSession(ctx, session);
      await db.query(`DELETE FROM interpretation_sessions WHERE id = $1`, [session.id]);
    }
    return sessionView(ctx, { ...a, session: null, mine: new Set() });
  }
  if (!session) {
    if (body.enable !== true && body.channels === undefined) return sessionView(ctx, a);
    if (!ctx.tenantSlug) throw new ApiError(500, 'Brak kościoła w kontekście', 'NO_TENANT');
    session = await createSession(ctx, a.ev, a.me);
  }
  if (typeof body.original_enabled === 'boolean' && body.original_enabled !== !!session.original_enabled) {
    session = await one(db,
      `UPDATE interpretation_sessions SET original_enabled = $2, original_status = CASE WHEN $2 THEN original_status ELSE 'idle' END,
              updated_at = now() WHERE id = $1 RETURNING *`, [session.id, body.original_enabled]);
    if (!body.original_enabled) await closeRoom(ctx, session.original_room_name);
  }
  if (body.regenerate_token === true) {
    session = await one(db, `UPDATE interpretation_sessions SET public_token = $2, updated_at = now() WHERE id = $1 RETURNING *`, [session.id, I.newPublicToken()]);
  }
  if (body.channels !== undefined) await replaceChannels(ctx, session, body.channels);
  if (body.end === true) await endSession(ctx, session);
  if (body.reopen === true) {
    await db.query(`UPDATE interpretation_sessions SET status = 'idle', ended_at = NULL, updated_at = now() WHERE id = $1 AND status = 'ended'`, [session.id]);
  }
  session = await sessionById(db, session.id);
  const mine = await myChannelIds(db, session.id, a.me);
  return sessionView(ctx, { ...a, session, mine });
}

// ── Konsola tłumacza ────────────────────────────────────────────────────────
// interp-interpreter-join { channel_id }
export async function interpreterJoin(ctx, user, body = {}) {
  assertEnabled(ctx);
  const { db } = ctx;
  const { me, ch, session } = await channelAccess(ctx, user, body.channel_id);
  if (session.status === 'ended') throw new ApiError(410, MESSAGES.ended, 'INTERP_ENDED');
  const lk = ctx.deps.livekit;
  await ensureRoom(ctx, ch.room_name, I.roomMetadata(ch));
  const partnersList = (await interpretersOf(db, [ch.id])).get(ch.id) || [];
  const names = await namesOf(db, [me, ...partnersList, ch.active_interpreter_email]);
  const token = await lk.mintToken({
    identity: me, name: names.get(me) || me, room: ch.room_name,
    canPublish: true, canPublishSources: ['microphone'], canPublishData: false,
    ttl: I.INTERPRETER_TTL, metadata: { role: 'interpreter', lang: ch.lang_code },
  });
  let original = null;
  if (session.original_enabled) {
    await ensureRoom(ctx, session.original_room_name);
    original = {
      token: await lk.mintToken({
        identity: me, name: names.get(me) || me, room: session.original_room_name,
        canPublish: false, canPublishData: false, hidden: true, ttl: I.INTERPRETER_TTL, metadata: { role: 'monitor' },
      }),
    };
  }
  return {
    url: lk.settings?.url || null,
    token,
    identity: me,
    channel: channelOut(ch, names),
    partners: partnersList.filter((e) => e !== me).map((e) => ({ email: e, name: names.get(e) || e })),
    original,
    session_status: session.status,
  };
}

// interp-take-over { channel_id } — „Przejmij mikrofon”: ja aktywny, poprzedni wyciszony na serwerze.
export async function takeOver(ctx, user, body = {}) {
  const { db } = ctx;
  const { me, ch, session } = await channelAccess(ctx, user, body.channel_id);
  if (session.status === 'ended') throw new ApiError(410, MESSAGES.ended, 'INTERP_ENDED');
  const prev = ch.active_interpreter_email ? lower(ch.active_interpreter_email) : null;
  const updated = await one(db,
    `UPDATE interpretation_channels SET active_interpreter_email = $2, status = 'live', started_at = COALESCE(started_at, now()),
            last_active_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [ch.id, me]);
  await db.query(
    `UPDATE interpretation_sessions SET status = 'live', started_at = COALESCE(started_at, now()), updated_at = now()
      WHERE id = $1 AND status = 'idle'`, [session.id]);
  let muted = null;
  if (prev && prev !== me && ctx.deps?.livekit?.enabled) {
    await muteMic(ctx, ch.room_name, prev).catch((err) => warn(ctx, err, 'wyciszenie poprzedniego tłumacza'));
    muted = prev;
  }
  await setMetadata(ctx, updated);
  const names = await namesOf(db, [me]);
  return { channel: channelOut(updated, names), muted };
}

// interp-release { channel_id, force? } — „Oddaj mikrofon”. force: zarządzający zwalnia kogokolwiek.
export async function release(ctx, user, body = {}) {
  const { db } = ctx;
  const { me, ch, manage } = await channelAccess(ctx, user, body.channel_id);
  const holder = ch.active_interpreter_email ? lower(ch.active_interpreter_email) : null;
  if (!holder || (holder !== me && !(manage && body.force === true))) {
    const names = await namesOf(db, [holder]);
    return { channel: channelOut(ch, names) };
  }
  const updated = await one(db,
    `UPDATE interpretation_channels SET active_interpreter_email = NULL, last_active_at = now(), updated_at = now()
      WHERE id = $1 AND lower(active_interpreter_email) = $2 RETURNING *`, [ch.id, holder]);
  if (!updated) return { channel: channelOut(await channelById(db, ch.id), new Map()) };
  if (ctx.deps?.livekit?.enabled) await muteMic(ctx, ch.room_name, holder).catch((err) => warn(ctx, err, 'wyciszenie przy oddaniu'));
  await setMetadata(ctx, updated);
  return { channel: channelOut(updated, new Map()) };
}

// interp-stats { event_id } — licznik słuchaczy (zarządzający i tłumacze; odpytywane co ~10 s).
export async function stats(ctx, user, body = {}) {
  const { db } = ctx;
  const a = await eventAccess(ctx, user, body.event_id);
  if (!a.manage && !a.mine.size) throw new ApiError(403, MESSAGES.forbidden, 'INTERP_FORBIDDEN');
  if (!a.session) return { status: 'none', total_listeners: 0, original: { enabled: false, status: 'idle', publishing: false }, channels: [] };
  const channels = await channelsOf(db, a.session.id);
  const names = await namesOf(db, channels.map((c) => c.active_interpreter_email));
  const live = a.session.status !== 'ended';
  const parts = await Promise.all(channels.map((c) => (live ? participantsOf(ctx, c.room_name).catch(() => null) : Promise.resolve([]))));
  const orig = a.session.original_enabled && live ? await participantsOf(ctx, a.session.original_room_name).catch(() => null) : [];
  let total = 0;
  const out = channels.map((c, i) => {
    const p = parts[i];
    const listeners = p ? I.countListeners(p) : null;
    total += listeners || 0;
    return { ...channelOut(c, names), listeners, publishing: p ? I.hasPublisher(p) : null };
  });
  return {
    status: a.session.status,
    total_listeners: total,
    original: { enabled: !!a.session.original_enabled, status: a.session.original_status, publishing: orig ? I.hasPublisher(orig, { original: true }) : null },
    channels: out,
  };
}

// interp-original-join { event_id } — nadawanie „Oryginału” (wejście z miksera).
export async function originalJoin(ctx, user, body = {}) {
  assertEnabled(ctx);
  const a = await eventAccess(ctx, user, body.event_id);
  if (!a.manage && !a.mine.size) throw new ApiError(403, MESSAGES.forbidden, 'INTERP_FORBIDDEN');
  const s = a.session;
  if (!s) throw new ApiError(404, 'To wydarzenie nie ma tłumaczenia na żywo', 'INTERP_NOT_FOUND');
  if (s.status === 'ended') throw new ApiError(410, MESSAGES.ended, 'INTERP_ENDED');
  if (!s.original_enabled) throw new ApiError(409, 'Kanał „Oryginał” jest wyłączony w ustawieniach tłumaczenia.', 'ORIGINAL_DISABLED');
  await ensureRoom(ctx, s.original_room_name);
  const identity = I.originalIdentity(a.me);
  const token = await ctx.deps.livekit.mintToken({
    identity, name: 'Oryginał', room: s.original_room_name,
    canPublish: true, canPublishSources: ['microphone'], canPublishData: false,
    ttl: I.INTERPRETER_TTL, metadata: { role: 'original' },
  });
  return { url: ctx.deps.livekit.settings?.url || null, token, identity };
}

// ── Słuchacze ───────────────────────────────────────────────────────────────
async function listenToken(ctx, session, channelId) {
  if (session.status === 'ended') throw new ApiError(410, MESSAGES.ended, 'INTERP_ENDED');
  const ch = await channelById(ctx.db, channelId);
  if (!ch || ch.session_id !== session.id) throw new ApiError(404, 'Nie ma takiego języka w tym tłumaczeniu.', 'CHANNEL_NOT_FOUND');
  if (ch.status !== 'live') throw new ApiError(409, MESSAGES.notLive, 'CHANNEL_NOT_LIVE');
  await ensureRoom(ctx, ch.room_name, I.roomMetadata(ch));
  const token = await ctx.deps.livekit.mintToken({
    identity: I.newListenerIdentity(), name: 'Słuchacz', room: ch.room_name,
    canPublish: false, canPublishData: false, hidden: true, ttl: I.LISTENER_TTL, metadata: { role: 'listener' },
  });
  return { url: ctx.deps.livekit.settings?.url || null, token, channel: publicChannel(ch) };
}

function assertPublicTenant(ctx) {
  if (ctx.tenant?.blocked) throw new ApiError(410, MESSAGES.unavailable, 'INTERP_UNAVAILABLE');
  assertEnabled(ctx);
}

async function publicSession(ctx, token) {
  const s = await sessionByToken(ctx.db, token);
  if (!s) throw new ApiError(404, MESSAGES.notFound, 'INTERP_NOT_FOUND');
  return s;
}

// interp-public-info { token } — bez tokenu sesji, pokoi, tłumaczy i id wydarzenia.
export async function publicInfo(ctx, body = {}) {
  assertPublicTenant(ctx);
  const s = await publicSession(ctx, body.token);
  const ev = await loadEvent(ctx.db, s.event_id);
  if (!ev) throw new ApiError(404, MESSAGES.notFound, 'INTERP_NOT_FOUND');
  const times = eventTimes(ev);
  const channels = s.status === 'ended' ? [] : await channelsOf(ctx.db, s.id);
  return {
    church_name: await churchName(ctx.db, ctx.tenant?.name),
    event: {
      title: ev.title || '', date: ev.date || null, time: ev.time || null, end_time: ev.end_time || null,
      starts_at: times?.starts_at || null, ends_at: times?.ends_at || null,
    },
    status: s.status,
    channels: channels.map(publicChannel),
  };
}

// interp-listen { token, channel_id }
export async function publicListen(ctx, body = {}) {
  assertPublicTenant(ctx);
  const s = await publicSession(ctx, body.token);
  return listenToken(ctx, s, body.channel_id);
}

// interp-member-listen { event_id, channel_id } — zalogowany, który widzi wydarzenie (aplikacja).
export async function memberListen(ctx, user, body = {}) {
  assertEnabled(ctx);
  const a = await eventAccess(ctx, user, body.event_id);
  if (!a.session) throw new ApiError(404, 'To wydarzenie nie ma tłumaczenia na żywo', 'INTERP_NOT_FOUND');
  return listenToken(ctx, a.session, body.channel_id);
}

// ── Webhook LiveKit (pokoje avi_*) ──────────────────────────────────────────
export async function handleLivekitEvent(ctx, event) {
  const { db } = ctx;
  const room = event?.room?.name;
  if (!room) return { ignored: 'no_room' };
  const identity = lower(event?.participant?.identity);
  const listener = I.isListenerIdentity(identity);
  const ch = await one(db, `SELECT * FROM interpretation_channels WHERE room_name = $1`, [room]);
  if (ch) {
    const session = await sessionById(db, ch.session_id);
    switch (event.event) {
      case 'participant_joined':
        if (session?.status === 'ended') { await closeRoom(ctx, room); return { action: 'closed_stale_room' }; }
        return { action: listener ? 'listener_joined' : 'joined' };
      case 'track_published':
        if (!identity || listener) return { ignored: 'listener' };
        await db.query(
          `UPDATE interpretation_channels SET status = 'live', started_at = COALESCE(started_at, now()), last_active_at = now(), updated_at = now()
            WHERE id = $1`, [ch.id]);
        await db.query(`UPDATE interpretation_sessions SET status = 'live', started_at = COALESCE(started_at, now()), updated_at = now() WHERE id = $1 AND status = 'idle'`, [ch.session_id]);
        return { action: 'live' };
      case 'participant_left':
      case 'participant_connection_aborted':
        if (listener || !identity) return { action: 'listener_left' };
        await db.query(`UPDATE interpretation_channels SET last_active_at = now() WHERE id = $1`, [ch.id]);
        return { action: 'left' };
      case 'room_finished':
        forgetRoom(room);
        await db.query(
          `UPDATE interpretation_channels SET status = 'idle', active_interpreter_email = NULL, updated_at = now() WHERE id = $1`, [ch.id]);
        return { action: 'idle' };
      default:
        return { ignored: event?.event || 'unknown_event' };
    }
  }
  const s = await one(db, `SELECT * FROM interpretation_sessions WHERE original_room_name = $1`, [room]);
  if (!s) return { ignored: 'unknown_room' };
  const sender = I.isOriginalIdentity(identity);
  switch (event.event) {
    case 'participant_joined':
      if (s.status === 'ended' || !s.original_enabled) { await closeRoom(ctx, room); return { action: 'closed_stale_room' }; }
      return { action: 'joined' };
    case 'track_published':
      if (!sender) return { ignored: 'not_sender' };
      await db.query(`UPDATE interpretation_sessions SET original_status = 'live', original_last_active_at = now(), updated_at = now() WHERE id = $1`, [s.id]);
      return { action: 'original_live' };
    case 'participant_left':
    case 'participant_connection_aborted':
      if (sender) await db.query(`UPDATE interpretation_sessions SET original_last_active_at = now() WHERE id = $1`, [s.id]);
      return { action: 'left' };
    case 'room_finished':
      forgetRoom(room);
      await db.query(`UPDATE interpretation_sessions SET original_status = 'idle', updated_at = now() WHERE id = $1`, [s.id]);
      return { action: 'original_idle' };
    default:
      return { ignored: event?.event || 'unknown_event' };
  }
}

// ── Sprzątanie (worker co minutę) ───────────────────────────────────────────
// 1) sesja wydarzenia usuniętego albo 6 h po jego końcu → zakończona, pokoje zamknięte;
// 2) kanał „nadaje”, a od 3 min w pokoju nie ma tłumacza → idle (aktywny tłumacz zwolniony);
// 3) „Oryginał” bez nadawcy od 3 min → idle; 4) sesja bez nadających kanałów → idle.
// Bez odpowiedzi LiveKit (null) kanałów nie ruszamy. Zwraca liczbę zmian.
export async function sweepInterpretation(ctx, { now = Date.now() } = {}) {
  const { db } = ctx;
  let changed = 0;
  const { rows: open } = await db.query(`SELECT * FROM interpretation_sessions WHERE status <> 'ended' ORDER BY created_at LIMIT 300`);
  const alive = [];
  for (const s of open) {
    const ev = await loadEvent(db, s.event_id).catch(() => null);
    if (!ev || ev.is_archived || I.sessionExpired(ev, now)) {
      if (await endSession(ctx, s)) changed++;
    } else {
      alive.push(s);
    }
  }
  if (!alive.length || !ctx.deps?.livekit?.enabled) return changed;
  const ids = alive.map((s) => s.id);
  const { rows: live } = await db.query(
    `SELECT * FROM interpretation_channels WHERE status = 'live' AND session_id = ANY($1::uuid[]) LIMIT 500`, [ids]);
  for (const c of live) {
    const parts = await participantsOf(ctx, c.room_name, { fresh: true }).catch(() => null);
    if (!parts) continue;
    if (I.hasPublisher(parts)) {
      await db.query(`UPDATE interpretation_channels SET last_active_at = now() WHERE id = $1`, [c.id]);
    } else if (I.idleDue(c.last_active_at || c.started_at, now)) {
      const row = await one(db,
        `UPDATE interpretation_channels SET status = 'idle', active_interpreter_email = NULL, updated_at = now()
          WHERE id = $1 AND status = 'live' RETURNING *`, [c.id]);
      if (row) { changed++; await setMetadata(ctx, row); }
    }
  }
  for (const s of alive.filter((x) => x.original_enabled && x.original_status === 'live')) {
    const parts = await participantsOf(ctx, s.original_room_name, { fresh: true }).catch(() => null);
    if (!parts) continue;
    if (I.hasPublisher(parts, { original: true })) {
      await db.query(`UPDATE interpretation_sessions SET original_last_active_at = now() WHERE id = $1`, [s.id]);
    } else if (I.idleDue(s.original_last_active_at || s.started_at, now)) {
      await db.query(`UPDATE interpretation_sessions SET original_status = 'idle', updated_at = now() WHERE id = $1`, [s.id]);
      changed++;
    }
  }
  const { rows: quiet } = await db.query(
    `UPDATE interpretation_sessions s SET status = 'idle', updated_at = now()
      WHERE s.id = ANY($1::uuid[]) AND s.status = 'live' AND s.original_status = 'idle'
        AND NOT EXISTS (SELECT 1 FROM interpretation_channels c WHERE c.session_id = s.id AND c.status = 'live')
      RETURNING s.id`, [ids]);
  return changed + quiet.length;
}
