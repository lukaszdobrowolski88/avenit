// Zmienne personalizacji dostępne w szablonach emaili formularzy
export const FORM_EMAIL_VARIABLES = [
  { key: '{{imie}}', label: 'Imie', description: 'Imie osoby wypelniajcej' },
  { key: '{{nazwisko}}', label: 'Nazwisko', description: 'Nazwisko osoby' },
  { key: '{{email}}', label: 'Email', description: 'Adres email' },
  { key: '{{data}}', label: 'Data', description: 'Data wyslania formularza' },
  { key: '{{formularz_nazwa}}', label: 'Nazwa formularza', description: 'Tytul formularza' },
  { key: '{{formularz_link}}', label: 'Link do formularza', description: 'URL formularza' },
  { key: '{{kwota}}', label: 'Kwota', description: 'Kwota do zaplaty' },
  { key: '{{metoda_platnosci}}', label: 'Metoda platnosci', description: 'Wybrana metoda platnosci' },
  { key: '{{numer_konta}}', label: 'Numer konta', description: 'Numer konta do przelewu' },
  { key: '{{termin_platnosci}}', label: 'Termin platnosci', description: 'Data do ktorej nalezy zaplacic' },
  { key: '{{odpowiedzi}}', label: 'Odpowiedzi', description: 'Podsumowanie odpowiedzi z formularza' },
  { key: '{{kosciol}}', label: 'Nazwa kosciola', description: 'Nazwa organizacji' }
];

// Domyslne szablony emaili dla formularzy
export const DEFAULT_FORM_EMAIL_TEMPLATES = {
  // Email potwierdzajcy rejestracje/wyslanie formularza
  confirmation: {
    id: 'confirmation',
    name: 'Potwierdzenie rejestracji',
    subject: 'Potwierdzenie - {{formularz_nazwa}}',
    description: 'Wysylany automatycznie po wyslaniu formularza',
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
      <div style="background: linear-gradient(135deg, #ec4899, #f97316); padding: 30px; text-align: center;">
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
    name: 'Informacja o platnosci',
    subject: 'Platnosc - {{formularz_nazwa}}',
    description: 'Wysylany gdy wymagana jest platnosc przelewem',
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
    name: 'Przypomnienie o platnosci',
    subject: 'Przypomnienie o platnosci - {{formularz_nazwa}}',
    description: 'Wysylany jako przypomnienie o niezaplaconej platnosci',
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
    name: 'Potwierdzenie platnosci',
    subject: 'Platnosc potwierdzona - {{formularz_nazwa}}',
    description: 'Wysylany po potwierdzeniu platnosci',
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
    description: 'Wysylany do administratora po kazdym nowym zgloszeniu',
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
    churchName = 'Kosciol'
  } = data;

  // Formatuj odpowiedzi jako HTML
  const answersHtml = answers.length > 0
    ? answers.map(a => `
        <div style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 6px; border-left: 3px solid #ec4899;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">${a.label}</p>
          <p style="margin: 0; font-size: 14px; color: #374151;">${a.value || '-'}</p>
        </div>
      `).join('')
    : '<p style="color: #6b7280; font-style: italic;">Brak odpowiedzi</p>';

  const variables = {
    '{{imie}}': firstName,
    '{{nazwisko}}': lastName,
    '{{email}}': email,
    '{{data}}': new Date().toLocaleDateString('pl-PL', {
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

  Object.entries(variables).forEach(([key, value]) => {
    personalizedHtml = personalizedHtml.split(key).join(value || '');
    personalizedSubject = personalizedSubject.split(key).join(value || '');
  });

  return {
    subject: personalizedSubject,
    html: personalizedHtml
  };
}

// Domyslne ustawienia emaili dla formularzy
export const DEFAULT_FORM_EMAIL_SETTINGS = {
  enabled: false,
  // Potwierdzenie rejestracji
  confirmationEmail: {
    enabled: true,
    useCustomTemplate: false,
    customTemplateId: null,
    customSubject: '',
    customHtml: '',
    customBlocks: null  // Bloki JSON dla kreatora graficznego
  },
  // Informacja o platnosci (dla przelew)
  paymentEmail: {
    enabled: true,
    useCustomTemplate: false,
    customTemplateId: null,
    customSubject: '',
    customHtml: '',
    customBlocks: null
  },
  // Przypomnienie o platnosci
  reminderEmail: {
    enabled: false,
    daysBeforeDeadline: 3,
    useCustomTemplate: false,
    customTemplateId: null,
    customSubject: '',
    customHtml: '',
    customBlocks: null
  },
  // Potwierdzenie platnosci
  paymentConfirmedEmail: {
    enabled: true,
    useCustomTemplate: false,
    customTemplateId: null,
    customSubject: '',
    customHtml: '',
    customBlocks: null
  },
  // Powiadomienie dla administratora
  adminNotification: {
    enabled: false,
    emails: [], // Lista adresow email administratorow
    useCustomTemplate: false,
    customTemplateId: null,
    customSubject: '',
    customHtml: '',
    customBlocks: null
  },
  // Ustawienia platnosci
  paymentDeadlineDays: 7 // Ile dni na zaplate
};
