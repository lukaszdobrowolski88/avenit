// Mailing (kampanie e-mail): wysyłka testowa, planowanie i wysyłka do odbiorców paczkami.
// Tabele tenanta: email_campaigns, email_campaign_recipients, email_unsubscribes.
//
// Zasady:
//  - Maile wychodzą WYŁĄCZNIE przez lib/email.js → sendEmail (Resend). Odbiorcę oznaczamy
//    jako „sent” dopiero po udanym sendEmail — nieudane zostają do ponowienia/wglądu.
//  - Zmienne ({{imie}}, {{nazwisko}}, {{email}}, {{data}}, {{kosciol}}, {{unsubscribe_url}})
//    podstawiamy per odbiorca po stronie serwera, z ucieczką HTML wartości.
//  - Każdy mail ma działający link wypisu (podpisany token HMAC → publiczna fn
//    mailing-unsubscribe). Wypisanych pomijamy przy każdej paczce (RODO).
//  - „Wyślij teraz” wysyła pierwszą paczkę od ręki, resztę dokańcza worker (runForTenant,
//    co minutę). Zaplanowane maile podejmuje ten sam worker, gdy nadejdzie ich termin.
//  - Odbiorców „rezerwujemy” (status 'sending' + claimed_at, FOR UPDATE SKIP LOCKED), więc
//    worker i żądanie HTTP nie wyślą tego samego maila dwa razy.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';

export const name = 'send-mailing-campaign';

const HTTP_BATCH = 10;           // „Wyślij teraz”: pierwsza paczka od ręki (kilka sekund)
const WORKER_BATCH = 50;         // paczka w workerze
const WORKER_MAX_PER_RUN = 400;  // na kampanię w jednym przebiegu workera (reszta za minutę)
const SEND_GAP_MS = 550;         // Resend: domyślny limit ~2 żądania/s
const STALE_CLAIM_MINUTES = 15;  // „zarezerwowani”, ale niewysłani (np. restart) wracają do kolejki
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Pomocnicze (czyste, testowane w test/mailing.test.js) ─────────────────

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function tenantBaseUrl(tenant) {
  const host = tenant?.subdomain || tenant?.slug;
  return `https://${host}.${config.APP_DOMAIN}`;
}

