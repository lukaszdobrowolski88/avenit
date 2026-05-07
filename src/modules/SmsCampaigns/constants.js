// Konfiguracja UI dla modułu SMS Kampanie.

export const STATUS_CONFIG = {
  draft:     { label: 'Szkic',        color: 'gray',    gradient: 'from-gray-400 to-gray-500' },
  scheduled: { label: 'Zaplanowany',  color: 'amber',   gradient: 'from-amber-400 to-orange-500' },
  sending:   { label: 'Wysyłanie...', color: 'blue',    gradient: 'from-blue-400 to-indigo-500' },
  sent:      { label: 'Wysłany',      color: 'emerald', gradient: 'from-emerald-400 to-teal-500' },
  failed:    { label: 'Błąd',         color: 'red',     gradient: 'from-red-400 to-rose-500' },
  cancelled: { label: 'Anulowany',    color: 'gray',    gradient: 'from-gray-400 to-gray-500' },
};

// Limit nadawcy alfanumerycznego w SMSAPI.
export const SENDER_MAX = 11;
// Soft limit treści (5 części Unicode = 335 znaków lub 5×153 = 765 GSM-7); pozwalamy na więcej.
export const BODY_MAX = 1530;

// Domyślna cena za część SMS w PLN (przybliżenie SMSAPI 0.16-0.20 zł).
export const PRICE_PER_PART = 0.16;
