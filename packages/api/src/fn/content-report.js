// Zgłoszenie treści spoza Komunikatora (prośba ze ściany modlitwy, wpis tablicy zespołu) i opcjonalna
// blokada autora. Wiadomości Komunikatora zgłasza się wprost przez /api/db (message_reports, K10).
// Klient nie zna e-maila autora (ściana modlitwy go nie zwraca, wpisy bywają anonimowe), więc
// autora ustala serwer. Zgłoszona prośba znika zgłaszającemu ze ściany (fn prayer-wall).
// Wpis anonimowy można zgłosić, ale nie zablokować autora — blokada ujawniłaby jego tożsamość
// na liście „Zablokowane osoby”.
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
import { notifyNewReport } from '../lib/moderation.js';

export const name = 'content-report';
export const method = 'POST';
export const rateLimit = { max: 20, timeWindow: '10 minutes' };

const LEADER_ROLES = ['superadmin', 'rada_starszych', 'koordynator', 'lider'];
const TYPES = ['prayer', 'wall_post'];
const lower = (v) => String(v || '').trim().toLowerCase();
const clip = (v, n) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

async function loadTarget(db, type, id, user) {
  if (type === 'prayer') {
    const { rows } = await db.query(
      `SELECT id, content, user_email, is_anonymous, visibility FROM prayer_requests WHERE id::text = $1`, [id]);
    const r = rows[0];
    if (!r) return null;
    if (r.visibility === 'leaders_only' && lower(r.user_email) !== lower(user.email)) {
      const { rows: u } = await db.query('SELECT role, is_super_admin FROM app_users WHERE id = $1', [user.id]);
      if (!u[0]?.is_super_admin && !LEADER_ROLES.includes(String(u[0]?.role || ''))) return null;
    }
    return { authorEmail: r.user_email, content: r.content, anonymous: !!r.is_anonymous };
  }
  const { rows } = await db.query(`SELECT id, title, content, author_email FROM wall_posts WHERE id::text = $1`, [id]);
  const r = rows[0];
  if (!r) return null;
  return { authorEmail: r.author_email, content: [r.title, r.content].filter(Boolean).join(' — '), anonymous: false };
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const type = String(req.body?.type || '');
  const id = String(req.body?.id || '');
  const reason = clip(req.body?.reason, 1000) || null;
  const block = req.body?.block === true;
  // „Zablokuj autora” bez zgłoszenia wysyła report:false; domyślnie zgłaszamy.
  const wantReport = req.body?.report !== false;
  if (!TYPES.includes(type) || !id) return reply.code(400).send({ error: 'Wskaż treść do zgłoszenia.' });

  const me = lower(req.user.email);
  const target = await loadTarget(req.db, type, id, req.user).catch(() => null);
  if (!target) return reply.code(404).send({ error: 'Nie znaleziono tej treści.' });
  if (lower(target.authorEmail) === me) return reply.code(400).send({ error: 'Nie można zgłosić własnej treści.' });

  let reported = false;
  if (wantReport) {
    const { rows: dup } = await req.db.query(
      `SELECT 1 FROM message_reports WHERE content_type = $1 AND target_id = $2 AND lower(reporter_email) = $3 AND status = 'open' LIMIT 1`,
      [type, id, me]);
    if (!dup.length) {
      const { rows } = await req.db.query(
        `INSERT INTO message_reports (content_type, target_id, reporter_email, reason, status, message_sender_email, message_content)
         VALUES ($1, $2, $3, $4, 'open', $5, $6) RETURNING *`,
        [type, id, req.user.email, reason, target.authorEmail || null, clip(target.content, 4000) || null]);
      reported = true;
      notifyNewReport({ db: req.db, tenant: req.tenant, report: rows[0], log: req.log });
    } else {
      reported = true;
    }
  }

  let blocked = false;
  if (block && target.authorEmail && !target.anonymous) {
    await req.db.query(
      `INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [me, lower(target.authorEmail)]);
    blocked = true;
  }

  return reply.send({ success: true, reported, blocked });
}
