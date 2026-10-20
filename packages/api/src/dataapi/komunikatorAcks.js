// Komunikator — „Ważne — potwierdź przeczytanie” (migracja 115).
//
// Wiadomość z messages.requires_ack = true: odbiorcy klikają „Rozumiem” (message_acks), nadawca
// i administratorzy rozmowy widzą „Potwierdziło X z Y” z listą osób i mogą przypomnieć
// niepotwierdzonym (push, najwyżej raz na 6 h na wiadomość).
// Zapis potwierdzeń WYŁĄCZNIE tutaj (fn chat-ack) — przez /api/db tabela jest tylko do odczytu
// (uczestnicy rozmowy, zakres komunikator.js). Każda zmiana idzie realtime do uczestników rozmowy.
//
// Zasady pushu przypomnienia: tylko niepotwierdzeni, z pominięciem tych, którzy zablokowali nadawcę
// wiadomości; przebija wyciszenie rozmowy (to prośba nadawcy/administratora, jak @wszyscy), ale
// szanuje ciche godziny odbiorcy (te osoby są liczone jako „pominięte — ciche godziny”).
import { ApiError } from './querybuilder.js';
import { isMember, conversationAudience } from './komunikator.js';
import { emitChange } from '../realtime/hub.js';
import { sendPushCore } from '../fn/send-push.js';
import {
  recipientsOf, isQuietNow, messagePreview, conversationPlace, IMPORTANT_PREFIX,
} from '../realtime/push-hooks.js';
// Link ze skokiem do wiadomości (&message=) — ten sam co „Przypomnij mi” (web i aplikacja).
import { reminderLink } from '../chatSchedule/service.js';

export const REMIND_INTERVAL_MS = 6 * 3600 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lower = (v) => String(v ?? '').trim().toLowerCase();
const isTrue = (v) => v === true || v === 'true' || v === 't';
const iso = (v) => (v == null ? null : (v instanceof Date ? v : new Date(v)).toISOString());

export const ACK_ERRORS = {
  notFound: 'Nie znaleziono tej wiadomości.',
  notImportant: 'Ta wiadomość nie prosi o potwierdzenie.',
  own: 'Własnej wiadomości nie trzeba potwierdzać.',
  noAccess: 'Brak dostępu do tej rozmowy.',
  statusForbidden: 'Listę potwierdzeń widzi nadawca i administratorzy rozmowy.',
  tooSoon: 'Przypomnienie można wysłać raz na 6 godzin.',
  missing: 'Potwierdzenia nie są jeszcze dostępne. Spróbuj ponownie później.',
};

// Brak tabeli/kolumny (tenant przed migracją 115) → czytelny błąd zamiast 500.
const missingSchema = (err) => err && (err.code === '42P01' || err.code === '42703');
async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
    if (missingSchema(err)) throw new ApiError(503, ACK_ERRORS.missing, 'ACK_UNAVAILABLE');
    throw err;
  }
}

async function loadMessage(db, messageId) {
  if (!UUID_RE.test(String(messageId ?? ''))) throw new ApiError(400, ACK_ERRORS.notFound, 'ACK_NOT_FOUND');
  const { rows } = await db.query(
    `SELECT id, conversation_id, sender_email, content, message_type, attachments, requires_ack, deleted_at, created_at
       FROM messages WHERE id = $1`,
    [String(messageId)],
  );
  const msg = rows[0];
  if (!msg || msg.deleted_at) throw new ApiError(404, ACK_ERRORS.notFound, 'ACK_NOT_FOUND');
  return msg;
}

// Wiadomość ważna + jestem uczestnikiem rozmowy → { msg, role }.
async function accessible(db, messageId, me) {
  const msg = await loadMessage(db, messageId);
  const member = await isMember(db, msg.conversation_id, me);
  if (!member) throw new ApiError(403, ACK_ERRORS.noAccess, 'ACK_NO_ACCESS');
  if (!isTrue(msg.requires_ack)) throw new ApiError(400, ACK_ERRORS.notImportant, 'ACK_NOT_IMPORTANT');
  return { msg, role: member.role };
}

// Nadawca albo administrator rozmowy (lista potwierdzeń, przypomnienie).
export const canManageAcks = (msg, role, me) => lower(msg?.sender_email) === lower(me) || role === 'admin';

async function assertManager(db, messageId, me) {
  const ctx = await accessible(db, messageId, me);
  if (!canManageAcks(ctx.msg, ctx.role, me)) throw new ApiError(403, ACK_ERRORS.statusForbidden, 'ACK_STATUS_FORBIDDEN');
  return ctx;
}

