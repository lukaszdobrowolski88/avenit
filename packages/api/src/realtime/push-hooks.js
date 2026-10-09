// Automatyczne powiadomienia push wyzwalane zapisami przez Data API (/api/db).
// Wołane fire-and-forget PO wysłaniu odpowiedzi — nigdy nie może rzucić do klienta
// ani opóźnić zapisu. Wszystko owinięte w try/catch, błędy tylko logowane.
//
// Obsługiwane inserty:
//   - messages              → push do uczestników (nie wyciszonych, poza cichymi godzinami);
//                             @wzmianka osobista → push 'mention' zawsze; @wszyscy ("*") → 'mention'
//                             także wyciszonym, ale z poszanowaniem cichych godzin
//   - schedule_assignments  → push do zaproszonego do służby (status 'pending')
// Zadania osobiste (user_tasks) — przypisanie innej osobie (assigned_to_email ustawione albo
// zmienione): wpis w skrzynce + realtime + push dla przypisanego (prepareUserTaskAssign przed
// zapisem, notifyUserTaskAssign po zapisie — jak boardNotify dla elementów tablic).
import { sendPushCore } from '../fn/send-push.js';
import { buildQuery } from '../dataapi/querybuilder.js';
import { deliverNotifications, displayNameOf } from '../dataapi/boardNotify.js';

export async function notifyOnWrite({ pool, table, op, values, actingUserEmail, log }) {
  if (op !== 'insert' || !values) return;
  const rows = Array.isArray(values) ? values : [values];
  try {
    if (table === 'messages') {
      for (const row of rows) await notifyNewMessage(pool, row, actingUserEmail);
    } else if (table === 'schedule_assignments') {
      for (const row of rows) await notifyNewAssignment(pool, row);
    }
  } catch (err) {
    (log?.error ?? console.error).call(log ?? console, { err }, '[push-hooks] błąd');
  }
}

// ── Nowa wiadomość ──────────────────────────────────────────────────────────
async function notifyNewMessage(pool, msg, actingUserEmail) {
  const conversationId = msg.conversation_id;
  const senderEmail = msg.sender_email || actingUserEmail;
  if (!conversationId || !senderEmail) return;

  // Nowa wiadomość wyciąga rozmowę z archiwum (jak w WhatsAppie) — inaczej zarchiwizowana rozmowa
  // dostawała wiadomości i powiadomienia, a na liście rozmów jej nie było.
  await pool.query(
    `UPDATE conversation_participants SET archived = false WHERE conversation_id = $1 AND archived = true`,
    [conversationId],
  ).catch(() => undefined);

  // Wzmianki (@) z messages.mentions — wspomniani dostają osobny push 'mention' ZAWSZE
  // (nawet przy wyciszeniu i w cichych godzinach); reszta — zwykły push wiadomości, o ile nie
  // wyciszyli rozmowy (muted / muted_until) i nie trwają ich ciche godziny.
  const mentionList = parseMentions(msg.mentions).map((e) => String(e).toLowerCase());
  const mentioned = new Set(mentionList);
  const mentionsAll = mentioned.has('*');

  const parts = await recipientsOf(pool, conversationId, senderEmail);
  if (!parts.length) return;

  // Osoby, które zablokowały nadawcę, nie dostają powiadomień z jego treścią (K10).
  const blockedBy = new Set();
  try {
    const { rows } = await pool.query(
      `SELECT lower(blocker_email) AS e FROM user_blocks WHERE lower(blocked_email) = lower($1)`, [senderEmail]);
    for (const r of rows) blockedBy.add(r.e);
  } catch { /* brak tabeli (przed migracją 088) */ }

  const { rows: sender } = await pool.query(
    `SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS display
       FROM app_users WHERE lower(email) = lower($1) LIMIT 1`,
    [senderEmail],
  );
  const senderName = sender[0]?.display || senderEmail;
  const body = messagePreview(msg);
  const link = messageLink(conversationId);
  const now = new Date();

  for (const p of parts) {
    const email = String(p.user_email).toLowerCase();
    if (blockedBy.has(email)) continue;
    const kind = pushKind({
      muted: p.muted,
      mutedUntil: p.muted_until,
      quiet: isQuietNow({ start: p.quiet_hours_start, end: p.quiet_hours_end, timezone: p.timezone }, now),
      personalMention: mentioned.has(email),
      allMention: mentionsAll,
      now,
    });
    if (kind === 'mention') {
      await sendPushCore(pool, {
        user_email: p.user_email,
        title: mentioned.has(email) ? `${senderName} wspomniał(a) Cię` : `${senderName} wspomniał(a) wszystkich`,
        body,
        link,
        data: { type: 'mention', conversation_id: conversationId },
        sound: 'receive.wav',
      });
    } else if (kind === 'message') {
      await sendPushCore(pool, {
        user_email: p.user_email,
        title: senderName,
        body,
        link,
        data: { type: 'message', conversation_id: conversationId },
        sound: 'receive.wav',
      });
    }
  }
}

