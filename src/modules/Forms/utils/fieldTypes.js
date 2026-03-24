import {
  Type,
  AlignLeft,
  List,
  CircleDot,
  CheckSquare,
  Calendar,
  Mail,
  Phone,
  Hash,
  Upload,
  MapPin,
  Clock,
  DollarSign,
  Users,
  CalendarRange,
  ImageIcon
} from 'lucide-react';

export const FIELD_TYPES = {
  text: {
    id: 'text',
    label: 'Krótki tekst',
    description: 'Jedna linia tekstu',
    icon: Type,
    defaultProps: {
      label: 'Pole tekstowe',
      placeholder: 'Wpisz tekst...',
      required: false,
      validation: { maxLength: 255 }
    }
  },
  textarea: {
    id: 'textarea',
    label: 'Długi tekst',
    description: 'Wiele linii tekstu',
    icon: AlignLeft,
    defaultProps: {
      label: 'Pole tekstowe',
      placeholder: 'Wpisz tekst...',
      required: false,
      validation: { maxLength: 2000 }
    }
  },
  select: {
    id: 'select',
    label: 'Lista rozwijana',
    description: 'Wybór z listy',
    icon: List,
    defaultProps: {
      label: 'Wybierz opcję',
      placeholder: 'Wybierz...',
      required: false,
      options: [
        { id: '1', label: 'Opcja 1', value: 'option1' },
        { id: '2', label: 'Opcja 2', value: 'option2' }
      ]
    }
  },
  radio: {
    id: 'radio',
    label: 'Pojedynczy wybór',
    description: 'Radio buttons',
    icon: CircleDot,
    defaultProps: {
      label: 'Wybierz jedną opcję',
      required: false,
      options: [
        { id: '1', label: 'Opcja 1', value: 'option1' },
        { id: '2', label: 'Opcja 2', value: 'option2' }
      ]
    }
  },
  checkbox: {
    id: 'checkbox',
    label: 'Wielokrotny wybór',
    description: 'Checkboxy',
    icon: CheckSquare,
    defaultProps: {
      label: 'Wybierz opcje',
      required: false,
      options: [
        { id: '1', label: 'Opcja 1', value: 'option1' },
        { id: '2', label: 'Opcja 2', value: 'option2' }
      ]
    }
  },
  date: {
    id: 'date',
    label: 'Data',
    description: 'Wybór daty',
    icon: Calendar,
    defaultProps: {
      label: 'Wybierz datę',
      required: false
    }
  },
  email: {
    id: 'email',
    label: 'Email',
    description: 'Adres email',
    icon: Mail,
    defaultProps: {
      label: 'Adres email',
      placeholder: 'jan@example.com',
      required: false,
      validation: { pattern: '^[^@]+@[^@]+\\.[^@]+$' }
    }
  },
  phone: {
    id: 'phone',
    label: 'Telefon',
    description: 'Numer telefonu',
    icon: Phone,
    defaultProps: {
      label: 'Numer telefonu',
      placeholder: '+48 123 456 789',
      required: false
    }
  },
  number: {
    id: 'number',
    label: 'Liczba',
    description: 'Pole numeryczne',
    icon: Hash,
    defaultProps: {
      label: 'Liczba',
      placeholder: '0',
      required: false,
      validation: {}
    }
  },
  file: {
    id: 'file',
    label: 'Plik',
    description: 'Upload pliku',
    icon: Upload,
    defaultProps: {
      label: 'Dołącz plik',
      required: false,
      fileConfig: {
        maxSize: 10,
        allowedTypes: ['image/*', 'application/pdf'],
        multiple: false
      }
    }
  },
  image: {
    id: 'image',
    label: 'Obraz',
    description: 'Upload zdjęcia',
    icon: ImageIcon,
    defaultProps: {
      label: 'Dodaj zdjęcie',
      required: false,
      imageConfig: {
        maxSize: 5,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        multiple: false,
        showPreview: true,
        maxWidth: 1920,
        maxHeight: 1080,
        compress: true
      }
    }
  },
  // === POLA SPECJALNE DLA WYDARZEŃ ===
  location: {
    id: 'location',
    label: 'Miejsce',
    description: 'Lokalizacja wydarzenia',
    icon: MapPin,
    category: 'event',
    isSpecial: true,
    defaultProps: {
      label: 'Miejsce wydarzenia',
      placeholder: 'np. Sala główna, ul. Przykładowa 1',
      required: false,
      validation: { maxLength: 255 },
      showInHeader: true
    }
  },
  date_start: {
    id: 'date_start',
    label: 'Data rozpoczęcia',
    description: 'Data startu wydarzenia',
    icon: Calendar,
    category: 'event',
    isSpecial: true,
    defaultProps: {
      label: 'Data rozpoczęcia',
      required: false,
      showInHeader: true
    }
  },
  date_end: {
    id: 'date_end',
    label: 'Data zakończenia',
    description: 'Data końca wydarzenia',
    icon: CalendarRange,
    category: 'event',
    isSpecial: true,
    defaultProps: {
      label: 'Data zakończenia',
      required: false,
      showInHeader: true
    }
  },
  time_start: {
    id: 'time_start',
    label: 'Godzina rozpoczęcia',
    description: 'Godzina startu wydarzenia',
    icon: Clock,
    category: 'event',
    isSpecial: true,
    defaultProps: {
      label: 'Godzina rozpoczęcia',
      required: false,
      showInHeader: true
    }
  },
  time_end: {
    id: 'time_end',
    label: 'Godzina zakończenia',
    description: 'Godzina końca wydarzenia',
    icon: Clock,
    category: 'event',
    isSpecial: true,
    defaultProps: {
      label: 'Godzina zakończenia',
      required: false,
      showInHeader: true
    }
  },
  price: {
    id: 'price',
    label: 'Cena',
    description: 'Cena uczestnictwa',
    icon: DollarSign,
    category: 'event',
    isSpecial: true,
    defaultProps: {
      label: 'Cena',
      required: false,
      showInHeader: true,
      priceConfig: {
        basePrice: 0,
        currency: 'PLN',
        showInSummary: true,
        pricingType: 'fixed', // 'fixed' | 'per_person' | 'tiered' | 'options'
        tiers: [], // dla tiered: [{ minQty: 1, maxQty: 5, price: 100 }, ...]
        optionPrices: {} // dla options: { 'option_id': 50, ... }
      }
    }
  },
  seat_limit: {
    id: 'seat_limit',
    label: 'Limit miejsc',
    description: 'Maksymalna liczba uczestników',
    icon: Users,
    category: 'event',
    isSpecial: true,
    defaultProps: {
      label: 'Limit miejsc',
      required: false,
      showInHeader: true,
      seatConfig: {
        maxSeats: null,
        showRemaining: true,
        allowWaitlist: false,
        waitlistSeats: null,
        waitlistMessage: 'Miejsca podstawowe zostały wyczerpane. Możesz zapisać się na listę rezerwową.'
      }
    }
  },
  quantity: {
    id: 'quantity',
    label: 'Ilość osób',
    description: 'Pole do wpisania ilości osób',
    icon: Users,
    category: 'event',
    isSpecial: true,
    defaultProps: {
      label: 'Liczba osób',
      placeholder: '1',
      required: false,
      validation: { min: 1, max: 10 },
      quantityConfig: {
        defaultValue: 1,
        affectsPrice: true
      }
    }
  }
};

