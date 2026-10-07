// Szablony i personalizacja e-maili modułu Formularze — wspólne dla webu (podgląd/wysyłki
// z panelu) i API (wysyłka po publicznym zgłoszeniu: serwer sam składa treść, więc przeglądarka
// gościa nie może podsunąć dowolnego HTML-a do wysłania z domeny kościoła).

// Dane wpisane przez osobę wypełniającą trafiają do HTML-a maila — escapujemy je.
export function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Domyslne szablony emaili dla formularzy
export const DEFAULT_FORM_EMAIL_TEMPLATES = {
  // Email potwierdzajcy rejestracje/wyslanie formularza
  confirmation: {
    id: 'confirmation',
    name: 'Potwierdzenie rejestracji',
    subject: 'Potwierdzenie - {{formularz_nazwa}}',
    description: 'Wysyłany automatycznie po wysłaniu formularza',
    html_content: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #c7ab71, #a08847); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Dziekujemy za rejestracje!</h1>
      </div>

      <!-- Content -->
      <div style="padding: 30px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Czesc <strong>{{imie}}</strong>,
        </p>

        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Twoja odpowiedz na formularz <strong>{{formularz_nazwa}}</strong> zostala pomyslnie zapisana.
        </p>

        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
            Podsumowanie odpowiedzi
          </h3>
          {{odpowiedzi}}
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          Jesli masz pytania, skontaktuj sie z nami odpowiadajac na tego maila.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          {{kosciol}}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `
  },

  // Email z informacja o platnosci
  payment_info: {
    id: 'payment_info',
    name: 'Informacja o płatności',
    subject: 'Platnosc - {{formularz_nazwa}}',
    description: 'Wysyłany, gdy wymagana jest płatność przelewem',
    html_content: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Informacja o platnosci</h1>
      </div>

      <!-- Content -->
      <div style="padding: 30px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Czesc <strong>{{imie}}</strong>,
        </p>

        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Dziekujemy za rejestracje na <strong>{{formularz_nazwa}}</strong>.
          Ponizej znajdziesz informacje dotyczace platnosci.
        </p>

        <!-- Payment Box -->
        <div style="background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 2px solid #10b981; border-radius: 12px; padding: 25px; margin: 25px 0;">
          <div style="text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 14px; color: #059669; text-transform: uppercase; letter-spacing: 1px;">
              Kwota do zaplaty
            </p>
            <p style="margin: 10px 0 0 0; font-size: 36px; font-weight: bold; color: #047857;">
              {{kwota}}
            </p>
          </div>

          <div style="border-top: 1px solid #a7f3d0; padding-top: 20px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;">
              <strong>Numer konta:</strong>
            </p>
            <p style="margin: 0; font-size: 16px; font-family: monospace; color: #047857; background: white; padding: 12px; border-radius: 8px;">
              {{numer_konta}}
            </p>
          </div>

          <div style="margin-top: 15px;">
            <p style="margin: 0 0 5px 0; font-size: 14px; color: #374151;">
              <strong>Tytul przelewu:</strong>
            </p>
            <p style="margin: 0; font-size: 14px; color: #6b7280;">
              {{formularz_nazwa}} - {{imie}} {{nazwisko}}
            </p>
          </div>

          <div style="margin-top: 15px;">
            <p style="margin: 0 0 5px 0; font-size: 14px; color: #374151;">
              <strong>Termin platnosci:</strong>
            </p>
            <p style="margin: 0; font-size: 14px; color: #dc2626; font-weight: 600;">
              {{termin_platnosci}}
            </p>
          </div>
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          Po zaksiegowaniu wplaty otrzymasz potwierdzenie na ten adres email.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          {{kosciol}}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `
  },

  // Email z przypomnieniem o platnosci
  payment_reminder: {
    id: 'payment_reminder',
    name: 'Przypomnienie o płatności',
    subject: 'Przypomnienie o platnosci - {{formularz_nazwa}}',
    description: 'Wysyłany jako przypomnienie o niezapłaconej płatności',
    html_content: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Przypomnienie o platnosci</h1>
      </div>

      <!-- Content -->
      <div style="padding: 30px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Czesc <strong>{{imie}}</strong>,
        </p>

        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Przypominamy o platnosci za <strong>{{formularz_nazwa}}</strong>.
          Nie odnotowalismy jeszcze wplaty na Twoje konto.
        </p>

        <!-- Alert Box -->
        <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 12px; padding: 20px; margin: 25px 0;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <span style="font-size: 24px; margin-right: 10px;">&#9888;</span>
            <strong style="color: #92400e;">Termin platnosci uplywa: {{termin_platnosci}}</strong>
          </div>

          <div style="text-align: center; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #92400e;">
              Kwota do zaplaty
            </p>
            <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold; color: #b45309;">
              {{kwota}}
            </p>
          </div>
        </div>

        <!-- Payment Details -->
        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;">
            <strong>Numer konta:</strong>
          </p>
          <p style="margin: 0 0 15px 0; font-size: 16px; font-family: monospace; color: #374151;">
            {{numer_konta}}
          </p>

          <p style="margin: 0 0 5px 0; font-size: 14px; color: #374151;">
            <strong>Tytul przelewu:</strong>
          </p>
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            {{formularz_nazwa}} - {{imie}} {{nazwisko}}
          </p>
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          Jesli juz dokonales platnosci, prosimy o zignorowanie tej wiadomosci.
          Ksiegowanie moze zajac do 2 dni roboczych.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          {{kosciol}}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `
  },

  // Email z potwierdzeniem platnosci
  payment_confirmed: {
    id: 'payment_confirmed',
    name: 'Potwierdzenie płatności',
    subject: 'Platnosc potwierdzona - {{formularz_nazwa}}',
    description: 'Wysyłany po potwierdzeniu płatności',
    html_content: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 10px;">&#10003;</div>
        <h1 style="color: white; margin: 0; font-size: 24px;">Platnosc potwierdzona!</h1>
      </div>

      <!-- Content -->
      <div style="padding: 30px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Czesc <strong>{{imie}}</strong>,
        </p>

        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Z przyjemnoscia potwierdzamy otrzymanie Twojej platnosci za <strong>{{formularz_nazwa}}</strong>.
        </p>

        <!-- Success Box -->
        <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 12px; padding: 25px; margin: 25px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #059669; text-transform: uppercase;">
            Oplacona kwota
          </p>
          <p style="margin: 0; font-size: 36px; font-weight: bold; color: #047857;">
            {{kwota}}
          </p>
          <p style="margin: 15px 0 0 0; font-size: 14px; color: #6b7280;">
            Data: {{data}}
          </p>
        </div>

        <p style="font-size: 16px; color: #374151;">
          Dziekujemy za dokonanie platnosci. Twoja rejestracja jest teraz kompletna.
        </p>

        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          Do zobaczenia!
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          {{kosciol}}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `
  },

  // Email dla administratora o nowym zgloszeniu
  admin_notification: {
    id: 'admin_notification',
    name: 'Powiadomienie dla administratora',
    subject: 'Nowe zgloszenie - {{formularz_nazwa}}',
    description: 'Wysyłany do administratora po każdym nowym zgłoszeniu',
    html_content: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Nowe zgloszenie w formularzu</h1>
      </div>

      <!-- Content -->
      <div style="padding: 30px;">
        <div style="background: #eff6ff; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 0 0 5px 0; font-size: 12px; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.5px;">
            Formularz
          </p>
          <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1e40af;">
            {{formularz_nazwa}}
          </p>
        </div>

        <div style="display: grid; gap: 15px; margin-bottom: 25px;">
          <div style="background: #f9fafb; border-radius: 8px; padding: 15px;">
            <p style="margin: 0 0 5px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">
              Osoba
            </p>
            <p style="margin: 0; font-size: 16px; color: #374151; font-weight: 500;">
              {{imie}} {{nazwisko}}
            </p>
          </div>

          <div style="background: #f9fafb; border-radius: 8px; padding: 15px;">
            <p style="margin: 0 0 5px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">
              Email
            </p>
            <p style="margin: 0; font-size: 16px; color: #374151;">
              {{email}}
            </p>
          </div>

          <div style="background: #f9fafb; border-radius: 8px; padding: 15px;">
            <p style="margin: 0 0 5px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">
              Data zgloszenia
            </p>
            <p style="margin: 0; font-size: 16px; color: #374151;">
              {{data}}
            </p>
          </div>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
          <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">
            Odpowiedzi
          </h3>
          {{odpowiedzi}}
        </div>

        <div style="margin-top: 25px; text-align: center;">
          <a href="{{formularz_link}}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 500;">
            Zobacz w panelu
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          {{kosciol}} - System formularzy
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `
  }
};

// Funkcja personalizujaca szablon email dla formularza
export function personalizeFormEmail(template, data) {
  const {
    firstName = '',
    lastName = '',
    email = '',
    formTitle = '',
    formLink = '',
    amount = '',
    paymentMethod = '',
    bankAccount = '',
    paymentDeadline = '',
    answers = [],
    churchName = 'Kościół',
    locale = 'pl-PL'
  } = data;

  // Formatuj odpowiedzi jako HTML
  const answersHtml = answers.length > 0
    ? answers.map(a => `
        <div style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 6px; border-left: 3px solid #c7ab71;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">${escapeHtml(a.label)}</p>
          <p style="margin: 0; font-size: 14px; color: #374151;">${escapeHtml(a.value) || '-'}</p>
        </div>
      `).join('')
    : '<p style="color: #6b7280; font-style: italic;">Brak odpowiedzi</p>';

  const variables = {
    '{{imie}}': firstName,
    '{{nazwisko}}': lastName,
    '{{email}}': email,
    '{{data}}': new Date().toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    '{{formularz_nazwa}}': formTitle,
    '{{formularz_link}}': formLink,
    '{{kwota}}': amount,
    '{{metoda_platnosci}}': paymentMethod,
    '{{numer_konta}}': bankAccount,
    '{{termin_platnosci}}': paymentDeadline,
    '{{odpowiedzi}}': answersHtml,
    '{{kosciol}}': churchName
  };

  let personalizedHtml = template.html_content;
  let personalizedSubject = template.subject;

  // W HTML-u wartości są escapowane (dane z formularza wpisuje dowolna osoba); blok odpowiedzi
  // jest już gotowym, bezpiecznym HTML-em. Temat to zwykły tekst — bez escapowania.
  Object.entries(variables).forEach(([key, value]) => {
    const htmlValue = key === '{{odpowiedzi}}' ? (value || '') : escapeHtml(value || '');
    personalizedHtml = personalizedHtml.split(key).join(htmlValue);
    personalizedSubject = personalizedSubject.split(key).join(value || '');
  });

  return {
    subject: personalizedSubject,
    html: personalizedHtml
  };
}


// Wartość odpowiedzi do maila (etykiety opcji zamiast wartości, daty w locale).
export function formatAnswerValue(value, field, locale = 'pl-PL') {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) {
    if (field.options) {
      return value.map((v) => field.options.find((o) => o.value === v)?.label ?? v).join(', ');
    }
    return value.join(', ');
  }
  if (field.options && (field.type === 'radio' || field.type === 'select')) {
    return field.options.find((o) => o.value === value)?.label ?? value;
  }
  if (field.type === 'date' && value) return new Date(value).toLocaleDateString(locale);
  if (typeof value === 'object') return '';
  return String(value);
}

export function formatPrice(amount, currency = 'PLN', locale = 'pl-PL') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount || 0);
}

const SKIP_TYPES = ['location', 'date_start', 'date_end', 'time_start', 'time_end', 'price', 'seat_limit'];

// Osoba wypełniająca: pierwsze pole e-mail i pole tekstowe z „imię/name/nazwisko” w etykiecie.
export function findRespondent(fields = [], answers = {}) {
  const emailField = fields.find((f) => f.type === 'email');
  const nameField = fields.find((f) => f.type === 'text' && /imie|imię|name|nazwisko/i.test(f.label || ''));
  return {
    email: emailField ? answers[emailField.id] || null : null,
    name: nameField ? answers[nameField.id] || '' : '',
  };
}

const pick = (cfg, def) => (cfg?.useCustomTemplate && cfg?.customHtml
  ? { subject: cfg.customSubject || def.subject, html_content: cfg.customHtml }
  : def);

// E-maile po wysłaniu formularza (potwierdzenie, dane do przelewu, powiadomienie administratora).
// Zwraca listę { to, subject, html, type } — wysyła wywołujący.
export function buildSubmissionEmails({ form, answers = {}, totalPrice = 0, paymentMethod = null, origin = '', locale = 'pl-PL', churchName = 'Kościół' }) {
  const settings = form?.settings || {};
  const emails = settings.emails;
  if (!emails?.enabled) return [];
  const fields = form.fields || [];
  const { email, name } = findRespondent(fields, answers);
  const firstName = (name || '').split(' ')[0] || '';
  const lastName = (name || '').split(' ').slice(1).join(' ') || '';
  const formatted = fields
    .filter((f) => !SKIP_TYPES.includes(f.type))
    .map((f) => ({ label: f.label, value: formatAnswerValue(answers[f.id], f, locale) }))
    .filter((a) => a.value);
  const base = { firstName, lastName, email: email || '', formTitle: form.title, churchName, locale };
  const out = [];

  if (email && emails.confirmationEmail?.enabled !== false) {
    const p = personalizeFormEmail(pick(emails.confirmationEmail, DEFAULT_FORM_EMAIL_TEMPLATES.confirmation), {
      ...base, formLink: `${origin}/form/${form.id}`, answers: formatted,
    });
    out.push({ to: email, subject: p.subject, html: p.html, type: 'confirmation' });
  }

  const pricing = settings.pricing;
  if (email && paymentMethod === 'transfer' && totalPrice > 0 && emails.paymentEmail?.enabled !== false && pricing?.paymentMethods?.includes('transfer')) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + (emails.paymentDeadlineDays || 7));
    const p = personalizeFormEmail(pick(emails.paymentEmail, DEFAULT_FORM_EMAIL_TEMPLATES.payment_info), {
      ...base,
      formLink: `${origin}/form/${form.id}`,
      amount: formatPrice(totalPrice, pricing?.currency || 'PLN', locale),
      bankAccount: pricing?.bankAccount || '',
      paymentDeadline: deadline.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' }),
    });
    out.push({ to: email, subject: p.subject, html: p.html, type: 'payment_info' });
  }

  const admins = emails.adminNotification?.enabled ? (emails.adminNotification.emails || []) : [];
  if (admins.length) {
    const p = personalizeFormEmail(pick(emails.adminNotification, DEFAULT_FORM_EMAIL_TEMPLATES.admin_notification), {
      ...base, formLink: `${origin}/forms?view=responses&formId=${form.id}`, answers: formatted,
    });
    for (const to of admins) out.push({ to, subject: p.subject, html: p.html, type: 'admin_notification' });
  }
  return out;
}
