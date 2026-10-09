// Worker: poranny skrót zadań (codziennie 07:00 Europe/Warsaw, worker.js; nadrabianie przy starcie
// workera do 12:00). Dla każdej osoby: zadania z terminem na dziś i zaległe (do `overdue_days` dni
// wstecz), niezrobione:
//   • elementy tablic przypisane do niej (board_items.assignee_emails, migracja 094) na tablicach,
//     które widzi i może otworzyć (prywatne — właściciel/edytorzy; moduł tablicy — jak my-board-items),
//     „zrobione” wg isDoneLabel;
//   • zadania osobiste (user_tasks), których jest właścicielem albo które ma przypisane.
// → JEDEN e-mail (po polsku, w identyfikacji Avenit) + JEDEN push „Masz N zadań na dziś”.
// Osoby bez zadań — nic. Znacznik task_digest_sends (migracja 095) DOPIERO po doręczeniu (mail albo
// push) — raz dziennie na osobę, nieudane można ponowić.
// Wyłączanie: organizacja — app_settings 'task_digest' = {"enabled": false} (domyślnie WŁĄCZONE);
// osoba — 'task_digest' w push_user_preferences.category_opt_outs (wtedy ani mail, ani push);
// push_user_preferences.enabled = false — bez pusha (mail zostaje).
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';
import { sendPushCore } from './send-push.js';
import { rsvpBase } from './rsvp-send.js';
import { escapeHtml } from './send-assignment-invites.js';
import { accessFor } from './board-import-legacy.js';
import { DUE_COLUMNS, DUE_COLUMN_LATERAL, boardCapability, statusOf } from './my-board-items.js';
import { warsawNow, addDaysYmd } from './board-automations-run.js';
import { boardVisibleTo } from '../dataapi/boardNotify.js';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';

export const name = 'task-digest';
export const skipRoute = true; // tylko worker

export const DIGEST_DEFAULTS = Object.freeze({ enabled: true, overdue_days: 14 });
export const OPT_OUT_CATEGORY = 'task_digest';
const MAX_ROWS = 5000;
const MAX_LISTED = 15; // tyle zadań na sekcję w mailu, reszta „i jeszcze N”

const lower = (v) => String(v ?? '').trim().toLowerCase();

// app_settings.task_digest (tekst JSON, obiekt albo 'true'/'false') → { enabled, overdue_days }.
export function digestConfig(raw) {
  let c = raw;
  if (typeof c === 'string') {
    const s = c.trim().toLowerCase();
    if (s === 'false' || s === 'off' || s === '0') return { ...DIGEST_DEFAULTS, enabled: false };
    if (s === 'true' || s === 'on' || s === '1') return { ...DIGEST_DEFAULTS };
    try { c = JSON.parse(c); } catch { c = null; }
  }
  if (c === false) return { ...DIGEST_DEFAULTS, enabled: false };
  if (!c || typeof c !== 'object' || Array.isArray(c)) c = {};
  const enabled = c.enabled === false || c.enabled === 'false' ? false : DIGEST_DEFAULTS.enabled;
  const n = Number(c.overdue_days);
  const overdue = Number.isFinite(n) ? Math.min(90, Math.max(0, Math.round(n))) : DIGEST_DEFAULTS.overdue_days;
  return { enabled, overdue_days: overdue };
}

// „1 zadanie”, „3 zadania”, „5 zadań”, „22 zadania”.
export function tasksWord(n) {
  const k = Math.abs(Number(n) || 0);
  if (k === 1) return 'zadanie';
  const d = k % 10;
  const h = k % 100;
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? 'zadania' : 'zadań';
}
export const digestTitle = (n) => `Masz ${n} ${tasksWord(n)} na dziś`;

