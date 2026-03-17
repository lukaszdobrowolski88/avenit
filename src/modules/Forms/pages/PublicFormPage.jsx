import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Lock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import FormRenderer from '../components/FormRenderer';
import { useFormResponses } from '../hooks/useFormResponses';
import { useFormEmails } from '../hooks/useFormEmails';

export default function PublicFormPage() {
  const { formId } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { submitResponse } = useFormResponses(formId);
  const { sendFormSubmissionEmails } = useFormEmails();

  useEffect(() => {
    fetchForm();
  }, [formId]);

  const fetchForm = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('forms')
        .select('*')
        .eq('id', formId)
        .single();

      if (fetchError) throw fetchError;

      if (data.status !== 'published') {
        setError('form_not_available');
        return;
      }

      if (data.settings?.limitResponses && data.response_count >= data.settings.limitResponses) {
        setError('limit_reached');
        return;
      }

      if (data.closes_at && new Date(data.closes_at) < new Date()) {
        setError('form_closed');
        return;
      }

      setForm(data);
    } catch (err) {
      console.error('Error fetching form:', err);
      setError('not_found');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (answers) => {
    setIsSubmitting(true);
    try {
      // Wyodrebnij dane platnosci jesli sa
      const paymentData = answers._payment;
      const totalPrice = answers._totalPrice || 0;
      const selectedPaymentMethod = paymentData?.method || null;

      // Usun meta-dane z odpowiedzi
      const cleanAnswers = { ...answers };
      delete cleanAnswers._payment;
      delete cleanAnswers._totalPrice;

      // Znajdz email w odpowiedziach
      const emailField = form.fields?.find(f => f.type === 'email');
      const respondentEmail = emailField ? cleanAnswers[emailField.id] : null;

      // Znajdz imie w odpowiedziach
      const nameField = form.fields?.find(f =>
        f.type === 'text' &&
        (f.label?.toLowerCase().includes('imie') ||
         f.label?.toLowerCase().includes('imię') ||
         f.label?.toLowerCase().includes('name') ||
         f.label?.toLowerCase().includes('nazwisko'))
      );
      const respondentName = nameField ? cleanAnswers[nameField.id] : '';

      const result = await submitResponse(cleanAnswers, {
        email: respondentEmail,
        name: respondentName
      });

      if (result.success) {
        setIsSubmitted(true);

        // Wyslij emaile w tle (nie blokuj UI)
        sendFormSubmissionEmails({
          formSettings: form.settings,
          formTitle: form.title,
          formId: form.id,
          answers: cleanAnswers,
          fields: form.fields || [],
          totalPrice,
          selectedPaymentMethod
        }).then(emailResults => {
          console.log('Email results:', emailResults);
        }).catch(emailError => {
          console.error('Error sending emails:', emailError);
        });

        if (form.settings?.redirectUrl) {
          setTimeout(() => {
            window.location.href = form.settings.redirectUrl;
          }, 2000);
        }
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      alert('Wystąpił błąd podczas wysyłania formularza. Spróbuj ponownie.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50/50 via-white to-orange-50/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-pink-200 border-t-pink-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50/50 via-white to-orange-50/50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            {error === 'form_closed' || error === 'limit_reached' ? (
              <Lock size={32} className="text-gray-400" />
            ) : (
              <AlertCircle size={32} className="text-gray-400" />
            )}
          </div>

          {error === 'not_found' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Formularz nie został znaleziony
              </h1>
              <p className="text-gray-600">
                Ten formularz nie istnieje lub został usunięty.
              </p>
            </>
          )}

          {error === 'form_not_available' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Formularz niedostępny
              </h1>
              <p className="text-gray-600">
                Ten formularz nie jest obecnie dostępny do wypełnienia.
              </p>
            </>
          )}

          {error === 'form_closed' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Formularz zamknięty
              </h1>
              <p className="text-gray-600">
                Ten formularz został zamknięty i nie przyjmuje już odpowiedzi.
              </p>
            </>
          )}

          {error === 'limit_reached' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Osiągnięto limit odpowiedzi
              </h1>
              <p className="text-gray-600">
                Ten formularz osiągnął maksymalną liczbę odpowiedzi.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const branding = form?.settings?.branding || {};
  const hasBackgroundImage = branding.backgroundImage;

  return (
    <div
      className="min-h-screen py-8 px-4 relative"
      style={{
        background: !hasBackgroundImage && form?.settings?.theme?.backgroundColor
          ? form.settings.theme.backgroundColor
          : !hasBackgroundImage
            ? 'linear-gradient(to bottom right, rgb(253 242 248 / 0.5), white, rgb(255 247 237 / 0.5))'
            : undefined
      }}
    >
      {/* Obrazek tła */}
      {hasBackgroundImage && (
        <>
          <div
            className="fixed inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${branding.backgroundImage})` }}
          />
          <div
            className="fixed inset-0 bg-black"
            style={{ opacity: branding.backgroundOverlay || 0.5 }}
          />
        </>
      )}

      <div className="relative z-10">
        <FormRenderer
          title={form.title}
          description={form.description}
          fields={form.fields || []}
          settings={form.settings}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          isSubmitted={isSubmitted}
          responseCount={form.response_count || 0}
        />

        <div className="max-w-xl mx-auto mt-8 text-center">
          <p className={`text-xs ${hasBackgroundImage ? 'text-white/60' : 'text-gray-400'}`}>
            Powered by Church Manager
          </p>
        </div>
      </div>
    </div>
  );
}
