import { useState, useCallback, useMemo } from 'react';
import { AlertCircle, Check, Loader2, MapPin, Calendar, Clock, DollarSign, Users, CreditCard } from 'lucide-react';
import FieldRenderer from './FieldRenderer';
import PayPalButton from './PayPalButton';
import Przelewy24Button from './Przelewy24Button';
import { calculateTotalPrice, formatPrice } from '../utils/fieldTypes';

export default function FormRenderer({
  title,
  description,
  fields,
  settings,
  onSubmit,
  isSubmitting = false,
  isSubmitted = false,
  responseCount = 0
}) {
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);

  // Wyciągnij ustawienia brandingu i cennika
  const branding = settings?.branding || {};
  const pricing = settings?.pricing || {};

  // Oblicz całkowitą cenę
  const totalPrice = useMemo(() => {
    return calculateTotalPrice(fields, answers);
  }, [fields, answers]);

  // Wyciągnij informacje o wydarzeniu z pól
  const eventInfo = useMemo(() => {
    const info = {};
    fields.forEach(field => {
      if (field.showInHeader !== false) {
        switch (field.type) {
          case 'location':
            if (field.defaultValue || field.value) info.location = field.defaultValue || field.value;
            break;
          case 'date_start':
            if (field.defaultValue || field.value) info.dateStart = field.defaultValue || field.value;
            break;
          case 'date_end':
            if (field.defaultValue || field.value) info.dateEnd = field.defaultValue || field.value;
            break;
          case 'time_start':
            if (field.defaultValue || field.value) info.timeStart = field.defaultValue || field.value;
            break;
          case 'time_end':
            if (field.defaultValue || field.value) info.timeEnd = field.defaultValue || field.value;
            break;
          case 'price':
            if (field.priceConfig?.basePrice > 0) {
              info.price = field.priceConfig.basePrice;
              info.priceCurrency = field.priceConfig.currency || 'PLN';
              info.priceType = field.priceConfig.pricingType;
            }
            break;
          case 'seat_limit':
            if (field.seatConfig?.maxSeats) {
              info.maxSeats = field.seatConfig.maxSeats;
              info.showRemaining = field.seatConfig.showRemaining;
              info.remaining = info.maxSeats - responseCount;
            }
            break;
        }
      }
    });
    return info;
  }, [fields, responseCount]);

  const hasEventInfo = Object.keys(eventInfo).length > 0;

  const validateField = useCallback((field, value) => {
    if (field.required) {
      if (value === null || value === undefined || value === '') {
        return 'To pole jest wymagane';
      }
      if (Array.isArray(value) && value.length === 0) {
        return 'Wybierz przynajmniej jedną opcję';
      }
    }

    if (value && field.validation) {
      if (field.validation.minLength && String(value).length < field.validation.minLength) {
        return `Minimalna długość to ${field.validation.minLength} znaków`;
      }
      if (field.validation.maxLength && String(value).length > field.validation.maxLength) {
        return `Maksymalna długość to ${field.validation.maxLength} znaków`;
      }
      if (field.validation.min !== undefined && Number(value) < field.validation.min) {
        return `Minimalna wartość to ${field.validation.min}`;
      }
      if (field.validation.max !== undefined && Number(value) > field.validation.max) {
        return `Maksymalna wartość to ${field.validation.max}`;
      }
      if (field.validation.pattern) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(String(value))) {
          if (field.type === 'email') {
            return 'Wprowadź poprawny adres email';
          }
          return 'Nieprawidłowy format';
        }
      }
    }

    return null;
  }, []);

  const handleChange = useCallback((fieldId, value) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldId];
      return newErrors;
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    const newErrors = {};
    let hasErrors = false;

    fields.forEach(field => {
      const error = validateField(field, answers[field.id]);
      if (error) {
        newErrors[field.id] = error;
        hasErrors = true;
      }
    });

    setErrors(newErrors);

    if (hasErrors) {
      const firstErrorField = fields.find(f => newErrors[f.id]);
      if (firstErrorField) {
        document.getElementById(`field-${firstErrorField.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
      return;
    }

    // Dodaj dane płatności do odpowiedzi
    const submitData = {
      ...answers,
      _payment: paymentData ? {
        method: selectedPaymentMethod,
        ...paymentData
      } : null,
      _totalPrice: totalPrice
    };

    onSubmit(submitData);
  };

  // Obsługa sukcesu płatności PayPal
  const handlePayPalSuccess = (data) => {
    setPaymentCompleted(true);
    setPaymentData(data);
  };

  // Sprawdź czy płatność online jest wymagana
  const isOnlinePaymentRequired = pricing.enabled &&
    pricing.paymentRequired &&
    (pricing.paymentMethods?.includes('paypal') || pricing.paymentMethods?.includes('przelewy24')) &&
    totalPrice > 0;

  // Sprawdź czy można wysłać formularz
  const canSubmit = !isOnlinePaymentRequired ||
    paymentCompleted ||
    (selectedPaymentMethod !== 'paypal' && selectedPaymentMethod !== 'przelewy24');

  if (isSubmitted) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check size={40} className="text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Dziękujemy!
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {settings?.successMessage || 'Twoja odpowiedź została zapisana.'}
        </p>
      </div>
    );
  }

  const completedFields = fields.filter(f => {
    const value = answers[f.id];
    return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
  }).length;
  const progress = fields.length > 0 ? Math.round((completedFields / fields.length) * 100) : 0;

  return (
    <form onSubmit={handleSubmit} className="max-w-xl mx-auto">
      {/* Nagłówek z grafiką */}
      {branding.headerImage && branding.showHeaderOnPublic !== false && (
        <div
          className="relative rounded-2xl overflow-hidden mb-6"
          style={{ height: branding.headerHeight || 200 }}
        >
          <img
            src={branding.headerImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: branding.backgroundOverlay || 0.5 }}
          />
          {branding.logoImage && (
            <div className={`absolute bottom-4 ${
              branding.logoPosition === 'center' ? 'left-1/2 -translate-x-1/2' :
              branding.logoPosition === 'right' ? 'right-4' : 'left-4'
            }`}>
              <img
                src={branding.logoImage}
                alt="Logo"
                className="h-12 object-contain"
              />
            </div>
          )}
        </div>
      )}

      {settings?.showProgressBar && fields.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Postęp</span>
            <span>{completedFields} z {fields.length}</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-orange-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 md:p-8 mb-6">
        {/* Logo jeśli nie ma nagłówka graficznego */}
        {branding.logoImage && !branding.headerImage && (
          <div className={`mb-4 ${
            branding.logoPosition === 'center' ? 'text-center' :
            branding.logoPosition === 'right' ? 'text-right' : 'text-left'
          }`}>
            <img
              src={branding.logoImage}
              alt="Logo"
              className="h-12 object-contain inline-block"
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {title}
        </h1>
        {description && (
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {description}
          </p>
        )}

        {/* Informacje o wydarzeniu */}
        {hasEventInfo && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
            {eventInfo.location && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <MapPin size={16} className="text-pink-500" />
                {eventInfo.location}
              </div>
            )}
            {(eventInfo.dateStart || eventInfo.dateEnd) && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Calendar size={16} className="text-pink-500" />
                {eventInfo.dateStart && new Date(eventInfo.dateStart).toLocaleDateString('pl-PL', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
                {eventInfo.dateEnd && eventInfo.dateStart !== eventInfo.dateEnd && (
                  <> - {new Date(eventInfo.dateEnd).toLocaleDateString('pl-PL', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}</>
                )}
              </div>
            )}
            {(eventInfo.timeStart || eventInfo.timeEnd) && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Clock size={16} className="text-pink-500" />
                {eventInfo.timeStart}
                {eventInfo.timeEnd && <> - {eventInfo.timeEnd}</>}
              </div>
            )}
            {eventInfo.price > 0 && (
              <div className="flex items-center gap-2 text-sm font-semibold text-green-600 dark:text-green-400">
                <DollarSign size={16} />
                {formatPrice(eventInfo.price, eventInfo.priceCurrency)}
                {eventInfo.priceType === 'per_person' && <span className="font-normal text-gray-500">/ os.</span>}
              </div>
            )}
            {eventInfo.maxSeats && eventInfo.showRemaining && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Users size={16} className="text-blue-500" />
                {eventInfo.remaining > 0 ? (
                  <>Pozostało <span className="font-semibold text-blue-600">{eventInfo.remaining}</span> miejsc</>
                ) : (
                  <span className="text-red-500 font-semibold">Brak wolnych miejsc</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {fields.map((field, index) => (
          <div
            key={field.id}
            id={`field-${field.id}`}
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6"
          >
            <label className="block mb-4">
              <span className="text-base font-medium text-gray-900 dark:text-white">
                {field.label}
                {field.required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </span>
              {field.description && (
                <span className="block text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {field.description}
                </span>
              )}
            </label>

            <FieldRenderer
              field={field}
              value={answers[field.id]}
              onChange={(value) => handleChange(field.id, value)}
              error={errors[field.id]}
            />

            {errors[field.id] && (
              <div className="flex items-center gap-2 mt-3 text-red-500 text-sm">
                <AlertCircle size={16} />
                {errors[field.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Podsumowanie ceny */}
      {pricing.enabled && pricing.showPriceSummary && totalPrice > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl border border-green-200 dark:border-green-800 p-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Do zapłaty</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {formatPrice(totalPrice, pricing.currency || 'PLN')}
              </p>
            </div>
            <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center">
              <DollarSign size={28} className="text-green-600 dark:text-green-400" />
            </div>
          </div>

          {pricing.paymentInstructions && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 border-t border-green-200 dark:border-green-800 pt-3">
              {pricing.paymentInstructions}
            </p>
          )}

          {/* Wybór metody płatności */}
          {pricing.paymentMethods && pricing.paymentMethods.length > 0 && pricing.paymentRequired && (
            <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Wybierz metodę płatności:
              </p>
              <div className="space-y-2">
                {pricing.paymentMethods.includes('paypal') && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('paypal')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      selectedPaymentMethod === 'paypal'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
                    }`}
                  >
                    <svg className="w-8 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c1.582 3.185-.072 5.065-3.51 5.065h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106H7.076a.641.641 0 0 1-.633-.74l.142-.9h1.538c.524 0 .968-.382 1.05-.901l1.05-6.66h2.475c4.298 0 7.664-1.747 8.648-6.797.03-.149.054-.294.077-.437-.144-.095-.296-.187-.457-.275l.256.18z"/>
                    </svg>
                    <span className="font-medium text-gray-700 dark:text-gray-300">PayPal</span>
                    {paymentCompleted && selectedPaymentMethod === 'paypal' && (
                      <Check size={18} className="ml-auto text-green-500" />
                    )}
                  </button>
                )}

                {pricing.paymentMethods.includes('transfer') && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('transfer')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      selectedPaymentMethod === 'transfer'
                        ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-pink-300'
                    }`}
                  >
                    <CreditCard size={20} className="text-pink-600" />
                    <span className="font-medium text-gray-700 dark:text-gray-300">Przelew bankowy</span>
                  </button>
                )}

                {pricing.paymentMethods.includes('cash') && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('cash')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      selectedPaymentMethod === 'cash'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-green-300'
                    }`}
                  >
                    <DollarSign size={20} className="text-green-600" />
                    <span className="font-medium text-gray-700 dark:text-gray-300">Gotówka (na miejscu)</span>
                  </button>
                )}

                {pricing.paymentMethods.includes('przelewy24') && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('przelewy24')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      selectedPaymentMethod === 'przelewy24'
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-red-300'
                    }`}
                  >
                    <svg className="w-6 h-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Przelewy24</span>
                    {paymentCompleted && selectedPaymentMethod === 'przelewy24' && (
                      <Check size={18} className="ml-auto text-green-500" />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* PayPal Button */}
          {selectedPaymentMethod === 'paypal' && pricing.paypal?.clientId && !paymentCompleted && (
            <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
              <PayPalButton
                clientId={pricing.paypal.clientId}
                amount={totalPrice}
                currency={pricing.currency || 'PLN'}
                description={pricing.paypal.description || `Płatność za: ${title}`}
                sandbox={pricing.paypal.sandbox !== false}
                onSuccess={handlePayPalSuccess}
                onError={(err) => console.error('PayPal error:', err)}
                onCancel={() => console.log('PayPal cancelled')}
              />
            </div>
          )}

          {/* Przelewy24 Button */}
          {selectedPaymentMethod === 'przelewy24' && pricing.przelewy24?.merchantId && !paymentCompleted && (
            <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
              <Przelewy24Button
                merchantId={pricing.przelewy24.merchantId}
                crcKey={pricing.przelewy24.crcKey}
                apiKey={pricing.przelewy24.apiKey}
                amount={totalPrice}
                currency={pricing.currency || 'PLN'}
                description={pricing.przelewy24.description || `Płatność za: ${title}`}
                sandbox={pricing.przelewy24.sandbox !== false}
                formId={settings?.formId}
                email={answers[fields.find(f => f.type === 'email')?.id] || ''}
                onSuccess={(data) => {
                  setPaymentCompleted(true);
                  setPaymentData(data);
                }}
                onError={(err) => console.error('Przelewy24 error:', err)}
              />
            </div>
          )}

          {/* Informacje o przelewie */}
          {selectedPaymentMethod === 'transfer' && pricing.bankAccount && (
            <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
              <div className="p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Numer konta do przelewu:</p>
                <p className="font-mono text-sm text-gray-900 dark:text-white">
                  {pricing.bankAccount}
                </p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                W tytule przelewu wpisz swoje imię i nazwisko.
              </p>
            </div>
          )}

          {/* Info o gotówce */}
          {selectedPaymentMethod === 'cash' && (
            <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Płatność gotówką przy wejściu na wydarzenie.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        {/* Komunikat o wymaganej płatności */}
        {isOnlinePaymentRequired && !paymentCompleted && (selectedPaymentMethod === 'paypal' || selectedPaymentMethod === 'przelewy24') && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
              <AlertCircle size={16} />
              Dokonaj płatności {selectedPaymentMethod === 'paypal' ? 'PayPal' : 'Przelewy24'} przed wysłaniem formularza.
            </p>
          </div>
        )}

        {/* Komunikat o wyborze metody płatności */}
        {pricing.enabled && pricing.paymentRequired && totalPrice > 0 && !selectedPaymentMethod && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <CreditCard size={16} />
              Wybierz metodę płatności powyżej.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !canSubmit || (pricing.enabled && pricing.paymentRequired && totalPrice > 0 && !selectedPaymentMethod)}
          className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-gradient-to-r from-pink-500 to-orange-500 text-white font-medium rounded-xl
            hover:shadow-lg hover:shadow-pink-500/25 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed"
          style={settings?.theme?.primaryColor ? {
            background: settings.theme.primaryColor
          } : {}}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Wysyłanie...
            </>
          ) : (
            <>
              {paymentCompleted && (selectedPaymentMethod === 'paypal' || selectedPaymentMethod === 'przelewy24') && (
                <Check size={18} className="mr-1" />
              )}
              {pricing.enabled && totalPrice > 0 && !paymentCompleted && (
                <span className="mr-2">{formatPrice(totalPrice, pricing.currency || 'PLN')} •</span>
              )}
              {settings?.submitButtonText || 'Wyślij'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