export function createField(typeId) {
  const fieldType = FIELD_TYPES[typeId];
  if (!fieldType) return null;

  return {
    id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: typeId,
    ...JSON.parse(JSON.stringify(fieldType.defaultProps))
  };
}

export function getFieldTypeInfo(typeId) {
  return FIELD_TYPES[typeId] || null;
}

export const DEFAULT_FORM_SETTINGS = {
  submitButtonText: 'Wyślij',
  successMessage: 'Dziękujemy za wypełnienie formularza!',
  redirectUrl: '',
  collectEmail: false,
  requireEmail: false,
  limitResponses: null,
  oneResponsePerUser: false,
  showProgressBar: false,
  // Rejestracja grupowa
  groupRegistration: {
    enabled: false,
    minParticipants: 1,
    maxParticipants: 10,
    participantFieldIds: [],
    contactPersonFieldIds: [],
    participantLabel: 'Członek zespołu',
    allowDynamicCount: true,
    requireContactPerson: true
  },
  // Dodatki płatne
  addons: {
    enabled: false,
    items: []
  },
  // Rabaty ilościowe
  discounts: {
    enabled: false,
    rules: [],
    stackingMode: 'best'
  },
  // Layout formularza
  layout: {
    maxWidth: 'md',         // 'sm' (480px) | 'md' (576px) | 'lg' (672px) | 'xl' (768px) | '2xl' (896px)
    background: {
      type: 'gradient',     // 'solid' | 'gradient' | 'image'
      solidColor: '#ffffff',
      gradient: {
        from: '#fdf2f8',    // pink-50
        via: '#ffffff',
        to: '#fff7ed',      // orange-50
        direction: 'to-br'  // 'to-r' | 'to-br' | 'to-b' | 'to-bl' | 'to-t'
      },
      orbs: []              // [{ color, size, x, y, blur }]
    }
  },
  theme: {
    primaryColor: '#c7ab71',
    backgroundColor: '#ffffff',
    fontFamily: 'inherit'
  },
  // Ustawienia grafiki/obrazów
  branding: {
    headerImage: null,        // URL obrazka nagłówka
    backgroundImage: null,    // URL obrazka tła
    backgroundOverlay: 0.5,   // Przezroczystość overlay (0-1)
    logoImage: null,          // URL logo
    logoPosition: 'left',     // 'left' | 'center' | 'right'
    headerHeight: 200,        // Wysokość nagłówka w px
    showHeaderOnPublic: true  // Pokaż nagłówek na publicznym formularzu
  },
  // Stylowanie karty nagłówkowej (tytuł, opis, event info)
  header: {
    background: {
      type: 'solid',           // 'solid' | 'gradient' | 'image'
      solidColor: '#ffffff',
      gradient: {
        from: '#3b82f6',
        to: '#8b5cf6',
        direction: 'to-r'
      },
      image: null,             // URL obrazka
      overlay: 0.5             // Przezroczystość overlay na obrazku
    },
    textColor: 'auto',         // 'auto' | 'light' | 'dark'
    padding: 'md',             // 'sm' | 'md' | 'lg' | 'xl'
    borderRadius: 'xl',        // 'none' | 'md' | 'xl' | '2xl' | '3xl'
    border: true,              // Pokaż border
    shadow: 'none',            // 'none' | 'sm' | 'md' | 'lg' | 'xl'
    titleSize: 'xl',           // 'lg' | 'xl' | '2xl' | '3xl'
    titleAlign: 'left',        // 'left' | 'center'
    showDivider: true          // Linia oddzielająca event info
  },
  // Ustawienia cennika/płatności
  pricing: {
    enabled: false,
    currency: 'PLN',
    showPriceSummary: true,
    paymentRequired: false,
    paymentMethods: [],       // ['transfer', 'cash', 'paypal', 'przelewy24']
    bankAccount: '',          // Numer konta do przelewu
    paymentInstructions: '',  // Instrukcje płatności
    // Konfiguracja PayPal
    paypal: {
      clientId: '',           // PayPal Client ID
      sandbox: true,          // Tryb sandbox/produkcja
      description: ''         // Opis płatności
    },
    // Konfiguracja Przelewy24
    przelewy24: {
      merchantId: '',         // ID sprzedawcy w P24
      crcKey: '',             // Klucz CRC do podpisywania
      apiKey: '',             // Klucz API
      sandbox: true,          // Tryb sandbox/produkcja
      description: ''         // Opis płatności
    }
  },
  notifications: {
    emailOnSubmit: false,
    notifyEmails: []
  },
  // Ustawienia powiadomien email
  emails: {
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
    // Informacja o platnosci (dla przelewu)
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
      emails: [],
      useCustomTemplate: false,
      customTemplateId: null,
      customSubject: '',
      customHtml: '',
      customBlocks: null
    },
    // Termin platnosci (dni)
    paymentDeadlineDays: 7
  }
};

