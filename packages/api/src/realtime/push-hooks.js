// Automatyczne powiadomienia push wyzwalane zapisami przez Data API (/api/db).
// Wołane fire-and-forget PO wysłaniu odpowiedzi — nigdy nie może rzucić do klienta
// ani opóźnić zapisu. Wszystko owinięte w try/catch, błędy tylko logowane.
//
// Obsługiwane inserty:
//   - messages              → push do uczestników (nie wyciszonych); @wzmianki → push 'mention' zawsze
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
  // (nawet przy wyciszeniu); reszta — zwykły push wiadomości, o ile nie wyciszyli rozmowy.
  const mentioned = new Set(parseMentions(msg.mentions).map((e) => String(e).toLowerCase()));

  const { rows: parts } = await pool.query(
    `SELECT user_email, COALESCE(muted, false) AS muted
       FROM conversation_participants
      WHERE conversation_id = $1 AND lower(user_email) <> lower($2)`,
    [conversationId, senderEmail],
  );
  if (!parts.length) return;

  const { rows: sender } = await pool.query(
    `SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS display
       FROM app_users WHERE lower(email) = lower($1) LIMIT 1`,
    [senderEmail],
  );
  const senderName = sender[0]?.display || senderEmail;
  const body = messagePreview(msg);
  const link = messageLink(conversationId);

  for (const p of parts) {
    const isMentioned = mentioned.has(String(p.user_email).toLowerCase());
    if (isMentioned) {
      await sendPushCore(pool, {
        user_email: p.user_email,
        title: `${senderName} wspomniał(a) Cię`,
        body,
        link,
        data: { type: 'mention', conversation_id: conversationId },
        sound: 'receive.wav',
      });
    } else if (!p.muted) {
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
