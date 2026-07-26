// Silnik automatyzacji: worker wykonuje kroki należnych uruchomień (automation_runs)
// oraz auto-zapisuje nowych członków/gości do aktywnych ścieżek (trigger new_member/new_guest).
// Endpoint POST /api/fn/automation-run pozwala ręcznie zapisać osobę lub uruchomić należne.
import { config } from '../config.js';
import { sendSmsCore } from './send-sms.js';
import { sendPushCore } from './send-push.js';

export const name = 'automation-run';

const STATUS_BY_TRIGGER = { new_member: 'Członek', new_guest: 'Gość' };

async function sendResend(to, subject, html) {
  if (!config.RESEND_API_KEY || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `Avenit <${config.RESEND_FROM_EMAIL || 'noreply@avenit.pl'}>`,
        to: [to], subject: subject || '(bez tematu)',
        html: `<div style="font-family:sans-serif;max-width:560px">${(html || '').replace(/\n/g, '<br>')}</div>`,
      }),
    });
    return res.ok;
  } catch { return false; }
}

function addDaysIso(baseIso, days) {
  const d = new Date(baseIso);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d;
}

async function getMember(pool, memberId) {
  if (!memberId) return null;
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, phone FROM members WHERE id = $1`, [memberId]
    );
    return rows[0] || null;
  } catch { return null; }
}

// Wykonaj pojedynczy krok. Zwraca {ok, info}.
async function executeStep(pool, step, member, ctx) {
  const cfg = step.action_config || {};
  const name = member ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : '';
  const subst = (t) => String(t || '').replace(/\{\{\s*imie\s*\}\}/gi, member?.first_name || '').replace(/\{\{\s*nazwa\s*\}\}/gi, name);
  switch (step.action_type) {
    case 'send_email': {
      const ok = await sendResend(member?.email, subst(cfg.subject), subst(cfg.body || cfg.message));
      return { ok, info: ok ? 'email wysłany' : 'email pominięty (brak Resend/adresu)' };
    }
    case 'send_sms': {
      if (!member?.phone) return { ok: false, info: 'brak telefonu' };
      const r = await sendSmsCore(pool, { phone: member.phone, message: subst(cfg.message || cfg.body) });
      return { ok: r.body?.sent === 1, info: r.body?.error || 'sms ok' };
    }
    case 'send_push': {
      if (!member?.email) return { ok: false, info: 'brak e-mail (push po e-mail)' };
      const r = await sendPushCore(pool, { user_email: member.email, title: subst(cfg.title || 'Powiadomienie'), body: subst(cfg.body || cfg.message) });
      return { ok: (r.body?.sent || 0) > 0, info: r.body?.message || 'push' };
    }
    case 'create_task': {
      const assignee = cfg.assignee_email || member?.email;
      if (!assignee) return { ok: false, info: 'brak odbiorcy zadania' };
      try {
        await pool.query(
          `INSERT INTO user_tasks (user_email, title, description, status) VALUES ($1, $2, $3, 'todo')`,
          [assignee, subst(cfg.title || 'Zadanie z automatyzacji'), subst(cfg.description || '')]
        );
        return { ok: true, info: 'zadanie utworzone' };
      } catch (e) { return { ok: false, info: 'user_tasks: ' + e.message }; }
    }
    case 'add_tag': {
      if (!member?.id || !cfg.tag) return { ok: false, info: 'brak członka/tagu' };
      try {
        await pool.query(`INSERT INTO member_tags (member_id, tag) VALUES ($1, $2)`, [member.id, cfg.tag]);
        return { ok: true, info: 'tag dodany' };
      } catch (e) { return { ok: false, info: 'member_tags: ' + e.message }; }
    }
    case 'wait':
      return { ok: true, info: 'oczekiwanie' };
    default:
      return { ok: false, info: 'nieznana akcja' };
  }
}

// Przetwórz jedno uruchomienie: wykonaj wszystkie należne (elapsed) kroki.
async function processRun(pool, run, ctx) {
  const { rows: steps } = await pool.query(
    `SELECT * FROM automation_steps WHERE workflow_id = $1 ORDER BY step_order ASC`, [run.workflow_id]
  );
  if (!steps.length) {
    await pool.query(`UPDATE automation_runs SET status = 'done', finished_at = now() WHERE id = $1`, [run.id]);
    return;
  }
  const member = await getMember(pool, run.member_id);
  let current = run.current_step || 0;
  let log = Array.isArray(run.log) ? run.log : [];
  let startedAt = run.started_at ? new Date(run.started_at) : new Date();
  if (!run.started_at) {
    await pool.query(`UPDATE automation_runs SET status = 'running', started_at = now() WHERE id = $1`, [run.id]);
  }

  while (current < steps.length) {
    const step = steps[current];
    const lastAt = log.length ? new Date(log[log.length - 1].at) : startedAt;
    const dueAt = addDaysIso(lastAt, step.delay_days);
    if (new Date() < dueAt) break; // jeszcze nie czas na ten krok

    const res = await executeStep(pool, step, member, ctx);
    log = [...log, { step: step.step_order, action: step.action_type, at: new Date().toISOString(), ok: res.ok, info: res.info }];
    current += 1;
    await pool.query(
      `UPDATE automation_runs SET current_step = $1, log = $2 WHERE id = $3`,
      [current, JSON.stringify(log), run.id]
    );
  }

  if (current >= steps.length) {
    await pool.query(`UPDATE automation_runs SET status = 'done', finished_at = now() WHERE id = $1`, [run.id]);
  }
}

// Auto-zapis nowych członków/gości do aktywnych ścieżek wyzwalanych zdarzeniem.
async function autoEnroll(pool, ctx) {
  const log = ctx.log || (() => {});
  let workflows;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM automation_workflows WHERE is_active = true AND trigger_type IN ('new_member','new_guest')`
    );
    workflows = rows;
  } catch { return 0; }

  let enrolled = 0;
  for (const wf of workflows) {
    const status = STATUS_BY_TRIGGER[wf.trigger_type];
    try {
      // Nowi z ostatnich 2 dni (created_at), którzy nie mają jeszcze uruchomienia tej ścieżki.
      const { rows: members } = await pool.query(
        `SELECT m.id FROM members m
          WHERE m.status = $1
            AND m.created_at >= now() - interval '2 days'
            AND NOT EXISTS (
              SELECT 1 FROM automation_runs r WHERE r.workflow_id = $2 AND r.member_id = m.id
            )`,
        [status, wf.id]
      );
      for (const m of members) {
        await pool.query(
          `INSERT INTO automation_runs (workflow_id, member_id, status, current_step, log)
           VALUES ($1, $2, 'pending', 0, '[]'::jsonb)`,
          [wf.id, m.id]
        );
        enrolled++;
      }
    } catch (err) {
      // np. brak kolumny created_at w members — pomiń auto-zapis (dostępny ręczny).
      log(`automation: auto-zapis ${wf.trigger_type} pominięty (${err.message})`);
    }
  }
  if (enrolled) log(`automation: auto-zapisano ${enrolled} osób`);
  return enrolled;
}

