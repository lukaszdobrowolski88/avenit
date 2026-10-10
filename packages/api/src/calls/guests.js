// Goście w rozmowach audio/wideo — link „zaproś gościa” (migracja 097).
//
// Link tworzy (call-link-create): w rozmowie 1:1 każda ze stron (z tymi samymi zasadami co
// dzwonienie: blokady, polityka 1:1), w grupie/kanale — administrator rozmowy albo admin
// aplikacji. Nigdy w rozmowie, w której jest osoba niepełnoletnia (gość to ktoś spoza kościoła).
// Link wygasa (1 h / 24 h / 7 dni), można go wyłączyć, opcjonalnie ma limit osób.
//
// Gość (strona publiczna /rozmowa/<token>, bez logowania, tenant z Host):
//   call-guest-info    { token }               → nazwa kościoła (+ nazwa rozmowy, jeśli twórca pozwolił)
//   call-guest-request { token, name }         → { request_id, secret, status } — prośba w poczekalni
//   call-guest-status  { request_id, secret }  → stan; po wpuszczeniu i gdy w rozmowie ktoś jest —
//                                                 token LiveKit TYLKO do pokoju bieżącego połączenia
//   call-guest-leave   { request_id, secret }  → wyjście / rezygnacja
// Sekret prośby zna tylko przeglądarka gościa (w bazie sha256). Gość nie widzi czatu, uczestników
// rozmowy ani żadnych danych poza nazwą kościoła (i nazwą rozmowy za zgodą twórcy linku).
//
// Poczekalnia: wiersze call_guest_requests czytają uczestnicy rozmowy (/api/db + realtime) —
// web pokazuje „Gość chce dołączyć” z Wpuść / Odrzuć (call-guest-admit / call-guest-deny; każdy
// uczestnik rozmowy, nie gość). Prośba bez odzewu gościa > 60 s wygasa (worker call-sweep).
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../dataapi/querybuilder.js';
import { conversationOf, isMember, directMembers } from '../dataapi/komunikator.js';
import { assertDirectAllowed, minorEmails, isAppAdmin } from '../dataapi/komunikatorPlus.js';
import { logAccountEvent } from '../lib/account-audit.js';
import {
  callDeps, assertEnabled, emitRows, liveCallOf, getCall, publicGuestRow,
} from './service.js';
import * as L from './logic.js';

export const LINK_TTLS = { '1h': 3600, '24h': 86400, '7d': 7 * 86400 };
export const DEFAULT_TTL = '24h';
export const GUEST_TOKEN_TTL = '15m'; // LiveKit sam odświeża token połączonej osoby
export const MAX_ACTIVE_LINKS = 20;
export const MAX_PENDING_PER_LINK = 20;
export const STALE_PENDING_SEC = 60;
export const NAME_MAX = 60;
export const MAX_USES_LIMIT = 500;

const lower = (v) => String(v ?? '').trim().toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{32,64}$/;
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0] || null;
const warn = (ctx, err, msg) => ctx.log?.warn?.({ err }, `calls/guests: ${msg}`);

export const MESSAGES = {
  minors: 'Ze względu na ochronę dzieci i młodzieży nie można zapraszać gości do rozmowy, w której jest osoba niepełnoletnia.',
  forbidden: 'Link dla gościa może utworzyć administrator tej rozmowy.',
  notFound: 'Ten link do rozmowy nie istnieje.',
  expired: 'Ten link do rozmowy wygasł albo został wyłączony.',
  full: 'Z tego linku dołączyła już maksymalna liczba osób.',
  unavailable: 'Ta rozmowa nie jest teraz dostępna dla gości.',
  lobbyFull: 'W poczekalni czeka już wiele osób. Spróbuj za chwilę.',
  badName: 'Podaj swoje imię (do 60 znaków).',
  tooMany: 'Ta rozmowa ma już wiele aktywnych linków. Wyłącz nieużywane i spróbuj ponownie.',
};

// ── Czyste reguły (testowane) ───────────────────────────────────────────────
// Imię gościa: bez znaków sterujących i nadmiarowych spacji, najwyżej 60 znaków.
export function normalizeGuestName(raw) {
  // eslint-disable-next-line no-control-regex
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, NAME_MAX).join('').trim();
}

export const guestDisplayName = (name) => `${name} (gość)`;

