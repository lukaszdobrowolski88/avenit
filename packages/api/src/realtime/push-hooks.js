// Automatyczne powiadomienia push wyzwalane zapisami przez Data API (/api/db).
// Wołane fire-and-forget PO wysłaniu odpowiedzi — nigdy nie może rzucić do klienta
// ani opóźnić zapisu. Wszystko owinięte w try/catch, błędy tylko logowane.
//
// Obsługiwane inserty:
//   - messages              → push do uczestników (nie wyciszonych, poza cichymi godzinami);
//                             @wzmianka osobista → push 'mention' zawsze; @wszyscy ("*") → 'mention'
//                             także wyciszonym, ale z poszanowaniem cichych godzin
//   - schedule_assignments  → push do zaproszonego do służby (status 'pending')
import { sendPushCore } from '../fn/send-push.js';

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
