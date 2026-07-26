// Helpery modułu Automatyzacji (Automation)

// Typy wyzwalaczy (trigger_type)
export const TRIGGER_TYPES = [
  { value: 'new_guest', label: 'Nowy gość' },
  { value: 'new_member', label: 'Nowy członek' },
  { value: 'birthday', label: 'Urodziny' },
  { value: 'absence', label: 'Nieobecność' },
  { value: 'date', label: 'Konkretna data' },
  { value: 'manual', label: 'Ręcznie' },
];

// Typy akcji (action_type)
export const ACTION_TYPES = [
  { value: 'send_email', label: 'Wyślij e-mail' },
  { value: 'send_sms', label: 'Wyślij SMS' },
  { value: 'send_push', label: 'Powiadomienie push' },
  { value: 'create_task', label: 'Utwórz zadanie' },
  { value: 'add_tag', label: 'Dodaj tag' },
  { value: 'wait', label: 'Poczekaj (opóźnienie)' },
];

// Statusy uruchomień (automation_runs.status)
export const RUN_STATUSES = [
  { value: 'pending', label: 'Oczekuje' },
  { value: 'running', label: 'W trakcie' },
  { value: 'done', label: 'Zakończone' },
  { value: 'failed', label: 'Błąd' },
];

// Pola prostej konfiguracji dla każdego typu akcji.
// type: 'text' | 'textarea'
export const ACTION_CONFIG_FIELDS = {
  send_email: [
    { key: 'subject', label: 'Temat', type: 'text', placeholder: 'np. Witamy w naszej społeczności!' },
    { key: 'body', label: 'Treść', type: 'textarea', placeholder: 'Treść wiadomości e-mail...' },
  ],
  send_sms: [
    { key: 'body', label: 'Treść SMS', type: 'textarea', placeholder: 'Treść wiadomości SMS...' },
  ],
  send_push: [
    { key: 'title', label: 'Tytuł', type: 'text', placeholder: 'Tytuł powiadomienia' },
    { key: 'body', label: 'Treść', type: 'textarea', placeholder: 'Treść powiadomienia push...' },
  ],
  create_task: [
    { key: 'title', label: 'Tytuł zadania', type: 'text', placeholder: 'np. Zadzwoń do gościa' },
    { key: 'description', label: 'Opis', type: 'textarea', placeholder: 'Szczegóły zadania (opcjonalnie)...' },
  ],
  add_tag: [
    { key: 'tag', label: 'Nazwa tagu', type: 'text', placeholder: 'np. nowy-gosc' },
  ],
  wait: [],
};

export function triggerLabel(v) {
  return (TRIGGER_TYPES.find(t => t.value === v) || {}).label || v || '—';
}
export function actionLabel(v) {
  return (ACTION_TYPES.find(a => a.value === v) || {}).label || v || '—';
}
export function statusLabel(v) {
  return (RUN_STATUSES.find(s => s.value === v) || {}).label || v || '—';
}

export function memberName(m) {
  if (!m) return '';
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Osoba';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pl-PL');
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// Krótkie podsumowanie kroku (do listy / galerii szablonów)
export function stepSummary(step) {
  const cfg = step.action_config || {};
  const label = actionLabel(step.action_type);
  let detail = '';
  switch (step.action_type) {
    case 'send_email': detail = cfg.subject || cfg.body || ''; break;
    case 'send_sms': detail = cfg.body || ''; break;
    case 'send_push': detail = cfg.title || cfg.body || ''; break;
    case 'create_task': detail = cfg.title || ''; break;
    case 'add_tag': detail = cfg.tag || ''; break;
    default: detail = '';
  }
  return detail ? `${label}: ${detail}` : label;
}

export const emptyStep = () => ({ action_type: 'send_email', delay_days: 0, action_config: {} });

// ============================================
// Gotowe szablony ścieżek (galeria „Szablony")
// step: { action_type, delay_days, action_config }
// ============================================
export const TEMPLATES = [
  {
    key: 'welcome_guest',
    name: 'Powitanie nowego gościa',
    description: 'Ścieżka asymilacji nowego gościa: powitalny e-mail, przypomnienie SMS i zadanie follow-up dla lidera.',
    trigger_type: 'new_guest',
    steps: [
      {
        action_type: 'send_email', delay_days: 0,
        action_config: {
          subject: 'Witamy!',
          body: 'Cieszymy się, że nas odwiedziłeś/aś! Jeśli masz pytania, śmiało napisz — chętnie pomożemy Ci poczuć się jak w domu.',
        },
      },
      {
        action_type: 'send_sms', delay_days: 2,
        action_config: { body: 'Dziękujemy za wizytę! Mamy nadzieję zobaczyć Cię wkrótce ponownie. Zespół Avenit.' },
      },
      {
        action_type: 'create_task', delay_days: 7,
        action_config: {
          title: 'Zadzwoń do gościa',
          description: 'Follow-up telefoniczny z nowym gościem — zapytaj o wrażenia i zaproś ponownie.',
        },
      },
    ],
  },
  {
    key: 'reactivate_absent',
    name: 'Reaktywacja nieobecnych',
    description: 'Delikatny kontakt z osobami, które dawno nie były obecne — powiadomienie, e-mail i zadanie kontaktu.',
    trigger_type: 'absence',
    steps: [
      {
        action_type: 'send_push', delay_days: 0,
        action_config: { title: 'Tęsknimy!', body: 'Dawno Cię nie widzieliśmy. Wszystko w porządku?' },
      },
      {
        action_type: 'send_email', delay_days: 3,
        action_config: {
          subject: 'Wszystko w porządku?',
          body: 'Zauważyliśmy, że dawno Cię nie było. Chcemy tylko dać znać, że o Tobie pamiętamy i czekamy z otwartymi ramionami.',
        },
      },
      {
        action_type: 'create_task', delay_days: 7,
        action_config: { title: 'Skontaktuj się z nieobecnym', description: 'Osobisty telefon lub wiadomość do osoby nieobecnej.' },
      },
    ],
  },
  {
    key: 'birthday_wishes',
    name: 'Życzenia urodzinowe',
    description: 'Automatyczne życzenia w dniu urodzin oraz oznaczenie osoby tagiem urodzinowym.',
    trigger_type: 'birthday',
    steps: [
      {
        action_type: 'send_sms', delay_days: 0,
        action_config: { body: 'Wszystkiego najlepszego z okazji urodzin! Niech ten rok będzie pełen błogosławieństwa. 🎉' },
      },
      {
        action_type: 'add_tag', delay_days: 0,
        action_config: { tag: 'urodziny' },
      },
    ],
  },
];