// Czyste (testy): odbiorcy [{ email, name }] + potwierdzenia [{ email, acked_at }] →
// { total, acked_count, acked: [...] (od najwcześniejszego), pending: [...] (alfabetycznie) }.
// Liczymy tylko obecnych uczestników (bez nadawcy) — potwierdzenia osób, które wyszły, odpadają.
export function summarizeAcks(recipients = [], acks = []) {
  const ackAt = new Map();
  for (const a of acks) {
    const e = lower(a?.email ?? a?.user_email);
    if (e && !ackAt.has(e)) ackAt.set(e, a.acked_at ?? null);
  }
  const seen = new Set();
  const acked = [];
  const pending = [];
  for (const r of recipients) {
    const email = lower(r?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const person = { email, name: String(r.name || '').trim() || email };
    if (ackAt.has(email)) acked.push({ ...person, acked_at: iso(ackAt.get(email)) });
    else pending.push(person);
  }
  acked.sort((a, b) => String(a.acked_at ?? '').localeCompare(String(b.acked_at ?? '')));
  pending.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return { total: acked.length + pending.length, acked_count: acked.length, acked, pending };
}

// Kiedy wolno przypomnieć ponownie (null = od razu).
export function nextRemindAt(lastSentAt, now = Date.now()) {
  if (!lastSentAt) return null;
  const t = new Date(lastSentAt).getTime() + REMIND_INTERVAL_MS;
  return Number.isFinite(t) && t > now ? new Date(t).toISOString() : null;
}

async function recipientsWithNames(db, msg) {
  const { rows } = await db.query(
    `SELECT lower(cp.user_email) AS email,
            COALESCE(NULLIF(u.full_name, ''), NULLIF(u.name, ''), cp.user_email) AS name
       FROM conversation_participants cp
       LEFT JOIN LATERAL (
         SELECT full_name, name FROM app_users a WHERE lower(a.email) = lower(cp.user_email) LIMIT 1
       ) u ON true
      WHERE cp.conversation_id = $1 AND lower(cp.user_email) <> lower($2)`,
    [msg.conversation_id, msg.sender_email],
  );
  return rows;
}

async function acksOf(db, messageId) {
  const { rows } = await db.query(
    `SELECT lower(user_email) AS email, acked_at FROM message_acks WHERE message_id = $1 ORDER BY acked_at`,
    [String(messageId)],
  );
  return rows;
}

async function lastReminder(db, messageId) {
  const { rows } = await db.query(`SELECT last_sent_at FROM message_ack_reminders WHERE message_id = $1`, [String(messageId)]);
  return rows[0]?.last_sent_at ?? null;
}

const emitFn = (ctx) => ctx.deps?.emit || emitChange;

// „Rozumiem”. Ponowne kliknięcie nic nie psuje (zwraca istniejące potwierdzenie).
export async function ackMessage(ctx, user, body = {}) {
  return guarded(async () => {
    const me = lower(user?.email);
    const { msg } = await accessible(ctx.db, body.message_id, me);
    if (lower(msg.sender_email) === me) throw new ApiError(400, ACK_ERRORS.own, 'ACK_OWN');
    const { rows } = await ctx.db.query(
      `INSERT INTO message_acks (message_id, user_email) VALUES ($1, $2)
       ON CONFLICT (message_id, user_email) DO NOTHING RETURNING *`,
      [msg.id, me],
    );
    let ack = rows[0] || null;
    if (ack && ctx.tenantSlug) {
      const audience = await conversationAudience(ctx.db, 'message_acks', [ack]).catch(() => new Set());
      emitFn(ctx)(ctx.tenantSlug, 'message_acks', 'insert', [ack], { audience });
    }
    if (!ack) {
      const { rows: existing } = await ctx.db.query(
        `SELECT * FROM message_acks WHERE message_id = $1 AND user_email = $2`, [msg.id, me]);
      ack = existing[0] || null;
    }
    return { ok: true, ack };
  });
}

// Lista: kto potwierdził (z godziną), kto jeszcze nie; stan przypomnienia.
export async function ackStatus(ctx, user, body = {}) {
  return guarded(async () => {
    const me = lower(user?.email);
    const { msg } = await assertManager(ctx.db, body.message_id, me);
    const summary = summarizeAcks(await recipientsWithNames(ctx.db, msg), await acksOf(ctx.db, msg.id));
    const last = await lastReminder(ctx.db, msg.id);
    return {
      message_id: msg.id,
      ...summary,
      last_reminded_at: iso(last),
      next_remind_at: nextRemindAt(last, ctx.deps?.now?.() ?? Date.now()),
    };
  });
}

// Treść przypomnienia (czyste — testy).
export function reminderPushText({ conv, senderName, preview }) {
  const place = conversationPlace(conv);
  return {
    title: `${IMPORTANT_PREFIX}potwierdź przeczytanie${place ? ` — ${place}` : ''}`,
    body: `${senderName}: ${preview}`,
  };
}

// Przypomnij niepotwierdzonym. Limit raz na 6 h na wiadomość pilnuje baza (warunkowy upsert —
// dwa równoczesne kliknięcia nie wyślą podwójnie). Gdy wszyscy potwierdzili — limit nie przepada.
export async function remindAck(ctx, user, body = {}) {
  return guarded(async () => {
    const me = lower(user?.email);
    const { msg } = await assertManager(ctx.db, body.message_id, me);
    const db = ctx.db;
    const summary = summarizeAcks(await recipientsWithNames(db, msg), await acksOf(db, msg.id));
    if (!summary.pending.length) {
      return { ok: true, sent: 0, pending: 0, skipped_quiet: 0, next_remind_at: nextRemindAt(await lastReminder(db, msg.id)) };
    }
    const { rows: stamp } = await db.query(
      `INSERT INTO message_ack_reminders (message_id, last_sent_at, sent_by, sent_count) VALUES ($1, now(), $2, 1)
       ON CONFLICT (message_id) DO UPDATE
         SET last_sent_at = now(), sent_by = EXCLUDED.sent_by, sent_count = message_ack_reminders.sent_count + 1
       WHERE message_ack_reminders.last_sent_at <= now() - interval '6 hours'
       RETURNING last_sent_at`,
      [msg.id, me],
    );
    if (!stamp[0]) {
      const next = nextRemindAt(await lastReminder(db, msg.id)) || iso(Date.now() + REMIND_INTERVAL_MS);
      throw Object.assign(new ApiError(429, ACK_ERRORS.tooSoon, 'ACK_REMIND_TOO_SOON'), { next_remind_at: next });
    }

    const pendingSet = new Set(summary.pending.map((p) => p.email));
    const parts = (await recipientsOf(db, msg.conversation_id, msg.sender_email)).filter((p) => pendingSet.has(lower(p.user_email)));
    const blockedBy = new Set();
    try {
      const { rows } = await db.query(
        `SELECT lower(blocker_email) AS e FROM user_blocks WHERE lower(blocked_email) = lower($1)`, [msg.sender_email]);
      for (const r of rows) blockedBy.add(r.e);
    } catch { /* brak tabeli (przed migracją 088) */ }
    const now = new Date(ctx.deps?.now?.() ?? Date.now());
    const targets = [];
    let skippedQuiet = 0;
    for (const p of parts) {
      const email = lower(p.user_email);
      if (blockedBy.has(email)) continue;
      if (isQuietNow({ start: p.quiet_hours_start, end: p.quiet_hours_end, timezone: p.timezone }, now)) { skippedQuiet += 1; continue; }
      targets.push(p.user_email);
    }

    const [{ rows: convRows }, { rows: sender }] = await Promise.all([
      db.query(`SELECT type, name FROM conversations WHERE id = $1 LIMIT 1`, [msg.conversation_id]),
      db.query(`SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS display FROM app_users WHERE lower(email) = lower($1) LIMIT 1`, [msg.sender_email]),
    ]);
    const text = reminderPushText({ conv: convRows[0] || null, senderName: sender[0]?.display || msg.sender_email, preview: messagePreview(msg) });
    const send = ctx.deps?.sendPush || sendPushCore;
    const dispatch = async () => {
      for (const email of targets) {
        try {
          await send(db, {
            user_email: email,
            ...text,
            link: reminderLink(msg.conversation_id, msg.id),
            data: { type: 'message', important: true, reminder: true, conversation_id: msg.conversation_id, message_id: msg.id },
            sound: 'receive.wav',
          });
        } catch (err) {
          ctx.log?.warn?.({ err }, 'chat-ack: push przypomnienia');
        }
      }
    };
    // Wysyłka w tle (odpowiedź nie czeka na dostawców pushy); w testach — do końca (deps.inline).
    if (ctx.deps?.inline) await dispatch();
    else dispatch().catch(() => undefined);
    return {
      ok: true,
      sent: targets.length,
      pending: summary.pending.length,
      skipped_quiet: skippedQuiet,
      last_reminded_at: iso(stamp[0].last_sent_at),
      next_remind_at: nextRemindAt(stamp[0].last_sent_at, now.getTime()),
    };
  });
}

// Plakietka „Ważne” na liście rozmów: ile ważnych wiadomości czeka na moje potwierdzenie
// (w rozmowach, w których jestem; nie moje, nieusunięte) → { counts: { [conversation_id]: n } }.
export async function pendingAcks(ctx, user) {
  return guarded(async () => {
    const me = lower(user?.email);
    if (!me) return { counts: {} };
    const { rows } = await ctx.db.query(
      `SELECT m.conversation_id::text AS conversation_id, count(*)::int AS n
         FROM messages m
         JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND lower(cp.user_email) = $1
        WHERE m.requires_ack AND m.deleted_at IS NULL AND lower(m.sender_email) <> $1
          AND NOT EXISTS (SELECT 1 FROM message_acks a WHERE a.message_id = m.id AND a.user_email = $1)
        GROUP BY m.conversation_id`,
      [me],
    );
    const counts = {};
    for (const r of rows) counts[r.conversation_id] = r.n;
    return { counts };
  });
}

export const ACK_ACTIONS = { ack: ackMessage, status: ackStatus, remind: remindAck, pending: pendingAcks };
