// Powiadomienia e-mail o propozycjach do budżetu.
//   event 'submitted' → do osób zarządzających finansami (admin / rola z uprawnieniem
//                       module:finance lub '*') + opcjonalnie app_settings.finance_notify_email.
//   event 'decided'   → do zgłaszającego (status zaakceptowana/odrzucona).
// Adresaci wyliczani po stronie serwera z rekordu propozycji — bez zaufania do wejścia.
import { sendEmail } from '../lib/email.js';

export const name = 'budget-proposal-notify';
export const isPublic = false;

const pln = (n) => Number(n || 0).toLocaleString('pl-PL') + ' zł';

export default async function handler(req, reply) {
  const proposalId = String(req.body?.proposalId || '');
  const event = String(req.body?.event || '');
  if (!proposalId) return reply.code(400).send({ error: 'Brak propozycji.' });

  let p;
  try {
    const { rows } = await req.db.query(`SELECT * FROM budget_proposals WHERE id = $1`, [proposalId]);
    p = rows[0];
  } catch { return reply.send({ ok: false }); }
  if (!p) return reply.code(404).send({ error: 'Nie znaleziono propozycji.' });

  let org = 'Wspólnota';
  try { const { rows } = await req.db.query(`SELECT value FROM app_settings WHERE key='org_name' LIMIT 1`); if (rows[0]?.value) org = rows[0].value; } catch { /* generic */ }

  const kindLabel = p.kind === 'income' ? 'przychód' : 'wydatek';
  let recipients = [];
  let subject = '';
  let html = '';

  if (event === 'submitted') {
    try {
      const { rows } = await req.db.query(`
        SELECT DISTINCT u.email FROM app_users u
        LEFT JOIN app_roles r ON r.key = u.role
        WHERE u.is_active AND u.email IS NOT NULL AND (
          u.is_super_admin
          OR COALESCE(r.is_admin, false)
          OR u.role IN (SELECT role FROM permission_grants WHERE allowed = true AND capability IN ('*','module:finance') AND role IS NOT NULL)
          OR u.id IN (SELECT user_id FROM permission_grants WHERE allowed = true AND capability IN ('*','module:finance') AND user_id IS NOT NULL)
        )`);
      recipients = rows.map((x) => x.email);
    } catch { /* brak permission_grants — poniżej fallback */ }
    try { const { rows } = await req.db.query(`SELECT value FROM app_settings WHERE key='finance_notify_email' LIMIT 1`); if (rows[0]?.value) recipients.push(...String(rows[0].value).split(/[,;\s]+/)); } catch { /* opcjonalne */ }
    recipients = [...new Set(recipients.map((e) => String(e).trim().toLowerCase()).filter(Boolean))].filter((e) => e !== String(p.submitted_by || '').toLowerCase());
    subject = `Nowa propozycja do budżetu ${p.year} — ${org}`;
    html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <h2 style="color:#111827">Nowa propozycja do budżetu ${p.year}</h2>
      <p><strong>${p.team_type || '—'}</strong> — ${kindLabel}</p>
      <p style="font-size:18px;font-weight:700">${p.description || ''}: ${pln(p.amount)}</p>
      ${p.note ? `<p style="color:#6b7280">Uzasadnienie: ${p.note}</p>` : ''}
      <p style="color:#6b7280">Zgłosił: ${p.submitted_by || '—'}</p>
      <p style="color:#9ca3af;font-size:12px">Zatwierdź lub odrzuć w module Finanse → Budżet → Propozycje.</p>
    </div>`;
  } else if (event === 'decided') {
    if (p.submitted_by) recipients = [String(p.submitted_by).trim().toLowerCase()];
    const decision = p.status === 'approved' ? 'zaakceptowana' : (p.status === 'rejected' ? 'odrzucona' : p.status);
    subject = `Twoja propozycja do budżetu ${p.year} została ${decision}`;
    html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <h2 style="color:#111827">Propozycja ${decision}</h2>
      <p><strong>${p.team_type || '—'}</strong> — ${p.description || ''}: ${pln(p.amount)} (${kindLabel}, budżet ${p.year})</p>
      ${p.status === 'approved' ? '<p style="color:#059669">Pozycja została dodana do budżetu.</p>' : ''}
    </div>`;
  } else {
    return reply.code(400).send({ error: 'Nieznane zdarzenie.' });
  }

  if (recipients.length === 0) return reply.send({ ok: true, sent: 0 });
  let sent = 0;
  for (const to of recipients.slice(0, 50)) {
    try { await sendEmail({ to, subject, html }); sent++; } catch (err) { req.log?.error?.({ err, to }, 'proposal notify failed'); }
  }
  return reply.send({ ok: true, sent });
}
