import { appLocale } from '../../../i18n';
// Zmienne personalizacji dostępne w szablonach emaili formularzy
export const FORM_EMAIL_VARIABLES = [
  { key: '{{imie}}', label: 'Imię', description: 'Imię osoby wypełniającej' },
  { key: '{{nazwisko}}', label: 'Nazwisko', description: 'Nazwisko osoby' },
  { key: '{{email}}', label: 'Email', description: 'Adres email' },
  { key: '{{data}}', label: 'Data', description: 'Data wysłania formularza' },
  { key: '{{formularz_nazwa}}', label: 'Nazwa formularza', description: 'Tytuł formularza' },
  { key: '{{formularz_link}}', label: 'Link do formularza', description: 'URL formularza' },
  { key: '{{kwota}}', label: 'Kwota', description: 'Kwota do zapłaty' },
  { key: '{{metoda_platnosci}}', label: 'Metoda płatności', description: 'Wybrana metoda płatności' },
  { key: '{{numer_konta}}', label: 'Numer konta', description: 'Numer konta do przelewu' },
  { key: '{{termin_platnosci}}', label: 'Termin płatności', description: 'Data, do której należy zapłacić' },
  { key: '{{odpowiedzi}}', label: 'Odpowiedzi', description: 'Podsumowanie odpowiedzi z formularza' },
  { key: '{{kosciol}}', label: 'Nazwa kościoła', description: 'Nazwa organizacji' }
];

// Szablony i personalizacja żyją we wspólnym pakiecie (używa ich też API przy publicznych zgłoszeniach).
import { DEFAULT_FORM_EMAIL_TEMPLATES, personalizeFormEmail as personalizeShared } from '../../../../packages/shared/src/forms/formEmails.js';

export { DEFAULT_FORM_EMAIL_TEMPLATES };

// Personalizacja z datą w języku interfejsu.
export function personalizeFormEmail(template, data) {
  return personalizeShared(template, { locale: appLocale(), ...data });
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
