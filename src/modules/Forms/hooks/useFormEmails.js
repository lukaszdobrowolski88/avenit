import { useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { DEFAULT_FORM_EMAIL_TEMPLATES, personalizeFormEmail } from '../utils/formEmailTemplates';
import { formatPrice } from '../utils/fieldTypes';

export function useFormEmails() {
  // Wyslij email potwierdzajacy rejestracje
  const sendConfirmationEmail = useCallback(async ({
    formSettings,
    formTitle,
    formId,
    recipientEmail,
    recipientName,
    answers,
    fields
  }) => {
    const emailSettings = formSettings?.emails;

    // Sprawdz czy emaile sa wlaczone
    if (!emailSettings?.enabled || emailSettings?.confirmationEmail?.enabled === false) {
      return { sent: false, reason: 'disabled' };
    }

    // Przygotuj dane do personalizacji
    const firstName = recipientName?.split(' ')[0] || '';
    const lastName = recipientName?.split(' ').slice(1).join(' ') || '';

    // Sformatuj odpowiedzi
    const formattedAnswers = fields
      .filter(f => !['location', 'date_start', 'date_end', 'time_start', 'time_end', 'price', 'seat_limit'].includes(f.type))
      .map(field => ({
        label: field.label,
        value: formatAnswerValue(answers[field.id], field)
      }))
      .filter(a => a.value);

    // Wybierz szablon
    const template = emailSettings?.confirmationEmail?.useCustomTemplate && emailSettings?.confirmationEmail?.customHtml
      ? {
          subject: emailSettings.confirmationEmail.customSubject || DEFAULT_FORM_EMAIL_TEMPLATES.confirmation.subject,
          html_content: emailSettings.confirmationEmail.customHtml
        }
      : DEFAULT_FORM_EMAIL_TEMPLATES.confirmation;

    // Personalizuj
    const personalized = personalizeFormEmail(template, {
      firstName,
      lastName,
      email: recipientEmail,
      formTitle,
      formLink: `${window.location.origin}/form/${formId}`,
      answers: formattedAnswers,
      churchName: 'Kosciol' // Mozna pobrac z ustawien globalnych
    });

    // Wyslij email
    try {
      const { data, error } = await supabase.functions.invoke('send-form-email', {
        body: {
          to: recipientEmail,
          subject: personalized.subject,
          html: personalized.html,
          type: 'confirmation'
        }
      });

      if (error) throw error;

      return { sent: true, data };
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      return { sent: false, error: error.message };
    }
  }, []);

  // Wyslij email z informacja o platnosci
  const sendPaymentEmail = useCallback(async ({
    formSettings,
    formTitle,
    formId,
    recipientEmail,
    recipientName,
    amount,
    currency
  }) => {
    const emailSettings = formSettings?.emails;
    const pricingSettings = formSettings?.pricing;

    // Sprawdz czy emaile sa wlaczone i czy jest platnosc przelewem
    if (!emailSettings?.enabled || emailSettings?.paymentEmail?.enabled === false) {
      return { sent: false, reason: 'disabled' };
    }

    if (!pricingSettings?.paymentMethods?.includes('transfer')) {
      return { sent: false, reason: 'no_transfer_method' };
    }

    const firstName = recipientName?.split(' ')[0] || '';
    const lastName = recipientName?.split(' ').slice(1).join(' ') || '';

    // Oblicz termin platnosci
    const deadlineDays = emailSettings?.paymentDeadlineDays || 7;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + deadlineDays);
    const deadlineStr = deadline.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Wybierz szablon
    const template = emailSettings?.paymentEmail?.useCustomTemplate && emailSettings?.paymentEmail?.customHtml
      ? {
          subject: emailSettings.paymentEmail.customSubject || DEFAULT_FORM_EMAIL_TEMPLATES.payment_info.subject,
          html_content: emailSettings.paymentEmail.customHtml
        }
      : DEFAULT_FORM_EMAIL_TEMPLATES.payment_info;

    // Personalizuj
    const personalized = personalizeFormEmail(template, {
      firstName,
      lastName,
      email: recipientEmail,
      formTitle,
      formLink: `${window.location.origin}/form/${formId}`,
      amount: formatPrice(amount, currency || 'PLN'),
      bankAccount: pricingSettings?.bankAccount || '',
      paymentDeadline: deadlineStr,
      churchName: 'Kosciol'
    });

    // Wyslij email
    try {
      const { data, error } = await supabase.functions.invoke('send-form-email', {
        body: {
          to: recipientEmail,
          subject: personalized.subject,
          html: personalized.html,
          type: 'payment_info'
        }
      });

      if (error) throw error;

      return { sent: true, data };
    } catch (error) {
      console.error('Error sending payment email:', error);
      return { sent: false, error: error.message };
    }
  }, []);

  // Wyslij przypomnienie o platnosci
  const sendPaymentReminder = useCallback(async ({
    formSettings,
    formTitle,
    formId,
    recipientEmail,
    recipientName,
    amount,
    currency,
    paymentDeadline
  }) => {
    const emailSettings = formSettings?.emails;
    const pricingSettings = formSettings?.pricing;

    // Sprawdz czy przypomnienia sa wlaczone
    if (!emailSettings?.enabled || !emailSettings?.reminderEmail?.enabled) {
      return { sent: false, reason: 'disabled' };
    }

    const firstName = recipientName?.split(' ')[0] || '';
    const lastName = recipientName?.split(' ').slice(1).join(' ') || '';

    // Wybierz szablon
    const template = emailSettings?.reminderEmail?.useCustomTemplate && emailSettings?.reminderEmail?.customHtml
      ? {
          subject: emailSettings.reminderEmail.customSubject || DEFAULT_FORM_EMAIL_TEMPLATES.payment_reminder.subject,
          html_content: emailSettings.reminderEmail.customHtml
        }
      : DEFAULT_FORM_EMAIL_TEMPLATES.payment_reminder;

    // Personalizuj
    const personalized = personalizeFormEmail(template, {
      firstName,
      lastName,
      email: recipientEmail,
      formTitle,
      formLink: `${window.location.origin}/form/${formId}`,
      amount: formatPrice(amount, currency || 'PLN'),
      bankAccount: pricingSettings?.bankAccount || '',
      paymentDeadline,
      churchName: 'Kosciol'
    });

    // Wyslij email
    try {
      const { data, error } = await supabase.functions.invoke('send-form-email', {
        body: {
          to: recipientEmail,
          subject: personalized.subject,
          html: personalized.html,
          type: 'payment_reminder'
        }
      });

      if (error) throw error;

      return { sent: true, data };
    } catch (error) {
      console.error('Error sending payment reminder:', error);
      return { sent: false, error: error.message };
    }
  }, []);

  // Wyslij potwierdzenie platnosci
  const sendPaymentConfirmedEmail = useCallback(async ({
    formSettings,
    formTitle,
    formId,
    recipientEmail,
    recipientName,
    amount,
    currency
  }) => {
    const emailSettings = formSettings?.emails;

    // Sprawdz czy emaile sa wlaczone
    if (!emailSettings?.enabled || emailSettings?.paymentConfirmedEmail?.enabled === false) {
      return { sent: false, reason: 'disabled' };
    }

    const firstName = recipientName?.split(' ')[0] || '';
    const lastName = recipientName?.split(' ').slice(1).join(' ') || '';

    // Wybierz szablon
    const template = emailSettings?.paymentConfirmedEmail?.useCustomTemplate && emailSettings?.paymentConfirmedEmail?.customHtml
      ? {
          subject: emailSettings.paymentConfirmedEmail.customSubject || DEFAULT_FORM_EMAIL_TEMPLATES.payment_confirmed.subject,
          html_content: emailSettings.paymentConfirmedEmail.customHtml
        }
      : DEFAULT_FORM_EMAIL_TEMPLATES.payment_confirmed;

    // Personalizuj
    const personalized = personalizeFormEmail(template, {
      firstName,
      lastName,
      email: recipientEmail,
      formTitle,
      formLink: `${window.location.origin}/form/${formId}`,
      amount: formatPrice(amount, currency || 'PLN'),
      churchName: 'Kosciol'
    });

    // Wyslij email
    try {
      const { data, error } = await supabase.functions.invoke('send-form-email', {
        body: {
          to: recipientEmail,
          subject: personalized.subject,
          html: personalized.html,
          type: 'payment_confirmed'
        }
      });

      if (error) throw error;

      return { sent: true, data };
    } catch (error) {
      console.error('Error sending payment confirmed email:', error);
      return { sent: false, error: error.message };
    }
  }, []);

  // Wyslij powiadomienie do administratora
  const sendAdminNotification = useCallback(async ({
    formSettings,
    formTitle,
    formId,
    recipientEmail,
    recipientName,
    answers,
    fields
  }) => {
    const emailSettings = formSettings?.emails;

    // Sprawdz czy powiadomienia admina sa wlaczone
    if (!emailSettings?.enabled || !emailSettings?.adminNotification?.enabled) {
      return { sent: false, reason: 'disabled' };
    }

    const adminEmails = emailSettings?.adminNotification?.emails || [];
    if (adminEmails.length === 0) {
      return { sent: false, reason: 'no_admin_emails' };
    }

    const firstName = recipientName?.split(' ')[0] || '';
    const lastName = recipientName?.split(' ').slice(1).join(' ') || '';

    // Sformatuj odpowiedzi
    const formattedAnswers = fields
      .filter(f => !['location', 'date_start', 'date_end', 'time_start', 'time_end', 'price', 'seat_limit'].includes(f.type))
      .map(field => ({
        label: field.label,
        value: formatAnswerValue(answers[field.id], field)
      }))
      .filter(a => a.value);

    // Wybierz szablon
    const template = emailSettings?.adminNotification?.useCustomTemplate && emailSettings?.adminNotification?.customHtml
      ? {
          subject: emailSettings.adminNotification.customSubject || DEFAULT_FORM_EMAIL_TEMPLATES.admin_notification.subject,
          html_content: emailSettings.adminNotification.customHtml
        }
      : DEFAULT_FORM_EMAIL_TEMPLATES.admin_notification;

    // Personalizuj
    const personalized = personalizeFormEmail(template, {
      firstName,
      lastName,
      email: recipientEmail,
      formTitle,
      formLink: `${window.location.origin}/forms?view=responses&formId=${formId}`,
      answers: formattedAnswers,
      churchName: 'Kosciol'
    });

    // Wyslij email do kazdego admina
    const results = [];
    for (const adminEmail of adminEmails) {
      try {
        const { data, error } = await supabase.functions.invoke('send-form-email', {
          body: {
            to: adminEmail,
            subject: personalized.subject,
            html: personalized.html,
            type: 'admin_notification'
          }
        });

        if (error) throw error;
        results.push({ email: adminEmail, sent: true });
      } catch (error) {
        console.error(`Error sending admin notification to ${adminEmail}:`, error);
        results.push({ email: adminEmail, sent: false, error: error.message });
      }
    }

    return { sent: true, results };
  }, []);

  // Glowna funkcja wysylajaca wszystkie potrzebne emaile po wyslaniu formularza
  const sendFormSubmissionEmails = useCallback(async ({
    formSettings,
    formTitle,
    formId,
    answers,
    fields,
    totalPrice,
    selectedPaymentMethod
  }) => {
    // Znajdz email w odpowiedziach
    const emailField = fields.find(f => f.type === 'email');
    const recipientEmail = emailField ? answers[emailField.id] : null;

    // Znajdz imie w odpowiedziach (szukaj pola typu text z "imie" lub "name" w etykiecie)
    const nameField = fields.find(f =>
      f.type === 'text' &&
      (f.label?.toLowerCase().includes('imie') ||
       f.label?.toLowerCase().includes('imię') ||
       f.label?.toLowerCase().includes('name') ||
       f.label?.toLowerCase().includes('nazwisko'))
    );
    const recipientName = nameField ? answers[nameField.id] : '';

    if (!recipientEmail) {
      console.log('No email field found, skipping emails');
      return { confirmation: { sent: false, reason: 'no_email' } };
    }

    const results = {};

    // 1. Email potwierdzajacy rejestracje
    results.confirmation = await sendConfirmationEmail({
      formSettings,
      formTitle,
      formId,
      recipientEmail,
      recipientName,
      answers,
      fields
    });

    // 2. Email z informacja o platnosci (jesli wybrano przelew)
    if (selectedPaymentMethod === 'transfer' && totalPrice > 0) {
      results.payment = await sendPaymentEmail({
        formSettings,
        formTitle,
        formId,
        recipientEmail,
        recipientName,
        amount: totalPrice,
        currency: formSettings?.pricing?.currency || 'PLN'
      });
    }

    // 3. Powiadomienie dla administratora
    results.admin = await sendAdminNotification({
      formSettings,
      formTitle,
      formId,
      recipientEmail,
      recipientName,
      answers,
      fields
    });

    return results;
  }, [sendConfirmationEmail, sendPaymentEmail, sendAdminNotification]);

  return {
    sendConfirmationEmail,
    sendPaymentEmail,
    sendPaymentReminder,
    sendPaymentConfirmedEmail,
    sendAdminNotification,
    sendFormSubmissionEmails
  };
}

// Pomocnicza funkcja formatujaca wartosc odpowiedzi
function formatAnswerValue(value, field) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (Array.isArray(value)) {
    // Dla checkbox - znajdz etykiety wybranych opcji
    if (field.options) {
      return value.map(v => {
        const option = field.options.find(o => o.value === v);
        return option ? option.label : v;
      }).join(', ');
    }
    return value.join(', ');
  }

  // Dla radio/select - znajdz etykiete
  if (field.options && (field.type === 'radio' || field.type === 'select')) {
    const option = field.options.find(o => o.value === value);
    return option ? option.label : value;
  }

  // Dla daty
  if (field.type === 'date' && value) {
    return new Date(value).toLocaleDateString('pl-PL');
  }

  return String(value);
}
