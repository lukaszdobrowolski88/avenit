// Zmienne personalizacji dostępne w szablonach
export const EMAIL_VARIABLES = [
  { key: '{{imie}}', label: 'Imię', description: 'Imię odbiorcy' },
  { key: '{{nazwisko}}', label: 'Nazwisko', description: 'Nazwisko odbiorcy' },
  { key: '{{email}}', label: 'Email', description: 'Adres email odbiorcy' },
  { key: '{{data}}', label: 'Data', description: 'Aktualna data' },
  { key: '{{kosciol}}', label: 'Nazwa kościoła', description: 'Nazwa kościoła' },
  { key: '{{unsubscribe_url}}', label: 'Link wypisania', description: 'Link do wypisania z newslettera' }
];

// Personalizuj HTML dla konkretnego odbiorcy
export function personalizeHtml(htmlTemplate, recipient, campaignId, config = {}) {
  const firstName = recipient.full_name?.split(' ')[0] || '';
  const lastName = recipient.full_name?.split(' ').slice(1).join(' ') || '';

  // Generuj link do wypisania
  const unsubscribeUrl = config.baseUrl
    ? `${config.baseUrl}/unsubscribe?email=${encodeURIComponent(recipient.email)}&campaign=${campaignId}`
    : '#';

  const variables = {
    '{{imie}}': firstName,
    '{{nazwisko}}': lastName,
    '{{email}}': recipient.email || '',
    '{{data}}': new Date().toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    '{{kosciol}}': config.churchName || 'Kościół',
    '{{unsubscribe_url}}': unsubscribeUrl
  };

  let personalizedHtml = htmlTemplate;

  Object.entries(variables).forEach(([key, value]) => {
    personalizedHtml = personalizedHtml.split(key).join(value);
  });

  return personalizedHtml;
}

// Podświetl zmienne w edytorze (dla podglądu)
export function highlightVariables(html) {
  let highlightedHtml = html;

  EMAIL_VARIABLES.forEach(({ key }) => {
    const escapedKey = key.replace(/[{}]/g, '\\$&');
    const regex = new RegExp(escapedKey, 'g');
    highlightedHtml = highlightedHtml.replace(
      regex,
      `<span class="variable-highlight" style="background: #fef3c7; padding: 2px 4px; border-radius: 4px; font-family: monospace;">${key}</span>`
    );
  });

  return highlightedHtml;
}

// Waliduj czy wszystkie zmienne w HTML są prawidłowe
export function validateVariables(html) {
  const variablePattern = /\{\{[^}]+\}\}/g;
  const foundVariables = html.match(variablePattern) || [];
  const validKeys = EMAIL_VARIABLES.map(v => v.key);

  const invalidVariables = foundVariables.filter(v => !validKeys.includes(v));

  return {
    isValid: invalidVariables.length === 0,
    invalidVariables,
    foundVariables
  };
}

// Domyślna stopka email
export const DEFAULT_EMAIL_FOOTER = `
<div style="text-align: center; padding: 20px; font-size: 12px; color: #666; border-top: 1px solid #eee; margin-top: 30px;">
  <p style="margin: 0 0 10px 0;">Z błogosławieństwem,<br>{{kosciol}}</p>
  <p style="margin: 0;">
    <a href="{{unsubscribe_url}}" style="color: #999; text-decoration: underline;">Wypisz się z newslettera</a>
  </p>
</div>
`;

// Domyślny nagłówek email
export const DEFAULT_EMAIL_HEADER = `
<div style="text-align: center; padding: 20px 0;">
  <h1 style="margin: 0; color: #333; font-size: 24px;">{{kosciol}}</h1>
</div>
`;
