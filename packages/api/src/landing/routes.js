// Publiczne API strony głównej (avenit.pl): formularz zgłoszeniowy.
// Zgłoszenie trafia do bazy platform (landing_leads) + powiadomienie e-mail
// do administratora i potwierdzenie do zgłaszającego.
//
// Ochrona przed botami (warstwy):
//  1. honeypot "website" — wypełniony => pozorny sukces bez zapisu,
//  2. token HMAC wydawany przy wejściu na stronę — POST bez ważnego tokena
//     odpada (boty strzelające prosto w endpoint),
//  3. minimalny wiek tokena 3 s — wypełnienie szybciej niż człowiek => pozorny
//     sukces bez zapisu; maksymalny wiek 24 h (stare zakładki dostają czytelny
//     komunikat o odświeżeniu),
//  4. limit linków w wiadomości (spam prawie zawsze wkleja URL-e),
//  5. deduplikacja: ten sam e-mail + wiadomość w 24 h => idempotentny sukces,
//  6. rate limit per IP (fastify-rate-limit).
import crypto from 'node:crypto';
import { platformPool } from '../db.js';
import { sendEmail } from '../lib/email.js';
import { config } from '../config.js';
import { leadNotificationEmail, leadConfirmationEmail } from './emails.js';
import { getDailySalt, landingVisitorKey } from '../analytics/sessions.js';

// Powiąż zgłoszenie z odwiedzającym z analityki (lejek konwersji). Klucz liczony
// tym samym dziennym hashem co eventy z a.js (IP+UA po stronie serwera), więc
// żadnych danych z klienta nie potrzeba. Analityka nigdy nie może zepsuć leada —
// wołane fire-and-forget z pełnym catch.
async function attachLeadToVisitor(req, leadId) {
  const ua = String(req.headers['user-agent'] || '');
  const key = landingVisitorKey(await getDailySalt(), req.ip || '', ua);
  const { rows } = await platformPool.query(
    `SELECT id FROM analytics_visitors WHERE visitor_key = $1`, [key]
  );
  const visitorId = rows[0]?.id;
  if (!visitorId) return;
  await platformPool.query(
    `UPDATE landing_leads SET visitor_id = $1 WHERE id = $2 AND visitor_id IS NULL`,
    [visitorId, leadId]
  );
  // Event 'lead' na osi czasu odwiedzającego (dopięty do otwartej sesji, jeśli jest).
  const { rows: s } = await platformPool.query(
    `SELECT id FROM analytics_sessions
      WHERE visitor_id = $1 AND site = 'landing'
        AND last_activity_at > NOW() - interval '30 minutes'
      ORDER BY last_activity_at DESC LIMIT 1`,
    [visitorId]
  );
  await platformPool.query(
    `INSERT INTO analytics_events (session_id, visitor_id, site, name, path)
     VALUES ($1, $2, 'landing', 'lead', '/#kontakt')`,
    [s[0]?.id || null, visitorId]
  );
  if (s[0]) {
    await platformPool.query(
      `UPDATE analytics_sessions SET events = events + 1, last_activity_at = NOW() WHERE id = $1`,
      [s[0].id]
    );
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_MIN_AGE_MS = 3_000;
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LINKS = 2;

const signToken = (ts) =>
  crypto.createHmac('sha256', config.JWT_SECRET).update(`landing-form.${ts}`).digest('base64url');

function verifyToken(token) {
  const [ts, sig] = String(token || '').split('.');
  if (!/^\d+$/.test(ts || '') || !sig) return { ok: false };
  const expected = signToken(ts);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false };
  }
  const age = Date.now() - Number(ts);
  if (age > TOKEN_MAX_AGE_MS || age < 0) return { ok: false };
  return { ok: true, tooFast: age < TOKEN_MIN_AGE_MS };
}

export default async function landingRoutes(app) {
  // Token formularza — strona pobiera go przy załadowaniu.
  app.get(
    '/api/public/landing-form-token',
    { config: { rateLimit: { max: 60, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const ts = Date.now();
      return reply.send({ token: `${ts}.${signToken(ts)}` });
    }
  );

  app.post(
    '/api/public/landing-contact',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const b = req.body || {};

      // (1) honeypot
      if (b.website) return reply.send({ ok: true });

      // (2)+(3) token
      const token = verifyToken(b.token);
      if (!token.ok) {
        return reply.code(400).send({ error: 'Sesja formularza wygasła — odśwież stronę i spróbuj ponownie.' });
      }
      if (token.tooFast) return reply.send({ ok: true }); // bot: pozorny sukces

      const name = String(b.name || '').trim().slice(0, 255);
      const email = String(b.email || '').trim().slice(0, 255);
      const phone = String(b.phone || '').trim().slice(0, 50);
      const church = String(b.church || '').trim().slice(0, 255);
      const message = String(b.message || '').trim().slice(0, 5000);

      if (!name || !EMAIL_RE.test(email)) {
        return reply.code(400).send({ error: 'Podaj imię i poprawny adres e-mail.' });
      }

      // (4) spam z linkami
      const linkCount = (message.match(/https?:\/\//gi) || []).length;
      if (linkCount > MAX_MESSAGE_LINKS) {
        return reply.code(400).send({ error: 'Wiadomość zawiera zbyt wiele linków — usuń je i spróbuj ponownie.' });
      }

      // (5) deduplikacja (chroni też przed podwójnym kliknięciem)
      const { rows: dup } = await platformPool.query(
        `SELECT id FROM landing_leads
          WHERE lower(email) = lower($1) AND coalesce(message, '') = $2
            AND created_at > now() - interval '24 hours' LIMIT 1`,
        [email, message]
      );
      if (dup[0]) return reply.send({ ok: true });

      const { rows } = await platformPool.query(
        `INSERT INTO landing_leads (name, email, phone, church, message, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, email, phone, church, message`,
        [name, email, phone || null, church || null, message || null,
         req.ip || null, String(req.headers['user-agent'] || '').slice(0, 500) || null]
      );
      const lead = rows[0];

      // Analityka: lejek konwersji (nie blokuje odpowiedzi ani maili).
      attachLeadToVisitor(req, lead.id).catch((err) =>
        req.log.warn({ err }, 'landing-contact: powiązanie z analityką nieudane')
      );

      // Powiadomienie dla admina (Reply-To = zgłaszający) + potwierdzenie dla
      // zgłaszającego (Reply-To = adres kontaktowy). Zgłoszenie jest już w
      // bazie, więc błędy wysyłki tylko logujemy.
      try {
        const mail = leadNotificationEmail(lead);
        await sendEmail({ to: config.LANDING_CONTACT_EMAIL, replyTo: lead.email, ...mail });
      } catch (err) {
        req.log.warn({ err }, 'landing-contact: powiadomienie nie wysłane');
      }
      try {
        const mail = leadConfirmationEmail(lead);
        await sendEmail({ to: lead.email, replyTo: config.LANDING_CONTACT_EMAIL, ...mail });
      } catch (err) {
        req.log.warn({ err }, 'landing-contact: potwierdzenie do zgłaszającego nie wysłane');
      }

      return reply.send({ ok: true });
    }
  );
}
