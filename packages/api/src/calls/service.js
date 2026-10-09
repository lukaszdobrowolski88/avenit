// Połączenia audio/wideo w Komunikatorze — logika serwera (fn call-*, webhook LiveKit, worker).
//
// Kto może dzwonić: uczestnik rozmowy, który może w niej pisać (posting_policy), z tymi samymi
// zabezpieczeniami co czat: blokady i polityka rozmów 1:1 z ochroną niepełnoletnich
// (assertDirectAllowed — rozmowa 1:1 dorosły↔niepełnoletni jest odrzucana dokładnie wtedy, gdy
// odrzucona byłaby wiadomość). Dołączyć do trwającej rozmowy może każdy uczestnik rozmowy; w kanale
// „piszą tylko administratorzy” zwykły uczestnik dostaje token tylko do słuchania.
//
// Stan trzyma tabela calls (logic.js — maszyna stanów). Każda zmiana stanu to UPDATE z warunkiem
// na bieżący stan, a skutki uboczne (wiadomość w czacie, push, zamknięcie pokoju) wykonuje tylko
// ten, kto wygrał przejście — powtórzone webhooki i wyścigi fn/timer/worker niczego nie dublują.
// Zależności zewnętrzne (LiveKit, realtime, push) wstrzykiwane przez ctx.deps (testy).
import { randomUUID } from 'node:crypto';
import { ApiError } from '../dataapi/querybuilder.js';
import { conversationOf, isMember, directMembers, conversationAudience } from '../dataapi/komunikator.js';
import { assertDirectAllowed } from '../dataapi/komunikatorPlus.js';
import { emitChange } from '../realtime/hub.js';
import { sendPushCore } from '../fn/send-push.js';
import { notifyOnWrite, pushKind, isQuietNow, messageLink, recipientsOf } from '../realtime/push-hooks.js';
import { getLivekit, CALLS_DISABLED } from './livekit.js';
import * as L from './logic.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RING_PUSHES = 300;
const STALE_LIVE_HOURS = 12;

// ── Zależności ──────────────────────────────────────────────────────────────
let overrides = null;
// Testy: podmiana domyślnych zależności dla handlerów fn (null = przywróć).
export function setCallDeps(o) { overrides = o; }
export function callDeps(extra = {}) {
  return {
    livekit: getLivekit(),
    emit: emitChange,
    sendPush: sendPushCore,
    notifyMessage: notifyOnWrite,
    timers: true,
    ...(overrides || {}),
    ...extra,
  };
}

export function ctxFromRequest(req) {
  return { db: req.db, tenantSlug: req.tenant?.slug, log: req.log, deps: callDeps() };
}