// Odbiorcy z wyciszeniem i cichymi godzinami. Przed migracją 088 (brak muted_until) — starsze
// zapytanie, żeby powiadomienia nie przestały działać przy innej kolejności wdrożenia.
async function recipientsOf(pool, conversationId, senderEmail) {
  try {
    const { rows } = await pool.query(
      `SELECT cp.user_email, COALESCE(cp.muted, false) AS muted, cp.muted_until,
              pup.quiet_hours_start, pup.quiet_hours_end, pup.timezone
         FROM conversation_participants cp
         LEFT JOIN LATERAL (
           SELECT quiet_hours_start, quiet_hours_end, timezone FROM push_user_preferences u
            WHERE lower(u.user_email) = lower(cp.user_email) LIMIT 1
         ) pup ON true
        WHERE cp.conversation_id = $1 AND lower(cp.user_email) <> lower($2)`,
      [conversationId, senderEmail],
    );
    return rows;
  } catch {
    const { rows } = await pool.query(
      `SELECT user_email, COALESCE(muted, false) AS muted
         FROM conversation_participants
        WHERE conversation_id = $1 AND lower(user_email) <> lower($2)`,
      [conversationId, senderEmail],
    );
    return rows;
  }
}

// Rodzaj powiadomienia dla odbiorcy: 'mention' | 'message' | null (bez powiadomienia).
//  • @wzmianka osobista — zawsze (także wyciszeni i w cichych godzinach),
//  • @wszyscy — także wyciszeni, ale nie w cichych godzinach,
//  • zwykła wiadomość — nie przy wyciszeniu (muted albo muted_until w przyszłości) i nie w ciszy.
export function pushKind({ muted, mutedUntil, quiet, personalMention, allMention, now = new Date() }) {
  if (personalMention) return 'mention';
  if (allMention) return quiet ? null : 'mention';
  if (muted === true) return null;
  if (mutedUntil) {
    const t = mutedUntil instanceof Date ? mutedUntil.getTime() : Date.parse(mutedUntil);
    if (Number.isFinite(t) && t > now.getTime()) return null;
  }
  if (quiet) return null;
  return 'message';
}