export function ttlSeconds(value) {
  return LINK_TTLS[value] || LINK_TTLS[DEFAULT_TTL];
}

export function normalizeMaxUses(v) {
  if (v === null || v === undefined || v === '' || v === 0 || v === '0') return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, MAX_USES_LIMIT);
}

const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v));

// Stan linku: 'ok' | 'revoked' | 'expired' | 'full'.
export function linkState(link, now = Date.now()) {
  if (!link) return 'missing';
  if (link.revoked_at) return 'revoked';
  if (!(ms(link.expires_at) > now)) return 'expired';
  if (link.max_uses != null && Number(link.uses) >= Number(link.max_uses)) return 'full';
  return 'ok';
}

export const hashSecret = (secret) => createHash('sha256').update(String(secret)).digest('hex');

export function secretMatches(hash, secret) {
  if (!hash || !SECRET_RE.test(String(secret ?? ''))) return false;
  const a = Buffer.from(String(hash), 'hex');
  const b = Buffer.from(hashSecret(secret), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const linkPath = (token) => `/rozmowa/${token}`;

// Link dla osób z rozmowy (lista w oknie „Zaproś gościa”).
export function publicLink(link) {
  return {
    id: link.id,
    conversation_id: link.conversation_id,
    token: link.token,
    path: linkPath(link.token),
    auto_admit: !!link.auto_admit,
    show_title: !!link.show_title,
    max_uses: link.max_uses ?? null,
    uses: Number(link.uses) || 0,
    expires_at: link.expires_at,
    created_at: link.created_at,
    created_by_email: link.created_by_email,
  };
}

// ── Dostęp ──────────────────────────────────────────────────────────────────
export async function hasMinor(db, conversationId) {
  const people = await directMembers(db, conversationId);
  if (!people.length) return false;
  return (await minorEmails(db, people)).size > 0;
}

async function assertNoMinors(db, conversationId) {
  if (await hasMinor(db, conversationId)) throw new ApiError(403, MESSAGES.minors, 'GUESTS_MINORS');
}

// Kto zarządza linkami: 1:1 — każda strona (blokady i polityka 1:1 jak przy dzwonieniu);
// grupa/kanał — administrator rozmowy albo admin aplikacji. checkMinors: przy tworzeniu linku.
export async function linkManageAccess(db, me, conversationId, { checkMinors = true } = {}) {
  const conv = await conversationOf(db, conversationId);
  if (!conv) throw new ApiError(404, 'Nie znaleziono rozmowy', 'NOT_FOUND');
  const member = await isMember(db, conversationId, me);
  if (!member) throw new ApiError(403, 'Link możesz utworzyć tylko w swojej rozmowie', 'NOT_PARTICIPANT');
  if (conv.type === 'direct') {
    const others = (await directMembers(db, conversationId)).filter((e) => e !== me);
    for (const other of others) await assertDirectAllowed(db, me, other);
  } else if (member.role !== 'admin' && !(await isAppAdmin(db, me))) {
    throw new ApiError(403, MESSAGES.forbidden, 'GUEST_LINK_FORBIDDEN');
  }
  if (checkMinors) await assertNoMinors(db, conversationId);
  return { conv, role: member.role };
}

const audit = (db, actor, action, detail) => logAccountEvent(db, { email: actor, action, actor, detail });

async function emitRequests(ctx, op, rows) {
  const list = (rows || []).filter(Boolean).map(publicGuestRow);
  if (list.length) await emitRows(ctx, 'call_guest_requests', op, list);
}

// ── Akcje osób z rozmowy (fn z sesją) ───────────────────────────────────────
// call-link-create { conversation_id, expires_in: '1h'|'24h'|'7d', auto_admit, show_title, max_uses }
//   → { link }
export async function createGuestLink(ctx, user, body = {}) {
  assertEnabled(ctx);
  const { db } = ctx;
  const me = lower(user?.email);
  const conversationId = String(body.conversation_id ?? '').trim();
  if (!me || !UUID_RE.test(conversationId)) throw new ApiError(400, 'Wskaż rozmowę', 'BAD_REQUEST');
  const { conv } = await linkManageAccess(db, me, conversationId);
  const active = await one(db,
    `SELECT count(*)::int AS n FROM call_guest_links WHERE conversation_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [conversationId]);
  if ((active?.n ?? 0) >= MAX_ACTIVE_LINKS) throw new ApiError(409, MESSAGES.tooMany, 'TOO_MANY_LINKS');
  const ttl = ttlSeconds(body.expires_in);
  const link = await one(db,
    `INSERT INTO call_guest_links (conversation_id, token, created_by_email, auto_admit, show_title, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + $7 * interval '1 second') RETURNING *`,
    [conversationId, randomBytes(32).toString('base64url'), me, body.auto_admit === true,
      conv.type !== 'direct' && body.show_title === true, normalizeMaxUses(body.max_uses), ttl]);
  await audit(db, me, 'call_link_created',
    `rozmowa ${conversationId}, ważny ${Object.keys(LINK_TTLS).find((k) => LINK_TTLS[k] === ttl)}${link.auto_admit ? ', bez pytania' : ''}${link.max_uses ? `, limit ${link.max_uses}` : ''}`);
  return { link: publicLink(link) };
}

// call-link-list { conversation_id } → { links, can_manage, reason }
// Uczestnik bez prawa zarządzania dostaje pustą listę i powód (np. GUESTS_MINORS) — web pokazuje
// wyjaśnienie zamiast formularza.
export async function listGuestLinks(ctx, user, body = {}) {
  const { db } = ctx;
  const me = lower(user?.email);
  const conversationId = String(body.conversation_id ?? '').trim();
  if (!me || !UUID_RE.test(conversationId)) throw new ApiError(400, 'Wskaż rozmowę', 'BAD_REQUEST');
  if (!(await isMember(db, conversationId, me))) {
    throw new ApiError(403, 'To nie jest Twoja rozmowa', 'NOT_PARTICIPANT');
  }
  let canManage = true;
  let reason = null;
  let message = null;
  try {
    await linkManageAccess(db, me, conversationId, { checkMinors: false });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 403) throw err;
    canManage = false;
    reason = err.code || 'FORBIDDEN';
    message = err.message;
  }
  // Niepełnoletni: nowych linków nie da się utworzyć, ale istniejące wciąż można wyłączyć.
  let canCreate = canManage;
  if (canManage && (await hasMinor(db, conversationId))) {
    canCreate = false;
    reason = 'GUESTS_MINORS';
    message = MESSAGES.minors;
  }
  if (!canManage) return { links: [], can_manage: false, can_create: false, reason, message };
  const { rows } = await db.query(
    `SELECT * FROM call_guest_links WHERE conversation_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT $2`, [conversationId, MAX_ACTIVE_LINKS]);
  return { links: rows.map(publicLink), can_manage: true, can_create: canCreate, reason, message };
}

// call-link-revoke { link_id } → { ok, link }. Prośby z tego linku wygasają, a goście z tego
// linku są usuwani z pokoju połączenia.
export async function revokeGuestLink(ctx, user, body = {}) {
  const { db } = ctx;
  const me = lower(user?.email);
  const id = String(body.link_id ?? '').trim();
  if (!me || !UUID_RE.test(id)) throw new ApiError(400, 'Wskaż link', 'BAD_REQUEST');
  const link = await one(db, `SELECT * FROM call_guest_links WHERE id = $1`, [id]);
  if (!link) throw new ApiError(404, 'Nie znaleziono linku', 'NOT_FOUND');
  // Twórca linku zawsze może go wyłączyć (o ile nadal jest w rozmowie); poza tym — zarządzający.
  if (lower(link.created_by_email) === me) {
    if (!(await isMember(db, link.conversation_id, me))) throw new ApiError(403, 'To nie jest Twoja rozmowa', 'NOT_PARTICIPANT');
  } else {
    await linkManageAccess(db, me, link.conversation_id, { checkMinors: false });
  }
  const row = await one(db,
    `UPDATE call_guest_links SET revoked_at = now(), revoked_by_email = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING *`,
    [id, me]);
  if (!row) return { ok: true, link: publicLink(link) };
  const { rows: expired } = await db.query(
    `UPDATE call_guest_requests SET status = 'expired', updated_at = now()
      WHERE link_id = $1 AND status IN ('pending', 'admitted') RETURNING *`, [id]);
  await emitRequests(ctx, 'update', expired);
  // Goście z tego linku, którzy są w pokoju — rozłącz (najlepszy wysiłek).
  const inRoom = expired.filter((r) => r.call_id && r.joined_at && !r.left_at);
  if (inRoom.length && ctx.deps?.livekit?.removeParticipant) {
    for (const r of inRoom) {
      const call = await getCall(db, r.call_id);
      if (call && L.isLive(call.status)) {
        Promise.resolve().then(() => ctx.deps.livekit.removeParticipant(call.room_name, r.identity)).catch(() => {});
      }
    }
  }
  await audit(db, me, 'call_link_revoked', `rozmowa ${link.conversation_id}`);
  return { ok: true, link: publicLink(row) };
}

async function memberRequest(ctx, me, requestId) {
  if (!me || !UUID_RE.test(String(requestId ?? ''))) throw new ApiError(400, 'Wskaż prośbę gościa', 'BAD_REQUEST');
  const req = await one(ctx.db, `SELECT * FROM call_guest_requests WHERE id = $1`, [String(requestId)]);
  if (!req) throw new ApiError(404, 'Nie znaleziono prośby gościa', 'NOT_FOUND');
  // Wpuszcza/odrzuca uczestnik rozmowy (konto) — gość nie ma sesji, więc nie może.
  if (!(await isMember(ctx.db, req.conversation_id, me))) {
    throw new ApiError(403, 'To nie jest Twoja rozmowa', 'NOT_PARTICIPANT');
  }
  return req;
}

// Wpuszczenie: prośba oczekująca + link nadal ważny i z wolnym miejscem; licznik użyć +1.
async function admitInternal(db, requestId, decidedBy) {
  return one(db,
    `WITH r AS (
       UPDATE call_guest_requests q SET status = 'admitted', decided_by_email = $2, decided_at = now(), updated_at = now()
        WHERE q.id = $1 AND q.status = 'pending'
          AND EXISTS (SELECT 1 FROM call_guest_links l WHERE l.id = q.link_id AND l.revoked_at IS NULL
                         AND l.expires_at > now() AND (l.max_uses IS NULL OR l.uses < l.max_uses))
        RETURNING q.*
     ), u AS (
       UPDATE call_guest_links SET uses = uses + 1 WHERE id IN (SELECT link_id FROM r) RETURNING id
     )
     SELECT r.* FROM r`,
    [requestId, decidedBy]);
}

// call-guest-admit { request_id } → { ok, request }
export async function admitGuest(ctx, user, body = {}) {
  const { db } = ctx;
  const me = lower(user?.email);
  const req = await memberRequest(ctx, me, body.request_id);
  if (req.status === 'admitted') return { ok: true, request: publicGuestRow(req) };
  if (req.status !== 'pending') throw new ApiError(410, 'Gość już nie czeka na wejście', 'REQUEST_CLOSED');
  if (await hasMinor(db, req.conversation_id)) {
    const denied = await one(db,
      `UPDATE call_guest_requests SET status = 'denied', decided_by_email = $2, decided_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'pending' RETURNING *`, [req.id, me]);
    await emitRequests(ctx, 'update', [denied]);
    throw new ApiError(403, MESSAGES.minors, 'GUESTS_MINORS');
  }
  const row = await admitInternal(db, req.id, me);
  if (!row) {
    const now = await one(db, `SELECT * FROM call_guest_requests WHERE id = $1`, [req.id]);
    if (now?.status === 'admitted') return { ok: true, request: publicGuestRow(now) };
    const link = await one(db, `SELECT * FROM call_guest_links WHERE id = $1`, [req.link_id]);
    const state = linkState(link);
    if (state === 'full') throw new ApiError(409, MESSAGES.full, 'LINK_FULL');
    if (state !== 'ok') throw new ApiError(410, MESSAGES.expired, 'LINK_EXPIRED');
    throw new ApiError(410, 'Gość już nie czeka na wejście', 'REQUEST_CLOSED');
  }
  await emitRequests(ctx, 'update', [row]);
  await audit(db, me, 'call_guest_admitted', `gość „${row.guest_name}”, rozmowa ${row.conversation_id}`);
  return { ok: true, request: publicGuestRow(row) };
}

// call-guest-deny { request_id } → { ok, request }
export async function denyGuest(ctx, user, body = {}) {
  const { db } = ctx;
  const me = lower(user?.email);
  const req = await memberRequest(ctx, me, body.request_id);
  if (req.status !== 'pending') return { ok: true, request: publicGuestRow(req) };
  const row = await one(db,
    `UPDATE call_guest_requests SET status = 'denied', decided_by_email = $2, decided_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING *`, [req.id, me]);
  if (row) {
    await emitRequests(ctx, 'update', [row]);
    await audit(db, me, 'call_guest_denied', `gość „${row.guest_name}”, rozmowa ${row.conversation_id}`);
  }
  return { ok: true, request: publicGuestRow(row || req) };
}

// ── Strona gościa (publiczne fn) ────────────────────────────────────────────
async function churchName(db, fallback) {
  try {
    const r = await one(db, `SELECT value FROM app_settings WHERE key = 'org_name' LIMIT 1`, []);
    const v = typeof r?.value === 'string' ? r.value.replace(/^"|"$/g, '').trim() : '';
    if (v) return v;
  } catch { /* brak ustawienia */ }
  return String(fallback || '').trim() || 'Kościół';
}

function assertGuestTenant(ctx) {
  // Zawieszony kościół / nieaktywna subskrypcja — linki gości nie działają.
  if (ctx.tenant?.blocked) throw new ApiError(410, MESSAGES.unavailable, 'LINK_UNAVAILABLE');
  assertEnabled(ctx);
}

async function linkByToken(db, token) {
  const t = String(token ?? '').trim();
  if (!TOKEN_RE.test(t)) throw new ApiError(404, MESSAGES.notFound, 'LINK_NOT_FOUND');
  const link = await one(db, `SELECT * FROM call_guest_links WHERE token = $1`, [t]);
  if (!link) throw new ApiError(404, MESSAGES.notFound, 'LINK_NOT_FOUND');
  return link;
}

function assertLinkUsable(link) {
  const state = linkState(link);
  if (state === 'full') throw new ApiError(410, MESSAGES.full, 'LINK_FULL');
  if (state !== 'ok') throw new ApiError(410, MESSAGES.expired, 'LINK_EXPIRED');
}

// call-guest-info { token } → { church_name, title, call_live, auto_admit, expires_at }
// Bez danych rozmowy: nazwa rozmowy tylko gdy twórca linku zaznaczył „pokaż nazwę” (grupy).
export async function guestInfo(ctx, body = {}) {
  assertGuestTenant(ctx);
  const { db } = ctx;
  const link = await linkByToken(db, body.token);
  assertLinkUsable(link);
  if (await hasMinor(db, link.conversation_id)) throw new ApiError(410, MESSAGES.unavailable, 'LINK_UNAVAILABLE');
  let title = null;
  if (link.show_title) {
    const c = await one(db, `SELECT name, type FROM conversations WHERE id = $1`, [link.conversation_id]);
    if (c && c.type !== 'direct') title = String(c.name || '').trim() || null;
  }
  const live = await liveCallOf(db, link.conversation_id);
  return {
    church_name: await churchName(db, ctx.tenant?.name),
    title,
    call_live: !!live,
    kind: live?.kind || null,
    auto_admit: !!link.auto_admit,
    expires_at: link.expires_at,
  };
}

// Prośby, od których gość nie odezwał się > 60 s (zamknięta karta) — wygaszone.
export async function expireStaleGuestRequests(ctx, { linkId = null } = {}) {
  const { rows } = await ctx.db.query(
    `UPDATE call_guest_requests SET status = 'expired', updated_at = now()
      WHERE status = 'pending' AND last_seen_at < now() - $1 * interval '1 second'
        ${linkId ? 'AND link_id = $2' : ''}
      RETURNING *`,
    linkId ? [STALE_PENDING_SEC, linkId] : [STALE_PENDING_SEC]);
  await emitRequests(ctx, 'update', rows);
  return rows.length;
}

// Prośba czeka w poczekalni: co ~minutę sprawdzamy, czy gość nadal odpytuje (last_seen_at);
// jeśli nie (zamknął kartę bez „Opuść”), wygasa — z realtime, więc znika z poczekalni u osób
// w rozmowie. Po restarcie API to samo robi worker call-sweep (bez realtime).
export function watchPending(ctx, requestId) {
  if (ctx.deps?.timers === false) return;
  const t = setTimeout(async () => {
    try {
      const row = await one(ctx.db, `SELECT status, last_seen_at FROM call_guest_requests WHERE id = $1`, [requestId]);
      if (row?.status !== 'pending') return;
      const closed = await one(ctx.db,
        `UPDATE call_guest_requests SET status = 'expired', updated_at = now()
          WHERE id = $1 AND status = 'pending' AND last_seen_at < now() - $2 * interval '1 second' RETURNING *`,
        [requestId, STALE_PENDING_SEC]);
      if (closed) await emitRequests(ctx, 'update', [closed]);
      else watchPending(ctx, requestId);
    } catch (err) {
      warn(ctx, err, 'poczekalnia');
    }
  }, (STALE_PENDING_SEC + 5) * 1000);
  t.unref?.();
}

// call-guest-request { token, name } → { request_id, secret, status }
export async function guestRequest(ctx, body = {}) {
  assertGuestTenant(ctx);
  const { db } = ctx;
  const link = await linkByToken(db, body.token);
  assertLinkUsable(link);
  const name = normalizeGuestName(body.name);
  if (!name) throw new ApiError(400, MESSAGES.badName, 'BAD_NAME');
  if (await hasMinor(db, link.conversation_id)) throw new ApiError(410, MESSAGES.unavailable, 'LINK_UNAVAILABLE');
  await expireStaleGuestRequests(ctx, { linkId: link.id }).catch((err) => warn(ctx, err, 'wygaszanie próśb'));
  const pending = await one(db,
    `SELECT count(*)::int AS n FROM call_guest_requests WHERE link_id = $1 AND status = 'pending'`, [link.id]);
  if ((pending?.n ?? 0) >= MAX_PENDING_PER_LINK) throw new ApiError(429, MESSAGES.lobbyFull, 'LOBBY_FULL');

  const secret = randomBytes(32).toString('base64url');
  let row = await one(db,
    `INSERT INTO call_guest_requests (link_id, conversation_id, guest_name, identity, secret_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [link.id, link.conversation_id, name, `${L.GUEST_PREFIX}${randomBytes(12).toString('hex')}`, hashSecret(secret)]);
  if (link.auto_admit) {
    const admitted = await admitInternal(db, row.id, 'auto');
    if (admitted) row = admitted;
    else {
      // Wyścig o ostatnie miejsce — prośba nie zostaje w poczekalni.
      await db.query(`UPDATE call_guest_requests SET status = 'expired', updated_at = now() WHERE id = $1`, [row.id]);
      throw new ApiError(410, MESSAGES.full, 'LINK_FULL');
    }
  }
  await emitRequests(ctx, 'insert', [row]);
  if (row.status === 'pending') watchPending(ctx, row.id);
  return { request_id: row.id, secret, status: row.status, name: row.guest_name };
}

async function guestRequestBySecret(db, body) {
  const id = String(body.request_id ?? '').trim();
  if (!UUID_RE.test(id)) throw new ApiError(404, 'Nie znaleziono prośby', 'REQUEST_NOT_FOUND');
  const row = await one(db, `SELECT * FROM call_guest_requests WHERE id = $1`, [id]);
  if (!row || !secretMatches(row.secret_hash, body.secret)) throw new ApiError(404, 'Nie znaleziono prośby', 'REQUEST_NOT_FOUND');
  return row;
}

// Czy w połączeniu jest ktoś z rozmowy (konto) — gość nie wchodzi do pustego pokoju.
export async function memberPresent(db, callId) {
  const r = await one(db,
    `SELECT count(*)::int AS n FROM call_participants
      WHERE call_id = $1 AND left_at IS NULL AND (joined_at IS NOT NULL OR response = 'accepted')`, [callId]);
  return (r?.n ?? 0) > 0;
}

// call-guest-status { request_id, secret } →
//   { status: 'pending'|'admitted'|'denied'|'left'|'expired'|'ended', waiting?: 'host'|'admission',
//     token?, url?, room?, kind? }
export async function guestStatus(ctx, body = {}) {
  assertGuestTenant(ctx);
  const { db } = ctx;
  let req = await guestRequestBySecret(db, body);
  if (['denied', 'left', 'expired'].includes(req.status)) return { status: req.status };

  // Ochrona niepełnoletnich także po wpuszczeniu (skład rozmowy mógł się zmienić).
  if (await hasMinor(db, req.conversation_id)) {
    const closed = await one(db,
      `UPDATE call_guest_requests SET status = 'expired', updated_at = now() WHERE id = $1 AND status IN ('pending', 'admitted') RETURNING *`,
      [req.id]);
    await emitRequests(ctx, 'update', [closed]);
    return { status: 'expired' };
  }

  if (req.status === 'pending') {
    const link = await one(db, `SELECT * FROM call_guest_links WHERE id = $1`, [req.link_id]);
    if (linkState(link) !== 'ok') {
      const closed = await one(db,
        `UPDATE call_guest_requests SET status = 'expired', updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
        [req.id]);
      await emitRequests(ctx, 'update', [closed]);
      return { status: 'expired' };
    }
    req = (await one(db,
      `UPDATE call_guest_requests SET last_seen_at = now() WHERE id = $1 RETURNING *`, [req.id])) || req;
    if (req.status !== 'pending') return guestStatus(ctx, body);
    const live = await liveCallOf(db, req.conversation_id);
    return { status: 'pending', waiting: 'admission', call_live: !!live };
  }

  // Wpuszczony: token do pokoju BIEŻĄCEGO połączenia, gdy jest w nim ktoś z rozmowy.
  await db.query(`UPDATE call_guest_requests SET last_seen_at = now() WHERE id = $1`, [req.id]);
  let call = null;
  if (req.call_id) {
    call = await getCall(db, req.call_id);
    // Połączenie, do którego gość wszedł, już się skończyło — link nie wpuszcza do kolejnego.
    if (call && !L.isLive(call.status) && req.joined_at) return { status: 'ended' };
    if (call && !L.isLive(call.status)) call = null;
  }
  if (!call) call = await liveCallOf(db, req.conversation_id);
  if (!call || !(await memberPresent(db, call.id))) return { status: 'admitted', waiting: 'host' };
  if (req.call_id !== call.id) {
    await db.query(`UPDATE call_guest_requests SET call_id = $2, updated_at = now() WHERE id = $1`, [req.id, call.id]);
  }
  const token = await ctx.deps.livekit.mintToken({
    identity: req.identity,
    name: guestDisplayName(req.guest_name),
    room: call.room_name,
    canPublish: true,
    canPublishData: false,
    ttl: GUEST_TOKEN_TTL,
    metadata: { guest: true, name: req.guest_name },
  });
  return {
    status: 'admitted',
    token,
    url: ctx.deps.livekit.settings.url,
    room: call.room_name,
    kind: call.kind,
    identity: req.identity,
  };
}

// call-guest-leave { request_id, secret } → { ok, status }
export async function guestLeave(ctx, body = {}) {
  const { db } = ctx;
  const req = await guestRequestBySecret(db, body);
  if (!['pending', 'admitted'].includes(req.status)) return { ok: true, status: req.status };
  const row = await one(db,
    `UPDATE call_guest_requests SET status = 'left', left_at = COALESCE(left_at, CASE WHEN joined_at IS NOT NULL THEN now() END), updated_at = now()
      WHERE id = $1 AND status IN ('pending', 'admitted') RETURNING *`, [req.id]);
  await emitRequests(ctx, 'update', [row]);
  return { ok: true, status: row?.status || req.status };
}

// ── Handlery fn ─────────────────────────────────────────────────────────────
export function guestCtxFromRequest(req) {
  return {
    db: req.db,
    tenantSlug: req.tenant?.slug,
    tenant: { name: req.tenant?.name || '', blocked: !!req.tenantBlocked },
    log: req.log,
    deps: callDeps(),
  };
}

// Publiczne fn gościa: błędy jako { error, code } (bez szczegółów serwera).
export async function runGuestFn(req, reply, action) {
  try {
    if (!req.db) return reply.code(404).send({ error: MESSAGES.notFound, code: 'LINK_NOT_FOUND' });
    const out = await action(guestCtxFromRequest(req), req.body || {});
    return reply.send(out);
  } catch (err) {
    if (err instanceof ApiError || (err && Number.isInteger(err.status))) {
      return reply.code(err.status).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    if (err?.code === '42P01') return reply.code(404).send({ error: MESSAGES.notFound, code: 'LINK_NOT_FOUND' });
    req.log?.error?.({ err }, 'calls/guests: błąd');
    return reply.code(500).send({ error: 'Coś poszło nie tak. Spróbuj ponownie za chwilę.' });
  }
}