// Funkcja do wyliczania ceny na podstawie pól formularza
export function calculateTotalPrice(fields, answers) {
  let totalPrice = 0;

  fields.forEach(field => {
    if (field.type === 'price' && field.priceConfig) {
      const config = field.priceConfig;
      const basePrice = config.basePrice || 0;

      switch (config.pricingType) {
        case 'fixed':
          totalPrice += basePrice;
          break;

        case 'per_person':
          // Znajdź pole quantity w formularzu
          const quantityField = fields.find(f => f.type === 'quantity');
          const quantity = quantityField ? (parseInt(answers[quantityField.id]) || 1) : 1;
          totalPrice += basePrice * quantity;
          break;

        case 'tiered':
          // Cena zależna od ilości (np. rabaty przy większej liczbie osób)
          const qtyField = fields.find(f => f.type === 'quantity');
          const qty = qtyField ? (parseInt(answers[qtyField.id]) || 1) : 1;
          const tier = config.tiers?.find(t => qty >= t.minQty && qty <= t.maxQty);
          if (tier) {
            totalPrice += tier.price * qty;
          } else {
            totalPrice += basePrice * qty;
          }
          break;

        case 'options':
          // Cena zależna od wybranych opcji (np. różne warianty)
          Object.entries(config.optionPrices || {}).forEach(([fieldId, prices]) => {
            const answer = answers[fieldId];
            if (Array.isArray(answer)) {
              // Wielokrotny wybór
              answer.forEach(val => {
                if (prices[val]) totalPrice += prices[val];
              });
            } else if (answer && prices[answer]) {
              // Pojedynczy wybór
              totalPrice += prices[answer];
            }
          });
          totalPrice += basePrice;
          break;

        default:
          totalPrice += basePrice;
      }
    }
  });

  return totalPrice;
}