export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  let processed = 0;
  try {
    await autoEnroll(pool, ctx);
    const { rows: runs } = await pool.query(
      `SELECT * FROM automation_runs WHERE status IN ('pending','running') ORDER BY created_at ASC LIMIT 200`
    );
    for (const run of runs) {
      try { await processRun(pool, run, ctx); processed++; }
      catch (err) {
        log(`automation: run ${run.id} błąd: ${err.message}`);
        await pool.query(`UPDATE automation_runs SET status = 'failed' WHERE id = $1`, [run.id]).catch(() => {});
      }
    }
  } catch (err) {
    log(`automation: pomijam (${err.message})`);
  }
  if (processed) log(`automation: przetworzono ${processed} uruchomień`);
  return { processed };
}

// Ręczne wywołanie z UI: zapis osoby do ścieżki lub uruchomienie należnych.
export default async function handler(req, reply) {
  if (!req.db) return reply.code(404).send({ error: 'Nieznany tenant' });
  const { action, workflow_id, member_id } = req.body || {};

  if (action === 'enroll') {
    if (!workflow_id || !member_id) return reply.code(400).send({ error: 'Wymagane: workflow_id, member_id' });
    try {
      await req.db.query(
        `INSERT INTO automation_runs (workflow_id, member_id, status, current_step, log)
         VALUES ($1, $2, 'pending', 0, '[]'::jsonb)`,
        [workflow_id, member_id]
      );
      // Od razu spróbuj wykonać należne kroki (natychmiastowe akcje).
      await runForTenant(req.db, { log: (m) => req.log.info(m) });
      return reply.send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  }

  if (action === 'run_due') {
    const res = await runForTenant(req.db, { log: (m) => req.log.info(m) });
    return reply.send({ success: true, ...res });
  }

  return reply.code(400).send({ error: 'Nieznana akcja (enroll | run_due)' });
}
