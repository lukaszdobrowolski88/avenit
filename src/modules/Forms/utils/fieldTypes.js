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
        allowWaitlist: false
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
  theme: {
    primaryColor: '#ec4899',
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
    return { available: true, remaining: null };
  }

  const maxSeats = seatField.seatConfig.maxSeats;
  const remaining = maxSeats - responseCount;

  return {
    available: remaining > 0,
    remaining: remaining,
    maxSeats: maxSeats,
    allowWaitlist: seatField.seatConfig.allowWaitlist || false
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
  }
];
