import { useState, useCallback, useMemo } from 'react';
import { AlertCircle, Check, Loader2, MapPin, Calendar, Clock, DollarSign, Users, CreditCard, Plus } from 'lucide-react';
import FieldRenderer from './FieldRenderer';
import PayPalButton from './PayPalButton';
import Przelewy24Button from './Przelewy24Button';
import ParticipantForm from './ParticipantForm';
import AddonSelector from './AddonSelector';
import PriceBreakdown from './PriceBreakdown';
import { calculateTotalPrice, calculatePriceBreakdown, formatPrice, checkSeatAvailability } from '../utils/fieldTypes';
import { tr } from '../../../i18n';

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

  // Rejestracja grupowa
  const groupConfig = settings?.groupRegistration || {};
  const isGroupEnabled = groupConfig.enabled;
  const [registrationMode, setRegistrationMode] = useState('individual');
  const [contactAnswers, setContactAnswers] = useState({});
  const [contactAddons, setContactAddons] = useState({});
  const [participants, setParticipants] = useState([
    { id: `p-${Date.now()}`, answers: {}, addons: {} }
  ]);
  const [registrationAddons, setRegistrationAddons] = useState({});
  const [participantErrors, setParticipantErrors] = useState({});
  const [contactErrors, setContactErrors] = useState({});

  // Wyciągnij ustawienia brandingu i cennika
  const branding = settings?.branding || {};
  const pricing = settings?.pricing || {};
  const addonsConfig = settings?.addons || {};
  const discountsConfig = settings?.discounts || {};

  // Rozdziel pola na kontaktowe i uczestnika
  const contactFields = useMemo(() => {
    if (!isGroupEnabled) return [];
    return fields.filter(f =>
      (groupConfig.contactPersonFieldIds || []).includes(f.id) &&
      !['price', 'seat_limit', 'quantity', 'location', 'date_start', 'date_end', 'time_start', 'time_end'].includes(f.type)
    );
  }, [fields, isGroupEnabled, groupConfig.contactPersonFieldIds]);

  const participantFields = useMemo(() => {
    if (!isGroupEnabled) return [];
    return fields.filter(f =>
      (groupConfig.participantFieldIds || []).includes(f.id) &&
      !['price', 'seat_limit', 'quantity', 'location', 'date_start', 'date_end', 'time_start', 'time_end'].includes(f.type)
    );
  }, [fields, isGroupEnabled, groupConfig.participantFieldIds]);

  // Pola, które nie są przypisane do grupy (wyświetlane normalnie)
  const standardFields = useMemo(() => {
    if (!isGroupEnabled) return fields;
    const contactIds = groupConfig.contactPersonFieldIds || [];
    const participantIds = groupConfig.participantFieldIds || [];
    return fields.filter(f =>
      !contactIds.includes(f.id) &&
      !participantIds.includes(f.id) &&
      !['price', 'seat_limit', 'location', 'date_start', 'date_end', 'time_start', 'time_end'].includes(f.type)
    );
  }, [fields, isGroupEnabled, groupConfig.contactPersonFieldIds, groupConfig.participantFieldIds]);

  // Buduj odpowiedź do wyliczenia ceny
  const answersForPricing = useMemo(() => {
    if (!isGroupEnabled || registrationMode === 'individual') {
      return {
        ...answers,
        _addons: contactAddons,
        _registrationAddons: registrationAddons
      };
    }
    // Tryb grupowy: pierwszy uczestnik = osoba kontaktowa
    const contactP = participants[0];
    const otherP = participants.slice(1);
    return {
      _contactPerson: { ...contactP?.answers, _addons: contactP?.addons || {} },
      _participants: otherP.map(p => ({
        ...p.answers,
        _addons: p.addons
      })),
      _registrationAddons: registrationAddons,
      ...answers
    };
  }, [isGroupEnabled, registrationMode, answers, contactAddons, participants, registrationAddons]);

  // Oblicz rozbicie ceny
  const priceBreakdown = useMemo(() => {
    return calculatePriceBreakdown(fields, answersForPricing, settings);
  }, [fields, answersForPricing, settings]);

  const totalPrice = priceBreakdown.grandTotal;

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
            if (field.priceConfig?.basePrice > 0 || field.priceConfig?.datePricing?.enabled) {
              let price = field.priceConfig.basePrice || 0;
              let dateTierLabel = null;
              // Sprawdź cennik datowy
              const dp = field.priceConfig.datePricing;
              if (dp?.enabled && dp.tiers?.length > 0) {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const sorted = [...dp.tiers].filter(t => t.until && t.price != null)
                  .sort((a, b) => new Date(a.until) - new Date(b.until));
                for (const tier of sorted) {
                  if (now <= new Date(tier.until + 'T23:59:59')) {
                    price = tier.price;
                    dateTierLabel = tier.label;
                    break;
                  }
                }
              }
              if (price > 0) {
                info.price = price;
                info.priceCurrency = field.priceConfig.currency || 'PLN';
                info.priceType = field.priceConfig.pricingType;
                info.dateTierLabel = dateTierLabel;
              }
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

  // Sprawdź dostępność miejsc i tryb listy rezerwowej
  const seatAvailability = useMemo(() => {
    return checkSeatAvailability(fields, responseCount);
  }, [fields, responseCount]);

  const isWaitlistMode = seatAvailability.isWaitlist;

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

  const handleContactChange = useCallback((fieldId, value) => {
    setContactAnswers(prev => ({ ...prev, [fieldId]: value }));
    setContactErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldId];
      return newErrors;
    });
  }, []);

  const handleContactAddonChange = useCallback((addonId, quantity) => {
    setContactAddons(prev => ({ ...prev, [addonId]: quantity }));
  }, []);

  const handleParticipantUpdate = useCallback((index, updated) => {
    setParticipants(prev => {
      const newList = [...prev];
      newList[index] = updated;
      return newList;
    });
    // Clear errors for this participant
    setParticipantErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[index];
      return newErrors;
    });
  }, []);

  const addParticipant = useCallback(() => {
    const max = groupConfig.maxParticipants || 10;
    if (participants.length < max) {
      setParticipants(prev => [
        ...prev,
        { id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, answers: {}, addons: {} }
      ]);
    }
  }, [participants.length, groupConfig.maxParticipants]);

  const removeParticipant = useCallback((index) => {
    const min = groupConfig.minParticipants || 1;
    if (participants.length > min) {
      setParticipants(prev => prev.filter((_, i) => i !== index));
    }
  }, [participants.length, groupConfig.minParticipants]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const newErrors = {};
    const newContactErrors = {};
    const newParticipantErrors = {};
    let hasErrors = false;

    if (isGroupEnabled && registrationMode === 'group') {
      // Waliduj pola każdego uczestnika
      // Pierwszy uczestnik (index 0) = osoba zgłaszająca → contactFields
      // Pozostali → participantFields
      participants.forEach((participant, index) => {
        const pErrors = {};
        const fieldsForParticipant = index === 0 ? contactFields : participantFields;
        fieldsForParticipant.forEach(field => {
          const error = validateField(field, participant.answers[field.id]);
          if (error) {
            pErrors[field.id] = error;
            hasErrors = true;
          }
        });
        if (Object.keys(pErrors).length > 0) {
          newParticipantErrors[index] = pErrors;
        }
      });
    }

    // Waliduj standardowe pola (niezależnie od trybu)
    const fieldsToValidate = isGroupEnabled && registrationMode === 'group' ? standardFields : fields;
    fieldsToValidate.forEach(field => {
      const error = validateField(field, answers[field.id]);
      if (error) {
        newErrors[field.id] = error;
        hasErrors = true;
      }
    });

    setErrors(newErrors);
    setContactErrors({});
    setParticipantErrors(newParticipantErrors);

    if (hasErrors) {
      // Scroll to first error
      const firstErrorId = Object.keys(newErrors)[0];
      if (firstErrorId) {
        document.getElementById(`field-${firstErrorId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      } else {
        // Error in participant
        const firstPIdx = Object.keys(newParticipantErrors)[0];
        if (firstPIdx !== undefined) {
          const firstFieldId = Object.keys(newParticipantErrors[firstPIdx])[0];
          document.getElementById(`field-p${firstPIdx}-${firstFieldId}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }
      return;
    }

    // Zbuduj dane do wysłania
    let submitData;
    if (isGroupEnabled && registrationMode === 'group') {
      // Pierwszy uczestnik = osoba kontaktowa, reszta = członkowie
      const contactParticipant = participants[0];
      const otherParticipants = participants.slice(1);
      submitData = {
        ...answers,
        _registrationMode: 'group',
        _isWaitlist: isWaitlistMode || undefined,
        _contactPerson: { ...contactParticipant.answers, _addons: contactParticipant.addons },
        _participants: otherParticipants.map(p => ({
          ...p.answers,
          _addons: p.addons
        })),
        _registrationAddons: registrationAddons,
        _priceBreakdown: priceBreakdown,
        _payment: !isWaitlistMode && paymentData ? {
          method: selectedPaymentMethod,
          ...paymentData
        } : null,
        _totalPrice: isWaitlistMode ? 0 : totalPrice
      };
    } else {
      submitData = {
        ...answers,
        _registrationMode: isGroupEnabled ? 'individual' : undefined,
        _isWaitlist: isWaitlistMode || undefined,
        _addons: contactAddons,
        _registrationAddons: registrationAddons,
        _priceBreakdown: priceBreakdown,
        _payment: !isWaitlistMode && paymentData ? {
          method: selectedPaymentMethod,
          ...paymentData
        } : null,
        _totalPrice: isWaitlistMode ? 0 : totalPrice
      };
    }

    onSubmit(submitData);
  };

  // Obsługa sukcesu płatności PayPal
  const handlePayPalSuccess = (data) => {
    setPaymentCompleted(true);
    setPaymentData(data);
  };

  // Sprawdź czy płatność online jest wymagana (nie w trybie listy rezerwowej)
  const isOnlinePaymentRequired = !isWaitlistMode &&
    pricing.enabled &&
    pricing.paymentRequired &&
    (pricing.paymentMethods?.includes('paypal') || pricing.paymentMethods?.includes('przelewy24')) &&
    totalPrice > 0;

  // Sprawdź czy można wysłać formularz
  const canSubmit = !isOnlinePaymentRequired ||
    paymentCompleted ||
    (selectedPaymentMethod !== 'paypal' && selectedPaymentMethod !== 'przelewy24');

  const formMaxWidth = settings?._formMaxWidth || 'max-w-xl';

  if (isSubmitted) {
    return (
      <div className={`${formMaxWidth} mx-auto p-8 text-center`}>
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check size={40} className="text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {tr('Dziękujemy!')}
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

  // Dodatki per osoba i per rejestracja
  const perPersonAddons = (addonsConfig.items || []).filter(a => a.scope === 'per_person' && a.available !== false);
  const perRegistrationAddons = (addonsConfig.items || []).filter(a => a.scope === 'per_registration' && a.available !== false);

  const isGroupMode = isGroupEnabled && registrationMode === 'group';

  return (
    <form onSubmit={handleSubmit} className={`${formMaxWidth} mx-auto`}>
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
            <span>{tr('Postęp')}</span>
            <span>{completedFields} z {fields.length}</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-primary-light to-accent-secondary-light transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {(() => {
        const hdr = settings?.header || {};
        const hdrBg = hdr.background || {};
        const hdrBgType = hdrBg.type || 'solid';
        const isImageBg = hdrBgType === 'image' && hdrBg.image;
        const isGradientBg = hdrBgType === 'gradient';
        const isSolidBg = hdrBgType === 'solid';
        const isDarkBg = hdr.textColor === 'light' || (hdr.textColor === 'auto' && (isImageBg || isGradientBg));
        const textClass = isDarkBg ? 'text-white' : 'text-gray-900 dark:text-white';
        const subtextClass = isDarkBg ? 'text-white/70' : 'text-gray-600 dark:text-gray-400';
        const dividerClass = isDarkBg ? 'border-white/20' : 'border-gray-100 dark:border-gray-700';

        const paddingMap = { sm: 'p-4', md: 'p-6 md:p-8', lg: 'p-8 md:p-10', xl: 'p-10 md:p-12' };
        const radiusMap = { none: 'rounded-none', md: 'rounded-xl', xl: 'rounded-2xl', '2xl': 'rounded-3xl', '3xl': 'rounded-[2rem]' };
        const shadowMap = { none: '', sm: 'shadow-sm', md: 'shadow-md', lg: 'shadow-lg', xl: 'shadow-xl' };
        const titleSizeMap = { lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl', '3xl': 'text-3xl' };

        const padding = paddingMap[hdr.padding] || 'p-6 md:p-8';
        const radius = radiusMap[hdr.borderRadius] || 'rounded-2xl';
        const shadow = shadowMap[hdr.shadow] || '';
        const titleSize = titleSizeMap[hdr.titleSize] || 'text-2xl';
        const titleAlign = hdr.titleAlign === 'center' ? 'text-center' : 'text-left';
        const border = hdr.border !== false ? 'border border-gray-200 dark:border-gray-700' : '';

        // Styl tła headera
        let bgStyle = {};
        let bgClassName = 'bg-white dark:bg-gray-800';
        if (isSolidBg && hdrBg.solidColor) {
          bgStyle = { backgroundColor: hdrBg.solidColor };
          bgClassName = '';
        } else if (isGradientBg) {
          const g = hdrBg.gradient || {};
          const dirMap = { 'to-r': 'to right', 'to-br': 'to bottom right', 'to-b': 'to bottom', 'to-bl': 'to bottom left', 'to-t': 'to top', 'to-tr': 'to top right', 'to-l': 'to left', 'to-tl': 'to top left' };
          const dir = dirMap[g.direction] || 'to right';
          const stops = [g.from || '#3b82f6', g.via, g.to || '#8b5cf6'].filter(Boolean).join(', ');
          bgStyle = { background: `linear-gradient(${dir}, ${stops})` };
          bgClassName = '';
        }

        return (
          <div
            className={`relative overflow-hidden ${bgClassName} ${radius} ${border} ${shadow} ${padding} mb-6`}
            style={bgStyle}
          >
            {/* Obrazek tła headera */}
            {isImageBg && (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${hdrBg.image})` }}
                />
                <div
                  className="absolute inset-0 bg-black"
                  style={{ opacity: hdrBg.overlay ?? 0.5 }}
                />
              </>
            )}

            <div className="relative z-10">
              {/* Logo */}
              {branding.logoImage && (
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

              <h1 className={`${titleSize} font-bold ${textClass} mb-2 ${titleAlign}`}>
                {title}
              </h1>
              {description && (
                <p className={`${subtextClass} mb-4 ${titleAlign}`}>
                  {description}
                </p>
              )}

              {/* Informacje o wydarzeniu */}
              {hasEventInfo && hdr.showEventInfo !== false && (
                <div className={`mt-4 pt-4 ${hdr.showDivider !== false ? `border-t ${dividerClass}` : ''} space-y-2`}>
                  {eventInfo.location && (
                    <div className={`flex items-center gap-2 text-sm ${subtextClass}`}>
                      <MapPin size={16} className={isDarkBg ? 'text-white/80' : 'text-accent-primary-light'} />
                      {eventInfo.location}
                    </div>
                  )}
                  {(eventInfo.dateStart || eventInfo.dateEnd) && (
                    <div className={`flex items-center gap-2 text-sm ${subtextClass}`}>
                      <Calendar size={16} className={isDarkBg ? 'text-white/80' : 'text-accent-primary-light'} />
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
                    <div className={`flex items-center gap-2 text-sm ${subtextClass}`}>
                      <Clock size={16} className={isDarkBg ? 'text-white/80' : 'text-accent-primary-light'} />
                      {eventInfo.timeStart}
                      {eventInfo.timeEnd && <> - {eventInfo.timeEnd}</>}
                    </div>
                  )}
                  {eventInfo.price > 0 && (
                    <div className={`flex items-center gap-2 text-sm font-semibold ${isDarkBg ? 'text-green-300' : 'text-green-600 dark:text-green-400'}`}>
                      <DollarSign size={16} />
                      {formatPrice(eventInfo.price, eventInfo.priceCurrency)}
                      {eventInfo.priceType === 'per_person' && <span className={`font-normal ${isDarkBg ? 'text-white/60' : 'text-gray-500'}`}>/ os.</span>}
                      {eventInfo.dateTierLabel && (
                        <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${isDarkBg ? 'bg-white/20 text-white/80' : 'bg-blue-100 text-blue-700'}`}>
                          {eventInfo.dateTierLabel}
                        </span>
                      )}
                    </div>
                  )}
                  {eventInfo.maxSeats && eventInfo.showRemaining && (
                    <div className={`flex items-center gap-2 text-sm ${subtextClass}`}>
                      <Users size={16} className={isDarkBg ? 'text-blue-300' : 'text-blue-500'} />
                      {seatAvailability.remaining > 0 ? (
                        <>Pozostało <span className={`font-semibold ${isDarkBg ? 'text-blue-300' : 'text-blue-600'}`}>{seatAvailability.remaining}</span> miejsc</>
                      ) : isWaitlistMode ? (
                        <span className={`font-semibold ${isDarkBg ? 'text-orange-300' : 'text-orange-600 dark:text-orange-400'}`}>
                          Lista rezerwowa
                          {seatAvailability.waitlistRemaining !== null && (
                            <> — pozostało {seatAvailability.waitlistRemaining} miejsc</>
                          )}
                        </span>
                      ) : (
                        <span className="text-red-500 font-semibold">Brak wolnych miejsc</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Banner listy rezerwowej */}
      {isWaitlistMode && (
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl border border-orange-200 dark:border-orange-800 p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertCircle size={20} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-1">
                Lista rezerwowa
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-400">
                {seatAvailability.waitlistMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Przełącznik Indywidualna / Grupowa */}
      {isGroupEnabled && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <label className="block text-base font-medium text-gray-900 dark:text-white mb-3">
            Rodzaj rejestracji <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRegistrationMode('individual')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                registrationMode === 'individual'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-300'
              }`}
            >
              Indywidualna
            </button>
            <button
              type="button"
              onClick={() => setRegistrationMode('group')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                registrationMode === 'group'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-300'
              }`}
            >
              Grupowa
            </button>
          </div>
        </div>
      )}

      {/* Uczestnicy (tryb grupowy) — pierwszy = osoba zgłaszająca z pełnymi polami */}
      {isGroupMode && (
        <div className="space-y-4 mb-6">
          {participants.map((participant, index) => (
            <ParticipantForm
              key={participant.id}
              participant={participant}
              fields={index === 0 ? contactFields : participantFields}
              addons={addonsConfig.enabled ? addonsConfig.items : []}
              index={index}
              label={index === 0 ? 'Osoba zgłaszająca' : (groupConfig.participantLabel || 'Członek zespołu')}
              subtitle={index === 0 ? 'Osoba kontaktowa dla całej grupy' : null}
              onUpdate={(updated) => handleParticipantUpdate(index, updated)}
              onRemove={() => removeParticipant(index)}
              canRemove={index > 0 && participants.length > (groupConfig.minParticipants || 1)}
              errors={participantErrors[index]}
            />
          ))}

          {participants.length < (groupConfig.maxParticipants || 10) && (
            <button
              type="button"
              onClick={addParticipant}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              <Plus size={18} />
              {tr('Dodaj kolejną osobę')}
            </button>
          )}
        </div>
      )}

      {/* Standardowe pola (niegrupowe lub tryb indywidualny) */}
      {(() => {
        const displayFields = (!isGroupEnabled || registrationMode === 'individual' ? fields : standardFields)
          .filter(f => !['price', 'seat_limit', 'location', 'date_start', 'date_end', 'time_start', 'time_end'].includes(f.type));
        return displayFields.length > 0 && (
        <div className="space-y-6">
          {displayFields.map((field) => (
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
      );
      })()}

      {/* Dodatki per osoba (tryb indywidualny z addons) */}
      {addonsConfig.enabled && perPersonAddons.length > 0 && !isGroupMode && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Opcje dodatkowe
          </h3>
          <AddonSelector
            addons={perPersonAddons}
            selectedAddons={contactAddons}
            onChange={handleContactAddonChange}
            currency={pricing.currency || 'PLN'}
          />
        </div>
      )}

      {/* Dodatki per rejestracja */}
      {addonsConfig.enabled && perRegistrationAddons.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Opcje dodatkowe
          </h3>
          <AddonSelector
            addons={perRegistrationAddons}
            selectedAddons={registrationAddons}
            onChange={(addonId, qty) => setRegistrationAddons(prev => ({ ...prev, [addonId]: qty }))}
            currency={pricing.currency || 'PLN'}
          />
        </div>
      )}

      {/* Podsumowanie ceny */}
      {pricing.enabled && pricing.showPriceSummary && totalPrice > 0 && (
        <div className="mt-6">
          <PriceBreakdown
            breakdown={priceBreakdown}
            currency={pricing.currency || 'PLN'}
            isWaitlist={isWaitlistMode}
          />

          {!isWaitlistMode && pricing.paymentInstructions && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              {pricing.paymentInstructions}
            </p>
          )}

          {isWaitlistMode && (
            <p className="mt-3 text-sm text-orange-600 dark:text-orange-400">
              {tr('Płatność nie jest wymagana przy zapisie na listę rezerwową. W przypadku zwolnienia miejsca skontaktujemy się z Tobą.')}
            </p>
          )}

          {/* Wybór metody płatności — ukryty w trybie rezerwowym */}
          {!isWaitlistMode && pricing.paymentMethods && pricing.paymentMethods.length > 0 && pricing.paymentRequired && (
            <div className="mt-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
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
                        ? 'border-accent-primary-light bg-accent-primary-lightest dark:bg-accent-primary-darkest/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-accent-primary-light'
                    }`}
                  >
                    <CreditCard size={20} className="text-accent-primary" />
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
                    <span className="font-medium text-gray-700 dark:text-gray-300">{tr('Gotówka (na miejscu)')}</span>
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

              {/* PayPal Button */}
              {selectedPaymentMethod === 'paypal' && pricing.paypal?.clientId && !paymentCompleted && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
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
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Przelewy24Button
                    merchantId={pricing.przelewy24.merchantId}
                    crcKey={pricing.przelewy24.crcKey}
                    apiKey={pricing.przelewy24.apiKey}
                    amount={totalPrice}
                    currency={pricing.currency || 'PLN'}
                    description={pricing.przelewy24.description || `Płatność za: ${title}`}
                    sandbox={pricing.przelewy24.sandbox !== false}
                    formId={settings?.formId}
                    email={contactAnswers[contactFields.find(f => f.type === 'email')?.id] || answers[fields.find(f => f.type === 'email')?.id] || ''}
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
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Numer konta do przelewu:</p>
                    <p className="font-mono text-sm text-gray-900 dark:text-white">
                      {pricing.bankAccount}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {tr('W tytule przelewu wpisz swoje imię i nazwisko.')}
                  </p>
                </div>
              )}

              {/* Info o gotówce */}
              {selectedPaymentMethod === 'cash' && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {tr('Płatność gotówką przy wejściu na wydarzenie.')}
                  </p>
                </div>
              )}
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
        {!isWaitlistMode && pricing.enabled && pricing.paymentRequired && totalPrice > 0 && !selectedPaymentMethod && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <CreditCard size={16} />
              {tr('Wybierz metodę płatności powyżej.')}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !canSubmit || (!isWaitlistMode && pricing.enabled && pricing.paymentRequired && totalPrice > 0 && !selectedPaymentMethod)}
          className={`w-full flex items-center justify-center gap-2 py-4 px-6 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isWaitlistMode
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:shadow-lg hover:shadow-orange-500/25'
              : 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:shadow-lg hover:shadow-accent-primary-light/25'
          }`}
          style={!isWaitlistMode && settings?.theme?.primaryColor ? {
            background: settings.theme.primaryColor
          } : {}}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              {tr('Wysyłanie...')}
            </>
          ) : (
            <>
              {paymentCompleted && (selectedPaymentMethod === 'paypal' || selectedPaymentMethod === 'przelewy24') && (
                <Check size={18} className="mr-1" />
              )}
              {pricing.enabled && totalPrice > 0 && !paymentCompleted && !isWaitlistMode && (
                <span className="mr-2">{formatPrice(totalPrice, pricing.currency || 'PLN')} •</span>
              )}
              {isWaitlistMode ? 'Zapisz na listę rezerwową' : (settings?.submitButtonText || 'Wyślij')}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
