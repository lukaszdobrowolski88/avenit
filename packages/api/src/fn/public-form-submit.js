// Publiczne wysłanie formularza (gość bez konta). Serwer sam sprawdza, czy formularz jest
// opublikowany i otwarty, zapisuje odpowiedź i wysyła e-maile z ustawień formularza
// (potwierdzenie, dane do przelewu, powiadomienie administratora) — treść składa serwer,
// więc przeglądarka nie może podsunąć dowolnego HTML-a do wysłania z domeny kościoła.
import { buildSubmissionEmails, findRespondent } from '@avenit/shared/src/forms/formEmails.js';
import { sendEmail } from '../lib/email.js';

export const name = 'public-form-submit';
export const isPublic = true;
export const rateLimit = { max: 10, timeWindow: '10 minutes' };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_ANSWERS_BYTES = 200 * 1024;

export default async function handler(req, reply) {
  try {
    const { formId, answers, totalPrice, paymentMethod } = req.body || {};
    if (!formId || !UUID_RE.test(String(formId))) return reply.code(400).send({ error: 'Nieprawidłowy formularz' });
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return reply.code(400).send({ error: 'Brak odpowiedzi' });
    if (JSON.stringify(answers).length > MAX_ANSWERS_BYTES) return reply.code(413).send({ error: 'Odpowiedź jest za duża' });

    const { rows } = await req.db.query(
      `SELECT id, title, fields, settings, status, closes_at, response_count
         FROM forms WHERE id = $1 AND COALESCE(is_archived, false) = false AND COALESCE(is_active, true) = true LIMIT 1`,
      [formId]
    );
    const form = rows[0];
    if (!form) return reply.code(404).send({ error: 'not_found' });
    if (form.status !== 'published') return reply.code(403).send({ error: 'form_not_available' });
    if (form.closes_at && new Date(form.closes_at) < new Date()) return reply.code(403).send({ error: 'form_closed' });
    const limit = Number(form.settings?.limitResponses) || 0;
    if (limit && (form.response_count || 0) >= limit) return reply.code(403).send({ error: 'limit_reached' });

    const { email, name: respondentName } = findRespondent(form.fields || [], answers);
    const { rows: ins } = await req.db.query(
      `INSERT INTO form_responses (form_id, answers, data, respondent_email, respondent_name)
       VALUES ($1, $2::jsonb, $2::jsonb, $3, $4) RETURNING id`,
      [form.id, JSON.stringify(answers), email ? String(email).slice(0, 320) : null, respondentName ? String(respondentName).slice(0, 200) : null]
    );
    const responseId = ins[0].id;
    await req.db.query(
      `UPDATE forms SET response_count = (SELECT count(*) FROM form_responses WHERE form_id = $1) WHERE id = $1`,
      [form.id]
    );

    // E-maile — nie blokują odpowiedzi i ich błąd nie cofa zapisu zgłoszenia.
    const origin = req.headers.origin && /^https:\/\/[a-z0-9.-]+$/i.test(req.headers.origin)
      ? req.headers.origin : `https://${req.headers.host}`;
    let churchName = 'Kościół';
    try {
      const { rows: s } = await req.db.query(`SELECT value FROM app_settings WHERE key = 'org_name' LIMIT 1`);
      if (s[0]?.value) churchName = s[0].value;
    } catch { /* brak ustawienia — zostaje domyślna nazwa */ }
    const mails = buildSubmissionEmails({
      form, answers, totalPrice: Number(totalPrice) || 0, paymentMethod: paymentMethod || null, origin, churchName,
    });
    Promise.allSettled(mails.map(async (m) => {
      let status = 'sent'; let error = null;
      try { await sendEmail({ to: m.to, subject: m.subject, html: m.html, fromName: churchName }); }
      catch (e) { status = 'failed'; error = e.message; req.log?.warn?.({ err: e, to: m.to }, 'public-form-submit mail'); }
      await req.db.query(
        `INSERT INTO form_email_logs (form_id, response_id, email_type, recipient, subject, status, error_message, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [form.id, responseId, m.type, m.to, m.subject, status, error, status === 'sent' ? new Date().toISOString() : null]
      ).catch(() => {});
    })).catch(() => {});

    return reply.send({ success: true, id: responseId });
  } catch (err) {
    req.log?.error?.({ err }, 'public-form-submit');
    return reply.code(500).send({ error: 'Nie udało się zapisać zgłoszenia' });
  }
}