// Funkcja do wyliczania rozbicia cen (grupowa rejestracja, dodatki, rabaty)
export function calculatePriceBreakdown(fields, answers, settings) {
  const pricing = settings?.pricing || {};
  const addonsConfig = settings?.addons || {};
  const discountsConfig = settings?.discounts || {};
  const groupConfig = settings?.groupRegistration || {};

  // 1. Cena bazowa z pola price
  let baseUnitPrice = 0;
  let pricingType = 'fixed';
  const priceField = fields.find(f => f.type === 'price' && f.priceConfig);
  if (priceField) {
    baseUnitPrice = priceField.priceConfig.basePrice || 0;
    pricingType = priceField.priceConfig.pricingType || 'fixed';
  }

  // 2. Liczba uczestników
  let participantCount = 1;
  if (groupConfig.enabled && answers._participants) {
    participantCount = answers._participants.length;
    // +1 for contact person if they are also a participant
    if (answers._contactPerson && groupConfig.requireContactPerson) {
      participantCount += 1;
    }
  } else {
    const quantityField = fields.find(f => f.type === 'quantity');
    if (quantityField) {
      participantCount = parseInt(answers[quantityField.id]) || 1;
    }
  }

  // 3. Oblicz cenę bazową
  let baseTotal = 0;
  switch (pricingType) {
    case 'per_person':
      baseTotal = baseUnitPrice * participantCount;
      break;
    case 'tiered': {
      const tier = priceField?.priceConfig?.tiers?.find(
        t => participantCount >= t.minQty && participantCount <= t.maxQty
      );
      baseTotal = (tier ? tier.price : baseUnitPrice) * participantCount;
      break;
    }
    default:
      baseTotal = baseUnitPrice;
  }

  // 4. Oblicz dodatki
  const addonsBreakdown = [];
  let addonsTotal = 0;
  if (addonsConfig.enabled && addonsConfig.items?.length > 0) {
    addonsConfig.items.forEach(addon => {
      if (!addon.available && addon.available !== undefined) return;
      let totalQty = 0;

      if (addon.scope === 'per_person') {
        // Sumuj z każdego uczestnika
        if (answers._participants) {
          answers._participants.forEach(p => {
            totalQty += (p._addons?.[addon.id] || 0);
          });
        }
        // Osoba kontaktowa
        if (answers._contactPerson?._addons?.[addon.id]) {
          totalQty += answers._contactPerson._addons[addon.id];
        }
        // Tryb indywidualny (top-level _addons)
        if (answers._addons?.[addon.id]) {
          totalQty += answers._addons[addon.id];
        }
      } else {
        // per_registration
        totalQty = answers._registrationAddons?.[addon.id] || 0;
      }

      if (totalQty > 0) {
        const total = addon.price * totalQty;
        addonsBreakdown.push({
          id: addon.id,
          name: addon.name,
          unitPrice: addon.price,
          quantity: totalQty,
          total
        });
        addonsTotal += total;
      }
    });
  }

  // 5. Suma częściowa
  const subtotal = baseTotal + addonsTotal;

  // 6. Zastosuj rabaty
  const appliedDiscounts = [];
  let discountTotal = 0;
  if (discountsConfig.enabled && discountsConfig.rules?.length > 0) {
    const qualifyingRules = discountsConfig.rules
      .filter(rule => {
        if (rule.type === 'quantity') {
          return participantCount >= rule.minQuantity;
        }
        return false;
      })
      .map(rule => {
        let amount = 0;
        switch (rule.discountType) {
          case 'percentage':
            amount = subtotal * (rule.value / 100);
            break;
          case 'fixed_per_person':
            amount = rule.value * participantCount;
            break;
          case 'fixed_total':
            amount = rule.value;
            break;
        }
        return { ...rule, amount };
      })
      .sort((a, b) => b.amount - a.amount);

    if (discountsConfig.stackingMode === 'all') {
      qualifyingRules.forEach(rule => {
        if (rule.stackable || qualifyingRules.length === 1) {
          appliedDiscounts.push({ label: rule.label, amount: rule.amount });
          discountTotal += rule.amount;
        }
      });
      // Jeśli żaden nie jest stackable, weź najlepszy
      if (appliedDiscounts.length === 0 && qualifyingRules.length > 0) {
        appliedDiscounts.push({ label: qualifyingRules[0].label, amount: qualifyingRules[0].amount });
        discountTotal = qualifyingRules[0].amount;
      }
    } else {
      // 'best' - najlepszy rabat
      if (qualifyingRules.length > 0) {
        appliedDiscounts.push({ label: qualifyingRules[0].label, amount: qualifyingRules[0].amount });
        discountTotal = qualifyingRules[0].amount;
      }
    }
  }

  const grandTotal = Math.max(0, subtotal - discountTotal);

  return {
    baseUnitPrice,
    participantCount,
    pricingType,
    baseTotal,
    addonsBreakdown,
    addonsTotal,
    subtotal,
    appliedDiscounts,
    discountTotal,
    grandTotal
  };
}

