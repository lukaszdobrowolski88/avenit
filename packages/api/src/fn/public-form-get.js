// Publiczny odczyt opublikowanego formularza (strona /form/:id dla osób niezalogowanych).
// Dane API wymagają sesji, więc bez tego gość widział „Formularz nie został znaleziony”.
// Zwraca tylko formularz w statusie „published” i bez sekretów płatności z ustawień.
export const name = 'public-form-get';
export const isPublic = true; // tenant z Host/X-Tenant

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Klucze bramek płatności nie mogą trafić do przeglądarki gościa (płatność i tak podpisuje serwer).
export function publicSettings(settings) {
  const s = { ...(settings || {}) };
  if (s.pricing?.przelewy24) {
    s.pricing = { ...s.pricing, przelewy24: { ...s.pricing.przelewy24, crcKey: undefined, apiKey: undefined } };
  }
  if (s.pricing?.paypal) {
    s.pricing = { ...s.pricing, paypal: { ...s.pricing.paypal, clientSecret: undefined, secret: undefined } };
  }
  if (s.emails?.adminNotification) {
    s.emails = { ...s.emails, adminNotification: { ...s.emails.adminNotification, emails: undefined } };
  }
  return s;
}

export default async function handler(req, reply) {
  try {
    const { formId } = req.body || {};
    if (!formId || !UUID_RE.test(String(formId))) return reply.code(400).send({ error: 'Nieprawidłowy formularz' });
    const { rows } = await req.db.query(
      `SELECT id, title, description, fields, settings, status, closes_at, response_count
         FROM forms
        WHERE id = $1 AND COALESCE(is_archived, false) = false AND COALESCE(is_active, true) = true
        LIMIT 1`,
      [formId]
    );
    const form = rows[0];
    if (!form) return reply.code(404).send({ error: 'not_found' });
    if (form.status !== 'published') return reply.code(403).send({ error: 'form_not_available' });
    return reply.send({ form: { ...form, settings: publicSettings(form.settings) } });
  } catch (err) {
    req.log?.error?.({ err }, 'public-form-get');
    return reply.code(500).send({ error: 'Nie udało się pobrać formularza' });
  }
}
