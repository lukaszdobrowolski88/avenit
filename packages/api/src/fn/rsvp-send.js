// Wysyłka zaproszeń RSVP (push / e-mail / SMS) z linkiem „Będę / Nie będę".
// Wymaga zalogowanego użytkownika tenanta. Aktualizuje status kampanii na 'sent'.
// Eksportuje rsvpBase() i sendInvitation() — współdzielone z workerem przypomnień.
import { config } from '../config.js';
import { sendSmsCore } from './send-sms.js';
import { sendPushCore } from './send-push.js';

export const name = 'rsvp-send';

async function sendResend(to, subject, html) {
  if (!config.RESEND_API_KEY || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.RESEND_API_KEY}` },
      body: JSON.stringify({ from: `Avenit <${config.RESEND_FROM_EMAIL || 'noreply@avenit.pl'}>`, to: [to], subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

function eventLine(c) {
  const parts = [];
  if (c.event_date) parts.push(new Date(c.event_date).toLocaleDateString('pl-PL'));
  if (c.event_time) parts.push(c.event_time);
  if (c.location) parts.push(c.location);
  return parts.join(' · ');
}

function emailHtml(c, link, reminder) {
  const when = eventLine(c);
  const head = reminder ? 'Przypomnienie — potwierdź obecność' : c.title;
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
    <h2 style="margin:0 0 6px">${head}</h2>
    ${reminder ? `<p style="margin:0 0 4px;font-weight:600">${c.title}</p>` : ''}
    ${when ? `<p style="color:#6b7280;margin:0 0 12px">${when}</p>` : ''}
    ${c.message ? `<p>${String(c.message).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="margin:22px 0">Czy będziesz obecny/a?</p>
    <p>
      <a href="${link}?a=yes" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;margin-right:8px">Będę</a>
      <a href="${link}?a=no" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Nie będę</a>
    </p>
    <p style="color:#6b7280;font-size:13px;margin-top:20px">Lub kliknij, aby odpowiedzieć: <a href="${link}">${link}</a></p>
    <hr><p style="color:#9ca3af;font-size:12px">Avenit — potwierdzenie obecności</p></div>`;
}

// Bazowy URL webowy tenanta: https://<slug>.<APP_DOMAIN>
export function rsvpBase(slug) {
  const proto = (config.PUBLIC_API_URL || '').startsWith('https') ? 'https' : 'http';
  return `${proto}://${slug}.${config.APP_DOMAIN}`;
}

// Wyślij pojedyncze zaproszenie wybranymi kanałami. Zwraca { sent:[], failed }.
export async function sendInvitation(db, base, campaign, inv, { reminder = false } = {}) {
  const channels = Array.isArray(campaign.channels) ? campaign.channels : ['push'];
  const when = eventLine(campaign);
  const link = `${base}/rsvp/${inv.token}`;
  const prefix = reminder ? 'Przypomnienie: ' : '';
  const sent = [];
  let failed = 0;

  if (channels.includes('email') && inv.email) {
    if (await sendResend(inv.email, `${prefix}Potwierdź obecność: ${campaign.title}`, emailHtml(campaign, link, reminder))) sent.push('email');
    else failed++;
  }
  if (channels.includes('sms') && inv.phone) {
    const r = await sendSmsCore(db, { phone: inv.phone, message: `${prefix}${campaign.title}${when ? ` (${when})` : ''}. Potwierdź obecność: ${link}` });
    if (r.body?.sent === 1) sent.push('sms'); else failed++;
  }
  if (channels.includes('push') && inv.email) {
    const r = await sendPushCore(db, {
      user_email: inv.email,
      title: `${prefix}${campaign.title}`,
      body: `${campaign.message || 'Czy będziesz obecny/a?'}${when ? ` — ${when}` : ''}`,
      link,
    });
    if ((r.body?.sent || 0) > 0) sent.push('push');
  }

  if (sent.length) {
    await db.query(`UPDATE rsvp_invitations SET sent_channels = $1 WHERE id = $2`, [JSON.stringify(sent), inv.id]);
  }
  return { sent, failed };
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const { campaign_id } = req.body || {};
  if (!campaign_id) return reply.code(400).send({ error: 'Brak campaign_id' });

  const { rows: campRows } = await req.db.query(`SELECT * FROM rsvp_campaigns WHERE id = $1`, [campaign_id]);
  const campaign = campRows[0];
  if (!campaign) return reply.code(404).send({ error: 'Nie znaleziono kampanii' });

  const base = rsvpBase(req.tenant.slug);
  const { rows: invitations } = await req.db.query(`SELECT * FROM rsvp_invitations WHERE campaign_id = $1`, [campaign_id]);

  const stats = { total: invitations.length, email: 0, sms: 0, push: 0, failed: 0 };
  for (const inv of invitations) {
    const { sent, failed } = await sendInvitation(req.db, base, campaign, inv, { reminder: false });
    sent.forEach((ch) => { stats[ch] = (stats[ch] || 0) + 1; });
    stats.failed += failed;
  }

  await req.db.query(`UPDATE rsvp_campaigns SET status = 'sent', sent_at = now() WHERE id = $1`, [campaign_id]);
  return reply.send({ success: true, stats });
}