// Handler fn: wynik albo { error, code } z kodem HTTP z ApiError.
export async function runCallFn(req, reply, action) {
  try {
    const out = await action(ctxFromRequest(req), req.user, req.body || {});
    return reply.send(out);
  } catch (err) {
    if (err instanceof ApiError || (err && Number.isInteger(err.status))) {
      return reply.code(err.status).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    req.log?.error?.({ err }, 'calls: błąd');
    return reply.code(500).send({ error: 'Nie udało się obsłużyć połączenia. Spróbuj ponownie.' });
  }
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0] || null;
const warn = (ctx, err, msg) => ctx.log?.warn?.({ err }, `calls: ${msg}`);

function assertEnabled(ctx) {
  if (!ctx.deps?.livekit?.enabled) throw new ApiError(503, CALLS_DISABLED.error, CALLS_DISABLED.code);
}

// ── Odczyt ──────────────────────────────────────────────────────────────────
export async function getCall(db, id) {
  if (!UUID_RE.test(String(id ?? ''))) return null;
  return one(db, `SELECT * FROM calls WHERE id = $1`, [String(id)]);
}

export async function liveCallOf(db, conversationId) {
  return one(db,
    `SELECT * FROM calls WHERE conversation_id = $1 AND status IN ('ringing', 'active') ORDER BY started_at DESC LIMIT 1`,
    [String(conversationId)]);
}

// Dostęp do połączeń w rozmowie: uczestnik; w rozmowie 1:1 dodatkowo blokady i polityka DM.
export async function callAccess(db, me, conversationId) {
  const conv = await conversationOf(db, conversationId);
  if (!conv) throw new ApiError(404, 'Nie znaleziono rozmowy', 'NOT_FOUND');
  const member = await isMember(db, conversationId, me);
  if (!member) throw new ApiError(403, 'Połączenie jest możliwe tylko w Twojej rozmowie', 'NOT_PARTICIPANT');
  let others = null;
  if (conv.type === 'direct') {
    others = (await directMembers(db, conversationId)).filter((e) => e !== me);
    for (const other of others) await assertDirectAllowed(db, me, other);
  }
  return { conv, role: member.role, others };
}

async function profileOf(db, email) {
  try {
    const r = await one(db,
      `SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS display, avatar_url
         FROM app_users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
    return { name: r?.display || email, avatar_url: r?.avatar_url || null };
  } catch {
    const r = await one(db,
      `SELECT COALESCE(NULLIF(full_name, ''), email) AS display FROM app_users WHERE lower(email) = lower($1) LIMIT 1`, [email],
    ).catch(() => null);
    return { name: r?.display || email, avatar_url: null };
  }
}

// ── Realtime ────────────────────────────────────────────────────────────────
async function emitRows(ctx, table, op, rows) {
  const list = (rows || []).filter(Boolean);
  if (!ctx.tenantSlug || !list.length || typeof ctx.deps?.emit !== 'function') return;
  try {
    const audience = (await conversationAudience(ctx.db, table, list)) || new Set();
    ctx.deps.emit(ctx.tenantSlug, table, op, list, { audience });
  } catch (err) {
    warn(ctx, err, `realtime ${table}`);
  }
}

// ── Uczestnicy ──────────────────────────────────────────────────────────────
async function upsertParticipant(db, callId, email, { response = null, joined = false } = {}) {
  return one(db,
    `INSERT INTO call_participants (call_id, user_email, response, joined_at)
     VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN now() END)
     ON CONFLICT (call_id, user_email) DO UPDATE SET
       response = COALESCE(EXCLUDED.response, call_participants.response),
       joined_at = CASE WHEN $4::boolean THEN now() ELSE call_participants.joined_at END,
       left_at = CASE WHEN $4::boolean THEN NULL ELSE call_participants.left_at END
     RETURNING *`,
    [callId, lower(email), response, !!joined]);
}

async function peopleInRoomDb(db, callId) {
  const r = await one(db,
    `SELECT count(*)::int AS n FROM call_participants WHERE call_id = $1 AND joined_at IS NOT NULL AND left_at IS NULL`, [callId]);
  return r?.n ?? 0;
}

// ── Wiadomość w czacie ──────────────────────────────────────────────────────
// Wstawia (pierwszy raz) albo aktualizuje wiadomość typu 'call'. Wołane tylko przez zwycięzcę
// przejścia stanu, więc wiadomość powstaje raz. Zwraca połączenie z message_id.
export async function postCallMessage(ctx, call) {
  const { db } = ctx;
  const content = L.callMessageText(call);
  const metadata = JSON.stringify(L.callMessageMetadata(call));
  if (call.message_id) {
    const msg = await one(db, `UPDATE messages SET content = $2, metadata = $3::jsonb WHERE id = $1 RETURNING *`,
      [call.message_id, content, metadata]).catch((err) => { warn(ctx, err, 'aktualizacja wiadomości'); return null; });
    if (msg) await emitRows(ctx, 'messages', 'update', [msg]);
    return { call, message: msg, created: false };
  }
  const msg = await one(db,
    `INSERT INTO messages (conversation_id, sender_email, content, message_type, metadata)
     VALUES ($1, $2, $3, 'call', $4::jsonb) RETURNING *`,
    [call.conversation_id, call.started_by_email, content, metadata]);
  const linked = await one(db, `UPDATE calls SET message_id = $2 WHERE id = $1 AND message_id IS NULL RETURNING *`, [call.id, msg.id]);
  await emitRows(ctx, 'messages', 'insert', [msg]);
  // Podgląd na liście rozmów (jak przy zwykłej wiadomości wysyłanej przez klienta).
  const conv = await one(db,
    `UPDATE conversations SET last_message_at = now(), last_message_preview = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [call.conversation_id, content]).catch(() => null);
  if (conv) await emitRows(ctx, 'conversations', 'update', [conv]);
  return { call: linked || { ...call, message_id: msg.id }, message: msg, created: true };
}

// ── Zakończenie ─────────────────────────────────────────────────────────────
// Przejście do stanu końcowego (tylko z `from`). null = ktoś już zakończył (idempotentnie).
export async function finishCall(ctx, callId, status, { from = L.LIVE_STATUSES } = {}) {
  const { db } = ctx;
  const row = await one(db,
    `UPDATE calls SET status = $2, ended_at = now(), updated_at = now(),
            duration_sec = CASE WHEN answered_at IS NOT NULL
                                THEN GREATEST(0, round(EXTRACT(EPOCH FROM (now() - answered_at))))::int END
      WHERE id = $1 AND status = ANY($3::text[]) RETURNING *`,
    [callId, status, from]);
  if (!row) return null;
  const { rows: parts } = await db.query(
    `UPDATE call_participants SET left_at = now() WHERE call_id = $1 AND joined_at IS NOT NULL AND left_at IS NULL RETURNING *`,
    [callId]);
  let call = row;
  let message = null;
  try {
    ({ call, message } = await postCallMessage(ctx, row));
  } catch (err) {
    warn(ctx, err, 'wiadomość o połączeniu');
  }
  await emitRows(ctx, 'calls', 'update', [call]);
  if (parts.length) await emitRows(ctx, 'call_participants', 'update', parts);
  // Rozłącz wszystkich (np. drugą osobę po odłożeniu w 1:1, dzwoniącego po „nieodebranym”).
  Promise.resolve().then(() => ctx.deps?.livekit?.deleteRoom?.(call.room_name)).catch(() => {});
  // Nieodebrane połączenie 1:1 — push jak o wiadomości (z wyciszeniem i cichymi godzinami).
  if (!call.is_group && ['missed', 'cancelled'].includes(status) && message && typeof ctx.deps?.notifyMessage === 'function') {
    Promise.resolve()
      .then(() => ctx.deps.notifyMessage({
        pool: db, table: 'messages', op: 'insert', values: message, actingUserEmail: call.started_by_email, log: ctx.log,
      }))
      .catch(() => {});
  }
  return call;
}

// ── Token ───────────────────────────────────────────────────────────────────
async function tokenFor(ctx, user, call, canPublish) {
  const email = lower(user.email);
  const profile = await profileOf(ctx.db, email);
  const token = await ctx.deps.livekit.mintToken({
    identity: email,
    name: profile.name,
    room: call.room_name,
    canPublish,
    metadata: { email, name: profile.name, avatar_url: profile.avatar_url },
  });
  return { token, url: ctx.deps.livekit.settings.url, room: call.room_name, can_publish: !!canPublish };
}

// Dołączenie do istniejącego połączenia (po sprawdzeniu dostępu).
async function joinInternal(ctx, user, call, { conv, role }) {
  const { db } = ctx;
  if (!L.isLive(call.status)) throw new ApiError(410, 'To połączenie już się zakończyło', 'CALL_ENDED');
  const me = lower(user.email);
  const isCaller = me === lower(call.started_by_email);
  const part = await upsertParticipant(db, call.id, me, { response: 'accepted' });
  await emitRows(ctx, 'call_participants', 'upsert', [part]);
  let current = call;
  if (!isCaller && call.status === 'ringing') {
    const updated = call.is_group
      ? await one(db, `UPDATE calls SET answered_at = now(), updated_at = now() WHERE id = $1 AND status = 'ringing' AND answered_at IS NULL RETURNING *`, [call.id])
      : await one(db, `UPDATE calls SET status = 'active', answered_at = COALESCE(answered_at, now()), updated_at = now() WHERE id = $1 AND status = 'ringing' RETURNING *`, [call.id]);
    if (updated) {
      current = updated;
      await emitRows(ctx, 'calls', 'update', [updated]);
    } else {
      current = (await getCall(db, call.id)) || call;
      if (!L.isLive(current.status)) throw new ApiError(410, 'To połączenie już się zakończyło', 'CALL_ENDED');
    }
  }
  return { call: current, ...(await tokenFor(ctx, user, current, L.canPublishIn(conv, role))) };
}

// ── Akcje (fn) ──────────────────────────────────────────────────────────────
// call-start { conversation_id, kind } → { call, token, url, room, can_publish, joined_existing }
export async function startCall(ctx, user, body = {}) {
  assertEnabled(ctx);
  const { db } = ctx;
  const me = lower(user?.email);
  const conversationId = String(body.conversation_id ?? '').trim();
  if (!me || !UUID_RE.test(conversationId)) throw new ApiError(400, 'Wskaż rozmowę', 'BAD_REQUEST');
  const kind = L.normalizeKind(body.kind);
  const { conv, role, others } = await callAccess(db, me, conversationId);
  if (!L.canPublishIn(conv, role)) {
    throw new ApiError(403, 'W tym kanale połączenie może rozpocząć tylko administrator', 'POSTING_RESTRICTED');
  }
  if (others && !others.length) throw new ApiError(400, 'W tej rozmowie nie ma do kogo zadzwonić', 'NO_RECIPIENT');

  const live = await liveCallOf(db, conversationId);
  if (live) return { ...(await joinInternal(ctx, user, live, { conv, role })), joined_existing: true };

  const id = randomUUID();
  const inserted = await one(db,
    `INSERT INTO calls (id, conversation_id, room_name, kind, is_group, started_by_email, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ringing')
     ON CONFLICT DO NOTHING RETURNING *`,
    [id, conversationId, L.roomNameFor(ctx.tenantSlug, id), kind, conv.type !== 'direct', me]);
  if (!inserted) {
    // Wyścig: ktoś w tej chwili zaczął połączenie w tej rozmowie — dołączamy do niego.
    const again = await liveCallOf(db, conversationId);
    if (!again) throw new ApiError(409, 'Nie udało się rozpocząć połączenia — spróbuj ponownie', 'CALL_CONFLICT');
    return { ...(await joinInternal(ctx, user, again, { conv, role })), joined_existing: true };
  }

  let call = inserted;
  const part = await upsertParticipant(db, call.id, me, { response: 'accepted' });
  // Rozmowa grupowa: od razu wiadomość „trwa — dołącz” (po zakończeniu — czas trwania).
  if (call.is_group) {
    try { ({ call } = await postCallMessage(ctx, call)); } catch (err) { warn(ctx, err, 'wiadomość grupowa'); }
  }
  await emitRows(ctx, 'calls', 'insert', [call]);
  await emitRows(ctx, 'call_participants', 'insert', [part]);
  const access = await tokenFor(ctx, user, call, true);

  scheduleRingTimeout(ctx, call.id);
  Promise.resolve().then(() => ringParticipants(ctx, call)).catch((err) => warn(ctx, err, 'dzwonienie (push)'));
  return { call, ...access, joined_existing: false };
}

// call-join { call_id } → { call, token, url, room, can_publish }
export async function joinCall(ctx, user, body = {}) {
  assertEnabled(ctx);
  const me = lower(user?.email);
  const call = await getCall(ctx.db, body.call_id);
  if (!call) throw new ApiError(404, 'Nie znaleziono połączenia', 'NOT_FOUND');
  const { conv, role } = await callAccess(ctx.db, me, call.conversation_id);
  return joinInternal(ctx, user, call, { conv, role });
}

async function memberCall(ctx, me, callId) {
  const call = await getCall(ctx.db, callId);
  if (!call) throw new ApiError(404, 'Nie znaleziono połączenia', 'NOT_FOUND');
  if (!(await isMember(ctx.db, call.conversation_id, me))) {
    throw new ApiError(403, 'To połączenie nie dotyczy Twojej rozmowy', 'NOT_PARTICIPANT');
  }
  return call;
}

// call-decline { call_id } → { ok, call }. 1:1 — połączenie odrzucone; grupa — tylko ja nie odbieram.
export async function declineCall(ctx, user, body = {}) {
  const me = lower(user?.email);
  const call = await memberCall(ctx, me, body.call_id);
  if (call.status !== 'ringing' || me === lower(call.started_by_email)) return { ok: true, call };
  const part = await upsertParticipant(ctx.db, call.id, me, { response: 'declined' });
  await emitRows(ctx, 'call_participants', 'upsert', [part]);
  if (!call.is_group) {
    const done = await finishCall(ctx, call.id, 'declined', { from: ['ringing'] });
    return { ok: true, call: done || (await getCall(ctx.db, call.id)) || call };
  }
  return { ok: true, call };
}

// call-cancel { call_id } → { ok, call }. Dzwoniący rezygnuje przed odebraniem.
export async function cancelCall(ctx, user, body = {}) {
  const me = lower(user?.email);
  const call = await memberCall(ctx, me, body.call_id);
  if (me !== lower(call.started_by_email)) throw new ApiError(403, 'Anulować może tylko osoba dzwoniąca', 'NOT_CALLER');
  if (call.status !== 'ringing') return { ok: true, call };
  // Grupa, w której ktoś już odebrał — rozmowa trwa dalej bez dzwoniącego.
  if (call.is_group && call.answered_at) return leaveCall(ctx, user, body);
  const done = await finishCall(ctx, call.id, 'cancelled', { from: ['ringing'] });
  return { ok: true, call: done || (await getCall(ctx.db, call.id)) || call };
}

// call-leave { call_id } → { ok, call }. Najlepszy wysiłek — rozstrzyga webhook LiveKit.
export async function leaveCall(ctx, user, body = {}) {
  const me = lower(user?.email);
  const call = await memberCall(ctx, me, body.call_id);
  if (!L.isLive(call.status)) return { ok: true, call };
  const part = await one(ctx.db,
    `UPDATE call_participants SET left_at = now() WHERE call_id = $1 AND user_email = $2 AND left_at IS NULL RETURNING *`,
    [call.id, me]);
  if (part) await emitRows(ctx, 'call_participants', 'update', [part]);
  // Grupa: koniec dopiero po zamknięciu pokoju (webhook room_finished / worker).
  const decision = L.decisionOnLeave(call, me, { remaining: null });
  if (decision) {
    const done = await finishCall(ctx, call.id, decision);
    return { ok: true, call: done || (await getCall(ctx.db, call.id)) || call };
  }
  return { ok: true, call };
}

// call-config → { enabled, url } (web: czy pokazywać przyciski połączeń).
export async function callConfig(ctx) {
  const lk = ctx.deps?.livekit;
  return { enabled: !!lk?.enabled, url: lk?.enabled ? lk.settings.url : null };
}

// ── Dzwonienie (push) ───────────────────────────────────────────────────────
// Push wysokiego priorytetu do pozostałych uczestników: bez wyciszonych rozmów i cichych godzin
// (realtime i baner „trwa rozmowa” dostają wszyscy) i bez osób, które zablokowały dzwoniącego.
export async function ringParticipants(ctx, call) {
  const { db } = ctx;
  if (typeof ctx.deps?.sendPush !== 'function') return { sent: 0 };
  const parts = await recipientsOf(db, call.conversation_id, call.started_by_email);
  if (!parts.length) return { sent: 0 };
  const blockedBy = new Set();
  try {
    const { rows } = await db.query(
      `SELECT lower(blocker_email) AS e FROM user_blocks WHERE lower(blocked_email) = lower($1)`, [call.started_by_email]);
    for (const r of rows) blockedBy.add(r.e);
  } catch { /* brak tabeli (przed 088) */ }
  const caller = await profileOf(db, call.started_by_email);
  let convName = '';
  if (call.is_group) {
    const c = await one(db, `SELECT name FROM conversations WHERE id = $1`, [call.conversation_id]).catch(() => null);
    convName = String(c?.name || '').trim();
  }
  const video = call.kind === 'video';
  const title = call.is_group ? (convName || 'Rozmowa grupowa') : caller.name;
  const body = call.is_group
    ? `${caller.name} zaprasza do rozmowy grupowej${video ? ' wideo' : ''}`
    : (video ? 'Przychodzące połączenie wideo' : 'Przychodzące połączenie głosowe');
  const link = `${messageLink(call.conversation_id)}&call=${encodeURIComponent(call.id)}`;
  const now = new Date();
  let sent = 0;
  for (const p of parts.slice(0, MAX_RING_PUSHES)) {
    const email = lower(p.user_email);
    if (blockedBy.has(email)) continue;
    const kind = pushKind({
      muted: p.muted,
      mutedUntil: p.muted_until,
      quiet: isQuietNow({ start: p.quiet_hours_start, end: p.quiet_hours_end, timezone: p.timezone }, now),
      personalMention: false,
      allMention: false,
      now,
    });
    if (kind !== 'message') continue;
    try {
      await ctx.deps.sendPush(db, {
        user_email: p.user_email,
        title,
        body,
        link,
        tag: `call-${call.id}`,
        data: {
          type: 'call',
          call_id: call.id,
          conversation_id: call.conversation_id,
          kind: call.kind,
          is_group: !!call.is_group,
          from_name: caller.name,
          from_email: call.started_by_email,
        },
        sound: 'default',
      });
      sent++;
    } catch (err) {
      warn(ctx, err, 'push dzwonienia');
    }
  }
  return { sent };
}

// ── Okno dzwonienia (45 s) ──────────────────────────────────────────────────
export function scheduleRingTimeout(ctx, callId) {
  if (ctx.deps?.timers === false) return;
  const t = setTimeout(() => {
    expireRinging(ctx, callId).catch((err) => warn(ctx, err, 'koniec dzwonienia'));
  }, (L.RING_TIMEOUT_SEC + 1) * 1000);
  t.unref?.();
}

// Połączenie nadal „ringing” po 45 s: 1:1 → nieodebrane; grupa → trwa (ktoś odebrał / jest w
// pokoju) albo nieodebrane. Idempotentne (timer w API + worker co minutę).
export async function expireRinging(ctx, callId) {
  const { db } = ctx;
  const call = await one(db,
    `SELECT * FROM calls WHERE id = $1 AND status = 'ringing' AND started_at <= now() - $2 * interval '1 second'`,
    [callId, L.RING_TIMEOUT_SEC]);
  if (!call) return null;
  let inRoom = 0;
  if (call.is_group && !call.answered_at) {
    const occ = ctx.deps?.livekit?.enabled ? await ctx.deps.livekit.roomOccupancy?.([call.room_name]) : null;
    inRoom = occ ? (occ.get(call.room_name) || 0) : await peopleInRoomDb(db, call.id);
  }
  const decision = L.ringTimeoutDecision(call, { inRoom });
  if (decision === 'active') {
    const row = await one(db, `UPDATE calls SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'ringing' RETURNING *`, [call.id]);
    if (row) await emitRows(ctx, 'calls', 'update', [row]);
    return row;
  }
  if (decision) return finishCall(ctx, call.id, decision, { from: ['ringing'] });
  return null;
}

// Worker (co minutę, per tenant): przeterminowane dzwonienie + uzgodnienie z LiveKit (pokój
// zniknął, a webhook nie dotarł) + twardy limit długości. Zwraca liczbę zmienionych połączeń.
export async function sweepCalls(ctx) {
  const { db } = ctx;
  let changed = 0;
  const { rows: ringing } = await db.query(
    `SELECT id FROM calls WHERE status = 'ringing' AND started_at <= now() - $1 * interval '1 second' ORDER BY started_at LIMIT 200`,
    [L.RING_TIMEOUT_SEC]);
  for (const r of ringing) if (await expireRinging(ctx, r.id)) changed++;

  const { rows: live } = await db.query(
    `SELECT * FROM calls WHERE status IN ('ringing', 'active') AND started_at <= now() - interval '90 seconds' ORDER BY started_at LIMIT 500`);
  if (!live.length) return changed;
  const occ = ctx.deps?.livekit?.enabled ? await ctx.deps.livekit.roomOccupancy?.(live.map((c) => c.room_name)) : null;
  for (const c of live) {
    let status = null;
    if (occ) {
      if (!(occ.get(c.room_name) > 0)) status = L.finalStatusOnRoomEnd(c);
    } else if (L.ageSec(c) > STALE_LIVE_HOURS * 3600) {
      status = L.finalStatusOnRoomEnd(c);
    }
    if (status && (await finishCall(ctx, c.id, status))) changed++;
  }
  return changed;
}

// ── Webhook LiveKit ─────────────────────────────────────────────────────────
// event: { event, room: { name }, participant: { identity } } (zweryfikowany podpis — routes.js).
export async function handleLivekitEvent(ctx, event) {
  const { db } = ctx;
  const roomName = event?.room?.name;
  if (!roomName) return { ignored: 'no_room' };
  const call = await one(db, `SELECT * FROM calls WHERE room_name = $1`, [roomName]);
  if (!call) return { ignored: 'unknown_room' };
  const identity = lower(event?.participant?.identity);

  switch (event.event) {
    case 'participant_joined': {
      if (!identity) return { ignored: 'no_identity' };
      if (!L.isLive(call.status)) {
        // Wejście starym tokenem do zakończonej rozmowy (LiveKit założył pokój od nowa) — zamknij.
        await ctx.deps?.livekit?.deleteRoom?.(call.room_name);
        return { action: 'closed_stale_room' };
      }
      const part = await upsertParticipant(db, call.id, identity, { response: 'accepted', joined: true });
      await emitRows(ctx, 'call_participants', 'upsert', [part]);
      if (identity !== lower(call.started_by_email) && call.status === 'ringing') {
        const updated = call.is_group
          ? await one(db, `UPDATE calls SET answered_at = now(), updated_at = now() WHERE id = $1 AND status = 'ringing' AND answered_at IS NULL RETURNING *`, [call.id])
          : await one(db, `UPDATE calls SET status = 'active', answered_at = COALESCE(answered_at, now()), updated_at = now() WHERE id = $1 AND status = 'ringing' RETURNING *`, [call.id]);
        if (updated) await emitRows(ctx, 'calls', 'update', [updated]);
        return { action: 'answered' };
      }
      return { action: 'joined' };
    }
    case 'participant_left':
    case 'participant_connection_aborted': {
      if (!identity) return { ignored: 'no_identity' };
      const part = await one(db,
        `UPDATE call_participants SET left_at = now() WHERE call_id = $1 AND user_email = $2 AND left_at IS NULL RETURNING *`,
        [call.id, identity]);
      if (part) await emitRows(ctx, 'call_participants', 'update', [part]);
      const remaining = call.is_group ? await peopleInRoomDb(db, call.id) : null;
      const decision = L.decisionOnLeave(call, identity, { remaining });
      if (decision && (await finishCall(ctx, call.id, decision))) return { action: decision };
      return { action: 'left' };
    }
    case 'room_finished': {
      const status = L.finalStatusOnRoomEnd(call);
      if (status && (await finishCall(ctx, call.id, status))) return { action: status };
      return { action: 'noop' };
    }
    default:
      return { ignored: event?.event || 'unknown_event' };
  }
}
