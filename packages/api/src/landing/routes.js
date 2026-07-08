// Publiczne API strony głównej (avenit.pl): formularz zgłoszeniowy.
// Zgłoszenie trafia do bazy platform (landing_leads) + powiadomienie e-mail.
import { platformPool } from '../db.js';
import { sendEmail } from '../lib/email.js';
import { config } from '../config.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const esc = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export default async function landingRoutes(app) {
  app.post(
    '/api/public/landing-contact',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const b = req.body || {};

      // Honeypot: pole "website" jest ukryte w formularzu — bot, który je
      // wypełni, dostaje pozorny sukces bez zapisu.
      if (b.website) return reply.send({ ok: true });

      const name = String(b.name || '').trim().slice(0, 255);
      const email = String(b.email || '').trim().slice(0, 255);
      const phone = String(b.phone || '').trim().slice(0, 50);
      const church = String(b.church || '').trim().slice(0, 255);
      const message = String(b.message || '').trim().slice(0, 5000);

      if (!name || !EMAIL_RE.test(email)) {
        return reply.code(400).send({ error: 'Podaj imię i poprawny adres e-mail.' });
      }

      const { rows } = await platformPool.query(
        `INSERT INTO landing_leads (name, email, phone, church, message, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [name, email, phone || null, church || null, message || null,
         req.ip || null, String(req.headers['user-agent'] || '').slice(0, 500) || null]
      );

      // Powiadomienie — zgłoszenie jest już w bazie, więc błąd wysyłki nie
      // przepada: logujemy i zwracamy sukces.
      try {
        await sendEmail({
          to: config.LANDING_CONTACT_EMAIL,
          subject: `Avenit — nowe zgłoszenie: ${church || name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
              <h2>Nowe zgłoszenie ze strony avenit.pl</h2>
              <table style="border-collapse: collapse; width: 100%;">
                <tr><td style="padding:6px 12px 6px 0; color:#6b7280;">Imię i nazwisko</td><td style="padding:6px 0;"><strong>${esc(name)}</strong></td></tr>
                <tr><td style="padding:6px 12px 6px 0; color:#6b7280;">E-mail</td><td style="padding:6px 0;">${esc(email)}</td></tr>
                <tr><td style="padding:6px 12px 6px 0; color:#6b7280;">Telefon</td><td style="padding:6px 0;">${esc(phone) || '—'}</td></tr>
                <tr><td style="padding:6px 12px 6px 0; color:#6b7280;">Kościół</td><td style="padding:6px 0;">${esc(church) || '—'}</td></tr>
              </table>
              <p style="white-space: pre-wrap; background:#f9fafb; padding:12px; border-radius:8px;">${esc(message) || '(brak wiadomości)'}</p>
              <p style="color:#9ca3af; font-size:12px;">ID zgłoszenia: ${rows[0].id}</p>
            </div>`,
          text: `Nowe zgłoszenie ze strony avenit.pl\n\nImię: ${name}\nE-mail: ${email}\nTelefon: ${phone || '—'}\nKościół: ${church || '—'}\n\n${message || '(brak wiadomości)'}`,
        });
      } catch (err) {
        req.log.warn({ err }, 'landing-contact: e-mail powiadomienia nie wysłany');
      }

      return reply.send({ ok: true });
    }
  );
}
