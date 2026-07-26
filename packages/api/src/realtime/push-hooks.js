// Automatyczne powiadomienia push wyzwalane zapisami przez Data API (/api/db).
// Wołane fire-and-forget PO wysłaniu odpowiedzi — nigdy nie może rzucić do klienta
// ani opóźnić zapisu. Wszystko owinięte w try/catch, błędy tylko logowane.
//
// Obsługiwane inserty:
//   - messages              → push do uczestników rozmowy (poza nadawcą, nie wyciszonych)
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

  // Odbiorcy: uczestnicy rozmowy poza nadawcą, którzy nie wyciszyli rozmowy.
  const { rows: recipients } = await pool.query(
    `SELECT user_email FROM conversation_participants
      WHERE conversation_id = $1
        AND lower(user_email) <> lower($2)
        AND COALESCE(muted, false) = false`,
    [conversationId, senderEmail],
  );
  if (!recipients.length) return;

  const { rows: sender } = await pool.query(
    `SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS display
       FROM app_users WHERE lower(email) = lower($1) LIMIT 1`,
    [senderEmail],
  );
  const title = sender[0]?.display || senderEmail;
  const body = messagePreview(msg);
  const link = `/messenger/${conversationId}`;

  for (const r of recipients) {
    await sendPushCore(pool, {
      user_email: r.user_email,
      title,
      body,
      link,
      data: { type: 'message', conversation_id: conversationId },
    });
  }
}

function messagePreview(msg) {
  const text = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (text) return text.length > 140 ? `${text.slice(0, 139)}…` : text;
  const attachments = msg.attachments;
  const hasAttachment = Array.isArray(attachments)
    ? attachments.length > 0
    : typeof attachments === 'string'
      ? attachments !== '[]' && attachments !== ''
      : Boolean(attachments);
  return hasAttachment ? '📎 Załącznik' : 'Nowa wiadomość';
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
