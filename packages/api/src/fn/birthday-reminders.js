// Worker: przypomnienia o urodzinach dla wskazanych odbiorców (np. Rada Starszych).
// Konfiguracja w app_settings['birthday_reminders']:
//   { enabled, schedule:'daily'|'weekly', weekday:0-6 (dla weekly, 1=pon), days_ahead:int,
//     channel:'email'|'push'|'both', recipients:{ roles:[roleKey], emails:[..] }, message, last_run }
// Cron odpala codziennie; funkcja sama decyduje wg schedule/weekday i pilnuje last_run (raz dziennie).
import { sendEmail } from '../lib/email.js';
import { sendPushCore } from './send-push.js';

export const name = 'birthday-reminders';
export const skipRoute = true; // tylko worker

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function emailHtml(intro, people) {
  const rows = people.map((p) => `<tr><td style="padding:8px 14px;border-bottom:1px solid #eee;color:#1f2937;font-size:15px;">🎂 <b>${p.name}</b> — ${p.day}.${p.month}${p.today ? ' <span style="color:#e2445c;font-weight:700;">(dziś!)</span>' : ''}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.08);">
  <tr><td style="padding:24px 24px 8px;"><h1 style="margin:0 0 6px;font-size:20px;color:#1f2937;">🎂 Nadchodzące urodziny</h1>
  <p style="margin:0;color:#6b7280;font-size:14px;">${intro}</p></td></tr>
  <tr><td style="padding:12px 10px 20px;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
  <tr><td style="padding:16px 24px;background:#f9fafb;color:#9ca3af;font-size:12px;">Automatyczne przypomnienie z Avenit.</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  let cfg = null;
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'birthday_reminders'`);
    cfg = rows[0]?.value ? (typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value) : null;
  } catch { return; }
  if (!cfg || !cfg.enabled) return;

  const now = new Date();
  const todayStr = fmt(now);
  if (cfg.last_run === todayStr) return; // już dziś wysłano
  if (cfg.schedule === 'weekly') {
    const wd = Number.isFinite(cfg.weekday) ? cfg.weekday : 1;
    if (now.getDay() !== wd) return;
  }

  const daysAhead = Number.isFinite(cfg.days_ahead) ? Math.max(0, Math.min(31, cfg.days_ahead)) : (cfg.schedule === 'weekly' ? 7 : 0);

  const stamp = async () => {
    try { await pool.query(`UPDATE app_settings SET value = $1 WHERE key = 'birthday_reminders'`, [JSON.stringify({ ...cfg, last_run: todayStr })]); } catch { /* nic */ }
  };

  // Osoby z urodzinami w oknie [dziś, dziś+daysAhead] (po dniu i miesiącu).
  let members = [];
  try { const { rows } = await pool.query(`SELECT first_name, last_name, birth_date FROM members WHERE birth_date IS NOT NULL`); members = rows; } catch { await stamp(); return; }
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = [];
  for (const m of members) {
    const b = new Date(m.birth_date);
    for (let i = 0; i <= daysAhead; i++) {
      const t = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() + i);
      if (b.getDate() === t.getDate() && b.getMonth() === t.getMonth()) {
        upcoming.push({ name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Osoba', day: t.getDate(), month: t.getMonth() + 1, today: i === 0 });
        break;
      }
    }
  }
  if (!upcoming.length) { await stamp(); return; }

  // Odbiorcy: role → aktywni użytkownicy z tymi rolami; + jawne e-maile.
  const emails = new Set((cfg.recipients?.emails || []).map((e) => String(e).toLowerCase()).filter(Boolean));
  const roles = Array.isArray(cfg.recipients?.roles) ? cfg.recipients.roles : [];
  if (roles.length) {
    try {
      const { rows } = await pool.query(`SELECT email FROM app_users WHERE role = ANY($1) AND is_active = true AND email IS NOT NULL`, [roles]);
      rows.forEach((u) => emails.add(String(u.email).toLowerCase()));
    } catch { /* nic */ }
  }
  const recipients = [...emails];
  if (!recipients.length) { await stamp(); return; }

  const intro = cfg.message || 'Pamiętajmy o życzeniach dla najbliższych solenizantów.';
  const channel = cfg.channel || 'email';
  const names = upcoming.map((u) => u.name).join(', ');
  const subject = `🎂 Urodziny: ${names.length > 80 ? names.slice(0, 77) + '…' : names}`;

  if (channel === 'email' || channel === 'both') {
    const html = emailHtml(intro, upcoming);
    for (const to of recipients) { try { await sendEmail({ to, subject, html }); } catch (e) { log('mail fail', to, e.message); } }
  }
  if (channel === 'push' || channel === 'both') {
    for (const to of recipients) { try { await sendPushCore(pool, { user_email: to, title: '🎂 Nadchodzące urodziny', body: names, link: '/members' }); } catch (e) { log('push fail', to, e.message); } }
  }

  await stamp();
  log(`birthday-reminders: ${upcoming.length} solenizantów → ${recipients.length} odbiorców (${channel})`);
}
