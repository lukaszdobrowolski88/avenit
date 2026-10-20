// Komunikator: zaplanowane wiadomości i „Przypomnij mi” (migracja 113).
//
// Zaplanowana wiadomość: zapis teraz (fn chat-scheduled), wysyłka o send_at przez worker —
// JAKO NADAWCA, tą samą ścieżką co /api/db: uprawnienie res:messages:create, strażnik rozmów
// (komunikator.js: uczestnictwo, kanał „tylko administratorzy”, @wszyscy, blokady i polityka 1:1),
// filtr wulgaryzmów, realtime do uczestników i push-hooki (pushe, wzmianki, wyjście z archiwum;
// wpis w Powiadomieniach robi trigger bazy). Odmowa strażnika = 'failed' z powodem (bez ponowień);
// błąd chwilowy (baza) — ponowienie w kolejnej minucie, najwyżej RETRY_WINDOW po terminie.
// Przypomnienie: o remind_at push + wpis w Powiadomieniach (typ 'reminder') z linkiem do
// wiadomości; kto opuścił rozmowę albo wiadomość usunięto — przypomnienie przepada ('cancelled').
//
// Zależności wstrzykiwane (testy): deps = { emit, notifyMessage, deliver, now }.
import { ApiError, buildQuery } from '../dataapi/querybuilder.js';
import { canAccess } from '../dataapi/registry.js';
import { enforceConversationWrite, conversationAudience } from '../dataapi/komunikator.js';
import { deliverNotifications } from '../dataapi/boardNotify.js';
import { filterUserContent } from '../lib/moderation.js';
import { emitChange } from '../realtime/hub.js';
import { notifyOnWrite, messagePreview, conversationPlace } from '../realtime/push-hooks.js';
import { isValidChatTime, MIN_LEAD_MS, MAX_AHEAD_MS } from '@avenit/shared/src/lib/chatSchedule.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTENT = 10_000;
const MAX_ATTACHMENTS = 10;
const MAX_MENTIONS = 200;
export const MAX_PENDING_SCHEDULED = 100;
export const MAX_PENDING_REMINDERS = 200;
// Błąd chwilowy (np. restart bazy) — ponawiamy co minutę, ale nie dłużej niż 30 min po terminie.
export const RETRY_WINDOW_MS = 30 * 60_000;
const BATCH = 100;

export const MSG = {
  badConversation: 'Nie wybrano rozmowy.',
  empty: 'Wiadomość jest pusta.',
  tooLong: 'Wiadomość jest za długa.',
  badTime: 'Wybierz termin w przyszłości (najwyżej rok naprzód).',
  notFound: 'Nie znaleziono zaplanowanej wiadomości.',
  notPending: 'Ta wiadomość została już wysłana albo anulowana.',
  tooMany: 'Masz już za dużo zaplanowanych wiadomości. Wyślij albo anuluj którąś z nich.',
  badReply: 'Wiadomość, na którą odpowiadasz, jest w innej rozmowie.',
  inactive: 'Twoje konto jest nieaktywne.',
  sendFailed: 'Nie udało się wysłać zaplanowanej wiadomości. Spróbuj ponownie.',
  reminderMessage: 'Nie znaleziono tej wiadomości.',
  reminderNotMember: 'Przypomnienia ustawisz tylko dla wiadomości z Twoich rozmów.',
  reminderNotFound: 'Nie znaleziono przypomnienia.',
  reminderTooMany: 'Masz już za dużo przypomnień. Usuń któreś z nich.',
};

// ── Zależności i kontekst ───────────────────────────────────────────────────
export function chatScheduleDeps(extra = {}) {
  return {
    emit: emitChange,
    notifyMessage: notifyOnWrite,
    deliver: deliverNotifications,
    now: () => new Date(),
    ...extra,
  };
}

export function ctxFromRequest(req) {
  return {
    db: req.db,
    tenantSlug: req.tenant?.slug,
    dbName: req.tenant?.db_name || req.tenant?.slug,
    log: req.log,
    deps: chatScheduleDeps(),
  };
}