// Ciche godziny odbiorcy (push_user_preferences: TIME od–do, strefa; domyślnie Europe/Warsaw).
// Zakres przez północ (22:00–07:00) obsługiwany; od == do = brak cichych godzin.
const toMinutes = (t) => {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return (h % 24) * 60 + min;
};
export function localMinutes(now, timezone) {
  const fmt = (tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let parts;
  try { parts = fmt(timezone || 'Europe/Warsaw').formatToParts(now); } catch { parts = fmt('Europe/Warsaw').formatToParts(now); }
  const h = Number(parts.find((x) => x.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}
export function isQuietNow({ start, end, timezone } = {}, now = new Date()) {
  const s = toMinutes(start); const e = toMinutes(end);
  if (s == null || e == null || s === e) return false;
  const cur = localMinutes(now, timezone);
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

// Link z powiadomienia: ścieżka webu (/komunikator?conversation=…) — otwiera rozmowę w przeglądarce
// (push przeglądarkowy) i w aplikacji (deep-links.ts rozpoznaje ten format). Dawny link
// /messenger/<id> działał tylko w aplikacji; w webie prowadził na nieistniejącą stronę.
export function messageLink(conversationId) {
  return `/komunikator?conversation=${encodeURIComponent(String(conversationId))}`;
}

// Treść powiadomienia — jak podgląd na liście rozmów (chatLogic.previewText): zdjęcie, głosówka,
// plik opisane słowami zamiast pustego „Załącznik”.
export function messagePreview(msg) {
  const text = typeof msg.content === 'string' ? msg.content.replace(/\s+/g, ' ').trim() : '';
  const short = text.length > 100 ? `${text.slice(0, 99)}…` : text;
  // Podglądy bogatych typów (spec §7).
  if (msg.message_type === 'poll') return `📊 ${short || 'Ankieta'}`;
  if (msg.message_type === 'prayer') return `🙏 ${short || 'Prośba o modlitwę'}`;
  if (msg.message_type === 'event') return `📅 ${short || 'Wydarzenie'}`;
  if (text) return text.length > 140 ? `${text.slice(0, 139)}…` : text;
  let attachments = msg.attachments;
  if (typeof attachments === 'string') {
    try { attachments = JSON.parse(attachments); } catch { attachments = []; }
  }
  const list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (!list.length) return 'Nowa wiadomość';
  const isVoice = (a) => a.isVoiceMessage === true || String(a.type || '').startsWith('audio/') || String(a.name || '').startsWith('voice-');
  if (list.some(isVoice)) return '🎤 Wiadomość głosowa';
  const images = list.filter((a) => String(a.type || '').startsWith('image/')).length;
  if (images === list.length) return images > 1 ? `📷 Zdjęcia: ${images}` : '📷 Zdjęcie';
  if (list.length > 1) return `📎 Załączniki: ${list.length}`;
  return `📎 ${String(list[0].name || '').trim() || 'Załącznik'}`;
}

// messages.mentions bywa tablicą (JSONB) albo stringiem (serializacja) — oba na tablicę e-maili.
function parseMentions(m) {
  if (!m) return [];
  if (Array.isArray(m)) return m.filter((x) => typeof x === 'string');
  if (typeof m === 'string') {
    try {
      const a = JSON.parse(m);
      return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ── Zaproszenie do służby ─────────────────────────────────────────────────────
async function notifyNewAssignment(pool, assignment) {
  const email = assignment.assigned_email;
  const status = assignment.status || 'pending';
  if (!email || status !== 'pending') return;

  // id jest generowane przez DB (gen_random_uuid) i zwykle nie ma go w danych insertu.
  // Dociągnij najnowsze pasujące zaproszenie — potrzebne do przycisków Akceptuj/Odrzuć
  // (mobile: kategoria 'assignment_invite' + handleAssignmentAction czyta data.assignmentId).
  let assignmentId = assignment.id ?? null;
  if (!assignmentId && assignment.program_id != null) {
    const { rows } = await pool.query(
      `SELECT id FROM schedule_assignments
        WHERE program_id = $1 AND lower(assigned_email) = lower($2) AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1`,
      [assignment.program_id, email],
    );
    assignmentId = rows[0]?.id ?? null;
  }

  let programLabel = '';
  if (assignment.program_id != null) {
    const { rows } = await pool.query(
      `SELECT date, title FROM programs WHERE id = $1 LIMIT 1`,
      [assignment.program_id],
    );
    if (rows[0]) {
      const dateLabel = formatDatePl(rows[0].date);
      const titleLabel = rows[0].title ? String(rows[0].title).trim() : '';
      programLabel = [titleLabel, dateLabel].filter(Boolean).join(' · ');
    }
  }

  const role = assignment.role_key || assignment.team_type || 'służba';
  const body = programLabel ? `${role} — ${programLabel}` : `Nowe zaproszenie: ${role}`;

  await sendPushCore(pool, {
    user_email: email,
    title: 'Nowe zaproszenie do służby',
    body,
    link: assignment.program_id != null ? `/programs/${assignment.program_id}` : '/dashboard',
    // Kategoria z przyciskami Akceptuję/Odrzucam — tylko gdy znamy id (inaczej akcja
    // nie miałaby na czym działać); bez id zostaje zwykłe powiadomienie z tapnięciem.
    category_id: assignmentId ? 'assignment_invite' : undefined,
    data: {
      type: 'assignment',
      assignmentId,
      program_id: assignment.program_id ?? null,
    },
  });
}

// Format DATE (YYYY-MM-DD lub Date) → DD.MM.YYYY bez pułapek strefy czasowej.
function formatDatePl(value) {
  if (!value) return '';
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

// ── Zadanie osobiste przypisane innej osobie (user_tasks.assigned_to_email) ──────────────
const lowerEmail = (v) => String(v ?? '').trim().toLowerCase();
const taskRows = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((r) => r && typeof r === 'object');
const MAX_TASK_ROWS = 200;

// PRZED zapisem przez /api/db: null (nic do zrobienia) albo { op, values, before: Map(id → wiersz) }.
// Odczyt stanu w zakresie zapisu (filtry + własność wierszy z ownership.js). Nigdy nie rzuca.
export async function prepareUserTaskAssign(db, q) {
  try {
    if (q?.table !== 'user_tasks' || !q.values || !['insert', 'update', 'upsert'].includes(q.op)) return null;
    const rows = taskRows(q.values);
    if (!rows.length || rows.length > MAX_TASK_ROWS) return null;
    if (!rows.some((r) => 'assigned_to_email' in r && lowerEmail(r.assigned_to_email))) return null;
    const prep = { op: q.op, values: rows, before: new Map() };
    if (q.op === 'insert') return prep;
    const filters = q.op === 'update'
      ? q.filters
      : [{ type: 'in', column: 'id', value: rows.map((r) => r.id).filter((v) => v != null) }];
    if (!filters?.length) return null;
    const built = buildQuery({
      table: 'user_tasks', op: 'select', select: 'id,user_email,assigned_to_email,title,due_date',
      filters, limit: MAX_TASK_ROWS, __ownerScope: q.__ownerScope,
    });
    const { rows: found } = await db.query(built.sql, built.params);
    for (const r of found) prep.before.set(String(r.id), r);
    return prep;
  } catch {
    return null;
  }
}

// Zmiany przypisania po zapisie (czyste — testy): [{ id, title, due_date, to }] — tylko gdy nowy
// adresat jest inny niż poprzedni (bez względu na wielkość liter). Zwrócone wiersze (RETURNING)
// mają pierwszeństwo; bez nich — zapisane wartości + stan sprzed zapisu.
export function userTaskAssignChanges(prep, data, rowCount) {
  if (!prep) return [];
  const out = [];
  const add = (row, prev) => {
    const to = lowerEmail(row.assigned_to_email);
    if (!to || to === lowerEmail(prev?.assigned_to_email)) return;
    out.push({ id: row.id ?? prev?.id ?? null, title: row.title ?? prev?.title ?? '', due_date: row.due_date ?? prev?.due_date ?? null, to });
  };
  const returned = taskRows(data);
  if (returned.length) {
    for (const r of returned) {
      const prev = r.id != null ? prep.before.get(String(r.id)) : null;
      if (prep.op === 'update' && !prev) continue; // wiersz spoza odczytanego zakresu
      add(r, prev);
    }
    return out;
  }
  if (!rowCount) return out;
  if (prep.op === 'insert') {
    for (const v of prep.values) add(v, null);
  } else if (prep.op === 'update') {
    const v = prep.values[0] || {};
    if (!('assigned_to_email' in v)) return out;
    for (const prev of prep.before.values()) add({ ...prev, ...v, id: prev.id }, prev);
  } else {
    for (const v of prep.values) add(v, v.id != null ? prep.before.get(String(v.id)) : null);
  }
  return out;
}

const dayLabel = (d) => {
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}` : '';
};

// PO zapisie, fire-and-forget: wpis w skrzynce (typ 'task') + realtime + push dla przypisanego —
// aktywne konto, nie autor zmiany. deps (testy): { sendPush, emit }.
export async function notifyUserTaskAssign({ db, tenant, prep, data, rowCount, actor, log, deps = {} }) {
  try {
    const actorEmail = lowerEmail(actor?.email);
    const changes = userTaskAssignChanges(prep, data, rowCount).filter((c) => c.to !== actorEmail).slice(0, 50);
    if (!changes.length) return { sent: 0 };
    const { rows: users } = await db.query(
      `SELECT email FROM app_users WHERE lower(email) = ANY($1::text[]) AND COALESCE(is_active, true)`,
      [[...new Set(changes.map((c) => c.to))]]);
    const accounts = new Map(users.map((u) => [lowerEmail(u.email), u.email]));
    const targets = changes.filter((c) => accounts.has(c.to));
    if (!targets.length) return { sent: 0 };
    const name = await displayNameOf(db, actor?.email || '');
    const entries = targets.map((c) => {
      const title = String(c.title || '').trim() || 'Zadanie';
      const due = dayLabel(c.due_date);
      const payload = { user_task_id: c.id };
      return {
        user_email: accounts.get(c.to),
        type: 'task',
        title: `${name} przypisał(a) Ci zadanie`,
        body: due ? `${title} · termin ${due}` : title,
        link: c.id != null ? `/?task=${encodeURIComponent(String(c.id))}` : '/',
        data: payload,
        push: { type: 'task', ...payload },
      };
    });
    // Bez okna duplikatów — o tym, czy to nowe przypisanie, decyduje porównanie przed/po.
    return await deliverNotifications({ db, tenant, entries, deps, log, dedupeMinutes: 0 });
  } catch (err) {
    (log?.error ?? console.error).call(log ?? console, { err }, '[push-hooks] przypisanie zadania');
    return { sent: 0 };
  }
}