// Funkcja formatująca cenę
export function formatPrice(amount, currency = 'PLN') {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
}

// Funkcja sprawdzająca dostępność miejsc
export function checkSeatAvailability(fields, responseCount) {
  const seatField = fields.find(f => f.type === 'seat_limit');
  if (!seatField || !seatField.seatConfig?.maxSeats) {
    return { available: true, remaining: null, isWaitlist: false };
  }

  const config = seatField.seatConfig;
  const maxSeats = config.maxSeats;
  const remaining = maxSeats - responseCount;
  const allowWaitlist = config.allowWaitlist || false;
  const waitlistSeats = config.waitlistSeats || 0;
  const waitlistRemaining = waitlistSeats > 0
    ? waitlistSeats - Math.max(0, responseCount - maxSeats)
    : (allowWaitlist ? Infinity : 0);

  // Czy jest na liście rezerwowej
  const isWaitlist = remaining <= 0 && allowWaitlist && waitlistRemaining > 0;
  // Czy w ogóle można się zapisać
  const available = remaining > 0 || isWaitlist;

  return {
    available,
    remaining: Math.max(0, remaining),
    maxSeats,
    allowWaitlist,
    isWaitlist,
    waitlistRemaining: waitlistSeats > 0 ? Math.max(0, waitlistRemaining) : null,
    waitlistSeats,
    waitlistMessage: config.waitlistMessage || 'Miejsca podstawowe zostały wyczerpane. Możesz zapisać się na listę rezerwową.'
  };
}