// Podpis jak w storage/routes.js (HMAC-SHA256 z JWT_SECRET), z własnym prefiksem celu.
export function unsubscribeSignature(tenantSlug, email) {
  return crypto
    .createHmac('sha256', config.JWT_SECRET)
    .update(`mailing-unsubscribe|${tenantSlug}|${String(email || '').trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

export function unsubscribeToken(tenantSlug, email) {
  const normalized = String(email || '').trim().toLowerCase();
  return `${Buffer.from(normalized, 'utf8').toString('base64url')}.${unsubscribeSignature(tenantSlug, normalized)}`;
}

// Zwraca e-mail z tokenu albo null, gdy token jest nieprawidłowy / podrobiony.
export function verifyUnsubscribeToken(tenantSlug, token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || sig.length !== 32) return null;
  let email;
  try { email = Buffer.from(payload, 'base64url').toString('utf8').trim().toLowerCase(); } catch { return null; }
  if (!email || email.length > 320 || !email.includes('@')) return null;
  const expected = Buffer.from(unsubscribeSignature(tenantSlug, email));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return email;
}

export function unsubscribeUrl(baseUrl, tenantSlug, email, campaignId) {
  const q = new URLSearchParams({ t: unsubscribeToken(tenantSlug, email) });
  if (campaignId && UUID_RE.test(String(campaignId))) q.set('c', String(campaignId));
  return `${baseUrl}/api/fn/mailing-unsubscribe?${q.toString()}`;
}

export function formatMailDate(date = new Date()) {
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw',
  }).format(date);
}

// Wartości zmiennych dla jednego odbiorcy (klucze bez nawiasów, małymi literami).
export function recipientVariables(recipient, { churchName = '', unsubscribeLink = '', date } = {}) {
  const fullName = String(recipient?.name || recipient?.full_name || '').trim();
  // Odbiorcy „ręczni” mają czasem e-mail zamiast nazwiska — wtedy bez imienia.
  const parts = fullName && !fullName.includes('@') ? fullName.split(/\s+/) : [];
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ');
  const today = date || formatMailDate();
  return {
    imie: first,
    nazwisko: last,
    email: String(recipient?.email || ''),
    data: today,
    kosciol: churchName,
    unsubscribe_url: unsubscribeLink,
    // aliasy (starsze szablony)
    first_name: first,
    last_name: last,
    full_name: parts.join(' '),
    date: today,
    church: churchName,
  };
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

// Podstawia znane zmienne; nieznane zostawia bez zmian. html=true → wartości escapowane.
export function fillVariables(text, vars, { html = true } = {}) {
  return String(text ?? '').replace(VARIABLE_RE, (match, key) => {
    const k = key.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(vars, k)) return match;
    return html ? escapeHtml(vars[k]) : String(vars[k] ?? '');
  });
}

// Gdy treść nie ma własnego linku wypisu, dokładamy stopkę (wymóg RODO i reguł antyspamowych).
export function ensureUnsubscribeFooter(html, link) {
  const source = String(html ?? '');
  if (/\{\{\s*unsubscribe_url\s*\}\}/i.test(source)) return source;
  const footer =
    '<div style="text-align:center;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#7a7364;">' +
    'Otrzymujesz tę wiadomość, bo jesteś w bazie kontaktów swojego kościoła. ' +
    `<a href="${escapeHtml(link)}" style="color:#7a7364;text-decoration:underline;">Wypisz się z tych wiadomości</a>` +
    '</div>';
  return /<\/body>/i.test(source) ? source.replace(/<\/body>/i, `${footer}</body>`) : source + footer;
}

// Temat i HTML dla jednego odbiorcy. preview=true → link wypisu prowadzi do strony podglądu.
export function buildCampaignMessage({ subject, html }, recipient, { baseUrl, tenantSlug, campaignId, churchName, date, preview = false }) {
  const link = preview
    ? `${baseUrl}/api/fn/mailing-unsubscribe?preview=1`
    : unsubscribeUrl(baseUrl, tenantSlug, recipient.email, campaignId);
  const vars = recipientVariables(recipient, { churchName, unsubscribeLink: link, date });
  return {
    subject: fillVariables(subject, vars, { html: false }).replace(/[\r\n]+/g, ' ').trim(),
    html: fillVariables(ensureUnsubscribeFooter(html, link), vars),
  };
}

// Status kampanii po przeliczeniu odbiorców.
export function finalCampaignStatus({ total, pending, inFlight, sent, failed }) {
  if (pending + inFlight > 0) return 'sending';
  if (sent > 0) return 'sent';
  if (total > 0 && failed === 0) return 'sent'; // wszyscy wypisani — nie ma do kogo wysłać
  return 'failed';
}

// ── Dostęp do bazy ────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRateLimited = (err) => /\b429\b/.test(String(err?.message || ''));

export async function churchNameFor(db, fallback) {
  try {
    const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'org_name' LIMIT 1`);
    const v = rows[0]?.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch { /* brak ustawienia — nazwa tenanta */ }
  return fallback || 'Kościół';
}

