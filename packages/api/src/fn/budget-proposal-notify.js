// Powiadomienia e-mail o propozycjach do budżetu.
//   event 'submitted' → do osób zarządzających finansami (admin / rola z uprawnieniem
//                       module:finance lub '*') + opcjonalnie app_settings.finance_notify_email.
//   event 'decided'   → do zgłaszającego (status zaakceptowana/odrzucona).
// Adresaci wyliczani po stronie serwera z rekordu propozycji — bez zaufania do wejścia.
//
// Kto może wywołać (audyt 2026-10, runda 3) — wcześniej każdy zalogowany mógł wysyłać maile
// o dowolnej propozycji (także z wstrzykniętym HTML-em w opisie):
//   'submitted' — zgłaszający tej propozycji (submitted_by = e-mail sesji) albo osoba
//                 z action:finance:approve; tylko dla propozycji oczekującej,
//   'decided'   — tylko action:finance:approve (ta sama reguła co zmiana statusu w /api/db),
//                 i tylko gdy propozycja ma już decyzję.
// Treść użytkownika w mailu jest escapowana.
import { sendEmail } from '../lib/email.js';
import { loadGrants } from '../dataapi/registry.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { escapeHtml } from '@avenit/shared/src/forms/formEmails.js';

export const name = 'budget-proposal-notify';
export const isPublic = false;
export const rateLimit = { max: 20, timeWindow: '10 minutes' };

// Podmienialne w testach (bez prawdziwej poczty).
export const deps = { sendEmail };

export const APPROVE_CAPABILITY = 'action:finance:approve';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pln = (n) => Number(n || 0).toLocaleString('pl-PL') + ' zł';
const lower = (s) => String(s || '').trim().toLowerCase();

// Czy wywołujący zatwierdza finanse (superadmin / rola admin / action:finance:approve)?
// Tryb legacy (brak permission_grants) — jak requireCapability: bez egzekwowania akcji.
export async function canApproveFinance(req) {
  const { rows } = await req.db.query(
    'SELECT id, role, is_super_admin, is_active FROM app_users WHERE id = $1',
    [req.user?.id]
  );
  const me = rows[0];
  if (!me || me.is_active === false) return false;
  if (me.is_super_admin) return true;
  const { grants, adminRoles } = await loadGrants(req.db, req.tenant.db_name);
  if (adminRoles.has(me.role)) return true;
  if (grants === null) return true;
  return makeResolver(grants, { role: me.role, userId: me.id, isAdmin: false }).can(APPROVE_CAPABILITY);
}

// Zwraca komunikat odmowy albo null (dozwolone).
export function notifyAccessError({ event, proposal, callerEmail, approver }) {
  if (event === 'submitted') {
    const own = !!proposal.submitted_by && lower(proposal.submitted_by) === lower(callerEmail);
    if (!own && !approver) return 'Powiadomienie o propozycji wysyła tylko jej zgłaszający.';
    if ((proposal.status || 'pending') !== 'pending') return 'Propozycja nie oczekuje już na decyzję.';
    return null;
  }
  if (event === 'decided') {
    if (!approver) return 'Brak uprawnienia do zatwierdzania finansów.';
    if (!['approved', 'rejected'].includes(proposal.status)) return 'Propozycja nie ma jeszcze decyzji.';
    return null;
  }
  return 'Nieznane zdarzenie.';
}

// Treść maili — wszystkie pola propozycji escapowane (wpisuje je zgłaszający).
export function buildProposalEmail(event, p, org) {
  const kindLabel = p.kind === 'income' ? 'przychód' : 'wydatek';
  const year = escapeHtml(p.year);
  const team = escapeHtml(p.team_type || '—');
  const desc = escapeHtml(p.description || '');
  if (event === 'submitted') {
    return {
      subject: `Nowa propozycja do budżetu ${p.year ?? ''} — ${org}`.slice(0, 200),
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <h2 style="color:#111827">Nowa propozycja do budżetu ${year}</h2>
      <p><strong>${team}</strong> — ${kindLabel}</p>
      <p style="font-size:18px;font-weight:700">${desc}: ${escapeHtml(pln(p.amount))}</p>
      ${p.note ? `<p style="color:#6b7280">Uzasadnienie: ${escapeHtml(p.note)}</p>` : ''}
      <p style="color:#6b7280">Zgłosił: ${escapeHtml(p.submitted_by || '—')}</p>
      <p style="color:#9ca3af;font-size:12px">Zatwierdź lub odrzuć w module Finanse → Budżet → Propozycje.</p>
    </div>`,
    };
  }
  const decision = p.status === 'approved' ? 'zaakceptowana' : 'odrzucona';
  return {
    subject: `Twoja propozycja do budżetu ${p.year ?? ''} została ${decision}`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <h2 style="color:#111827">Propozycja ${decision}</h2>
      <p><strong>${team}</strong> — ${desc}: ${escapeHtml(pln(p.amount))} (${kindLabel}, budżet ${year})</p>
      ${p.status === 'approved' ? '<p style="color:#059669">Pozycja została dodana do budżetu.</p>' : ''}
    </div>`,
  };
}

export default async function handler(req, reply) {
  const proposalId = String(req.body?.proposalId || '');
  const event = String(req.body?.event || '');
  if (!proposalId) return reply.code(400).send({ error: 'Brak propozycji.' });
  if (event !== 'submitted' && event !== 'decided') return reply.code(400).send({ error: 'Nieznane zdarzenie.' });
  if (!UUID_RE.test(proposalId)) return reply.code(404).send({ error: 'Nie znaleziono propozycji.' });

  let p;
  try {
    const { rows } = await req.db.query(`SELECT * FROM budget_proposals WHERE id = $1`, [proposalId]);
    p = rows[0];
  } catch { return reply.send({ ok: false }); }
  if (!p) return reply.code(404).send({ error: 'Nie znaleziono propozycji.' });

  const approver = await canApproveFinance(req).catch(() => false);
  const denied = notifyAccessError({ event, proposal: p, callerEmail: req.user?.email, approver });
  if (denied) return reply.code(403).send({ error: denied });

  let org = 'Wspólnota';
  try { const { rows } = await req.db.query(`SELECT value FROM app_settings WHERE key='org_name' LIMIT 1`); if (rows[0]?.value) org = String(rows[0].value); } catch { /* generic */ }

  let recipients = [];
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
    recipients = [...new Set(recipients.map(lower).filter(Boolean))].filter((e) => e !== lower(p.submitted_by));
  } else if (p.submitted_by) {
    recipients = [lower(p.submitted_by)];
  }

  const { subject, html } = buildProposalEmail(event, p, org);
  if (recipients.length === 0) return reply.send({ ok: true, sent: 0 });
  let sent = 0;
  for (const to of recipients.slice(0, 50)) {
    try { await deps.sendEmail({ to, subject, html }); sent++; } catch (err) { req.log?.error?.({ err, to }, 'proposal notify failed'); }
  }
  return reply.send({ ok: true, sent });
}