// Elementy tablic z terminem (koniec osi czasu albo data) w [since, today], z przypisanymi osobami.
export function boardDueSql() {
  return `SELECT x.* FROM (
      SELECT i.id, i.board_id, i.name, i.cells, i.assignee_emails, ${DUE_COLUMNS('i')}
        FROM board_items i
        JOIN boards b ON b.id = i.board_id
        ${DUE_COLUMN_LATERAL('i')}
       WHERE i.parent_item_id IS NULL
         AND cardinality(i.assignee_emails) > 0
         AND coalesce(b.is_archived, false) = false
         AND coalesce(b.is_template, false) = false
    ) x
   WHERE x.due ~ '^\\d{4}-\\d{2}-\\d{2}$'
     AND coalesce(x.due_end, x.due) <= $1
     AND coalesce(x.due_end, x.due) >= $2
   ORDER BY coalesce(x.due_end, x.due), x.name, x.id
   LIMIT ${MAX_ROWS}`;
}

// Dzień terminu zadania osobistego wg typu kolumny (DATE / TIMESTAMPTZ w Warszawie / tekst).
export function userTaskDueExpr(dataType) {
  if (dataType === 'timestamp with time zone') return `to_char(t.due_date AT TIME ZONE 'Europe/Warsaw', 'YYYY-MM-DD')`;
  if (dataType === 'timestamp without time zone' || dataType === 'date') return `to_char(t.due_date, 'YYYY-MM-DD')`;
  return `left(t.due_date::text, 10)`;
}

// Skrót jednej osoby → zadania pogrupowane: zaległe (termin < dziś) i na dziś.
export function groupDigest(tasks, today) {
  const sorted = [...tasks].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : String(a.name).localeCompare(String(b.name), 'pl')));
  return { overdue: sorted.filter((t) => t.due < today), today: sorted.filter((t) => t.due >= today) };
}

