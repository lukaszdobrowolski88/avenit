import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Lock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import FormRenderer from '../components/FormRenderer';
import { useFormResponses } from '../hooks/useFormResponses';
import { useFormEmails } from '../hooks/useFormEmails';
import { checkSeatAvailability } from '../utils/fieldTypes';
import { tr } from '../../../i18n';

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

      // Sprawdź dostępność miejsc
      const seatCheck = checkSeatAvailability(data.fields || [], data.response_count || 0);
      if (!seatCheck.available) {
        setError('seats_full');
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
      alert(tr('Wystąpił błąd podczas wysyłania formularza. Spróbuj ponownie.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-primary-lightest/50 via-white to-accent-secondary-lightest/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-primary-lighter border-t-accent-primary-light"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-primary-lightest/50 via-white to-accent-secondary-lightest/50 flex items-center justify-center p-4">
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
                {tr('Formularz nie został znaleziony')}
              </h1>
              <p className="text-gray-600">
                {tr('Ten formularz nie istnieje lub został usunięty.')}
              </p>
            </>
          )}

          {error === 'form_not_available' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                {tr('Formularz niedostępny')}
              </h1>
              <p className="text-gray-600">
                {tr('Ten formularz nie jest obecnie dostępny do wypełnienia.')}
              </p>
            </>
          )}

          {error === 'form_closed' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                {tr('Formularz zamknięty')}
              </h1>
              <p className="text-gray-600">
                {tr('Ten formularz został zamknięty i nie przyjmuje już odpowiedzi.')}
              </p>
            </>
          )}

          {error === 'limit_reached' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                {tr('Osiągnięto limit odpowiedzi')}
              </h1>
              <p className="text-gray-600">
                {tr('Ten formularz osiągnął maksymalną liczbę odpowiedzi.')}
              </p>
            </>
          )}

          {error === 'seats_full' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Brak wolnych miejsc
              </h1>
              <p className="text-gray-600">
                Wszystkie miejsca (w tym rezerwowe) zostały zajęte.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const branding = form?.settings?.branding || {};
  const layout = form?.settings?.layout || {};
  const bgConfig = layout.background || {};
  const hasBackgroundImage = branding.backgroundImage || bgConfig.type === 'image';
  const orbs = bgConfig.orbs || [];

  // Zbuduj styl tła
  const getBackgroundStyle = () => {
    // Background image z branding (stara ścieżka)
    if (branding.backgroundImage) return undefined;

    if (bgConfig.type === 'solid') {
      return { background: bgConfig.solidColor || '#ffffff' };
    }

    // Gradient — zawsze gdy nie solid i nie image
    const g = bgConfig.gradient || {};
    const dirMap = {
      'to-r': 'to right',
      'to-br': 'to bottom right',
      'to-b': 'to bottom',
      'to-bl': 'to bottom left',
      'to-t': 'to top',
      'to-tr': 'to top right',
      'to-l': 'to left',
      'to-tl': 'to top left'
    };
    const dir = dirMap[g.direction] || 'to bottom right';
    const from = g.from || '#fdf2f8';
    const via = g.via || '#ffffff';
    const to = g.to || '#fff7ed';
    return { background: `linear-gradient(${dir}, ${from}, ${via}, ${to})` };
  };

  // Szerokość formularza
  const widthMap = {
    'sm': 'max-w-[480px]',
    'md': 'max-w-xl',
    'lg': 'max-w-2xl',
    'xl': 'max-w-3xl',
    '2xl': 'max-w-4xl'
  };
  const formMaxWidth = widthMap[layout.maxWidth] || 'max-w-xl';

  const primaryColor = form?.settings?.theme?.primaryColor || null;

  // Konwertuj kolor hex na RGB i wygeneruj warianty
  const getColorStyleTag = () => {
    if (!primaryColor) return null;
    const hex = primaryColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const lighten = (r, g, b, amount) => [
      Math.min(255, r + (255 - r) * amount),
      Math.min(255, g + (255 - g) * amount),
      Math.min(255, b + (255 - b) * amount)
    ].map(Math.round);
    const lighter = lighten(r, g, b, 0.4);
    const lightest = lighten(r, g, b, 0.85);
    const dark = [Math.round(r * 0.7), Math.round(g * 0.7), Math.round(b * 0.7)];
    const darkest = [Math.round(r * 0.4), Math.round(g * 0.4), Math.round(b * 0.4)];
    return `:root{--accent-primary:${r} ${g} ${b}!important;--accent-primary-light:${r} ${g} ${b}!important;--accent-primary-lighter:${lighter.join(' ')}!important;--accent-primary-lightest:${lightest.join(' ')}!important;--accent-primary-dark:${dark.join(' ')}!important;--accent-primary-darkest:${darkest.join(' ')}!important;--accent-secondary:${r} ${g} ${b}!important;--accent-secondary-light:${r} ${g} ${b}!important;--accent-secondary-lighter:${lighter.join(' ')}!important;--accent-secondary-lightest:${lightest.join(' ')}!important;--accent-secondary-dark:${dark.join(' ')}!important;--accent-secondary-darkest:${darkest.join(' ')}!important}body{background-color:transparent!important}`;
  };

  return (
    <>
      <style>{`body{background-color:transparent!important}${getColorStyleTag() || ''}`}</style>
      <div
        className="min-h-screen py-8 px-4 relative overflow-hidden"
        style={getBackgroundStyle()}
      >
      {/* Obrazek tła (stara ścieżka z branding) */}
      {branding.backgroundImage && (
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

      {/* Orby dekoracyjne */}
      {orbs.map((orb, i) => (
        <div
          key={i}
          className="fixed rounded-full pointer-events-none"
          style={{
            width: `${orb.size || 300}px`,
            height: `${orb.size || 300}px`,
            left: `${orb.x || 0}%`,
            top: `${orb.y || 0}%`,
            background: orb.color || 'rgba(99, 102, 241, 0.15)',
            filter: `blur(${orb.blur || 80}px)`,
            transform: 'translate(-50%, -50%)'
          }}
        />
      ))}

      <div className="relative z-10">
        <FormRenderer
          title={form.title}
          description={form.description}
          fields={form.fields || []}
          settings={{ ...form.settings, _formMaxWidth: formMaxWidth, formId: form.id }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          isSubmitted={isSubmitted}
          responseCount={form.response_count || 0}
        />

        <div className={`${formMaxWidth} mx-auto mt-8 text-center`}>
          <p className={`text-xs ${hasBackgroundImage ? 'text-white/60' : 'text-gray-400'}`}>
            Powered by Avenit
          </p>
        </div>
      </div>
    </div>
    </>
  );
}