async function recipientCounts(db, campaignId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'sending')::int AS in_flight,
            count(*) FILTER (WHERE status = 'sent')::int AS sent,
            count(*) FILTER (WHERE status = 'failed')::int AS failed,
            count(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed
       FROM email_campaign_recipients WHERE campaign_id = $1`,
    [campaignId]
  );
  const r = rows[0] || {};
  return {
    total: r.total || 0, pending: r.pending || 0, inFlight: r.in_flight || 0,
    sent: r.sent || 0, failed: r.failed || 0, unsubscribed: r.unsubscribed || 0,
  };
}

// Przelicza liczniki kampanii; finalize=true domyka status, gdy kolejka jest pusta.
export async function refreshCampaign(db, campaignId, { finalize = true } = {}) {
  const c = await recipientCounts(db, campaignId);
  const status = finalize ? finalCampaignStatus(c) : null;
  const done = Boolean(status && status !== 'sending');
  await db.query(
    `UPDATE email_campaigns
        SET total_recipients = $2, sent_count = $3, total_sent = $3, failed_count = $4,
            unsubscribed_count = $5,
            status = CASE WHEN $6::boolean THEN $7::text ELSE status END,
            sent_at = CASE WHEN $6::boolean AND $7::text = 'sent' THEN COALESCE(sent_at, now()) ELSE sent_at END,
            updated_at = now()
      WHERE id = $1`,
    [campaignId, c.total, c.sent, c.failed, c.unsubscribed, done, status || 'sending']
  );
  return { ...c, remaining: c.pending + c.inFlight, status: status || null };
}

// Wysyła jedną paczkę odbiorców kampanii. ctx: { baseUrl, tenantSlug, churchName, gapMs?, send? }
export async function sendCampaignBatch(db, campaign, ctx, limit) {
  const send = ctx.send || sendEmail;
  const gap = ctx.gapMs ?? SEND_GAP_MS;
  // Wypisani nie dostają maila (także gdy wypisali się już po zaplanowaniu wysyłki).
  await db.query(
    `UPDATE email_campaign_recipients r SET status = 'unsubscribed'
      WHERE r.campaign_id = $1 AND r.status = 'pending'
        AND EXISTS (SELECT 1 FROM email_unsubscribes u WHERE lower(u.email) = lower(r.email))`,
    [campaign.id]
  );
  const { rows: claimed } = await db.query(
    `UPDATE email_campaign_recipients SET status = 'sending', claimed_at = now()
      WHERE id IN (
        SELECT id FROM email_campaign_recipients
         WHERE campaign_id = $1 AND status = 'pending'
         ORDER BY created_at, id
         LIMIT $2
         FOR UPDATE SKIP LOCKED)
      RETURNING id, email, name`,
    [campaign.id, limit]
  );

  const date = formatMailDate();
  let sent = 0, failed = 0, deferred = 0;
  for (let i = 0; i < claimed.length; i++) {
    const r = claimed[i];
    if (i > 0 && gap > 0) await sleep(gap);
    const msg = buildCampaignMessage(
      { subject: campaign.subject, html: campaign.html_content }, r,
      { baseUrl: ctx.baseUrl, tenantSlug: ctx.tenantSlug, campaignId: campaign.id, churchName: ctx.churchName, date }
    );
    try {
      await send({ to: r.email, subject: msg.subject, html: msg.html, fromName: ctx.churchName });
    } catch (err) {
      if (isRateLimited(err)) {
        // Limit dostawcy — oddaj resztę paczki do kolejki, ponowimy w następnym przebiegu.
        const ids = claimed.slice(i).map((x) => x.id);
        await db.query(
          `UPDATE email_campaign_recipients SET status = 'pending', claimed_at = NULL WHERE id = ANY($1::uuid[])`,
          [ids]
        );
        deferred = ids.length;
        break;
      }
      await db.query(
        `UPDATE email_campaign_recipients SET status = 'failed', error_message = $2 WHERE id = $1`,
        [r.id, String(err?.message || 'Błąd wysyłki').slice(0, 500)]
      );
      failed++;
      continue;
    }
    // Stempel „wysłano” dopiero po faktycznym wysłaniu.
    await db.query(
      `UPDATE email_campaign_recipients SET status = 'sent', sent_at = now(), error_message = NULL WHERE id = $1`,
      [r.id]
    );
    sent++;
  }
  return { claimed: claimed.length, sent, failed, deferred };
}

// ── Endpoint POST /api/fn/send-mailing-campaign ─────────────────────────────
// body:
//   { test: true, test_subject, test_html_content }  → test na adres zalogowanego (bez zapisu kampanii)
//   { campaign_id, action: 'schedule', scheduled_at } → zaplanuj (worker wyśle w terminie)
//   { campaign_id }                                  → wyślij teraz (pierwsza paczka od ręki)
export default async function handler(req, reply) {
  const body = req.body || {};
  const baseUrl = tenantBaseUrl(req.tenant);
  const tenantSlug = req.tenant.slug;

  try {
    const churchName = await churchNameFor(req.db, req.tenant.name);

    // Wysyłka testowa — zawsze na adres zalogowanej osoby, kampania zostaje nietknięta.
    if (body.test || body.test_email) {
      const to = req.user?.email;
      if (!to) return reply.code(400).send({ error: 'Twoje konto nie ma adresu e-mail, więc nie mamy dokąd wysłać testu.' });
      const subject = String(body.test_subject || '').trim();
      const html = String(body.test_html_content || '');
      if (!subject || !html.trim()) {
        return reply.code(400).send({ error: 'Uzupełnij temat i treść maila, zanim wyślesz test.' });
      }
      let fullName = '';
      try {
        const { rows } = await req.db.query(`SELECT full_name FROM app_users WHERE lower(email) = lower($1) LIMIT 1`, [to]);
        fullName = rows[0]?.full_name || '';
      } catch { /* bez imienia */ }
      const msg = buildCampaignMessage({ subject, html }, { email: to, name: fullName }, { baseUrl, tenantSlug, churchName, preview: true });
      try {
        await sendEmail({ to, subject: `[TEST] ${msg.subject}`, html: msg.html, fromName: churchName });
      } catch (err) {
        req.log?.error?.({ err }, 'mailing: test');
        return reply.code(502).send({ error: 'Nie udało się wysłać maila testowego. Spróbuj ponownie za chwilę.' });
      }
      return reply.send({ success: true, test: true, to });
    }

    const campaignId = String(body.campaign_id || '');
    if (!UUID_RE.test(campaignId)) return reply.code(400).send({ error: 'Nie wskazano maila do wysłania.' });

    const { rows } = await req.db.query(
      `SELECT id, status, subject, html_content, scheduled_at FROM email_campaigns WHERE id = $1`,
      [campaignId]
    );
    const campaign = rows[0];
    if (!campaign) return reply.code(404).send({ error: 'Nie znaleziono tego maila. Mógł zostać usunięty.' });
    if (campaign.status === 'sent') return reply.code(409).send({ error: 'Ten mail został już wysłany.' });
    if (!String(campaign.subject || '').trim() || !String(campaign.html_content || '').trim()) {
      return reply.code(400).send({ error: 'Mail nie ma tematu albo treści.' });
    }
    const counts = await recipientCounts(req.db, campaignId);
    if (counts.pending + counts.inFlight === 0) {
      return reply.code(400).send({ error: 'Ten mail nie ma odbiorców do wysłania.' });
    }

    if (body.action === 'schedule') {
      if (campaign.status === 'sending') return reply.code(409).send({ error: 'Ten mail jest właśnie wysyłany.' });
      const when = new Date(body.scheduled_at);
      if (!body.scheduled_at || Number.isNaN(when.getTime())) {
        return reply.code(400).send({ error: 'Podaj datę i godzinę wysyłki.' });
      }
      if (when.getTime() < Date.now() - 60_000) {
        return reply.code(400).send({ error: 'Wybierz termin w przyszłości.' });
      }
      await req.db.query(
        `UPDATE email_campaigns SET status = 'scheduled', scheduled_at = $2, updated_at = now() WHERE id = $1`,
        [campaignId, when.toISOString()]
      );
      const st = await refreshCampaign(req.db, campaignId, { finalize: false });
      return reply.send({ status: 'scheduled', scheduled_at: when.toISOString(), total: st.total, remaining: st.remaining });
    }

    // Wyślij teraz: pierwsza paczka od ręki, resztę dokończy worker w ciągu minuty-dwóch.
    await req.db.query(`UPDATE email_campaigns SET status = 'sending', updated_at = now() WHERE id = $1`, [campaignId]);
    await sendCampaignBatch(req.db, campaign, { baseUrl, tenantSlug, churchName }, HTTP_BATCH);
    const st = await refreshCampaign(req.db, campaignId);
    return reply.send({
      sent: st.sent, failed: st.failed, remaining: st.remaining, total: st.total,
      unsubscribed: st.unsubscribed, status: st.status,
    });
  } catch (err) {
    req.log?.error?.({ err }, 'send-mailing-campaign');
    return reply.code(500).send({ error: 'Nie udało się wysłać maila. Spróbuj ponownie za chwilę.' });
  }
}

// ── Worker: zaplanowane i rozpoczęte kampanie (co minutę) ───────────────────
// ctx: { tenantSlug, tenantSubdomain?, tenantName?, log? }
export async function runForTenant(pool, ctx = {}) {
  const tenantSlug = ctx.tenantSlug;
  const baseUrl = tenantBaseUrl({ subdomain: ctx.tenantSubdomain, slug: tenantSlug });
  try {
    // Odbiorcy „zarezerwowani”, ale niewysłani (np. restart w trakcie) wracają do kolejki.
    await pool.query(
      `UPDATE email_campaign_recipients SET status = 'pending', claimed_at = NULL
        WHERE status = 'sending' AND (claimed_at IS NULL OR claimed_at < now() - make_interval(mins => $1::int))`,
      [STALE_CLAIM_MINUTES]
    );
    // Nadszedł termin zaplanowanej wysyłki.
    await pool.query(
      `UPDATE email_campaigns SET status = 'sending', updated_at = now()
        WHERE status = 'scheduled' AND (scheduled_at IS NULL OR scheduled_at <= now())`
    );
  } catch (err) {
    if (err?.code === '42P01') return; // tenant bez tabel Mailingu
    throw err;
  }

  const { rows: campaigns } = await pool.query(
    `SELECT id, subject, html_content FROM email_campaigns
      WHERE status = 'sending' ORDER BY scheduled_at NULLS FIRST, created_at`
  );
  if (campaigns.length === 0) return;

  const churchName = await churchNameFor(pool, ctx.tenantName);
  for (const campaign of campaigns) {
    let processed = 0;
    let stopped = false;
    while (processed < WORKER_MAX_PER_RUN && !stopped) {
      const batch = await sendCampaignBatch(
        pool, campaign, { baseUrl, tenantSlug, churchName },
        Math.min(WORKER_BATCH, WORKER_MAX_PER_RUN - processed)
      );
      processed += batch.claimed;
      stopped = batch.claimed === 0 || batch.deferred > 0;
    }
    const st = await refreshCampaign(pool, campaign.id);
    ctx.log?.(`mailing ${campaign.id}: wysłano ${st.sent}/${st.total}, błędy ${st.failed}, w kolejce ${st.remaining}, status ${st.status}`);
  }
}