// Kontekst workera (runForTenant) — pula tenanta + dane z worker.js.
export function ctxFromWorker(pool, wctx = {}, extra = {}) {
  return {
    db: pool,
    tenantSlug: wctx.tenantSlug,
    dbName: wctx.tenantDbName || wctx.tenantSlug,
    log: { error: (o, m) => wctx.log?.(m || '', o?.err?.message || ''), warn: (o, m) => wctx.log?.(m || '', o?.err?.message || '') },
    deps: chatScheduleDeps(extra),
  };
}

// Handler fn: wynik albo { error, code } z kodem HTTP z ApiError.
export async function runChatScheduleFn(req, reply, action) {
  try {
    return reply.send(await action(ctxFromRequest(req), req.user, req.body || {}));
  } catch (err) {
    if (err instanceof ApiError || (err && Number.isInteger(err.status))) {
      return reply.code(err.status).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    req.log?.error?.({ err }, 'chat-schedule: błąd');
    return reply.code(500).send({ error: 'Nie udało się zapisać. Spróbuj ponownie.' });
  }
}

// Transakcja, gdy pula ją daje (pg.Pool / atrapa w testach); inaczej zapytania po kolei.
async function withTx(db, fn) {
  if (typeof db.connect !== 'function') return fn(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const nowOf = (ctx) => (ctx.deps?.now ? ctx.deps.now() : new Date());
const emitOf = (ctx) => ctx.deps?.emit || emitChange;
const emit = (ctx, table, op, rows, opts) => {
  try { emitOf(ctx)(ctx.tenantSlug, table, op, rows, opts || {}); } catch { /* realtime nie blokuje */ }
};
const logErr = (ctx, err, msg) => { try { ctx.log?.error?.({ err }, msg); } catch { /* log */ } };

// ── Walidacja wejścia ───────────────────────────────────────────────────────
function uuidOf(v, message, code = 'BAD_REQUEST') {
  const s = String(v ?? '').trim();
  if (!UUID_RE.test(s)) throw new ApiError(400, message, code);
  return s;
}

function timeOf(v, now) {
  const ms = Date.parse(String(v ?? ''));
  if (!Number.isFinite(ms) || !isValidChatTime(ms, now)) throw new ApiError(400, MSG.badTime, 'BAD_TIME');
  return new Date(ms).toISOString();
}

// Załączniki jak w wiadomości (JSON z adresem pliku), najwyżej 10.
function attachmentsOf(v) {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new ApiError(400, 'Nieprawidłowe załączniki.', 'BAD_ATTACHMENTS');
  const list = v.filter((a) => a && typeof a === 'object' && typeof a.url === 'string' && a.url);
  if (list.length > MAX_ATTACHMENTS) throw new ApiError(400, 'Maksymalnie 10 załączników na wiadomość.', 'BAD_ATTACHMENTS');
  return list;
}

function mentionsOf(v) {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new ApiError(400, 'Nieprawidłowe wzmianki.', 'BAD_MENTIONS');
  return [...new Set(v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))].slice(0, MAX_MENTIONS);
}

function contentOf(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length > MAX_CONTENT) throw new ApiError(400, MSG.tooLong, 'TOO_LONG');
  return s;
}

// Wejście zaplanowanej wiadomości (tworzenie) — znormalizowane pola tabeli.
export function normalizeScheduledInput(body, { now = new Date() } = {}) {
  const conversation_id = uuidOf(body?.conversation_id, MSG.badConversation, 'BAD_CONVERSATION');
  const content = contentOf(body?.content);
  const attachments = attachmentsOf(body?.attachments);
  if (!content && !attachments.length) throw new ApiError(400, MSG.empty, 'EMPTY');
  const reply_to_id = body?.reply_to_id ? uuidOf(body.reply_to_id, MSG.badReply, 'BAD_REPLY') : null;
  return {
    conversation_id,
    content,
    attachments,
    mentions: mentionsOf(body?.mentions),
    reply_to_id,
    send_at: timeOf(body?.send_at, now),
  };
}

// ── Wysyłka jako nadawca (ta sama ścieżka co /api/db) ───────────────────────
async function accountOf(db, email) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.is_super_admin, u.is_active, to_jsonb(u)->>'status' AS status
       FROM app_users u WHERE lower(u.email) = lower($1) LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

const accountActive = (a) => !!a && a.is_active !== false && (!a.status || a.status === 'active');

// Wartości wiadomości z wiersza zaplanowanej (bez pustych pól).
function messageValues(row) {
  const v = { conversation_id: row.conversation_id, content: row.content ?? '' };
  const atts = Array.isArray(row.attachments) ? row.attachments : [];
  const ments = Array.isArray(row.mentions) ? row.mentions : [];
  v.attachments = atts;
  if (ments.length) v.mentions = ments;
  if (row.reply_to_id) v.reply_to_id = row.reply_to_id;
  return v;
}

// Strażnicy wysyłki dla nadawcy (bez zapisu): konto aktywne, res:messages:create, komunikator.js.
// Zwraca zapytanie gotowe do buildQuery (wartości po strażnikach i filtrze treści).
export async function guardMessageAs(db, ctx, senderEmail, values) {
  const account = await accountOf(db, senderEmail);
  if (!accountActive(account)) throw new ApiError(403, MSG.inactive, 'SENDER_INACTIVE');
  const access = await canAccess({ pool: db, dbName: ctx.dbName || ctx.tenantSlug || 'tenant', table: 'messages', op: 'insert', user: account });
  if (!access.ok) throw new ApiError(403, access.reason || 'Brak dostępu do Komunikatora', 'NO_ACCESS');
  const q = { table: 'messages', op: 'insert', values: { ...values }, returning: '*' };
  await enforceConversationWrite(q, { db, user: { id: account.id, email: account.email }, tenant: { slug: ctx.tenantSlug } });
  filterUserContent(q);
  return q;
}

// Wstawienie wiadomości jako nadawca (w transakcji wywołującego). Realtime i pushe — po COMMIT
// (announceMessage), żeby nie rozesłać wiadomości wycofanej transakcji.
export async function insertMessageAs(db, ctx, senderEmail, values) {
  const q = await guardMessageAs(db, ctx, senderEmail, values);
  const built = buildQuery(q);
  const { rows } = await db.query(built.sql, built.params);
  return rows[0];
}

export async function announceMessage(ctx, msg) {
  if (!msg) return;
  const audience = await conversationAudience(ctx.db, 'messages', [msg]).catch(() => new Set());
  emit(ctx, 'messages', 'insert', [msg], { audience });
  const notify = ctx.deps?.notifyMessage || notifyOnWrite;
  // Fire-and-forget jak w /api/db — błąd pushy nie cofa wysłanej wiadomości.
  Promise.resolve()
    .then(() => notify({ pool: ctx.db, table: 'messages', op: 'insert', values: msg, actingUserEmail: msg.sender_email, log: ctx.log }))
    .catch((err) => logErr(ctx, err, 'chat-schedule: push'));
}

// Odmowa strażnika (uczestnictwo, polityka, konto) — trwała; reszta (baza, sieć) — chwilowa.
const isPermanent = (err) => err instanceof ApiError || (err && Number.isInteger(err.status) && err.status < 500);

// Wysyłka jednej zaplanowanej wiadomości. ownerEmail — tylko wiersz tej osoby („Wyślij teraz”).
// → { status: 'sent' | 'failed' | 'retry' | 'skipped', row?, message?, error? }
export async function deliverScheduled(ctx, id, { ownerEmail = null, notifyFailure = false } = {}) {
  const now = nowOf(ctx);
  let out;
  try {
    out = await withTx(ctx.db, async (tx) => {
      const { rows } = await tx.query(
        `SELECT * FROM scheduled_messages WHERE id = $1 AND status = 'pending' FOR UPDATE SKIP LOCKED`, [id]);
      const row = rows[0];
      if (!row || (ownerEmail && lower(row.sender_email) !== lower(ownerEmail))) return null;
      const msg = await insertMessageAs(tx, ctx, row.sender_email, messageValues(row));
      const { rows: upd } = await tx.query(
        `UPDATE scheduled_messages SET status = 'sent', sent_at = $2, message_id = $3, error = NULL, updated_at = $2
          WHERE id = $1 RETURNING *`,
        [id, now.toISOString(), msg.id]);
      return { row: upd[0], msg };
    });
  } catch (err) {
    return failScheduled(ctx, id, err, { ownerEmail, notifyFailure, now });
  }
  if (!out) return { status: 'skipped' };
  emit(ctx, 'scheduled_messages', 'update', [out.row]);
  await announceMessage(ctx, out.msg);
  return { status: 'sent', row: out.row, message: out.msg };
}

async function failScheduled(ctx, id, err, { ownerEmail, notifyFailure, now }) {
  const permanent = isPermanent(err);
  const { rows: cur } = await ctx.db.query(`SELECT * FROM scheduled_messages WHERE id = $1`, [id]).catch(() => ({ rows: [] }));
  const row = cur[0];
  if (!row || row.status !== 'pending' || (ownerEmail && lower(row.sender_email) !== lower(ownerEmail))) {
    return { status: 'skipped', error: err };
  }
  const late = now.getTime() - new Date(row.send_at).getTime() > RETRY_WINDOW_MS;
  // Błąd chwilowy: worker ponowi w kolejnej minucie (najwyżej RETRY_WINDOW po terminie); przy
  // „Wyślij teraz” wiadomość też zostaje w kolejce, a osoba dostaje komunikat o błędzie.
  if (!permanent && (ownerEmail || !late)) {
    logErr(ctx, err, 'chat-schedule: wysyłka — ponowię');
    return { status: 'retry', error: err };
  }
  const reason = permanent ? String(err.message || MSG.sendFailed) : MSG.sendFailed;
  const { rows: upd } = await ctx.db.query(
    `UPDATE scheduled_messages SET status = 'failed', error = $2, updated_at = $3 WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, reason.slice(0, 500), now.toISOString()]);
  if (upd[0]) {
    emit(ctx, 'scheduled_messages', 'update', [upd[0]]);
    if (notifyFailure) await notifyScheduleFailure(ctx, upd[0]).catch((e) => logErr(ctx, e, 'chat-schedule: powiadomienie o błędzie'));
  }
  return { status: 'failed', row: upd[0] || row, error: err, reason };
}

// Nadawca dowiaduje się, że wiadomość nie wyszła (dzwonek + push), z linkiem do rozmowy.
async function notifyScheduleFailure(ctx, row) {
  const conv = await conversationRow(ctx.db, row.conversation_id);
  const place = conversationPlace(conv) || (conv ? await directPeerName(ctx.db, conv.id, row.sender_email) : null);
  const deliver = ctx.deps?.deliver || deliverNotifications;
  await deliver({
    db: ctx.db,
    tenant: { slug: ctx.tenantSlug },
    log: ctx.log,
    dedupeMinutes: 0,
    entries: [{
      user_email: row.sender_email,
      type: 'system',
      title: 'Nie wysłano zaplanowanej wiadomości',
      body: place ? `${place}: ${row.error || MSG.sendFailed}` : row.error || MSG.sendFailed,
      link: `/komunikator?conversation=${encodeURIComponent(String(row.conversation_id))}`,
      data: { conversation_id: row.conversation_id, scheduled_message_id: row.id },
      push: { type: 'scheduled_failed', conversation_id: row.conversation_id, scheduled_message_id: row.id },
    }],
  });
}

// Worker: wszystkie należne (send_at minęło) — po kolei, każda w swojej transakcji.
export async function runDueScheduled(ctx, { limit = BATCH } = {}) {
  const now = nowOf(ctx);
  const { rows } = await ctx.db.query(
    `SELECT id FROM scheduled_messages WHERE status = 'pending' AND send_at <= $1 ORDER BY send_at LIMIT $2`,
    [now.toISOString(), limit]);
  const stats = { sent: 0, failed: 0, retry: 0 };
  for (const { id } of rows) {
    const r = await deliverScheduled(ctx, id, { notifyFailure: true }).catch((err) => {
      logErr(ctx, err, 'chat-schedule: wysyłka');
      return { status: 'retry' };
    });
    if (r.status in stats) stats[r.status] += 1;
  }
  return stats;
}

// ── Zaplanowane: operacje właściciela ───────────────────────────────────────
async function ownScheduled(db, id, email) {
  const { rows } = await db.query(
    `SELECT * FROM scheduled_messages WHERE id::text = $1 AND lower(sender_email) = $2`, [String(id), lower(email)]);
  if (!rows[0]) throw new ApiError(404, MSG.notFound, 'NOT_FOUND');
  return rows[0];
}

async function assertReplyInConversation(db, replyId, convId) {
  if (!replyId) return;
  const { rows } = await db.query(`SELECT conversation_id FROM messages WHERE id::text = $1`, [String(replyId)]);
  if (!rows[0] || String(rows[0].conversation_id) !== String(convId)) throw new ApiError(400, MSG.badReply, 'BAD_REPLY');
}

export async function createScheduled(ctx, user, body) {
  const now = nowOf(ctx);
  const input = normalizeScheduledInput(body, { now });
  const { db } = ctx;
  await assertReplyInConversation(db, input.reply_to_id, input.conversation_id);
  // Te same zasady co przy wysyłce — od razu, a nie dopiero o czasie (i jeszcze raz przy wysyłce).
  const q = await guardMessageAs(db, ctx, user.email, messageValues(input));
  const content = q.values.content ?? input.content;
  const { rows: cnt } = await db.query(
    `SELECT count(*)::int AS n FROM scheduled_messages WHERE lower(sender_email) = $1 AND status = 'pending'`, [lower(user.email)]);
  if ((cnt[0]?.n || 0) >= MAX_PENDING_SCHEDULED) throw new ApiError(429, MSG.tooMany, 'TOO_MANY');
  const { rows } = await db.query(
    `INSERT INTO scheduled_messages (conversation_id, sender_email, content, attachments, mentions, reply_to_id, send_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $8) RETURNING *`,
    [input.conversation_id, q.values.sender_email || user.email, content, JSON.stringify(input.attachments),
      JSON.stringify(input.mentions), input.reply_to_id, input.send_at, now.toISOString()]);
  emit(ctx, 'scheduled_messages', 'insert', rows);
  return { scheduled: rows[0] };
}

// Edycja treści i/lub terminu. Nieudaną (failed) można poprawić i zaplanować ponownie.
export async function updateScheduled(ctx, user, body) {
  const now = nowOf(ctx);
  const { db } = ctx;
  const row = await ownScheduled(db, uuidOf(body?.id, MSG.notFound, 'NOT_FOUND'), user.email);
  if (!['pending', 'failed'].includes(row.status)) throw new ApiError(409, MSG.notPending, 'NOT_PENDING');
  const next = { ...row };
  if (body?.content !== undefined) next.content = contentOf(body.content);
  if (body?.mentions !== undefined) next.mentions = mentionsOf(body.mentions);
  if (body?.send_at !== undefined) next.send_at = timeOf(body.send_at, now);
  else if (!isValidChatTime(row.send_at, now)) throw new ApiError(400, MSG.badTime, 'BAD_TIME');
  const atts = Array.isArray(next.attachments) ? next.attachments : [];
  if (!next.content && !atts.length) throw new ApiError(400, MSG.empty, 'EMPTY');
  const q = await guardMessageAs(db, ctx, user.email, messageValues(next));
  const { rows } = await db.query(
    `UPDATE scheduled_messages SET content = $2, mentions = $3::jsonb, send_at = $4, status = 'pending', error = NULL, updated_at = $5
      WHERE id = $1 AND status IN ('pending', 'failed') RETURNING *`,
    [row.id, q.values.content ?? next.content, JSON.stringify(Array.isArray(next.mentions) ? next.mentions : []), new Date(next.send_at).toISOString(), now.toISOString()]);
  if (!rows[0]) throw new ApiError(409, MSG.notPending, 'NOT_PENDING');
  emit(ctx, 'scheduled_messages', 'update', rows);
  return { scheduled: rows[0] };
}

export async function cancelScheduled(ctx, user, body) {
  const now = nowOf(ctx);
  const row = await ownScheduled(ctx.db, uuidOf(body?.id, MSG.notFound, 'NOT_FOUND'), user.email);
  const { rows } = await ctx.db.query(
    `UPDATE scheduled_messages SET status = 'cancelled', updated_at = $2 WHERE id = $1 AND status IN ('pending', 'failed') RETURNING *`,
    [row.id, now.toISOString()]);
  if (!rows[0]) throw new ApiError(409, MSG.notPending, 'NOT_PENDING');
  emit(ctx, 'scheduled_messages', 'update', rows);
  return { scheduled: rows[0] };
}

// „Wyślij teraz” — od razu, tą samą ścieżką co worker; nieudana (failed) też.
export async function sendScheduledNow(ctx, user, body) {
  const now = nowOf(ctx);
  const row = await ownScheduled(ctx.db, uuidOf(body?.id, MSG.notFound, 'NOT_FOUND'), user.email);
  if (row.status === 'failed') {
    await ctx.db.query(`UPDATE scheduled_messages SET status = 'pending', error = NULL, updated_at = $2 WHERE id = $1 AND status = 'failed'`,
      [row.id, now.toISOString()]);
  } else if (row.status !== 'pending') {
    throw new ApiError(409, MSG.notPending, 'NOT_PENDING');
  }
  const r = await deliverScheduled(ctx, row.id, { ownerEmail: user.email });
  if (r.status === 'sent') return { scheduled: r.row, message: r.message };
  if (r.status === 'failed') {
    const e = r.error;
    throw new ApiError(e?.status || 403, r.reason || e?.message || MSG.sendFailed, e?.code || 'SEND_FAILED');
  }
  if (r.status === 'retry') throw new ApiError(503, MSG.sendFailed, 'SEND_FAILED');
  // Ktoś (worker) właśnie ją wysyła albo już wysłał.
  throw new ApiError(409, MSG.notPending, 'NOT_PENDING');
}

export async function listScheduled(ctx, user, body) {
  const params = [lower(user.email)];
  let where = `lower(sender_email) = $1 AND status IN ('pending', 'failed')`;
  if (body?.conversation_id) {
    params.push(uuidOf(body.conversation_id, MSG.badConversation, 'BAD_CONVERSATION'));
    where += ` AND conversation_id = $2`;
  }
  const { rows } = await ctx.db.query(`SELECT * FROM scheduled_messages WHERE ${where} ORDER BY send_at LIMIT 200`, params);
  return { scheduled: rows };
}

// ── Przypomnienia ───────────────────────────────────────────────────────────
async function conversationRow(db, convId) {
  const { rows } = await db.query(`SELECT id, type, name FROM conversations WHERE id::text = $1`, [String(convId)]).catch(() => ({ rows: [] }));
  return rows[0] || null;
}

async function displayName(db, email) {
  const { rows } = await db.query(
    `SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS n FROM app_users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
  return rows[0]?.n || email;
}

// Rozmowa 1:1 — imię drugiej osoby (nazwa „miejsca” w opisach).
async function directPeerName(db, convId, meEmail) {
  const { rows } = await db.query(
    `SELECT user_email FROM conversation_participants WHERE conversation_id::text = $1 AND lower(user_email) <> lower($2) LIMIT 1`,
    [String(convId), meEmail]);
  return rows[0] ? displayName(db, rows[0].user_email) : null;
}

const isMemberOf = async (db, convId, email) => {
  const { rows } = await db.query(
    `SELECT 1 FROM conversation_participants WHERE conversation_id::text = $1 AND lower(user_email) = $2 LIMIT 1`, [String(convId), lower(email)]);
  return rows.length > 0;
};

const messageGone = (m) => !m || !!m.deleted_at || m.is_deleted === true;

async function messageRow(db, id) {
  const { rows } = await db.query(`SELECT * FROM messages WHERE id::text = $1`, [String(id)]);
  return rows[0] || null;
}

// Odpowiedź w wątku (112: thread_root_id) — także &thread=<wiadomość główna>: web otwiera panel
// wątku, aplikacja ekran wątku (jak linki pushy w push-hooks.js).
export const reminderLink = (convId, messageId, threadRootId = null) => {
  const base = `/komunikator?conversation=${encodeURIComponent(String(convId))}&message=${encodeURIComponent(String(messageId))}`;
  return threadRootId ? `${base}&thread=${encodeURIComponent(String(threadRootId))}` : base;
};

// Treść przypomnienia: „Wiadomość od Jana w Zespół uwielbienia: …” (1:1 — „w rozmowie prywatnej”,
// własna — „Twoja wiadomość w …”).
export function reminderText({ conv, senderName, mine, preview }) {
  const place = conversationPlace(conv);
  const where = place ? `w ${place}` : 'w rozmowie prywatnej';
  const who = mine ? `Twoja wiadomość ${where}` : `Wiadomość od ${senderName} ${where}`;
  const text = String(preview || '').trim();
  const body = text ? `${who}: ${text}` : who;
  return { title: 'Przypomnienie', body: body.length > 220 ? `${body.slice(0, 219)}…` : body };
}

export async function createReminder(ctx, user, body) {
  const now = nowOf(ctx);
  const { db } = ctx;
  const messageId = uuidOf(body?.message_id, MSG.reminderMessage, 'BAD_MESSAGE');
  const remindAt = timeOf(body?.remind_at, now);
  const msg = await messageRow(db, messageId);
  if (messageGone(msg)) throw new ApiError(404, MSG.reminderMessage, 'NOT_FOUND');
  if (!(await isMemberOf(db, msg.conversation_id, user.email))) throw new ApiError(403, MSG.reminderNotMember, 'NOT_MEMBER');
  const me = lower(user.email);
  // Ponowne „Przypomnij mi” o tej samej wiadomości — nowy termin zamiast drugiego przypomnienia.
  const { rows: existing } = await db.query(
    `SELECT id FROM message_reminders WHERE lower(user_email) = $1 AND message_id = $2 AND status = 'pending' LIMIT 1`, [me, messageId]);
  let rows;
  if (existing[0]) {
    ({ rows } = await db.query(`UPDATE message_reminders SET remind_at = $2 WHERE id = $1 RETURNING *`, [existing[0].id, remindAt]));
    emit(ctx, 'message_reminders', 'update', rows);
  } else {
    const { rows: cnt } = await db.query(
      `SELECT count(*)::int AS n FROM message_reminders WHERE lower(user_email) = $1 AND status = 'pending'`, [me]);
    if ((cnt[0]?.n || 0) >= MAX_PENDING_REMINDERS) throw new ApiError(429, MSG.reminderTooMany, 'TOO_MANY');
    ({ rows } = await db.query(
      `INSERT INTO message_reminders (user_email, message_id, conversation_id, remind_at, created_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user.email, messageId, msg.conversation_id, remindAt, now.toISOString()]));
    emit(ctx, 'message_reminders', 'insert', rows);
  }
  return { reminder: rows[0] };
}

export async function cancelReminder(ctx, user, body) {
  const id = uuidOf(body?.id, MSG.reminderNotFound, 'NOT_FOUND');
  const { rows } = await ctx.db.query(
    `UPDATE message_reminders SET status = 'cancelled' WHERE id = $1 AND lower(user_email) = $2 AND status = 'pending' RETURNING *`,
    [id, lower(user.email)]);
  if (!rows[0]) throw new ApiError(404, MSG.reminderNotFound, 'NOT_FOUND');
  emit(ctx, 'message_reminders', 'update', rows);
  return { reminder: rows[0] };
}

// „Moje przypomnienia”: aktywne, z podglądem wiadomości i miejscem rozmowy. Treść tylko, gdy
// nadal jestem w rozmowie i wiadomość istnieje (available).
export async function listReminders(ctx, user, body = {}) {
  const { db } = ctx;
  const params = [lower(user.email)];
  let where = `lower(r.user_email) = $1 AND r.status = 'pending'`;
  if (body?.message_id) { params.push(uuidOf(body.message_id, MSG.reminderMessage, 'BAD_MESSAGE')); where += ` AND r.message_id = $2`; }
  const { rows } = await db.query(
    `SELECT r.*, m.content, m.message_type, m.attachments, m.sender_email, m.deleted_at,
            to_jsonb(m)->>'thread_root_id' AS thread_root_id,
            c.type AS conv_type, c.name AS conv_name,
            EXISTS (SELECT 1 FROM conversation_participants p
                     WHERE p.conversation_id = r.conversation_id AND lower(p.user_email) = $1) AS member
       FROM message_reminders r
       LEFT JOIN messages m ON m.id = r.message_id
       LEFT JOIN conversations c ON c.id = r.conversation_id
      WHERE ${where}
      ORDER BY r.remind_at LIMIT 200`,
    params);
  const out = [];
  for (const r of rows) {
    const available = !!r.member && !messageGone({ deleted_at: r.deleted_at, id: r.message_id });
    const conv = r.conv_type ? { type: r.conv_type, name: r.conv_name } : null;
    const place = conversationPlace(conv) || (available && conv ? await directPeerName(db, r.conversation_id, user.email) : null);
    out.push({
      id: r.id,
      message_id: r.message_id,
      conversation_id: r.conversation_id,
      remind_at: r.remind_at,
      created_at: r.created_at,
      available,
      conversation_title: place,
      conversation_type: r.conv_type || null,
      sender_email: available ? r.sender_email : null,
      sender_name: available && r.sender_email ? await displayName(db, r.sender_email) : null,
      preview: available ? messagePreview(r) : null,
      thread_root_id: available ? r.thread_root_id || null : null,
      link: reminderLink(r.conversation_id, r.message_id, available ? r.thread_root_id : null),
    });
  }
  return { reminders: out };
}

// Worker: należne przypomnienia. Każde w transakcji (SKIP LOCKED — dwa przebiegi nie wyślą dwa razy):
// status 'done' (wysyłamy po COMMIT) albo 'cancelled' (opuszczona rozmowa / usunięta wiadomość).
export async function runDueReminders(ctx, { limit = 200 } = {}) {
  const now = nowOf(ctx);
  const { rows: due } = await ctx.db.query(
    `SELECT id FROM message_reminders WHERE status = 'pending' AND remind_at <= $1 ORDER BY remind_at LIMIT $2`,
    [now.toISOString(), limit]);
  const stats = { sent: 0, skipped: 0 };
  for (const { id } of due) {
    let job = null;
    try {
      job = await withTx(ctx.db, async (tx) => {
        const { rows } = await tx.query(
          `SELECT * FROM message_reminders WHERE id = $1 AND status = 'pending' FOR UPDATE SKIP LOCKED`, [id]);
        const r = rows[0];
        if (!r) return null;
        const msg = await messageRow(tx, r.message_id);
        const ok = !messageGone(msg) && (await isMemberOf(tx, r.conversation_id, r.user_email));
        const { rows: upd } = await tx.query(
          `UPDATE message_reminders SET status = $2, done_at = $3 WHERE id = $1 RETURNING *`,
          [id, ok ? 'done' : 'cancelled', now.toISOString()]);
        return { reminder: upd[0], msg: ok ? msg : null };
      });
    } catch (err) {
      logErr(ctx, err, 'chat-reminders: przypomnienie');
      continue;
    }
    if (!job) continue;
    emit(ctx, 'message_reminders', 'update', [job.reminder]);
    if (!job.msg) { stats.skipped += 1; continue; }
    try {
      await sendReminder(ctx, job.reminder, job.msg);
      stats.sent += 1;
    } catch (err) {
      logErr(ctx, err, 'chat-reminders: wysyłka');
    }
  }
  return stats;
}

async function sendReminder(ctx, reminder, msg) {
  const { db } = ctx;
  const conv = await conversationRow(db, reminder.conversation_id);
  const mine = lower(msg.sender_email) === lower(reminder.user_email);
  const senderName = mine ? null : await displayName(db, msg.sender_email);
  const { title, body } = reminderText({ conv, senderName, mine, preview: messagePreview(msg) });
  const threadRootId = msg.thread_root_id || null;
  const data = {
    conversation_id: reminder.conversation_id, message_id: reminder.message_id, reminder_id: reminder.id,
    ...(threadRootId ? { thread_root_id: threadRootId } : {}),
  };
  const deliver = ctx.deps?.deliver || deliverNotifications;
  await deliver({
    db,
    tenant: { slug: ctx.tenantSlug },
    log: ctx.log,
    dedupeMinutes: 0,
    entries: [{
      user_email: reminder.user_email,
      type: 'reminder',
      title,
      body,
      link: reminderLink(reminder.conversation_id, reminder.message_id, threadRootId),
      data,
      push: { type: 'reminder', ...data },
    }],
  });
}

// Okno terminów (dla klientów i testów).
export const LIMITS = { MIN_LEAD_MS, MAX_AHEAD_MS, MAX_PENDING_SCHEDULED, MAX_PENDING_REMINDERS };