// Pomocnicze funkcje do kategoryzacji pól
export function getFieldsByCategory(category) {
  return Object.values(FIELD_TYPES).filter(f => f.category === category);
}

export function getStandardFields() {
  return Object.values(FIELD_TYPES).filter(f => !f.category);
}

export function getEventFields() {
  return Object.values(FIELD_TYPES).filter(f => f.category === 'event');
}

export const BUILT_IN_TEMPLATES = [
  {
    id: 'event-registration',
    title: 'Rejestracja na wydarzenie',
    category: 'events',
    description: 'Formularz zapisów na wydarzenie kościelne',
    fields: [
      {
        id: 'field-name',
        type: 'text',
        label: 'Imię i nazwisko',
        placeholder: 'Jan Kowalski',
        required: true,
        validation: { maxLength: 100 }
      },
      {
        id: 'field-email',
        type: 'email',
        label: 'Adres email',
        placeholder: 'jan@example.com',
        required: true,
        validation: { pattern: '^[^@]+@[^@]+\\.[^@]+$' }
      },
      {
        id: 'field-phone',
        type: 'phone',
        label: 'Numer telefonu',
        placeholder: '+48 123 456 789',
        required: false
      },
      {
        id: 'field-source',
        type: 'select',
        label: 'Skąd dowiedziałeś/aś się o wydarzeniu?',
        placeholder: 'Wybierz...',
        required: false,
        options: [
          { id: '1', label: 'Facebook', value: 'facebook' },
          { id: '2', label: 'Strona kościoła', value: 'website' },
          { id: '3', label: 'Od znajomych', value: 'friends' },
          { id: '4', label: 'Inne', value: 'other' }
        ]
      },
      {
        id: 'field-notes',
        type: 'textarea',
        label: 'Uwagi',
        placeholder: 'Dodatkowe informacje...',
        required: false,
        validation: { maxLength: 500 }
      }
    ],
    settings: {
      ...DEFAULT_FORM_SETTINGS,
      successMessage: 'Dziękujemy za rejestrację! Do zobaczenia na wydarzeniu.'
    }
  },
  {
    id: 'survey',
    title: 'Ankieta',
    category: 'feedback',
    description: 'Zbierz opinie od członków',
    fields: [
      {
        id: 'field-rating',
        type: 'radio',
        label: 'Jak oceniasz ostatnie nabożeństwo?',
        required: true,
        options: [
          { id: '1', label: '1 - Słabo', value: '1' },
          { id: '2', label: '2 - Średnio', value: '2' },
          { id: '3', label: '3 - Dobrze', value: '3' },
          { id: '4', label: '4 - Bardzo dobrze', value: '4' },
          { id: '5', label: '5 - Świetnie', value: '5' }
        ]
      },
      {
        id: 'field-liked',
        type: 'checkbox',
        label: 'Co Ci się podobało?',
        required: false,
        options: [
          { id: '1', label: 'Uwielbienie', value: 'worship' },
          { id: '2', label: 'Kazanie', value: 'sermon' },
          { id: '3', label: 'Atmosfera', value: 'atmosphere' },
          { id: '4', label: 'Społeczność', value: 'community' }
        ]
      },
      {
        id: 'field-improve',
        type: 'textarea',
        label: 'Co możemy poprawić?',
        placeholder: 'Twoje sugestie...',
        required: false,
        validation: { maxLength: 1000 }
      }
    ],
    settings: {
      ...DEFAULT_FORM_SETTINGS,
      successMessage: 'Dziękujemy za Twoją opinię!'
    }
  },
  {
    id: 'contact',
    title: 'Formularz kontaktowy',
    category: 'contact',
    description: 'Prosty formularz kontaktowy',
    fields: [
      {
        id: 'field-name',
        type: 'text',
        label: 'Imię',
        placeholder: 'Jan',
        required: true,
        validation: { maxLength: 50 }
      },
      {
        id: 'field-email',
        type: 'email',
        label: 'Email',
        placeholder: 'jan@example.com',
        required: true,
        validation: { pattern: '^[^@]+@[^@]+\\.[^@]+$' }
      },
      {
        id: 'field-subject',
        type: 'select',
        label: 'Temat',
        placeholder: 'Wybierz temat...',
        required: true,
        options: [
          { id: '1', label: 'Pytanie ogólne', value: 'general' },
          { id: '2', label: 'Prośba o modlitwę', value: 'prayer' },
          { id: '3', label: 'Chcę dołączyć do służby', value: 'volunteer' },
          { id: '4', label: 'Inne', value: 'other' }
        ]
      },
      {
        id: 'field-message',
        type: 'textarea',
        label: 'Wiadomość',
        placeholder: 'Napisz swoją wiadomość...',
        required: true,
        validation: { maxLength: 2000 }
      }
    ],
    settings: {
      ...DEFAULT_FORM_SETTINGS,
      successMessage: 'Dziękujemy za wiadomość! Odpowiemy najszybciej jak to możliwe.'
    }
  },
  {
    id: 'prayer-request',
    title: 'Prośba o modlitwę',
    category: 'prayer',
    description: 'Formularz do zbierania próśb modlitewnych',
    fields: [
      {
        id: 'field-name',
        type: 'text',
        label: 'Imię (opcjonalnie)',
        placeholder: 'Możesz pozostać anonimowy',
        required: false,
        validation: { maxLength: 50 }
      },
      {
        id: 'field-category',
        type: 'select',
        label: 'Kategoria',
        placeholder: 'Wybierz kategorię...',
        required: false,
        options: [
          { id: '1', label: 'Zdrowie', value: 'health' },
          { id: '2', label: 'Rodzina', value: 'family' },
          { id: '3', label: 'Praca', value: 'work' },
          { id: '4', label: 'Relacje', value: 'relationships' },
          { id: '5', label: 'Inne', value: 'other' }
        ]
      },
      {
        id: 'field-request',
        type: 'textarea',
        label: 'Twoja prośba modlitewna',
        placeholder: 'Opisz swoją prośbę...',
        required: true,
        validation: { maxLength: 2000 }
      },
      {
        id: 'field-public',
        type: 'radio',
        label: 'Czy prośba może być udostępniona do wspólnej modlitwy?',
        required: true,
        options: [
          { id: '1', label: 'Tak, może być publiczna', value: 'public' },
          { id: '2', label: 'Nie, tylko dla pastora', value: 'private' }
        ]
      }
    ],
    settings: {
      ...DEFAULT_FORM_SETTINGS,
      successMessage: 'Dziękujemy. Będziemy się modlić w Twojej intencji.'
    }
  },
  {
    id: 'conference-group',
    title: 'Rejestracja na konferencję (grupowa)',
    category: 'events',
    description: 'Formularz zapisów z rejestracją indywidualną i grupową, dodatkami płatnymi i rabatami',
    fields: [
      {
        id: 'field-firstname',
        type: 'text',
        label: 'Imię',
        placeholder: 'Jan',
        required: true,
        validation: { maxLength: 50 }
      },
      {
        id: 'field-lastname',
        type: 'text',
        label: 'Nazwisko',
        placeholder: 'Kowalski',
        required: true,
        validation: { maxLength: 50 }
      },
      {
        id: 'field-email',
        type: 'email',
        label: 'Adres e-mail',
        placeholder: 'jan@example.com',
        required: true,
        validation: { pattern: '^[^@]+@[^@]+\\.[^@]+$' }
      },
      {
        id: 'field-phone',
        type: 'phone',
        label: 'Numer telefonu',
        placeholder: '+48 512 345 678',
        required: true
      },
      {
        id: 'field-church',
        type: 'text',
        label: 'Nazwa wspólnoty',
        placeholder: 'np. Kościół Nowe Życie',
        required: true,
        validation: { maxLength: 100 }
      },
      {
        id: 'field-city',
        type: 'text',
        label: 'Miejscowość',
        placeholder: 'np. Warszawa',
        required: true,
        validation: { maxLength: 100 }
      },
      {
        id: 'field-role',
        type: 'text',
        label: 'Funkcja w kościele',
        placeholder: 'np. pastor, starszy, lider lub liderka, członek zespołu',
        required: true,
        validation: { maxLength: 100 }
      },
      {
        id: 'field-diet',
        type: 'text',
        label: 'Dieta (opcjonalnie)',
        placeholder: 'np. wegetariańska, bezglutenowa',
        required: false,
        validation: { maxLength: 100 }
      },
      {
        id: 'field-price',
        type: 'price',
        label: 'Cena',
        required: false,
        showInHeader: true,
        priceConfig: {
          basePrice: 250,
          currency: 'PLN',
          showInSummary: true,
          pricingType: 'per_person',
          tiers: [],
          optionPrices: {}
        }
      },
      {
        id: 'field-seats',
        type: 'seat_limit',
        label: 'Limit miejsc',
        required: false,
        showInHeader: true,
        seatConfig: {
          maxSeats: 200,
          showRemaining: true,
          allowWaitlist: false
        }
      }
    ],
    settings: {
      ...DEFAULT_FORM_SETTINGS,
      submitButtonText: 'Wyślij zgłoszenie',
      successMessage: 'Dziękujemy za rejestrację! Potwierdzenie zostanie wysłane na podany adres email. Do zobaczenia na konferencji!',
      groupRegistration: {
        enabled: true,
        minParticipants: 1,
        maxParticipants: 15,
        participantFieldIds: ['field-firstname', 'field-lastname', 'field-role', 'field-diet'],
        contactPersonFieldIds: ['field-firstname', 'field-lastname', 'field-email', 'field-phone', 'field-church', 'field-city', 'field-role', 'field-diet'],
        participantLabel: 'Członek zespołu',
        allowDynamicCount: true,
        requireContactPerson: true
      },
      addons: {
        enabled: true,
        items: [
          {
            id: 'addon-consultation',
            name: 'Indywidualne konsultacje',
            description: 'Dodatkowe konsultacje indywidualne z prelegentem',
            price: 149,
            scope: 'per_person',
            required: false,
            maxQuantity: 1,
            available: true
          },
          {
            id: 'addon-lunch',
            name: 'Pakiet lunchowy',
            description: 'Obiad i przerwa kawowa w cenie',
            price: 45,
            scope: 'per_person',
            required: false,
            maxQuantity: 1,
            available: true
          },
          {
            id: 'addon-parking',
            name: 'Miejsce parkingowe',
            description: 'Rezerwacja miejsca parkingowego na czas konferencji',
            price: 30,
            scope: 'per_registration',
            required: false,
            maxQuantity: 1,
            available: true
          }
        ]
      },
      discounts: {
        enabled: true,
        rules: [
          {
            id: 'disc-3plus',
            type: 'quantity',
            minQuantity: 3,
            discountType: 'percentage',
            value: 10,
            label: '10% rabatu dla grup 3+ osób',
            stackable: false
          },
          {
            id: 'disc-5plus',
            type: 'quantity',
            minQuantity: 5,
            discountType: 'percentage',
            value: 15,
            label: '15% rabatu dla grup 5+ osób',
            stackable: false
          },
          {
            id: 'disc-10plus',
            type: 'quantity',
            minQuantity: 10,
            discountType: 'percentage',
            value: 20,
            label: '20% rabatu dla grup 10+ osób',
            stackable: false
          }
        ],
        stackingMode: 'best'
      },
      pricing: {
        enabled: true,
        currency: 'PLN',
        showPriceSummary: true,
        paymentRequired: true,
        paymentMethods: ['transfer', 'przelewy24'],
        bankAccount: '',
        paymentInstructions: 'Płatność wymagana w ciągu 7 dni od rejestracji.',
        paypal: { clientId: '', sandbox: true, description: '' },
        przelewy24: { merchantId: '', crcKey: '', apiKey: '', sandbox: true, description: '' }
      }
    }
  }
];
