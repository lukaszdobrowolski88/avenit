// Domyślna konfiguracja układu pulpitu

export const WIDGET_DEFINITIONS = {
  welcome: {
    id: 'welcome',
    name: 'Powitanie',
    description: 'Powitanie użytkownika z avatarem i statystykami',
    icon: 'Hand',
    defaultSize: 'large',
    minSize: 'medium',
  },
  ministry: {
    id: 'ministry',
    name: 'Moja Służba',
    description: 'Nadchodzące nabożeństwa i przypisane służby',
    icon: 'Calendar',
    defaultSize: 'large',
    minSize: 'medium',
  },
  tasks: {
    id: 'tasks',
    name: 'Moje Zadania',
    description: 'Lista zadań z przełącznikiem widoku',
    icon: 'CheckSquare',
    defaultSize: 'medium',
    minSize: 'small',
  },
  absences: {
    id: 'absences',
    name: 'Moje Nieobecności',
    description: 'Zgłaszanie i zarządzanie nieobecnościami',
    icon: 'CalendarX',
    defaultSize: 'medium',
    minSize: 'small',
  },
  prayers: {
    id: 'prayers',
    name: 'Moje Modlitwy',
    description: 'Twoje intencje modlitewne',
    icon: 'Heart',
    defaultSize: 'medium',
    minSize: 'small',
  },
  onlineUsers: {
    id: 'onlineUsers',
    name: 'Kto jest online',
    description: 'Aktywni użytkownicy - kliknij, aby rozpocząć rozmowę',
    icon: 'Users',
    defaultSize: 'small',
    minSize: 'small',
  },
  unreadMessages: {
    id: 'unreadMessages',
    name: 'Nieprzeczytane',
    description: 'Nieprzeczytane wiadomości z komunikatora',
    icon: 'MessageCircle',
    defaultSize: 'small',
    minSize: 'small',
  },
};

export const WIDGET_SIZES = {
  small: {
    label: 'Mały',
    colSpan: 1,
    className: 'col-span-1',
  },
  medium: {
    label: 'Średni',
    colSpan: 2,
    className: 'col-span-1 md:col-span-2',
  },
  large: {
    label: 'Duży',
    colSpan: 3,
    className: 'col-span-1 md:col-span-2 lg:col-span-3',
  },
};

export const DEFAULT_LAYOUT = [
  { widgetId: 'welcome', order: 0, size: 'large', visible: true },
  { widgetId: 'ministry', order: 1, size: 'large', visible: true },
  { widgetId: 'tasks', order: 2, size: 'medium', visible: true },
  { widgetId: 'absences', order: 3, size: 'medium', visible: true },
  { widgetId: 'prayers', order: 4, size: 'medium', visible: true },
  { widgetId: 'onlineUsers', order: 5, size: 'small', visible: true },
  { widgetId: 'unreadMessages', order: 6, size: 'small', visible: true },
];

export const LOCAL_STORAGE_KEY = 'dashboard_layout';

// Funkcja pomocnicza do walidacji i naprawy layoutu
export function validateLayout(layout) {
  if (!Array.isArray(layout)) {
    return DEFAULT_LAYOUT;
  }

  const validWidgetIds = Object.keys(WIDGET_DEFINITIONS);
  const validSizes = Object.keys(WIDGET_SIZES);

  // Filtruj i napraw nieprawidłowe wpisy
  const validatedLayout = layout
    .filter(item => validWidgetIds.includes(item.widgetId))
    .map((item, index) => ({
      widgetId: item.widgetId,
      order: typeof item.order === 'number' ? item.order : index,
      size: validSizes.includes(item.size) ? item.size : WIDGET_DEFINITIONS[item.widgetId].defaultSize,
      visible: typeof item.visible === 'boolean' ? item.visible : true,
    }));

  // Dodaj brakujące widgety
  const existingIds = validatedLayout.map(item => item.widgetId);
  const missingWidgets = validWidgetIds
    .filter(id => !existingIds.includes(id))
    .map((id, index) => ({
      widgetId: id,
      order: validatedLayout.length + index,
      size: WIDGET_DEFINITIONS[id].defaultSize,
      visible: true,
    }));

  return [...validatedLayout, ...missingWidgets].sort((a, b) => a.order - b.order);
}