// ── Treść ─────────────────────────────────────────────────────────────────────
// Barwy marki (jak maile grafiku): papier, słód, kurkuma, musztarda. Bez gradientów i emoji.
const C = {
  paper: '#F6F4EE', hero: '#FFF1C2', malt: '#2A2312', text: '#4A463E',
  muted: '#6B6557', mustard: '#8A6606', turmeric: '#FFBE0B', line: '#ECE8DE',
};
const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const dayLong = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export function digestEmailHtml({ name = '', groups, appUrl }) {
  const total = groups.overdue.length + groups.today.length;
  const hello = name ? `Dzień dobry, ${escapeHtml(name)}!` : 'Dzień dobry!';
  const intro = groups.overdue.length && groups.today.length
    ? 'Oto Twoje zadania na dziś i te, których termin już minął.'
    : groups.overdue.length ? 'Termin tych zadań już minął — może uda się je dziś domknąć.' : 'Oto Twoje zadania z terminem na dziś.';
  const label = `font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.mustard};`;
  const row = (t, overdue) => `
          <tr><td style="padding:12px 0;border-top:1px solid ${C.line};">
            <a href="${escapeHtml(t.url)}" target="_blank" style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${C.malt};text-decoration:none;">${escapeHtml(t.name || 'Zadanie')}</a>
            <div style="font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};">${escapeHtml([t.where, overdue ? `termin ${dayLong(t.due)}` : ''].filter(Boolean).join(' · '))}</div>
          </td></tr>`;
  const section = (title, list, overdue) => (list.length ? `
        <div style="${label}padding:20px 0 4px;">${title} (${list.length})</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list.slice(0, MAX_LISTED).map((t) => row(t, overdue)).join('')}
          ${list.length > MAX_LISTED ? `<tr><td style="padding:12px 0;border-top:1px solid ${C.line};font-family:${FONT};font-size:13px;color:${C.muted};">i jeszcze ${list.length - MAX_LISTED} — wszystkie w aplikacji</td></tr>` : ''}
        </table>` : '');
  const title = digestTitle(total);
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;600;700;800&display=swap" rel="stylesheet">
<style>
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media (max-width: 480px) { .card { padding: 28px 22px !important; } .h1 { font-size: 26px !important; line-height: 32px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper};">${escapeHtml(title)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
  <tr><td align="center" style="padding:32px 16px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 6px 16px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:800;color:${C.malt};">avenit<span style="color:${C.turmeric};">.</span></td></tr>
      <tr><td class="card" style="background:#FFFFFF;border-radius:24px;padding:36px 32px 32px;">
        <h1 class="h1" style="margin:0 0 12px;font-family:${FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.5px;color:${C.malt};">Zadania <span style="font-weight:300;">na dziś</span><span style="color:${C.turmeric};">.</span></h1>
        <p style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:23px;color:${C.text};">${hello} ${intro}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.hero};border-radius:18px;margin-top:12px;">
          <tr><td style="padding:16px 20px;font-family:${FONT};font-size:20px;line-height:26px;font-weight:800;color:${C.malt};">${escapeHtml(title)}</td></tr>
        </table>
        ${section('Zaległe', groups.overdue, true)}
        ${section('Na dziś', groups.today, false)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
          <tr><td align="center" bgcolor="${C.turmeric}" style="border-radius:999px;background:${C.turmeric};">
            <a href="${escapeHtml(appUrl)}" target="_blank" style="display:block;padding:15px 12px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:800;color:${C.malt};text-decoration:none;border-radius:999px;">Otwórz zadania</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 6px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};text-align:center;">Codzienny skrót zadań wysłany automatycznie z aplikacji Avenit.</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function digestEmailText({ name = '', groups, appUrl }) {
  const total = groups.overdue.length + groups.today.length;
  const line = (t, overdue) => `• ${t.name || 'Zadanie'}${t.where ? ` (${t.where})` : ''}${overdue ? ` — termin ${dayLong(t.due)}` : ''}\n  ${t.url}`;
  const part = (title, list, overdue) => (list.length ? [`${title} (${list.length}):`, ...list.slice(0, MAX_LISTED).map((t) => line(t, overdue)),
    ...(list.length > MAX_LISTED ? [`i jeszcze ${list.length - MAX_LISTED} — wszystkie w aplikacji`] : []), ''] : []);
  return [
    `${name ? `Dzień dobry, ${name}!` : 'Dzień dobry!'} ${digestTitle(total)}.`, '',
    ...part('Zaległe', groups.overdue, true),
    ...part('Na dziś', groups.today, false),
    `Otwórz zadania: ${appUrl}`, '',
    'Codzienny skrót zadań wysłany automatycznie z aplikacji Avenit.',
  ].join('\n');
}

export function digestPush(groups) {
  const all = [...groups.overdue, ...groups.today];
  const names = all.slice(0, 3).map((t) => String(t.name || 'Zadanie').trim());
  const more = all.length - names.length;
  return {
    title: digestTitle(all.length),
    body: `${names.join(' · ')}${more > 0 ? ` i ${more} więcej` : ''}`,
    link: '/',
    data: { type: 'task_digest', count: all.length },
  };
}

async function safeRows(pool, sql, params, log, what) {
  try {
    return (await pool.query(sql, params)).rows;
  } catch (err) {
    log(`task-digest: ${what} pominięte (${err.message})`);
    return null;
  }
}

// ctx.deps (testy): { sendEmail, sendPush, emailReady, now }.
export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  const deps = { sendEmail, sendPush: sendPushCore, emailReady: null, now: null, ...(ctx.deps || {}) };
  const result = { users: 0, emailed: 0, pushed: 0, skipped: 0 };
  try {
    const cfgRows = await safeRows(pool, `SELECT value FROM app_settings WHERE key = 'task_digest'`, [], () => {}, '');
    const cfg = digestConfig(cfgRows?.[0]?.value);
    if (!cfg.enabled) return result;

    // Bez tabeli znaczników (przed migracją 095) nie wysyłamy — inaczej ponowny przebieg dublowałby skrót.
    const marked = await safeRows(pool, `SELECT lower(user_email) AS e FROM task_digest_sends WHERE digest_date = $1`,
      [warsawNow(deps.now || new Date()).ymd], log, 'znaczniki (migracja 095?)');
    if (!marked) return result;
    const done = new Set(marked.map((r) => r.e));

    const today = warsawNow(deps.now || new Date()).ymd;
    const since = addDaysYmd(today, -cfg.overdue_days);
    const tasksByUser = new Map(); // email → [{ name, due, where, url }]
    const add = (email, t) => {
      const e = lower(email);
      if (!e || done.has(e)) return;
      if (!tasksByUser.has(e)) tasksByUser.set(e, []);
      tasksByUser.get(e).push(t);
    };
    const base = rsvpBase(ctx.tenantSubdomain || ctx.tenantSlug);

    // ── Elementy tablic ─────────────────────────────────────────────────────────
    const items = (await safeRows(pool, boardDueSql(), [today, since], log, 'tablice')) || [];
    const boardIds = [...new Set(items.map((i) => String(i.board_id)))];
    const [boards, statusCols, mods] = boardIds.length
      ? await Promise.all([
        safeRows(pool, `SELECT id, name, module_key, source_kind, visibility, owner_email, created_by, editors
                          FROM boards WHERE id = ANY($1::uuid[])`, [boardIds], log, 'tablice'),
        safeRows(pool, `SELECT id, board_id, settings FROM board_columns WHERE board_id = ANY($1::uuid[]) AND type = 'status'
                         ORDER BY display_order NULLS LAST, id`, [boardIds], log, 'statusy'),
        safeRows(pool, `SELECT key, path, label, resource_key FROM app_modules`, [], () => {}, ''),
      ])
      : [[], [], []];
    const boardById = new Map((boards || []).map((b) => [String(b.id), b]));
    const statusByBoard = new Map();
    for (const c of statusCols || []) if (!statusByBoard.has(String(c.board_id))) statusByBoard.set(String(c.board_id), c);
    const modByKey = new Map((mods || []).map((m) => [m.key, m]));
    const paths = Object.fromEntries((mods || []).filter((m) => m.path).map((m) => [m.key, m.path]));

    // ── Zadania osobiste ──────────────────────────────────────────────────────────
    const utCols = await safeRows(pool,
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_tasks'`,
      [], log, 'zadania osobiste') || [];
    const utType = new Map(utCols.map((c) => [c.column_name, c.data_type]));
    let personal = [];
    if (utType.has('due_date') && utType.has('user_email')) {
      const due = userTaskDueExpr(utType.get('due_date'));
      const assignee = utType.has('assigned_to_email') ? 't.assigned_to_email' : 'NULL::text';
      personal = (await safeRows(pool,
        `SELECT t.id, t.title, t.user_email, ${assignee} AS assigned_to_email, ${due} AS due
           FROM user_tasks t
          WHERE t.due_date IS NOT NULL
            AND lower(coalesce(t.status, '')) NOT IN ('done', 'completed')
            AND ${due} <= $1 AND ${due} >= $2
          LIMIT ${MAX_ROWS}`, [today, since], log, 'zadania osobiste')) || [];
    }

    // ── Konta, uprawnienia, rezygnacje ──────────────────────────────────────────────
    const emails = new Set();
    for (const it of items) for (const e of it.assignee_emails || []) emails.add(lower(e));
    for (const t of personal) { emails.add(lower(t.user_email)); if (t.assigned_to_email) emails.add(lower(t.assigned_to_email)); }
    for (const e of done) emails.delete(e);
    emails.delete('');
    if (!emails.size) return result;
    const accounts = new Map(((await safeRows(pool,
      `SELECT id, email, role, is_super_admin, full_name, name FROM app_users
        WHERE lower(email) = ANY($1::text[]) AND COALESCE(is_active, true)`, [[...emails]], log, 'konta')) || [])
      .map((u) => [lower(u.email), u]));
    const prefs = new Map(((await safeRows(pool,
      `SELECT lower(user_email) AS e, enabled, category_opt_outs FROM push_user_preferences WHERE lower(user_email) = ANY($1::text[])`,
      [[...accounts.keys()]], () => {}, '')) || []).map((p) => [p.e, p]));
    const optedOut = (e) => (Array.isArray(prefs.get(e)?.category_opt_outs) ? prefs.get(e).category_opt_outs : []).includes(OPT_OUT_CATEGORY);
    const dbKey = ctx.tenantDbName || `slug:${ctx.tenantSlug || ''}`;
    const canOf = new Map();
    const canFor = async (e) => {
      if (!canOf.has(e)) canOf.set(e, (await accessFor(pool, dbKey, accounts.get(e)).catch(() => ({ can: () => false }))).can);
      return canOf.get(e);
    };

    for (const it of items) {
      const board = boardById.get(String(it.board_id));
      if (!board) continue;
      if (isDoneLabel(statusOf(it.cells, statusByBoard.get(String(it.board_id))))) continue;
      for (const raw of it.assignee_emails || []) {
        const e = lower(raw);
        if (!accounts.has(e) || optedOut(e) || !boardVisibleTo(board, e)) continue;
        if (!(await canFor(e))(boardCapability(board, modByKey))) continue;
        add(e, {
          name: it.name, due: it.due_end || it.due, where: String(board.name || '').trim(),
          url: `${base}${taskItemLink(board, it.id, paths)}`,
        });
      }
    }
    for (const t of personal) {
      const d = String(t.due || '').slice(0, 10);
      const who = new Set([lower(t.user_email), lower(t.assigned_to_email)].filter(Boolean));
      for (const e of who) {
        if (!accounts.has(e) || optedOut(e)) continue;
        add(e, { name: t.title, due: d, where: 'Zadanie osobiste', url: `${base}/?task=${encodeURIComponent(String(t.id))}` });
      }
    }

    const emailReady = deps.emailReady ?? !!(config.RESEND_API_KEY || config.SENDGRID_API_KEY || config.DEFAULT_SMTP_HOST);
    for (const [e, tasks] of tasksByUser) {
      if (!tasks.length) continue;
      const user = accounts.get(e);
      if (!user) continue;
      result.users++;
      try {
        const groups = groupDigest(tasks, today);
        const total = tasks.length;
        const first = String(user.full_name || user.name || '').trim().split(/\s+/)[0] || '';
        const args = { name: first, groups, appUrl: `${base}/` };
        let emailed = false;
        if (emailReady) {
          try {
            await deps.sendEmail({ to: user.email, subject: digestTitle(total), html: digestEmailHtml(args), text: digestEmailText(args) });
            emailed = true;
          } catch (err) {
            log(`task-digest: e-mail nieudany (${err.message})`);
          }
        }
        let pushed = false;
        if (prefs.get(e)?.enabled !== false) {
          try {
            const res = await deps.sendPush(pool, { user_email: user.email, ...digestPush(groups) });
            pushed = (res?.body?.sent ?? 0) > 0;
          } catch (err) {
            log(`task-digest: push nieudany (${err.message})`);
          }
        }
        // Znacznik dopiero po doręczeniu którymkolwiek kanałem — inaczej kolejny przebieg ponowi.
        if (emailed || pushed) {
          await pool.query(
            `INSERT INTO task_digest_sends (user_email, digest_date, task_count, channels) VALUES ($1, $2, $3, $4::text[])
             ON CONFLICT (user_email, digest_date) DO NOTHING`,
            [e, today, total, [emailed ? 'email' : null, pushed ? 'push' : null].filter(Boolean)]);
          if (emailed) result.emailed++;
          if (pushed) result.pushed++;
        } else {
          result.skipped++;
        }
      } catch (err) {
        log(`task-digest: ${e} błąd (${err.message})`);
      }
    }
  } catch (err) {
    log(`task-digest: błąd (${err.message})`);
  }
  log(`task-digest: osób ${result.users}, maili ${result.emailed}, pushy ${result.pushed}`);
  return result;
}
